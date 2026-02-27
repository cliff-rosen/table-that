"""
Chat Streaming Router

Handles streaming chat endpoint with LLM interaction and tool support.
"""

import asyncio

from fastapi import APIRouter, Depends
from starlette.requests import Request
from sse_starlette.sse import EventSourceResponse
from pydantic import BaseModel
from typing import List, Dict, Any, Optional, Literal, Callable
import logging

from models import User
from routers.auth import get_current_user
from schemas.chat import (
    GeneralChatMessage,
    ActionMetadata,
    StreamEvent,
    ErrorEvent,
)
from services.chat_stream_service import ChatStreamService, get_chat_stream_service_factory
from agents.agent_loop import CancellationToken

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat-stream"])


# ============================================================================
# Request Model
# ============================================================================

class ChatRequest(BaseModel):
    """Request model for general chat endpoint"""
    message: str
    context: Dict[str, Any]
    interaction_type: Literal["text_input", "value_selected", "action_executed"]
    action_metadata: Optional[ActionMetadata] = None
    conversation_id: Optional[int] = None  # For persistence - if None, creates new conversation
    # conversation_history is deprecated - history is now loaded from database
    conversation_history: Optional[List[GeneralChatMessage]] = None


@router.post("/stream",
    response_class=EventSourceResponse,
    summary="Stream chat responses",
    description="Streams chat responses in real-time using Server-Sent Events"
)
async def chat_stream(
    request: ChatRequest,
    raw_request: Request,
    service_factory: Callable[[int], ChatStreamService] = Depends(get_chat_stream_service_factory),
    current_user: User = Depends(get_current_user)
) -> EventSourceResponse:
    """
    General purpose chat streaming endpoint.

    Accepts user message with context and streams typed events:
    - text_delta: Streaming text tokens
    - status: Status updates (thinking, using tool, etc.)
    - tool_start: Tool execution begins
    - tool_complete: Tool execution finished
    - complete: Final structured response
    - error: Error occurred
    """
    cancellation_token = CancellationToken()

    async def monitor_disconnect():
        """Poll for client disconnection and trigger cancellation."""
        while not cancellation_token.is_cancelled:
            if await raw_request.is_disconnected():
                logger.info("Client disconnected, cancelling chat stream")
                cancellation_token.cancel()
                return
            await asyncio.sleep(0.5)

    monitor_task = asyncio.create_task(monitor_disconnect())

    async def event_generator():
        """Generate SSE events"""
        try:
            service = service_factory(current_user.user_id)

            # Inject user_role into context for role-sensitive features (e.g., help docs)
            request.context["user_role"] = current_user.role.value if current_user.role else "member"

            # Stream typed events from the service
            async for event_json in service.stream_chat_message(
                request, cancellation_token=cancellation_token
            ):
                yield {
                    "event": "message",
                    "data": event_json
                }

        except Exception as e:
            logger.error(f"Error in chat stream: {str(e)}")
            error_event = ErrorEvent(message=str(e))
            yield {
                "event": "message",
                "data": error_event.model_dump_json()
            }
        finally:
            monitor_task.cancel()

    return EventSourceResponse(
        event_generator(),
        ping=1  # Send ping every 1 second to keep connection alive and flush buffers
    )
