from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Date, Enum, JSON, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.sql.schema import CheckConstraint
from enum import Enum as PyEnum

Base = declarative_base()

# Enums for Knowledge Horizon
class UserRole(str, PyEnum):
    """
    User privilege levels.

    Role hierarchy and org_id relationship:
    - PLATFORM_ADMIN: org_id = NULL. Platform-level access, above all orgs.
                      Can manage any org, create global streams, assign users.
    - ORG_ADMIN: org_id = required. Manages their organization's members
                 and stream subscriptions.
    - MEMBER: org_id = required. Regular user in an organization.
              Can use streams they have access to, create personal streams.
    """
    PLATFORM_ADMIN = "platform_admin"
    ORG_ADMIN = "org_admin"
    MEMBER = "member"


class StreamScope(str, PyEnum):
    """Scope of a research stream"""
    GLOBAL = "global"  # Platform-level, created by platform admins
    ORGANIZATION = "organization"  # Org-level, visible to all org members who subscribe
    PERSONAL = "personal"  # User-level, only visible to creator

class FeedbackType(str, PyEnum):
    """Type of user feedback"""
    THUMBS_UP = "thumbs_up"
    THUMBS_DOWN = "thumbs_down"
    IRRELEVANT = "irrelevant"
    IMPORTANT = "important"


