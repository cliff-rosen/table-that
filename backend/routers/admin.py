"""
Platform admin API endpoints.
Requires platform_admin role for all operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional, Dict
from datetime import datetime
import logging
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.settings import settings
from database import get_async_db
from models import User, UserRole, ChatConfig
from services import auth_service
from services.organization_service import OrganizationService, get_organization_service
from services.artifact_service import ArtifactService, get_artifact_service
from schemas.artifact import Artifact as ArtifactSchema, ArtifactCategory as ArtifactCategorySchema
from services.user_service import UserService, get_user_service
from services.subscription_service import SubscriptionService, get_subscription_service
from services.invitation_service import InvitationService, get_invitation_service
from services.research_stream_service import (
    ResearchStreamService,
    get_research_stream_service,
)
from schemas.organization import (
    Organization as OrgSchema,
    OrganizationUpdate,
    OrganizationWithStats,
    StreamSubscriptionStatus,
)
from schemas.research_stream import ResearchStream as StreamSchema
from schemas.user import UserRole as UserRoleSchema, User as UserSchema, UserList

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_platform_admin(
    current_user: User = Depends(auth_service.validate_token),
) -> User:
    """Dependency that requires platform admin role."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


# ==================== Organization Management ====================


@router.get(
    "/orgs",
    response_model=List[OrganizationWithStats],
    summary="List all organizations",
)
async def list_all_organizations(
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Get all organizations with member counts. Platform admin only."""
    logger.info(f"list_all_organizations - admin_user_id={current_user.user_id}")

    try:
        orgs = await org_service.list_organizations(include_inactive=True)
        logger.info(f"list_all_organizations complete - count={len(orgs)}")
        return orgs

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_all_organizations failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list organizations: {str(e)}",
        )


@router.post(
    "/orgs",
    response_model=OrgSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new organization",
)
async def create_organization(
    name: str,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Create a new organization. Platform admin only."""
    logger.info(
        f"create_organization - admin_user_id={current_user.user_id}, name={name}"
    )

    try:
        from schemas.organization import OrganizationCreate

        org = await org_service.create_organization(OrganizationCreate(name=name))
        logger.info(f"create_organization complete - org_id={org.org_id}")
        return org

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create organization: {str(e)}",
        )


