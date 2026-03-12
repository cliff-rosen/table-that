"""
Generic Agentic Loop

A reusable async generator that runs an agentic loop with tool support.
Emits typed events that consumers can map to their specific output format.

All tool executors are async. Two variants:
- Plain: async def executor(...) -> ToolResult
- Streaming: async def executor(...) -> AsyncGenerator[ToolProgress | ToolResult]

Used by:
- ChatStreamService (SSE streaming)
- Future agentic tools (e.g., deep_research)
"""

import asyncio
import copy
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolResult, ToolProgress
from schemas.chat import (
    AgentTrace,
    AgentIteration,
    ToolCall,
    ToolDefinition,
    TokenUsage,
)

logger = logging.getLogger(__name__)


# =============================================================================
# Event Types
# =============================================================================

@dataclass
class AgentEvent:
    """Base class for events emitted during agentic loop."""
    pass


@dataclass
class AgentThinking(AgentEvent):
    """Emitted at start of loop or when processing."""
    message: str


@dataclass
class AgentTextDelta(AgentEvent):
    """Emitted when streaming text (only when stream_text=True)."""
    text: str


@dataclass
class AgentMessage(AgentEvent):
    """Emitted when the agent produces a text response (non-streaming mode)."""
    text: str
    iteration: int


@dataclass
class AgentToolStart(AgentEvent):
    """Emitted when starting a tool call."""
    tool_name: str
    tool_input: Dict[str, Any]
    tool_use_id: str


@dataclass
class AgentToolProgress(AgentEvent):
    """Emitted during streaming tool execution."""
    tool_name: str
    stage: str
    message: str
    progress: float  # 0.0 to 1.0
    data: Optional[Any] = None


@dataclass
class AgentToolComplete(AgentEvent):
    """Emitted when a tool call completes."""
    tool_name: str
    result_text: str
    result_data: Any


@dataclass
class AgentComplete(AgentEvent):
    """Emitted when the agent loop completes successfully."""
    text: str
    tool_calls: List[Dict[str, Any]]  # Simplified view for UI
    payloads: List[Dict[str, Any]] = field(default_factory=list)
    trace: Optional[AgentTrace] = None  # Full execution trace


@dataclass
class AgentCancelled(AgentEvent):
    """Emitted when the agent loop is cancelled."""
    text: str
    tool_calls: List[Dict[str, Any]]
    payloads: List[Dict[str, Any]] = field(default_factory=list)
    trace: Optional[AgentTrace] = None


@dataclass
class AgentError(AgentEvent):
    """Emitted when an error occurs."""
    error: str
    text: str = ""
    tool_calls: List[Dict[str, Any]] = field(default_factory=list)
    payloads: List[Dict[str, Any]] = field(default_factory=list)
    trace: Optional[AgentTrace] = None


# =============================================================================
# Internal Result Types (for helper generators)
# =============================================================================

@dataclass
class _ModelResult:
    """Final result from _call_model generator."""
    response: Any
    text: str
    usage: TokenUsage
    api_call_ms: int


@dataclass
class _ToolsResult:
    """Final result from _process_tools generator."""
    tool_results: List[Dict]  # For message to model
    tool_records: List[Dict]  # Simplified view for UI
    tool_calls: List[ToolCall]  # Full trace data
    payloads: List[Dict]


@dataclass
class _ToolExecResult:
    """Result of executing a single tool (output from _execute_tool)."""
    output_from_executor: Any = None
    output_type: str = "unknown"
    tool_result_str: str = ""
    tool_result_data: Any = None
    progress_events: List[Dict] = field(default_factory=list)


# =============================================================================
# Cancellation Token
# =============================================================================

class CancellationToken:
    """Token for cancelling long-running operations."""

    def __init__(self):
        self._cancelled = False

    @property
    def is_cancelled(self) -> bool:
        return self._cancelled

    def cancel(self):
        self._cancelled = True

    def check(self) -> None:
        """Raise CancelledError if cancelled."""
        if self._cancelled:
            raise asyncio.CancelledError("Operation was cancelled")


