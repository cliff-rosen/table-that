from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from pydantic import BaseModel
import logging

from schemas.canonical_types import CanonicalResearchArticle

from services.pubmed_service import search_articles_by_date_range, search_pubmed_count

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["pubmed"]
)


class PubMedSearchResponse(BaseModel):
    """Response model for PubMed search including articles and metadata"""
    articles: List[CanonicalResearchArticle]
    metadata: Dict[str, Any]


@router.get("/articles/search", response_model=PubMedSearchResponse)
async def search_articles(
    filter_term: str = Query(..., description="The search term to filter articles by."),
    start_date: str = Query(..., description="The start date for the search range (YYYY-MM-DD)."),
    end_date: str = Query(..., description="The end date for the search range (YYYY-MM-DD).")
):
    """
    Search for PubMed articles within a specified date range.

    Returns both the articles and metadata about the search (total results, offset, returned count).
    """
    try:
        articles, metadata = await search_articles_by_date_range(filter_term, start_date, end_date)
        return PubMedSearchResponse(articles=articles, metadata=metadata)
    except Exception as e:
        logger.error(f"Error in PubMed search endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


class PubMedCountResponse(BaseModel):
    """Response model for PubMed count"""
    count: int
    query: str


@router.get("/articles/count", response_model=PubMedCountResponse)
async def get_search_count(
    query: str = Query(..., description="The PubMed search query.")
):
    """
    Get the count of PubMed articles matching a search query without fetching articles.
    """
    try:
        count = await search_pubmed_count(query)
        return PubMedCountResponse(count=count, query=query)
    except Exception as e:
        logger.error(f"Error in PubMed count endpoint: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


