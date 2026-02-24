"""
Schemas package for Knowledge Horizon API.

Core types are in schemas/user.py.
Request schemas are defined in the routers where they're used.
"""

# User schemas - core types
from .user import (
    UserRole,
    User,
    UserSummary,
    Token,
    TokenData,
    UserList,
    OrgMember,
)

# LLM schemas (for LLM interactions)
from .llm import (
    MessageRole as LLMMessageRole,
    ChatMessage,
)

# Chat schemas (for user-facing chat)
from .chat import (
    MessageRole,
    Message,
    Conversation,
    ConversationWithMessages,
    StreamEvent,
)

# Legacy alias - UserResponse maps to User
UserResponse = User


__all__ = [
    # User schemas
    'UserRole',
    'User',
    'UserSummary',
    'UserResponse',  # Legacy alias
    'Token',
    'TokenData',
    'UserList',
    'OrgMember',

    # LLM schemas (for LLM interactions)
    'LLMMessageRole',
    'ChatMessage',

    # Chat schemas (for user-facing chat)
    'MessageRole',
    'Message',
    'Conversation',
    'ConversationWithMessages',
    'StreamEvent',
]