class ToolTraceStatus(str, PyEnum):
    """Status of a tool trace execution"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class ReportFrequency(str, PyEnum):
    """Frequency of report generation"""
    DAILY = "daily"
    WEEKLY = "weekly"
    BIWEEKLY = "biweekly"
    MONTHLY = "monthly"

class StreamType(str, PyEnum):
    """Type of research stream"""
    COMPETITIVE = "competitive"  # Competitor monitoring
    REGULATORY = "regulatory"    # Regulatory updates and changes
    CLINICAL = "clinical"        # Clinical trials and research
    MARKET = "market"           # Market analysis and trends
    SCIENTIFIC = "scientific"   # Scientific literature and discoveries
    MIXED = "mixed"             # Multi-purpose streams

class RunType(str, PyEnum):
    """Type of pipeline run"""
    TEST = "test"         # Legacy: kept for backward compatibility
    SCHEDULED = "scheduled"  # Automated scheduled run
    MANUAL = "manual"     # Manual run triggered by user

class ApprovalStatus(str, PyEnum):
    """Approval status for reports"""
    AWAITING_APPROVAL = "awaiting_approval"  # Report complete, awaiting admin review
    APPROVED = "approved"                     # Approved and visible to subscribers
    REJECTED = "rejected"                     # Rejected by admin


class ReportEmailQueueStatus(str, PyEnum):
    """Status of a report email in the queue"""
    SCHEDULED = "scheduled"    # Queued for a future date
    READY = "ready"            # Scheduled date has arrived, waiting to be picked up
    PROCESSING = "processing"  # Sender is actively working on it
    SENT = "sent"              # Successfully delivered
    FAILED = "failed"          # Error occurred (no retry)

class ExecutionStatus(str, PyEnum):
    """Status of a pipeline execution"""
    PENDING = "pending"       # Queued, waiting to start
    RUNNING = "running"       # Currently executing
    COMPLETED = "completed"   # Finished successfully, report created
    FAILED = "failed"         # Execution failed, no report


class ArtifactType(str, PyEnum):
    """Type of artifact (defect tracker)"""
    BUG = "bug"
    FEATURE = "feature"
    TASK = "task"

class ArtifactPriority(str, PyEnum):
    """Priority of an artifact"""
    URGENT = "urgent"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class ArtifactArea(str, PyEnum):
    """Functional area of the platform an artifact relates to"""
    LOGIN_AUTH = "login_auth"
    USER_PREFS = "user_prefs"
    STREAMS = "streams"
    REPORTS = "reports"
    ARTICLES = "articles"
    NOTES = "notes"
    USERS = "users"
    ORGANIZATIONS = "organizations"
    DATA_SOURCES = "data_sources"
    CHAT_SYSTEM = "chat_system"
    HELP_CONTENT = "help_content"
    SYSTEM_OPS = "system_ops"

class ArtifactStatus(str, PyEnum):
    """Status of an artifact"""
    NEW = "new"
    OPEN = "open"
    IN_PROGRESS = "in_progress"
    ICEBOX = "icebox"
    CLOSED = "closed"


# Organization table (multi-tenancy)
class Organization(Base):
    """Organization/tenant that users belong to"""
    __tablename__ = "organizations"

    org_id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organization")
    research_streams = relationship("ResearchStream", back_populates="organization", foreign_keys="ResearchStream.org_id")
    stream_subscriptions = relationship("OrgStreamSubscription", back_populates="organization")
    invitations = relationship("Invitation", back_populates="organization")


class Invitation(Base):
    """User invitation for registration"""
    __tablename__ = "invitations"

    invitation_id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), nullable=False, index=True)
    token = Column(String(255), nullable=False, unique=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.org_id", ondelete="CASCADE"), nullable=True)
    role = Column(String(50), default="member", nullable=False)
    invited_by = Column(Integer, ForeignKey("users.user_id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    accepted_at = Column(DateTime, nullable=True)
    is_revoked = Column(Boolean, default=False)

    # Relationships
    organization = relationship("Organization", back_populates="invitations")
    inviter = relationship("User", foreign_keys=[invited_by])


# Core User table
class User(Base):
    """User authentication and basic information"""
    __tablename__ = "users"

    user_id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.org_id"), nullable=True, index=True)  # Organization (nullable during migration)
    email = Column(String(255), unique=True, index=True)
    password = Column(String(255))
    full_name = Column(String(255), nullable=True)  # User's full name from onboarding
    job_title = Column(String(255), nullable=True)  # User's job title
    is_active = Column(Boolean, default=True)
    role = Column(Enum(UserRole, values_callable=lambda x: [e.value for e in x], name='userrole'), default=UserRole.MEMBER, nullable=False)
    login_token = Column(String(255), nullable=True, index=True)  # One-time login token
    login_token_expires = Column(DateTime, nullable=True)  # Token expiration time
    password_reset_token = Column(String(255), nullable=True, index=True)  # Password reset token
    password_reset_token_expires = Column(DateTime, nullable=True)  # Reset token expiration
    registration_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    organization = relationship("Organization", back_populates="users")
    stream_subscriptions = relationship("UserStreamSubscription", back_populates="user")
    # Additional relationships added at end of file


# Core Stream tables

class ResearchStream(Base):
    """Research stream with clean three-layer architecture"""
    __tablename__ = "research_streams"

    # === CORE IDENTITY ===
    stream_id = Column(Integer, primary_key=True, index=True)

    # Scope determines visibility: global (platform-wide), organization, or personal
    scope = Column(Enum(StreamScope, values_callable=lambda x: [e.value for e in x], name='streamscope'), default=StreamScope.PERSONAL, nullable=False, index=True)

    # Organization this stream belongs to (NULL for global streams)
    org_id = Column(Integer, ForeignKey("organizations.org_id"), nullable=True, index=True)

    # Owner user for personal streams (NULL for org/global streams)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=True, index=True)

    # Who created this stream (always set, for audit purposes)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=True, index=True)

    stream_name = Column(String(255), nullable=False)
    purpose = Column(Text, nullable=False)  # High-level why this stream exists

    # === THREE-LAYER ARCHITECTURE ===

    # Layer 1: SEMANTIC SPACE - What information matters (source-agnostic ground truth)
    # Stores complete SemanticSpace schema as JSON
    semantic_space = Column(JSON, nullable=False)

    # Layer 2: RETRIEVAL CONFIG - How to find & filter content
    # Stores RetrievalConfig (workflow + scoring) as JSON
    # Format: {"workflow": {...}, "scoring": {...}}
    retrieval_config = Column(JSON, nullable=False)

    # Layer 3: PRESENTATION CONFIG - How to organize results for users
    # Stores PresentationConfig (categories) and categorization prompt as JSON
    # Format: {"categories": [{...}, {...}]}
    presentation_config = Column(JSON, nullable=False)

    # Layer 4: ENRICHMENT CONFIG - Custom prompts for content generation
    # Stores EnrichmentConfig (custom prompts) as JSON
    # Format: {"prompts": {"executive_summary": {...}, "category_summary": {...}}}
    enrichment_config = Column(JSON, nullable=True)

    # ARTICLE ANALYSIS CONFIG - Stance analysis prompt
    # Format: {"stance_analysis_prompt": {"system_prompt": "...", "user_prompt_template": "..."}}
    article_analysis_config = Column(JSON, nullable=True)

    # LLM CONFIG - Which LLMs to use for each pipeline stage
    # Format: {"semantic_filter": {"model": "gpt-5-mini", "reasoning_effort": "medium"}, ...}
    llm_config = Column(JSON, nullable=True)

    # === METADATA ===
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # === SCHEDULING ===
    # Schedule configuration stored as JSON:
    # {
    #   "enabled": true,
    #   "frequency": "weekly",       # daily, weekly, biweekly, monthly
    #   "anchor_day": "monday",      # day of week (mon-sun) or day of month (1-31)
    #   "preferred_time": "08:00",   # HH:MM in user's timezone
    #   "timezone": "America/New_York",
    #   "lookback_days": 7           # how many days of articles to fetch
    # }
    schedule_config = Column(JSON, nullable=True)
    next_scheduled_run = Column(DateTime, nullable=True, index=True)  # When this stream should run next (pre-calculated)
    last_execution_id = Column(String(36), ForeignKey("pipeline_executions.id"), nullable=True)  # Most recent execution

    # Relationships
    organization = relationship("Organization", back_populates="research_streams", foreign_keys=[org_id])
    user = relationship("User", back_populates="research_streams", foreign_keys=[user_id])
    creator = relationship("User", foreign_keys=[created_by], overlaps="created_streams")
    reports = relationship("Report", back_populates="research_stream")
    org_subscriptions = relationship("OrgStreamSubscription", back_populates="stream")
    user_subscriptions = relationship("UserStreamSubscription", back_populates="stream")
    executions = relationship("PipelineExecution", back_populates="stream", foreign_keys="PipelineExecution.stream_id")
    last_execution = relationship("PipelineExecution", foreign_keys=[last_execution_id], uselist=False)


class PipelineExecution(Base):
    """
    Tracks each pipeline run attempt - the single source of truth for execution state AND configuration.

    All configuration is determined and stored at creation time (trigger time):
    - Who triggered it (user_id)
    - What to retrieve (retrieval_config snapshot)
    - How to categorize/present (presentation_config snapshot)
    - What date range to query (start_date, end_date)
    - What to name the report (report_name)

    The pipeline service reads ALL configuration from this record - it does NOT
    go back to the stream for any configuration.
    """
    __tablename__ = "pipeline_executions"

    # === IDENTITY ===
    id = Column(String(36), primary_key=True)  # UUID
    stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)  # Who triggered/owns this execution

    # === EXECUTION STATE ===
    status = Column(Enum(ExecutionStatus, values_callable=lambda x: [e.value for e in x], name='executionstatus'), default=ExecutionStatus.PENDING, nullable=False)
    run_type = Column(Enum(RunType, values_callable=lambda x: [e.value for e in x], name='runtype'), default=RunType.MANUAL, nullable=False)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # === EXECUTION CONFIGURATION (all determined at trigger time) ===
    start_date = Column(String(10), nullable=True)  # YYYY-MM-DD format for retrieval
    end_date = Column(String(10), nullable=True)    # YYYY-MM-DD format for retrieval
    report_name = Column(String(255), nullable=True)  # Custom report name (defaults to YYYY.MM.DD if null)
    retrieval_config = Column(JSON, nullable=True)  # Snapshot: queries, filters, sources
    presentation_config = Column(JSON, nullable=True)  # Snapshot: categories for categorization
    enrichment_config = Column(JSON, nullable=True)  # Snapshot: custom prompts for summaries
    llm_config = Column(JSON, nullable=True)  # Snapshot: which LLMs to use per stage
    article_analysis_config = Column(JSON, nullable=True)  # Snapshot: stance analysis prompt

    # === OUTPUT REFERENCE ===
    report_id = Column(Integer, ForeignKey("reports.report_id"), nullable=True)

    # Relationships
    stream = relationship("ResearchStream", back_populates="executions", foreign_keys=[stream_id])
    user = relationship("User", foreign_keys=[user_id])
    report = relationship("Report", back_populates="execution", foreign_keys=[report_id])
    wip_articles = relationship("WipArticle", back_populates="execution", primaryjoin="PipelineExecution.id == foreign(WipArticle.pipeline_execution_id)")


class WipArticle(Base):
    """Work-in-progress articles for pipeline test execution and audit trail"""
    __tablename__ = "wip_articles"

    id = Column(Integer, primary_key=True, index=True)
    research_stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), nullable=False)
    retrieval_group_id = Column(String(255), nullable=False, index=True)
    source_id = Column(Integer, ForeignKey("information_sources.source_id"), nullable=False)
    pipeline_execution_id = Column(String(36), ForeignKey("pipeline_executions.id"), nullable=False, index=True)  # UUID of pipeline run

    # Article data (mirroring articles table structure)
    title = Column(String(500), nullable=False)
    url = Column(String(1000))
    authors = Column(JSON, default=list)
    abstract = Column(Text)
    summary = Column(Text)
    full_text = Column(Text)

    # Honest date fields - only populated with actual precision available
    pub_year = Column(Integer, nullable=True)  # Publication year (always present from source)
    pub_month = Column(Integer, nullable=True)  # Publication month (1-12, when available)
    pub_day = Column(Integer, nullable=True)  # Publication day (1-31, when available)

    # PubMed-specific fields
    pmid = Column(String(20), index=True)
    doi = Column(String(255), index=True)
    journal = Column(String(255))
    volume = Column(String(50))
    issue = Column(String(50))
    pages = Column(String(50))

    # Source-specific identifier (e.g., PubMed ID, Semantic Scholar ID, etc.)
    source_specific_id = Column(String(255), index=True)

    # Metadata
    article_metadata = Column(JSON, default=dict)

    # Processing status fields (set by pipeline)
    is_duplicate = Column(Boolean, default=False, index=True)
    duplicate_of_id = Column(Integer, ForeignKey("wip_articles.id"))
    duplicate_of_pmid = Column(String(20), nullable=True)  # PMID of article this is a duplicate of
    passed_semantic_filter = Column(Boolean, default=None, index=True)
    filter_score = Column(Float, nullable=True)  # Relevance score from semantic filter
    filter_score_reason = Column(Text)  # AI reasoning for the score (captured for all articles)
    included_in_report = Column(Boolean, default=False, index=True)  # SOURCE OF TRUTH - synced with ReportArticleAssociation existence

    # Curation override fields (set by curator, audit trail for how we got to current state)
    # See docs/_specs/article-curation-flow.md for state transition documentation
    curator_included = Column(Boolean, default=False)  # Curator overrode filter to include
    curator_excluded = Column(Boolean, default=False)  # Curator overrode pipeline to exclude
    curation_notes = Column(Text, nullable=True)  # Why curator made the decision
    curated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    curated_at = Column(DateTime, nullable=True)

    # Timestamps
    retrieved_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    research_stream = relationship("ResearchStream")
    source = relationship("InformationSource")
    execution = relationship("PipelineExecution", back_populates="wip_articles")
    curator = relationship("User", foreign_keys=[curated_by])



class Article(Base):
    """Individual articles from information sources"""
    __tablename__ = "articles"

    article_id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("information_sources.source_id"))
    title = Column(String(500), nullable=False)
    url = Column(String(1000))
    authors = Column(JSON, default=list)  # List of author names
    summary = Column(Text)  # Original summary
    ai_summary = Column(Text)  # AI-generated summary
    full_text = Column(Text)  # Full article text
    article_metadata = Column(JSON, default=dict)  # Additional metadata
    theme_tags = Column(JSON, default=list)  # Thematic tags
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_updated = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    fetch_count = Column(Integer, default=1)  # How many times we've seen this

    # Honest date fields - only populated with actual precision available
    pub_year = Column(Integer, nullable=True)  # Publication year (always present from source)
    pub_month = Column(Integer, nullable=True)  # Publication month (1-12, when available)
    pub_day = Column(Integer, nullable=True)  # Publication day (1-31, when available)

    # PubMed-specific fields
    pmid = Column(String(20), index=True)  # PubMed ID
    abstract = Column(Text)  # Full abstract text
    comp_date = Column(Date)  # Completion date
    journal = Column(String(255))  # Journal name
    volume = Column(String(50))  # Journal volume
    issue = Column(String(50))  # Journal issue
    medium = Column(String(100))  # Publication medium
    pages = Column(String(50))  # Page range
    poi = Column(String(255))  # Publication Object Identifier
    doi = Column(String(255), index=True)  # Digital Object Identifier
    is_systematic = Column(Boolean, default=False)  # Is this a systematic review

    # Relationships
    source = relationship("InformationSource", back_populates="articles")
    report_associations = relationship("ReportArticleAssociation", back_populates="article")
    feedback = relationship("UserFeedback", back_populates="article")



class Report(Base):
    """
    Generated intelligence reports - pure output from pipeline execution.

    Input configuration (run_type, dates, retrieval_config) is stored in PipelineExecution.
    Access via report.execution to get execution configuration.
    """
    __tablename__ = "reports"

    report_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    research_stream_id = Column(Integer, ForeignKey("research_streams.stream_id"))
    report_name = Column(String, nullable=False)  # Human-readable report name (defaults to YYYY.MM.DD)
    report_date = Column(Date, nullable=False)
    key_highlights = Column(JSON, default=list)  # List of key points
    thematic_analysis = Column(Text)  # Analysis of themes
    coverage_stats = Column(JSON, default=dict)  # Statistics about coverage
    is_read = Column(Boolean, default=False)
    read_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Pipeline output metadata
    enrichments = Column(JSON, default=dict)  # LLM-generated content: executive_summary, category_summaries
    pipeline_metrics = Column(JSON, default=dict)  # Execution metrics: counts, timing, etc.
    pipeline_execution_id = Column(String(36), ForeignKey("pipeline_executions.id"), index=True, nullable=False)

    # Approval workflow - all reports require admin approval before being visible to subscribers
    approval_status = Column(Enum(ApprovalStatus, values_callable=lambda x: [e.value for e in x], name='approvalstatus'), default=ApprovalStatus.AWAITING_APPROVAL, nullable=False, index=True)
    approved_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)  # Admin who approved/rejected
    approved_at = Column(DateTime, nullable=True)
    rejection_reason = Column(Text, nullable=True)  # Reason if rejected

    # Curation tracking - original values preserved for comparison
    original_report_name = Column(String(255), nullable=True)  # What pipeline generated
    original_enrichments = Column(JSON, nullable=True)  # Original summaries before editing
    has_curation_edits = Column(Boolean, default=False)  # Quick check: was anything manually changed?
    last_curated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    last_curated_at = Column(DateTime, nullable=True)

    # Relationships
    user = relationship("User", back_populates="reports", foreign_keys=[user_id])
    approver = relationship("User", foreign_keys=[approved_by])
    curator = relationship("User", foreign_keys=[last_curated_by])
    research_stream = relationship("ResearchStream", back_populates="reports")
    article_associations = relationship("ReportArticleAssociation", back_populates="report")
    feedback = relationship("UserFeedback", back_populates="report")
    execution = relationship("PipelineExecution", back_populates="report", foreign_keys="PipelineExecution.report_id", uselist=False)
    curation_events = relationship("CurationEvent", back_populates="report", cascade="all, delete-orphan", passive_deletes=True)


class ReportArticleAssociation(Base):
    """
    Association between reports and articles with metadata.

    An article is visible in the report if: record exists AND is_hidden=False.

    Visibility flags:
    - is_hidden: Article is soft-deleted from report view (preserves data for undo)
    - curator_added: Article was added by curator (not by pipeline) - delete on reset

    Curation audit trail (why decisions were made) is stored on WipArticle, not here.
    This table only stores how the article appears in this specific report.

    See docs/_specs/article-curation-flow.md for full state transition documentation.
    """
    __tablename__ = "report_article_associations"

    report_id = Column(Integer, ForeignKey("reports.report_id"), primary_key=True)
    article_id = Column(Integer, ForeignKey("articles.article_id"), primary_key=True)

    # Link back to pipeline data (for curation notes, filter scores, etc.)
    wip_article_id = Column(Integer, ForeignKey("wip_articles.id"), nullable=True, index=True)

    relevance_score = Column(Float)  # AI-calculated relevance score
    relevance_rationale = Column(Text)  # Why this article is relevant
    ranking = Column(Integer)  # Order within the report (current, may be edited)
    user_feedback = Column(Enum(FeedbackType))  # User's feedback on this article
    is_starred = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    notes = Column(Text)  # User's notes on this article
    added_at = Column(DateTime, default=datetime.utcnow)
    read_at = Column(DateTime)

    # Presentation categorization (current, may be edited)
    presentation_categories = Column(JSON, default=list)  # List of presentation category IDs

    # AI-generated enrichments (stance analysis, summaries, etc.)
    ai_enrichments = Column(JSON, nullable=True)

    # === ORIGINAL VALUES (set when added, preserved for curation comparison) ===
    original_presentation_categories = Column(JSON, nullable=True)
    original_ranking = Column(Integer, nullable=True)

    # === AI SUMMARY (can be edited by curator) ===
    ai_summary = Column(Text, nullable=True)  # Current summary (may be edited)
    original_ai_summary = Column(Text, nullable=True)  # What AI originally generated

    # === VISIBILITY FLAGS ===
    is_hidden = Column(Boolean, default=False, nullable=False)  # Soft-delete: hidden from report view
    curator_added = Column(Boolean, default=False, nullable=False)  # Curator added (vs pipeline added)

    # Relationships
    report = relationship("Report", back_populates="article_associations")
    article = relationship("Article", back_populates="report_associations")
    wip_article = relationship("WipArticle")


class UserFeedback(Base):
    """User feedback on reports and articles"""
    __tablename__ = "user_feedback"

    feedback_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    report_id = Column(Integer, ForeignKey("reports.report_id"))
    article_id = Column(Integer, ForeignKey("articles.article_id"))
    feedback_type = Column(Enum(FeedbackType), nullable=False)
    feedback_value = Column(String(50))  # Additional feedback value
    notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="feedback")
    report = relationship("Report", back_populates="feedback")
    article = relationship("Article", back_populates="feedback")

    # Constraints
    __table_args__ = (
        CheckConstraint(
            "(report_id IS NOT NULL AND article_id IS NULL) OR (report_id IS NULL AND article_id IS NOT NULL)",
            name="feedback_target_check"
        ),
    )


# Subscription tables for stream access control
class OrgStreamSubscription(Base):
    """Organization subscription to global streams"""
    __tablename__ = "org_stream_subscriptions"

    org_id = Column(Integer, ForeignKey("organizations.org_id"), primary_key=True)
    stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), primary_key=True)
    subscribed_at = Column(DateTime, default=datetime.utcnow)
    subscribed_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)  # Org admin who subscribed

    # Relationships
    organization = relationship("Organization", back_populates="stream_subscriptions")
    stream = relationship("ResearchStream", back_populates="org_subscriptions")
    subscriber = relationship("User")


class UserStreamSubscription(Base):
    """User subscription to org streams / opt-out from global streams"""
    __tablename__ = "user_stream_subscriptions"

    user_id = Column(Integer, ForeignKey("users.user_id"), primary_key=True)
    stream_id = Column(Integer, ForeignKey("research_streams.stream_id"), primary_key=True)
    is_subscribed = Column(Boolean, default=True, nullable=False)  # TRUE = subscribed, FALSE = opted out
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="stream_subscriptions")
    stream = relationship("ResearchStream", back_populates="user_subscriptions")


# === USER TRACKING & CHAT PERSISTENCE ===

class EventSource(str, PyEnum):
    """Source of tracking event"""
    BACKEND = "backend"    # Auto-tracked from API endpoints
    FRONTEND = "frontend"  # Explicitly sent from UI


class Conversation(Base):
    """Chat conversation session"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    app = Column(String(50), nullable=False, default="kh", index=True)  # "kh", "tablizer", "trialscout"
    title = Column(String(255), nullable=True)  # Optional, can auto-generate from first message
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="conversations")
    messages = relationship("Message", back_populates="conversation", cascade="all, delete-orphan", order_by="Message.created_at")