@router.get(
    "/orgs/{org_id}",
    response_model=OrganizationWithStats,
    summary="Get organization details",
)
async def get_organization(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Get organization details by ID. Platform admin only."""
    logger.info(
        f"get_organization - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        org = await org_service.get_organization_with_stats(org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )
        logger.info(f"get_organization complete - org_id={org_id}")
        return org

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get organization: {str(e)}",
        )


@router.put("/orgs/{org_id}", response_model=OrgSchema, summary="Update organization")
async def update_organization(
    org_id: int,
    update_data: OrganizationUpdate,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Update an organization. Platform admin only."""
    logger.info(
        f"update_organization - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        org = await org_service.update_organization(org_id, update_data)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )
        logger.info(f"update_organization complete - org_id={org_id}")
        return OrgSchema.model_validate(org)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update organization: {str(e)}",
        )


@router.delete(
    "/orgs/{org_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete organization",
)
async def delete_organization(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
):
    """Delete an organization. Platform admin only."""
    logger.info(
        f"delete_organization - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        success = await org_service.delete_organization(org_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete organization.",
            )
        logger.info(f"delete_organization complete - org_id={org_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_organization failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete organization: {str(e)}",
        )


@router.put("/orgs/{org_id}/members/{user_id}", summary="Move user to organization")
async def assign_user_to_org(
    org_id: int,
    user_id: int,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Assign a user to an organization. Platform admin only."""
    logger.info(
        f"assign_user_to_org - admin_user_id={current_user.user_id}, user_id={user_id}, org_id={org_id}"
    )

    try:
        user = await user_service.assign_to_org(user_id, org_id, current_user)
        logger.info(f"assign_user_to_org complete - user_id={user_id}, org_id={org_id}")
        return {"status": "success", "user_id": user.user_id, "org_id": user.org_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"assign_user_to_org failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to assign user to organization: {str(e)}",
        )


# ==================== Global Stream Management ====================


@router.get(
    "/streams", response_model=List[StreamSchema], summary="List all global streams"
)
async def list_global_streams(
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Get all global streams. Platform admin only."""
    logger.info(f"list_global_streams - admin_user_id={current_user.user_id}")

    try:
        streams = await stream_service.list_global_streams()
        logger.info(f"list_global_streams complete - count={len(streams)}")
        return streams

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_global_streams failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list global streams: {str(e)}",
        )


@router.put(
    "/streams/{stream_id}/scope",
    response_model=StreamSchema,
    summary="Update stream scope to global",
)
async def update_stream_scope_global(
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Change a stream's scope to global. Platform admin only."""
    logger.info(
        f"set_stream_scope_global - admin_user_id={current_user.user_id}, stream_id={stream_id}"
    )

    try:
        stream = await stream_service.update_stream_scope_global(stream_id)
        logger.info(f"set_stream_scope_global complete - stream_id={stream_id}")
        return stream

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"set_stream_scope_global failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update stream scope: {str(e)}",
        )


@router.delete(
    "/streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a global stream",
)
async def delete_global_stream(
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
):
    """Delete a global stream. Platform admin only."""
    logger.info(
        f"delete_global_stream - admin_user_id={current_user.user_id}, stream_id={stream_id}"
    )

    try:
        success = await stream_service.delete_global_stream(stream_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Global stream not found"
            )
        logger.info(f"delete_global_stream complete - stream_id={stream_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_global_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete global stream: {str(e)}",
        )


# ==================== User Management ====================


@router.get("/users", response_model=UserList, summary="List all users")
async def list_all_users(
    org_id: Optional[int] = None,
    role: Optional[UserRoleSchema] = None,
    is_active: Optional[bool] = None,
    limit: int = 100,
    offset: int = 0,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Get all users with optional filters. Platform admin only."""
    logger.info(
        f"list_all_users - admin_user_id={current_user.user_id}, org_id={org_id}, role={role}"
    )

    try:
        users, total = await user_service.list_users(
            org_id=org_id, role=role, is_active=is_active, limit=limit, offset=offset
        )
        logger.info(f"list_all_users complete - total={total}, returned={len(users)}")
        return UserList(
            users=[UserSchema.model_validate(u) for u in users], total=total
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_all_users failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list users: {str(e)}",
        )


@router.put(
    "/users/{user_id}/role", response_model=UserSchema, summary="Update user role"
)
async def update_user_role(
    user_id: int,
    new_role: UserRoleSchema,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Update any user's role. Platform admin only."""
    logger.info(
        f"update_user_role - admin_user_id={current_user.user_id}, user_id={user_id}, new_role={new_role}"
    )

    try:
        user = await user_service.update_role(user_id, new_role, current_user)
        logger.info(
            f"update_user_role complete - user_id={user_id}, new_role={new_role}"
        )
        return UserSchema.model_validate(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_user_role failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update user role: {str(e)}",
        )


@router.delete(
    "/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete a user"
)
async def delete_user(
    user_id: int,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
):
    """Delete a user. Platform admin only."""
    logger.info(
        f"delete_user - admin_user_id={current_user.user_id}, user_id={user_id}"
    )

    try:
        await user_service.delete_user(user_id, current_user)
        logger.info(f"delete_user complete - user_id={user_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_user failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete user: {str(e)}",
        )


# ==================== Invitation Management ====================


class InvitationCreate(BaseModel):
    """Request schema for creating an invitation."""

    email: EmailStr = Field(description="Email address to invite")
    org_id: Optional[int] = Field(
        default=None, description="Organization to assign user to"
    )
    role: UserRoleSchema = Field(
        default=UserRoleSchema.MEMBER, description="Role to assign"
    )
    expires_in_days: int = Field(
        default=7, ge=1, le=30, description="Days until expiration"
    )


class InvitationResponse(BaseModel):
    """Response schema for invitation."""

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


class CreateUserRequest(BaseModel):
    """Request schema for directly creating a user."""

    email: EmailStr = Field(description="User's email address")
    password: str = Field(min_length=5, description="User's password")
    full_name: Optional[str] = Field(default=None, description="User's full name")
    org_id: int = Field(description="Organization to assign user to")
    role: UserRoleSchema = Field(
        default=UserRoleSchema.MEMBER, description="Role to assign"
    )


@router.get(
    "/invitations",
    response_model=List[InvitationResponse],
    summary="List all invitations",
)
async def list_invitations(
    org_id: Optional[int] = None,
    include_accepted: bool = False,
    include_expired: bool = False,
    current_user: User = Depends(require_platform_admin),
    inv_service: InvitationService = Depends(get_invitation_service),
):
    """Get all invitations with optional filters. Platform admin only."""
    logger.info(
        f"list_invitations - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        invitations = await inv_service.list_invitations(
            org_id=org_id,
            include_accepted=include_accepted,
            include_expired=include_expired,
        )
        result = [
            InvitationResponse.model_validate(inv.model_dump()) for inv in invitations
        ]
        logger.info(f"list_invitations complete - count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_invitations failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list invitations: {str(e)}",
        )


@router.post(
    "/invitations",
    response_model=InvitationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new invitation",
)
async def create_invitation(
    invitation: InvitationCreate,
    current_user: User = Depends(require_platform_admin),
    user_service: UserService = Depends(get_user_service),
    inv_service: InvitationService = Depends(get_invitation_service),
):
    """Create an invitation for a new user. Platform admin only."""
    logger.info(
        f"create_invitation - admin_user_id={current_user.user_id}, email={invitation.email}"
    )

    try:
        # Check if email already registered
        existing_user = await user_service.get_user_by_email(invitation.email)
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="User with this email already exists",
            )

        # Validate org_id based on role
        if invitation.role != UserRoleSchema.PLATFORM_ADMIN and not invitation.org_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Organization is required for non-platform-admin roles",
            )

        result = await inv_service.create_invitation(
            email=invitation.email,
            role=invitation.role.value,
            invited_by=current_user.user_id,
            org_id=invitation.org_id,
            expires_in_days=invitation.expires_in_days,
        )
        logger.info(f"create_invitation complete - email={invitation.email}")
        return InvitationResponse.model_validate(result.model_dump())

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_invitation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create invitation: {str(e)}",
        )


