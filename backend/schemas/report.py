"""
Report schemas for Knowledge Horizon

Organized to mirror frontend types/report.ts for easy cross-reference.
Section order:
  1. Enums
  2. Article Types
  3. Report (main type)
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, date
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================


class ApprovalStatus(str, Enum):
    """Approval status for reports"""
    AWAITING_APPROVAL = "awaiting_approval"  # Report complete, awaiting admin review
    APPROVED = "approved"                     # Approved and visible to subscribers
    REJECTED = "rejected"                     # Rejected by admin


# ============================================================================
# ARTICLE TYPES
# ============================================================================


class ReportArticle(BaseModel):
    """Article within a report with association metadata"""
    article_id: int
    title: str
    authors: List[str] = []
    journal: Optional[str] = None
    pmid: Optional[str] = None
    doi: Optional[str] = None
    abstract: Optional[str] = None
    url: Optional[str] = None
    # Honest date fields - only populated with actual precision available
    pub_year: Optional[int] = None  # Publication year (always present from source)
    pub_month: Optional[int] = None  # Publication month (1-12, when available)
    pub_day: Optional[int] = None  # Publication day (1-31, when available)
    # Association metadata
    relevance_score: Optional[float] = None
    relevance_rationale: Optional[str] = None
    ranking: Optional[int] = None
    is_starred: Optional[bool] = False
    is_read: Optional[bool] = False
    notes: Optional[str] = None
    presentation_categories: List[str] = []  # List of category IDs
    ai_summary: Optional[str] = None  # AI-generated summary from pipeline
    ai_enrichments: Optional[Dict[str, Any]] = None  # AI-generated enrichments (stance analysis, etc.)
    # Context fields - populated when viewing favorites across multiple reports
    report_id: Optional[int] = None
    report_name: Optional[str] = None
    stream_id: Optional[int] = None
    stream_name: Optional[str] = None
    starred_at: Optional[datetime] = None


# ============================================================================
# REPORT (Main Type)
# ============================================================================


class Report(BaseModel):
    """Report business object"""
    report_id: int
    user_id: int
    research_stream_id: Optional[int] = None
    report_name: str  # Human-readable report name (defaults to YYYY.MM.DD)
    report_date: date
    key_highlights: List[str] = []
    thematic_analysis: Optional[str] = None  # Generated separately by LLM
    coverage_stats: Dict[str, Any] = {}
    is_read: bool = False
    read_at: Optional[datetime] = None
    created_at: datetime
    article_count: Optional[int] = None
    # Pipeline execution metadata
    pipeline_execution_id: Optional[str] = None  # UUID linking to wip_articles
    run_type: Optional[str] = None  # 'test', 'scheduled', or 'manual'
    retrieval_params: Dict[str, Any] = {}  # Input parameters: start_date, end_date, etc.
    enrichments: Dict[str, Any] = {}  # LLM-generated content: executive_summary, category_summaries
    pipeline_metrics: Dict[str, Any] = {}  # Execution metadata: counts, timing, etc.
    # Coverage period (from pipeline_execution)
    coverage_start_date: Optional[str] = Field(None, description="Start date of coverage period (YYYY-MM-DD)")
    coverage_end_date: Optional[str] = Field(None, description="End date of coverage period (YYYY-MM-DD)")
    # Approval workflow
    approval_status: ApprovalStatus = Field(default=ApprovalStatus.AWAITING_APPROVAL, description="Approval status of the report")
    approved_by: Optional[int] = Field(None, description="User ID of admin who approved/rejected")
    approved_at: Optional[datetime] = Field(None, description="When the report was approved/rejected")
    rejection_reason: Optional[str] = Field(None, description="Reason if report was rejected")

    class Config:
        from_attributes = True


class ReportWithArticles(Report):
    """Report with full article details"""
    articles: List[ReportArticle] = []