class Message(Base):
    """Individual message in a conversation"""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # 'user', 'assistant', 'system'
    content = Column(Text, nullable=False)
    context = Column(JSON, nullable=True)  # {page: 'reports', report_id: 123, article_pmid: '456'}
    # Extended message data: tool_history, custom_payload, diagnostics, suggested_values, suggested_actions
    extras = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    # Relationships
    conversation = relationship("Conversation", back_populates="messages")


class UserEvent(Base):
    """User activity tracking event"""
    __tablename__ = "user_events"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    event_source = Column(Enum(EventSource, values_callable=lambda x: [e.value for e in x], name='eventsource'), nullable=False)
    event_type = Column(String(50), nullable=False, index=True)  # 'api_call', 'view_change', 'tab_click', etc.
    event_data = Column(JSON, nullable=True)  # {endpoint: '/api/reports/123', method: 'GET'} or {tab: 'notes'}
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    user = relationship("User", back_populates="events")


# === CURATION AUDIT TRAIL ===

class CurationEvent(Base):
    """
    Audit trail for curation actions - history of how we got to current state.
    NOT used to determine current state (that's on Report/ReportArticleAssociation).
    """
    __tablename__ = "curation_events"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    article_id = Column(Integer, ForeignKey("articles.article_id", ondelete="CASCADE"), nullable=True)  # NULL for report-level events

    # What happened
    event_type = Column(String(50), nullable=False)  # See event types in spec
    field_name = Column(String(100), nullable=True)  # Which field changed
    old_value = Column(Text, nullable=True)  # JSON-serialized previous value
    new_value = Column(Text, nullable=True)  # JSON-serialized new value
    notes = Column(Text, nullable=True)  # Curator's explanation

    # Who/When
    curator_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    # Relationships
    report = relationship("Report", back_populates="curation_events")
    article = relationship("Article")
    curator = relationship("User")

