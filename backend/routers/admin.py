"""
Platform admin API endpoints.
Requires platform_admin role for all operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime
import logging

from models import User, UserRole
from services import auth_service
from services.organization_service import OrganizationService, get_organization_service
from services.user_service import UserService, get_user_service
from services.invitation_service import InvitationService, get_invitation_service
from schemas.organization import (
    Organization as OrgSchema,
    OrganizationUpdate,
    OrganizationWithStats,
)
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
