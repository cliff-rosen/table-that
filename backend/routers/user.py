"""
User API endpoints for user profile management.
Accessed via the profile icon in the top nav.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional
import logging

from database import get_async_db
from models import User, UserRole
from schemas.user import User as UserSchema
from services import auth_service
from services.user_service import UserService, get_user_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/user", tags=["user"])


# ============== Request Schemas ==============

class UserUpdate(BaseModel):
    """Request schema for updating user profile."""
    full_name: Optional[str] = Field(None, min_length=1, max_length=255)
    job_title: Optional[str] = Field(None, max_length=255)


class PasswordChange(BaseModel):
    """Request schema for changing password."""
    current_password: str = Field(..., min_length=1, description="Current password")
    new_password: str = Field(..., min_length=8, description="New password (min 8 characters)")


# ============== Endpoints ==============

@router.get(
    "/me",
    response_model=UserSchema,
    summary="Get current user profile"
)
async def get_current_user(
    current_user: User = Depends(auth_service.validate_token)
):
    """
    Get the current user's profile information.
    This is the main endpoint for the profile page.
    """
    return UserSchema.model_validate(current_user)


@router.put(
    "/me",
    response_model=UserSchema,
    summary="Update current user profile"
)
async def update_current_user(
    updates: UserUpdate,
    current_user: User = Depends(auth_service.validate_token),
    user_service: UserService = Depends(get_user_service)
):
    """
    Update the current user's profile.

    Updateable fields:
    - full_name: User's display name
    - job_title: User's job title
    """
    update_dict = updates.model_dump(exclude_unset=True)
    if not update_dict:
        # No updates provided, return current user
        return UserSchema.model_validate(current_user)

    updated_user = await user_service.update_user(
        user_id=current_user.user_id,
        updates=update_dict
    )

    return UserSchema.model_validate(updated_user)


@router.post(
    "/me/password",
    summary="Change current user's password"
)
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(auth_service.validate_token),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Change the current user's password.

    Requires:
    - current_password: The user's current password for verification
    - new_password: The new password (minimum 8 characters)
    """
    # Verify current password
    if not auth_service.verify_password(password_data.current_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    # Hash and save new password
    new_hashed_password = auth_service.get_password_hash(password_data.new_password)
    current_user.password = new_hashed_password
    await db.commit()

    logger.info(f"Password changed for user {current_user.user_id}")

    return {"message": "Password changed successfully"}


# ============== Admin Users ==============

class AdminUserResponse(BaseModel):
    """Response schema for admin user list."""
    user_id: int
    email: str
    display_name: str


@router.get(
    "/admins",
    response_model=list[AdminUserResponse],
    summary="Get list of admin users"
)
async def get_admin_users(
    current_user: User = Depends(auth_service.validate_token),
    user_service: UserService = Depends(get_user_service)
):
    """
    Get list of admin users who can approve reports.
    Returns platform admins and organization admins for the user's organization.
    """
    admins = await user_service.get_admin_users_for_approval(
        org_id=current_user.org_id,
        exclude_user_id=current_user.user_id
    )

    return [
        AdminUserResponse(
            user_id=admin.user_id,
            email=admin.email,
            display_name=admin.full_name or admin.email
        )
        for admin in admins
    ]