@router.delete(
    "/invitations/{invitation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Revoke an invitation",
)
async def revoke_invitation(
    invitation_id: int,
    current_user: User = Depends(require_platform_admin),
    inv_service: InvitationService = Depends(get_invitation_service),
):
    """Revoke an invitation. Platform admin only."""
    logger.info(
        f"revoke_invitation - admin_user_id={current_user.user_id}, invitation_id={invitation_id}"
    )

    try:
        success = await inv_service.revoke_invitation(invitation_id)
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Invitation not found"
            )
        logger.info(f"revoke_invitation complete - invitation_id={invitation_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"revoke_invitation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to revoke invitation: {str(e)}",
        )


@router.post(
    "/users/create",
    response_model=UserSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a user directly",
)
async def create_user_directly(
    user_data: CreateUserRequest,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
    user_service: UserService = Depends(get_user_service),
):
    """Create a user directly without invitation. Platform admin only."""
    logger.info(
        f"create_user_directly - admin_user_id={current_user.user_id}, email={user_data.email}"
    )

    try:
        # Verify organization exists
        org = await org_service.get_organization(user_data.org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )

        user = await user_service.create_user(
            email=user_data.email,
            password=user_data.password,
            full_name=user_data.full_name,
            role=user_data.role,
            org_id=user_data.org_id,
        )
        logger.info(f"create_user_directly complete - new_user_id={user.user_id}")
        return UserSchema.model_validate(user)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_user_directly failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create user: {str(e)}",
        )


# ==================== Organization Stream Subscriptions ====================


@router.get(
    "/orgs/{org_id}/global-streams",
    response_model=List[StreamSubscriptionStatus],
    summary="List global streams with subscription status for an org",
)
async def list_org_global_stream_subscriptions(
    org_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
    sub_service: SubscriptionService = Depends(get_subscription_service),
):
    """Get all global streams with subscription status for an org. Platform admin only."""
    logger.info(
        f"list_org_global_stream_subscriptions - admin_user_id={current_user.user_id}, org_id={org_id}"
    )

    try:
        org = await org_service.get_organization(org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )

        result = await sub_service.get_global_streams_for_org(org_id)
        logger.info(f"list_org_global_stream_subscriptions complete - org_id={org_id}")
        return result.streams

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_org_global_stream_subscriptions failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list global stream subscriptions: {str(e)}",
        )


@router.post(
    "/orgs/{org_id}/global-streams/{stream_id}",
    status_code=status.HTTP_201_CREATED,
    summary="Subscribe an org to a global stream",
)
async def subscribe_org_to_global_stream(
    org_id: int,
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    org_service: OrganizationService = Depends(get_organization_service),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    sub_service: SubscriptionService = Depends(get_subscription_service),
):
    """Subscribe an organization to a global stream. Platform admin only."""
    logger.info(
        f"subscribe_org_to_global_stream - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}"
    )

    try:
        org = await org_service.get_organization(org_id)
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found"
            )

        stream = await stream_service.get_global_stream(stream_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Global stream not found"
            )

        await sub_service.subscribe_org_to_global_stream(
            org_id, stream_id, current_user.user_id
        )
        logger.info(
            f"subscribe_org_to_global_stream complete - org_id={org_id}, stream_id={stream_id}"
        )
        return {"status": "subscribed", "org_id": org_id, "stream_id": stream_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"subscribe_org_to_global_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to subscribe to global stream: {str(e)}",
        )


@router.delete(
    "/orgs/{org_id}/global-streams/{stream_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unsubscribe an org from a global stream",
)
async def unsubscribe_org_from_global_stream(
    org_id: int,
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    sub_service: SubscriptionService = Depends(get_subscription_service),
):
    """Unsubscribe an organization from a global stream. Platform admin only."""
    logger.info(
        f"unsubscribe_org_from_global_stream - admin_user_id={current_user.user_id}, org_id={org_id}, stream_id={stream_id}"
    )

    try:
        success = await sub_service.unsubscribe_org_from_global_stream(
            org_id, stream_id
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found"
            )
        logger.info(
            f"unsubscribe_org_from_global_stream complete - org_id={org_id}, stream_id={stream_id}"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"unsubscribe_org_from_global_stream failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to unsubscribe from global stream: {str(e)}",
        )


# ==================== Chat System Configuration ====================


class PayloadTypeInfo(BaseModel):
    """Info about a registered payload type."""

    name: str
    description: str
    source: str
    is_global: bool
    parse_marker: Optional[str] = None
    has_parser: bool = False
    has_instructions: bool = False
    schema: Optional[dict] = None  # JSON Schema for the payload data

    class Config:
        from_attributes = True


class ToolInfo(BaseModel):
    """Info about a registered tool."""

    name: str
    description: str
    category: str
    is_global: bool
    payload_type: Optional[str] = None
    streaming: bool = False
    input_schema: Optional[dict] = None

    class Config:
        from_attributes = True


class SubTabConfigInfo(BaseModel):
    """Info about a subtab configuration."""

    payloads: List[str]
    tools: List[str]


class TabConfigInfo(BaseModel):
    """Info about a tab configuration."""

    payloads: List[str]
    tools: List[str]
    subtabs: dict[str, SubTabConfigInfo] = {}


