"""
Tools API endpoints - Standalone utilities for testing and analysis

Only contains endpoints used by the Tools page in the main navigation.
Tablizer-specific endpoints (search, filter, extract) are in the tablizer router.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime, timedelta

from models import User
from routers.auth import get_current_user
from schemas.canonical_types import CanonicalResearchArticle

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tools", tags=["tools"])


# ============================================================================
# PubMed Query Tester (Tools Page)
# ============================================================================

class PubMedQueryTestRequest(BaseModel):
    """Request to test a PubMed query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    max_results: int = Field(100, ge=1, le=1000, description="Maximum articles to return")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('entry', description="Date type for filtering (entry, publication, etc.)")
    sort_by: Optional[str] = Field('relevance', description="Sort order (relevance, date)")


class PubMedQueryTestResponse(BaseModel):
    """Response from PubMed query test"""
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles returned")
    total_results: int = Field(..., description="Total number of results matching the query")
    returned_count: int = Field(..., description="Number of articles returned in this response")


class PubMedIdCheckRequest(BaseModel):
    """Request to check which PubMed IDs are captured by a query"""
    query_expression: str = Field(..., description="PubMed query expression to test")
    pubmed_ids: List[str] = Field(..., description="List of PubMed IDs to check")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[str] = Field('publication', description="Date type for filtering (publication=DP [default/matches pipeline], entry=EDAT, pubmed=PDAT, completion=DCOM)")


class PubMedIdCheckResult(BaseModel):
    """Result for a single PubMed ID check"""
    pubmed_id: str
    captured: bool  # Whether this ID was in the query results
    article: Optional[CanonicalResearchArticle] = None  # Article data if found


class PubMedIdCheckResponse(BaseModel):
    """Response from PubMed ID check"""
    total_ids: int = Field(..., description="Total number of IDs checked")
    captured_count: int = Field(..., description="Number of IDs captured by query")
    missed_count: int = Field(..., description="Number of IDs missed by query")
    results: List[PubMedIdCheckResult] = Field(..., description="Results for each ID")
    query_total_results: int = Field(..., description="Total results from query")


@router.post("/pubmed/test-query", response_model=PubMedQueryTestResponse)
async def test_pubmed_query(
    request: PubMedQueryTestRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Test a PubMed query and return results.

    Standalone tool for testing PubMed queries without requiring a research stream.
    """
    from services.pubmed_service import PubMedService

    try:
        # Use dates as provided (None means no date filtering)
        start_date = request.start_date
        end_date = request.end_date

        # Execute query
        pubmed_service = PubMedService()
        articles, metadata = await pubmed_service.search_articles(
            query=request.query_expression,
            max_results=request.max_results,
            offset=0,
            start_date=start_date,
            end_date=end_date,
            date_type=request.date_type,
            sort_by=request.sort_by
        )

        return PubMedQueryTestResponse(
            articles=articles,
            total_results=metadata.get("total_results", len(articles)),
            returned_count=len(articles)
        )

    except Exception as e:
        logger.error(f"PubMed query test failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed query test failed: {str(e)}"
        )


@router.post("/pubmed/check-ids", response_model=PubMedIdCheckResponse)
async def check_pubmed_ids(
    request: PubMedIdCheckRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Check which PubMed IDs from a list are captured by a query.

    This tool checks each PMID directly by adding it as a constraint to the query,
    ensuring accurate results even when the query returns thousands of results.
    """
    from services.pubmed_service import PubMedService
    from schemas.research_article_converters import pubmed_article_to_research

    try:
        # Apply default date range if not provided
        start_date = request.start_date
        end_date = request.end_date

        if not start_date or not end_date:
            end_date_obj = datetime.now()
            start_date_obj = end_date_obj - timedelta(days=365)  # 1 year for ID checking
            start_date = start_date_obj.strftime("%Y/%m/%d")
            end_date = end_date_obj.strftime("%Y/%m/%d")

        pubmed_service = PubMedService()

        # First, get the total count for the base query (for display purposes)
        logger.info(f"Getting total count for query with date_type={request.date_type}: {request.query_expression}")
        _, total_count = await pubmed_service.get_article_ids(
            query=request.query_expression,
            max_results=1,  # Just need the count
            sort_by='relevance',
            start_date=start_date,
            end_date=end_date,
            date_type=request.date_type
        )
        logger.info(f"Query has {total_count} total results")

        # Clean user PMIDs
        user_pmids_clean = [pmid.strip() for pmid in request.pubmed_ids if pmid.strip()]

        # Check each PMID by adding it as a constraint to the query
        # This is more accurate than fetching top N results and checking membership
        captured_pmids = []

        # Process in batches of 50 PMIDs to reduce API calls
        BATCH_SIZE = 50
        for i in range(0, len(user_pmids_clean), BATCH_SIZE):
            batch = user_pmids_clean[i:i + BATCH_SIZE]

            # Build a query that checks if any of these PMIDs match the original query
            # Format: (original_query) AND (pmid1[uid] OR pmid2[uid] OR ...)
            pmid_clause = " OR ".join([f"{pmid}[uid]" for pmid in batch])
            combined_query = f"({request.query_expression}) AND ({pmid_clause})"

            try:
                # Get IDs that match both the query AND are in our batch
                matched_ids, _ = await pubmed_service.get_article_ids(
                    query=combined_query,
                    max_results=len(batch),
                    sort_by='relevance',
                    start_date=start_date,
                    end_date=end_date,
                    date_type=request.date_type
                )
                captured_pmids.extend(matched_ids)
                logger.info(f"Batch {i//BATCH_SIZE + 1}: {len(matched_ids)}/{len(batch)} PMIDs captured")
            except Exception as e:
                logger.warning(f"Error checking batch {i//BATCH_SIZE + 1}: {e}")
                # Continue with other batches

        captured_pmids_set = set(captured_pmids)
        logger.info(f"User provided {len(user_pmids_clean)} IDs, {len(captured_pmids_set)} were captured")

        # Fetch full article metadata for all user-provided IDs (for display)
        article_lookup = {}
        if user_pmids_clean:
            logger.info(f"Fetching full article data for {len(user_pmids_clean)} IDs")
            articles = await pubmed_service.get_articles_from_ids(user_pmids_clean)

            # Convert to canonical format and build lookup
            for article in articles:
                try:
                    research_article = pubmed_article_to_research(article)
                    article_lookup[article.PMID] = research_article
                except Exception as e:
                    logger.error(f"Error converting article {article.PMID}: {e}")

        # Build results for each user-provided ID
        results = []
        for pmid_clean in user_pmids_clean:
            is_captured = pmid_clean in captured_pmids_set

            result = PubMedIdCheckResult(
                pubmed_id=pmid_clean,
                captured=is_captured,
                article=article_lookup.get(pmid_clean)  # Show article data for all IDs
            )
            results.append(result)

        captured_count = sum(1 for r in results if r.captured)

        return PubMedIdCheckResponse(
            total_ids=len(request.pubmed_ids),
            captured_count=captured_count,
            missed_count=len(request.pubmed_ids) - captured_count,
            results=results,
            query_total_results=total_count
        )

    except Exception as e:
        logger.error(f"PubMed ID check failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed ID check failed: {str(e)}"
        )
