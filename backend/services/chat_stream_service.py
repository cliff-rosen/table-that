"""
Chat Streaming Service

Handles LLM streaming interaction for the chat system with tool support.
Uses the agent_loop for agentic processing. Handles chat persistence automatically.
"""

from dataclasses import dataclass, field
from typing import Callable, Dict, Any, AsyncGenerator, List, Optional
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import anthropic
import asyncio
import os
import logging
import re
import uuid
from schemas.chat import (
    ChatResponsePayload,
    AgentTrace,
    FinalResponse,
    SuggestedValue,
    SuggestedAction,
    CustomPayload,
    ToolHistoryEntry,
    TextDeltaEvent,
    StatusEvent,
    ToolStartEvent,
    ToolProgressEvent,
    ToolCompleteEvent,
    CompleteEvent,
    ErrorEvent,
    ChatIdEvent,
    GuestLimitEvent,
)
from schemas.payloads import summarize_payload
from services.chat_page_config import (
    PageLocation,
    get_context_builder,
    get_client_actions,
    get_all_payloads_for_page,
)
from tools.registry import get_tools_for_page_dict
from agents.agent_loop import (
    run_agent_loop,
    CancellationToken,
    AgentThinking,
    AgentTextDelta,
    AgentToolStart,
    AgentToolProgress,
    AgentToolComplete,
    AgentComplete,
    AgentCancelled,
    AgentError,
)
from services.chat_service import ChatService, derive_scope

logger = logging.getLogger(__name__)

CHAT_MODEL = "claude-sonnet-4-20250514"
CHAT_MAX_TOKENS = 8000
DEFAULT_MAX_TOOL_ITERATIONS = 5  # Configurable max iterations for agent loop, can be adjusted based on needs and model capabilities.
DEFAULT_GUEST_TURN_LIMIT = 8  # Fallback; actual value loaded from DB via ChatService.get_guest_turn_limit()
# Context window for the chat model. Warning fires at 70% usage.
CONTEXT_WINDOW_TOKENS = 200_000
CONTEXT_WARNING_THRESHOLD = int(CONTEXT_WINDOW_TOKENS * 0.70)  # 140k


@dataclass
class ResolvedConversation:
    """The resolved state of the conversation before this turn.

    Produced by _resolve_chat, consumed by _commit_turn and prompt building.
    """
    chat_id: Optional[int]
    scope: Optional[str]
    db_messages: List = field(default_factory=list)


@dataclass
class PendingTurn:
    """In-flight turn state for the write-late pattern.

    Three parts of a turn:
      history      — prior conversation state from DB
      user_message — what the user sent (the input extending it)
      response     — assistant response being assembled
    """
    history: ResolvedConversation
    user_message: Any  # ChatRequest
    response: "ResponseBuilder"
    committed: bool = False
    commit_lock: asyncio.Lock = field(default_factory=asyncio.Lock)