class PageConfigInfo(BaseModel):
    """Info about a page configuration."""

    page: str
    has_context_builder: bool
    payloads: List[str]
    tools: List[str]
    tabs: dict[str, TabConfigInfo]
    client_actions: List[str]


class StreamInstructionsInfo(BaseModel):
    """Info about a stream's chat instructions."""

    stream_id: int
    stream_name: str
    has_instructions: bool
    instructions_preview: Optional[str] = None


class ChatConfigResponse(BaseModel):
    """Complete chat system configuration."""

    payload_types: List[PayloadTypeInfo]
    tools: List[ToolInfo]
    pages: List[PageConfigInfo]
    stream_instructions: List[StreamInstructionsInfo]
    summary: dict


@router.get(
    "/chat-config",
    response_model=ChatConfigResponse,
    summary="Get chat system configuration",
)
async def get_chat_config(
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    db: AsyncSession = Depends(get_async_db),
):
    """Get complete chat system configuration. Platform admin only."""
    logger.info(f"get_chat_config - admin_user_id={current_user.user_id}")

    try:
        from schemas.payloads import get_all_payload_types
        from tools.registry import get_all_tools
        import services.chat_page_config  # Import package to trigger page registrations
        from services.chat_page_config.registry import _page_registry

        # Get all payload types
        payload_types = []
        for pt in get_all_payload_types():
            payload_types.append(
                PayloadTypeInfo(
                    name=pt.name,
                    description=pt.description,
                    source=pt.source,
                    is_global=pt.is_global,
                    parse_marker=pt.parse_marker,
                    has_parser=pt.parser is not None,
                    has_instructions=pt.llm_instructions is not None
                    and len(pt.llm_instructions) > 0,
                    schema=pt.schema,
                )
            )

        # Get all tools
        tools = []
        for tool in get_all_tools():
            tools.append(
                ToolInfo(
                    name=tool.name,
                    description=tool.description,
                    category=tool.category,
                    is_global=tool.is_global,
                    payload_type=tool.payload_type,
                    streaming=tool.streaming,
                    input_schema=tool.input_schema,
                )
            )

        # Get all page configs
        pages = []
        for page_name, config in _page_registry.items():
            tabs_info = {}
            for tab_name, tab_config in config.tabs.items():
                subtabs_info = {}
                for subtab_name, subtab_config in tab_config.subtabs.items():
                    subtabs_info[subtab_name] = SubTabConfigInfo(
                        payloads=subtab_config.payloads, tools=subtab_config.tools
                    )
                tabs_info[tab_name] = TabConfigInfo(
                    payloads=tab_config.payloads,
                    tools=tab_config.tools,
                    subtabs=subtabs_info,
                )
            pages.append(
                PageConfigInfo(
                    page=page_name,
                    has_context_builder=config.context_builder is not None,
                    payloads=config.payloads,
                    tools=config.tools,
                    tabs=tabs_info,
                    client_actions=[ca.action for ca in config.client_actions],
                )
            )

        # Get stream chat config from chat_config table
        streams_data = await stream_service.get_all_streams_basic_info()

        config_result = await db.execute(
            select(ChatConfig).where(ChatConfig.scope == "stream")
        )
        configs_by_stream = {cc.scope_key: cc.content for cc in config_result.scalars().all()}

        stream_instructions = []
        for s in streams_data:
            stream_key = str(s["stream_id"])
            content = configs_by_stream.get(stream_key)
            has_content = content is not None and len(content.strip()) > 0
            preview = None
            if has_content and content:
                preview = content[:200] + "..." if len(content) > 200 else content

            stream_instructions.append(
                StreamInstructionsInfo(
                    stream_id=s["stream_id"],
                    stream_name=s["stream_name"],
                    has_instructions=has_content,
                    instructions_preview=preview,
                )
            )

        # Build summary
        streams_with_instructions = len(
            [s for s in stream_instructions if s.has_instructions]
        )
        summary = {
            "total_payload_types": len(payload_types),
            "global_payloads": len([p for p in payload_types if p.is_global]),
            "llm_payloads": len([p for p in payload_types if p.source == "llm"]),
            "tool_payloads": len([p for p in payload_types if p.source == "tool"]),
            "total_tools": len(tools),
            "global_tools": len([t for t in tools if t.is_global]),
            "total_pages": len(pages),
            "total_streams": len(stream_instructions),
            "streams_with_instructions": streams_with_instructions,
        }

        logger.info(
            f"get_chat_config complete - payloads={len(payload_types)}, tools={len(tools)}, pages={len(pages)}"
        )
        return ChatConfigResponse(
            payload_types=payload_types,
            tools=tools,
            pages=pages,
            stream_instructions=stream_instructions,
            summary=summary,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_chat_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get chat config: {str(e)}",
        )


# ==================== Unified Chat Config Management ====================


class ChatConfigUpdate(BaseModel):
    """Request body for updating chat config."""

    content: Optional[str] = None  # instructions (stream) or persona (page)


class StreamChatConfig(BaseModel):
    """Stream chat config info."""

    stream_id: int
    stream_name: str
    content: Optional[str] = None  # Stream instructions
    has_override: bool = False


class PageChatConfig(BaseModel):
    """Page chat config info."""

    page: str
    content: Optional[str] = None  # Page persona
    has_override: bool = False
    default_content: Optional[str] = None
    default_is_global: bool = False  # True if using global default


