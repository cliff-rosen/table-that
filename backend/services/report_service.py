"""
Report Service for Knowledge Horizon

This service is the ONLY place that should write to the Report and
ReportArticleAssociation tables. All other services should use this
service for report-related operations.
"""

import logging
import time
from dataclasses import dataclass, field, asdict
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, func, select
from sqlalchemy.orm import joinedload, selectinload
from typing import List, Optional, Dict, Any, Set, Tuple
from datetime import date, datetime, timezone
from fastapi import HTTPException, status

from fastapi import Depends
from models import (
    Report, ReportArticleAssociation, Article, WipArticle,
    ResearchStream, User, UserRole, StreamScope,
    OrgStreamSubscription, UserStreamSubscription, PipelineExecution,
    ApprovalStatus, UserArticleStar
)
from config.settings import settings
from database import get_async_db
from services.user_service import UserService
from services.email_template_service import (
    EmailTemplateService, EmailReportData, EmailCategory, EmailArticle
)

logger = logging.getLogger(__name__)


# =============================================================================
# Service Dataclasses (for computed/aggregated data with no Model equivalent)
# =============================================================================

@dataclass
class WipArticleAnalytics:
    """WipArticle data for pipeline analytics."""
    id: int
    title: str
    retrieval_group_id: str
    is_duplicate: bool
    duplicate_of_id: Optional[int]
    passed_semantic_filter: Optional[bool]
    filter_score: Optional[float]
    filter_score_reason: Optional[str]
    included_in_report: bool
    presentation_categories: List[str]
    authors: List[str]
    journal: Optional[str]
    pub_year: Optional[int]
    pub_month: Optional[int]
    pub_day: Optional[int]
    pmid: Optional[str]
    doi: Optional[str]
    abstract: Optional[str]


@dataclass
class GroupAnalytics:
    """Analytics for a single retrieval group."""
    group_id: str
    total: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included: int


@dataclass
class PipelineAnalyticsSummary:
    """Summary counts for pipeline analytics."""
    total_retrieved: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included_in_report: int
    # Curation stats
    curator_added: int = 0  # Articles manually added by curator
    curator_removed: int = 0  # Articles manually removed by curator


@dataclass
class PipelineAnalytics:
    """Complete pipeline analytics for a report."""
    report_id: int
    run_type: Optional[str]
    report_date: str
    pipeline_metrics: Optional[Dict[str, Any]]
    summary: PipelineAnalyticsSummary
    by_group: List[GroupAnalytics]
    filter_reasons: Dict[str, int]
    category_counts: Dict[str, int]
    wip_articles: List[WipArticleAnalytics]


# --- Service Result Dataclasses ---

@dataclass
class ReportWithArticleCount:
    """Report model with computed article count and coverage dates."""
    report: Report  # SQLAlchemy model
    article_count: int
    coverage_start_date: Optional[str] = None  # From PipelineExecution
    coverage_end_date: Optional[str] = None  # From PipelineExecution


@dataclass
class ReportArticleInfo:
    """Article with association metadata."""
    article: Article
    association: ReportArticleAssociation
    is_starred: bool = False  # Per-user starred status
    # Context fields - populated when viewing starred articles across reports
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    stream_id: Optional[int] = None
    stream_name: Optional[str] = None
    starred_at: Optional[datetime] = None


@dataclass
class ReportWithArticlesData:
    """Report with full article details."""
    report: Report
    articles: List[ReportArticleInfo]
    article_count: int
    retrieval_params: Optional[Dict[str, Any]] = None
    category_map: Optional[Dict[str, str]] = None  # category_id -> display_name


@dataclass
class ArticleSearchResult:
    """Search result for an article in a report."""
    article: Article
    association: ReportArticleAssociation
    report: Report


@dataclass
class CurationStats:
    """Pipeline and curation statistics."""
    pipeline_included: int
    pipeline_filtered: int
    pipeline_duplicates: int
    current_included: int
    curator_added: int
    curator_removed: int


@dataclass
class IncludedArticleData:
    """Article data for curation view."""
    article: Article
    association: ReportArticleAssociation
    wip_article_id: Optional[int] = None  # For reset curation on curator-added articles
    filter_score: Optional[float] = None  # From WipArticle
    curation_notes: Optional[str] = None  # From WipArticle (single source of truth)
    filter_score_reason: Optional[str] = None  # From WipArticle
    curated_by: Optional[int] = None  # From WipArticle (audit trail)
    curated_at: Optional[datetime] = None  # From WipArticle (audit trail)


@dataclass
class CurationViewData:
    """Full curation view data."""
    report: Report
    stream: ResearchStream
    included_articles: List[IncludedArticleData]
    filtered_articles: List[WipArticle]
    curated_articles: List[WipArticle]
    categories: List[Dict[str, Any]]
    stats: CurationStats
    execution: Optional[PipelineExecution] = None  # For retrieval config access


@dataclass
class ReportConfigData:
    """Lightweight config data for settings modal."""
    retrieval_config: Optional[Dict[str, Any]] = None
    enrichment_config: Optional[Dict[str, Any]] = None
    llm_config: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    stream_name: Optional[str] = None


@dataclass
class ReportContentUpdateResult:
    """Result of updating report content."""
    report_name: str
    executive_summary: str
    category_summaries: Dict[str, str]
    has_curation_edits: bool


@dataclass
class ExcludeArticleResult:
    """Result of excluding an article."""
    article_id: int
    excluded: bool
    wip_article_updated: bool
    was_curator_added: bool = False  # True if this undid a curator add (deleted association)


@dataclass
class IncludeArticleResult:
    """Result of including an article."""
    article_id: int
    wip_article_id: int
    included: bool
    ranking: int
    category: Optional[str]


@dataclass
class ResetCurationResult:
    """Result of resetting curation."""
    wip_article_id: int
    reset: bool
    was_curator_included: Optional[bool] = None
    was_curator_excluded: Optional[bool] = None
    pipeline_decision: Optional[bool] = None
    now_in_report: Optional[bool] = None
    message: Optional[str] = None


@dataclass
class UpdateArticleResult:
    """Result of updating article in report."""
    article_id: int
    ranking: Optional[int]
    presentation_categories: List[str]
    ai_summary: Optional[str]
    # Note: curation_notes are on WipArticle, not here


@dataclass
class ApproveReportResult:
    """Result of approving a report."""
    report_id: int
    approval_status: str
    approved_by: int
    approved_at: str
    emails_queued: int = 0


@dataclass
class RejectReportResult:
    """Result of rejecting a report."""
    report_id: int
    approval_status: str
    rejection_reason: str
    rejected_by: int
    rejected_at: str


@dataclass
class CurationEventData:
    """A single curation event for history view."""
    id: int
    event_type: str
    field_name: Optional[str]
    old_value: Optional[str]
    new_value: Optional[str]
    notes: Optional[str]
    article_id: Optional[int]
    article_title: Optional[str]
    curator_name: str
    created_at: str


@dataclass
class CurationHistoryData:
    """Curation history for a report."""
    events: List[CurationEventData]
    total_count: int


@dataclass
class RegenerateSummariesResult:
    """Result of regenerating summaries with a custom prompt."""
    updated_count: int
    message: str
    prompt_type: str


@dataclass
class SuppliedArticleStatusData:
    """Status of a supplied PubMed ID in the pipeline."""
    pmid: str
    status: str  # not_found, filtered_out, included, not_included
    article_title: Optional[str] = None
    retrieval_unit_id: Optional[str] = None
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None


@dataclass
class ReportOnlyArticleData:
    """Article that was in the report but not in supplied PMIDs."""
    pmid: str
    title: str
    retrieval_unit_id: str
    url: Optional[str] = None


@dataclass
class CompareReportResultData:
    """Result of comparing a report to supplied PubMed IDs."""
    supplied_articles: List[SuppliedArticleStatusData]
    report_only_articles: List[ReportOnlyArticleData]


@dataclass
class ArticleSummaryPreviewItem:
    """Preview of an article summary regeneration."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str]
    current_summary: Optional[str]
    new_summary: Optional[str]
    error: Optional[str] = None


@dataclass
class ArticleSummaryPreviewResult:
    """Result of previewing article summary regeneration."""
    report_id: int
    total_articles: int
    previews: List[ArticleSummaryPreviewItem]


@dataclass
class BatchSummaryUpdateResult:
    """Result of batch updating article summaries."""
    report_id: int
    updated_count: int
    message: str
    statistics: Dict[str, int]


@dataclass
class CurrentArticleSummaryItem:
    """Current article summary info for display."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str]
    journal: Optional[str]
    pub_year: Optional[int]
    current_summary: Optional[str]


@dataclass
class CurrentArticleSummariesResult:
    """Result of fetching current article summaries."""
    report_id: int
    report_name: str
    total_articles: int
    articles: List[CurrentArticleSummaryItem]


@dataclass
class ExecutiveSummaryPreviewResult:
    """Result of previewing executive summary regeneration."""
    report_id: int
    report_name: str
    current_summary: Optional[str]
    new_summary: Optional[str]
    error: Optional[str] = None


@dataclass
class CategorySummaryPreviewItem:
    """Preview of a single category summary regeneration."""
    category_id: str
    category_name: str
    current_summary: Optional[str]
    new_summary: Optional[str]
    error: Optional[str] = None


@dataclass
class CategorySummariesPreviewResult:
    """Result of previewing category summaries regeneration."""
    report_id: int
    report_name: str
    total_categories: int
    previews: List[CategorySummaryPreviewItem]


@dataclass
class CurrentCategorySummaryItem:
    """Current category summary info for display."""
    category_id: str
    category_name: str
    current_summary: Optional[str]


@dataclass
class CurrentCategorySummariesResult:
    """Result of fetching current category summaries."""
    report_id: int
    report_name: str
    total_categories: int
    categories: List[CurrentCategorySummaryItem]


@dataclass
class CurrentExecutiveSummaryResult:
    """Result of fetching current executive summary."""
    report_id: int
    report_name: str
    current_summary: Optional[str]


@dataclass
class EmailResult:
    """Result of email operations - includes report_name to avoid extra queries."""
    html: Optional[str]
    report_name: str
    subject: Optional[str] = None
    from_name: str = "Knowledge Horizon"
    images: Optional[Dict[str, bytes]] = None  # CID -> image bytes for embedded images


@dataclass
class CurrentStanceAnalysisItem:
    """Current stance analysis info for display."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str]
    journal: Optional[str]
    pub_year: Optional[int]
    current_stance: Optional[Dict[str, Any]]


@dataclass
class CurrentStanceAnalysisResult:
    """Result of fetching current stance analysis."""
    report_id: int
    report_name: str
    total_articles: int
    articles: List[CurrentStanceAnalysisItem]


@dataclass
class StanceAnalysisPreviewItem:
    """Preview of a single article's stance analysis."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str]
    current_stance: Optional[Dict[str, Any]]
    new_stance: Optional[Dict[str, Any]]
    error: Optional[str] = None


