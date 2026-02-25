"""
Organization schemas for multi-tenancy support.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime

from models import UserRole


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
    """Organization with member counts."""
    member_count: int = 0
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
