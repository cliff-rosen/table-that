"""
Chat Router

Endpoints for chat persistence (CRUD operations on chats).
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List
from pydantic import BaseModel

from models import User, UserRole
from services import auth_service
from services.chat_service import (
    ChatService,
    get_chat_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chats", tags=["chats"])


# === Response Schemas ===

class MessageResponse(BaseModel):
    """Single message response"""
    id: int
    role: str
    content: str
    context: Optional[dict] = None
    extras: Optional[dict] = None
    created_at: str


# AdminMessageResponse is same as MessageResponse now, kept for backwards compatibility
AdminMessageResponse = MessageResponse


class ChatResponse(BaseModel):
    """Chat response"""
    id: int
    title: Optional[str] = None
    created_at: str
    updated_at: str


class ChatWithMessagesResponse(BaseModel):
    """Chat with messages"""
    id: int
    title: Optional[str] = None
    created_at: str
    updated_at: str
    messages: List[MessageResponse]


class ChatsListResponse(BaseModel):
    """List of chats"""
    chats: List[ChatResponse]


# === User Endpoints ===

@router.get("", response_model=ChatsListResponse)
async def list_chats(
    app: str = Query("kh", description="App identifier: kh, tablizer, trialscout"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
    service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """List user's chats for a specific app (async)."""
    logger.info(f"list_chats - user_id={current_user.user_id}, app={app}, limit={limit}, offset={offset}")

    try:
        chats = await service.get_user_chats(
            user_id=current_user.user_id,
            app=app,
            limit=limit,
            offset=offset
        )

        logger.info(f"list_chats complete - user_id={current_user.user_id}, app={app}, count={len(chats)}")
        return ChatsListResponse(
            chats=[
                ChatResponse(
                    id=c.id,
                    title=c.title,
                    created_at=c.created_at.isoformat(),
                    updated_at=c.updated_at.isoformat()
                )
                for c in chats
            ]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_chats failed - user_id={current_user.user_id}, app={app}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list chats: {str(e)}"
        )


@router.get("/{chat_id}", response_model=ChatWithMessagesResponse)
async def get_chat(
    chat_id: int,
    service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get a chat with its messages (async)."""
    logger.info(f"get_chat - user_id={current_user.user_id}, chat_id={chat_id}")

    try:
        chat = await service.get_chat(chat_id, current_user.user_id)
        if not chat:
            logger.warning(f"get_chat - not found - user_id={current_user.user_id}, chat_id={chat_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

        messages = await service.get_messages(chat_id, current_user.user_id)

        logger.info(f"get_chat complete - user_id={current_user.user_id}, chat_id={chat_id}, message_count={len(messages)}")
        return ChatWithMessagesResponse(
            id=chat.id,
            title=chat.title,
            created_at=chat.created_at.isoformat(),
            updated_at=chat.updated_at.isoformat(),
            messages=[
                MessageResponse(
                    id=m.id,
                    role=m.role,
                    content=m.content,
                    context=m.context,
                    extras=m.extras,
                    created_at=m.created_at.isoformat()
                )
                for m in messages
            ]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_chat failed - user_id={current_user.user_id}, chat_id={chat_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get chat: {str(e)}"
        )


# === Admin Endpoints ===

class AdminChatResponse(BaseModel):
    """Chat with user info for admin"""
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str] = None
    title: Optional[str] = None
    message_count: int
    created_at: str
    updated_at: str


class AdminChatsListResponse(BaseModel):
    """Paginated list of chats for admin"""
    chats: List[AdminChatResponse]
    total: int
    limit: int
    offset: int


class AdminChatDetailResponse(BaseModel):
    """Full chat with messages for admin"""
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str] = None
    title: Optional[str] = None
    created_at: str
    updated_at: str
    messages: List[AdminMessageResponse]


@router.get("/admin/all", response_model=AdminChatsListResponse)
async def admin_list_chats(
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """List all chats (platform admin only, async)."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        logger.warning(f"admin_list_chats - unauthorized - user_id={current_user.user_id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin access required")

    logger.info(f"admin_list_chats - admin_user_id={current_user.user_id}, filter_user_id={user_id}, limit={limit}, offset={offset}")

    try:
        chats, total = await service.get_all_chats(
            limit=limit,
            offset=offset,
            user_id=user_id
        )

        logger.info(f"admin_list_chats complete - admin_user_id={current_user.user_id}, total={total}, returned={len(chats)}")
        return AdminChatsListResponse(
            chats=[AdminChatResponse(**c) for c in chats],
            total=total,
            limit=limit,
            offset=offset
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"admin_list_chats failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list chats: {str(e)}"
        )


@router.get("/admin/{chat_id}", response_model=AdminChatDetailResponse)
async def admin_get_chat(
    chat_id: int,
    service: ChatService = Depends(get_chat_service),
    current_user: User = Depends(auth_service.validate_token)
):
    """Get full chat with messages (platform admin only, async)."""
    if current_user.role != UserRole.PLATFORM_ADMIN:
        logger.warning(f"admin_get_chat - unauthorized - user_id={current_user.user_id}, chat_id={chat_id}")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Platform admin access required")

    logger.info(f"admin_get_chat - admin_user_id={current_user.user_id}, chat_id={chat_id}")

    try:
        chat = await service.get_chat_with_messages(chat_id)
        if not chat:
            logger.warning(f"admin_get_chat - not found - admin_user_id={current_user.user_id}, chat_id={chat_id}")
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Chat not found")

        logger.info(f"admin_get_chat complete - admin_user_id={current_user.user_id}, chat_id={chat_id}, message_count={len(chat['messages'])}")
        return AdminChatDetailResponse(
            id=chat["id"],
            user_id=chat["user_id"],
            user_email=chat["user_email"],
            user_name=chat["user_name"],
            title=chat["title"],
            created_at=chat["created_at"],
            updated_at=chat["updated_at"],
            messages=[AdminMessageResponse(**m) for m in chat["messages"]]
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"admin_get_chat failed - admin_user_id={current_user.user_id}, chat_id={chat_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get chat: {str(e)}"
        )
