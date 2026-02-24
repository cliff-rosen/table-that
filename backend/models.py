from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Date, Enum, JSON, Boolean, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy.sql.schema import CheckConstraint
from enum import Enum as PyEnum

Base = declarative_base()

# Enums
class UserRole(str, PyEnum):
    """
    User privilege levels.

    Role hierarchy and org_id relationship:
    - PLATFORM_ADMIN: org_id = NULL. Platform-level access, above all orgs.
                      Can manage any org, assign users.
    - ORG_ADMIN: org_id = required. Manages their organization's members.
    - MEMBER: org_id = required. Regular user in an organization.
    """
    PLATFORM_ADMIN = "platform_admin"
    ORG_ADMIN = "org_admin"
    MEMBER = "member"


class ToolTraceStatus(str, PyEnum):
    """Status of a tool trace execution"""
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class EventSource(str, PyEnum):
    """Source of tracking event"""
    BACKEND = "backend"    # Auto-tracked from API endpoints
    FRONTEND = "frontend"  # Explicitly sent from UI


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
    # Additional relationships added at end of file


# === USER TRACKING & CHAT PERSISTENCE ===

class Conversation(Base):
    """Chat conversation session"""
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    app = Column(String(50), nullable=False, default="kh", index=True)
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


class ChatConfig(Base):
    """
    Chat configuration storage.

    Scope values:
    - 'page': Page-specific persona (scope_key = page name)
    - 'help': Help system configuration (scope_key = config key)
    - 'system': System-wide settings (scope_key = setting name)

    The 'content' field meaning depends on scope:
    - For pages: persona defining who the assistant is and how it behaves
    - For help: configuration values for the help system
      - 'toc-preamble': Text shown before the help TOC listing
      - 'narrative': Explains when/why to use the help tool
    - For system: system-wide settings
      - 'max_tool_iterations': Maximum tool call iterations per request (default: 5)
    """
    __tablename__ = "chat_config"

    scope = Column(String(20), primary_key=True)  # 'page', 'help', or 'system'
    scope_key = Column(String(100), primary_key=True)  # page name or config key
    content = Column(Text, nullable=True)  # persona (page) or config value
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


# === TABLE.THAT DATA MODELS ===

class TableDefinition(Base):
    """User-defined table schema"""
    __tablename__ = "table_definitions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    columns = Column(JSON, nullable=False, default=list)  # [{id: "col_xxx", name, type, required, default, options}]
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    user = relationship("User", back_populates="tables")
    rows = relationship("TableRow", back_populates="table", cascade="all, delete-orphan")


class TableRow(Base):
    """Row of data in a user-defined table"""
    __tablename__ = "table_rows"

    id = Column(Integer, primary_key=True, index=True)
    table_id = Column(Integer, ForeignKey("table_definitions.id", ondelete="CASCADE"), nullable=False, index=True)
    data = Column(JSON, nullable=False, default=dict)  # {column_id: value, ...}
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    table = relationship("TableDefinition", back_populates="rows")


# Add relationships to User model
User.conversations = relationship("Conversation", back_populates="user", cascade="all, delete-orphan")
User.events = relationship("UserEvent", back_populates="user", cascade="all, delete-orphan")
User.tool_traces = relationship("ToolTrace", back_populates="user", cascade="all, delete-orphan")
User.tables = relationship("TableDefinition", back_populates="user", cascade="all, delete-orphan")
