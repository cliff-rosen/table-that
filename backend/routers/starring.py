"""
Starring API endpoints - Per-user article starring

Provides endpoints for users to star articles and retrieve their starred articles.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel

from models import User
from schemas.report import ReportArticle
from services.starring_service import StarringService, get_starring_service
from services.report_service import ReportService, get_report_service
from routers.auth import get_current_user

logger = logging.getLogger(__name__)


# --- Response Schemas ---

class ToggleStarResponse(BaseModel):
    """Response from toggling star status"""
    is_starred: bool


class StarredCountResponse(BaseModel):
    """Response containing count of starred articles"""
    count: int


class ReportArticlesResponse(BaseModel):
    """Response containing list of articles"""
    articles: List[ReportArticle]


router = APIRouter(prefix="/api/stars", tags=["starring"])


def _to_report_article(info) -> ReportArticle:
    """Convert ReportArticleInfo dataclass to ReportArticle schema"""
    article = info.article
    assoc = info.association
    return ReportArticle(
        article_id=article.article_id,
        title=article.title,
        authors=article.authors or [],
        journal=article.journal,
        pmid=article.pmid,
        doi=article.doi,
        abstract=article.abstract,
        url=article.url,
        pub_year=article.pub_year,
        pub_month=article.pub_month,
        pub_day=article.pub_day,
        relevance_score=assoc.relevance_score,
        relevance_rationale=assoc.relevance_rationale,
        ranking=assoc.ranking,
        is_starred=info.is_starred,
        is_read=assoc.is_read,
        notes=assoc.notes,
        presentation_categories=assoc.presentation_categories or [],
        ai_summary=assoc.ai_summary,
        ai_enrichments=assoc.ai_enrichments,
        report_id=info.report_id,
        report_name=info.report_name,
        stream_id=info.stream_id,
        stream_name=info.stream_name,
        starred_at=info.starred_at
    )


@router.post("/reports/{report_id}/articles/{article_id}/toggle", response_model=ToggleStarResponse)
async def toggle_star(
    report_id: int,
    article_id: int,
    starring_service: StarringService = Depends(get_starring_service),
    report_service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Toggle the star status of an article for the current user.

    Returns the new star status (true if starred, false if unstarred).
    """
    logger.info(f"toggle_star - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        # Verify user has access to the report
        await report_service.get_report_with_access(report_id, current_user.user_id)

        # Toggle the star
        is_starred = await starring_service.toggle_star(
            user_id=current_user.user_id,
            report_id=report_id,
            article_id=article_id
        )

        logger.info(f"toggle_star complete - is_starred={is_starred}")
        return ToggleStarResponse(is_starred=is_starred)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"toggle_star failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to toggle star: {str(e)}")


@router.get("/streams/{stream_id}", response_model=ReportArticlesResponse)
async def get_starred_for_stream(
    stream_id: int,
    starring_service: StarringService = Depends(get_starring_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get all starred articles for the current user in a specific research stream.

    Returns full article metadata including enrichments and report/stream context.
    """
    logger.info(f"get_starred_for_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        starred = await starring_service.get_starred_for_stream(
            user_id=current_user.user_id,
            stream_id=stream_id
        )

        articles = [_to_report_article(sa) for sa in starred]

        logger.info(f"get_starred_for_stream complete - count={len(articles)}")
        return ReportArticlesResponse(articles=articles)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_starred_for_stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get starred articles: {str(e)}")


@router.get("/streams/{stream_id}/count", response_model=StarredCountResponse)
async def get_starred_count_for_stream(
    stream_id: int,
    starring_service: StarringService = Depends(get_starring_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get count of starred articles for the current user in a specific research stream.
    """
    logger.info(f"get_starred_count_for_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        count = await starring_service.get_starred_count_for_stream(
            user_id=current_user.user_id,
            stream_id=stream_id
        )

        logger.info(f"get_starred_count_for_stream complete - count={count}")
        return StarredCountResponse(count=count)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_starred_count_for_stream failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get starred count: {str(e)}")


@router.get("", response_model=ReportArticlesResponse)
async def get_all_starred(
    limit: Optional[int] = None,
    starring_service: StarringService = Depends(get_starring_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get all starred articles for the current user across all streams.

    Optional limit parameter for dashboard views (e.g., limit=5 for recent starred).
    """
    logger.info(f"get_all_starred - user_id={current_user.user_id}, limit={limit}")

    try:
        starred = await starring_service.get_all_starred(
            user_id=current_user.user_id,
            limit=limit
        )

        articles = [_to_report_article(sa) for sa in starred]

        logger.info(f"get_all_starred complete - count={len(articles)}")
        return ReportArticlesResponse(articles=articles)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_all_starred failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to get starred articles: {str(e)}")
