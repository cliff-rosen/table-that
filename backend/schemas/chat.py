"""
Chat domain types for user-facing chat feature

Organized to mirror frontend types/chat.ts for easy cross-reference.

This module contains:
- Response payload (ChatResponsePayload) and its component types
- Stream event types for SSE streaming
- Agent trace types for execution tracing

For LLM infrastructure types, see schemas/llm.py
For ORM models (Conversation, Message), see models.py
"""

from pydantic import BaseModel
from typing import List, Optional, Any, Literal, Union


# ============================================================================
# Response Component Types
# ============================================================================

class SuggestedValue(BaseModel):
    """A suggested value pill — displayed and sent as-is when clicked"""
    text: str


class SuggestedAction(BaseModel):
    """A suggested action button"""
    label: str
    action: str
    handler: Literal["client", "server"]
    data: Optional[Any] = None
    style: Optional[Literal["primary", "secondary", "warning"]] = None


class CustomPayload(BaseModel):
    """Custom payload for specialized chat responses"""
    type: str
    data: Any


class ActionMetadata(BaseModel):
    """Metadata for action-based interactions"""
    action_identifier: str
    action_data: Optional[Any] = None


class ToolHistoryEntry(BaseModel):
    """Record of a tool call made during the response (simplified view for UI)"""
    tool_name: str
    input: Any
    output: Any


# ============================================================================
# Chat Response Payload (what the frontend receives on stream completion)
# ============================================================================

class ChatResponsePayload(BaseModel):
    """Structured payload for final chat responses"""
    message_text: str
    suggested_values: Optional[List[SuggestedValue]] = None
    suggested_actions: Optional[List[SuggestedAction]] = None
    custom_payload: Optional[CustomPayload] = None
    tool_history: Optional[List[ToolHistoryEntry]] = None
    conversation_id: Optional[int] = None
    message_id: Optional[int] = None
    warning: Optional[str] = None
    diagnostics: Optional["AgentTrace"] = None


# ============================================================================
# Stream Event Types (discriminated union with explicit 'type' field)
# ============================================================================

class TextDeltaEvent(BaseModel):
    """Streaming text token"""
    type: Literal["text_delta"] = "text_delta"
    text: str


class StatusEvent(BaseModel):
    """Status message (thinking, processing, etc.)"""
    type: Literal["status"] = "status"
    message: str


class ToolStartEvent(BaseModel):
    """Tool execution begins"""
    type: Literal["tool_start"] = "tool_start"
    tool: str
    input: Any
    tool_use_id: str


class ToolProgressEvent(BaseModel):
    """Tool execution progress update"""
    type: Literal["tool_progress"] = "tool_progress"
    tool: str
    stage: str
    message: str
    progress: float  # 0.0 to 1.0
    data: Optional[Any] = None


class ToolCompleteEvent(BaseModel):
    """Tool execution finished"""
    type: Literal["tool_complete"] = "tool_complete"
    tool: str
    index: int  # Index for [[tool:N]] markers


class CompleteEvent(BaseModel):
    """Final response with payload"""
    type: Literal["complete"] = "complete"
    payload: ChatResponsePayload


class ErrorEvent(BaseModel):
    """Error occurred"""
    type: Literal["error"] = "error"
    message: str


class ChatIdEvent(BaseModel):
    """Emitted early so the frontend knows the conversation_id even on cancel"""
    type: Literal["chat_id"] = "chat_id"
    conversation_id: int


class GuestLimitEvent(BaseModel):
    """Guest user has reached the turn limit and must register to continue"""
    type: Literal["guest_limit"] = "guest_limit"
    message: str


StreamEvent = Union[
    TextDeltaEvent,
    StatusEvent,
    ToolStartEvent,
    ToolProgressEvent,
    ToolCompleteEvent,
    CompleteEvent,
    ErrorEvent,
    ChatIdEvent,
    GuestLimitEvent,
]


# ============================================================================
# Agent Trace Types (execution tracing internals, stored in extras)
# ============================================================================

class ToolDefinition(BaseModel):
    """Tool definition as sent to the model"""
    name: str
    description: str
    input_schema: dict


class TokenUsage(BaseModel):
    """Token counts from model response"""
    input_tokens: int
    output_tokens: int


class ToolCall(BaseModel):
    """
    Complete trace of a single tool call - exact data at each boundary.

    Captures what each component actually saw, with no reconstruction needed.
    """
    tool_use_id: str
    tool_name: str

    # What model requested and tool received (no transform)
    tool_input: dict

    # What executor returned (raw, before formatting)
    output_from_executor: Any
    output_type: str  # "ToolResult", "str", "error", etc.

    # What went into tool_result message back to model
    output_to_model: str

    # Payload generated by this tool call (if any)
    payload: Optional[dict] = None

    # Progress events from streaming tools (search, fetch, compute steps, etc.)
    progress_events: Optional[List[dict]] = None

    # Timing
    execution_ms: int


class AgentIteration(BaseModel):
    """One complete iteration of the agent loop"""
    iteration: int  # 1-indexed

    # EXACT messages array sent to model
    messages_to_model: List[dict]

    # Model response
    response_content: List[dict]  # Content blocks (text, tool_use)
    stop_reason: str  # "end_turn", "tool_use", "max_tokens"
    usage: TokenUsage
    api_call_ms: int

    # Tool calls made this iteration (empty list if none)
    tool_calls: List[ToolCall]


class FinalResponse(BaseModel):
    """Snapshot of what was sent to the frontend (mirrors ChatResponsePayload minus diagnostics)"""
    message_text: str
    raw_text: Optional[str] = None
    suggested_values: Optional[List[SuggestedValue]] = None
    suggested_actions: Optional[List[SuggestedAction]] = None
    custom_payload: Optional[CustomPayload] = None
    tool_history: Optional[List[ToolHistoryEntry]] = None
    conversation_id: Optional[int] = None


class AgentTrace(BaseModel):
    """
    Complete trace of an agent loop execution.

    Captures exact data at every boundary - no reconstruction needed.
    When debugging, you see precisely what each component saw.
    """
    # Correlation
    trace_id: str  # UUID for linking across systems

    # === CONFIGURATION (immutable inputs) ===
    model: str
    max_tokens: int
    max_iterations: int
    temperature: float
    system_prompt: str
    tools: List[ToolDefinition]  # Full definitions, not just names
    context: dict  # Request context

    # === INPUT (the stored conversation) ===
    # Messages from DB + new user request - the "real" conversation that persists
    initial_messages: List[dict]

    # === EXECUTION (what happened) ===
    iterations: List[AgentIteration]

    # === OUTCOME ===
    raw_text: str  # The concatenated response text
    total_iterations: int
    outcome: Literal["complete", "max_iterations", "cancelled", "error"]
    error_message: Optional[str] = None

    # === FINAL RESPONSE (what went to frontend) ===
    final_response: Optional[FinalResponse] = None

    # === METRICS ===
    # Cumulative across all iterations (for cost tracking)
    total_input_tokens: int
    total_output_tokens: int
    total_duration_ms: int
    # High-water mark: the largest single API call's input tokens.
    # This is the actual context window pressure — system prompt + history +
    # tool results for the heaviest iteration (usually the last one).
    peak_input_tokens: Optional[int] = None