# === EMAIL QUEUE ===

class ReportEmailQueue(Base):
    """
    Queue for scheduled report email delivery.

    Process 1 (Admin): Creates records with status=scheduled and scheduled_for date
    Process 2 (2am Cron): Picks up records where scheduled_for <= today, sends emails

    Status flow: scheduled → ready → processing → sent/failed
    """
    __tablename__ = "report_email_queue"

    id = Column(Integer, primary_key=True, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    email = Column(String(255), nullable=False)  # Stored directly, not looked up from user
    status = Column(
        Enum(ReportEmailQueueStatus, values_callable=lambda x: [e.value for e in x], name='reportemailqueuestatus'),
        default=ReportEmailQueueStatus.SCHEDULED,
        nullable=False,
        index=True
    )
    scheduled_for = Column(DateTime, nullable=False, index=True)  # Target datetime for sending
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    sent_at = Column(DateTime, nullable=True)  # When email was actually sent
    error_message = Column(Text, nullable=True)  # Error details if failed

    # Relationships
    report = relationship("Report")
    user = relationship("User")


# === MISC ===

class InformationSource(Base):
    """Sources of information for curation - represents actual searchable sources like PubMed, Google Scholar, etc."""
    __tablename__ = "information_sources"

    source_id = Column(Integer, primary_key=True, index=True)
    source_name = Column(String(255), nullable=False, unique=True)  # e.g., "PubMed", "Google Scholar", "Semantic Scholar"
    source_url = Column(String(500))  # Base URL for the source
    description = Column(Text)  # Description of the source
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    articles = relationship("Article", back_populates="source")


class ReportSchedule(Base):
    """Automated report generation schedule"""
    __tablename__ = "report_schedules"

    schedule_id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, unique=True)
    frequency = Column(Enum(ReportFrequency), nullable=False)
    day_of_week = Column(Integer)  # 0-6 for Monday-Sunday (for weekly)
    day_of_month = Column(Integer)  # 1-31 (for monthly)
    time_of_day = Column(String(5), default="08:00")  # HH:MM format
    timezone = Column(String(50), default="UTC")
    is_active = Column(Boolean, default=True)
    is_paused = Column(Boolean, default=False)
    next_run_at = Column(DateTime)
    last_run_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="report_schedule")


