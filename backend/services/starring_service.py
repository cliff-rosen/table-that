"""
Starring Service - Per-user article starring operations

This service provides operations for users to star articles within reports.
Each user's stars are personal and not shared with other users.
"""

import logging
from typing import List, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select
from fastapi import Depends

from models import UserArticleStar, Report, Article, ResearchStream, ReportArticleAssociation
from database import get_async_db
from services.report_service import ReportArticleInfo

logger = logging.getLogger(__name__)


class StarringService:
    """
    Service for per-user article starring operations.

    Provides methods for toggling stars and retrieving starred articles.
    Note: is_starred status is baked into articles via report_service.get_report_with_articles().
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def toggle_star(
        self,
        user_id: int,
        report_id: int,
        article_id: int
    ) -> bool:
        """
        Toggle the star status of an article for a user.

        Args:
            user_id: The user's ID
            report_id: The report containing the article
            article_id: The article to star/unstar

        Returns:
            True if article is now starred, False if unstarred
        """
        # Check if already starred
        result = await self.db.execute(
            select(UserArticleStar).where(
                and_(
                    UserArticleStar.user_id == user_id,
                    UserArticleStar.report_id == report_id,
                    UserArticleStar.article_id == article_id
                )
            )
        )
        existing = result.scalars().first()

        if existing:
            # Unstar - delete the record
            await self.db.delete(existing)
            await self.db.commit()
            logger.info(f"User {user_id} unstarred article {article_id} in report {report_id}")
            return False
        else:
            # Star - create a new record
            star = UserArticleStar(
                user_id=user_id,
                report_id=report_id,
                article_id=article_id
            )
            self.db.add(star)
            await self.db.commit()
            logger.info(f"User {user_id} starred article {article_id} in report {report_id}")
            return True

    async def get_starred_for_stream(
        self,
        user_id: int,
        stream_id: int
    ) -> List[ReportArticleInfo]:
        """
        Get all starred articles for a user in a specific research stream.

        Args:
            user_id: The user's ID
            stream_id: The research stream to get starred articles for

        Returns:
            List of ReportArticleInfo objects with full metadata and context
        """
        result = await self.db.execute(
            select(UserArticleStar, Article, Report, ResearchStream, ReportArticleAssociation)
            .join(Article, UserArticleStar.article_id == Article.article_id)
            .join(Report, UserArticleStar.report_id == Report.report_id)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .join(
                ReportArticleAssociation,
                and_(
                    ReportArticleAssociation.report_id == UserArticleStar.report_id,
                    ReportArticleAssociation.article_id == UserArticleStar.article_id
                )
            )
            .where(
                and_(
                    UserArticleStar.user_id == user_id,
                    ResearchStream.stream_id == stream_id
                )
            )
            .order_by(UserArticleStar.starred_at.desc())
        )

        starred_articles = []
        for row in result.all():
            star, article, report, stream, assoc = row
            starred_articles.append(ReportArticleInfo(
                article=article,
                association=assoc,
                is_starred=True,
                report_id=report.report_id,
                report_name=report.report_name,
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                starred_at=star.starred_at
            ))

        return starred_articles

    async def get_all_starred(
        self,
        user_id: int,
        limit: Optional[int] = None
    ) -> List[ReportArticleInfo]:
        """
        Get all starred articles for a user across all streams.

        Args:
            user_id: The user's ID
            limit: Optional limit on number of results (for dashboard)

        Returns:
            List of ReportArticleInfo objects with full metadata and context
        """
        query = (
            select(UserArticleStar, Article, Report, ResearchStream, ReportArticleAssociation)
            .join(Article, UserArticleStar.article_id == Article.article_id)
            .join(Report, UserArticleStar.report_id == Report.report_id)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .join(
                ReportArticleAssociation,
                and_(
                    ReportArticleAssociation.report_id == UserArticleStar.report_id,
                    ReportArticleAssociation.article_id == UserArticleStar.article_id
                )
            )
            .where(UserArticleStar.user_id == user_id)
            .order_by(UserArticleStar.starred_at.desc())
        )

        if limit:
            query = query.limit(limit)

        result = await self.db.execute(query)

        starred_articles = []
        for row in result.all():
            star, article, report, stream, assoc = row
            starred_articles.append(ReportArticleInfo(
                article=article,
                association=assoc,
                is_starred=True,
                report_id=report.report_id,
                report_name=report.report_name,
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                starred_at=star.starred_at
            ))

        return starred_articles

    async def get_starred_count_for_stream(
        self,
        user_id: int,
        stream_id: int
    ) -> int:
        """Get the count of starred articles for a user in a specific stream."""
        from sqlalchemy import func

        result = await self.db.execute(
            select(func.count(UserArticleStar.id))
            .join(Report, UserArticleStar.report_id == Report.report_id)
            .where(
                and_(
                    UserArticleStar.user_id == user_id,
                    Report.research_stream_id == stream_id
                )
            )
        )
        return result.scalar() or 0


# Dependency injection provider
async def get_starring_service(
    db: AsyncSession = Depends(get_async_db)
) -> StarringService:
    """Get a StarringService instance with async database session."""
    return StarringService(db)
