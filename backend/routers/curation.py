"""
Curation router - Human review and approval workflow for pipeline outputs

This router handles:
- Viewing pipeline output for curation (getCurationView)
- Including/excluding articles
- Editing report content (title, summaries)
- Approval workflow (approve, reject)
- Curation history/audit trail

All endpoints are under /api/operations/reports/{report_id}/...
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dataclasses import asdict
from datetime import datetime
import logging

from utils.date_utils import format_pub_date
from database import get_async_db
from models import User, UserRole, CurationEvent
from services import auth_service
from services.report_service import ReportService, get_report_service
from services.wip_article_service import WipArticleService, get_wip_article_service
from services.email_service import EmailService
from services.report_summary_service import ReportSummaryService
from schemas.research_stream import PromptTemplate

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/operations/reports", tags=["curation"])


def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
) -> User:
    """Dependency to get the current authenticated user."""
    return current_user


# ==================== Request/Response Models ====================

class UpdateReportContentRequest(BaseModel):
    """Request to update report content (name, summaries)"""
    report_name: Optional[str] = None
    executive_summary: Optional[str] = None
    category_summaries: Optional[Dict[str, str]] = None


class ExcludeArticleRequest(BaseModel):
    """Request to exclude an article from the report"""
    notes: Optional[str] = None


class IncludeArticleRequest(BaseModel):
    """Request to include a filtered article in the report"""
    wip_article_id: int
    category: Optional[str] = None
    notes: Optional[str] = None


class UpdateArticleRequest(BaseModel):
    """Request to update an article within the report (ranking, category, AI summary)"""
    ranking: Optional[int] = None
    category: Optional[str] = None
    ai_summary: Optional[str] = None


class ApproveReportRequest(BaseModel):
    """Request to approve a report"""
    notes: Optional[str] = None


class RejectReportRequest(BaseModel):
    """Request to reject a report"""
    reason: str


class ApprovalRequestRequest(BaseModel):
    """Request to send approval request to an admin"""
    admin_user_id: int


class UpdateWipArticleNotesRequest(BaseModel):
    """Request to update curation notes on a WipArticle"""
    curation_notes: str


class RegenerateSummariesLLMConfig(BaseModel):
    """LLM configuration for regenerate summaries request. All fields optional - service uses defaults."""
    model_config = {"protected_namespaces": ()}  # Allow model_id field

    model_id: Optional[str] = None
    temperature: Optional[float] = None
    max_tokens: Optional[int] = None
    reasoning_effort: Optional[str] = None


class RegenerateSummariesRequest(BaseModel):
    """Request to regenerate summaries using a custom prompt"""
    prompt_type: str  # 'article_summary', 'category_summary', 'executive_summary'
    prompt: PromptTemplate  # Imported from schemas.research_stream
    llm_config: Optional[RegenerateSummariesLLMConfig] = None


class RegenerateSummariesResponse(BaseModel):
    """Response from regenerating summaries"""
    updated_count: int
    message: str
    prompt_type: str


# --- Curation View Response Schemas ---

class CurationReportData(BaseModel):
    """Report content data for curation view"""
    report_id: int
    report_name: str
    original_report_name: Optional[str] = None
    report_date: Optional[str] = None
    approval_status: Optional[str] = None
    executive_summary: str = ""
    original_executive_summary: str = ""
    category_summaries: Dict[str, str] = {}
    original_category_summaries: Dict[str, str] = {}
    has_curation_edits: bool = False
    last_curated_by: Optional[int] = None
    last_curated_at: Optional[str] = None


class CurationIncludedArticle(BaseModel):
    """Included article data (from Article + ReportArticleAssociation + WipArticle)"""
    article_id: int
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str
    authors: Optional[List[str]] = None
    journal: Optional[str] = None
    # Honest date fields
    pub_year: Optional[int] = None
    pub_month: Optional[int] = None
    pub_day: Optional[int] = None
    abstract: Optional[str] = None
    url: Optional[str] = None
    # Association data (how article appears in this report)
    ranking: Optional[int] = None
    original_ranking: Optional[int] = None
    presentation_categories: List[str] = []
    original_presentation_categories: List[str] = []
    ai_summary: Optional[str] = None
    original_ai_summary: Optional[str] = None
    relevance_score: Optional[float] = None
    # Curation data (from WipArticle - audit trail)
    curation_notes: Optional[str] = None
    curated_by: Optional[int] = None
    curated_at: Optional[datetime] = None
    # Source indicator
    curator_added: bool = False
    wip_article_id: Optional[int] = None
    # Filter data (from WipArticle)
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None


class CurationFilteredArticle(BaseModel):
    """Filtered/duplicate/curated article data (from WipArticle)"""
    wip_article_id: int
    pmid: Optional[str] = None
    doi: Optional[str] = None
    title: str
    authors: Optional[List[str]] = None
    journal: Optional[str] = None
    # Honest date fields
    pub_year: Optional[int] = None
    pub_month: Optional[int] = None
    pub_day: Optional[int] = None
    abstract: Optional[str] = None
    url: Optional[str] = None
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None
    passed_semantic_filter: Optional[bool] = None
    is_duplicate: bool = False
    duplicate_of_pmid: Optional[str] = None
    included_in_report: bool = False
    curator_included: bool = False
    curator_excluded: bool = False
    curation_notes: Optional[str] = None


class CurationCategory(BaseModel):
    """Category definition from stream config"""
    id: str
    name: str
    color: Optional[str] = None
    description: Optional[str] = None


class CurationStats(BaseModel):
    """Pipeline and curation statistics"""
    pipeline_included: int
    pipeline_filtered: int
    pipeline_duplicates: int
    current_included: int
    curator_added: int
    curator_removed: int


class CurationViewResponse(BaseModel):
    """Response for get_curation_view endpoint"""
    report: CurationReportData
    included_articles: List[CurationIncludedArticle]
    filtered_articles: List[CurationFilteredArticle]
    duplicate_articles: List[CurationFilteredArticle] = []
    curated_articles: List[CurationFilteredArticle]
    categories: List[CurationCategory]
    stream_name: Optional[str] = None
    stats: CurationStats
    execution_id: Optional[str] = None
    retrieval_config: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    # Configuration snapshots from execution
    enrichment_config: Optional[Dict[str, Any]] = None
    llm_config: Optional[Dict[str, Any]] = None


class CurationEventResponse(BaseModel):
    """A single curation event for the history view"""
    id: int
    event_type: str
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    notes: Optional[str] = None
    article_id: Optional[int] = None
    article_title: Optional[str] = None
    curator_name: str
    created_at: str


class CurationHistoryResponse(BaseModel):
    """Response containing curation history for a report"""
    events: List[CurationEventResponse]
    total_count: int


class ReportConfigResponse(BaseModel):
    """Lightweight response for report configuration (settings modal)"""
    retrieval_config: Optional[Dict[str, Any]] = None
    enrichment_config: Optional[Dict[str, Any]] = None
    llm_config: Optional[Dict[str, Any]] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    stream_name: Optional[str] = None


class ResetCurationResponse(BaseModel):
    """Response for reset_curation endpoint"""
    wip_article_id: int
    reset: bool
    was_curator_included: Optional[bool] = None
    was_curator_excluded: Optional[bool] = None
    pipeline_decision: Optional[bool] = None
    now_in_report: Optional[bool] = None
    message: Optional[str] = None


class UpdateWipArticleNotesResponse(BaseModel):
    """Response for update_wip_article_notes endpoint"""
    wip_article_id: int
    curation_notes: str


class ExcludeArticleResponse(BaseModel):
    """Response for exclude_article endpoint"""
    article_id: int
    excluded: bool
    wip_article_updated: bool
    was_curator_added: bool = False


class IncludeArticleResponse(BaseModel):
    """Response for include_article endpoint"""
    article_id: int
    wip_article_id: int
    included: bool
    ranking: int
    category: Optional[str] = None


class UpdateReportContentResponse(BaseModel):
    """Response for update_report_content endpoint"""
    report_name: str
    executive_summary: str = ""
    category_summaries: Dict[str, str] = {}
    has_curation_edits: bool


class UpdateArticleResponse(BaseModel):
    """Response for update_article_in_report endpoint"""
    article_id: int
    ranking: Optional[int] = None
    presentation_categories: List[str] = []
    ai_summary: Optional[str] = None


class ApproveReportResponse(BaseModel):
    """Response for approve_report endpoint"""
    report_id: int
    approval_status: str
    approved_by: int
    approved_at: str
    emails_queued: int = 0


class RejectReportResponse(BaseModel):
    """Response for reject_report endpoint"""
    report_id: int
    approval_status: str
    rejection_reason: str
    rejected_by: int
    rejected_at: str


# --- Pipeline Analytics Response Schemas ---

class WipArticleAnalyticsResponse(BaseModel):
    """WipArticle data for pipeline analytics response"""
    id: int
    title: str
    retrieval_group_id: str
    is_duplicate: bool
    duplicate_of_id: Optional[int] = None
    passed_semantic_filter: Optional[bool] = None
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None
    included_in_report: bool
    presentation_categories: List[str] = []
    authors: List[str] = []
    journal: Optional[str] = None
    pub_year: Optional[int] = None
    pub_month: Optional[int] = None
    pub_day: Optional[int] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None


class GroupAnalyticsResponse(BaseModel):
    """Analytics for a single retrieval group"""
    group_id: str
    total: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included: int


class PipelineAnalyticsSummaryResponse(BaseModel):
    """Summary counts for pipeline analytics"""
    total_retrieved: int
    duplicates: int
    filtered_out: int
    passed_filter: int
    included_in_report: int


class PipelineAnalyticsResponse(BaseModel):
    """Complete pipeline analytics response"""
    report_id: int
    run_type: Optional[str] = None
    report_date: str
    pipeline_metrics: Optional[Dict[str, Any]] = None
    summary: PipelineAnalyticsSummaryResponse
    by_group: List[GroupAnalyticsResponse]
    filter_reasons: Dict[str, int]
    category_counts: Dict[str, int]
    wip_articles: List[WipArticleAnalyticsResponse]


class RegenerateExecutiveSummaryResponse(BaseModel):
    """Response for regenerating executive summary"""
    executive_summary: str


class RegenerateCategorySummaryResponse(BaseModel):
    """Response for regenerating a category summary"""
    category_id: str
    category_summary: str


class RegenerateArticleSummaryResponse(BaseModel):
    """Response for regenerating an article AI summary"""
    article_id: int
    ai_summary: str


# ==================== Curation View Endpoints ====================

@router.get("/{report_id}/curation", response_model=CurationViewResponse)
async def get_curation_view(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get full curation view for a report.

    Returns all data needed for the curation interface:
    - report: Report content with originals for comparison
    - included_articles: Articles currently in the report
    - filtered_articles: Articles pipeline rejected (available for inclusion)
    - duplicate_articles: Articles marked as duplicates
    - curated_articles: Articles with curator overrides
    - categories: Stream's presentation categories
    - stats: Pipeline and curation statistics
    """
    logger.info(f"get_curation_view - user_id={current_user.user_id}, report_id={report_id}")

    try:
        data = await service.get_curation_view(report_id, current_user.user_id)

        # Build report data - enrichments are stored in JSON fields
        enrichments = data.report.enrichments or {}
        original_enrichments = data.report.original_enrichments or {}

        report_data = CurationReportData(
            report_id=data.report.report_id,
            report_name=data.report.report_name,
            original_report_name=data.report.original_report_name,
            report_date=data.report.report_date.isoformat() if data.report.report_date else None,
            approval_status=data.report.approval_status.value if data.report.approval_status else None,
            executive_summary=enrichments.get('executive_summary', ''),
            original_executive_summary=original_enrichments.get('executive_summary', ''),
            category_summaries=enrichments.get('category_summaries', {}),
            original_category_summaries=original_enrichments.get('category_summaries', {}),
            has_curation_edits=data.report.has_curation_edits or False,
            last_curated_by=data.report.last_curated_by,
            last_curated_at=data.report.last_curated_at.isoformat() if data.report.last_curated_at else None,
        )

        # Convert IncludedArticleData to CurationIncludedArticle
        included_articles = [
            CurationIncludedArticle(
                article_id=item.article.article_id,
                pmid=item.article.pmid,
                doi=item.article.doi,
                title=item.article.title,
                authors=item.article.authors,
                journal=item.article.journal,
                pub_year=item.article.pub_year,
                pub_month=item.article.pub_month,
                pub_day=item.article.pub_day,
                abstract=item.article.abstract,
                url=item.article.url,
                ranking=item.association.ranking,
                original_ranking=item.association.original_ranking,
                presentation_categories=item.association.presentation_categories or [],
                original_presentation_categories=item.association.original_presentation_categories or [],
                ai_summary=item.association.ai_summary,
                original_ai_summary=item.association.original_ai_summary,
                relevance_score=item.association.relevance_score,
                curation_notes=item.curation_notes,
                curated_by=item.curated_by,
                curated_at=item.curated_at,
                curator_added=item.association.curator_added or False,
                wip_article_id=item.wip_article_id,
                filter_score=item.filter_score,
                filter_score_reason=item.filter_score_reason,
            )
            for item in data.included_articles
        ]

        # Convert WipArticle models to CurationFilteredArticle
        def wip_to_filtered(wip) -> CurationFilteredArticle:
            return CurationFilteredArticle(
                wip_article_id=wip.id,
                pmid=wip.pmid,
                doi=wip.doi,
                title=wip.title,
                authors=wip.authors,
                journal=wip.journal,
                pub_year=wip.pub_year,
                pub_month=wip.pub_month,
                pub_day=wip.pub_day,
                abstract=wip.abstract,
                url=wip.url,
                filter_score=wip.filter_score,
                filter_score_reason=wip.filter_score_reason,
                passed_semantic_filter=wip.passed_semantic_filter,
                is_duplicate=wip.is_duplicate or False,
                duplicate_of_pmid=wip.duplicate_of_pmid,
                included_in_report=wip.included_in_report or False,
                curator_included=wip.curator_included or False,
                curator_excluded=wip.curator_excluded or False,
                curation_notes=wip.curation_notes,
            )

        filtered_articles = [wip_to_filtered(wip) for wip in data.filtered_articles]
        curated_articles = [wip_to_filtered(wip) for wip in data.curated_articles]

        # Build categories
        categories = [
            CurationCategory(id=cat["id"], name=cat["name"])
            for cat in data.categories
        ]

        # Build stats
        stats = CurationStats(
            pipeline_included=data.stats.pipeline_included,
            pipeline_filtered=data.stats.pipeline_filtered,
            pipeline_duplicates=data.stats.pipeline_duplicates,
            current_included=data.stats.current_included,
            curator_added=data.stats.curator_added,
            curator_removed=data.stats.curator_removed,
        )

        logger.info(f"get_curation_view complete - user_id={current_user.user_id}, report_id={report_id}")

        # Get config snapshots - prefer execution snapshot, fall back to current stream config
        enrichment_config = None
        llm_config = None
        if data.execution:
            enrichment_config = data.execution.enrichment_config
            llm_config = data.execution.llm_config
        if not enrichment_config and data.stream:
            enrichment_config = data.stream.enrichment_config
        if not llm_config and data.stream:
            llm_config = data.stream.llm_config

        return CurationViewResponse(
            report=report_data,
            included_articles=included_articles,
            filtered_articles=filtered_articles,
            duplicate_articles=[],
            curated_articles=curated_articles,
            categories=categories,
            stream_name=data.stream.stream_name if data.stream else None,
            stats=stats,
            execution_id=str(data.execution.id) if data.execution else None,
            retrieval_config=data.execution.retrieval_config if data.execution else None,
            start_date=data.execution.start_date if data.execution else None,
            end_date=data.execution.end_date if data.execution else None,
            enrichment_config=enrichment_config,
            llm_config=llm_config,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_curation_view failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get curation view: {str(e)}"
        )