# =============================================================================
# Trace Builder
# =============================================================================

class TraceBuilder:
    """
    Builds an AgentTrace incrementally during loop execution.

    Consolidates all trace-related state and provides helper methods
    to keep the main loop clean.
    """

    def __init__(
        self,
        model: str,
        max_tokens: int,
        max_iterations: int,
        temperature: float,
        system_prompt: str,
        tools: Dict[str, ToolConfig],
        context: Dict[str, Any],
        initial_messages: List[Dict],
    ):
        self._start_time = time.time()
        self._trace_id = str(uuid.uuid4())

        # Configuration (immutable)
        self._model = model
        self._max_tokens = max_tokens
        self._max_iterations = max_iterations
        self._temperature = temperature
        self._system_prompt = system_prompt
        # Strip internal keys (like _cancellation_token) from the trace context
        # so it stays JSON-serializable
        self._context = {k: v for k, v in context.items() if not k.startswith("_")}
        self._initial_messages = copy.deepcopy(initial_messages)
        self._tool_definitions = [
            ToolDefinition(
                name=config.name,
                description=config.description,
                input_schema=config.input_schema
            )
            for config in tools.values()
        ]

        # Accumulated state
        self._iterations: List[AgentIteration] = []
        self._total_input_tokens = 0
        self._total_output_tokens = 0

    def add_tokens(self, usage: TokenUsage) -> None:
        """Add token usage from a model call."""
        self._total_input_tokens += usage.input_tokens
        self._total_output_tokens += usage.output_tokens

    def add_iteration(
        self,
        iteration: int,
        messages_to_model: List[Dict],
        response_content: List[Dict],
        stop_reason: str,
        usage: TokenUsage,
        api_call_ms: int,
        tool_calls: Optional[List[ToolCall]] = None,
    ) -> None:
        """Record a completed iteration."""
        self._iterations.append(AgentIteration(
            iteration=iteration,
            messages_to_model=messages_to_model,
            response_content=response_content,
            stop_reason=stop_reason,
            usage=usage,
            api_call_ms=api_call_ms,
            tool_calls=tool_calls or [],
        ))

    def build(self, outcome: str, final_text: str, error_message: Optional[str] = None) -> AgentTrace:
        """Build the final trace object."""
        peak_input = max(
            (it.usage.input_tokens for it in self._iterations),
            default=0,
        )
        return AgentTrace(
            trace_id=self._trace_id,
            model=self._model,
            max_tokens=self._max_tokens,
            max_iterations=self._max_iterations,
            temperature=self._temperature,
            system_prompt=self._system_prompt,
            tools=self._tool_definitions,
            context=self._context,
            initial_messages=self._initial_messages,
            iterations=self._iterations,
            final_text=final_text,
            total_iterations=len(self._iterations),
            outcome=outcome,
            error_message=error_message,
            total_input_tokens=self._total_input_tokens,
            total_output_tokens=self._total_output_tokens,
            total_duration_ms=int((time.time() - self._start_time) * 1000),
            peak_input_tokens=peak_input if peak_input > 0 else None,
        )


# =============================================================================
# Main Agent Loop
# =============================================================================