class ResponseBuilder:
    """Accumulates streaming events and builds the final response.

    Used by stream_chat_message to collect data as it streams from the agent
    loop, then build the final response for both SSE delivery and DB
    persistence.  On cancel, provides raw collected content for partial
    turn persistence.
    """

    def __init__(self):
        # ── Raw accumulation (set during streaming) ──
        self.collected_text: str = ""
        self.tool_call_history: list = []
        self.collected_payloads: list = []
        self.trace: Optional[AgentTrace] = None
        self.tool_call_index: int = 0

        # ── Finalized state (set by finalize()) ──
        self._finalized = False
        self._parsed_message: Optional[str] = None
        self._extras: Optional[Dict[str, Any]] = None
        self._suggested_values = None
        self._suggested_actions = None
        self._custom_payload_obj = None
        self._tool_history_entries = None

    # ── Accumulation methods (called during streaming) ──────────────

    def add_text(self, text: str) -> None:
        """Append a text delta."""
        self.collected_text += text

    def add_tool_marker(self) -> str:
        """Register a tool completion and return the marker string."""
        marker = f"[[tool:{self.tool_call_index}]]"
        self.collected_text += marker
        self.tool_call_index += 1
        return marker

    def set_agent_result(self, event) -> None:
        """Capture final state from AgentComplete or AgentCancelled."""
        self.tool_call_history = event.tool_calls
        self.collected_payloads = event.payloads
        self.trace = event.trace

    def set_trace(self, trace: Optional[AgentTrace]) -> None:
        """Capture trace (e.g. from AgentError)."""
        self.trace = trace

    # ── Finalize (called on normal completion) ─────────────────────

    def finalize(self, parsed: Dict[str, Any]) -> None:
        """Process raw accumulated data into final form for persistence.

        After this call, .content returns the parsed message and .extras
        returns the full extras dict.  On cancel paths this is never
        called, so .content returns raw text and .extras returns None.

        Args:
            parsed: Dict with keys message, suggested_values,
                    suggested_actions, custom_payload
        """

        # ── Merge payloads (tool-emitted take priority over text-parsed) ──
        all_payloads = list(self.collected_payloads)
        tool_payload_types = {p.get("type") for p in self.collected_payloads if p}

        if parsed.get("custom_payload"):
            text_payload_type = parsed["custom_payload"].get("type")
            if text_payload_type in tool_payload_types:
                logger.info(
                    f"SSE: dropping text-parsed {text_payload_type} payload — "
                    f"tool already emitted one"
                )
            else:
                all_payloads.append(parsed["custom_payload"])

        logger.info(
            f"SSE complete: collected_payloads={len(self.collected_payloads)}, "
            f"all_payloads={len(all_payloads)}, "
            f"types={[p.get('type') for p in all_payloads]}"
        )

        all_payloads = self._merge_same_type_payloads(all_payloads)
        payloads_with_ids = self._process_payloads(all_payloads)
        custom_payload = payloads_with_ids[-1] if payloads_with_ids else None

        # ── Suggested values / actions ──
        suggested_values = None
        if parsed.get("suggested_values"):
            suggested_values = [
                SuggestedValue(text=sv) if isinstance(sv, str) else SuggestedValue(**sv)
                for sv in parsed["suggested_values"]
            ]

        suggested_actions = None
        if parsed.get("suggested_actions"):
            suggested_actions = [
                SuggestedAction(**sa) for sa in parsed["suggested_actions"]
            ]

        custom_payload_obj = CustomPayload(**custom_payload) if custom_payload else None

        # ── Tool history ──
        tool_history_entries = None
        if self.tool_call_history:
            tool_history_entries = [
                ToolHistoryEntry(**th) for th in self.tool_call_history
            ]

        # ── Attach final response to trace ──
        if self.trace:
            self.trace.final_response = FinalResponse(
                message=parsed["message"],
                suggested_values=suggested_values,
                suggested_actions=suggested_actions,
                custom_payload=custom_payload_obj,
                tool_history=tool_history_entries,
            )

        # ── Store finalized data ──
        self._parsed_message = parsed["message"]
        self._suggested_values = suggested_values
        self._suggested_actions = suggested_actions
        self._custom_payload_obj = custom_payload_obj
        self._tool_history_entries = tool_history_entries

        extras = {
            "tool_history": self.tool_call_history or None,
            "custom_payload": custom_payload,
            "payloads": payloads_with_ids or None,
            "trace": self.trace.model_dump() if self.trace else None,
            "suggested_values": [sv.model_dump() for sv in suggested_values] if suggested_values else None,
            "suggested_actions": [sa.model_dump() for sa in suggested_actions] if suggested_actions else None,
        }
        extras = {k: v for k, v in extras.items() if v is not None}
        self._extras = extras if extras else None
        self._finalized = True

    # ── Package for delivery (called after commit) ───────────────

    def to_complete_event(self, conversation_id: int) -> CompleteEvent:
        """Build the CompleteEvent for SSE delivery.

        Must be called after finalize().  Takes conversation_id because
        that's only known after _commit_turn.
        """
        if not self._finalized:
            raise RuntimeError("to_complete_event called before finalize()")

        # Update trace with conversation_id now that we have it
        if self.trace and self.trace.final_response:
            self.trace.final_response.conversation_id = conversation_id

        # Context window warning
        context_warning = None
        if (
            self.trace
            and self.trace.peak_input_tokens
            and self.trace.peak_input_tokens >= CONTEXT_WARNING_THRESHOLD
        ):
            pct = int(self.trace.peak_input_tokens / CONTEXT_WINDOW_TOKENS * 100)
            context_warning = (
                f"This conversation is using {pct}% of the available context window. "
                f"Consider starting a new conversation to ensure the best response quality."
            )

        payload = ChatResponsePayload(
            message=self._parsed_message,
            suggested_values=self._suggested_values,
            suggested_actions=self._suggested_actions,
            custom_payload=self._custom_payload_obj,
            tool_history=self.tool_call_history or None,
            conversation_id=conversation_id,
            warning=context_warning,
            diagnostics=self.trace,
        )
        return CompleteEvent(payload=payload)

    # ── Content access (for persistence) ──────────────────────────────

    @property
    def has_content(self) -> bool:
        """True if the builder has content worth persisting."""
        return bool(self.collected_text.strip()) or bool(self.tool_call_history)

    @property
    def content(self) -> str:
        """Message content for DB persistence.

        After finalize(): the parsed message (payloads/markers stripped).
        Before finalize() (cancel path): raw collected text.
        """
        if self._finalized and self._parsed_message is not None:
            return self._parsed_message
        return self.collected_text.strip()

    @property
    def extras(self) -> Optional[Dict[str, Any]]:
        """Extras dict for DB persistence, or None if not built."""
        return self._extras

    # ── Internal helpers ────────────────────────────────────────────

    @staticmethod
    def _merge_same_type_payloads(
        payloads: List[Dict[str, Any]],
    ) -> List[Dict[str, Any]]:
        """Merge multiple payloads of the same type into one."""
        from collections import defaultdict

        groups: dict[str, list[Dict[str, Any]]] = defaultdict(list)
        order: list[str] = []
        for p in payloads:
            if not p:
                continue
            t = p.get("type", "")
            if t not in groups:
                order.append(t)
            groups[t].append(p)

        merged: list[Dict[str, Any]] = []
        for t in order:
            items = groups[t]
            if len(items) == 1:
                merged.append(items[0])
                continue

            if t == "data_proposal":
                combined_ops: list = []
                combined_log: list = []
                reasoning_parts: list[str] = []
                for item in items:
                    data = item.get("data", {})
                    combined_ops.extend(data.get("operations", []))
                    combined_log.extend(data.get("research_log", []))
                    if data.get("reasoning"):
                        reasoning_parts.append(data["reasoning"])
                merged.append({
                    "type": "data_proposal",
                    "data": {
                        "reasoning": " | ".join(reasoning_parts) if reasoning_parts else None,
                        "operations": combined_ops,
                        "research_log": combined_log if combined_log else None,
                    },
                })
            elif t == "schema_proposal":
                combined_ops = []
                reasoning_parts = []
                for item in items:
                    data = item.get("data", {})
                    combined_ops.extend(data.get("operations", []))
                    if data.get("reasoning"):
                        reasoning_parts.append(data["reasoning"])
                merged.append({
                    "type": "schema_proposal",
                    "data": {
                        "reasoning": " | ".join(reasoning_parts) if reasoning_parts else None,
                        "operations": combined_ops,
                    },
                })
            else:
                merged.append(items[-1])

        return merged

    @staticmethod
    def _process_payloads(payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Assign unique IDs and summaries to payloads."""
        processed = []
        for payload in payloads:
            if not payload:
                continue
            payload_type = payload.get("type", "unknown")
            payload_data = payload.get("data", {})
            payload_id = str(uuid.uuid4())[:8]
            summary = summarize_payload(payload_type, payload_data)
            processed.append({
                "payload_id": payload_id,
                "type": payload_type,
                "data": payload_data,
                "summary": summary,
            })
        return processed


class ChatStreamService:
    """Service for streaming chat interactions with tool support."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        # Read-path ChatService: uses the request-scoped session.
        # Write-path (_commit_turn) creates its own session + ChatService
        # so writes survive cancelled request scopes.
        self.chat_service = ChatService(db)

        # ── In-flight turn state (write-late pattern) ──
        self._turn: Optional[PendingTurn] = None

    async def _commit_turn(self) -> int:
        """Atomically write the pending turn to the database.

        Reads everything from self._turn: history (conversation state),
        user_message (what to save as the user message), and response
        (.content and .extras for the assistant message).

        Uses a fresh DB session so writes survive cancelled request scopes.
        Idempotent via turn.commit_lock + turn.committed.

        Returns the conversation ID.
        """
        turn = self._turn
        if not turn:
            raise RuntimeError("_commit_turn called with no pending turn")

        async with turn.commit_lock:
            if turn.committed:
                return turn.history.chat_id or 0

            from database import AsyncSessionLocal

            chat_id = turn.history.chat_id

            async with AsyncSessionLocal() as db:
                chat_service = ChatService(db)

                if not chat_id:
                    if not turn.history.scope:
                        logger.warning(
                            f"No scope derived from context: {turn.user_message.context}"
                        )
                    chat = await chat_service.create_chat(
                        self.user_id, app="table_that", scope=turn.history.scope
                    )
                    chat_id = chat.id
                else:
                    # Migrate scope if context indicates a different entity
                    table_id = turn.user_message.context.get("table_id")
                    if turn.history.scope and table_id:
                        chat = await chat_service.get_chat(chat_id, self.user_id)
                        if chat and chat.scope != turn.history.scope:
                            await chat_service.migrate_to_table(
                                chat_id, self.user_id, table_id
                            )

                await chat_service.add_message(
                    chat_id=chat_id,
                    user_id=self.user_id,
                    role="user",
                    content=turn.user_message.message,
                    context=turn.user_message.context,
                )
                await chat_service.add_message(
                    chat_id=chat_id,
                    user_id=self.user_id,
                    role="assistant",
                    content=turn.response.content,
                    context=turn.user_message.context,
                    extras=turn.response.extras,
                )

            turn.committed = True
            turn.history.chat_id = chat_id
            return chat_id

    async def commit_if_needed(self) -> None:
        """Commit turn if there's pending content.  For fire-and-forget use.

        Called by create_sse_stream's finally block as a last resort when
        stream_chat_message's finally doesn't run (streaming cancel case).
        """
        turn = self._turn
        if not turn:
            logger.debug("commit_if_needed: no pending turn")
            return
        if turn.committed:
            logger.debug("commit_if_needed: already committed")
            return
        if not turn.response.has_content:
            logger.info(
                f"commit_if_needed: no content to commit "
                f"(text={len(turn.response.collected_text)} chars)"
            )
            return
        logger.info(
            f"commit_if_needed: committing turn "
            f"(text={len(turn.response.collected_text)} chars)"
        )
        try:
            await self._commit_turn()
        except Exception:
            logger.warning(
                "Failed to commit turn (sse_generator fallback)",
                exc_info=True,
            )

    # =========================================================================
    # Public API
    # =========================================================================

    def create_sse_stream(
        self,
        request,
        user_role: str,
        cancellation_token: CancellationToken,
        on_cleanup: Optional[Callable[[], None]] = None,
    ) -> AsyncGenerator[Dict[str, str], None]:
        """Create the outermost SSE event generator.

        This generator is passed directly to EventSourceResponse.
        Because it is the outermost generator, its finally block
        reliably runs on client disconnect — guaranteeing persistence
        even when the inner stream_chat_message generator can't
        finalize (due to anyio cancel-scope limitations).

        Args:
            request: ChatRequest from the router
            user_role: User's role string for context injection
            cancellation_token: For cooperative cancellation
            on_cleanup: Optional sync callback invoked in finally
                        (e.g. to cancel a monitor task)
        """
        service = self

        async def _sse_generator():
            try:
                async for event_json in service.stream_chat_message(
                    request, user_role=user_role, cancellation_token=cancellation_token
                ):
                    yield {"event": "message", "data": event_json}

            except Exception as e:
                logger.error(f"Error in chat stream: {str(e)}")
                error_event = ErrorEvent(message=str(e))
                yield {
                    "event": "message",
                    "data": error_event.model_dump_json(),
                }

            finally:
                logger.info("SSE generator finally: cleaning up")
                if on_cleanup:
                    on_cleanup()
                # Last-resort commit: handles the streaming-cancel case
                # where stream_chat_message's finally doesn't run (nested
                # async generator cleanup limitation).  Fire-and-forget
                # because we may be inside a cancelled anyio scope.
                try:
                    asyncio.get_running_loop().create_task(
                        service.commit_if_needed()
                    )
                    logger.info("SSE generator finally: scheduled commit_if_needed task")
                except Exception:
                    logger.warning(
                        "Failed to schedule commit task", exc_info=True
                    )

        return _sse_generator()

    async def stream_chat_message(
        self, request, user_role: str = "member",
        cancellation_token: Optional[CancellationToken] = None,
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with tool support via SSE.

        Write-late pattern: nothing is written to the DB until the turn is
        complete (or cancelled with partial content).  Three outcomes:

        1. Normal completion → commit user + assistant messages atomically
        2. Cancel with content → commit user + partial assistant message
        3. Cancel with no content → nothing written, frontend reverts

        Args:
            request: ChatRequest object (defined in routers.chat_stream)
            cancellation_token: Optional token to check for cancellation

        Yields JSON strings of StreamEvent types (discriminated union)
        """
        if cancellation_token is None:
            cancellation_token = CancellationToken()

        # ── 1. Resolve conversation (read-only — no DB writes) ──────────
        history = await self._resolve_chat(
            request.conversation_id, request.context
        )
        logger.info(
            f"Stream start: user={self.user_id} chat_id={history.chat_id} "
            f"scope={history.scope} message={request.message[:80]!r}"
        )

        # ── 2. Set up pending turn (write-late state) ────────────────────
        response = ResponseBuilder()
        turn = PendingTurn(history=history, user_message=request, response=response)
        self._turn = turn

        try:
            guest_limit_hit = await self._check_guest_limit()

            # Build enriched context (no mutation of turn.user_message.context)
            context = {
                **turn.user_message.context,
                "user_role": user_role,
                "conversation_id": turn.user_message.conversation_id,
            }
            page = PageLocation.from_context(context)

            system_prompt = await self._build_system_prompt(
                context, page, db_messages=turn.history.db_messages or None
            )
            messages = self._build_messages_from_history(
                turn.user_message.message, turn.history.db_messages or None
            )
            tools_by_name = get_tools_for_page_dict(page, user_role=user_role)

            # Send initial status
            yield StatusEvent(message="Thinking...").model_dump_json()

            # Get configurable max iterations
            max_iterations = await self._get_max_tool_iterations()

            # ── 3. Stream agent loop events ─────────────────────────────
            async for event in run_agent_loop(
                client=self.async_client,
                model=CHAT_MODEL,
                max_tokens=CHAT_MAX_TOKENS,
                max_iterations=max_iterations,
                system_prompt=system_prompt,
                messages=messages,
                tools=tools_by_name,
                db=self.db,
                user_id=self.user_id,
                context=context,
                cancellation_token=cancellation_token,
                stream_text=True,
                temperature=0.0,
            ):
                if isinstance(event, AgentThinking):
                    yield StatusEvent(message=event.message).model_dump_json()

                elif isinstance(event, AgentTextDelta):
                    response.add_text(event.text)
                    yield TextDeltaEvent(text=event.text).model_dump_json()

                elif isinstance(event, AgentToolStart):
                    yield ToolStartEvent(
                        tool=event.tool_name,
                        input=event.tool_input,
                        tool_use_id=event.tool_use_id,
                    ).model_dump_json()

                elif isinstance(event, AgentToolProgress):
                    yield ToolProgressEvent(
                        tool=event.tool_name,
                        stage=event.stage,
                        message=event.message,
                        progress=event.progress,
                        data=event.data,
                    ).model_dump_json()

                elif isinstance(event, AgentToolComplete):
                    marker = response.add_tool_marker()
                    yield TextDeltaEvent(text=marker).model_dump_json()
                    yield ToolCompleteEvent(
                        tool=event.tool_name,
                        index=response.tool_call_index - 1,
                    ).model_dump_json()

                elif isinstance(event, AgentComplete):
                    response.set_agent_result(event)

                elif isinstance(event, AgentCancelled):
                    response.set_agent_result(event)
                    # Cooperative cancel: commit partial if we have content
                    if response.has_content:
                        logger.info(
                            f"Cooperative cancel with content: "
                            f"text={len(response.collected_text)} chars, "
                            f"tools={len(response.tool_call_history)}"
                        )
                        chat_id = await self._commit_turn()
                        # Emit chat_id so frontend can sync later
                        yield ChatIdEvent(
                            conversation_id=chat_id
                        ).model_dump_json()
                    else:
                        logger.info("Cooperative cancel with no content — nothing written")
                    return

                elif isinstance(event, AgentError):
                    response.set_trace(event.trace)
                    yield ErrorEvent(message=event.error).model_dump_json()
                    # Still commit whatever we have so the error context is saved
                    if response.has_content:
                        await self._commit_turn()
                    return

            # ── 4. Normal completion: finalize, commit, deliver ─────────
            parsed = self._parse_llm_response(response.collected_text, page)
            response.finalize(parsed)
            chat_id = await self._commit_turn()
            logger.info(
                f"Stream complete: chat_id={chat_id} "
                f"text={len(response.collected_text)} chars"
            )
            yield response.to_complete_event(chat_id).model_dump_json()

            if guest_limit_hit:
                logger.info(
                    f"Guest limit: yielding guest_limit event AFTER complete "
                    f"for user={self.user_id}"
                )
                yield GuestLimitEvent(
                    message="You've used all your free messages. Register to keep going."
                ).model_dump_json()

        except Exception as e:
            logger.error(f"Error in chat service: {str(e)}", exc_info=True)
            yield ErrorEvent(message=f"Service error: {str(e)}").model_dump_json()
            # Best-effort commit if we have content
            if response.has_content and not turn.committed:
                try:
                    await self._commit_turn()
                except Exception:
                    logger.warning("Failed to commit after error", exc_info=True)

    # =========================================================================
    # Conversation
    # =========================================================================

    async def _resolve_chat(
        self, conversation_id: Optional[int], context: Dict[str, Any]
    ) -> ResolvedConversation:
        """Resolve conversation and load history. Read-only — no DB writes.

        Raises ValueError if a conversation_id is provided but not found.
        """
        scope = derive_scope(context)

        if conversation_id:
            chat = await self.chat_service.get_chat(conversation_id, self.user_id)
            if not chat:
                raise ValueError(
                    f"Conversation {conversation_id} not found for user {self.user_id}"
                )
            db_messages = await self.chat_service.get_messages(conversation_id, self.user_id)
            return ResolvedConversation(
                chat_id=conversation_id, scope=scope, db_messages=db_messages
            )

        return ResolvedConversation(chat_id=None, scope=scope)

    async def _check_guest_limit(self) -> bool:
        """Check if the current user is a guest who has hit their turn limit.

        Returns True if the limit has been reached (caller should emit
        GuestLimitEvent after the response completes).
        """
        from services.user_service import UserService

        user_service = UserService(self.db)
        user = await user_service.get_user_by_id(self.user_id)
        if not user or not user.is_guest:
            return False

        guest_turn_limit = await self.chat_service.get_guest_turn_limit()
        msg_count = await self.chat_service.count_user_messages(self.user_id)
        over = msg_count >= guest_turn_limit
        logger.info(
            f"Guest limit check: user={self.user_id} "
            f"msg_count={msg_count} limit={guest_turn_limit} "
            f"over={'YES' if over else 'no'}"
        )
        return over

    def _build_messages_from_history(
        self, message: str, db_messages: Optional[List] = None
    ) -> List[Dict[str, str]]:
        """
        Build message list for LLM from conversation history + current message.

        Note: Context is provided in the system prompt via _build_page_context,
        so user messages are sent as-is without context wrapping.

        Args:
            message: The current user message
            db_messages: Pre-fetched messages from the conversation (or None for new chat)
        """
        messages = []

        # All db_messages are prior history (write-late: current message
        # hasn't been written to DB yet)
        if db_messages:
            for msg in db_messages:
                if msg.role in ("user", "assistant"):
                    content = msg.content
                    # Strip [[tool:N]] markers from assistant messages so the
                    # LLM doesn't learn to reproduce them as plain text
                    if msg.role == "assistant":
                        content = re.sub(r"\[\[tool:\d+\]\]", "", content)
                    messages.append({"role": msg.role, "content": content})

        messages.append({"role": "user", "content": message})
        return messages

    def _build_payload_manifest(
        self, db_messages: Optional[List] = None
    ) -> Optional[str]:
        """
        Build a manifest of all payloads from the conversation history.

        The manifest provides brief summaries of all payloads that have been
        generated during this conversation, allowing the LLM to reference
        them by ID using the get_payload tool.

        Args:
            db_messages: Pre-fetched messages from the conversation

        Returns:
            Formatted manifest string, or None if no payloads exist
        """
        if not db_messages:
            return None

        manifest_entries = []
        for msg in db_messages:
            if msg.role != "assistant" or not msg.extras:
                continue

            payloads = msg.extras.get("payloads", [])
            for payload in payloads:
                payload_id = payload.get("payload_id")
                summary = payload.get("summary")
                if payload_id and summary:
                    manifest_entries.append(f"- [{payload_id}] {summary}")

        if not manifest_entries:
            return None

        return (
            "AVAILABLE PAYLOADS (use get_payload tool to retrieve full data):\n"
            + "\n".join(manifest_entries)
        )

    # =========================================================================
    # System Prompt Building
    # =========================================================================

    async def _build_system_prompt(
        self,
        context: Dict[str, Any],
        page: PageLocation,
        db_messages: Optional[List] = None,
    ) -> str:
        """
        Build system prompt with clean structure (async).

        Order rationale:
        1. GLOBAL PREAMBLE - What KH is, your role, two types of questions (always same)
        2. PAGE INSTRUCTIONS - Page-specific guidance (varies by page)
        3. STREAM INSTRUCTIONS - Domain-specific context from the stream
        4. CONTEXT - Current page state, user role, loaded data
        5. CAPABILITIES - Available tools and actions
        6. HELP - Help system TOC
        7. FORMAT RULES - Technical formatting

        Args:
            context: Enriched context dict (includes user_role, conversation_id)
            page: Where the user is in the app
            db_messages: Optional pre-fetched messages (avoids redundant DB call)
        """
        user_role = context.get("user_role", "member")

        sections = []

        # 1. GLOBAL PREAMBLE (explains KH, your role, question types)
        # Use override from database if available, otherwise use default
        preamble = await self._get_global_preamble()
        current_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        sections.append(f"{preamble}\n\nCurrent date and time: {current_time}")

        # 2. PAGE INSTRUCTIONS (page-specific guidance)
        page_instructions = await self._get_page_instructions(page.current_page)
        if page_instructions:
            sections.append(f"== PAGE INSTRUCTIONS ==\n{page_instructions}")

        # 3. STREAM INSTRUCTIONS (domain-specific, stream-level)
        stream_instructions = await self._load_stream_instructions(context)
        if stream_instructions:
            sections.append(f"== STREAM CONTEXT ==\n{stream_instructions}")

        # 4. CONTEXT (page context + user role + loaded data)
        page_context = await self._build_page_context(page.current_page, context)
        if page_context:
            sections.append(f"== CURRENT CONTEXT ==\n{page_context}")

        # 5. PAYLOAD MANIFEST (payloads from conversation history, if any)
        payload_manifest = self._build_payload_manifest(db_messages)
        if payload_manifest:
            sections.append(f"== CONVERSATION DATA ==\n{payload_manifest}")

        # 6. CAPABILITIES (tools + payloads + client actions)
        capabilities = self._build_capabilities_section(page, user_role=user_role)
        if capabilities:
            sections.append(f"== CAPABILITIES ==\n{capabilities}")

        # 7. HELP (consolidated: narrative + tool usage + TOC)
        help_section = await self._build_help_section(user_role)
        if help_section:
            sections.append(f"== HELP ==\n{help_section}")

        # 8. FORMAT RULES (fixed technical instructions)
        sections.append(f"== FORMAT RULES ==\n{self.FORMAT_INSTRUCTIONS}")

        return "\n\n".join(sections)

    def _build_capabilities_section(
        self,
        page: PageLocation,
        user_role: Optional[str] = None,
    ) -> str:
        """Build capabilities section listing available tools, payloads, and client actions."""
        from tools.registry import get_tools_for_page

        parts = []

        # Tools
        tools = get_tools_for_page(page, user_role=user_role)
        if tools:
            tool_lines = [f"- {t.name}: {t.description}" for t in tools]
            parts.append("TOOLS:\n" + "\n".join(tool_lines))

        # LLM Payloads (structured response formats the LLM can generate)
        payload_configs = get_all_payloads_for_page(page)
        llm_payloads = [c for c in payload_configs if c.llm_instructions]
        if llm_payloads:
            payload_instructions = "\n\n".join(
                [c.llm_instructions for c in llm_payloads]
            )
            parts.append(
                "STRUCTURED RESPONSES (write these as TEXT in your message, NOT as tool calls):\n"
                + payload_instructions
            )

        # Client Actions
        client_actions = get_client_actions(page.current_page)
        if client_actions:
            actions_list = "\n".join(
                [f"- {a.action}: {a.description}" for a in client_actions]
            )
            parts.append(
                f"CLIENT ACTIONS (these are the ONLY actions you may suggest):\n{actions_list}\n"
                f'To suggest: SUGGESTED_ACTIONS:\n[{{"label": "Close", "action": "close_chat", "handler": "client"}}]'
            )

        return "\n\n".join(parts)

    # ==========================================================================
    # System Prompt Constants
    # ==========================================================================

    # Global preamble - explains the overall situation (always included)
    GLOBAL_PREAMBLE = """You are the AI assistant for table.that, a modern data table builder.

## What table.that Does
table.that helps users build and manage structured data tables:
- Define custom table schemas with typed columns (text, number, date, boolean, select)
- Manage records through a clean, spreadsheet-like interface
- Import and export data via CSV
- Get AI-powered assistance for data management

Note: Tables are currently limited to 100 rows each.

## User Journey — Four Phases
Every table goes through four phases. Users don't think in these terms — you do. Read the signals and guide them forward.

1. **Define** — Design a simple starting schema. Propose 3-6 columns that cover the basics — don't over-engineer it. Adding columns later is easy and free, so start lean and let the user build incrementally. Do NOT interview the user or ask clarifying questions unless you truly cannot guess what they need.
2. **Populate** — Fill the table with data. This could mean importing a CSV, adding records manually, using chat to generate sample data, or researching and adding entries via web search. During this phase, don't suggest restructuring unless the schema is clearly broken for the data being entered.
3. **Organize & Enrich** — Make the data more useful. This is where you shine. Common patterns:
   - *Add a categorization column*: User says "tag these by priority" → propose a select column (SCHEMA_PROPOSAL), then after it's applied, offer to populate it (enrich_column or DATA_PROPOSAL).
   - *Add an enrichment column*: User says "find the LinkedIn URL for each company" → propose a text column, then use enrich_column to research and fill it.
   - *Clean and normalize*: Standardize formats, fix names, fill gaps.
   - Adding a column + populating it is a **two-step workflow**. Recognize it as a single user intent and guide them through both steps.
4. **Act** — The data is organized. Now the user wants to use it — filter and explore, update statuses, export subsets, make decisions, do ongoing maintenance. Help with data questions and bulk updates. When they realize they need a new dimension, loop back to Phase 3.

**The cycle:** Phases 3 and 4 repeat. Users act on their data, realize they need another column or category, enrich it, then go back to acting. Make this loop effortless.

**How to detect the phase:**
- No tables / asking to build something → Phase 1
- Table exists, 0 rows → Phase 2
- User says "categorize," "tag," "add a column for," "research," "look up" → Phase 3
- User asks about data, filters, exports, updates specific rows → Phase 4
- User asks to add a column on a populated table → Phase 3 (looping back from 4)

## Your Role
Users interact with you through the chat panel while working with their tables. You can help with:

**1. Navigation/How-To Questions** (use the help tool):
- "How do I..." questions about using the app
- "What does X mean?" questions about fields or features
- For these, retrieve relevant help documentation with get_help()

**2. Data Questions** (use data tools):
- Questions about data in their tables
- Requests to add, update, or delete records
- Requests to search or analyze their data
- For these, use the appropriate data tools

## Style
Be fast and helpful. Keep responses concise and factual. Don't over-explain or over-engineer. Default to action — build something quick rather than asking questions. Users can always refine later.

## Suggestions — Guide the User Forward
After every response, think: "What would the user naturally want to do next?" Then offer it as SUGGESTED_VALUES. This is one of your most important UX behaviors — suggestions turn a blank text box into a clear set of next steps.

Phase-aware examples:
- **Phase 1 (just created a table):** "Import a CSV" / "Add sample rows" / "Populate with AI research"
- **Phase 2 (just imported or added data):** "Add a category column" / "Research more details" / "Show me a summary"
- **Phase 3 (just added/enriched a column):** "Fill it with AI research" / "Tag each row" / "Add another column"
- **Phase 4 (just answered a question or did an update):** Likely follow-up questions or related actions
- **After a proposal:** Do NOT include suggestions — the user needs to review and act on the proposal in the table first
- **After an error or confusion:** Rephrase what they likely meant as 2-3 options

Always include suggestions unless the conversation is clearly finished or you just emitted a proposal. When a proposal is pending, the user needs to act on it in the table — don't distract them with suggestions.

## Important: How Proposals Work
ALL data and schema changes go through proposals. You never write directly to the table.

When you emit a SCHEMA_PROPOSAL or DATA_PROPOSAL payload, the proposed changes appear **in the table to the right of this chat panel**:
- **Added rows** appear at the top of the table with a green highlight
- **Updated cells** are highlighted in green showing the new values
- **Deleted rows** appear with a red tint and reduced opacity
- Each proposed row has a **checkbox** so the user can uncheck changes they don't want

**Layout:** The chat panel is on the left. The data table is on the right. Proposals are always shown in the table, never in the chat. Never say "above" or "below" — say "in the table" or "to the right".

**While a proposal is active, the chat input is locked.** The user must click **Accept** or **Dismiss** before they can send another message. This means you will never receive a follow-up message while a proposal is pending.

**After emitting a proposal:**
- Briefly describe what you're proposing
- Tell them the changes are highlighted in the table to the right
- Tell them they can uncheck individual rows they don't want
- Tell them to click **Accept** to apply or **Dismiss** to cancel
- Do NOT ask "Would you like me to proceed?" — the user acts on the controls, not by typing
- Do NOT emit a second proposal in the same turn — one proposal per response
- Do NOT include SUGGESTED_VALUES or SUGGESTED_ACTIONS when you emit a proposal

## Important: You Cannot Pause for User Input
You are running in an agentic loop — when you call a tool, the result comes back to you automatically and you continue. The user does NOT see your intermediate text until your full response is assembled. This means:
- NEVER ask "Would you like me to...?" or "Shall I...?" and then call the tool in the same turn. The user cannot answer you.
- Instead: just do the thing and explain what you found.
- If you genuinely need user input before proceeding, end your turn WITHOUT calling a tool.

## Handling Ambiguity
- For marginally ambiguous queries: State your interpretation, then answer
- For highly ambiguous queries: Ask for clarification with 2-3 specific options (and do NOT call a tool in the same turn)
- Leverage context (current page, table data) before asking

## Page-Specific Instructions
Users can be on different pages in the app, each with its own context and capabilities. Page-specific instructions (if any) appear in the next section."""

    async def _get_global_preamble(self) -> str:
        """Get the global preamble, checking for database override first."""
        from models import ChatConfig

        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "system",
                    ChatConfig.scope_key == "global_preamble",
                )
            )
            config = result.scalars().first()
            if config and config.content:
                return config.content
        except Exception as e:
            logger.warning(f"Failed to load global_preamble: {e}")

        return self.GLOBAL_PREAMBLE

    # Default page instructions (used if page doesn't define its own)
    DEFAULT_PAGE_INSTRUCTIONS = """No special instructions for this page. Use your general capabilities and the help system as needed."""

    # Fixed format instructions (always appended, not configurable)
    FORMAT_INSTRUCTIONS = """SUGGESTED VALUES (recommended):
Offer clickable chips the user can tap to send as their next message. The text shown on the chip is exactly what gets sent — what you see is what you get.
SUGGESTED_VALUES:
["Add some sample rows", "Import a CSV", "Research and populate data"]

Good times to suggest:
- After creating a table: "Import a CSV", "Add some sample rows", "Research and populate data"
- After a schema change: "Fill the new column with AI research", "Add some rows"
- After populating data: "Add a category column", "Research more details for each row", "Export as CSV"
- After answering a question: follow-up questions the user likely has
- When the user seems unsure: 2-3 concrete next steps they can take
- After any significant action: what they'd naturally want to do next

Keep suggestions short (2-6 words). Offer 2-4 at a time. Make the most likely next step the first option.
NEVER include suggestions when your response contains a SCHEMA_PROPOSAL or DATA_PROPOSAL.

SUGGESTED ACTIONS (optional, ONLY use actions listed in CLIENT ACTIONS above):
To offer clickable buttons that trigger UI actions. You may ONLY use actions explicitly listed in the CLIENT ACTIONS section above. Do NOT invent new actions.
SUGGESTED_ACTIONS:
[{"label": "Button Text", "action": "action_from_list", "handler": "client"}]"""

    async def _build_help_section(self, user_role: str) -> Optional[str]:
        """
        Build the consolidated help section with narrative, tool usage, and TOC.

        Loads configuration from database (narrative, preamble, category labels, summary overrides)
        and falls back to defaults.
        """
        from models import ChatConfig, HelpContentOverride
        from services.help_registry import get_help_section_for_role

        narrative = None
        preamble = None
        summary_overrides = {}

        try:
            # Load help configuration from database
            result = await self.db.execute(
                select(ChatConfig).where(ChatConfig.scope == "help")
            )
            help_configs = result.scalars().all()

            for config in help_configs:
                if config.scope_key == "narrative" and config.content:
                    narrative = config.content
                elif config.scope_key == "toc-preamble" and config.content:
                    preamble = config.content

            # Load summary overrides from help_content_override table
            result = await self.db.execute(
                select(HelpContentOverride).where(
                    HelpContentOverride.summary.isnot(None)
                )
            )
            overrides = result.scalars().all()
            for override in overrides:
                if override.summary:
                    topic_id = f"{override.category}/{override.topic}"
                    summary_overrides[topic_id] = override.summary

        except Exception as e:
            logger.warning(f"Failed to load help configuration: {e}")

        try:
            return get_help_section_for_role(
                role=user_role,
                narrative=narrative,
                preamble=preamble,
                summary_overrides=summary_overrides if summary_overrides else None,
            )
        except Exception as e:
            logger.error(f"Failed to build help section: {e}")
            return None

    async def _get_page_instructions(self, current_page: str) -> str:
        """
        Get page-specific instructions with hierarchy:
        1. DB page override (content field)
        2. Code page default (from chat_page_config)
        3. Global default (minimal)

        Note: The global preamble is now separate and always included.
        This function only returns page-specific guidance.
        """
        from models import ChatConfig
        from services.chat_page_config import get_persona as get_code_page_instructions

        instructions = None

        # 1. Check DB for page-level override
        try:
            result = await self.db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "page", ChatConfig.scope_key == current_page
                )
            )
            page_config = result.scalars().first()
            if page_config and page_config.content:
                instructions = page_config.content
        except Exception as e:
            logger.warning(f"Failed to check page instructions override: {e}")

        # 2. Fall back to code page default
        if not instructions:
            instructions = get_code_page_instructions(current_page)

        # 3. Fall back to global default (minimal)
        if not instructions:
            instructions = self.DEFAULT_PAGE_INSTRUCTIONS

        return instructions

    # =========================================================================
    # Context Loading
    # =========================================================================

    # Role descriptions for system prompt context
    ROLE_DESCRIPTIONS = {
        "member": "Member (can create and manage their own tables)",
        "org_admin": "Organization Admin (can manage organization users and tables)",
        "platform_admin": "Platform Admin (full access to all features including system configuration)",
    }

    async def _build_page_context(
        self, current_page: str, context: Dict[str, Any]
    ) -> str:
        """Build page-specific context section of the prompt (async)."""
        context_builder = get_context_builder(current_page)

        if context_builder:
            base_context = context_builder(context)
        else:
            base_context = f"The user is currently on: {current_page}"

        # Add user role information
        user_role = context.get("user_role", "member")
        role_description = self.ROLE_DESCRIPTIONS.get(user_role, user_role)
        base_context = f"User role: {role_description}\n\n{base_context}"

        return base_context

    async def _load_stream_instructions(self, context: Dict[str, Any]) -> Optional[str]:
        """Load context-specific chat instructions (async).

        Instructions are stored in the chat_config table.
        """
        return None

    async def _get_max_tool_iterations(self) -> int:
        """Get the maximum tool iterations from config, or default."""
        return await self.chat_service.get_max_tool_iterations()

    # =========================================================================
    # Response Parsing
    # =========================================================================

    def _parse_llm_response(
        self, response_text: str, page: PageLocation
    ) -> Dict[str, Any]:
        """Parse LLM response to extract structured components."""
        import json
        import re

        message = response_text.strip()
        result = {
            "message": message,
            "suggested_values": None,
            "suggested_actions": None,
            "custom_payload": None,
        }

        # Parse SUGGESTED_VALUES marker - find marker and everything after it on same/following lines
        values_marker = "SUGGESTED_VALUES:"
        if values_marker in message:
            marker_pos = message.find(values_marker)
            after_marker = message[marker_pos + len(values_marker) :]
            # Strip leading whitespace/newlines before the JSON
            after_marker_stripped = after_marker.lstrip()
            json_content = self._extract_json_array(after_marker_stripped)
            if json_content:
                try:
                    parsed = json.loads(json_content)
                    if isinstance(parsed, list):
                        result["suggested_values"] = parsed
                        # Calculate whitespace between marker and JSON
                        whitespace_len = len(after_marker) - len(after_marker_stripped)
                        # Remove everything from marker through end of JSON
                        end_pos = (
                            marker_pos
                            + len(values_marker)
                            + whitespace_len
                            + len(json_content)
                        )
                        message = (message[:marker_pos] + message[end_pos:]).strip()
                        result["message"] = message
                except json.JSONDecodeError:
                    logger.warning(
                        f"Failed to parse SUGGESTED_VALUES JSON: {json_content[:100]}"
                    )

        # Parse SUGGESTED_ACTIONS marker
        actions_marker = "SUGGESTED_ACTIONS:"
        if actions_marker in message:
            marker_pos = message.find(actions_marker)
            after_marker = message[marker_pos + len(actions_marker) :]
            after_marker_stripped = after_marker.lstrip()
            json_content = self._extract_json_array(after_marker_stripped)
            if json_content:
                try:
                    parsed = json.loads(json_content)
                    if isinstance(parsed, list):
                        result["suggested_actions"] = parsed
                        whitespace_len = len(after_marker) - len(after_marker_stripped)
                        end_pos = (
                            marker_pos
                            + len(actions_marker)
                            + whitespace_len
                            + len(json_content)
                        )
                        message = (message[:marker_pos] + message[end_pos:]).strip()
                        result["message"] = message
                except json.JSONDecodeError:
                    logger.warning(
                        f"Failed to parse SUGGESTED_ACTIONS JSON: {json_content[:100]}"
                    )

        # Parse custom payloads (page-specific structured responses)
        payload_configs = get_all_payloads_for_page(page)
        for config in payload_configs:
            marker = config.parse_marker
            # Skip payloads without a parse_marker (tool payloads don't need parsing)
            if not marker:
                continue
            # Build regex that handles optional markdown bold/italic around the marker.
            # e.g. marker "DATA_PROPOSAL:" also matches "**DATA_PROPOSAL**:" or
            # "*DATA_PROPOSAL*:" which LLMs sometimes produce.
            marker_text = marker.rstrip(":")
            marker_pattern = re.compile(
                r"\*{0,2}" + re.escape(marker_text) + r"\*{0,2}\s*:"
            )
            match = marker_pattern.search(message)
            if match:
                marker_pos = match.start()
                after_marker_raw = message[match.end() :]
                after_marker = after_marker_raw.strip()
                json_content = self._extract_json_object(after_marker)
                if json_content:
                    parsed = config.parser(json_content)
                    if parsed:
                        result["custom_payload"] = parsed
                        # Find where JSON starts in the raw after_marker (preserving whitespace)
                        json_start_in_raw = after_marker_raw.find(json_content)
                        # Calculate full payload text: from marker start through end of JSON
                        end_pos = match.end() + json_start_in_raw + len(json_content)
                        payload_text = message[marker_pos:end_pos]
                        message = message.replace(payload_text, "").strip()
                        result["message"] = message
                        break

        return result

    def _extract_json_object(self, text: str) -> Optional[str]:
        """Extract a JSON object from the start of text, handling nested braces."""
        if not text.startswith("{"):
            return None
        return self._extract_balanced(text, "{", "}")

    def _extract_json_array(self, text: str) -> Optional[str]:
        """Extract a JSON array from the start of text, handling nested brackets."""
        if not text.startswith("["):
            return None
        return self._extract_balanced(text, "[", "]")

    def _extract_balanced(
        self, text: str, open_char: str, close_char: str
    ) -> Optional[str]:
        """Extract balanced content between open and close characters."""
        if not text or text[0] != open_char:
            return None

        depth = 0
        in_string = False
        escape_next = False

        for i, char in enumerate(text):
            if escape_next:
                escape_next = False
                continue

            if char == "\\":
                escape_next = True
                continue

            if char == '"' and not escape_next:
                in_string = not in_string
                continue

            if in_string:
                continue

            if char == open_char:
                depth += 1
            elif char == close_char:
                depth -= 1
                if depth == 0:
                    return text[: i + 1]

        return None


# Dependency injection providers
from fastapi import Depends
from database import get_async_db


async def get_chat_stream_service(
    db: AsyncSession = Depends(get_async_db),
) -> ChatStreamService:
    """
    Get a ChatStreamService instance with async database session.

    Note: user_id is not available at DI time, so we return a partial service
    that the endpoint must complete with user_id.
    """
    # Return a factory function since we need user_id at call time
    raise NotImplementedError("Use get_chat_stream_service_factory instead")


def get_chat_stream_service_factory(db: AsyncSession = Depends(get_async_db)):
    """
    Get a factory for creating ChatStreamService instances.

    Usage in endpoint:
        factory = Depends(get_chat_stream_service_factory)
        service = factory(current_user.user_id)
    """

    def create_service(user_id: int) -> ChatStreamService:
        return ChatStreamService(db, user_id)

    return create_service