@router.get(
    "/chat-config/streams",
    response_model=List[StreamChatConfig],
    summary="List all stream chat configs",
)
async def list_stream_configs(
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    db: AsyncSession = Depends(get_async_db),
) -> List[StreamChatConfig]:
    """Get all streams with their chat config (platform admin only)."""
    try:
        # Get all streams
        streams_data = await stream_service.get_all_streams_basic_info()

        # Get content from chat_config table (only include non-empty content)
        result = await db.execute(
            select(ChatConfig).where(ChatConfig.scope == "stream")
        )
        configs_by_stream = {
            cc.scope_key: cc.content
            for cc in result.scalars().all()
            if cc.content and cc.content.strip()
        }

        configs = []
        for stream in streams_data:
            stream_key = str(stream["stream_id"])
            content = configs_by_stream.get(stream_key)

            configs.append(
                StreamChatConfig(
                    stream_id=stream["stream_id"],
                    stream_name=stream["stream_name"],
                    content=content,
                    has_override=content is not None,
                )
            )

        return configs

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_stream_configs failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list stream configs: {str(e)}",
        )


@router.get(
    "/chat-config/streams/{stream_id}",
    response_model=StreamChatConfig,
    summary="Get stream chat config",
)
async def get_stream_config(
    stream_id: int,
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    db: AsyncSession = Depends(get_async_db),
) -> StreamChatConfig:
    """Get chat config for a stream (platform admin only)."""
    try:
        stream = await stream_service.get_stream_by_id(stream_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stream {stream_id} not found",
            )

        # Check for override
        result = await db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "stream",
                ChatConfig.scope_key == str(stream_id)
            )
        )
        override = result.scalars().first()

        content = override.content if override and override.content and override.content.strip() else None
        return StreamChatConfig(
            stream_id=stream.stream_id,
            stream_name=stream.stream_name,
            content=content,
            has_override=content is not None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_stream_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get stream config: {str(e)}",
        )


@router.put(
    "/chat-config/streams/{stream_id}",
    response_model=StreamChatConfig,
    summary="Update stream chat config",
)
async def update_stream_config(
    stream_id: int,
    update: ChatConfigUpdate,
    current_user: User = Depends(require_platform_admin),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    db: AsyncSession = Depends(get_async_db),
) -> StreamChatConfig:
    """Update chat config for a stream (platform admin only)."""
    try:
        stream = await stream_service.get_stream_by_id(stream_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stream {stream_id} not found",
            )

        scope_key = str(stream_id)

        # Check for existing config
        result = await db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "stream",
                ChatConfig.scope_key == scope_key
            )
        )
        existing = result.scalars().first()

        if existing:
            existing.content = update.content
            existing.updated_at = datetime.utcnow()
            existing.updated_by = current_user.user_id
        else:
            new_config = ChatConfig(
                scope="stream",
                scope_key=scope_key,
                content=update.content,
                updated_by=current_user.user_id,
            )
            db.add(new_config)

        await db.commit()

        logger.info(f"User {current_user.email} updated chat config for stream {stream_id}")

        return StreamChatConfig(
            stream_id=stream.stream_id,
            stream_name=stream.stream_name,
            content=update.content,
            has_override=True,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_stream_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update stream config: {str(e)}",
        )


@router.get(
    "/chat-config/pages",
    response_model=List[PageChatConfig],
    summary="List all page chat configs",
)
async def list_page_configs(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db),
) -> List[PageChatConfig]:
    """Get all pages with their chat config (platform admin only)."""
    import services.chat_page_config  # Import package to trigger page registrations
    from services.chat_page_config.registry import _page_registry, get_persona
    from services.chat_stream_service import ChatStreamService

    # Get global default persona
    global_default = ChatStreamService.DEFAULT_PAGE_INSTRUCTIONS

    try:
        # Get all database overrides
        result = await db.execute(
            select(ChatConfig).where(ChatConfig.scope == "page")
        )
        db_overrides = {cc.scope_key: cc.content for cc in result.scalars().all()}

        # Build response
        configs = []
        for page in _page_registry.keys():
            db_content = db_overrides.get(page)
            code_default = get_persona(page)
            default_content = code_default or global_default

            configs.append(
                PageChatConfig(
                    page=page,
                    content=db_content if db_content else default_content,
                    has_override=db_content is not None,
                    default_content=default_content,
                    default_is_global=code_default is None,
                )
            )

        configs.sort(key=lambda x: x.page)
        logger.info(f"list_page_configs - count={len(configs)}")
        return configs

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_page_configs failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list page configs: {str(e)}",
        )


@router.get(
    "/chat-config/pages/{page}",
    response_model=PageChatConfig,
    summary="Get page chat config",
)
async def get_page_config(
    page: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db),
) -> PageChatConfig:
    """Get chat config for a page (platform admin only)."""
    import services.chat_page_config  # Import package to trigger page registrations
    from services.chat_page_config.registry import _page_registry, get_persona
    from services.chat_stream_service import ChatStreamService

    global_default = ChatStreamService.DEFAULT_PAGE_INSTRUCTIONS

    try:
        if not _page_registry.get(page):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page '{page}' not found",
            )

        # Check for database override
        result = await db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "page",
                ChatConfig.scope_key == page
            )
        )
        db_config = result.scalars().first()
        db_content = db_config.content if db_config else None

        code_default = get_persona(page)
        default_content = code_default or global_default

        return PageChatConfig(
            page=page,
            content=db_content if db_content else default_content,
            has_override=db_content is not None,
            default_content=default_content,
            default_is_global=code_default is None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_page_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get page config: {str(e)}",
        )