async def run_agent_loop(
    client: anthropic.AsyncAnthropic,
    model: str,
    max_tokens: int,
    max_iterations: int,
    system_prompt: str,
    messages: List[Dict],
    tools: Dict[str, ToolConfig],
    db: AsyncSession,
    user_id: int,
    context: Optional[Dict[str, Any]] = None,
    cancellation_token: Optional[CancellationToken] = None,
    stream_text: bool = False,
    temperature: float = 0.7
) -> AsyncGenerator[AgentEvent, None]:
    """
    Generic agentic loop that yields events.

    Args:
        client: Anthropic async client
        model: Model to use (e.g., "claude-sonnet-4-20250514")
        max_tokens: Maximum tokens per response
        max_iterations: Maximum tool call iterations
        system_prompt: System prompt for the agent
        messages: Initial message history
        tools: Dict mapping tool name -> ToolConfig
        db: Database session
        user_id: User ID for tool execution
        context: Additional context passed to tool executors
        cancellation_token: Optional token to check for cancellation
        stream_text: If True, yield AgentTextDelta events for streaming
        temperature: Model temperature

    Yields:
        AgentEvent subclasses representing loop progress
    """
    context = dict(context) if context else {}  # Shallow copy to avoid mutating caller's dict
    cancellation_token = cancellation_token or CancellationToken()
    context["_cancellation_token"] = cancellation_token

    # Initialize trace builder and API kwargs
    trace_builder = TraceBuilder(
        model=model,
        max_tokens=max_tokens,
        max_iterations=max_iterations,
        temperature=temperature,
        system_prompt=system_prompt,
        tools=tools,
        context=context,
        initial_messages=messages,
    )
    api_kwargs = _build_api_kwargs(model, max_tokens, temperature, system_prompt, messages, tools)

    # Accumulated results for events
    collected_text = ""
    tool_call_history: List[Dict[str, Any]] = []
    collected_payloads: List[Dict[str, Any]] = []

    yield AgentThinking(message="Starting...")

    try:
        for iteration in range(1, max_iterations + 1):
            if cancellation_token.is_cancelled:
                yield AgentCancelled(
                    text=collected_text,
                    tool_calls=tool_call_history,
                    payloads=collected_payloads,
                    trace=trace_builder.build("cancelled", collected_text)
                )
                return

            logger.debug(f"Agent loop iteration {iteration}")

            # Snapshot messages before API call
            messages_to_model = copy.deepcopy(api_kwargs["messages"])

            # 1. Call model
            response = None
            model_result: Optional[_ModelResult] = None
            async for event in _call_model(client, api_kwargs, stream_text, cancellation_token):
                if isinstance(event, _ModelResult):
                    response = event.response
                    model_result = event
                    collected_text += event.text
                    trace_builder.add_tokens(event.usage)
                else:
                    yield event

            if cancellation_token.is_cancelled:
                yield AgentCancelled(
                    text=collected_text,
                    tool_calls=tool_call_history,
                    payloads=collected_payloads,
                    trace=trace_builder.build("cancelled", collected_text)
                )
                return

            response_content = _response_content_to_dicts(response)
            tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

            # 2. No tools - complete
            if not tool_use_blocks:
                trace_builder.add_iteration(
                    iteration=iteration,
                    messages_to_model=messages_to_model,
                    response_content=response_content,
                    stop_reason=response.stop_reason or "end_turn",
                    usage=model_result.usage,
                    api_call_ms=model_result.api_call_ms,
                )
                logger.info(f"Agent loop complete after {iteration} iterations")
                yield AgentComplete(
                    text=collected_text,
                    tool_calls=tool_call_history,
                    payloads=collected_payloads,
                    trace=trace_builder.build("complete", collected_text)
                )
                return

            # 3. Process tools
            tool_results = None
            tools_result: Optional[_ToolsResult] = None
            async for event in _process_tools(
                tool_use_blocks, tools, db, user_id, context, cancellation_token
            ):
                if isinstance(event, _ToolsResult):
                    tools_result = event
                    tool_results = event.tool_results
                    tool_call_history.extend(event.tool_records)
                    collected_payloads.extend(event.payloads)
                else:
                    yield event

            trace_builder.add_iteration(
                iteration=iteration,
                messages_to_model=messages_to_model,
                response_content=response_content,
                stop_reason=response.stop_reason or "tool_use",
                usage=model_result.usage,
                api_call_ms=model_result.api_call_ms,
                tool_calls=tools_result.tool_calls if tools_result else None,
            )

            # 4. Update messages for next iteration
            _append_tool_exchange(messages, response, tool_results)
            api_kwargs["messages"] = messages

            if stream_text:
                collected_text += "\n\n"
                yield AgentTextDelta(text="\n\n")

        # Max iterations - final summary call
        logger.warning(f"Agent loop reached max iterations ({max_iterations}), requesting final summary")

        messages.append({
            "role": "user",
            "content": "You've reached the maximum number of tool calls. Please provide a final summary of what you found based on your research above. Do not call any more tools."
        })

        final_kwargs = {**api_kwargs, "messages": messages}
        final_kwargs.pop("tools", None)
        messages_to_model = copy.deepcopy(final_kwargs["messages"])
        collected_text = ""

        model_result = None
        async for event in _call_model(client, final_kwargs, stream_text, cancellation_token):
            if isinstance(event, _ModelResult):
                collected_text = event.text
                model_result = event
                trace_builder.add_tokens(event.usage)
            else:
                yield event

        if model_result:
            trace_builder.add_iteration(
                iteration=max_iterations + 1,
                messages_to_model=messages_to_model,
                response_content=_response_content_to_dicts(model_result.response),
                stop_reason=model_result.response.stop_reason or "end_turn",
                usage=model_result.usage,
                api_call_ms=model_result.api_call_ms,
            )

        yield AgentComplete(
            text=collected_text,
            tool_calls=tool_call_history,
            payloads=collected_payloads,
            trace=trace_builder.build("max_iterations", collected_text)
        )

    except asyncio.CancelledError:
        yield AgentCancelled(
            text=collected_text,
            tool_calls=tool_call_history,
            payloads=collected_payloads,
            trace=trace_builder.build("cancelled", collected_text)
        )
    except Exception as e:
        logger.error(f"Agent loop error: {e}", exc_info=True)
        yield AgentError(
            error=_format_error_message(e),
            text=collected_text,
            tool_calls=tool_call_history,
            payloads=collected_payloads,
            trace=trace_builder.build("error", collected_text, error_message=str(e))
        )


