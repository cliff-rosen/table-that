"""
Retrieval Testing API endpoints

Endpoints for testing queries and filters in isolation.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from models import User
from routers.auth import get_current_user
from schemas.canonical_types import CanonicalResearchArticle
from schemas.llm import ModelConfig
from services.retrieval_testing_service import (
    RetrievalTestingService,
    get_retrieval_testing_service
)

router = APIRouter(prefix="/api/retrieval-testing", tags=["retrieval-testing"])


# ============================================================================
# Request/Response Models
# ============================================================================

class TestQueryRequest(BaseModel):
    """Request to test a query expression"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    start_date: str = Field(..., description="Start date (YYYY-MM-DD)")
    end_date: str = Field(..., description="End date (YYYY-MM-DD)")
    # Optional: test a saved query from stream config
    stream_id: Optional[int] = Field(None, description="Research stream ID (if testing saved query)")
    query_index: Optional[int] = Field(None, description="Index of saved query (0-based)")


class QueryResponse(BaseModel):
    """Response from query test"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Retrieved articles (sample)")
    count: int = Field(..., description="Number of articles returned in this response")
    total_count: int = Field(..., description="Total number of articles matching the query")
    all_matched_pmids: List[str] = Field(default_factory=list, description="All PMIDs matching the query")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata")


class TestFilterRequest(BaseModel):
    """Request to test filter criteria on articles"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to filter")
    filter_criteria: str = Field(..., description="Natural language filter criteria")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Minimum score to pass (0.0-1.0)")
    output_type: str = Field("boolean", description="Output type: 'boolean', 'number', or 'text'")
    llm_config: Optional[ModelConfig] = Field(None, description="LLM configuration")


class FilterResultItem(BaseModel):
    """Result of filtering a single article"""
    article: CanonicalResearchArticle = Field(..., description="The article")
    passed: bool = Field(..., description="Whether article passed the filter")
    score: float = Field(..., description="Relevance score (0.0-1.0)")
    reasoning: str = Field(..., description="Explanation of the score")


class FilterResponse(BaseModel):
    """Response from filter test"""
    results: List[FilterResultItem] = Field(..., description="Filter results for each article")
    count: int = Field(..., description="Total articles processed")
    passed: int = Field(..., description="Number that passed")
    failed: int = Field(..., description="Number that failed")


class FetchPmidsRequest(BaseModel):
    """Request to fetch articles by PMID list"""
    pmids: List[str] = Field(..., description="List of PubMed IDs")


class ComparePmidsRequest(BaseModel):
    """Request to compare PMID lists"""
    retrieved_pmids: List[str] = Field(..., description="PMIDs that were retrieved")
    expected_pmids: List[str] = Field(..., description="PMIDs that were expected")


class CompareResponse(BaseModel):
    """Response from PMID comparison"""
    matched: List[str] = Field(..., description="PMIDs in both lists")
    missed: List[str] = Field(..., description="Expected PMIDs not retrieved")
    extra: List[str] = Field(..., description="Retrieved PMIDs not expected")
    matched_count: int = Field(..., description="Number of matches")
    missed_count: int = Field(..., description="Number missed")
    extra_count: int = Field(..., description="Number extra")
    recall: float = Field(..., description="Recall = matched / expected")
    precision: float = Field(..., description="Precision = matched / retrieved")
    f1_score: float = Field(..., description="F1 score")


# ============================================================================
# Endpoints
# ============================================================================

@router.post("/query", response_model=QueryResponse)
async def test_query(
    request: TestQueryRequest,
    service: RetrievalTestingService = Depends(get_retrieval_testing_service),
    current_user: User = Depends(get_current_user)
):
    """
    Test a query expression against PubMed.

    Can test either:
    - A custom query expression (provide query_expression)
    - A saved query from stream config (provide stream_id and query_index)
    """
    try:
        # If stream_id and query_index provided, use run_query (tests saved query)
        if request.stream_id is not None and request.query_index is not None:
            articles, metadata, all_matched_pmids = await service.run_query(
                stream_id=request.stream_id,
                query_index=request.query_index,
                start_date=request.start_date,
                end_date=request.end_date
            )
        else:
            # Otherwise test the provided query expression
            articles, metadata, all_matched_pmids = await service.test_custom_query(
                query_expression=request.query_expression,
                start_date=request.start_date,
                end_date=request.end_date
            )

        return QueryResponse(
            articles=articles,
            count=len(articles),
            total_count=metadata.get("total_results", len(articles)),
            all_matched_pmids=all_matched_pmids,
            metadata=metadata
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error testing query: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/filter", response_model=FilterResponse)
async def test_filter(
    request: TestFilterRequest,
    service: RetrievalTestingService = Depends(get_retrieval_testing_service),
    current_user: User = Depends(get_current_user)
):
    """
    Test filter criteria on a set of articles.
    """
    try:
        results_list = await service.filter_articles(
            articles=request.articles,
            filter_criteria=request.filter_criteria,
            threshold=request.threshold,
            output_type=request.output_type,
            llm_config=request.llm_config
        )

        filter_results = [FilterResultItem(**r) for r in results_list]
        passed_count = sum(1 for r in filter_results if r.passed)

        return FilterResponse(
            results=filter_results,
            count=len(filter_results),
            passed=passed_count,
            failed=len(filter_results) - passed_count
        )
    except Exception as e:
        logger.error(f"Error testing filter: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/fetch-pmids", response_model=QueryResponse)
async def fetch_by_pmids(
    request: FetchPmidsRequest,
    service: RetrievalTestingService = Depends(get_retrieval_testing_service),
    current_user: User = Depends(get_current_user)
):
    """
    Fetch articles by PMID list.
    """
    try:
        articles, metadata, all_matched_pmids = await service.fetch_manual_pmids(pmids=request.pmids)
        return QueryResponse(
            articles=articles,
            count=len(articles),
            total_count=metadata.get("total_results", len(articles)),
            all_matched_pmids=all_matched_pmids,
            metadata=metadata
        )
    except Exception as e:
        logger.error(f"Error fetching PMIDs: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/compare", response_model=CompareResponse)
async def compare_pmids(
    request: ComparePmidsRequest,
    service: RetrievalTestingService = Depends(get_retrieval_testing_service),
    current_user: User = Depends(get_current_user)
):
    """
    Compare retrieved vs expected PMID lists.

    Returns recall, precision, and F1 score.
    """
    try:
        result = service.compare_pmid_lists(
            retrieved_pmids=request.retrieved_pmids,
            expected_pmids=request.expected_pmids
        )
        return CompareResponse(**result)
    except Exception as e:
        logger.error(f"Error comparing PMIDs: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
