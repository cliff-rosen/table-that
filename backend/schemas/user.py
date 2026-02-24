"""
User schemas for Knowledge Horizon

Core user types. Request schemas (UserCreate, UserUpdate, etc.) are in the routers.

Organized to mirror frontend types/user.ts for easy cross-reference.
Section order:
  1. Enums
  2. User Types
  3. Auth Types
"""

from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================


class UserRole(str, Enum):
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


# ============================================================================
# USER TYPES
# ============================================================================


class User(BaseModel):
    """
    Full user schema.
    This is the canonical representation of a user in API responses.
    """
    user_id: int = Field(description="Unique identifier")
    email: EmailStr = Field(description="User's email address")
    org_id: Optional[int] = Field(None, description="Organization ID")
    full_name: Optional[str] = Field(None, description="User's full name")
    job_title: Optional[str] = Field(None, description="User's job title")
    role: UserRole = Field(description="User's privilege level")
    is_active: bool = Field(default=True, description="Whether user is active")
    registration_date: datetime = Field(description="When user registered")
    created_at: datetime = Field(description="Record creation timestamp")
    updated_at: datetime = Field(description="Record update timestamp")

    class Config:
        from_attributes = True


class UserSummary(BaseModel):
    """Minimal user info for lists and references."""
    user_id: int
    email: EmailStr
    full_name: Optional[str] = None
    role: UserRole

    class Config:
        from_attributes = True


class OrgMember(BaseModel):
    """User as a member of an organization."""
    user_id: int
    email: str
    full_name: Optional[str] = None
    role: UserRole
    joined_at: Optional[datetime] = Field(None, description="When user joined the org")

    class Config:
        from_attributes = True


class UserList(BaseModel):
    """Paginated user list response."""
    users: List[User]
    total: int


# ============================================================================
# AUTH TYPES
# ============================================================================


class Token(BaseModel):
    """Authentication response with JWT token."""
    access_token: str = Field(description="JWT access token")
    token_type: str = Field(default="bearer", description="Token type")
    user_id: int = Field(description="User's unique identifier")
    email: str = Field(description="User's email address")
    username: str = Field(description="Display username (from email)")
    role: UserRole = Field(description="User's privilege level")
    org_id: Optional[int] = Field(None, description="User's organization ID")


class TokenData(BaseModel):
    """JWT token payload data."""
    email: Optional[str] = Field(None)
    user_id: Optional[int] = Field(None)
    org_id: Optional[int] = Field(None)
    username: Optional[str] = Field(None)
    role: Optional[UserRole] = Field(None)