def _response_content_to_dicts(response: Any) -> List[Dict]:
    """Convert response content blocks to dicts for trace storage."""
    result = []
    for block in response.content:
        if block.type == "text":
            result.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            result.append({
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input
            })
    return result


# =============================================================================
# Helper: Build API kwargs
# =============================================================================

def _build_api_kwargs(
    model: str,
    max_tokens: int,
    temperature: float,
    system_prompt: str,
    messages: List[Dict],
    tools: Dict[str, ToolConfig]
) -> Dict:
    """Build kwargs for Anthropic API call."""
    api_kwargs = {
        "model": model,
        "max_tokens": max_tokens,
        "temperature": temperature,
        "system": system_prompt,
        "messages": messages
    }

    if tools:
        api_kwargs["tools"] = [
            {
                "name": config.name,
                "description": config.description,
                "input_schema": config.input_schema
            }
            for config in tools.values()
        ]
        logger.info(f"Agent loop with {len(tools)} tools: {list(tools.keys())}")
    else:
        logger.info("Agent loop with NO TOOLS")

    return api_kwargs


# =============================================================================
# Helper: Call Model
# =============================================================================

async def _call_model(
    client: anthropic.AsyncAnthropic,
    api_kwargs: Dict,
    stream_text: bool,
    cancellation_token: CancellationToken
) -> AsyncGenerator[Union[AgentEvent, _ModelResult], None]:
    """
    Call the model and yield events.

    Yields:
        AgentTextDelta events (if streaming)
        AgentMessage event (if not streaming)
        _ModelResult as final item with response, collected text, usage, and timing
    """
    collected_text = ""
    start_time = time.time()

    if stream_text:
        async with client.messages.stream(**api_kwargs) as stream:
            async for event in stream:
                if cancellation_token.is_cancelled:
                    raise asyncio.CancelledError("Cancelled during streaming")

                if hasattr(event, 'type'):
                    if event.type == 'content_block_delta' and hasattr(event, 'delta'):
                        if hasattr(event.delta, 'text'):
                            text = event.delta.text
                            collected_text += text
                            yield AgentTextDelta(text=text)

            response = await stream.get_final_message()
    else:
        response = await client.messages.create(**api_kwargs)

        for block in response.content:
            if hasattr(block, 'text'):
                collected_text += block.text

        if collected_text:
            yield AgentMessage(text=collected_text, iteration=0)

    api_call_ms = int((time.time() - start_time) * 1000)
    usage = TokenUsage(
        input_tokens=response.usage.input_tokens,
        output_tokens=response.usage.output_tokens,
    )

    yield _ModelResult(response=response, text=collected_text, usage=usage, api_call_ms=api_call_ms)


