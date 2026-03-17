"""
Chat Service

Manages chat persistence (CRUD operations on chats and messages).
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession

from models import Conversation, Message, User
from fastapi import Depends
from database import get_async_db

logger = logging.getLogger(__name__)


def derive_scope(context: Dict[str, Any]) -> Optional[str]:
    """Derive conversation scope from page context.

    The scope is the entity the conversation is bound to:
      "tables_list"   — the tables list page
      "table:<id>"    — a specific table

    This is the single source of truth for scope format. Used by the
    chat router (conversation loading) and stream service (persistence).
    """
    page = context.get("current_page", "")
    table_id = context.get("table_id")
    if page in ("table_view", "table_edit") and table_id:
        return f"table:{table_id}"
    if page == "tables_list":
        return "tables_list"
    return None


class ChatService:
    """Service for managing chats and messages."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_chat(
        self,
        chat_id: int,
        user_id: int
    ) -> Optional[Conversation]:
        """Get a chat by ID, ensuring it belongs to the user (async)."""
        stmt = select(Conversation).where(
            Conversation.id == chat_id,
            Conversation.user_id == user_id
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_messages(
        self,
        chat_id: int,
        user_id: int,
        limit: int = 100
    ) -> List[Message]:
        """Get messages for a chat (async)."""
        # Verify ownership first
        chat = await self.get_chat(chat_id, user_id)
        if not chat:
            return []

        stmt = (
            select(Message)
            .where(Message.conversation_id == chat_id)
            .order_by(Message.created_at)
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def count_user_messages(self, user_id: int) -> int:
        """Count total user-role messages across all conversations for a user."""
        stmt = (
            select(func.count(Message.id))
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(
                Conversation.user_id == user_id,
                Message.role == "user"
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0

    async def get_all_chats(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[int] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get all chats with user info (admin view, async)."""
        # Build base query
        base_where = []
        if user_id:
            base_where.append(Conversation.user_id == user_id)

        # Get total count
        count_stmt = select(func.count(Conversation.id)).select_from(Conversation)
        if base_where:
            count_stmt = count_stmt.where(*base_where)
        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get chats with user info
        stmt = (
            select(Conversation, User)
            .join(User, User.user_id == Conversation.user_id)
            .order_by(desc(Conversation.updated_at))
            .offset(offset)
            .limit(limit)
        )
        if base_where:
            stmt = stmt.where(*base_where)

        result = await self.db.execute(stmt)
        rows = result.all()

        chats = []
        for conv, user in rows:
            # Get message count
            msg_count_stmt = select(func.count(Message.id)).where(
                Message.conversation_id == conv.id
            )
            msg_result = await self.db.execute(msg_count_stmt)
            msg_count = msg_result.scalar() or 0

            chats.append({
                "id": conv.id,
                "user_id": conv.user_id,
                "user_email": user.email,
                "user_name": user.full_name,
                "title": conv.title,
                "message_count": msg_count,
                "created_at": conv.created_at.isoformat(),
                "updated_at": conv.updated_at.isoformat()
            })

        return chats, total

    async def get_chat_with_messages(
        self,
        chat_id: int
    ) -> Optional[Dict[str, Any]]:
        """Get full chat with all messages (admin view, async)."""
        stmt = (
            select(Conversation, User)
            .join(User, User.user_id == Conversation.user_id)
            .where(Conversation.id == chat_id)
        )
        result = await self.db.execute(stmt)
        row = result.first()

        if not row:
            return None

        conv, user = row

        # Get messages
        msg_stmt = (
            select(Message)
            .where(Message.conversation_id == chat_id)
            .order_by(Message.created_at)
        )
        msg_result = await self.db.execute(msg_stmt)
        messages = msg_result.scalars().all()

        return {
            "id": conv.id,
            "user_id": conv.user_id,
            "user_email": user.email,
            "user_name": user.full_name,
            "title": conv.title,
            "created_at": conv.created_at.isoformat(),
            "updated_at": conv.updated_at.isoformat(),
            "messages": [
                {
                    "id": msg.id,
                    "role": msg.role,
                    "content": msg.content,
                    "context": msg.context,
                    "extras": msg.extras,
                    "created_at": msg.created_at.isoformat()
                }
                for msg in messages
            ]
        }

    async def create_chat(
        self,
        user_id: int,
        app: str = "kh",
        title: Optional[str] = None,
        scope: Optional[str] = None
    ) -> Conversation:
        """Create a new chat (async)."""
        chat = Conversation(
            user_id=user_id,
            app=app,
            title=title,
            scope=scope
        )
        self.db.add(chat)
        await self.db.commit()
        await self.db.refresh(chat)
        logger.debug(f"Created chat {chat.id} for user {user_id} in app {app} scope={scope}")
        return chat

    async def get_for_context(
        self,
        user_id: int,
        current_page: str,
        table_id: Optional[int] = None,
        app: str = "table_that"
    ) -> Optional[Conversation]:
        """Get the most recent conversation for a page context.

        Derives scope from current_page + table_id using the shared derive_scope().
        Returns None if no conversation exists for this context.
        Conversations are only created on first message send (via _setup_chat).
        """
        scope = derive_scope({"current_page": current_page, "table_id": table_id})
        if not scope:
            raise ValueError(f"Cannot derive conversation scope from page '{current_page}'")
        stmt = (
            select(Conversation)
            .where(
                Conversation.user_id == user_id,
                Conversation.app == app,
                Conversation.scope == scope,
            )
            .order_by(desc(Conversation.updated_at))
            .limit(1)
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def migrate_to_table(
        self,
        chat_id: int,
        user_id: int,
        table_id: int
    ) -> Optional[Conversation]:
        """Migrate a conversation's scope to a specific table.

        Called explicitly when a table is created from the tables_list page.
        Derives the new scope from table_id — the caller never passes scope strings.
        """
        new_scope = f"table:{table_id}"
        chat = await self.get_chat(chat_id, user_id)
        if not chat:
            return None
        chat.scope = new_scope
        chat.updated_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(chat)
        logger.info(f"Migrated chat {chat_id} scope to {new_scope}")
        return chat

    async def add_message(
        self,
        chat_id: int,
        user_id: int,
        role: str,
        content: str,
        context: Optional[Dict[str, Any]] = None,
        extras: Optional[Dict[str, Any]] = None
    ) -> Optional[Message]:
        """Add a message to a chat (async)."""
        chat = await self.get_chat(chat_id, user_id)
        if not chat:
            return None

        message = Message(
            conversation_id=chat_id,
            role=role,
            content=content,
            context=context,
            extras=extras
        )
        self.db.add(message)

        # Update chat's updated_at
        chat.updated_at = datetime.utcnow()

        # Auto-generate title from first user message if not set
        if not chat.title and role == 'user':
            chat.title = content[:50] + ('...' if len(content) > 50 else '')

        await self.db.commit()
        await self.db.refresh(message)

        logger.debug(f"Added message to chat {chat_id}: role={role}")
        return message

    async def delete_chat(self, chat_id: int, user_id: int) -> bool:
        """Delete a chat and all its messages (async)."""
        chat = await self.get_chat(chat_id, user_id)
        if chat:
            await self.db.delete(chat)
            await self.db.commit()
            return True
        return False

    async def update_chat_title(
        self,
        chat_id: int,
        user_id: int,
        title: str
    ) -> Optional[Conversation]:
        """Update chat title (async)."""
        chat = await self.get_chat(chat_id, user_id)
        if chat:
            chat.title = title
            await self.db.commit()
            await self.db.refresh(chat)
        return chat

    # =========================================================================
    # System Configuration
    # =========================================================================

    DEFAULT_MAX_TOOL_ITERATIONS = 5

    async def get_max_tool_iterations(self) -> int:
        """Get the maximum tool iterations setting, or default."""
        from models import ChatConfig

        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "system",
                    ChatConfig.scope_key == "max_tool_iterations"
                )
            )
            config = result.scalars().first()
            if config and config.content:
                value = int(config.content.strip())
                return max(1, min(value, 20))
        except Exception as e:
            logger.warning(f"Failed to load max_tool_iterations config: {e}")

        return self.DEFAULT_MAX_TOOL_ITERATIONS

    async def set_max_tool_iterations(self, value: int, user_id: int) -> int:
        """Set the maximum tool iterations setting. Returns the saved value."""
        from models import ChatConfig

        value = max(1, min(value, 20))

        result = await self.db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "system",
                ChatConfig.scope_key == "max_tool_iterations"
            )
        )
        existing = result.scalars().first()

        if existing:
            existing.content = str(value)
            existing.updated_at = datetime.utcnow()
            existing.updated_by = user_id
        else:
            new_config = ChatConfig(
                scope="system",
                scope_key="max_tool_iterations",
                content=str(value),
                updated_by=user_id
            )
            self.db.add(new_config)

        await self.db.commit()
        logger.info(f"Updated max_tool_iterations to {value} by user {user_id}")
        return value

    # Loaded once from config/chat_models.yaml
    CHAT_MODELS: dict = {}
    DEFAULT_CHAT_MODEL: str = "claude-sonnet-4-20250514"
    _chat_models_loaded: bool = False

    @classmethod
    def _ensure_chat_models_loaded(cls) -> None:
        """Load chat model definitions from YAML config (once)."""
        if cls._chat_models_loaded:
            return
        import yaml
        from pathlib import Path
        yaml_path = Path(__file__).parent.parent / "config" / "chat_models.yaml"
        with open(yaml_path) as f:
            data = yaml.safe_load(f)
        cls.CHAT_MODELS = {}
        for m in data["models"]:
            cls.CHAT_MODELS[m["id"]] = {
                "label": m["label"],
                "input_cost": m["input_cost"],
                "output_cost": m["output_cost"],
            }
        cls.DEFAULT_CHAT_MODEL = data["models"][0]["id"]
        cls._chat_models_loaded = True
        logger.info(f"Loaded {len(cls.CHAT_MODELS)} chat models from {yaml_path.name}")

    async def get_chat_model(self) -> str:
        """Get the chat model setting, or default."""
        from models import ChatConfig
        self._ensure_chat_models_loaded()

        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "system",
                    ChatConfig.scope_key == "chat_model"
                )
            )
            config = result.scalars().first()
            if config and config.content:
                model = config.content.strip()
                if model in self.CHAT_MODELS:
                    return model
                logger.warning(f"Invalid chat_model in config: {model!r}, using default")
        except Exception as e:
            logger.warning(f"Failed to load chat_model config: {e}")

        return self.DEFAULT_CHAT_MODEL

    async def set_chat_model(self, model: str, user_id: int) -> str:
        """Set the chat model. Returns the saved value."""
        from models import ChatConfig
        self._ensure_chat_models_loaded()

        if model not in self.CHAT_MODELS:
            raise ValueError(f"Invalid model: {model}. Valid: {list(self.CHAT_MODELS.keys())}")

        result = await self.db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "system",
                ChatConfig.scope_key == "chat_model"
            )
        )
        existing = result.scalars().first()

        if existing:
            existing.content = model
            existing.updated_at = datetime.utcnow()
            existing.updated_by = user_id
        else:
            new_config = ChatConfig(
                scope="system",
                scope_key="chat_model",
                content=model,
                updated_by=user_id
            )
            self.db.add(new_config)

        await self.db.commit()
        logger.info(f"Updated chat_model to {model} by user {user_id}")
        return model

    DEFAULT_MAX_RESEARCH_STEPS = 5

    async def get_max_research_steps(self) -> int:
        """Get the maximum research steps per row setting, or default."""
        from models import ChatConfig

        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "system",
                    ChatConfig.scope_key == "max_research_steps"
                )
            )
            config = result.scalars().first()
            if config and config.content:
                value = int(config.content.strip())
                return max(1, min(value, 15))
        except Exception as e:
            logger.warning(f"Failed to load max_research_steps config: {e}")

        return self.DEFAULT_MAX_RESEARCH_STEPS

    async def set_max_research_steps(self, value: int, user_id: int) -> int:
        """Set the maximum research steps setting. Returns the saved value."""
        from models import ChatConfig

        value = max(1, min(value, 15))

        result = await self.db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "system",
                ChatConfig.scope_key == "max_research_steps"
            )
        )
        existing = result.scalars().first()

        if existing:
            existing.content = str(value)
            existing.updated_at = datetime.utcnow()
            existing.updated_by = user_id
        else:
            new_config = ChatConfig(
                scope="system",
                scope_key="max_research_steps",
                content=str(value),
                updated_by=user_id
            )
            self.db.add(new_config)

        await self.db.commit()
        logger.info(f"Updated max_research_steps to {value} by user {user_id}")
        return value

    async def get_global_preamble(self) -> Optional[str]:
        """Get the global preamble override, or None to use default."""
        from models import ChatConfig

        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "system",
                    ChatConfig.scope_key == "global_preamble"
                )
            )
            config = result.scalars().first()
            if config and config.content:
                return config.content
        except Exception as e:
            logger.warning(f"Failed to load global_preamble config: {e}")

        return None

    async def set_global_preamble(self, content: Optional[str], user_id: int) -> Optional[str]:
        """Set the global preamble override. Pass None to remove override."""
        from models import ChatConfig

        result = await self.db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "system",
                ChatConfig.scope_key == "global_preamble"
            )
        )
        existing = result.scalars().first()

        if content is None or content.strip() == "":
            # Remove override
            if existing:
                await self.db.delete(existing)
                await self.db.commit()
                logger.info(f"Removed global_preamble override by user {user_id}")
            return None

        content = content.strip()
        if existing:
            existing.content = content
            existing.updated_at = datetime.utcnow()
            existing.updated_by = user_id
        else:
            new_config = ChatConfig(
                scope="system",
                scope_key="global_preamble",
                content=content,
                updated_by=user_id
            )
            self.db.add(new_config)

        await self.db.commit()
        logger.info(f"Updated global_preamble by user {user_id}")
        return content

    DEFAULT_GUEST_TURN_LIMIT = 8

    async def get_guest_turn_limit(self) -> int:
        """Get the guest turn limit setting, or default."""
        from models import ChatConfig

        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "system",
                    ChatConfig.scope_key == "guest_turn_limit"
                )
            )
            config = result.scalars().first()
            if config and config.content:
                value = int(config.content.strip())
                return max(1, min(value, 100))
        except Exception as e:
            logger.warning(f"Failed to load guest_turn_limit config: {e}")

        return self.DEFAULT_GUEST_TURN_LIMIT

    async def set_guest_turn_limit(self, value: int, user_id: int) -> int:
        """Set the guest turn limit setting. Returns the saved value."""
        from models import ChatConfig

        value = max(1, min(value, 100))

        result = await self.db.execute(
            select(ChatConfig).where(
                ChatConfig.scope == "system",
                ChatConfig.scope_key == "guest_turn_limit"
            )
        )
        existing = result.scalars().first()

        if existing:
            existing.content = str(value)
            existing.updated_at = datetime.utcnow()
            existing.updated_by = user_id
        else:
            new_config = ChatConfig(
                scope="system",
                scope_key="guest_turn_limit",
                content=str(value),
                updated_by=user_id
            )
            self.db.add(new_config)

        await self.db.commit()
        logger.info(f"Updated guest_turn_limit to {value} by user {user_id}")
        return value

    async def get_system_config(self) -> dict:
        """Get all system configuration values."""
        return {
            "max_tool_iterations": await self.get_max_tool_iterations(),
            "max_research_steps": await self.get_max_research_steps(),
            "guest_turn_limit": await self.get_guest_turn_limit(),
            "global_preamble": await self.get_global_preamble(),
            "chat_model": await self.get_chat_model(),
        }

    async def update_system_config(
        self,
        user_id: int,
        chat_model: Optional[str] = None,
        max_tool_iterations: Optional[int] = None,
        max_research_steps: Optional[int] = None,
        guest_turn_limit: Optional[int] = None,
        global_preamble: Optional[str] = None,
        clear_global_preamble: bool = False
    ) -> dict:
        """Update system configuration values. Returns the updated config."""
        if chat_model is not None:
            await self.set_chat_model(chat_model, user_id)
        if max_tool_iterations is not None:
            await self.set_max_tool_iterations(max_tool_iterations, user_id)
        if max_research_steps is not None:
            await self.set_max_research_steps(max_research_steps, user_id)
        if guest_turn_limit is not None:
            await self.set_guest_turn_limit(guest_turn_limit, user_id)
        if clear_global_preamble:
            await self.set_global_preamble(None, user_id)
        elif global_preamble is not None:
            await self.set_global_preamble(global_preamble, user_id)
        return await self.get_system_config()


# Dependency injection provider for async chat service
async def get_chat_service(
    db: AsyncSession = Depends(get_async_db)
) -> ChatService:
    """Get a ChatService instance with async database session."""
    return ChatService(db)
