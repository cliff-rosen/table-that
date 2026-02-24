"""
Conversation Tools

Tools for accessing conversation data like stored payloads.
All tools are async.
"""

import json
import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, register_tool
from services.chat_service import ChatService

logger = logging.getLogger(__name__)


async def execute_get_payload(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> str:
    """
    Retrieve a payload from the conversation history by its ID.

    The payload manifest in the system prompt shows available payloads.
    Use this tool to retrieve the full data when the user refers to
    a previous result (e.g., "that search result", "the article you found").
    """
    payload_id = params.get("payload_id", "").strip()

    if not payload_id:
        return "Error: No payload_id provided."

    conversation_id = context.get("conversation_id")
    if not conversation_id:
        return "Error: No active conversation. Cannot retrieve payloads."

    try:
        chat_service = ChatService(db)
        messages = await chat_service.get_messages(conversation_id, user_id)

        # Search through messages for the payload
        for msg in messages:
            if msg.role != 'assistant' or not msg.extras:
                continue

            payloads = msg.extras.get("payloads", [])
            for payload in payloads:
                if payload.get("payload_id") == payload_id:
                    payload_type = payload.get("type", "unknown")
                    payload_data = payload.get("data", {})
                    summary = payload.get("summary", "")

                    # Format the payload data nicely for the LLM
                    formatted_data = json.dumps(payload_data, indent=2, default=str)

                    return f"""Retrieved payload [{payload_id}]:
Type: {payload_type}
Summary: {summary}

Data:
{formatted_data}"""

        return f"Error: Payload with ID '{payload_id}' not found in conversation history."

    except Exception as e:
        logger.error(f"Error retrieving payload: {e}", exc_info=True)
        return f"Error retrieving payload: {str(e)}"


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
    name="get_payload",
    description="Retrieve the full data of a payload from earlier in this conversation. Use this when the user refers to a previous result (e.g., 'that search', 'the article you found'). Check the CONVERSATION DATA section for available payload IDs.",
    input_schema={
        "type": "object",
        "properties": {
            "payload_id": {
                "type": "string",
                "description": "The payload ID from the CONVERSATION DATA manifest (e.g., 'a1b2c3d4')."
            }
        },
        "required": ["payload_id"]
    },
    executor=execute_get_payload,
    category="conversation",
    is_global=True  # Available on all pages
))
