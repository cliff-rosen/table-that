"""
Organization service for multi-tenancy support.
Handles organization management, member management, and access control.
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, func, select
from typing import List, Optional, Dict, Any
from datetime import datetime
from fastapi import HTTPException, status, Depends

from models import (
    Organization, User, ResearchStream, UserRole,
    OrgStreamSubscription, UserStreamSubscription, StreamScope,
    Invitation
)
from schemas.organization import (
    OrganizationCreate, OrganizationUpdate, Organization as OrgSchema,
    OrganizationWithStats, OrgMember, OrgMemberUpdate
)
from schemas.user import UserRole as UserRoleSchema, OrgMember as OrgMemberSchema
from services.user_service import UserService
from database import get_async_db

logger = logging.getLogger(__name__)


class OrganizationService:
    """Service for managing organizations and their members."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._user_service: Optional[UserService] = None

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService to avoid circular imports."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    # Name of the default organization that cannot be deleted
    DEFAULT_ORG_NAME = "Default Organization"

    # ==================== Access Control Helpers ====================

    def user_can_manage_org(self, user: User, org_id: int) -> bool:
        """Check if user can manage an organization."""
        if user.role == UserRole.PLATFORM_ADMIN:
            return True
        if user.role == UserRole.ORG_ADMIN and user.org_id == org_id:
            return True
        return False

    def user_is_platform_admin(self, user: User) -> bool:
        """Check if user is a platform admin."""
        return user.role == UserRole.PLATFORM_ADMIN

    def user_is_org_admin(self, user: User) -> bool:
        """Check if user is an org admin (or platform admin)."""
        return user.role in (UserRole.PLATFORM_ADMIN, UserRole.ORG_ADMIN)

    def require_platform_admin(self, user: User):
        """Raise 403 if user is not a platform admin."""
        if not self.user_is_platform_admin(user):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Platform admin access required"
            )

    def require_org_admin(self, user: User, org_id: int):
        """Raise 403 if user cannot manage the specified org."""
        if not self.user_can_manage_org(user, org_id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Organization admin access required"
            )

    # ==================== Async Methods ====================

    async def get_organization(self, org_id: int) -> Optional[Organization]:
        """Get an organization by ID (async)."""
        result = await self.db.execute(
            select(Organization).where(Organization.org_id == org_id)
        )
        return result.scalars().first()

    async def get_organization_for_user(self, user: User) -> Optional[OrgSchema]:
        """Get the organization for a user (async)."""
        if not user.org_id:
            return None

        org = await self.get_organization(user.org_id)
        if not org:
            return None

        return OrgSchema.model_validate(org)

    async def get_organization_with_stats(self, org_id: int) -> Optional[OrganizationWithStats]:
        """Get organization with member and stream counts (async)."""
        org = await self.get_organization(org_id)
        if not org:
            return None

        result = await self.db.execute(
            select(func.count(User.user_id)).where(User.org_id == org_id)
        )
        member_count = result.scalar() or 0

        result = await self.db.execute(
            select(func.count(ResearchStream.stream_id)).where(
                and_(
                    ResearchStream.org_id == org_id,
                    ResearchStream.scope == StreamScope.ORGANIZATION
                )
            )
        )
        stream_count = result.scalar() or 0

        result = await self.db.execute(
            select(func.count(Invitation.invitation_id)).where(
                and_(
                    Invitation.org_id == org_id,
                    Invitation.accepted_at == None,
                    Invitation.is_revoked == False,
                    Invitation.expires_at > datetime.utcnow()
                )
            )
        )
        pending_invitation_count = result.scalar() or 0

        return OrganizationWithStats(
            org_id=org.org_id,
            name=org.name,
            is_active=org.is_active,
            created_at=org.created_at,
            updated_at=org.updated_at,
            member_count=member_count,
            stream_count=stream_count,
            pending_invitation_count=pending_invitation_count
        )

    async def create_organization(self, data: OrganizationCreate) -> Organization:
        """Create a new organization (async)."""
        org = Organization(
            name=data.name,
            is_active=True
        )
        self.db.add(org)
        await self.db.commit()
        await self.db.refresh(org)
        logger.info(f"Created organization: {org.org_id} - {org.name}")
        return org

    async def update_organization(
        self,
        org_id: int,
        data: OrganizationUpdate
    ) -> Optional[Organization]:
        """Update an organization (async)."""
        org = await self.get_organization(org_id)
        if not org:
            return None

        if data.name is not None:
            org.name = data.name
        if data.is_active is not None:
            org.is_active = data.is_active

        await self.db.commit()
        await self.db.refresh(org)
        logger.info(f"Updated organization: {org.org_id}")
        return org

    async def list_organizations(
        self,
        include_inactive: bool = False
    ) -> List[OrganizationWithStats]:
        """List all organizations with stats (async)."""
        stmt = select(Organization)
        if not include_inactive:
            stmt = stmt.where(Organization.is_active == True)
        stmt = stmt.order_by(Organization.name)

        result = await self.db.execute(stmt)
        orgs = list(result.scalars().all())

        org_stats = []
        for org in orgs:
            stats = await self.get_organization_with_stats(org.org_id)
            if stats:
                org_stats.append(stats)

        return org_stats

    async def delete_organization(self, org_id: int) -> bool:
        """Delete an organization (async)."""
        org = await self.get_organization(org_id)
        if not org:
            return False

        if org.name == self.DEFAULT_ORG_NAME:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot delete the default organization."
            )

        result = await self.db.execute(
            select(func.count(User.user_id)).where(User.org_id == org_id)
        )
        member_count = result.scalar() or 0

        if member_count > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete organization with {member_count} members."
            )

        await self.db.delete(org)
        await self.db.commit()
        logger.info(f"Deleted organization: {org_id}")
        return True

    async def get_org_members(self, org_id: int) -> List[OrgMemberSchema]:
        """Get all members of an organization (async)."""
        result = await self.db.execute(
            select(User)
            .where(User.org_id == org_id)
            .order_by(User.full_name, User.email)
        )
        users = result.scalars().all()

        return [
            OrgMemberSchema(
                user_id=u.user_id,
                email=u.email,
                full_name=u.full_name,
                role=UserRoleSchema(u.role.value),
                joined_at=u.created_at
            )
            for u in users
        ]

    async def get_user_in_org(
        self,
        user_id: int,
        org_id: int
    ) -> Optional[User]:
        """Get user by ID only if they belong to the specified organization (async)."""
        result = await self.db.execute(
            select(User).where(
                User.user_id == user_id,
                User.org_id == org_id
            )
        )
        return result.scalars().first()

    async def update_member_role(
        self,
        org_id: int,
        user_id: int,
        new_role: UserRole,
        acting_user: User
    ) -> Optional[OrgMember]:
        """Update a member's role (async)."""
        target_user = await self.get_user_in_org(user_id, org_id)

        if not target_user:
            return None

        if target_user.user_id == acting_user.user_id and new_role != UserRole.ORG_ADMIN:
            result = await self.db.execute(
                select(func.count(User.user_id)).where(
                    and_(
                        User.org_id == org_id,
                        User.role == UserRole.ORG_ADMIN
                    )
                )
            )
            admin_count = result.scalar() or 0

            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot demote the only org admin"
                )

        if target_user.role == UserRole.PLATFORM_ADMIN or new_role == UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot modify platform admin roles"
            )

        target_user.role = new_role
        await self.db.commit()
        await self.db.refresh(target_user)

        logger.info(f"Updated role for user {user_id} to {new_role}")

        return OrgMember(
            user_id=target_user.user_id,
            email=target_user.email,
            full_name=target_user.full_name,
            role=target_user.role,
            joined_at=target_user.created_at
        )

    async def remove_member(
        self,
        org_id: int,
        user_id: int,
        acting_user: User
    ) -> bool:
        """Remove a member from an organization (async)."""
        if user_id == acting_user.user_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot remove yourself from the organization"
            )

        target_user = await self.get_user_in_org(user_id, org_id)

        if not target_user:
            return False

        if target_user.role == UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot remove platform admin"
            )

        target_user.org_id = None
        await self.db.commit()

        logger.info(f"Removed user {user_id} from org {org_id}")
        return True


# Dependency injection provider for async organization service
async def get_organization_service(
    db: AsyncSession = Depends(get_async_db)
) -> OrganizationService:
    """Get an OrganizationService instance with async database session."""
    return OrganizationService(db)
