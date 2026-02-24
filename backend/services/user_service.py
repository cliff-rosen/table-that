"""
User Service - Single source of truth for all user operations.

This service owns:
- User CRUD operations
- Role management
- Organization assignment
- User queries and listing

Authentication (tokens, passwords) is handled by auth_service.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update, delete
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
from fastapi import HTTPException, status, Depends
from passlib.context import CryptContext
import logging

from models import (
    User as UserModel, Organization, UserRole as UserRoleModel,
    Conversation, UserEvent, PipelineExecution, UserFeedback,
    UserStreamSubscription, ReportEmailQueue, ReportSchedule,
    CurationEvent, ToolTrace, Report, ResearchStream,
    OrgStreamSubscription, ChatConfig, HelpContentOverride, Artifact,
    ReportArticleAssociation, WipArticle,
)
from schemas.user import UserRole, OrgMember
from database import get_async_db

logger = logging.getLogger(__name__)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class UserService:
    """Service for user management operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Permission Helpers ====================

    def is_platform_admin(self, user: UserModel) -> bool:
        """Check if user is a platform admin."""
        return user.role == UserRoleModel.PLATFORM_ADMIN

    def is_org_admin(self, user: UserModel) -> bool:
        """Check if user is an org admin (or higher)."""
        return user.role in (UserRoleModel.PLATFORM_ADMIN, UserRoleModel.ORG_ADMIN)

    async def can_manage_user(self, manager: UserModel, target_user_id: int) -> bool:
        """Check if manager can manage target user."""
        if self.is_platform_admin(manager):
            return True

        if self.is_org_admin(manager):
            target = await self.get_user_by_id(target_user_id)
            if target and target.org_id == manager.org_id:
                return True

        return False

    # ==================== Async Methods ====================

    async def get_user_by_id(self, user_id: int) -> Optional[UserModel]:
        """Get user by ID (async). Returns None if not found."""
        result = await self.db.execute(
            select(UserModel).where(UserModel.user_id == user_id)
        )
        return result.scalars().first()

    async def get_user_by_email(self, email: str) -> Optional[UserModel]:
        """Get user by email (async)."""
        result = await self.db.execute(
            select(UserModel).where(UserModel.email == email)
        )
        return result.scalars().first()

    async def get_user_by_login_token(self, token: str) -> Optional[UserModel]:
        """Get user by valid (non-expired) login token (async)."""
        result = await self.db.execute(
            select(UserModel).where(
                UserModel.login_token == token,
                UserModel.login_token_expires > datetime.utcnow()
            )
        )
        return result.scalars().first()

    async def get_user_by_password_reset_token(self, token: str) -> Optional[UserModel]:
        """Get user by valid (non-expired) password reset token (async)."""
        result = await self.db.execute(
            select(UserModel).where(
                UserModel.password_reset_token == token,
                UserModel.password_reset_token_expires > datetime.utcnow()
            )
        )
        return result.scalars().first()

    async def list_users(
        self,
        org_id: Optional[int] = None,
        role: Optional[UserRole] = None,
        is_active: Optional[bool] = None,
        limit: int = 100,
        offset: int = 0
    ) -> Tuple[List[UserModel], int]:
        """List users with optional filters (async)."""
        # Build where clauses
        where_clauses = []
        if org_id is not None:
            where_clauses.append(UserModel.org_id == org_id)
        if role is not None:
            where_clauses.append(UserModel.role == UserRoleModel(role.value))
        if is_active is not None:
            where_clauses.append(UserModel.is_active == is_active)

        # Get total count
        count_stmt = select(func.count(UserModel.user_id))
        if where_clauses:
            count_stmt = count_stmt.where(*where_clauses)
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get users
        stmt = select(UserModel).order_by(UserModel.user_id).offset(offset).limit(limit)
        if where_clauses:
            stmt = stmt.where(*where_clauses)
        result = await self.db.execute(stmt)
        users = list(result.scalars().all())

        return users, total

    async def get_org_members(self, org_id: int) -> List[OrgMember]:
        """Get all members of an organization (async)."""
        result = await self.db.execute(
            select(UserModel)
            .where(UserModel.org_id == org_id)
            .order_by(UserModel.full_name, UserModel.email)
        )
        users = result.scalars().all()

        return [
            OrgMember(
                user_id=u.user_id,
                email=u.email,
                full_name=u.full_name,
                role=UserRole(u.role.value),
                joined_at=u.created_at
            )
            for u in users
        ]

    async def get_admin_users_for_approval(
        self,
        org_id: Optional[int] = None,
        exclude_user_id: Optional[int] = None
    ) -> List[UserModel]:
        """
        Get admin users who can approve reports.

        Returns platform admins and organization admins for the given organization.

        Args:
            org_id: If provided, also returns org admins for this organization.
            exclude_user_id: If provided, excludes this user from the results.

        Returns:
            List of admin User objects, deduplicated.
        """
        from models import UserRole as UserRoleModel

        # Get platform admins
        platform_admins_result = await self.db.execute(
            select(UserModel).where(
                UserModel.role == UserRoleModel.PLATFORM_ADMIN,
                UserModel.is_active == True
            )
        )
        platform_admins = list(platform_admins_result.scalars().all())

        # Get org admins for user's organization
        org_admins = []
        if org_id:
            where_clauses = [
                UserModel.org_id == org_id,
                UserModel.role == UserRoleModel.ORG_ADMIN,
                UserModel.is_active == True
            ]
            if exclude_user_id:
                where_clauses.append(UserModel.user_id != exclude_user_id)

            org_admins_result = await self.db.execute(
                select(UserModel).where(*where_clauses)
            )
            org_admins = list(org_admins_result.scalars().all())

        # Combine and deduplicate
        admin_ids = set()
        result = []
        for admin in platform_admins + org_admins:
            if admin.user_id not in admin_ids:
                admin_ids.add(admin.user_id)
                result.append(admin)

        return result

    async def create_user(
        self,
        email: str,
        password: str,
        full_name: Optional[str] = None,
        role: UserRole = UserRole.MEMBER,
        org_id: Optional[int] = None
    ) -> UserModel:
        """Create a new user (async)."""
        # Check for existing email
        existing = await self.get_user_by_email(email)
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email already registered"
            )

        # Validate org_id if provided
        if org_id:
            org_result = await self.db.execute(
                select(Organization).where(Organization.org_id == org_id)
            )
            org = org_result.scalars().first()
            if not org:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Organization not found"
                )

        # Create user
        hashed_password = pwd_context.hash(password)
        user = UserModel(
            email=email,
            password=hashed_password,
            full_name=full_name,
            role=UserRoleModel(role.value),
            org_id=org_id
        )

        self.db.add(user)
        await self.db.commit()
        await self.db.refresh(user)

        logger.info(f"Created user: {email} (id={user.user_id})")
        return user

    async def update_user(
        self,
        user_id: int,
        updates: Dict[str, Any]
    ) -> UserModel:
        """Update user fields (async)."""
        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Only allow updating specific fields
        allowed_fields = {'full_name', 'job_title', 'is_active'}
        for field, value in updates.items():
            if field in allowed_fields and value is not None:
                setattr(user, field, value)

        await self.db.commit()
        await self.db.refresh(user)

        logger.info(f"Updated user {user_id}: {list(updates.keys())}")
        return user

    async def update_login_token(
        self,
        user_id: int,
        token: Optional[str],
        expires_at: Optional[datetime]
    ) -> UserModel:
        """Update user's login token (async)."""
        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        user.login_token = token
        user.login_token_expires = expires_at
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def clear_login_token(self, user_id: int) -> UserModel:
        """Clear user's login token after use (async)."""
        return await self.update_login_token(user_id, None, None)

    async def update_password_reset_token(
        self,
        user_id: int,
        token: Optional[str],
        expires_at: Optional[datetime]
    ) -> UserModel:
        """Update user's password reset token (async)."""
        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        user.password_reset_token = token
        user.password_reset_token_expires = expires_at
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def clear_password_reset_token(self, user_id: int) -> UserModel:
        """Clear user's password reset token after use (async)."""
        return await self.update_password_reset_token(user_id, None, None)

    async def verify_credentials(self, email: str, password: str) -> Optional[UserModel]:
        """Verify user credentials (async)."""
        user = await self.get_user_by_email(email)
        if not user:
            return None

        if not pwd_context.verify(password, user.password):
            return None

        if not user.is_active:
            return None

        return user

    async def deactivate_user(self, user_id: int, deactivated_by: UserModel) -> UserModel:
        """Deactivate a user (async)."""
        if deactivated_by.role != UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can deactivate users"
            )

        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if user.user_id == deactivated_by.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot deactivate yourself"
            )

        user.is_active = False
        await self.db.commit()
        await self.db.refresh(user)

        logger.info(f"Deactivated user {user_id}")
        return user

    async def reactivate_user(self, user_id: int, reactivated_by: UserModel) -> UserModel:
        """Reactivate a deactivated user (async)."""
        if reactivated_by.role != UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can reactivate users"
            )

        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.is_active = True
        await self.db.commit()
        await self.db.refresh(user)

        logger.info(f"Reactivated user {user_id}")
        return user

    async def update_role(
        self,
        user_id: int,
        new_role: UserRole,
        updated_by: UserModel
    ) -> UserModel:
        """Update user's role (async)."""
        # Permission check: only platform_admin can change roles
        if updated_by.role != UserRoleModel.PLATFORM_ADMIN:
            if updated_by.role == UserRoleModel.ORG_ADMIN:
                user = await self.get_user_by_id(user_id)
                if not user:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="User not found"
                    )
                if user.org_id != updated_by.org_id:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Cannot modify users outside your organization"
                    )
                if new_role == UserRole.PLATFORM_ADMIN:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Only platform admins can create platform admins"
                    )
            else:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions to change roles"
                )

        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        # Prevent removing the last platform admin
        if user.role == UserRoleModel.PLATFORM_ADMIN and new_role != UserRole.PLATFORM_ADMIN:
            result = await self.db.execute(
                select(func.count(UserModel.user_id)).where(
                    UserModel.role == UserRoleModel.PLATFORM_ADMIN
                )
            )
            admin_count = result.scalar()
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot remove the last platform admin"
                )

        user.role = UserRoleModel(new_role.value)
        await self.db.commit()
        await self.db.refresh(user)

        logger.info(f"Updated role for user {user_id} to {new_role.value}")
        return user

    async def assign_to_org(
        self,
        user_id: int,
        org_id: int,
        assigned_by: UserModel
    ) -> UserModel:
        """Assign user to an organization (async)."""
        if assigned_by.role != UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can assign users to organizations"
            )

        # Validate org exists
        result = await self.db.execute(
            select(Organization).where(Organization.org_id == org_id)
        )
        org = result.scalars().first()
        if not org:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Organization not found"
            )

        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        user.org_id = org_id
        await self.db.commit()
        await self.db.refresh(user)

        logger.info(f"Assigned user {user_id} to org {org_id}")
        return user

    async def delete_user(self, user_id: int, deleted_by: UserModel) -> bool:
        """Hard delete a user from the database (async).

        Cleans up all FK-dependent rows before deleting the user.
        """
        if deleted_by.role != UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can delete users"
            )

        user = await self.get_user_by_id(user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )

        if user.user_id == deleted_by.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete yourself"
            )

        if user.role == UserRoleModel.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete another platform admin"
            )

        email = user.email

        # Clean up all FK-dependent rows before deleting user.
        # Order matters: delete children before parents.

        # Find this user's report IDs (needed to clean up report children)
        result = await self.db.execute(select(Report.report_id).where(Report.user_id == user_id))
        user_report_ids = [r[0] for r in result.fetchall()]

        # 1. Delete children of this user's reports
        if user_report_ids:
            await self.db.execute(delete(ReportArticleAssociation).where(ReportArticleAssociation.report_id.in_(user_report_ids)))
            await self.db.execute(delete(ReportEmailQueue).where(ReportEmailQueue.report_id.in_(user_report_ids)))

        # 2. Delete rows with non-nullable FK to users
        await self.db.execute(delete(Conversation).where(Conversation.user_id == user_id))  # messages cascade via ondelete
        await self.db.execute(delete(UserEvent).where(UserEvent.user_id == user_id))
        await self.db.execute(delete(ReportEmailQueue).where(ReportEmailQueue.user_id == user_id))
        await self.db.execute(delete(ReportSchedule).where(ReportSchedule.user_id == user_id))
        await self.db.execute(delete(PipelineExecution).where(PipelineExecution.user_id == user_id))
        await self.db.execute(delete(UserFeedback).where(UserFeedback.user_id == user_id))
        await self.db.execute(delete(UserStreamSubscription).where(UserStreamSubscription.user_id == user_id))
        await self.db.execute(delete(CurationEvent).where(CurationEvent.curator_id == user_id))
        await self.db.execute(delete(ToolTrace).where(ToolTrace.user_id == user_id))
        await self.db.execute(delete(Report).where(Report.user_id == user_id))
        await self.db.execute(delete(Artifact).where(Artifact.created_by == user_id))

        # 3. SET NULL on nullable FK references to users
        await self.db.execute(update(ResearchStream).where(ResearchStream.user_id == user_id).values(user_id=None))
        await self.db.execute(update(ResearchStream).where(ResearchStream.created_by == user_id).values(created_by=None))
        await self.db.execute(update(WipArticle).where(WipArticle.curated_by == user_id).values(curated_by=None))
        await self.db.execute(update(Report).where(Report.approved_by == user_id).values(approved_by=None))
        await self.db.execute(update(Report).where(Report.last_curated_by == user_id).values(last_curated_by=None))
        await self.db.execute(update(OrgStreamSubscription).where(OrgStreamSubscription.subscribed_by == user_id).values(subscribed_by=None))
        await self.db.execute(update(ChatConfig).where(ChatConfig.updated_by == user_id).values(updated_by=None))
        await self.db.execute(update(HelpContentOverride).where(HelpContentOverride.updated_by == user_id).values(updated_by=None))

        # 3. Delete the user (user_article_stars cascade via ondelete="CASCADE")
        await self.db.delete(user)
        await self.db.commit()

        logger.info(f"Deleted user {user_id} ({email})")
        return True


# Dependency injection provider for async user service
async def get_user_service(
    db: AsyncSession = Depends(get_async_db)
) -> UserService:
    """Get a UserService instance with async database session."""
    return UserService(db)
