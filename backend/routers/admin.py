"""
Platform admin API endpoints.
Requires platform_admin role for all operations.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from typing import Dict, List, Optional
from datetime import datetime
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from models import User, UserRole, ChatConfig
from services import auth_service
from database import get_async_db
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
    schema: Optional[dict] = None

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


class ChatConfigResponse(BaseModel):
    """Complete chat system configuration."""

    payload_types: List[PayloadTypeInfo]
    tools: List[ToolInfo]
    pages: List[PageConfigInfo]
    summary: dict


@router.get(
    "/chat-config",
    response_model=ChatConfigResponse,
    summary="Get chat system configuration",
)
async def get_chat_config(
    current_user: User = Depends(require_platform_admin),
):
    """Get complete chat system configuration. Platform admin only."""
    logger.info(f"get_chat_config - admin_user_id={current_user.user_id}")

    try:
        from schemas.payloads import get_all_payload_types
        from tools.registry import get_all_tools
        import services.chat_page_config
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

        summary = {
            "total_payload_types": len(payload_types),
            "global_payloads": len([p for p in payload_types if p.is_global]),
            "llm_payloads": len([p for p in payload_types if p.source == "llm"]),
            "tool_payloads": len([p for p in payload_types if p.source == "tool"]),
            "total_tools": len(tools),
            "global_tools": len([t for t in tools if t.is_global]),
            "total_pages": len(pages),
        }

        logger.info(
            f"get_chat_config complete - payloads={len(payload_types)}, tools={len(tools)}, pages={len(pages)}"
        )
        return ChatConfigResponse(
            payload_types=payload_types,
            tools=tools,
            pages=pages,
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


# ==================== Page Chat Config Management ====================


class ChatConfigUpdate(BaseModel):
    """Request body for updating chat config."""

    content: Optional[str] = None


class PageChatConfig(BaseModel):
    """Page chat config info."""

    page: str
    content: Optional[str] = None
    has_override: bool = False
    default_content: Optional[str] = None
    default_is_global: bool = False


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
    import services.chat_page_config
    from services.chat_page_config.registry import _page_registry, get_persona
    from services.chat_stream_service import ChatStreamService

    global_default = ChatStreamService.DEFAULT_PAGE_INSTRUCTIONS

    try:
        result = await db.execute(
            select(ChatConfig).where(ChatConfig.scope == "page")
        )
        db_overrides = {cc.scope_key: cc.content for cc in result.scalars().all()}

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
    import services.chat_page_config
    from services.chat_page_config.registry import _page_registry, get_persona
    from services.chat_stream_service import ChatStreamService

    global_default = ChatStreamService.DEFAULT_PAGE_INSTRUCTIONS

    try:
        if not _page_registry.get(page):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page '{page}' not found",
            )

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
    import services.chat_page_config
    from services.chat_page_config.registry import _page_registry, get_persona
    from services.chat_stream_service import ChatStreamService

    global_default = ChatStreamService.DEFAULT_PAGE_INSTRUCTIONS

    try:
        if not _page_registry.get(page):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page '{page}' not found",
            )

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
    import services.chat_page_config
    from services.chat_page_config.registry import _page_registry

    try:
        config = _page_registry.get(page)
        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Page '{page}' not found",
            )

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


# ==================== System Chat Config ====================


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
