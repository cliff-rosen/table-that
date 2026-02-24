"""
ReportArticleAssociation Service - Atomic operations for report-article associations

This service provides atomic operations for the ReportArticleAssociation table.
All association operations should go through this service.
"""

import logging
from typing import Any, Dict, List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select, func
from sqlalchemy.orm import selectinload
from fastapi import Depends

from models import ReportArticleAssociation
from database import get_async_db

logger = logging.getLogger(__name__)


class ReportArticleAssociationService:
    """
    Service for ReportArticleAssociation operations.

    Provides atomic, reusable methods for managing report-article associations.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # Getters (async, DB reads)
    # - find_* returns Optional (None if not found)
    # - get_* raises ValueError if not found
    # =========================================================================

    async def find(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """Find an association by report and article ID (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.article_id == article_id
                )
            )
        )
        return result.scalars().first()

    async def get(self, report_id: int, article_id: int) -> ReportArticleAssociation:
        """Get an association, raises ValueError if not found."""
        association = await self.find(report_id, article_id)
        if not association:
            raise ValueError(f"Article {article_id} not found in report {report_id}")
        return association

    async def get_visible_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get all visible associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.is_hidden == False
                )
            ).order_by(ReportArticleAssociation.ranking)
        )
        return list(result.scalars().all())

    async def get_all_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Get all associations for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation)
            .options(
                selectinload(ReportArticleAssociation.article),
                selectinload(ReportArticleAssociation.wip_article)
            )
            .where(
                ReportArticleAssociation.report_id == report_id
            ).order_by(ReportArticleAssociation.ranking)
        )
        return list(result.scalars().all())

    async def count_visible(self, report_id: int) -> int:
        """Count visible articles in a report (async)."""
        result = await self.db.execute(
            select(func.count(ReportArticleAssociation.article_id)).where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.is_hidden == False
                )
            )
        )
        return result.scalar() or 0

    async def count_all(self, report_id: int) -> int:
        """Count all associations for a report (async)."""
        result = await self.db.execute(
            select(func.count(ReportArticleAssociation.article_id)).where(
                ReportArticleAssociation.report_id == report_id
            )
        )
        return result.scalar() or 0

    async def get_next_ranking(self, report_id: int) -> int:
        """Get the next available ranking for a report (async)."""
        result = await self.db.execute(
            select(ReportArticleAssociation.ranking).where(
                ReportArticleAssociation.report_id == report_id
            ).order_by(ReportArticleAssociation.ranking.desc()).limit(1)
        )
        max_ranking = result.scalar()
        return (max_ranking + 1) if max_ranking else 1

    async def find_historical_duplicates(
        self,
        stream_id: int,
        execution_id: str
    ) -> List[Tuple[int, str]]:
        """
        Find WipArticles that match articles already visible in previous reports for this stream.

        Uses a single SQL join to efficiently find duplicates in the database.

        Args:
            stream_id: The research stream ID
            execution_id: Current execution ID (WipArticles to check)

        Returns:
            List of (wip_article_id, matched_identifier) tuples for duplicates found
        """
        from models import Report, Article, WipArticle
        from sqlalchemy import or_

        # Single query: join WipArticle with historical visible articles by PMID or DOI
        query = (
            select(WipArticle.id, Article.pmid, Article.doi)
            .select_from(WipArticle)
            .join(
                Article,
                or_(
                    and_(WipArticle.pmid != None, WipArticle.pmid == Article.pmid),
                    and_(WipArticle.doi != None, func.lower(WipArticle.doi) == func.lower(Article.doi))
                )
            )
            .join(ReportArticleAssociation, Article.article_id == ReportArticleAssociation.article_id)
            .join(Report, ReportArticleAssociation.report_id == Report.report_id)
            .where(
                and_(
                    WipArticle.pipeline_execution_id == execution_id,
                    WipArticle.is_duplicate == False,
                    Report.research_stream_id == stream_id,
                    Report.pipeline_execution_id != execution_id,
                    ReportArticleAssociation.is_hidden == False
                )
            )
            .distinct()
        )

        result = await self.db.execute(query)
        rows = result.all()

        # Return (wip_id, identifier) tuples
        duplicates = []
        for row in rows:
            identifier = row.pmid if row.pmid else row.doi
            duplicates.append((row.id, f"historical:{identifier}"))

        return duplicates

    # =========================================================================
    # Setters (in-memory, no DB I/O - caller must commit)
    # =========================================================================

    def set_hidden(
        self,
        association: ReportArticleAssociation,
        hidden: bool
    ) -> None:
        """
        Set the is_hidden flag on an association.

        Note: Curation audit trail (who/when/why) is stored on WipArticle, not here.

        Args:
            association: The association to update
            hidden: True to hide, False to restore
        """
        association.is_hidden = hidden

    # =========================================================================
    # Writers (async, stages DB writes - caller must commit)
    # =========================================================================

    async def create(
        self,
        report_id: int,
        article_id: int,
        ranking: int,
        presentation_categories: Optional[List[str]] = None,
        ai_summary: Optional[str] = None,
        relevance_score: Optional[float] = None,
        relevance_rationale: Optional[str] = None,
        curator_added: bool = False,
        wip_article_id: Optional[int] = None
    ) -> ReportArticleAssociation:
        """Create a new association (async). Does not commit."""
        categories = presentation_categories or []

        association = ReportArticleAssociation(
            report_id=report_id,
            article_id=article_id,
            wip_article_id=wip_article_id,
            ranking=ranking,
            presentation_categories=categories,
            original_presentation_categories=categories if not curator_added else [],
            original_ranking=ranking if not curator_added else None,
            ai_summary=ai_summary,
            original_ai_summary=ai_summary if not curator_added else None,
            relevance_score=relevance_score,
            relevance_rationale=relevance_rationale,
            curator_added=curator_added,
            is_hidden=False,
            is_starred=False,
            is_read=False
        )
        self.db.add(association)
        return association

    async def bulk_create(
        self,
        report_id: int,
        items: List[Dict[str, Any]]
    ) -> List[ReportArticleAssociation]:
        """
        Bulk create associations for a report.

        Args:
            report_id: The report ID
            items: List of dicts with keys:
                - article_id (required)
                - wip_article_id (optional)
                - ranking (required)
                - relevance_score (optional)
                - relevance_rationale (optional)

        Returns:
            List of created associations. Does not commit.
        """
        associations = []
        for item in items:
            association = ReportArticleAssociation(
                report_id=report_id,
                article_id=item["article_id"],
                wip_article_id=item.get("wip_article_id"),
                ranking=item["ranking"],
                relevance_score=item.get("relevance_score"),
                relevance_rationale=item.get("relevance_rationale"),
                presentation_categories=[],
                original_presentation_categories=[],
                original_ranking=item["ranking"],
                is_hidden=False,
                is_starred=False,
                is_read=False,
                curator_added=False
            )
            self.db.add(association)
            associations.append(association)
        return associations

    async def delete(self, association: ReportArticleAssociation) -> None:
        """Delete an association (async). Does not commit."""
        await self.db.delete(association)

    async def delete_all_for_report(self, report_id: int) -> int:
        """Delete all associations for a report (async). Does not commit."""
        from sqlalchemy import delete as sql_delete
        result = await self.db.execute(
            sql_delete(ReportArticleAssociation).where(
                ReportArticleAssociation.report_id == report_id
            )
        )
        return result.rowcount

    # =========================================================================
    # Mutators (async, DB writes + commit)
    # =========================================================================

    async def update_enrichments(
        self,
        report_id: int,
        article_id: int,
        ai_enrichments: Dict[str, Any]
    ) -> Optional[ReportArticleAssociation]:
        """
        Update AI enrichments on an association and commit.

        Args:
            report_id: The report ID
            article_id: The article ID
            ai_enrichments: The enrichments dict to set

        Returns:
            Updated association, or None if not found
        """
        result = await self.db.execute(
            select(ReportArticleAssociation).where(
                and_(
                    ReportArticleAssociation.report_id == report_id,
                    ReportArticleAssociation.article_id == article_id
                )
            )
        )
        assoc = result.scalars().first()
        if not assoc:
            return None

        assoc.ai_enrichments = ai_enrichments
        await self.db.commit()
        return assoc

    async def bulk_update_categories_from_pipeline(
        self,
        categorization_results: List[Tuple[ReportArticleAssociation, Optional[str]]]
    ) -> int:
        """Bulk update presentation categories from pipeline and commit.

        Sets both presentation_categories and original_presentation_categories.

        Returns:
            Number of associations categorized
        """
        categorized_count = 0
        for association, category_id in categorization_results:
            if category_id:
                categories = [category_id]
                association.presentation_categories = categories
                association.original_presentation_categories = categories
                categorized_count += 1
        await self.db.commit()
        return categorized_count

    async def bulk_update_ai_summaries_from_pipeline(
        self,
        summary_results: List[Tuple[ReportArticleAssociation, str]]
    ) -> int:
        """Bulk update AI summaries from pipeline and commit.

        Sets both ai_summary and original_ai_summary.

        Returns:
            Number of associations with summaries set
        """
        summary_count = 0
        for association, summary in summary_results:
            if summary:
                association.ai_summary = summary
                association.original_ai_summary = summary
                summary_count += 1
        await self.db.commit()
        return summary_count

    async def bulk_update_stance_analysis_from_pipeline(
        self,
        stance_results: List[Tuple[ReportArticleAssociation, Dict[str, Any]]]
    ) -> int:
        """Bulk update stance analysis results from pipeline and commit.

        Stores stance analysis in ai_enrichments.stance_analysis.

        Args:
            stance_results: List of (association, stance_data) tuples where stance_data
                           contains: stance, confidence, analysis, key_factors, relevant_quotes

        Returns:
            Number of associations with stance analysis set
        """
        stance_count = 0
        for association, stance_data in stance_results:
            if stance_data:
                # Initialize ai_enrichments if None
                if association.ai_enrichments is None:
                    association.ai_enrichments = {}
                # Store stance analysis in enrichments
                association.ai_enrichments = {
                    **association.ai_enrichments,
                    "stance_analysis": stance_data
                }
                stance_count += 1
        await self.db.commit()
        return stance_count


# Dependency injection provider for async association service
async def get_association_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportArticleAssociationService:
    """Get a ReportArticleAssociationService instance with async database session."""
    return ReportArticleAssociationService(db)