class ChatConfig(Base):
    """
    Chat configuration storage.

    Scope values:
    - 'stream': Stream-specific instructions (scope_key = stream_id as string)
    - 'page': Page-specific persona (scope_key = page name)
    - 'help': Help system configuration (scope_key = config key)
    - 'system': System-wide settings (scope_key = setting name)

    The 'content' field meaning depends on scope:
    - For streams: domain-specific instructions for the assistant
    - For pages: persona defining who the assistant is and how it behaves
    - For help: configuration values for the help system
      - 'toc-preamble': Text shown before the help TOC listing
      - 'narrative': Explains when/why to use the help tool
    - For system: system-wide settings
      - 'max_tool_iterations': Maximum tool call iterations per request (default: 5)
    """
    __tablename__ = "chat_config"

    scope = Column(String(20), primary_key=True)  # 'stream', 'page', 'help', or 'system'
    scope_key = Column(String(100), primary_key=True)  # stream_id or page name
    content = Column(Text, nullable=True)  # instructions (stream) or persona (page)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)


class HelpContentOverride(Base):
    """
    Database overrides for help content.

    Help content defaults come from YAML files in /backend/help/.
    This table stores admin customizations that override those defaults.
    Deleting a row reverts to the YAML default.

    Two-level hierarchy:
    - category: Feature area (reports, streams, tools, operations, general)
    - topic: Specific topic within the category (overview, viewing, etc.)

    Fields:
    - content: Override for the full help content (markdown)
    - summary: Override for the short description shown in TOC (sent to LLM)
    """
    __tablename__ = "help_content_override"

    category = Column(String(50), primary_key=True)  # e.g., "reports"
    topic = Column(String(50), primary_key=True)     # e.g., "overview"
    content = Column(Text, nullable=True)            # Markdown content override
    summary = Column(String(200), nullable=True)     # TOC summary override (shown to LLM)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)


