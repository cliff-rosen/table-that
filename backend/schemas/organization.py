"""
Organization and subscription schemas for multi-tenancy support.

Organized to mirror frontend types/organization.ts for easy cross-reference.
Section order:
  1. Organization Types
  2. Member Types
  3. Subscription Types
  4. Notes Types
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

from models import UserRole, StreamScope


# ============================================================================
# ORGANIZATION TYPES
# ============================================================================

class OrganizationBase(BaseModel):
    """Base organization fields."""
    name: str = Field(..., min_length=1, max_length=255, description="Organization name")


class OrganizationCreate(OrganizationBase):
    """Schema for creating an organization."""
    pass


class OrganizationUpdate(BaseModel):
    """Schema for updating an organization."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    is_active: Optional[bool] = None


class Organization(OrganizationBase):
    """Full organization response."""
    org_id: int
    is_active: bool = True
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrganizationWithStats(Organization):
    """Organization with member/stream counts."""
    member_count: int = 0
    stream_count: int = 0
    pending_invitation_count: int = 0


# ============================================================================
# MEMBER TYPES
# ============================================================================

class OrgMember(BaseModel):
    """Organization member info."""
    user_id: int
    email: str
    full_name: Optional[str] = None
    role: UserRole
    joined_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OrgMemberUpdate(BaseModel):
    """Schema for updating a member's role."""
    role: UserRole = Field(..., description="New role for the member")


class OrgMemberInvite(BaseModel):
    """Schema for inviting a new member."""
    email: str = Field(..., description="Email of the user to invite")
    role: UserRole = Field(default=UserRole.MEMBER, description="Role to assign")


# ============================================================================
# SUBSCRIPTION TYPES
# ============================================================================

class OrgStreamSubscriptionCreate(BaseModel):
    """Schema for subscribing org to a global stream."""
    stream_id: int


class OrgStreamSubscription(BaseModel):
    """Org subscription to a global stream."""
    org_id: int
    stream_id: int
    stream_name: str
    subscribed_at: datetime
    subscribed_by: Optional[int] = None
    subscriber_name: Optional[str] = None

    class Config:
        from_attributes = True


class UserStreamSubscriptionCreate(BaseModel):
    """Schema for user subscribing to an org stream."""
    stream_id: int


class UserStreamSubscription(BaseModel):
    """User subscription to a stream."""
    user_id: int
    stream_id: int
    stream_name: str
    is_subscribed: bool
    updated_at: datetime

    class Config:
        from_attributes = True


class UserStreamOptOut(BaseModel):
    """Schema for opting out of a global stream."""
    stream_id: int


class StreamSubscriptionStatus(BaseModel):
    """Stream with subscription status for display."""
    stream_id: int
    stream_name: str
    scope: StreamScope
    purpose: Optional[str] = None
    # For org streams: is the current user subscribed?
    # For global streams: is the user's org subscribed, and has user opted out?
    is_org_subscribed: Optional[bool] = None  # Only for global streams
    is_user_subscribed: bool = True
    is_user_opted_out: bool = False  # Only for global streams
    created_at: datetime

    class Config:
        from_attributes = True


class GlobalStreamLibrary(BaseModel):
    """List of global streams available for org subscription."""
    streams: List[StreamSubscriptionStatus]
    total_count: int


class OrgStreamList(BaseModel):
    """List of org streams available for user subscription."""
    streams: List[StreamSubscriptionStatus]
    total_count: int


# ============================================================================
# NOTES TYPES
# ============================================================================

class ArticleNote(BaseModel):
    """Individual note on an article."""
    id: str = Field(..., description="Unique note ID (UUID)")
    user_id: int
    author_name: str
    content: str
    visibility: str = Field(..., pattern="^(personal|shared)$", description="'personal' or 'shared'")
    created_at: datetime
    updated_at: datetime


class ArticleNoteCreate(BaseModel):
    """Schema for creating a note."""
    content: str = Field(..., min_length=1, description="Note content")
    visibility: str = Field(default="personal", pattern="^(personal|shared)$")


class ArticleNoteUpdate(BaseModel):
    """Schema for updating a note."""
    content: Optional[str] = Field(None, min_length=1)
    visibility: Optional[str] = Field(None, pattern="^(personal|shared)$")


class ArticleNotesResponse(BaseModel):
    """Response containing visible notes for an article."""
    report_id: int
    article_id: int
    notes: List[ArticleNote]
    total_count: int


# ============================================================================
# INVITATION TYPES
# ============================================================================

class Invitation(BaseModel):
    """Invitation to join an organization."""
    invitation_id: int
    email: str
    org_id: Optional[int] = None
    org_name: Optional[str] = None
    role: str
    token: str
    invite_url: str
    created_at: datetime
    expires_at: datetime
    accepted_at: Optional[datetime] = None
    is_revoked: bool = False
    inviter_email: Optional[str] = None

    class Config:
        from_attributes = True
