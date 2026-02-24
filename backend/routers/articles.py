"""
Articles API endpoints - fetches from local database and PubMed

ARTICLE TEXT ACCESS ENDPOINTS:
==============================
1. GET /{pmid} - Get article metadata + abstract from local database
2. GET /{pmid}/full-text - Get full text (checks DB first, then PMC, then returns links as fallback)
3. GET /{pmid}/full-text-links - Get publisher links (LinkOut) for accessing full text

The /full-text endpoint follows this priority:
1. Check if full_text is stored in our database (from pipeline)
2. If not, check if article has PMC ID and fetch from PubMed Central
3. If no PMC available, return publisher links as fallback
"""

import logging
from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status

from models import User
from schemas.canonical_types import CanonicalResearchArticle
from services.article_service import ArticleService, get_article_service
from services.pubmed_service import get_full_text_links, PubMedService
from routers.auth import get_current_user
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/articles", tags=["articles"])


class FullTextLink(BaseModel):
    provider: str
    url: str
    categories: List[str]
    is_free: bool


class FullTextLinksResponse(BaseModel):
    pmid: str
    links: List[FullTextLink]


class FullTextContentResponse(BaseModel):
    """Response for full text endpoint.

    Returns one of:
    - full_text: Article text (from database or PMC)
    - links: Publisher links as fallback when full text unavailable
    - error: Error message if retrieval failed
    """
    pmid: str
    pmc_id: str | None = None
    full_text: str | None = None
    source: str | None = None  # 'database', 'pmc', or None
    links: List[FullTextLink] | None = None  # Fallback when no full text
    error: str | None = None


@router.get("/{pmid}", response_model=CanonicalResearchArticle)
async def get_article_by_pmid(
    pmid: str,
    service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get an article by its PMID from the local database.
    This fetches from our stored articles, not from PubMed directly.
    """
    try:
        return await service.get_article_by_pmid(pmid)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Error fetching article {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching article: {str(e)}"
        )


@router.get("/{pmid}/full-text-links", response_model=FullTextLinksResponse)
async def get_article_full_text_links(
    pmid: str,
    current_user: User = Depends(get_current_user)
):
    """
    Get full text link options for an article from PubMed's LinkOut system.

    This fetches live data from PubMed's ELink API and returns URLs to publisher
    websites where the full text may be available. Links are categorized as:
    - is_free=True: Open access, no subscription required
    - is_free=False: May require subscription or purchase

    Use this as a fallback when the article is not in PubMed Central.
    """
    try:
        links = await get_full_text_links(pmid)
        return FullTextLinksResponse(pmid=pmid, links=links)
    except Exception as e:
        logger.error(f"Error fetching full text links for {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching full text links: {str(e)}"
        )


@router.get("/{pmid}/full-text", response_model=FullTextContentResponse)
async def get_article_full_text(
    pmid: str,
    article_service: ArticleService = Depends(get_article_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get the full text content of an article.

    Checks sources in order of priority:
    1. Database - If we have full_text stored from pipeline
    2. PubMed Central - If article has a PMC ID
    3. Publisher links - As fallback when full text unavailable

    Returns:
    - full_text + source='database': Text from our database
    - full_text + source='pmc': Text fetched from PubMed Central
    - links: Publisher URLs when no full text available
    - error: Message if all retrieval methods failed
    """
    try:
        # 1. Check database first - do we have full_text stored?
        db_article = await article_service.find_by_pmid(pmid)
        if db_article and db_article.full_text:
            logger.info(f"Returning stored full text for PMID {pmid}")
            return FullTextContentResponse(
                pmid=pmid,
                pmc_id=None,  # We don't track PMC ID in Article model currently
                full_text=db_article.full_text,
                source="database"
            )

        # 2. Check PubMed Central - fetch article to get PMC ID
        pubmed_service = PubMedService()
        articles = await pubmed_service.get_articles_from_ids([pmid])

        if not articles:
            return FullTextContentResponse(
                pmid=pmid,
                error="Article not found in PubMed"
            )

        article = articles[0]

        # If article has PMC ID, try to fetch full text from PMC
        if article.pmc_id:
            full_text = await pubmed_service.get_pmc_full_text(article.pmc_id)
            if full_text:
                logger.info(f"Returning PMC full text for PMID {pmid} (PMC {article.pmc_id})")
                return FullTextContentResponse(
                    pmid=pmid,
                    pmc_id=article.pmc_id,
                    full_text=full_text,
                    source="pmc"
                )
            else:
                logger.warning(f"PMC fetch failed for PMID {pmid} (PMC {article.pmc_id})")

        # 3. Fallback - get publisher links
        logger.info(f"No full text available for PMID {pmid}, fetching links")
        try:
            links = await get_full_text_links(pmid)
            if links:
                return FullTextContentResponse(
                    pmid=pmid,
                    pmc_id=article.pmc_id,  # Include PMC ID if we have it (even if fetch failed)
                    links=links,
                    error="Full text not available in PubMed Central. Publisher links provided."
                )
        except Exception as link_err:
            logger.warning(f"Failed to fetch links for PMID {pmid}: {link_err}")

        # No full text and no links available
        return FullTextContentResponse(
            pmid=pmid,
            pmc_id=article.pmc_id,
            error="Full text not available. Article is not in PubMed Central and no publisher links found."
        )

    except Exception as e:
        logger.error(f"Error fetching full text for {pmid}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error fetching full text: {str(e)}"
        )