class ToolTrace(Base):
    """
    Generic trace storage for long-running tool executions.

    Provides a unified trace infrastructure for tools like deep_research, batch_analysis, etc.
    Each tool stores its specific data in JSON fields (input_params, state, result, metrics).

    Usage:
    - Tool creates trace at start with input_params
    - Updates progress/state during execution
    - Completes with result and metrics, or fails with error_message

    The state field is updated incrementally during execution and can be used to:
    - Resume interrupted executions
    - Show detailed progress in UI
    - Debug and audit tool behavior
    """
    __tablename__ = "tool_traces"

    id = Column(String(36), primary_key=True)  # UUID
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    org_id = Column(Integer, ForeignKey("organizations.org_id"), nullable=True)

    # What tool created this trace
    tool_name = Column(String(100), nullable=False, index=True)  # e.g., "deep_research"

    # Input (tool-specific)
    input_params = Column(JSON, default=dict)  # Parameters passed to the tool

    # Execution state
    status = Column(
        Enum(ToolTraceStatus, values_callable=lambda x: [e.value for e in x], name='tooltracestatus'),
        default=ToolTraceStatus.PENDING,
        nullable=False,
        index=True
    )
    progress = Column(Float, default=0.0)  # 0.0 to 1.0
    current_stage = Column(String(100))  # Human-readable current stage

    # Tool-specific state (updated during execution)
    state = Column(JSON, default=dict)

    # Output
    result = Column(JSON)  # Final result (tool-specific structure)
    error_message = Column(Text)

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    # Metrics (tool-specific)
    metrics = Column(JSON, default=dict)

    # Relationships
    user = relationship("User", back_populates="tool_traces")
    organization = relationship("Organization")