# =============================================================================
# Helper: Execute Single Tool
# =============================================================================

async def _execute_tool(
    tool_config: ToolConfig,
    tool_name: str,
    tool_input: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
    cancellation_token: CancellationToken,
    tool_start_time: float,
) -> AsyncGenerator[Union[AgentToolProgress, _ToolExecResult], None]:
    """
    Execute a single tool and yield progress events + final result.

    All executors are async. Two variants:
    - Plain: returns ToolResult directly
    - Streaming: returns an async generator yielding ToolProgress then ToolResult

    Yields AgentToolProgress events during streaming, then yields a single
    _ToolExecResult as the final item.
    """
    result = _ToolExecResult()

    if cancellation_token.is_cancelled:
        raise asyncio.CancelledError(f"Tool {tool_name} cancelled before execution")

    raw_result = await tool_config.executor(tool_input, db, user_id, context)
    result.output_from_executor = raw_result

    # --- Streaming: async generator yielding ToolProgress then ToolResult ---
    if hasattr(raw_result, '__anext__'):
        final = None
        async for item in raw_result:
            if cancellation_token.is_cancelled:
                raise asyncio.CancelledError(f"Tool {tool_name} cancelled during streaming")
            if isinstance(item, ToolProgress):
                result.progress_events.append({
                    "stage": item.stage,
                    "message": item.message,
                    "progress": item.progress,
                    "data": item.data,
                    "elapsed_ms": int((time.time() - tool_start_time) * 1000),
                })
                yield AgentToolProgress(
                    tool_name=tool_name,
                    stage=item.stage,
                    message=item.message,
                    progress=item.progress,
                    data=item.data,
                )
            elif isinstance(item, ToolResult):
                final = item
                result.tool_result_str = item.text
                result.tool_result_data = item.payload
        result.output_from_executor = final
        result.output_type = "ToolResult" if final else "async_generator"

    # --- Plain: returned ToolResult or str directly ---
    elif isinstance(raw_result, ToolResult):
        result.output_type = "ToolResult"
        result.tool_result_str = raw_result.text
        result.tool_result_data = raw_result.payload
    elif isinstance(raw_result, str):
        result.output_type = "str"
        result.tool_result_str = raw_result
    else:
        result.output_type = type(raw_result).__name__
        result.tool_result_str = str(raw_result)

    yield result


# =============================================================================
# Helper: Process Tools
# =============================================================================