@router.put(
    "/chat-config/pages/{page}",
    response_model=PageChatConfig,
    summary="Update page chat config",
)
async def update_page_config(
    page: str,
    update: ChatConfigUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db),
) -> PageChatConfig:
    """Update chat config for a page (platform admin only)."""
    import services.chat_page_config  # Import package to trigger page registrations
    from services.chat_page_config.registry import _page_registry, get_persona
    from services.chat_stream_service import ChatStreamService

    global_default = ChatStreamService.DEFAULT_PAGE_INSTRUCTIONS

    try:
        if not _page_registry.get(page):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page '{page}' not found",
            )

        # Check for existing override
        result = await db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "page",
                ChatConfig.scope_key == page
            )
        )
        existing = result.scalars().first()

        if existing:
            existing.content = update.content
            existing.updated_at = datetime.utcnow()
            existing.updated_by = current_user.user_id
        else:
            new_config = ChatConfig(
                scope="page",
                scope_key=page,
                content=update.content,
                updated_by=current_user.user_id,
            )
            db.add(new_config)

        await db.commit()

        logger.info(f"User {current_user.email} updated chat config for page '{page}'")

        code_default = get_persona(page)
        default_content = code_default or global_default

        return PageChatConfig(
            page=page,
            content=update.content if update.content else default_content,
            has_override=update.content is not None and len(update.content.strip()) > 0,
            default_content=default_content,
            default_is_global=code_default is None,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_page_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update page config: {str(e)}",
        )


@router.delete(
    "/chat-config/pages/{page}",
    summary="Delete page chat config override",
)
async def delete_page_config(
    page: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db),
) -> Dict[str, str]:
    """Delete chat config override for a page, reverting to default (platform admin only)."""
    import services.chat_page_config  # Import package to trigger page registrations
    from services.chat_page_config.registry import _page_registry

    try:
        config = _page_registry.get(page)
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page '{page}' not found",
            )

        # Delete override if exists
        result = await db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "page",
                ChatConfig.scope_key == page
            )
        )
        existing = result.scalars().first()

        if existing:
            await db.delete(existing)
            await db.commit()
            logger.info(f"User {current_user.email} deleted chat config for page '{page}'")
            return {"status": "deleted", "page": page}
        else:
            return {"status": "no_override", "page": page}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_page_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete page config: {str(e)}",
        )


# =============================================================================
# System Chat Config
# =============================================================================

class SystemConfigResponse(BaseModel):
    """System configuration settings."""
    max_tool_iterations: int = Field(description="Maximum tool call iterations per chat request")
    global_preamble: Optional[str] = Field(None, description="Global preamble override (None = use default)")
    default_global_preamble: str = Field(description="Default global preamble from code")


class SystemConfigUpdate(BaseModel):
    """Update system configuration."""
    max_tool_iterations: Optional[int] = Field(None, ge=1, le=20, description="Max tool iterations (1-20)")
    global_preamble: Optional[str] = Field(None, description="Global preamble override")
    clear_global_preamble: bool = Field(False, description="Set to True to remove preamble override")


@router.get(
    "/chat-config/system",
    response_model=SystemConfigResponse,
    summary="Get system chat configuration",
)
async def get_system_config_endpoint(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db),
) -> SystemConfigResponse:
    """Get system-wide chat configuration settings (platform admin only)."""
    from services.chat_service import ChatService
    from services.chat_stream_service import ChatStreamService

    try:
        chat_service = ChatService(db)
        config = await chat_service.get_system_config()
        return SystemConfigResponse(
            **config,
            default_global_preamble=ChatStreamService.GLOBAL_PREAMBLE
        )
    except Exception as e:
        logger.error(f"get_system_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get system config: {str(e)}",
        )


@router.put(
    "/chat-config/system",
    response_model=SystemConfigResponse,
    summary="Update system chat configuration",
)
async def update_system_config_endpoint(
    update: SystemConfigUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db),
) -> SystemConfigResponse:
    """Update system-wide chat configuration settings (platform admin only)."""
    from services.chat_service import ChatService
    from services.chat_stream_service import ChatStreamService

    try:
        chat_service = ChatService(db)
        config = await chat_service.update_system_config(
            user_id=current_user.user_id,
            max_tool_iterations=update.max_tool_iterations,
            global_preamble=update.global_preamble,
            clear_global_preamble=update.clear_global_preamble
        )
        return SystemConfigResponse(
            **config,
            default_global_preamble=ChatStreamService.GLOBAL_PREAMBLE
        )
    except Exception as e:
        logger.error(f"update_system_config failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update system config: {str(e)}",
        )


# ==================== Artifact Management ====================


# --- Artifact Categories ---


class ArtifactCategoryCreate(BaseModel):
    """Request schema for creating an artifact category."""
    name: str = Field(..., min_length=1, max_length=100, description="Category name")