@dataclass
class StanceAnalysisPreviewResult:
    """Result of previewing stance analysis regeneration."""
    report_id: int
    total_articles: int
    previews: List[StanceAnalysisPreviewItem]


@dataclass
class BatchStanceUpdateResult:
    """Result of batch updating stance analysis."""
    report_id: int
    updated_count: int
    message: str
    statistics: Dict[str, int]


class ReportService:
    """
    Service for all Report and ReportArticleAssociation operations.

    This is the single source of truth for Report table access.
    Only this service should write to the Report and ReportArticleAssociation tables.

    Uses AsyncSession for all database operations.
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._user_service: Optional[UserService] = None
        self._stream_service = None  # Lazy-loaded to avoid circular import
        self._wip_article_service = None  # Lazy-loaded
        self._association_service = None  # Lazy-loaded
        self._article_service = None  # Lazy-loaded
        self._email_queue_service = None  # Lazy-loaded

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    @property
    def stream_service(self):
        """Lazy-load ResearchStreamService."""
        if self._stream_service is None:
            from services.research_stream_service import ResearchStreamService
            self._stream_service = ResearchStreamService(self.db)
        return self._stream_service

    @property
    def wip_article_service(self):
        """Lazy-load WipArticleService."""
        if self._wip_article_service is None:
            from services.wip_article_service import WipArticleService
            self._wip_article_service = WipArticleService(self.db)
        return self._wip_article_service

    @property
    def association_service(self):
        """Lazy-load ReportArticleAssociationService."""
        if self._association_service is None:
            from services.report_article_association_service import ReportArticleAssociationService
            self._association_service = ReportArticleAssociationService(self.db)
        return self._association_service

    @property
    def article_service(self):
        """Lazy-load ArticleService."""
        if self._article_service is None:
            from services.article_service import ArticleService
            self._article_service = ArticleService(self.db)
        return self._article_service

    @property
    def email_queue_service(self):
        """Lazy-load ReportEmailQueueService."""
        if self._email_queue_service is None:
            from services.report_email_queue_service import ReportEmailQueueService
            self._email_queue_service = ReportEmailQueueService(self.db)
        return self._email_queue_service

    # =========================================================================
    # UTILITIES
    # =========================================================================

    @staticmethod
    def build_category_map(stream) -> Dict[str, str]:
        """Build mapping from category ID to display name.

        Args:
            stream: ResearchStream with presentation_config

        Returns:
            Dict mapping category IDs to display names.
            Falls back to ID if name not found.
        """
        if not stream or not stream.presentation_config:
            return {}

        config = stream.presentation_config
        if isinstance(config, dict):
            categories = config.get('categories', [])
        else:
            return {}

        return {
            cat.get('id', ''): cat.get('name', cat.get('id', ''))
            for cat in categories
            if isinstance(cat, dict)
        }

    def update_enrichment(
        self,
        report: "Report",
        key: str,
        value: Any,
        set_original: bool = False
    ) -> None:
        """
        Update a single enrichment key on a report.

        Handles the SQLAlchemy JSON column update pattern with flag_modified.
        Does not commit - caller manages the transaction.

        Args:
            report: The Report to update
            key: Enrichment key (e.g., "category_summaries", "executive_summary")
            value: Value to set
            set_original: If True, also copy enrichments to original_enrichments
        """
        from sqlalchemy.orm.attributes import flag_modified

        enrichments = report.enrichments or {}
        enrichments[key] = value
        report.enrichments = enrichments
        flag_modified(report, "enrichments")

        if set_original:
            report.original_enrichments = report.enrichments.copy()
            flag_modified(report, "original_enrichments")

    # =========================================================================
    # ASYNC CREATE Operations
    # =========================================================================

    async def create_report(
        self,
        user_id: int,
        research_stream_id: int,
        report_date: date,
        title: str,
        pipeline_execution_id: Optional[str] = None,
        executive_summary: Optional[str] = None,
        enrichments: Optional[Dict[str, Any]] = None
    ) -> Report:
        """
        Create a new report (async).

        Args:
            user_id: Owner user ID
            research_stream_id: Associated research stream ID
            report_date: Date of the report
            title: Report title
            pipeline_execution_id: Optional pipeline execution ID
            executive_summary: Optional executive summary
            enrichments: Optional enrichments dict (category summaries, etc.)

        Returns:
            Created Report instance
        """
        # Build enrichments with executive_summary included
        final_enrichments = enrichments or {}
        if executive_summary:
            final_enrichments["executive_summary"] = executive_summary

        report = Report(
            user_id=user_id,
            research_stream_id=research_stream_id,
            report_date=report_date,
            report_name=title,
            pipeline_execution_id=pipeline_execution_id,
            enrichments=final_enrichments,
            created_at=datetime.now(timezone.utc),
            approval_status=ApprovalStatus.AWAITING_APPROVAL
        )
        self.db.add(report)
        await self.db.flush()  # Get the report_id

        return report

    # =========================================================================
    # ACCESS & READ
    # =========================================================================

    async def get_accessible_stream_ids(self, user: User) -> Set[int]:
        """Get all stream IDs the user can access reports for (async)."""
        accessible_ids = set()

        # Personal streams created by user
        result = await self.db.execute(
            select(ResearchStream.stream_id).where(
                and_(
                    ResearchStream.scope == StreamScope.PERSONAL,
                    ResearchStream.user_id == user.user_id
                )
            )
        )
        accessible_ids.update(r[0] for r in result.all())

        # Organization streams user is subscribed to
        if user.org_id:
            result = await self.db.execute(
                select(ResearchStream.stream_id).where(
                    and_(
                        ResearchStream.scope == StreamScope.ORGANIZATION,
                        ResearchStream.org_id == user.org_id
                    )
                )
            )
            accessible_ids.update(r[0] for r in result.all())

        # Global streams
        result = await self.db.execute(
            select(ResearchStream.stream_id).where(
                ResearchStream.scope == StreamScope.GLOBAL
            )
        )
        accessible_ids.update(r[0] for r in result.all())

        # User subscriptions
        result = await self.db.execute(
            select(UserStreamSubscription.stream_id).where(
                UserStreamSubscription.user_id == user.user_id
            )
        )
        accessible_ids.update(r[0] for r in result.all())

        # Org subscriptions
        if user.org_id:
            result = await self.db.execute(
                select(OrgStreamSubscription.stream_id).where(
                    OrgStreamSubscription.org_id == user.org_id
                )
            )
            accessible_ids.update(r[0] for r in result.all())

        return accessible_ids

    async def get_recent_reports(
        self,
        user: User,
        limit: int = 20,
        offset: int = 0,
        stream_id: Optional[int] = None
    ) -> List[ReportWithArticleCount]:
        """Get recent reports the user has access to (async)."""
        accessible_stream_ids = await self.get_accessible_stream_ids(user)

        if not accessible_stream_ids:
            return []

        # Build query
        filters = [Report.research_stream_id.in_(accessible_stream_ids)]
        if stream_id:
            filters.append(Report.research_stream_id == stream_id)

        stmt = (
            select(Report, ResearchStream)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .where(and_(*filters))
            .order_by(Report.report_date.desc())
            .offset(offset)
            .limit(limit)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        reports = []
        for report, stream in rows:
            article_count = await self.association_service.count_all(report.report_id)
            reports.append(ReportWithArticleCount(
                report=report,
                article_count=article_count
            ))

        return reports

    async def get_report_with_access(
        self,
        report_id: int,
        user_id: int,
        raise_on_not_found: bool = True
    ) -> Optional[Tuple[Report, User, ResearchStream]]:
        """
        Get report with user access verification (async).

        Consolidates the common pattern of:
        1. Getting a report by ID
        2. Getting the user
        3. Getting the stream
        4. Verifying user has access to the stream

        Args:
            report_id: The report ID
            user_id: The user ID
            raise_on_not_found: If True (default), raises HTTPException 404 on failure.
                               If False, returns None on failure.

        Returns:
            Tuple of (report, user, stream) if found and accessible, None if raise_on_not_found=False.

        Raises:
            HTTPException: 404 if raise_on_not_found=True and report not found or no access
        """
        # Get report with execution relationship for date range info
        stmt = (
            select(Report)
            .options(selectinload(Report.execution))
            .where(Report.report_id == report_id)
        )
        result = await self.db.execute(stmt)
        report = result.scalars().first()
        if not report:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        # Get user
        user = await self.user_service.get_user_by_id(user_id)
        if not user:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        # Get stream
        stmt = select(ResearchStream).where(
            ResearchStream.stream_id == report.research_stream_id
        )
        result = await self.db.execute(stmt)
        stream = result.scalars().first()

        # Check access
        accessible_stream_ids = await self.get_accessible_stream_ids(user)
        if not stream or stream.stream_id not in accessible_stream_ids:
            if raise_on_not_found:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Report not found"
                )
            return None

        return (report, user, stream)

    async def get_report_by_id_internal(self, report_id: int) -> Optional[Report]:
        """
        Get a report by ID without access control.
        For system-level operations (e.g. email queue processing).
        """
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        return result.scalars().first()

    async def get_approved_reports(self, limit: int = 50) -> List[Report]:
        """Get approved reports (e.g. for email queue dropdown)."""
        result = await self.db.execute(
            select(Report)
            .where(Report.approval_status == ApprovalStatus.APPROVED)
            .order_by(Report.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def get_reports_for_stream(
        self,
        user: User,
        research_stream_id: int
    ) -> List[ReportWithArticleCount]:
        """Get all reports for a specific stream (async).

        Non-admin users only see approved reports.
        Admins (platform_admin, org_admin) see all reports.
        """
        accessible_stream_ids = await self.get_accessible_stream_ids(user)

        if research_stream_id not in accessible_stream_ids:
            return []

        stmt = (
            select(Report, ResearchStream)
            .join(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
            .where(Report.research_stream_id == research_stream_id)
        )

        # Non-admin users only see approved reports
        if user.role == UserRole.MEMBER:
            stmt = stmt.where(Report.approval_status == ApprovalStatus.APPROVED)

        stmt = stmt.order_by(Report.report_date.desc())

        result = await self.db.execute(stmt)
        rows = result.all()

        reports = []
        for report, stream in rows:
            article_count = await self.association_service.count_all(report.report_id)
            reports.append(ReportWithArticleCount(
                report=report,
                article_count=article_count
            ))

        return reports

    async def get_report_with_articles(
        self,
        user_id: int,
        report_id: int
    ) -> Optional[ReportWithArticlesData]:
        """Get report with its visible articles (async).

        Returns only articles where is_hidden=False, ordered by ranking.
        Each article includes per-user is_starred status.
        Use get_curation_view for the full list including hidden articles.
        """
        access_result = await self.get_report_with_access(report_id, user_id, raise_on_not_found=False)
        if not access_result:
            return None
        report, _, stream = access_result

        # Get visible articles using the canonical method
        visible_associations = await self.association_service.get_visible_for_report(report_id)

        # Get user's starred article IDs for this report
        starred_result = await self.db.execute(
            select(UserArticleStar.article_id).where(
                and_(
                    UserArticleStar.user_id == user_id,
                    UserArticleStar.report_id == report_id
                )
            )
        )
        starred_article_ids = set(starred_result.scalars().all())

        # Build articles with per-user is_starred
        articles = [
            ReportArticleInfo(
                article=assoc.article,
                association=assoc,
                is_starred=assoc.article.article_id in starred_article_ids
            )
            for assoc in visible_associations
        ]

        # Get retrieval_params from pipeline execution
        retrieval_params = None
        if report.pipeline_execution_id:
            exec_result = await self.db.execute(
                select(PipelineExecution).where(
                    PipelineExecution.id == report.pipeline_execution_id
                )
            )
            exec_obj = exec_result.scalars().first()
            if exec_obj:
                retrieval_params = {
                    'start_date': exec_obj.start_date,
                    'end_date': exec_obj.end_date,
                    'retrieval_config': exec_obj.retrieval_config,
                    'presentation_config': exec_obj.presentation_config,
                }

        # Build category map for callers that need it
        category_map = self.build_category_map(stream)

        return ReportWithArticlesData(
            report=report,
            articles=articles,
            article_count=len(articles),
            retrieval_params=retrieval_params,
            category_map=category_map
        )

    async def search_articles_in_stream(
        self,
        user_id: int,
        stream_id: int,
        query: str,
        max_results: int = 20
    ) -> List[ArticleSearchResult]:
        """
        Search for articles across all reports in a stream.

        Searches title, abstract, journal, authors, and PMID.
        Also searches DOI if query looks like a DOI.
        """
        # Check if user has access to this stream
        user_service = UserService(self.db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return []

        accessible_stream_ids = await self.get_accessible_stream_ids(user)
        if stream_id not in accessible_stream_ids:
            return []

        # Get all reports for this stream
        report_stmt = select(Report.report_id).where(
            Report.research_stream_id == stream_id
        )
        report_result = await self.db.execute(report_stmt)
        report_ids = [r[0] for r in report_result.all()]

        if not report_ids:
            return []

        # Build search conditions - split query into words so each word
        # can match independently across any field (AND logic between words)
        search_fields = [
            Article.title,
            Article.abstract,
            Article.journal,
            Article.authors,
            Article.pmid,
        ]

        # If query looks like a DOI, also search DOI field
        if "/" in query or query.lower().startswith("10."):
            search_fields.append(Article.doi)

        words = query.split()
        if words:
            # Each word must appear in at least one field
            word_conditions = []
            for word in words:
                term = f"%{word}%"
                word_conditions.append(
                    or_(*[field.ilike(term) for field in search_fields])
                )
            combined_search = and_(*word_conditions)
        else:
            combined_search = or_(*[
                field.ilike(f"%{query}%") for field in search_fields
            ])

        search_stmt = select(
            Article, ReportArticleAssociation, Report
        ).join(
            ReportArticleAssociation,
            Article.article_id == ReportArticleAssociation.article_id
        ).join(
            Report,
            ReportArticleAssociation.report_id == Report.report_id
        ).where(
            ReportArticleAssociation.report_id.in_(report_ids),
            combined_search
        ).order_by(
            func.coalesce(ReportArticleAssociation.relevance_score, -1).desc()
        ).limit(max_results)

        result = await self.db.execute(search_stmt)
        rows = result.all()

        return [
            ArticleSearchResult(article=article, association=assoc, report=report)
            for article, assoc, report in rows
        ]

    async def get_starred_articles_in_stream(
        self,
        user_id: int,
        stream_id: int
    ) -> List[ArticleSearchResult]:
        """
        Get all starred articles across all reports in a stream.
        """
        # Check if user has access to this stream
        user_service = UserService(self.db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return []

        accessible_stream_ids = await self.get_accessible_stream_ids(user)
        if stream_id not in accessible_stream_ids:
            return []

        stmt = select(
            Article, ReportArticleAssociation, Report
        ).join(
            ReportArticleAssociation,
            Article.article_id == ReportArticleAssociation.article_id
        ).join(
            Report,
            ReportArticleAssociation.report_id == Report.report_id
        ).where(
            Report.research_stream_id == stream_id,
            ReportArticleAssociation.is_starred == True
        ).order_by(Report.report_date.desc())

        result = await self.db.execute(stmt)
        rows = result.all()

        return [
            ArticleSearchResult(article=article, association=assoc, report=report)
            for article, assoc, report in rows
        ]

    # =========================================================================
    # DELETE
    # =========================================================================

    async def delete_report(self, user: User, report_id: int) -> bool:
        """Delete a report if user has access (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id, raise_on_not_found=False)
        if not access_result:
            return False
        report, _, _ = access_result

        # Clear report_id reference in pipeline_executions (FK constraint)
        await self.db.execute(
            PipelineExecution.__table__.update()
            .where(PipelineExecution.report_id == report_id)
            .values(report_id=None)
        )

        # Delete associations first
        await self.association_service.delete_all_for_report(report_id)

        # Delete WIP articles if any
        if report.pipeline_execution_id:
            await self.db.execute(
                WipArticle.__table__.delete().where(
                    WipArticle.pipeline_execution_id == report.pipeline_execution_id
                )
            )

        # Delete report
        await self.db.execute(
            Report.__table__.delete().where(Report.report_id == report_id)
        )

        await self.db.commit()
        return True

    # =========================================================================
    # EMAIL
    # =========================================================================

    async def get_report_email_html(
        self,
        user: User,
        report_id: int
    ) -> Optional[EmailResult]:
        """Get stored email HTML for a report (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id, raise_on_not_found=False)
        if not access_result:
            return None
        report, _, _ = access_result

        html = report.enrichments.get('email_html') if report.enrichments else None
        return EmailResult(html=html, report_name=report.report_name)

    async def store_report_email_html(
        self,
        user: User,
        report_id: int,
        html: str
    ) -> Optional[EmailResult]:
        """Store email HTML for a report (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id, raise_on_not_found=False)
        if not access_result:
            return None
        report, _, _ = access_result

        enrichments = report.enrichments or {}
        enrichments['email_html'] = html
        report.enrichments = enrichments
        await self.db.commit()

        return EmailResult(html=html, report_name=report.report_name)

    async def generate_report_email_html(
        self,
        user: User,
        report_id: int
    ) -> Optional[EmailResult]:
        """Generate HTML email content for a report (async)."""
        access_result = await self.get_report_with_access(report_id, user.user_id, raise_on_not_found=False)
        if not access_result:
            return None
        report, _, stream = access_result

        # Get visible articles using existing service method
        associations = await self.association_service.get_visible_for_report(report_id)

        # Get ordered categories from presentation config (defines display order)
        config_categories = stream.presentation_config.get('categories', []) if stream.presentation_config else []

        # Build category ID -> name mapping
        category_id_to_name = self.build_category_map(stream)

        # Build email data - group articles by category ID
        categories_dict: Dict[str, List[EmailArticle]] = {}
        for assoc in associations:
            article = assoc.article
            cat_ids = assoc.presentation_categories or ['uncategorized']
            for cat_id in cat_ids:
                if cat_id not in categories_dict:
                    categories_dict[cat_id] = []
                categories_dict[cat_id].append(EmailArticle(
                    title=article.title or 'Untitled',
                    authors=article.authors[:3] if article.authors else None,
                    journal=article.journal or None,
                    pub_year=article.pub_year,
                    pub_month=article.pub_month,
                    pub_day=article.pub_day,
                    summary=assoc.ai_summary or (article.abstract[:300] + '...' if article.abstract and len(article.abstract) > 300 else article.abstract),
                    url=article.url or (f"https://pubmed.ncbi.nlm.nih.gov/{article.pmid}/" if article.pmid else None),
                    pmid=article.pmid,
                    article_id=article.article_id
                ))

        # Get enrichments for summaries
        enrichments = report.enrichments or {}
        executive_summary = enrichments.get('executive_summary', '')
        category_summaries = enrichments.get('category_summaries', {})

        # Build email categories in presentation config order (same order as category config screen)
        email_categories = []
        for cat_config in config_categories:
            cat_id = cat_config.get('id') if isinstance(cat_config, dict) else getattr(cat_config, 'id', None)
            if cat_id and cat_id in categories_dict:
                email_categories.append(EmailCategory(
                    id=cat_id,
                    name=category_id_to_name.get(cat_id, cat_id),
                    summary=category_summaries.get(cat_id, ''),
                    articles=categories_dict[cat_id]
                ))

        # Add any categories not in config (e.g., 'uncategorized') at the end
        for cat_id, articles in categories_dict.items():
            if not any(ec.id == cat_id for ec in email_categories):
                email_categories.append(EmailCategory(
                    id=cat_id,
                    name=category_id_to_name.get(cat_id, cat_id),
                    summary=category_summaries.get(cat_id, ''),
                    articles=articles
                ))

        # Build report URL for "View Online" link
        base_url = settings.FRONTEND_URL or 'http://localhost:5173'
        report_url = f"{base_url}/reports?stream={stream.stream_id}&report={report_id}"

        # Get date range from execution if available
        date_range_start = None
        date_range_end = None
        if report.execution:
            if report.execution.start_date:
                try:
                    start_dt = datetime.strptime(report.execution.start_date, '%Y-%m-%d')
                    date_range_start = start_dt.strftime('%b %d, %Y')
                except ValueError:
                    pass
            if report.execution.end_date:
                try:
                    end_dt = datetime.strptime(report.execution.end_date, '%Y-%m-%d')
                    date_range_end = end_dt.strftime('%b %d, %Y')
                except ValueError:
                    pass

        # Calculate publication date early so it can be used in email_data
        from datetime import timedelta
        publication_date = ''
        if report.execution and report.execution.end_date:
            try:
                end_dt = datetime.strptime(report.execution.end_date, '%Y-%m-%d')
                pub_dt = end_dt + timedelta(days=1)
                publication_date = pub_dt.strftime('%b %d, %Y')
            except ValueError:
                pass
        if not publication_date and report.report_date:
            publication_date = report.report_date.strftime('%b %d, %Y')

        email_data = EmailReportData(
            report_name=report.report_name,
            stream_name=stream.stream_name,
            report_date=publication_date,  # Use publication date (end_date + 1) for Generated date
            executive_summary=executive_summary,
            categories=email_categories,
            report_url=report_url,
            date_range_start=date_range_start,
            date_range_end=date_range_end
            # Logo is now embedded by EmailService using CID attachment
        )

        # Generate HTML
        template_service = EmailTemplateService()
        html = template_service.generate_report_email(email_data)

        # Subject uses the same publication_date calculated above
        subject = f"{stream.stream_name}: {publication_date}"

        # Load logo image for CID embedding
        import os
        images = None
        try:
            logo_path = os.path.join(
                os.path.dirname(__file__), '..', 'assets', 'KH logo black.png'
            )
            logo_path = os.path.normpath(logo_path)
            if os.path.exists(logo_path):
                with open(logo_path, 'rb') as f:
                    images = {'kh_logo': f.read()}
        except Exception as e:
            logger.warning(f"Could not load logo for email: {e}")

        return EmailResult(html=html, report_name=report.report_name, subject=subject, images=images)

    # =========================================================================
    # APPROVAL WORKFLOW
    # =========================================================================

    async def approve_report(
        self,
        report_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> ApproveReportResult:
        """Approve a report for publication (async)."""
        from models import CurationEvent

        # Get report
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        report = result.scalars().first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Count visible articles
        article_count = await self.association_service.count_visible(report_id)

        if article_count == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot approve report with no articles"
            )

        # Update approval status
        report.approval_status = ApprovalStatus.APPROVED
        report.approved_by = user_id
        report.approved_at = datetime.utcnow()

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            event_type='approve_report',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        # Auto-queue emails for subscribers (before commit so it's atomic)
        emails_queued = await self.email_queue_service.auto_queue_for_approved_report(report_id)

        await self.db.commit()

        return ApproveReportResult(
            report_id=report_id,
            approval_status='approved',
            approved_by=user_id,
            approved_at=report.approved_at.isoformat(),
            emails_queued=emails_queued,
        )

    async def reject_report(
        self,
        report_id: int,
        user_id: int,
        reason: str
    ) -> RejectReportResult:
        """Reject a report with a reason (async)."""
        from models import CurationEvent

        # Get report
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        report = result.scalars().first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Update approval status
        report.approval_status = ApprovalStatus.REJECTED
        report.rejection_reason = reason
        report.approved_by = user_id
        report.approved_at = datetime.utcnow()

        # Create audit event
        event = CurationEvent(
            report_id=report_id,
            event_type='reject_report',
            notes=reason,
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return RejectReportResult(
            report_id=report_id,
            approval_status='rejected',
            rejection_reason=reason,
            rejected_by=user_id,
            rejected_at=report.approved_at.isoformat(),
        )

    # =========================================================================
    # CURATION
    # =========================================================================

    async def get_curation_history(
        self,
        report_id: int,
        user_id: int
    ) -> CurationHistoryData:
        """Get curation history for a report (async)."""
        from models import CurationEvent

        # Verify report exists
        result = await self.db.execute(
            select(Report).where(Report.report_id == report_id)
        )
        report = result.scalars().first()

        if not report:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Report not found"
            )

        # Get curation events
        events_result = await self.db.execute(
            select(CurationEvent, User)
            .outerjoin(User, CurationEvent.curator_id == User.user_id)
            .where(CurationEvent.report_id == report_id)
            .order_by(CurationEvent.created_at.desc())
        )
        rows = events_result.all()

        events = []
        for event, curator in rows:
            # Get article title if applicable
            article_title = None
            if event.article_id:
                article_result = await self.db.execute(
                    select(Article.title).where(Article.article_id == event.article_id)
                )
                article_title = article_result.scalar()

            events.append(CurationEventData(
                id=event.id,
                event_type=event.event_type,
                field_name=event.field_name,
                old_value=event.old_value,
                new_value=event.new_value,
                notes=event.notes,
                article_id=event.article_id,
                article_title=article_title,
                curator_name=curator.full_name or curator.email if curator else "Unknown",
                created_at=event.created_at.isoformat(),
            ))

        return CurationHistoryData(
            events=events,
            total_count=len(events),
        )

    async def get_report_config(self, report_id: int, user_id: int) -> ReportConfigData:
        """
        Get lightweight config data for a report (async).

        Returns just the configuration needed for the settings modal:
        - retrieval_config, enrichment_config, llm_config from execution
        - Falls back to stream config if execution config is not available
        """
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Initialize with defaults
        retrieval_config = None
        enrichment_config = None
        llm_config = None
        start_date = None
        end_date = None

        # Fetch execution for config access
        if report.pipeline_execution_id:
            exec_result = await self.db.execute(
                select(PipelineExecution).where(
                    PipelineExecution.id == report.pipeline_execution_id
                )
            )
            execution = exec_result.scalars().first()

            if execution:
                retrieval_config = execution.retrieval_config
                enrichment_config = execution.enrichment_config
                llm_config = execution.llm_config
                start_date = execution.start_date
                end_date = execution.end_date

        # Fall back to stream config if execution config is not available
        if not enrichment_config and stream:
            enrichment_config = stream.enrichment_config
        if not llm_config and stream:
            llm_config = stream.llm_config

        return ReportConfigData(
            retrieval_config=retrieval_config,
            enrichment_config=enrichment_config,
            llm_config=llm_config,
            start_date=start_date,
            end_date=end_date,
            stream_name=stream.stream_name if stream else None,
        )

    async def get_curation_view(self, report_id: int, user_id: int) -> CurationViewData:
        """
        Get full curation view data for a report (async).
        """
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Get categories from stream config
        categories = []
        if stream and stream.presentation_config:
            categories = stream.presentation_config.get('categories', [])

        # Get VISIBLE articles (curator_excluded=False)
        visible_associations = await self.association_service.get_visible_for_report(report_id)

        # Get WIP articles for this execution and compute stats
        filtered_articles: List[WipArticle] = []
        curated_articles: List[WipArticle] = []

        # Pipeline stats (what pipeline originally decided)
        pipeline_included_count = 0
        pipeline_filtered_count = 0
        pipeline_duplicate_count = 0

        # Curator stats
        curator_added_count = 0
        curator_removed_count = 0

        # Fetch execution for retrieval config access
        execution: Optional[PipelineExecution] = None
        wip_articles: List[WipArticle] = []

        if report.pipeline_execution_id:
            exec_result = await self.db.execute(
                select(PipelineExecution).where(
                    PipelineExecution.id == report.pipeline_execution_id
                )
            )
            execution = exec_result.scalars().first()

            wip_articles = await self.wip_article_service.get_by_execution_id(
                report.pipeline_execution_id
            )

            for wip in wip_articles:
                # Count pipeline decisions
                if wip.is_duplicate:
                    pipeline_duplicate_count += 1
                    continue
                elif wip.passed_semantic_filter:
                    pipeline_included_count += 1
                else:
                    pipeline_filtered_count += 1

                # Count curator overrides
                if wip.curator_included:
                    curator_added_count += 1
                if wip.curator_excluded:
                    curator_removed_count += 1

                # Filtered = not currently visible in report
                if not wip.included_in_report:
                    filtered_articles.append(wip)

                # Curated = has curator override
                if wip.curator_included or wip.curator_excluded:
                    curated_articles.append(wip)

        # Build included articles - wip_article is already loaded via selectinload
        included_articles = []
        for assoc in visible_associations:
            wip = assoc.wip_article
            included_articles.append(IncludedArticleData(
                article=assoc.article,
                association=assoc,
                wip_article_id=wip.id if wip else None,
                filter_score=wip.filter_score if wip else None,
                filter_score_reason=wip.filter_score_reason if wip else None,
                curation_notes=wip.curation_notes if wip else None,
                curated_by=wip.curated_by if wip else None,
                curated_at=wip.curated_at if wip else None,
            ))

        current_included_count = len(included_articles)

        stats = CurationStats(
            pipeline_included=pipeline_included_count,
            pipeline_filtered=pipeline_filtered_count,
            pipeline_duplicates=pipeline_duplicate_count,
            current_included=current_included_count,
            curator_added=curator_added_count,
            curator_removed=curator_removed_count,
        )

        return CurationViewData(
            report=report,
            stream=stream,
            included_articles=included_articles,
            filtered_articles=filtered_articles,
            curated_articles=curated_articles,
            categories=categories,
            stats=stats,
            execution=execution,
        )

    async def update_report_content(
        self,
        report_id: int,
        user_id: int,
        report_name: Optional[str] = None,
        executive_summary: Optional[str] = None,
        category_summaries: Optional[Dict[str, str]] = None
    ) -> ReportContentUpdateResult:
        """Update report content (name, summaries) for curation (async)."""
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        from models import CurationEvent
        import json

        changes_made = []

        if report_name is not None and report_name != report.report_name:
            old_value = report.report_name
            report.report_name = report_name
            changes_made.append(('report_name', old_value, report_name))

        enrichments = report.enrichments or {}

        if executive_summary is not None:
            old_value = enrichments.get('executive_summary', '')
            if executive_summary != old_value:
                enrichments['executive_summary'] = executive_summary
                changes_made.append(('executive_summary', old_value, executive_summary))

        if category_summaries is not None:
            old_value = enrichments.get('category_summaries', {})
            if category_summaries != old_value:
                enrichments['category_summaries'] = category_summaries
                changes_made.append(('category_summaries', json.dumps(old_value), json.dumps(category_summaries)))

        if changes_made:
            report.enrichments = enrichments
            report.has_curation_edits = True
            report.last_curated_by = user_id
            report.last_curated_at = datetime.utcnow()

            for field_name, old_val, new_val in changes_made:
                event = CurationEvent(
                    report_id=report_id,
                    event_type='edit_report',
                    field_name=field_name,
                    old_value=str(old_val) if old_val else None,
                    new_value=str(new_val) if new_val else None,
                    curator_id=user_id
                )
                self.db.add(event)

            await self.db.commit()

        return ReportContentUpdateResult(
            report_name=report.report_name,
            executive_summary=enrichments.get('executive_summary', ''),
            category_summaries=enrichments.get('category_summaries', {}),
            has_curation_edits=report.has_curation_edits,
        )

    async def exclude_article(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        notes: Optional[str] = None
    ) -> ExcludeArticleResult:
        """Curator excludes an article from the report (async)."""
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Get the association
        association = await self.association_service.get(report_id, article_id)

        # Already hidden?
        if association.is_hidden:
            return ExcludeArticleResult(
                article_id=article_id,
                excluded=True,
                wip_article_updated=False,
            )

        # WipArticle is already loaded via selectinload on association
        wip_article = association.wip_article

        was_curator_added = association.curator_added or False

        if was_curator_added:
            # Curator-added article: delete association entirely
            await self.association_service.delete(association)
            if wip_article:
                self.wip_article_service.clear_curator_included(wip_article)
            event_type = 'undo_include_article'
        else:
            # Pipeline-included article: soft hide
            self.association_service.set_hidden(association, True)
            if wip_article:
                self.wip_article_service.set_curator_excluded(wip_article, user_id, notes)
            event_type = 'exclude_article'

        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article_id,
            event_type=event_type,
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return ExcludeArticleResult(
            article_id=article_id,
            excluded=True,
            wip_article_updated=wip_article is not None,
            was_curator_added=was_curator_added,
        )

    async def include_article(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int,
        category: Optional[str] = None,
        notes: Optional[str] = None
    ) -> IncludeArticleResult:
        """Curator includes a filtered article into the report (async)."""
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Get the WipArticle (raises ValueError if not found)
        wip_article = await self.wip_article_service.get_by_id(wip_article_id)

        if wip_article.pipeline_execution_id != report.pipeline_execution_id:
            raise ValueError("WIP article not found for this report")

        if wip_article.included_in_report:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Article is already in the report"
            )

        # Find or create Article record (via ArticleService)
        article = await self.article_service.find_or_create_from_wip(wip_article)

        # Check if association already exists
        existing_association = await self.association_service.find(report_id, article.article_id)
        if existing_association:
            self.association_service.set_hidden(existing_association, False)
            new_ranking = existing_association.ranking
        else:
            new_ranking = await self.association_service.get_next_ranking(report_id)
            categories = [category] if category else []
            await self.association_service.create(
                report_id=report_id,
                article_id=article.article_id,
                wip_article_id=wip_article.id,
                ranking=new_ranking,
                presentation_categories=categories,
                curator_added=True
            )

        # Update WipArticle
        self.wip_article_service.set_curator_included(wip_article, user_id, notes)

        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article.article_id,
            event_type='include_article',
            notes=notes,
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return IncludeArticleResult(
            article_id=article.article_id,
            wip_article_id=wip_article_id,
            included=True,
            ranking=new_ranking,
            category=category,
        )

    async def reset_curation(
        self,
        report_id: int,
        wip_article_id: int,
        user_id: int
    ) -> ResetCurationResult:
        """Reset curation for an article (async)."""
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Get the WipArticle (raises ValueError if not found)
        wip_article = await self.wip_article_service.get_by_id(wip_article_id)

        if wip_article.pipeline_execution_id != report.pipeline_execution_id:
            raise ValueError("WIP article not found for this report")

        was_curator_included = wip_article.curator_included
        was_curator_excluded = wip_article.curator_excluded

        if not was_curator_included and not was_curator_excluded:
            return ResetCurationResult(
                wip_article_id=wip_article_id,
                reset=False,
                message='Article has no curation overrides to reset'
            )

        # Find the Article record
        article = None
        if wip_article.pmid:
            result = await self.db.execute(
                select(Article).where(Article.pmid == wip_article.pmid)
            )
            article = result.scalars().first()
        if not article and wip_article.doi:
            result = await self.db.execute(
                select(Article).where(Article.doi == wip_article.doi)
            )
            article = result.scalars().first()

        article_id = None
        if article:
            article_id = article.article_id
            association = await self.association_service.find(report_id, article.article_id)

            if association:
                if association.curator_added:
                    await self.association_service.delete(association)
                elif association.is_hidden:
                    self.association_service.set_hidden(association, False)

        # Clear WipArticle curation flags
        pipeline_would_include = self.wip_article_service.clear_curation_flags(wip_article, user_id)

        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        from models import CurationEvent
        event = CurationEvent(
            report_id=report_id,
            article_id=article_id,
            event_type='reset_curation',
            notes=f"Reset from {'curator_included' if was_curator_included else 'curator_excluded'} to pipeline decision",
            curator_id=user_id
        )
        self.db.add(event)

        await self.db.commit()

        return ResetCurationResult(
            wip_article_id=wip_article_id,
            reset=True,
            was_curator_included=was_curator_included,
            was_curator_excluded=was_curator_excluded,
            pipeline_decision=pipeline_would_include,
            now_in_report=pipeline_would_include,
        )

    async def update_article_in_report(
        self,
        report_id: int,
        article_id: int,
        user_id: int,
        ranking: Optional[int] = None,
        category: Optional[str] = None,
        ai_summary: Optional[str] = None
    ) -> UpdateArticleResult:
        """Edit an article within the report (async)."""
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        association = await self.association_service.get(report_id, article_id)

        from models import CurationEvent
        import json

        changes_made = []

        if ranking is not None and ranking != association.ranking:
            old_val = association.ranking
            association.ranking = ranking
            changes_made.append(('ranking', str(old_val), str(ranking)))

        if category is not None:
            categories = [category] if category else []
            old_val = association.presentation_categories
            if categories != old_val:
                association.presentation_categories = categories
                changes_made.append(('presentation_categories', json.dumps(old_val), json.dumps(categories)))

        if ai_summary is not None and ai_summary != association.ai_summary:
            old_val = association.ai_summary
            if association.original_ai_summary is None and old_val:
                association.original_ai_summary = old_val
            association.ai_summary = ai_summary
            changes_made.append(('ai_summary', old_val[:100] if old_val else None, ai_summary[:100]))

        if changes_made:
            report.has_curation_edits = True
            report.last_curated_by = user_id
            report.last_curated_at = datetime.utcnow()

            for field_name, old_val, new_val in changes_made:
                event = CurationEvent(
                    report_id=report_id,
                    article_id=article_id,
                    event_type='edit_article',
                    field_name=field_name,
                    old_value=old_val,
                    new_value=new_val,
                    curator_id=user_id
                )
                self.db.add(event)

            await self.db.commit()

        return UpdateArticleResult(
            article_id=article_id,
            ranking=association.ranking,
            presentation_categories=association.presentation_categories or [],
            ai_summary=association.ai_summary,
        )

    # =========================================================================
    # ANALYTICS
    # =========================================================================

    async def get_pipeline_analytics(
        self,
        report_id: int,
        user_id: int
    ) -> PipelineAnalytics:
        """Get pipeline analytics for a report (async)."""
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Initialize empty analytics
        summary = PipelineAnalyticsSummary(
            total_retrieved=0,
            duplicates=0,
            filtered_out=0,
            passed_filter=0,
            included_in_report=0,
        )

        by_group: List[GroupAnalytics] = []
        filter_reasons: Dict[str, int] = {}
        category_counts: Dict[str, int] = {}
        wip_articles_data: List[WipArticleAnalytics] = []

        if report.pipeline_execution_id:
            wip_articles = await self.wip_article_service.get_by_execution_id(
                report.pipeline_execution_id
            )

            # Get associations for category info
            associations = await self.association_service.get_all_for_report(report_id)
            article_categories: Dict[int, List[str]] = {}
            for assoc in associations:
                article_categories[assoc.article_id] = assoc.presentation_categories or []

            # Group stats
            group_stats: Dict[str, Dict[str, int]] = {}

            for wip in wip_articles:
                summary.total_retrieved += 1
                group_id = wip.retrieval_group_id or "unknown"

                if group_id not in group_stats:
                    group_stats[group_id] = {
                        'total': 0, 'duplicates': 0, 'filtered_out': 0,
                        'passed_filter': 0, 'included': 0
                    }
                group_stats[group_id]['total'] += 1

                if wip.is_duplicate:
                    summary.duplicates += 1
                    group_stats[group_id]['duplicates'] += 1
                elif not wip.passed_semantic_filter:
                    summary.filtered_out += 1
                    group_stats[group_id]['filtered_out'] += 1
                    if wip.filter_score_reason:
                        reason = wip.filter_score_reason[:50]
                        filter_reasons[reason] = filter_reasons.get(reason, 0) + 1
                else:
                    summary.passed_filter += 1
                    group_stats[group_id]['passed_filter'] += 1

                if wip.included_in_report:
                    summary.included_in_report += 1
                    group_stats[group_id]['included'] += 1

                # Find categories via Article lookup
                article_result = await self.db.execute(
                    select(Article.article_id).where(
                        or_(
                            and_(Article.pmid.isnot(None), Article.pmid == wip.pmid),
                            and_(Article.doi.isnot(None), Article.doi == wip.doi)
                        )
                    )
                )
                article_id = article_result.scalar()
                cats = article_categories.get(article_id, []) if article_id else []

                for cat in cats:
                    category_counts[cat] = category_counts.get(cat, 0) + 1

                wip_articles_data.append(WipArticleAnalytics(
                    id=wip.id,
                    title=wip.title,
                    retrieval_group_id=wip.retrieval_group_id or "unknown",
                    is_duplicate=wip.is_duplicate or False,
                    duplicate_of_id=wip.duplicate_of_id,
                    passed_semantic_filter=wip.passed_semantic_filter,
                    filter_score=wip.filter_score,
                    filter_score_reason=wip.filter_score_reason,
                    included_in_report=wip.included_in_report or False,
                    presentation_categories=cats,
                    authors=wip.authors or [],
                    journal=wip.journal,
                    pub_year=wip.pub_year,
                    pub_month=wip.pub_month,
                    pub_day=wip.pub_day,
                    pmid=wip.pmid,
                    doi=wip.doi,
                    abstract=wip.abstract,
                ))

            by_group = [
                GroupAnalytics(
                    group_id=gid,
                    total=stats['total'],
                    duplicates=stats['duplicates'],
                    filtered_out=stats['filtered_out'],
                    passed_filter=stats['passed_filter'],
                    included=stats['included'],
                )
                for gid, stats in group_stats.items()
            ]

        # Get execution for pipeline_metrics
        exec_result = await self.db.execute(
            select(PipelineExecution).where(
                PipelineExecution.id == report.pipeline_execution_id
            )
        ) if report.pipeline_execution_id else None
        execution = exec_result.scalars().first() if exec_result else None

        return PipelineAnalytics(
            report_id=report_id,
            run_type=execution.run_type.value if execution and execution.run_type else None,
            report_date=report.report_date.isoformat() if report.report_date else "",
            pipeline_metrics=None,  # Not currently stored in PipelineExecution model
            summary=summary,
            by_group=by_group,
            filter_reasons=filter_reasons,
            category_counts=category_counts,
            wip_articles=wip_articles_data,
        )

    async def compare_to_pubmed_ids(
        self,
        report_id: int,
        user_id: int,
        pubmed_ids: List[str]
    ) -> CompareReportResultData:
        """
        Compare a pipeline report to a supplied set of PubMed IDs.

        For each supplied PMID, determines:
        - Was it retrieved in the search?
        - Did it pass the semantic filter?
        - Was it included in the report?

        Also returns articles in the report that weren't in the supplied list.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            pubmed_ids: List of PubMed IDs to compare

        Returns:
            CompareReportResultData with supplied article statuses, report-only articles, and stats

        Raises:
            HTTPException: If report not found, access denied, or no pipeline data
        """
        # Get report with access verification
        result = await self.get_report_with_access(report_id, user_id, raise_on_not_found=True)
        report, _, _ = result

        if not report.pipeline_execution_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Report does not have pipeline execution data"
            )

        # Get all wip_articles for this execution
        wip_articles = await self.wip_article_service.get_by_execution_id(
            report.pipeline_execution_id
        )

        # Create PMID lookup map
        wip_by_pmid = {wip.pmid: wip for wip in wip_articles if wip.pmid}

        # Get all articles in the report with their associations
        # (article is already loaded via selectinload)
        associations = await self.association_service.get_all_for_report(report_id)

        # Build lookup of report PMIDs to articles
        report_pmids = set()
        report_articles_map = {}
        for assoc in associations:
            article = assoc.article
            if article and article.pmid:
                report_pmids.add(article.pmid)
                report_articles_map[article.pmid] = article

        # Analyze each supplied PMID
        supplied_articles = []
        for pmid in pubmed_ids:
            pmid = pmid.strip()
            if not pmid:
                continue

            wip = wip_by_pmid.get(pmid)

            if not wip:
                # Not found in search results
                supplied_articles.append(SuppliedArticleStatusData(
                    pmid=pmid,
                    status="not_found"
                ))
            elif wip.passed_semantic_filter == False:
                # Found but filtered out
                supplied_articles.append(SuppliedArticleStatusData(
                    pmid=pmid,
                    status="filtered_out",
                    article_title=wip.title,
                    retrieval_unit_id=wip.retrieval_group_id,
                    filter_score=wip.filter_score,
                    filter_score_reason=wip.filter_score_reason
                ))
            elif pmid in report_pmids:
                # Found and included in report
                supplied_articles.append(SuppliedArticleStatusData(
                    pmid=pmid,
                    status="included",
                    article_title=wip.title,
                    retrieval_unit_id=wip.retrieval_group_id
                ))
            else:
                # Found in search but not in report (duplicate or other reason)
                supplied_articles.append(SuppliedArticleStatusData(
                    pmid=pmid,
                    status="not_included",
                    article_title=wip.title,
                    retrieval_unit_id=wip.retrieval_group_id
                ))

        # Find articles in report but not in supplied list
        supplied_pmids_set = set(pmid.strip() for pmid in pubmed_ids if pmid.strip())
        report_only_articles = []

        for pmid in report_pmids:
            if pmid not in supplied_pmids_set:
                article = report_articles_map[pmid]
                wip = wip_by_pmid.get(pmid)
                report_only_articles.append(ReportOnlyArticleData(
                    pmid=pmid,
                    title=article.title,
                    retrieval_unit_id=wip.retrieval_group_id if wip else "unknown",
                    url=article.url
                ))

        # Calculate statistics
        stats = {
            "total_supplied": len([a for a in supplied_articles if a.pmid]),
            "not_found": len([a for a in supplied_articles if a.status == "not_found"]),
            "filtered_out": len([a for a in supplied_articles if a.status == "filtered_out"]),
            "included": len([a for a in supplied_articles if a.status == "included"]),
            "not_included": len([a for a in supplied_articles if a.status == "not_included"]),
            "report_only": len(report_only_articles)
        }

        return CompareReportResultData(
            supplied_articles=supplied_articles,
            report_only_articles=report_only_articles,
            statistics=stats
        )

    # =========================================================================
    # SUMMARY GENERATION
    # =========================================================================

    async def regenerate_summaries_with_prompt(
        self,
        report_id: int,
        user_id: int,
        prompt_type: str,
        system_prompt: str,
        user_prompt_template: str,
        llm_config: Optional[Dict[str, Any]] = None,
    ) -> RegenerateSummariesResult:
        """
        Regenerate summaries for a report using a custom prompt.

        This method allows users to apply a tested prompt to regenerate:
        - article_summary: All article AI summaries in the report
        - category_summary: All category summaries in the report
        - executive_summary: The executive summary

        Records a CurationEvent for audit trail.
        Only allowed for non-approved reports.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification and audit)
            prompt_type: One of 'article_summary', 'category_summary', 'executive_summary'
            system_prompt: The system prompt to use
            user_prompt_template: The user prompt template to use
            llm_config: Optional LLM configuration (model_id, temperature, max_tokens, reasoning_effort)

        Returns:
            RegenerateSummariesResult with updated count, message, and prompt type

        Raises:
            HTTPException: If report not found, access denied, or invalid prompt_type
        """
        from models import CurationEvent
        from services.report_summary_service import ReportSummaryService
        from sqlalchemy.orm.attributes import flag_modified

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status - cannot modify approved reports
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        # Validate prompt_type
        valid_prompt_types = ['article_summary', 'category_summary', 'executive_summary']
        if prompt_type not in valid_prompt_types:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid prompt_type. Must be one of: {valid_prompt_types}"
            )

        # Build enrichment_config from the custom prompt
        enrichment_config = {
            "prompts": {
                prompt_type: {
                    "system_prompt": system_prompt,
                    "user_prompt_template": user_prompt_template,
                }
            }
        }

        # Build model_config - use provided config or fall back to stream's config for this stage
        model_config = None
        from agents.prompts.llm import ModelConfig as LLMModelConfig

        if llm_config and llm_config.get("model_id"):
            # User provided explicit model config
            model_config = LLMModelConfig(
                model_id=llm_config.get("model_id"),
                temperature=llm_config.get("temperature"),
                max_tokens=llm_config.get("max_tokens"),
                reasoning_effort=llm_config.get("reasoning_effort"),
            )
        elif stream and stream.llm_config:
            # Fall back to stream's configured model for this prompt type
            stage_config = stream.llm_config.get(prompt_type)
            if stage_config and (stage_config.get("model_id") or stage_config.get("model")):
                model_config = LLMModelConfig(
                    model_id=stage_config.get("model_id") or stage_config.get("model"),
                    temperature=stage_config.get("temperature"),
                    max_tokens=stage_config.get("max_tokens"),
                    reasoning_effort=stage_config.get("reasoning_effort"),
                )
        # If still None, ReportSummaryService will use its default

        # RETRIEVE: Get visible associations
        associations = await self.association_service.get_visible_for_report(report_id)

        if not associations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No articles in report to regenerate summaries for"
            )

        summary_service = ReportSummaryService()
        updated_count = 0
        old_value_summary = ""

        if prompt_type == 'article_summary':
            # BUILD ITEMS
            items = summary_service.build_article_summary_items(associations, stream)

            if not items:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No articles with abstracts to summarize"
                )

            old_value_summary = f"{len(items)} article summaries"

            # GENERATE
            results = await summary_service.generate_article_summary(
                items=items,
                enrichment_config=enrichment_config,
                model_config=model_config,
            )

            # WRITE: Update associations
            articles_with_abstracts = [a for a in associations if a.article and a.article.abstract]
            for i, result in enumerate(results):
                if result.ok and result.data:
                    assoc = articles_with_abstracts[i]
                    assoc.ai_summary = result.data
                    updated_count += 1

        elif prompt_type == 'category_summary':
            # Get categories from stream
            categories = stream.presentation_config.get('categories', []) if stream and stream.presentation_config else []

            if not categories:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No categories configured for this stream"
                )

            # BUILD ITEMS
            items = summary_service.build_category_summary_items(associations, categories, stream)

            if not items:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No categories have articles to summarize"
                )

            old_value_summary = f"{len(items)} category summaries"

            # GENERATE
            results = await summary_service.generate_category_summary(
                items=items,
                enrichment_config=enrichment_config,
                model_config=model_config,
            )

            # WRITE: Update report enrichments
            enrichments = report.enrichments or {}
            category_summaries = enrichments.get('category_summaries', {})

            for i, result in enumerate(results):
                if result.ok and result.data:
                    cat_id = items[i]["category_id"]
                    category_summaries[cat_id] = result.data
                    updated_count += 1

            enrichments['category_summaries'] = category_summaries
            report.enrichments = enrichments
            flag_modified(report, "enrichments")

        elif prompt_type == 'executive_summary':
            # Get existing category summaries
            enrichments = report.enrichments or {}
            category_summaries = enrichments.get('category_summaries', {})

            # Get categories from stream for ID-to-name mapping
            categories = stream.presentation_config.get('categories', []) if stream and stream.presentation_config else []

            old_value_summary = "executive summary"

            # BUILD ITEM
            item = summary_service.build_executive_summary_item(
                associations=associations,
                category_summaries=category_summaries,
                stream=stream,
                categories=categories,
            )

            # GENERATE
            result = await summary_service.generate_executive_summary(
                items=item,
                enrichment_config=enrichment_config,
                model_config=model_config,
            )

            # WRITE: Update report enrichments
            if result.ok and result.data:
                enrichments['executive_summary'] = result.data
                report.enrichments = enrichments
                flag_modified(report, "enrichments")
                updated_count = 1

        # Record CurationEvent
        event = CurationEvent(
            report_id=report_id,
            event_type='regenerate_summaries',
            field_name=prompt_type,
            old_value=old_value_summary,
            new_value=f"Regenerated {updated_count} using custom prompt",
            notes="Applied custom prompt from Layer 4 testing",
            curator_id=user_id,
        )
        self.db.add(event)

        # Update curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        # Commit everything in one transaction
        await self.db.commit()

        return RegenerateSummariesResult(
            updated_count=updated_count,
            message=f"Successfully regenerated {updated_count} {prompt_type.replace('_', ' ')}(s)",
            prompt_type=prompt_type,
        )

    async def get_current_article_summaries(
        self,
        report_id: int,
        user_id: int,
    ) -> CurrentArticleSummariesResult:
        """
        Get current article summaries for a report (no generation).

        Fetches the current state of all article summaries in the report
        for display in a modal before regeneration.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            CurrentArticleSummariesResult with all current article summaries
        """
        report, _, _ = await self.get_report_with_access(report_id, user_id)

        associations = await self.association_service.get_all_for_report(report_id)

        articles = [
            CurrentArticleSummaryItem(
                article_id=assoc.article_id,
                association_id=assoc.article_id,
                title=assoc.article.title or "Untitled",
                pmid=assoc.article.pmid,
                journal=assoc.article.journal,
                pub_year=assoc.article.pub_year,
                current_summary=assoc.ai_summary,
            )
            for assoc in associations
        ]

        return CurrentArticleSummariesResult(
            report_id=report_id,
            report_name=report.report_name or f"Report {report_id}",
            total_articles=len(articles),
            articles=articles,
        )

    async def get_current_category_summaries(
        self,
        report_id: int,
        user_id: int,
    ) -> CurrentCategorySummariesResult:
        """
        Get current category summaries for a report (no generation).

        Fetches the current state of all category summaries in the report
        for display in a modal before regeneration.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            CurrentCategorySummariesResult with all current category summaries
        """
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Get categories from stream
        categories = stream.presentation_config.get('categories', []) if stream and stream.presentation_config else []

        # Get current category summaries from report enrichments
        enrichments = report.enrichments or {}
        current_summaries = enrichments.get('category_summaries', {})

        category_items = []
        for cat in categories:
            cat_id = cat.get('id', '')
            cat_name = cat.get('name', cat_id)
            category_items.append(CurrentCategorySummaryItem(
                category_id=cat_id,
                category_name=cat_name,
                current_summary=current_summaries.get(cat_id),
            ))

        return CurrentCategorySummariesResult(
            report_id=report_id,
            report_name=report.report_name or f"Report {report_id}",
            total_categories=len(category_items),
            categories=category_items,
        )

    async def get_current_executive_summary(
        self,
        report_id: int,
        user_id: int,
    ) -> CurrentExecutiveSummaryResult:
        """
        Get current executive summary for a report (no generation).

        Fetches the current executive summary for display in a modal
        before regeneration.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            CurrentExecutiveSummaryResult with current executive summary
        """
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Get current executive summary from report enrichments
        enrichments = report.enrichments or {}
        current_summary = enrichments.get('executive_summary')

        return CurrentExecutiveSummaryResult(
            report_id=report_id,
            report_name=report.report_name or f"Report {report_id}",
            current_summary=current_summary,
        )

    async def preview_article_summaries(
        self,
        report_id: int,
        user_id: int,
        system_prompt: str,
        user_prompt_template: str,
        llm_config: Optional[Dict[str, Any]] = None,
    ) -> ArticleSummaryPreviewResult:
        """
        Preview article summary regeneration without saving.

        Generates new summaries using the provided prompt and returns both
        current and new summaries for comparison.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            system_prompt: The system prompt to use
            user_prompt_template: The user prompt template to use
            llm_config: Optional LLM configuration

        Returns:
            ArticleSummaryPreviewResult with previews for each article
        """
        from services.report_summary_service import ReportSummaryService
        from agents.prompts.llm import ModelConfig as LLMModelConfig

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        # Build enrichment_config
        enrichment_config = {
            "prompts": {
                "article_summary": {
                    "system_prompt": system_prompt,
                    "user_prompt_template": user_prompt_template,
                }
            }
        }

        # Build model_config
        model_config = None
        if llm_config and llm_config.get("model_id"):
            model_config = LLMModelConfig(
                model_id=llm_config.get("model_id"),
                temperature=llm_config.get("temperature"),
                max_tokens=llm_config.get("max_tokens"),
                reasoning_effort=llm_config.get("reasoning_effort"),
            )
        elif stream and stream.llm_config:
            stage_config = stream.llm_config.get("article_summary")
            if stage_config and (stage_config.get("model_id") or stage_config.get("model")):
                model_config = LLMModelConfig(
                    model_id=stage_config.get("model_id") or stage_config.get("model"),
                    temperature=stage_config.get("temperature"),
                    max_tokens=stage_config.get("max_tokens"),
                    reasoning_effort=stage_config.get("reasoning_effort"),
                )

        # Get visible associations with articles
        associations = await self.association_service.get_visible_for_report(report_id)

        if not associations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No articles in report"
            )

        # Filter to articles with abstracts
        articles_with_abstracts = [a for a in associations if a.article and a.article.abstract]

        if not articles_with_abstracts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No articles with abstracts to summarize"
            )

        summary_service = ReportSummaryService()

        # Build items for generation
        items = summary_service.build_article_summary_items(articles_with_abstracts, stream)

        # Generate new summaries
        results = await summary_service.generate_article_summary(
            items=items,
            enrichment_config=enrichment_config,
            model_config=model_config,
        )

        # Build preview list
        previews = []
        for i, assoc in enumerate(articles_with_abstracts):
            result = results[i]
            previews.append(ArticleSummaryPreviewItem(
                article_id=assoc.article_id,
                association_id=assoc.article_id,  # Composite PK, use article_id as identifier
                title=assoc.article.title or "Untitled",
                pmid=assoc.article.pmid,
                current_summary=assoc.ai_summary,
                new_summary=result.data if result.ok else None,
                error=result.error if not result.ok else None,
            ))

        return ArticleSummaryPreviewResult(
            report_id=report_id,
            total_articles=len(previews),
            previews=previews,
        )

    async def batch_update_article_summaries(
        self,
        report_id: int,
        user_id: int,
        updates: List[Dict[str, Any]],
    ) -> BatchSummaryUpdateResult:
        """
        Batch update article summaries.

        Updates only the specified articles with new summaries.
        Records a CurationEvent for audit trail.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification and audit)
            updates: List of dicts with 'article_id' and 'ai_summary'

        Returns:
            BatchSummaryUpdateResult with count of updated articles
        """
        from models import CurationEvent

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        if not updates:
            return BatchSummaryUpdateResult(
                report_id=report_id,
                updated_count=0,
                message="No updates provided",
                statistics={"provided": 0, "updated": 0, "not_found": 0}
            )

        updated_count = 0
        not_found_count = 0

        for update in updates:
            article_id = update.get("article_id")
            new_summary = update.get("ai_summary")

            if article_id is None:
                continue

            # Get the association
            assoc = await self.association_service.find(report_id, article_id)
            if assoc:
                assoc.ai_summary = new_summary
                updated_count += 1
            else:
                not_found_count += 1

        # Record CurationEvent
        event = CurationEvent(
            report_id=report_id,
            event_type='batch_update_summaries',
            field_name='article_summary',
            old_value=f"{len(updates)} summaries selected",
            new_value=f"Updated {updated_count} article summaries",
            notes="Applied custom prompt from Layer 4 testing (selective)",
            curator_id=user_id,
        )
        self.db.add(event)

        # Update curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        await self.db.commit()

        return BatchSummaryUpdateResult(
            report_id=report_id,
            updated_count=updated_count,
            message=f"Updated {updated_count} of {len(updates)} article summaries",
            statistics={
                "provided": len(updates),
                "updated": updated_count,
                "not_found": not_found_count,
            }
        )

    async def preview_executive_summary(
        self,
        report_id: int,
        user_id: int,
        system_prompt: str,
        user_prompt_template: str,
        llm_config: Optional[Dict[str, Any]] = None,
    ) -> ExecutiveSummaryPreviewResult:
        """
        Preview executive summary regeneration without saving.

        Generates new executive summary and returns both current and new for comparison.
        """
        from services.report_summary_service import ReportSummaryService
        from agents.prompts.llm import ModelConfig as LLMModelConfig

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        # Get current executive summary
        enrichments = report.enrichments or {}
        current_summary = enrichments.get('executive_summary')
        category_summaries = enrichments.get('category_summaries', {})

        # Build enrichment_config
        enrichment_config = {
            "prompts": {
                "executive_summary": {
                    "system_prompt": system_prompt,
                    "user_prompt_template": user_prompt_template,
                }
            }
        }

        # Build model_config
        model_config = None
        if llm_config and llm_config.get("model_id"):
            model_config = LLMModelConfig(
                model_id=llm_config.get("model_id"),
                temperature=llm_config.get("temperature"),
                max_tokens=llm_config.get("max_tokens"),
                reasoning_effort=llm_config.get("reasoning_effort"),
            )
        elif stream and stream.llm_config:
            stage_config = stream.llm_config.get("executive_summary")
            if stage_config and (stage_config.get("model_id") or stage_config.get("model")):
                model_config = LLMModelConfig(
                    model_id=stage_config.get("model_id") or stage_config.get("model"),
                    temperature=stage_config.get("temperature"),
                    max_tokens=stage_config.get("max_tokens"),
                    reasoning_effort=stage_config.get("reasoning_effort"),
                )

        # Get visible associations
        associations = await self.association_service.get_visible_for_report(report_id)

        # Get categories from stream for ID-to-name mapping
        categories = stream.presentation_config.get('categories', []) if stream and stream.presentation_config else []

        summary_service = ReportSummaryService()

        # Build item
        item = summary_service.build_executive_summary_item(
            associations=associations,
            category_summaries=category_summaries,
            stream=stream,
            categories=categories,
        )

        # Generate
        try:
            result = await summary_service.generate_executive_summary(
                items=item,
                enrichment_config=enrichment_config,
                model_config=model_config,
            )

            return ExecutiveSummaryPreviewResult(
                report_id=report_id,
                report_name=report.report_name or f"Report {report_id}",
                current_summary=current_summary,
                new_summary=result.data if result.ok else None,
                error=result.error if not result.ok else None,
            )
        except Exception as e:
            return ExecutiveSummaryPreviewResult(
                report_id=report_id,
                report_name=report.report_name or f"Report {report_id}",
                current_summary=current_summary,
                new_summary=None,
                error=str(e),
            )

    async def save_executive_summary(
        self,
        report_id: int,
        user_id: int,
        new_summary: str,
    ) -> Dict[str, Any]:
        """
        Save a new executive summary to the report.
        """
        from models import CurationEvent
        from sqlalchemy.orm.attributes import flag_modified

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        # Get current summary for audit
        enrichments = report.enrichments or {}
        old_summary = enrichments.get('executive_summary', '')

        # Update
        enrichments['executive_summary'] = new_summary
        report.enrichments = enrichments
        flag_modified(report, "enrichments")

        # Record CurationEvent
        event = CurationEvent(
            report_id=report_id,
            event_type='regenerate_summary',
            field_name='executive_summary',
            old_value=old_summary[:500] if old_summary else None,
            new_value=new_summary[:500] if new_summary else None,
            notes="Applied custom prompt from Layer 6 testing",
            curator_id=user_id,
        )
        self.db.add(event)

        # Update curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        await self.db.commit()

        return {
            "report_id": report_id,
            "updated": True,
            "message": "Executive summary updated successfully"
        }

    async def preview_category_summaries(
        self,
        report_id: int,
        user_id: int,
        system_prompt: str,
        user_prompt_template: str,
        llm_config: Optional[Dict[str, Any]] = None,
    ) -> CategorySummariesPreviewResult:
        """
        Preview category summaries regeneration without saving.

        Generates new category summaries and returns both current and new for comparison.
        """
        from services.report_summary_service import ReportSummaryService
        from agents.prompts.llm import ModelConfig as LLMModelConfig

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        # Get categories from stream
        categories = stream.presentation_config.get('categories', []) if stream and stream.presentation_config else []

        if not categories:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No categories configured for this stream"
            )

        # Get current category summaries
        enrichments = report.enrichments or {}
        current_summaries = enrichments.get('category_summaries', {})

        # Build enrichment_config
        enrichment_config = {
            "prompts": {
                "category_summary": {
                    "system_prompt": system_prompt,
                    "user_prompt_template": user_prompt_template,
                }
            }
        }

        # Build model_config
        model_config = None
        if llm_config and llm_config.get("model_id"):
            model_config = LLMModelConfig(
                model_id=llm_config.get("model_id"),
                temperature=llm_config.get("temperature"),
                max_tokens=llm_config.get("max_tokens"),
                reasoning_effort=llm_config.get("reasoning_effort"),
            )
        elif stream and stream.llm_config:
            stage_config = stream.llm_config.get("category_summary")
            if stage_config and (stage_config.get("model_id") or stage_config.get("model")):
                model_config = LLMModelConfig(
                    model_id=stage_config.get("model_id") or stage_config.get("model"),
                    temperature=stage_config.get("temperature"),
                    max_tokens=stage_config.get("max_tokens"),
                    reasoning_effort=stage_config.get("reasoning_effort"),
                )

        # Get visible associations
        associations = await self.association_service.get_visible_for_report(report_id)

        summary_service = ReportSummaryService()

        # Build items
        items = summary_service.build_category_summary_items(associations, categories, stream)

        if not items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No categories have articles to summarize"
            )

        # Generate
        results = await summary_service.generate_category_summary(
            items=items,
            enrichment_config=enrichment_config,
            model_config=model_config,
        )

        # Build preview list
        previews = []
        for i, item in enumerate(items):
            cat_id = item["category_id"]
            cat_name = item.get("category_name", cat_id)
            result = results[i]
            previews.append(CategorySummaryPreviewItem(
                category_id=cat_id,
                category_name=cat_name,
                current_summary=current_summaries.get(cat_id),
                new_summary=result.data if result.ok else None,
                error=result.error if not result.ok else None,
            ))

        return CategorySummariesPreviewResult(
            report_id=report_id,
            report_name=report.report_name or f"Report {report_id}",
            total_categories=len(previews),
            previews=previews,
        )

    async def save_category_summaries(
        self,
        report_id: int,
        user_id: int,
        updates: List[Dict[str, str]],
    ) -> Dict[str, Any]:
        """
        Save selected category summaries to the report.

        Args:
            updates: List of dicts with 'category_id' and 'summary'
        """
        from models import CurationEvent
        from sqlalchemy.orm.attributes import flag_modified

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        if not updates:
            return {
                "report_id": report_id,
                "updated_count": 0,
                "message": "No updates provided"
            }

        # Get current summaries for audit
        enrichments = report.enrichments or {}
        category_summaries = enrichments.get('category_summaries', {})

        updated_count = 0
        for update in updates:
            cat_id = update.get("category_id")
            new_summary = update.get("summary")
            if cat_id and new_summary:
                category_summaries[cat_id] = new_summary
                updated_count += 1

        enrichments['category_summaries'] = category_summaries
        report.enrichments = enrichments
        flag_modified(report, "enrichments")

        # Record CurationEvent
        event = CurationEvent(
            report_id=report_id,
            event_type='batch_update_summaries',
            field_name='category_summary',
            old_value=f"{len(updates)} summaries selected",
            new_value=f"Updated {updated_count} category summaries",
            notes="Applied custom prompt from Layer 5 testing (selective)",
            curator_id=user_id,
        )
        self.db.add(event)

        # Update curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        await self.db.commit()

        return {
            "report_id": report_id,
            "updated_count": updated_count,
            "message": f"Updated {updated_count} category summaries"
        }

    # ==================== Stance Analysis Preview/Save ====================

    async def get_current_stance_analysis(
        self,
        report_id: int,
        user_id: int,
    ) -> CurrentStanceAnalysisResult:
        """
        Get current stance analysis for all articles in a report.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)

        Returns:
            CurrentStanceAnalysisResult with all articles and their current stance analysis
        """
        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Get visible associations with articles
        associations = await self.association_service.get_visible_for_report(report_id)

        articles = []
        for assoc in associations:
            if assoc.article:
                # Extract stance analysis from ai_enrichments
                ai_enrichments = assoc.ai_enrichments or {}
                current_stance = ai_enrichments.get('stance_analysis')

                articles.append(CurrentStanceAnalysisItem(
                    article_id=assoc.article_id,
                    association_id=assoc.article_id,  # Composite PK, use article_id as identifier
                    title=assoc.article.title or "Untitled",
                    pmid=assoc.article.pmid,
                    journal=assoc.article.journal,
                    pub_year=assoc.article.pub_year,
                    current_stance=current_stance,
                ))

        return CurrentStanceAnalysisResult(
            report_id=report_id,
            report_name=report.report_name or f"Report {report_id}",
            total_articles=len(articles),
            articles=articles,
        )

    async def preview_stance_analysis(
        self,
        report_id: int,
        user_id: int,
        system_prompt: str,
        user_prompt_template: str,
        llm_config: Optional[Dict[str, Any]] = None,
    ) -> StanceAnalysisPreviewResult:
        """
        Preview stance analysis regeneration without saving.

        Generates new stance analysis using the provided prompt and returns both
        current and new analysis for comparison.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification)
            system_prompt: The system prompt to use
            user_prompt_template: The user prompt template to use
            llm_config: Optional LLM configuration

        Returns:
            StanceAnalysisPreviewResult with previews for each article
        """
        from services.article_analysis_service import analyze_article_stance, build_stance_item
        from schemas.llm import ModelConfig as LLMModelConfig
        import asyncio

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        # Get visible associations with articles
        associations = await self.association_service.get_visible_for_report(report_id)

        if not associations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No articles in report"
            )

        # Filter to articles with abstracts
        articles_with_abstracts = [a for a in associations if a.article and a.article.abstract]

        if not articles_with_abstracts:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No articles with abstracts to analyze"
            )

        # Build model config
        model_config = None
        if llm_config and llm_config.get("model_id"):
            model_config = LLMModelConfig(
                model_id=llm_config.get("model_id"),
                temperature=llm_config.get("temperature"),
                max_tokens=llm_config.get("max_tokens"),
                reasoning_effort=llm_config.get("reasoning_effort"),
            )
        elif stream and stream.llm_config:
            stage_config = stream.llm_config.get("stance_analysis")
            if stage_config and (stage_config.get("model_id") or stage_config.get("model")):
                model_config = LLMModelConfig(
                    model_id=stage_config.get("model_id") or stage_config.get("model"),
                    temperature=stage_config.get("temperature"),
                    max_tokens=stage_config.get("max_tokens"),
                    reasoning_effort=stage_config.get("reasoning_effort"),
                )

        # Build custom prompt dict
        stance_analysis_prompt = {
            "system_prompt": system_prompt,
            "user_prompt_template": user_prompt_template,
        }

        # Build items for batch analysis
        from agents.prompts.llm import LLMOptions
        items = [
            build_stance_item(stream, assoc.article, assoc.ai_summary)
            for assoc in articles_with_abstracts
        ]

        # Run batch analysis
        llm_results = await analyze_article_stance(
            items=items,
            stance_analysis_prompt=stance_analysis_prompt,
            model_config=model_config,
            options=LLMOptions(max_concurrent=5),
        )

        # Map results back to associations
        results = []
        for i, llm_result in enumerate(llm_results):
            assoc = articles_with_abstracts[i]
            if llm_result.ok and llm_result.data:
                results.append((assoc, llm_result.data, None))
            else:
                results.append((assoc, None, llm_result.error))

        # Build preview list
        previews = []
        for assoc, result, error in results:
            # Get current stance from ai_enrichments
            ai_enrichments = assoc.ai_enrichments or {}
            current_stance = ai_enrichments.get('stance_analysis')

            previews.append(StanceAnalysisPreviewItem(
                article_id=assoc.article_id,
                association_id=assoc.article_id,
                title=assoc.article.title or "Untitled",
                pmid=assoc.article.pmid,
                current_stance=current_stance,
                new_stance=result if result else None,
                error=error,
            ))

        return StanceAnalysisPreviewResult(
            report_id=report_id,
            total_articles=len(previews),
            previews=previews,
        )

    async def batch_update_stance_analysis(
        self,
        report_id: int,
        user_id: int,
        updates: List[Dict[str, Any]],
    ) -> BatchStanceUpdateResult:
        """
        Batch update stance analysis.

        Updates only the specified articles with new stance analysis.
        Records a CurationEvent for audit trail.

        Args:
            report_id: The report ID
            user_id: The user ID (for access verification and audit)
            updates: List of dicts with 'article_id' and 'stance_analysis'

        Returns:
            BatchStanceUpdateResult with count of updated articles
        """
        from models import CurationEvent
        from sqlalchemy.orm.attributes import flag_modified

        report, user, stream = await self.get_report_with_access(report_id, user_id)

        # Check approval status
        if report.approval_status == ApprovalStatus.APPROVED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot modify approved reports"
            )

        if not updates:
            return BatchStanceUpdateResult(
                report_id=report_id,
                updated_count=0,
                message="No updates provided",
                statistics={"provided": 0, "updated": 0, "not_found": 0}
            )

        updated_count = 0
        not_found_count = 0

        for update in updates:
            article_id = update.get("article_id")
            new_stance = update.get("stance_analysis")

            if article_id is None:
                continue

            # Get the association
            assoc = await self.association_service.find(report_id, article_id)
            if assoc:
                # Update ai_enrichments with new stance analysis
                ai_enrichments = assoc.ai_enrichments or {}
                ai_enrichments['stance_analysis'] = new_stance
                assoc.ai_enrichments = ai_enrichments
                flag_modified(assoc, "ai_enrichments")
                updated_count += 1
            else:
                not_found_count += 1

        # Record CurationEvent
        event = CurationEvent(
            report_id=report_id,
            event_type='batch_update_stance_analysis',
            field_name='stance_analysis',
            old_value=f"{len(updates)} analyses selected",
            new_value=f"Updated {updated_count} stance analyses",
            notes="Applied custom prompt from Layer 4 testing (selective)",
            curator_id=user_id,
        )
        self.db.add(event)

        # Update curation tracking
        report.has_curation_edits = True
        report.last_curated_by = user_id
        report.last_curated_at = datetime.utcnow()

        await self.db.commit()

        return BatchStanceUpdateResult(
            report_id=report_id,
            updated_count=updated_count,
            message=f"Updated {updated_count} of {len(updates)} stance analyses",
            statistics={
                "provided": len(updates),
                "updated": updated_count,
                "not_found": not_found_count,
            }
        )


# =============================================================================
# Dependency Injection Provider
# =============================================================================

async def get_report_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportService:
    """FastAPI dependency that provides a ReportService with AsyncSession."""
    return ReportService(db)