async def _process_tools(
    tool_use_blocks: List,
    tools: Dict[str, ToolConfig],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
    cancellation_token: CancellationToken
) -> AsyncGenerator[Union[AgentEvent, _ToolsResult], None]:
    """
    Process all tool calls and yield events.

    Delegates execution of each tool to _execute_tool, then collects results
    into trace records, UI records, and payloads.

    Yields:
        AgentToolStart, AgentToolProgress, AgentToolComplete events
        _ToolsResult as final item with results, records, tool_calls, and payloads
    """
    tool_results = []  # For message back to model
    tool_records = []  # Simplified view for UI
    tool_calls = []  # Full trace data
    payloads = []

    for tool_block in tool_use_blocks:
        tool_name = tool_block.name
        tool_input = tool_block.input
        tool_use_id = tool_block.id

        logger.info(f"Agent tool call: {tool_name}")

        yield AgentToolStart(
            tool_name=tool_name,
            tool_input=tool_input,
            tool_use_id=tool_use_id,
        )

        tool_start_time = time.time()
        tool_config = tools.get(tool_name)

        if not tool_config:
            exec_result = _ToolExecResult(
                output_from_executor=f"Unknown tool: {tool_name}",
                output_type="error",
                tool_result_str=f"Unknown tool: {tool_name}",
            )
        else:
            try:
                exec_result = _ToolExecResult()
                async for event in _execute_tool(
                    tool_config, tool_name, tool_input,
                    db, user_id, context, cancellation_token, tool_start_time,
                ):
                    if isinstance(event, AgentToolProgress):
                        yield event
                    elif isinstance(event, _ToolExecResult):
                        exec_result = event
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.error(f"Tool execution error: {e}", exc_info=True)
                exec_result = _ToolExecResult(
                    output_from_executor=str(e),
                    output_type="error",
                    tool_result_str=f"Error executing tool: {str(e)}",
                )

        if cancellation_token.is_cancelled:
            raise asyncio.CancelledError("Cancelled after tool execution")

        execution_ms = int((time.time() - tool_start_time) * 1000)

        # Build full trace record
        tool_calls.append(ToolCall(
            tool_use_id=tool_use_id,
            tool_name=tool_name,
            tool_input=tool_input,
            output_from_executor=_safe_serialize(exec_result.output_from_executor),
            output_type=exec_result.output_type,
            output_to_model=exec_result.tool_result_str,
            payload=_safe_serialize(exec_result.tool_result_data) if exec_result.tool_result_data else None,
            progress_events=exec_result.progress_events if exec_result.progress_events else None,
            execution_ms=execution_ms,
        ))

        # Record simplified view for UI
        tool_records.append({
            "tool_name": tool_name,
            "input": tool_input,
            "output": exec_result.tool_result_str,
        })

        if exec_result.tool_result_data:
            payloads.append(exec_result.tool_result_data)

        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool_use_id,
            "content": exec_result.tool_result_str,
        })

        yield AgentToolComplete(
            tool_name=tool_name,
            result_text=exec_result.tool_result_str,
            result_data=exec_result.tool_result_data,
        )

    yield _ToolsResult(tool_results=tool_results, tool_records=tool_records, tool_calls=tool_calls, payloads=payloads)


def _safe_serialize(obj: Any) -> Any:
    """Safely serialize an object for trace storage."""
    if obj is None:
        return None
    if isinstance(obj, (str, int, float, bool)):
        return obj
    if isinstance(obj, dict):
        return {k: _safe_serialize(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        return [_safe_serialize(item) for item in obj]
    if isinstance(obj, ToolResult):
        return {"text": obj.text, "payload": _safe_serialize(obj.payload)}
    # For other objects, try to get a useful representation
    try:
        return str(obj)
    except Exception:
        return f"<{type(obj).__name__}>"


# =============================================================================
# Helper: Append Tool Exchange
# =============================================================================

def _append_tool_exchange(messages: List[Dict], response: Any, tool_results: List[Dict]):
    """Append assistant content and tool results to messages."""
    assistant_content = []
    for block in response.content:
        if block.type == "text":
            assistant_content.append({"type": "text", "text": block.text})
        elif block.type == "tool_use":
            assistant_content.append({
                "type": "tool_use",
                "id": block.id,
                "name": block.name,
                "input": block.input
            })

    messages.append({"role": "assistant", "content": assistant_content})
    messages.append({"role": "user", "content": tool_results})


# =============================================================================
# Utility Functions
# =============================================================================

def _format_error_message(e: Exception) -> str:
    """Convert exception to user-friendly error message."""
    error_str = str(e)

    if "credit balance is too low" in error_str.lower():
        return "API credit balance is too low. Please add credits to your Anthropic account."
    elif "rate limit" in error_str.lower() or "429" in error_str:
        return "Rate limit exceeded. Please wait a moment and try again."
    elif "invalid_api_key" in error_str.lower() or "authentication" in error_str.lower():
        return "API authentication failed. Please check your API key configuration."
    elif "timeout" in error_str.lower():
        return "Request timed out. Please try again."
    elif "connection" in error_str.lower():
        return "Connection error. Please check your internet connection and try again."

    return error_str