class ArtifactCategoryRename(BaseModel):
    """Request schema for renaming an artifact category."""
    name: str = Field(..., min_length=1, max_length=100, description="New category name")


class ArtifactCategoryBulkCreate(BaseModel):
    """Request schema for bulk creating artifact categories."""
    names: List[str] = Field(..., min_length=1, description="List of category names to create")


@router.get(
    "/artifact-categories",
    response_model=List[ArtifactCategorySchema],
    summary="List all artifact categories",
)
async def list_artifact_categories(
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Get all artifact categories. Platform admin only."""
    try:
        cats = await artifact_service.list_categories()
        return [ArtifactCategorySchema.model_validate(c, from_attributes=True) for c in cats]
    except Exception as e:
        logger.error(f"list_artifact_categories failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list artifact categories: {str(e)}",
        )


@router.post(
    "/artifact-categories",
    response_model=ArtifactCategorySchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create an artifact category",
)
async def create_artifact_category(
    data: ArtifactCategoryCreate,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Create a new artifact category. Platform admin only."""
    try:
        cat = await artifact_service.create_category(name=data.name)
        return ArtifactCategorySchema.model_validate(cat, from_attributes=True)
    except Exception as e:
        logger.error(f"create_artifact_category failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create artifact category: {str(e)}",
        )


@router.post(
    "/artifact-categories/bulk",
    response_model=List[ArtifactCategorySchema],
    status_code=status.HTTP_201_CREATED,
    summary="Bulk create artifact categories",
)
async def bulk_create_artifact_categories(
    data: ArtifactCategoryBulkCreate,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Create multiple artifact categories at once. Skips names that already exist. Platform admin only."""
    try:
        existing = await artifact_service.list_categories()
        existing_names = {c.name.lower() for c in existing}
        created = []
        for name in data.names:
            if name.strip().lower() not in existing_names:
                cat = await artifact_service.create_category(name=name.strip())
                created.append(ArtifactCategorySchema.model_validate(cat, from_attributes=True))
                existing_names.add(name.strip().lower())
        return created
    except Exception as e:
        logger.error(f"bulk_create_artifact_categories failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk create artifact categories: {str(e)}",
        )


@router.delete(
    "/artifact-categories/{category_id}",
    summary="Delete an artifact category",
)
async def delete_artifact_category(
    category_id: int,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Delete an artifact category by ID. Returns affected artifact count. Platform admin only."""
    try:
        result = await artifact_service.delete_category(category_id)
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
            )
        name, affected_count = result
        return {"name": name, "affected_count": affected_count}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_artifact_category failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete artifact category: {str(e)}",
        )