@router.get("/{report_id}/curation/history", response_model=CurationHistoryResponse)
async def get_curation_history(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get curation history (audit trail) for a report.
    Returns all curation events in reverse chronological order.
    """
    logger.info(f"get_curation_history - user_id={current_user.user_id}, report_id={report_id}")

    try:
        data = await service.get_curation_history(report_id, current_user.user_id)

        # Convert dataclass to response schema
        event_responses = [
            CurationEventResponse(**asdict(event))
            for event in data.events
        ]

        logger.info(f"get_curation_history complete - user_id={current_user.user_id}, report_id={report_id}, events={len(event_responses)}")
        return CurationHistoryResponse(
            events=event_responses,
            total_count=data.total_count,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_curation_history failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get curation history: {str(e)}"
        )


@router.get("/{report_id}/config", response_model=ReportConfigResponse)
async def get_report_config(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get lightweight configuration for a report.

    Returns just the configuration data needed for the settings modal:
    - retrieval_config: PubMed query and semantic filter settings
    - enrichment_config: Custom prompts for AI summaries
    - llm_config: Model selection per pipeline stage
    - start_date, end_date: Date range for the retrieval
    - stream_name: Name of the research stream
    """
    logger.info(f"get_report_config - user_id={current_user.user_id}, report_id={report_id}")

    try:
        data = await service.get_report_config(report_id, current_user.user_id)

        logger.info(f"get_report_config complete - user_id={current_user.user_id}, report_id={report_id}")
        return ReportConfigResponse(
            retrieval_config=data.retrieval_config,
            enrichment_config=data.enrichment_config,
            llm_config=data.llm_config,
            start_date=data.start_date,
            end_date=data.end_date,
            stream_name=data.stream_name,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_report_config failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get report config: {str(e)}"
        )


@router.get("/{report_id}/pipeline-analytics", response_model=PipelineAnalyticsResponse)
async def get_pipeline_analytics(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """Get pipeline analytics for a report - detailed breakdown of filtering decisions."""
    logger.info(f"get_pipeline_analytics - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.get_pipeline_analytics(report_id, current_user.user_id)

        logger.info(f"get_pipeline_analytics complete - user_id={current_user.user_id}, report_id={report_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_pipeline_analytics failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get pipeline analytics: {str(e)}"
        )


# ==================== Article Management Endpoints ====================

@router.post("/{report_id}/articles/{article_id}/exclude", response_model=ExcludeArticleResponse)
async def exclude_article(
    report_id: int,
    article_id: int,
    request: ExcludeArticleRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Curator excludes an article from the report.

    - Deletes ReportArticleAssociation
    - Updates WipArticle: included_in_report=False, curator_excluded=True
    """
    logger.info(f"exclude_article - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        result = await service.exclude_article(
            report_id=report_id,
            article_id=article_id,
            user_id=current_user.user_id,
            notes=request.notes
        )
        logger.info(f"exclude_article complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return ExcludeArticleResponse(**asdict(result))

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"exclude_article failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to exclude article: {str(e)}"
        )


@router.post("/{report_id}/articles/include", response_model=IncludeArticleResponse)
async def include_article(
    report_id: int,
    request: IncludeArticleRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Curator includes a filtered article into the report.

    - Creates/finds Article record
    - Creates ReportArticleAssociation
    - Updates WipArticle: included_in_report=True, curator_included=True
    """
    logger.info(f"include_article - user_id={current_user.user_id}, report_id={report_id}, wip_article_id={request.wip_article_id}")

    try:
        result = await service.include_article(
            report_id=report_id,
            wip_article_id=request.wip_article_id,
            user_id=current_user.user_id,
            category=request.category,
            notes=request.notes
        )
        logger.info(f"include_article complete - user_id={current_user.user_id}, report_id={report_id}, article_id={result.article_id}")
        return IncludeArticleResponse(**asdict(result))

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"include_article failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to include article: {str(e)}"
        )


@router.post("/{report_id}/articles/{wip_article_id}/reset-curation", response_model=ResetCurationResponse)
async def reset_curation(
    report_id: int,
    wip_article_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Reset a curator's include/exclude decision back to pipeline's original decision.

    This is the "undo" operation for curator include/exclude actions.
    - Clears both curator_included and curator_excluded flags
    - Restores included_in_report based on pipeline's original decision
    """
    logger.info(f"reset_curation - user_id={current_user.user_id}, report_id={report_id}, wip_article_id={wip_article_id}")

    try:
        result = await service.reset_curation(
            report_id=report_id,
            wip_article_id=wip_article_id,
            user_id=current_user.user_id
        )
        logger.info(f"reset_curation complete - user_id={current_user.user_id}, report_id={report_id}")
        return ResetCurationResponse(**asdict(result))

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reset_curation failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reset curation: {str(e)}"
        )


@router.patch("/{report_id}/wip-articles/{wip_article_id}/notes", response_model=UpdateWipArticleNotesResponse)
async def update_wip_article_notes(
    report_id: int,
    wip_article_id: int,
    request: UpdateWipArticleNotesRequest,
    service: ReportService = Depends(get_report_service),
    wip_service: WipArticleService = Depends(get_wip_article_service),
    current_user: User = Depends(get_current_user)
):
    """
    Update curation notes on a WipArticle.

    Curation notes document the curator's reasoning for including/excluding an article.
    This is the single source of truth for curation notes - works for both included
    and filtered articles.

    The report_id is used to verify user has access to this report's curation.
    """
    logger.info(f"update_wip_article_notes - user_id={current_user.user_id}, report_id={report_id}, wip_article_id={wip_article_id}")

    try:
        # Verify user has access to this report (raises 404 if not found)
        await service.get_report_with_access(report_id, current_user.user_id)

        # Update the WipArticle curation notes
        article = await wip_service.update_curation_notes(
            wip_article_id=wip_article_id,
            user_id=current_user.user_id,
            notes=request.curation_notes
        )

        logger.info(f"update_wip_article_notes complete - user_id={current_user.user_id}, wip_article_id={wip_article_id}")
        return UpdateWipArticleNotesResponse(
            wip_article_id=article.id,
            curation_notes=article.curation_notes or ""
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_wip_article_notes failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update curation notes: {str(e)}"
        )


@router.patch("/{report_id}/articles/{article_id}", response_model=UpdateArticleResponse)
async def update_article_in_report(
    report_id: int,
    article_id: int,
    request: UpdateArticleRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Edit an article within the report (ranking, category, AI summary).
    """
    logger.info(f"update_article_in_report - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        result = await service.update_article_in_report(
            report_id=report_id,
            article_id=article_id,
            user_id=current_user.user_id,
            ranking=request.ranking,
            category=request.category,
            ai_summary=request.ai_summary
        )
        logger.info(f"update_article_in_report complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return UpdateArticleResponse(
            article_id=result.article_id,
            ranking=result.ranking,
            presentation_categories=result.presentation_categories,
            ai_summary=result.ai_summary,
        )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_article_in_report failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update article: {str(e)}"
        )


# ==================== Report Content Endpoints ====================

@router.patch("/{report_id}/content", response_model=UpdateReportContentResponse)
async def update_report_content(
    report_id: int,
    request: UpdateReportContentRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """Update report content (title, executive summary, category summaries)."""
    logger.info(f"update_report_content - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.update_report_content(
            report_id=report_id,
            user_id=current_user.user_id,
            report_name=request.report_name,
            executive_summary=request.executive_summary,
            category_summaries=request.category_summaries
        )
        logger.info(f"update_report_content complete - user_id={current_user.user_id}, report_id={report_id}")
        return UpdateReportContentResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_report_content failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update report content: {str(e)}"
        )


# ==================== Approval Workflow Endpoints ====================

@router.post("/{report_id}/request-approval")
async def send_approval_request(
    report_id: int,
    request: ApprovalRequestRequest,
    db: AsyncSession = Depends(get_async_db),
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Send an approval request email to an admin.
    """
    logger.info(f"send_approval_request - user_id={current_user.user_id}, report_id={report_id}, admin_id={request.admin_user_id}")

    try:
        # Raises 404 if not found or no access
        report, user, stream = await service.get_report_with_access(report_id, current_user.user_id)

        # Get admin user using service
        admin = await service.user_service.get_user_by_id(request.admin_user_id)

        if not admin:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin user not found"
            )

        if not admin.is_active:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Admin user not found"
            )

        # Verify admin has appropriate role
        if admin.role not in (UserRole.PLATFORM_ADMIN, UserRole.ORG_ADMIN):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User is not an admin"
            )

        # Get article count
        article_count = await service.association_service.count_visible(report_id)

        # Send the email
        email_service = EmailService()
        await email_service.send_approval_request_email(
            recipient_email=admin.email,
            recipient_name=admin.full_name or admin.email,
            report_id=report.report_id,
            report_name=report.report_name,
            stream_name=stream.stream_name if stream else "Unknown",
            article_count=article_count,
            requester_name=user.full_name or user.email,
        )

        logger.info(f"send_approval_request complete - user_id={current_user.user_id}, report_id={report_id}, admin_id={request.admin_user_id}")
        return {"success": True, "message": f"Approval request sent to {admin.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"send_approval_request failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to send approval request: {str(e)}"
        )


@router.post("/{report_id}/approve", response_model=ApproveReportResponse)
async def approve_report(
    report_id: int,
    request: Optional[ApproveReportRequest] = None,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Approve a report for distribution.
    Only admins can approve reports.
    """
    logger.info(f"approve_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.approve_report(
            report_id=report_id,
            user_id=current_user.user_id,
            notes=request.notes if request else None
        )
        logger.info(f"approve_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return ApproveReportResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"approve_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to approve report: {str(e)}"
        )


@router.post("/{report_id}/reject", response_model=RejectReportResponse)
async def reject_report(
    report_id: int,
    request: RejectReportRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Reject a report with a reason.
    Only admins can reject reports.
    """
    logger.info(f"reject_report - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.reject_report(
            report_id=report_id,
            user_id=current_user.user_id,
            reason=request.reason
        )
        logger.info(f"reject_report complete - user_id={current_user.user_id}, report_id={report_id}")
        return RejectReportResponse(**asdict(result))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"reject_report failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to reject report: {str(e)}"
        )


# ==================== Regeneration Endpoints ====================

@router.post("/{report_id}/regenerate/executive-summary", response_model=RegenerateExecutiveSummaryResponse)
async def regenerate_executive_summary(
    report_id: int,
    db: AsyncSession = Depends(get_async_db),
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Regenerate the executive summary for a report using AI.
    Uses the stream's enrichment config (custom prompts) if available.
    """
    logger.info(f"regenerate_executive_summary - user_id={current_user.user_id}, report_id={report_id}")

    try:
        summary_service = ReportSummaryService()

        # Get report and stream via async curation view
        curation_data = await service.get_curation_view(report_id, current_user.user_id)
        report = curation_data.report
        stream = curation_data.stream

        # Get enrichment config from stream
        enrichment_config = stream.enrichment_config if stream else None

        # Get visible articles for the report
        visible_associations = await service.association_service.get_visible_for_report(report_id)

        # Build article list from associations
        wip_articles = []
        for assoc in visible_associations:
            if assoc.article:
                wip_articles.append(assoc.article)

        # Get existing category summaries
        enrichments = report.enrichments or {}
        category_summaries = enrichments.get('category_summaries', {})

        # Generate new executive summary
        new_summary = await summary_service.generate_executive_summary(
            wip_articles=wip_articles,
            stream_purpose=stream.purpose if stream else "",
            category_summaries=category_summaries,
            stream_name=stream.stream_name if stream else "",
            enrichment_config=enrichment_config
        )

        # Save to report enrichments
        enrichments['executive_summary'] = new_summary
        report.enrichments = enrichments
        await db.commit()

        logger.info(f"regenerate_executive_summary complete - user_id={current_user.user_id}, report_id={report_id}")
        return RegenerateExecutiveSummaryResponse(executive_summary=new_summary)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"regenerate_executive_summary failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate executive summary: {str(e)}"
        )


@router.post("/{report_id}/regenerate/category-summary/{category_id}", response_model=RegenerateCategorySummaryResponse)
async def regenerate_category_summary(
    report_id: int,
    category_id: str,
    db: AsyncSession = Depends(get_async_db),
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Regenerate a specific category summary for a report using AI.
    Uses the stream's enrichment config (custom prompts) if available.
    """
    logger.info(f"regenerate_category_summary - user_id={current_user.user_id}, report_id={report_id}, category_id={category_id}")

    try:
        summary_service = ReportSummaryService()

        # Get report and stream
        curation_data = await service.get_curation_view(report_id, current_user.user_id)
        report = curation_data.report
        stream = curation_data.stream

        # Get enrichment config from stream
        enrichment_config = stream.enrichment_config if stream else None

        # Get category config from presentation_config
        category_config = None
        categories = stream.presentation_config.get('categories', []) if stream and stream.presentation_config else []
        for cat in categories:
            if cat.get('id') == category_id:
                category_config = cat
                break

        if not category_config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Category '{category_id}' not found"
            )

        # Get visible articles for this category
        visible_associations = await service.association_service.get_visible_for_report(report_id)
        category_articles = []
        for assoc in visible_associations:
            if assoc.article and assoc.presentation_categories:
                if category_id in assoc.presentation_categories:
                    category_articles.append(assoc.article)

        # Get article AI summaries for this category
        article_summaries = []
        for assoc in visible_associations:
            if assoc.presentation_categories and category_id in assoc.presentation_categories:
                if assoc.ai_summary:
                    article_summaries.append(assoc.ai_summary)

        # Build category description
        category_description = category_config.get('description', '')
        if category_config.get('specific_inclusions'):
            category_description += " Includes: " + ", ".join(category_config['specific_inclusions'])

        # Generate new category summary
        new_summary = await summary_service.generate_category_summary(
            category_name=category_config.get('name', category_id),
            category_description=category_description,
            wip_articles=category_articles,
            stream_purpose=stream.purpose if stream else "",
            stream_name=stream.stream_name if stream else "",
            category_topics=category_config.get('topics'),
            enrichment_config=enrichment_config,
            article_summaries=article_summaries
        )

        # Save to report enrichments
        enrichments = report.enrichments or {}
        category_summaries = enrichments.get('category_summaries', {})
        category_summaries[category_id] = new_summary
        enrichments['category_summaries'] = category_summaries
        report.enrichments = enrichments
        await db.commit()

        logger.info(f"regenerate_category_summary complete - user_id={current_user.user_id}, report_id={report_id}, category_id={category_id}")
        return RegenerateCategorySummaryResponse(category_id=category_id, category_summary=new_summary)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"regenerate_category_summary failed - user_id={current_user.user_id}, report_id={report_id}, category_id={category_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate category summary: {str(e)}"
        )


@router.post("/{report_id}/articles/{article_id}/regenerate-summary", response_model=RegenerateArticleSummaryResponse)
async def regenerate_article_summary(
    report_id: int,
    article_id: int,
    db: AsyncSession = Depends(get_async_db),
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Regenerate the AI summary for a specific article in the report.
    Uses the stream's enrichment config (custom prompts) if available.
    """
    logger.info(f"regenerate_article_summary - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")

    try:
        summary_service = ReportSummaryService()

        # Get report and stream
        curation_data = await service.get_curation_view(report_id, current_user.user_id)
        stream = curation_data.stream

        # Get enrichment config from stream
        enrichment_config = stream.enrichment_config if stream else None

        # Get the article association (raises ValueError if not found)
        association = await service.association_service.get(report_id, article_id)
        if not association.article:
            raise ValueError(f"Article {article_id} has no article data")

        article = association.article

        # Build item dict for the new API
        item = {
            "title": article.title or "Untitled",
            "authors": summary_service.format_authors(article.authors),
            "journal": article.journal or "Unknown",
            "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day) or "Unknown",
            "abstract": article.abstract or "",
            "filter_reason": association.wip_article.filter_score_reason if association.wip_article else "",
            "stream_name": stream.stream_name if stream else "",
            "stream_purpose": stream.purpose if stream else "",
        }

        # Generate new article summary
        result = await summary_service.generate_article_summary(
            items=item,
            enrichment_config=enrichment_config
        )

        # Extract summary from result
        if not result.ok or not result.data:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate summary: {result.error or 'Unknown error'}"
            )

        new_summary = result.data

        # Save to association
        association.ai_summary = new_summary
        await db.commit()

        logger.info(f"regenerate_article_summary complete - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}")
        return RegenerateArticleSummaryResponse(article_id=article_id, ai_summary=new_summary)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"regenerate_article_summary failed - user_id={current_user.user_id}, report_id={report_id}, article_id={article_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate article summary: {str(e)}"
        )


@router.post("/{report_id}/regenerate-summaries", response_model=RegenerateSummariesResponse)
async def regenerate_summaries_with_prompt(
    report_id: int,
    request: RegenerateSummariesRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Regenerate summaries for a report using a custom prompt.

    This endpoint allows users to apply a tested prompt to regenerate:
    - article_summary: All article AI summaries in the report
    - category_summary: All category summaries in the report
    - executive_summary: The executive summary

    Records a CurationEvent for audit trail.
    Only allowed for non-approved reports.
    """
    logger.info(f"regenerate_summaries_with_prompt - user_id={current_user.user_id}, report_id={report_id}, prompt_type={request.prompt_type}")

    try:
        # Build llm_config dict if provided
        llm_config = None
        if request.llm_config:
            llm_config = {
                "model_id": request.llm_config.model_id,
                "temperature": request.llm_config.temperature,
                "max_tokens": request.llm_config.max_tokens,
                "reasoning_effort": request.llm_config.reasoning_effort,
            }

        result = await service.regenerate_summaries_with_prompt(
            report_id=report_id,
            user_id=current_user.user_id,
            prompt_type=request.prompt_type,
            system_prompt=request.prompt.system_prompt,
            user_prompt_template=request.prompt.user_prompt_template,
            llm_config=llm_config,
        )

        logger.info(f"regenerate_summaries_with_prompt complete - user_id={current_user.user_id}, report_id={report_id}, prompt_type={request.prompt_type}, updated={result.updated_count}")

        return RegenerateSummariesResponse(
            updated_count=result.updated_count,
            message=result.message,
            prompt_type=result.prompt_type,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"regenerate_summaries_with_prompt failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to regenerate summaries: {str(e)}"
        )


# ==================== Article Summary Preview & Batch Update ====================

class CurrentArticleSummaryItem(BaseModel):
    """Current article summary info."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str] = None
    journal: Optional[str] = None
    pub_year: Optional[int] = None
    current_summary: Optional[str] = None


class CurrentArticleSummariesResponse(BaseModel):
    """Response for fetching current article summaries."""
    report_id: int
    report_name: str
    total_articles: int
    articles: List[CurrentArticleSummaryItem]


@router.get("/{report_id}/summaries/current", response_model=CurrentArticleSummariesResponse)
async def get_current_article_summaries(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get current article summaries for a report (no generation).

    Fetches all current article summaries for display in a review modal
    before generating new summaries.
    """
    logger.info(f"get_current_article_summaries - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.get_current_article_summaries(
            report_id=report_id,
            user_id=current_user.user_id,
        )

        logger.info(f"get_current_article_summaries complete - user_id={current_user.user_id}, report_id={report_id}, count={result.total_articles}")

        return CurrentArticleSummariesResponse(
            report_id=result.report_id,
            report_name=result.report_name,
            total_articles=result.total_articles,
            articles=[
                CurrentArticleSummaryItem(
                    article_id=a.article_id,
                    association_id=a.association_id,
                    title=a.title,
                    pmid=a.pmid,
                    journal=a.journal,
                    pub_year=a.pub_year,
                    current_summary=a.current_summary,
                )
                for a in result.articles
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_current_article_summaries failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch summaries: {str(e)}"
        )


class CurrentCategorySummaryItem(BaseModel):
    """Current category summary info."""
    category_id: str
    category_name: str
    current_summary: Optional[str] = None


class CurrentCategorySummariesResponse(BaseModel):
    """Response for fetching current category summaries."""
    report_id: int
    report_name: str
    total_categories: int
    categories: List[CurrentCategorySummaryItem]


@router.get("/{report_id}/category-summaries/current", response_model=CurrentCategorySummariesResponse)
async def get_current_category_summaries(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get current category summaries for a report (no generation).

    Fetches all current category summaries for display in a review modal
    before generating new summaries.
    """
    logger.info(f"get_current_category_summaries - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.get_current_category_summaries(
            report_id=report_id,
            user_id=current_user.user_id,
        )

        logger.info(f"get_current_category_summaries complete - user_id={current_user.user_id}, report_id={report_id}, count={result.total_categories}")

        return CurrentCategorySummariesResponse(
            report_id=result.report_id,
            report_name=result.report_name,
            total_categories=result.total_categories,
            categories=[
                CurrentCategorySummaryItem(
                    category_id=c.category_id,
                    category_name=c.category_name,
                    current_summary=c.current_summary,
                )
                for c in result.categories
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_current_category_summaries failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch category summaries: {str(e)}"
        )


class CurrentExecutiveSummaryResponse(BaseModel):
    """Response for fetching current executive summary."""
    report_id: int
    report_name: str
    current_summary: Optional[str] = None


@router.get("/{report_id}/executive-summary/current", response_model=CurrentExecutiveSummaryResponse)
async def get_current_executive_summary(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get current executive summary for a report (no generation).

    Fetches the current executive summary for display in a review modal
    before generating a new summary.
    """
    logger.info(f"get_current_executive_summary - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.get_current_executive_summary(
            report_id=report_id,
            user_id=current_user.user_id,
        )

        logger.info(f"get_current_executive_summary complete - user_id={current_user.user_id}, report_id={report_id}")

        return CurrentExecutiveSummaryResponse(
            report_id=result.report_id,
            report_name=result.report_name,
            current_summary=result.current_summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_current_executive_summary failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch executive summary: {str(e)}"
        )


class PreviewArticleSummariesRequest(BaseModel):
    """Request schema for previewing article summary regeneration."""
    prompt: PromptTemplate
    llm_config: Optional[RegenerateSummariesLLMConfig] = None


class ArticleSummaryPreviewItem(BaseModel):
    """Preview of a single article's summary regeneration."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str] = None
    current_summary: Optional[str] = None
    new_summary: Optional[str] = None
    error: Optional[str] = None


class PreviewArticleSummariesResponse(BaseModel):
    """Response for article summary preview."""
    report_id: int
    total_articles: int
    previews: List[ArticleSummaryPreviewItem]


class BatchUpdateSummaryItem(BaseModel):
    """A single article summary to update."""
    article_id: int
    ai_summary: str


class BatchUpdateSummariesRequest(BaseModel):
    """Request for batch updating article summaries."""
    updates: List[BatchUpdateSummaryItem]


class BatchUpdateSummariesResponse(BaseModel):
    """Response for batch summary update."""
    report_id: int
    updated_count: int
    message: str
    statistics: Dict[str, int]


@router.post("/{report_id}/summaries/preview", response_model=PreviewArticleSummariesResponse)
async def preview_article_summaries(
    report_id: int,
    request: PreviewArticleSummariesRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Preview article summary regeneration without saving.

    Generates new summaries using the provided prompt and returns both
    current and new summaries for comparison. Does NOT save to database.
    """
    logger.info(f"preview_article_summaries - user_id={current_user.user_id}, report_id={report_id}")

    try:
        llm_config = None
        if request.llm_config:
            llm_config = {
                "model_id": request.llm_config.model_id,
                "temperature": request.llm_config.temperature,
                "max_tokens": request.llm_config.max_tokens,
                "reasoning_effort": request.llm_config.reasoning_effort,
            }

        result = await service.preview_article_summaries(
            report_id=report_id,
            user_id=current_user.user_id,
            system_prompt=request.prompt.system_prompt,
            user_prompt_template=request.prompt.user_prompt_template,
            llm_config=llm_config,
        )

        logger.info(f"preview_article_summaries complete - user_id={current_user.user_id}, report_id={report_id}, count={result.total_articles}")

        return PreviewArticleSummariesResponse(
            report_id=result.report_id,
            total_articles=result.total_articles,
            previews=[
                ArticleSummaryPreviewItem(
                    article_id=p.article_id,
                    association_id=p.association_id,
                    title=p.title,
                    pmid=p.pmid,
                    current_summary=p.current_summary,
                    new_summary=p.new_summary,
                    error=p.error,
                )
                for p in result.previews
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"preview_article_summaries failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview summaries: {str(e)}"
        )


@router.post("/{report_id}/summaries/batch-update", response_model=BatchUpdateSummariesResponse)
async def batch_update_article_summaries(
    report_id: int,
    request: BatchUpdateSummariesRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Batch update selected article summaries.

    Updates only the specified articles with new summaries.
    Records a CurationEvent for audit trail.
    """
    logger.info(f"batch_update_article_summaries - user_id={current_user.user_id}, report_id={report_id}, count={len(request.updates)}")

    try:
        updates = [
            {"article_id": u.article_id, "ai_summary": u.ai_summary}
            for u in request.updates
        ]

        result = await service.batch_update_article_summaries(
            report_id=report_id,
            user_id=current_user.user_id,
            updates=updates,
        )

        logger.info(f"batch_update_article_summaries complete - user_id={current_user.user_id}, report_id={report_id}, updated={result.updated_count}")

        return BatchUpdateSummariesResponse(
            report_id=result.report_id,
            updated_count=result.updated_count,
            message=result.message,
            statistics=result.statistics,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"batch_update_article_summaries failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update summaries: {str(e)}"
        )


# ==================== Executive Summary Preview/Save ====================

class ExecutiveSummaryPreviewResponse(BaseModel):
    """Response for executive summary preview."""
    report_id: int
    report_name: str
    current_summary: Optional[str] = None
    new_summary: Optional[str] = None
    error: Optional[str] = None


class SaveExecutiveSummaryRequest(BaseModel):
    """Request to save executive summary."""
    summary: str


class SaveExecutiveSummaryResponse(BaseModel):
    """Response for saving executive summary."""
    report_id: int
    updated: bool
    message: str


@router.post("/{report_id}/executive-summary/preview", response_model=ExecutiveSummaryPreviewResponse)
async def preview_executive_summary(
    report_id: int,
    request: PreviewArticleSummariesRequest,  # Reuse - same structure (prompt + llm_config)
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Preview executive summary regeneration without saving.
    """
    logger.info(f"preview_executive_summary - user_id={current_user.user_id}, report_id={report_id}")

    try:
        llm_config = None
        if request.llm_config:
            llm_config = {
                "model_id": request.llm_config.model_id,
                "temperature": request.llm_config.temperature,
                "max_tokens": request.llm_config.max_tokens,
                "reasoning_effort": request.llm_config.reasoning_effort,
            }

        result = await service.preview_executive_summary(
            report_id=report_id,
            user_id=current_user.user_id,
            system_prompt=request.prompt.system_prompt,
            user_prompt_template=request.prompt.user_prompt_template,
            llm_config=llm_config,
        )

        logger.info(f"preview_executive_summary complete - user_id={current_user.user_id}, report_id={report_id}")

        return ExecutiveSummaryPreviewResponse(
            report_id=result.report_id,
            report_name=result.report_name,
            current_summary=result.current_summary,
            new_summary=result.new_summary,
            error=result.error,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"preview_executive_summary failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview executive summary: {str(e)}"
        )


@router.post("/{report_id}/executive-summary/save", response_model=SaveExecutiveSummaryResponse)
async def save_executive_summary(
    report_id: int,
    request: SaveExecutiveSummaryRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Save a new executive summary to the report.
    """
    logger.info(f"save_executive_summary - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.save_executive_summary(
            report_id=report_id,
            user_id=current_user.user_id,
            new_summary=request.summary,
        )

        logger.info(f"save_executive_summary complete - user_id={current_user.user_id}, report_id={report_id}")

        return SaveExecutiveSummaryResponse(
            report_id=result["report_id"],
            updated=result["updated"],
            message=result["message"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"save_executive_summary failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save executive summary: {str(e)}"
        )


# ==================== Category Summaries Preview/Save ====================

class CategorySummaryPreviewItem(BaseModel):
    """Preview of a single category summary."""
    category_id: str
    category_name: str
    current_summary: Optional[str] = None
    new_summary: Optional[str] = None
    error: Optional[str] = None


class CategorySummariesPreviewResponse(BaseModel):
    """Response for category summaries preview."""
    report_id: int
    report_name: str
    total_categories: int
    previews: List[CategorySummaryPreviewItem]


class SaveCategorySummaryItem(BaseModel):
    """A single category summary to save."""
    category_id: str
    summary: str


class SaveCategorySummariesRequest(BaseModel):
    """Request to save category summaries."""
    updates: List[SaveCategorySummaryItem]


class SaveCategorySummariesResponse(BaseModel):
    """Response for saving category summaries."""
    report_id: int
    updated_count: int
    message: str


@router.post("/{report_id}/category-summaries/preview", response_model=CategorySummariesPreviewResponse)
async def preview_category_summaries(
    report_id: int,
    request: PreviewArticleSummariesRequest,  # Reuse - same structure (prompt + llm_config)
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Preview category summaries regeneration without saving.
    """
    logger.info(f"preview_category_summaries - user_id={current_user.user_id}, report_id={report_id}")

    try:
        llm_config = None
        if request.llm_config:
            llm_config = {
                "model_id": request.llm_config.model_id,
                "temperature": request.llm_config.temperature,
                "max_tokens": request.llm_config.max_tokens,
                "reasoning_effort": request.llm_config.reasoning_effort,
            }

        result = await service.preview_category_summaries(
            report_id=report_id,
            user_id=current_user.user_id,
            system_prompt=request.prompt.system_prompt,
            user_prompt_template=request.prompt.user_prompt_template,
            llm_config=llm_config,
        )

        logger.info(f"preview_category_summaries complete - user_id={current_user.user_id}, report_id={report_id}, count={result.total_categories}")

        return CategorySummariesPreviewResponse(
            report_id=result.report_id,
            report_name=result.report_name,
            total_categories=result.total_categories,
            previews=[
                CategorySummaryPreviewItem(
                    category_id=p.category_id,
                    category_name=p.category_name,
                    current_summary=p.current_summary,
                    new_summary=p.new_summary,
                    error=p.error,
                )
                for p in result.previews
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"preview_category_summaries failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview category summaries: {str(e)}"
        )


@router.post("/{report_id}/category-summaries/save", response_model=SaveCategorySummariesResponse)
async def save_category_summaries(
    report_id: int,
    request: SaveCategorySummariesRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Save selected category summaries to the report.
    """
    logger.info(f"save_category_summaries - user_id={current_user.user_id}, report_id={report_id}, count={len(request.updates)}")

    try:
        updates = [
            {"category_id": u.category_id, "summary": u.summary}
            for u in request.updates
        ]

        result = await service.save_category_summaries(
            report_id=report_id,
            user_id=current_user.user_id,
            updates=updates,
        )

        logger.info(f"save_category_summaries complete - user_id={current_user.user_id}, report_id={report_id}, updated={result['updated_count']}")

        return SaveCategorySummariesResponse(
            report_id=result["report_id"],
            updated_count=result["updated_count"],
            message=result["message"],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"save_category_summaries failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save category summaries: {str(e)}"
        )


# ==================== Stance Analysis Preview/Save ====================

class CurrentStanceAnalysisItem(BaseModel):
    """Current stance analysis for a single article."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str] = None
    journal: Optional[str] = None
    pub_year: Optional[int] = None
    current_stance: Optional[Dict[str, Any]] = None


class CurrentStanceAnalysisResponse(BaseModel):
    """Response for getting current stance analysis."""
    report_id: int
    report_name: str
    total_articles: int
    articles: List[CurrentStanceAnalysisItem]


class StanceAnalysisPreviewItem(BaseModel):
    """Preview of a single article's stance analysis."""
    article_id: int
    association_id: int
    title: str
    pmid: Optional[str] = None
    current_stance: Optional[Dict[str, Any]] = None
    new_stance: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class PreviewStanceAnalysisResponse(BaseModel):
    """Response for stance analysis preview."""
    report_id: int
    total_articles: int
    previews: List[StanceAnalysisPreviewItem]


class BatchUpdateStanceItem(BaseModel):
    """A single stance analysis to update."""
    article_id: int
    stance_analysis: Dict[str, Any]


class BatchUpdateStanceRequest(BaseModel):
    """Request for batch updating stance analysis."""
    updates: List[BatchUpdateStanceItem]


class BatchUpdateStanceResponse(BaseModel):
    """Response for batch stance analysis update."""
    report_id: int
    updated_count: int
    message: str
    statistics: Dict[str, int]


@router.get("/{report_id}/stance-analysis/current", response_model=CurrentStanceAnalysisResponse)
async def get_current_stance_analysis(
    report_id: int,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get current stance analysis for all articles in a report.
    Fetches current stance analysis for display before regeneration.
    """
    logger.info(f"get_current_stance_analysis - user_id={current_user.user_id}, report_id={report_id}")

    try:
        result = await service.get_current_stance_analysis(
            report_id=report_id,
            user_id=current_user.user_id,
        )

        logger.info(f"get_current_stance_analysis complete - user_id={current_user.user_id}, report_id={report_id}, count={result.total_articles}")

        return CurrentStanceAnalysisResponse(
            report_id=result.report_id,
            report_name=result.report_name,
            total_articles=result.total_articles,
            articles=[
                CurrentStanceAnalysisItem(
                    article_id=a.article_id,
                    association_id=a.association_id,
                    title=a.title,
                    pmid=a.pmid,
                    journal=a.journal,
                    pub_year=a.pub_year,
                    current_stance=a.current_stance,
                )
                for a in result.articles
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_current_stance_analysis failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch stance analysis: {str(e)}"
        )


@router.post("/{report_id}/stance-analysis/preview", response_model=PreviewStanceAnalysisResponse)
async def preview_stance_analysis(
    report_id: int,
    request: PreviewArticleSummariesRequest,  # Reuse - same structure (prompt + llm_config)
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Preview stance analysis regeneration without saving.

    Generates new stance analysis using the provided prompt and returns both
    current and new analysis for comparison. Does NOT save to database.
    """
    logger.info(f"preview_stance_analysis - user_id={current_user.user_id}, report_id={report_id}")

    try:
        llm_config = None
        if request.llm_config:
            llm_config = {
                "model_id": request.llm_config.model_id,
                "temperature": request.llm_config.temperature,
                "max_tokens": request.llm_config.max_tokens,
                "reasoning_effort": request.llm_config.reasoning_effort,
            }

        result = await service.preview_stance_analysis(
            report_id=report_id,
            user_id=current_user.user_id,
            system_prompt=request.prompt.system_prompt,
            user_prompt_template=request.prompt.user_prompt_template,
            llm_config=llm_config,
        )

        logger.info(f"preview_stance_analysis complete - user_id={current_user.user_id}, report_id={report_id}, count={result.total_articles}")

        return PreviewStanceAnalysisResponse(
            report_id=result.report_id,
            total_articles=result.total_articles,
            previews=[
                StanceAnalysisPreviewItem(
                    article_id=p.article_id,
                    association_id=p.association_id,
                    title=p.title,
                    pmid=p.pmid,
                    current_stance=p.current_stance,
                    new_stance=p.new_stance,
                    error=p.error,
                )
                for p in result.previews
            ],
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"preview_stance_analysis failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to preview stance analysis: {str(e)}"
        )


@router.post("/{report_id}/stance-analysis/batch-update", response_model=BatchUpdateStanceResponse)
async def batch_update_stance_analysis(
    report_id: int,
    request: BatchUpdateStanceRequest,
    service: ReportService = Depends(get_report_service),
    current_user: User = Depends(get_current_user)
):
    """
    Batch update selected stance analyses.

    Updates only the specified articles with new stance analysis.
    Records a CurationEvent for audit trail.
    """
    logger.info(f"batch_update_stance_analysis - user_id={current_user.user_id}, report_id={report_id}, count={len(request.updates)}")

    try:
        updates = [
            {"article_id": u.article_id, "stance_analysis": u.stance_analysis}
            for u in request.updates
        ]

        result = await service.batch_update_stance_analysis(
            report_id=report_id,
            user_id=current_user.user_id,
            updates=updates,
        )

        logger.info(f"batch_update_stance_analysis complete - user_id={current_user.user_id}, report_id={report_id}, updated={result.updated_count}")

        return BatchUpdateStanceResponse(
            report_id=result.report_id,
            updated_count=result.updated_count,
            message=result.message,
            statistics=result.statistics,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"batch_update_stance_analysis failed - user_id={current_user.user_id}, report_id={report_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update stance analysis: {str(e)}"
        )