# === DEFECT / FEATURE TRACKER ===

class UserArticleStar(Base):
    """
    Per-user article starring.

    Each user can star articles within reports. Stars are personal -
    other users cannot see each other's starred articles.
    """
    __tablename__ = "user_article_stars"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    report_id = Column(Integer, ForeignKey("reports.report_id", ondelete="CASCADE"), nullable=False, index=True)
    article_id = Column(Integer, ForeignKey("articles.article_id", ondelete="CASCADE"), nullable=False, index=True)
    starred_at = Column(DateTime, default=datetime.utcnow)

    # Unique constraint: one star per user per article per report
    __table_args__ = (
        CheckConstraint('user_id IS NOT NULL AND report_id IS NOT NULL AND article_id IS NOT NULL', name='user_article_stars_not_null'),
    )

    # Relationships
    user = relationship("User", back_populates="article_stars")
    report = relationship("Report")
    article = relationship("Article")


class ArtifactCategory(Base):
    """Managed categories for organizing artifacts"""
    __tablename__ = "artifact_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Artifact(Base):
    """Bug/feature tracker for platform admins"""
    __tablename__ = "artifacts"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    artifact_type = Column(Enum(ArtifactType, values_callable=lambda x: [e.value for e in x], name='artifacttype'), nullable=False)
    status = Column(Enum(ArtifactStatus, values_callable=lambda x: [e.value for e in x], name='artifactstatus'), nullable=False, default=ArtifactStatus.NEW)
    priority = Column(Enum(ArtifactPriority, values_callable=lambda x: [e.value for e in x], name='artifactpriority'), nullable=True)
    area = Column(Enum(ArtifactArea, values_callable=lambda x: [e.value for e in x], name='artifactarea'), nullable=True)
    category_id = Column(Integer, ForeignKey("artifact_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    updated_by = Column(Integer, ForeignKey("users.user_id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by])
    updater = relationship("User", foreign_keys=[updated_by])
    category_rel = relationship("ArtifactCategory", lazy="joined")

    @property
    def category(self):
        """Return category name for API compatibility."""
        return self.category_rel.name if self.category_rel else None

    @property
    def created_by_name(self):
        """Return creator's display name."""
        return self.creator.full_name or self.creator.email if self.creator else None

    @property
    def updated_by_name(self):
        """Return updater's display name."""
        return self.updater.full_name or self.updater.email if self.updater else None


# Add relationships to User model
User.research_streams = relationship("ResearchStream", back_populates="user", foreign_keys="ResearchStream.user_id")
User.created_streams = relationship("ResearchStream", foreign_keys="ResearchStream.created_by")
User.reports = relationship("Report", back_populates="user", foreign_keys="Report.user_id")
User.approved_reports = relationship("Report", foreign_keys="Report.approved_by", viewonly=True)
User.curated_reports = relationship("Report", foreign_keys="Report.last_curated_by", viewonly=True)
User.report_schedule = relationship("ReportSchedule", back_populates="user", uselist=False)
User.feedback = relationship("UserFeedback", back_populates="user")
User.conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
User.events = relationship("UserEvent", back_populates="user", cascade="all, delete-orphan")
User.tool_traces = relationship("ToolTrace", back_populates="user", cascade="all, delete-orphan")
User.article_stars = relationship("UserArticleStar", back_populates="user", cascade="all, delete-orphan")