@router.put(
    "/artifact-categories/{category_id}",
    response_model=ArtifactCategorySchema,
    summary="Rename an artifact category",
)
async def rename_artifact_category(
    category_id: int,
    data: ArtifactCategoryRename,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Rename an artifact category. Artifacts reference by FK so they automatically reflect the new name. Platform admin only."""
    try:
        cat = await artifact_service.rename_category(category_id, new_name=data.name)
        if not cat:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Category not found"
            )
        return ArtifactCategorySchema.model_validate(cat, from_attributes=True)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"rename_artifact_category failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to rename artifact category: {str(e)}",
        )


# --- Artifacts ---


class ArtifactBulkUpdate(BaseModel):
    """Request schema for bulk-updating artifacts."""
    ids: List[int] = Field(..., min_length=1, description="Artifact IDs to update")
    status: Optional[str] = Field(None, description="New status for all")
    category: Optional[str] = Field(None, description="New category for all (empty string to clear)")
    priority: Optional[str] = Field(None, description="New priority for all (empty string to clear)")
    area: Optional[str] = Field(None, description="New area for all (empty string to clear)")


class ArtifactCreate(BaseModel):
    """Request schema for creating an artifact."""

    title: str = Field(..., min_length=1, max_length=255, description="Artifact title")
    artifact_type: str = Field(..., description="Type: 'bug', 'feature', or 'task'")
    description: Optional[str] = Field(None, description="Artifact description")
    category: Optional[str] = Field(None, max_length=100, description="Category tag")
    priority: Optional[str] = Field(None, description="Priority: 'urgent', 'high', 'medium', or 'low'")
    status: Optional[str] = Field(None, description="Status: 'new', 'open', 'in_progress', 'icebox', or 'closed'. Defaults to 'new'.")
    area: Optional[str] = Field(None, description="Functional area: 'login_auth', 'user_prefs', 'streams', etc.")


_UNSET = object()


class ArtifactUpdate(BaseModel):
    """Request schema for updating an artifact."""

    model_config = {"arbitrary_types_allowed": True}

    title: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    status: Optional[str] = None
    artifact_type: Optional[str] = None
    category: Optional[str] = Field(default=_UNSET, max_length=100)
    priority: Optional[str] = Field(default=_UNSET)
    area: Optional[str] = Field(default=_UNSET)


@router.get(
    "/artifacts",
    response_model=List[ArtifactSchema],
    summary="List all artifacts",
)
async def list_artifacts(
    type: Optional[str] = None,
    status_filter: Optional[str] = None,
    category: Optional[str] = None,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Get all artifacts with optional type, status, and category filters. Platform admin only."""
    logger.info(
        f"list_artifacts - admin_user_id={current_user.user_id}, type={type}, status={status_filter}, category={category}"
    )

    try:
        artifacts = await artifact_service.list_artifacts(
            artifact_type=type, status=status_filter, category=category
        )
        result = [ArtifactSchema.model_validate(a, from_attributes=True) for a in artifacts]
        logger.info(f"list_artifacts complete - count={len(result)}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_artifacts failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list artifacts: {str(e)}",
        )


@router.get(
    "/artifacts/{artifact_id}",
    response_model=ArtifactSchema,
    summary="Get artifact by ID",
)
async def get_artifact(
    artifact_id: int,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Get a single artifact by ID. Platform admin only."""
    logger.info(
        f"get_artifact - admin_user_id={current_user.user_id}, artifact_id={artifact_id}"
    )

    try:
        artifact = await artifact_service.get_artifact_by_id(artifact_id)
        if not artifact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found"
            )
        logger.info(f"get_artifact complete - artifact_id={artifact_id}")
        return ArtifactSchema.model_validate(artifact, from_attributes=True)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_artifact failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get artifact: {str(e)}",
        )


@router.post(
    "/artifacts",
    response_model=ArtifactSchema,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new artifact",
)
async def create_artifact(
    data: ArtifactCreate,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Create a new artifact. Platform admin only."""
    logger.info(
        f"create_artifact - admin_user_id={current_user.user_id}, title={data.title}, type={data.artifact_type}"
    )

    try:
        artifact = await artifact_service.create_artifact(
            title=data.title,
            artifact_type=data.artifact_type,
            created_by=current_user.user_id,
            description=data.description,
            category=data.category,
            priority=data.priority,
            status=data.status,
            area=data.area,
        )
        logger.info(f"create_artifact complete - artifact_id={artifact.id}")
        return ArtifactSchema.model_validate(artifact, from_attributes=True)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_artifact failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create artifact: {str(e)}",
        )


@router.put(
    "/artifacts/{artifact_id}",
    response_model=ArtifactSchema,
    summary="Update an artifact",
)
async def update_artifact(
    artifact_id: int,
    data: ArtifactUpdate,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Update an existing artifact. Platform admin only."""
    logger.info(
        f"update_artifact - admin_user_id={current_user.user_id}, artifact_id={artifact_id}"
    )

    try:
        kwargs = dict(
            artifact_id=artifact_id,
            title=data.title,
            description=data.description,
            status=data.status,
            artifact_type=data.artifact_type,
        )
        if data.category is not _UNSET:
            kwargs["category"] = data.category
        if data.priority is not _UNSET:
            kwargs["priority"] = data.priority
        if data.area is not _UNSET:
            kwargs["area"] = data.area
        kwargs["updated_by"] = current_user.user_id
        artifact = await artifact_service.update_artifact(**kwargs)
        if not artifact:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found"
            )
        logger.info(f"update_artifact complete - artifact_id={artifact_id}")
        return ArtifactSchema.model_validate(artifact, from_attributes=True)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_artifact failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update artifact: {str(e)}",
        )


@router.delete(
    "/artifacts/{artifact_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an artifact",
)
async def delete_artifact(
    artifact_id: int,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Delete an artifact by ID. Platform admin only."""
    logger.info(
        f"delete_artifact - admin_user_id={current_user.user_id}, artifact_id={artifact_id}"
    )

    try:
        title = await artifact_service.delete_artifact(artifact_id)
        if not title:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Artifact not found"
            )
        logger.info(f"delete_artifact complete - artifact_id={artifact_id}, title={title}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_artifact failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete artifact: {str(e)}",
        )


@router.post(
    "/artifacts/bulk-update",
    summary="Bulk update artifacts",
)
async def bulk_update_artifacts(
    data: ArtifactBulkUpdate,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Bulk update status and/or category for multiple artifacts. Platform admin only."""
    logger.info(
        f"bulk_update_artifacts - admin_user_id={current_user.user_id}, ids={data.ids}, status={data.status}, category={data.category}"
    )

    try:
        count = await artifact_service.bulk_update_artifacts(
            artifact_ids=data.ids,
            status=data.status,
            category=data.category,
            priority=data.priority,
            area=data.area,
            updated_by=current_user.user_id,
        )
        return {"updated": count}

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"bulk_update_artifacts failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk update artifacts: {str(e)}",
        )


class ArtifactBulkDelete(BaseModel):
    """Request schema for bulk-deleting artifacts."""
    ids: List[int] = Field(..., min_length=1, description="Artifact IDs to delete")


@router.post(
    "/artifacts/bulk-delete",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Bulk delete artifacts",
)
async def bulk_delete_artifacts(
    data: ArtifactBulkDelete,
    current_user: User = Depends(require_platform_admin),
    artifact_service: ArtifactService = Depends(get_artifact_service),
):
    """Bulk delete multiple artifacts by ID. Platform admin only."""
    logger.info(
        f"bulk_delete_artifacts - admin_user_id={current_user.user_id}, ids={data.ids}"
    )

    try:
        for artifact_id in data.ids:
            await artifact_service.delete_artifact(artifact_id)

    except Exception as e:
        logger.error(f"bulk_delete_artifacts failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to bulk delete artifacts: {str(e)}",
        )
