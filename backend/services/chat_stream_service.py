"""
Chat Streaming Service

Handles LLM streaming interaction for the chat system with tool support.
Uses the agent_loop for agentic processing. Handles chat persistence automatically.
"""

from typing import Dict, Any, AsyncGenerator, List, Optional, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import anthropic
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
    TextDeltaEvent,
    StatusEvent,
    ToolStartEvent,
    ToolProgressEvent,
    ToolCompleteEvent,
    CompleteEvent,
    ErrorEvent,
)
from schemas.payloads import summarize_payload
from services.chat_page_config import (
    get_context_builder,
    get_client_actions,
    has_page_payloads,
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
from services.chat_service import ChatService

logger = logging.getLogger(__name__)

CHAT_MODEL = "claude-sonnet-4-20250514"
CHAT_MAX_TOKENS = 4096
DEFAULT_MAX_TOOL_ITERATIONS = 5
# Context window for the chat model. Warning fires at 70% usage.
CONTEXT_WINDOW_TOKENS = 200_000 
CONTEXT_WARNING_THRESHOLD = int(CONTEXT_WINDOW_TOKENS * 0.70)  # 140k


class ChatStreamService:
    """Service for streaming chat interactions with tool support."""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.async_client = anthropic.AsyncAnthropic(
            api_key=os.getenv("ANTHROPIC_API_KEY")
        )
        self.chat_service = ChatService(db)

    # =========================================================================
    # Public API
    # =========================================================================

    async def stream_chat_message(
        self, request, cancellation_token: Optional[CancellationToken] = None
    ) -> AsyncGenerator[str, None]:
        """
        Stream a chat message response with tool support via SSE.

        Args:
            request: ChatRequest object (defined in routers.chat_stream)
            cancellation_token: Optional token to check for cancellation

        Yields JSON strings of StreamEvent types (discriminated union)
        """
        if cancellation_token is None:
            cancellation_token = CancellationToken()

        # Setup chat persistence
        chat_id = await self._setup_chat(request)
        if not chat_id:
            yield ErrorEvent(message="Failed to initialize chat session.").model_dump_json()
            return

        try:
            # Inject conversation_id into context for tools that need it
            context_with_chat = dict(request.context)
            context_with_chat["conversation_id"] = chat_id

            # Fetch conversation history once (used by both system prompt and message building)
            db_messages = await self.chat_service.get_messages(
                chat_id, self.user_id
            )

            # Build prompts (pass pre-fetched messages to avoid redundant DB calls)
            system_prompt = await self._build_system_prompt(
                context_with_chat, chat_id, db_messages
            )
            messages, _ = self._build_messages_from_history(request, db_messages)

            # Get tools for this page, tab, and subtab (global + page + tab + subtab)
            current_page = context_with_chat.get("current_page", "unknown")
            active_tab = context_with_chat.get("active_tab")
            active_subtab = context_with_chat.get("active_subtab")
            user_role = context_with_chat.get("user_role")
            tools_by_name = get_tools_for_page_dict(
                current_page, active_tab, active_subtab, user_role=user_role
            )

            # Send initial status
            yield StatusEvent(message="Thinking...").model_dump_json()

            # Run the agent loop - it captures full trace internally
            collected_text = ""
            tool_call_history = []
            collected_payloads = []
            trace: Optional[AgentTrace] = None
            tool_call_index = 0

            # Get configurable max iterations
            max_iterations = await self._get_max_tool_iterations()

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
                context=context_with_chat,
                cancellation_token=cancellation_token,
                stream_text=True,
                temperature=0.0,
            ):
                if isinstance(event, AgentThinking):
                    yield StatusEvent(message=event.message).model_dump_json()

                elif isinstance(event, AgentTextDelta):
                    collected_text += event.text
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
                    tool_marker = f"[[tool:{tool_call_index}]]"
                    collected_text += tool_marker
                    yield TextDeltaEvent(text=tool_marker).model_dump_json()
                    yield ToolCompleteEvent(
                        tool=event.tool_name, index=tool_call_index
                    ).model_dump_json()
                    tool_call_index += 1

                elif isinstance(event, (AgentComplete, AgentCancelled)):
                    tool_call_history = event.tool_calls
                    collected_payloads = event.payloads
                    trace = event.trace  # Get full trace from agent loop

                elif isinstance(event, AgentError):
                    trace = event.trace  # Capture trace even on error
                    yield ErrorEvent(message=event.error).model_dump_json()
                    return

            # Parse response and build final payload
            parsed = self._parse_llm_response(collected_text, request.context)

            # Process and merge all payloads (from tools + parsed LLM response)
            # Tool-emitted payloads take priority over text-parsed ones of the same type.
            all_payloads = list(collected_payloads)
            tool_payload_types = {p.get("type") for p in collected_payloads if p}

            if parsed.get("custom_payload"):
                text_payload_type = parsed["custom_payload"].get("type")
                if text_payload_type in tool_payload_types:
                    # A tool already emitted this payload type — skip the text-parsed duplicate.
                    # This prevents the LLM from overwriting a tool's richer payload
                    # (e.g., for_each_row's data_proposal with research_log).
                    logger.info(
                        f"SSE: dropping text-parsed {text_payload_type} payload — "
                        f"tool already emitted one"
                    )
                else:
                    all_payloads.append(parsed["custom_payload"])

            logger.info(
                f"SSE complete: collected_payloads={len(collected_payloads)}, "
                f"all_payloads={len(all_payloads)}, "
                f"types={[p.get('type') for p in all_payloads]}"
            )

            # Merge multiple payloads of the same type (e.g. two for_each_row
            # calls that each produce a data_proposal).  Operations and
            # research_log entries are concatenated into one payload so the
            # user sees a single combined proposal card.
            all_payloads = self._merge_same_type_payloads(all_payloads)

            # Assign IDs and summaries to payloads
            payloads_with_ids = self._process_payloads(all_payloads)

            # The "active" payload for UI rendering (last one, if any)
            custom_payload = payloads_with_ids[-1] if payloads_with_ids else None

            # Build suggested values/actions from parsed response
            suggested_values = None
            if parsed.get("suggested_values"):
                suggested_values = [
                    SuggestedValue(**sv) for sv in parsed["suggested_values"]
                ]

            suggested_actions = None
            if parsed.get("suggested_actions"):
                suggested_actions = [
                    SuggestedAction(**sa) for sa in parsed["suggested_actions"]
                ]

            custom_payload_obj = (
                CustomPayload(**custom_payload) if custom_payload else None
            )

            # Build tool history for final response
            tool_history_entries = None
            if tool_call_history:
                from schemas.chat import ToolHistoryEntry

                tool_history_entries = [
                    ToolHistoryEntry(**th) for th in tool_call_history
                ]

            # Add final response to trace (what's being sent to frontend)
            if trace:
                trace.final_response = FinalResponse(
                    message=parsed["message"],
                    suggested_values=suggested_values,
                    suggested_actions=suggested_actions,
                    custom_payload=custom_payload_obj,
                    tool_history=tool_history_entries,
                    conversation_id=chat_id,
                )

            # Build extras for persistence
            extras = {
                "tool_history": tool_call_history if tool_call_history else None,
                "custom_payload": custom_payload,  # For UI rendering
                "payloads": (
                    payloads_with_ids if payloads_with_ids else None
                ),  # Full list for retrieval
                "trace": trace.model_dump() if trace else None,  # Full execution trace
                "suggested_values": parsed.get("suggested_values"),
                "suggested_actions": parsed.get("suggested_actions"),
            }
            # Remove None values to keep extras clean
            extras = {k: v for k, v in extras.items() if v is not None}

            # Persist assistant message
            await self._save_assistant_message(
                chat_id,
                parsed["message"],
                request.context,
                extras=extras if extras else None,
            )

            # Check for conversation length warning using peak context window usage
            context_warning = None
            if trace and trace.peak_input_tokens and trace.peak_input_tokens >= CONTEXT_WARNING_THRESHOLD:
                pct = int(trace.peak_input_tokens / CONTEXT_WINDOW_TOKENS * 100)
                context_warning = (
                    f"This conversation is using {pct}% of the available context window. "
                    f"Consider starting a new conversation to ensure the best response quality."
                )

            # Emit complete event
            final_payload = ChatResponsePayload(
                message=parsed["message"],
                suggested_values=suggested_values,
                suggested_actions=suggested_actions,
                custom_payload=custom_payload_obj,
                tool_history=tool_call_history if tool_call_history else None,
                conversation_id=chat_id,
                warning=context_warning,
                diagnostics=trace,  # AgentTrace is aliased as ChatDiagnostics for backwards compat
            )
            yield CompleteEvent(payload=final_payload).model_dump_json()

        except Exception as e:
            logger.error(f"Error in chat service: {str(e)}", exc_info=True)
            yield ErrorEvent(message=f"Service error: {str(e)}").model_dump_json()

    # =========================================================================
    # Payload Processing
    # =========================================================================

    @staticmethod
    def _merge_same_type_payloads(payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Merge multiple payloads of the same type into one.

        Currently handles data_proposal and schema_proposal by concatenating
        their operations (and research_log for data_proposal).  Other types
        are left as-is.
        """
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
                # Unknown type — keep last one (original behavior)
                merged.append(items[-1])

        return merged

    def _process_payloads(self, payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Process payloads by assigning unique IDs and generating summaries.

        Args:
            payloads: List of raw payloads ({"type": str, "data": dict})

        Returns:
            List of processed payloads with payload_id and summary added
        """
        processed = []
        for payload in payloads:
            if not payload:
                continue

            payload_type = payload.get("type", "unknown")
            payload_data = payload.get("data", {})

            # Generate a short unique ID (first 8 chars of UUID)
            payload_id = str(uuid.uuid4())[:8]

            # Generate summary using the registry
            summary = summarize_payload(payload_type, payload_data)

            processed.append(
                {
                    "payload_id": payload_id,
                    "type": payload_type,
                    "data": payload_data,
                    "summary": summary,
                }
            )

        return processed

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
    # Chat Persistence Helpers
    # =========================================================================

    def _get_app_from_context(self, context: Dict[str, Any]) -> str:
        """Derive app identifier from context."""
        return "table_that"

    async def _setup_chat(self, request) -> Optional[int]:
        """
        Set up chat persistence and save user message (async).

        Returns chat_id or None if persistence fails.
        """
        try:
            chat_id = request.conversation_id
            app = self._get_app_from_context(request.context)

            if chat_id:
                chat = await self.chat_service.get_chat(chat_id, self.user_id)
                if not chat:
                    chat_id = None

            if not chat_id:
                chat = await self.chat_service.create_chat(self.user_id, app=app)
                chat_id = chat.id

            await self.chat_service.add_message(
                chat_id=chat_id,
                user_id=self.user_id,
                role="user",
                content=request.message,
                context=request.context,
            )
            return chat_id

        except Exception as e:
            logger.warning(f"Failed to persist user message: {e}")
            return None

    async def _save_assistant_message(
        self,
        chat_id: Optional[int],
        content: str,
        context: Dict[str, Any],
        extras: Optional[Dict[str, Any]] = None,
    ) -> None:
        """Save assistant message to chat history (async)."""
        if not chat_id:
            return
        try:
            await self.chat_service.add_message(
                chat_id=chat_id,
                user_id=self.user_id,
                role="assistant",
                content=content,
                context=context,
                extras=extras,
            )
        except Exception as e:
            logger.warning(f"Failed to persist assistant message: {e}")

    # =========================================================================
    # Message Building
    # =========================================================================

    def _build_messages_from_history(
        self, request, db_messages: Optional[List] = None
    ) -> Tuple[List[Dict[str, str]], List[Dict[str, str]]]:
        """
        Build message history for LLM from pre-fetched messages.

        Note: Context is provided in the system prompt via _build_page_context,
        so user messages are sent as-is without context wrapping.

        Args:
            request: The chat request with the current message
            db_messages: Pre-fetched messages from the conversation (or None for new chat)

        Returns:
            tuple: (messages_for_llm, clean_history)
                - messages_for_llm: Full messages including current request
                - clean_history: Just the prior conversation (for diagnostics display)
        """
        history = []

        # Build history from pre-fetched messages
        # Exclude the last message - it's the current user message we just saved
        # in _setup_chat, and we'll add it below
        if db_messages:
            # Skip the last message (the one we just saved)
            prior_messages = db_messages[:-1] if db_messages else []
            for msg in prior_messages:
                if msg.role in ("user", "assistant"):
                    # Strip [[tool:N]] markers from assistant messages so the LLM
                    # doesn't learn to reproduce them as plain text
                    content = msg.content
                    if msg.role == "assistant":
                        content = re.sub(r"\[\[tool:\d+\]\]", "", content)
                    history.append({"role": msg.role, "content": content})

        # User message sent as-is - context is already in system prompt
        messages_for_llm = history + [{"role": "user", "content": request.message}]

        return messages_for_llm, history

    # =========================================================================
    # System Prompt Building
    # =========================================================================

    async def _build_system_prompt(
        self,
        context: Dict[str, Any],
        chat_id: Optional[int] = None,
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
            context: Page context dict
            chat_id: Optional conversation ID
            db_messages: Optional pre-fetched messages (avoids redundant DB call)
        """
        current_page = context.get("current_page", "unknown")
        active_tab = context.get("active_tab")
        active_subtab = context.get("active_subtab")
        user_role = context.get("user_role", "member")

        sections = []

        # 1. GLOBAL PREAMBLE (explains KH, your role, question types)
        # Use override from database if available, otherwise use default
        preamble = await self._get_global_preamble()
        current_time = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
        sections.append(f"{preamble}\n\nCurrent date and time: {current_time}")

        # 2. PAGE INSTRUCTIONS (page-specific guidance)
        page_instructions = await self._get_page_instructions(current_page)
        if page_instructions:
            sections.append(f"== PAGE INSTRUCTIONS ==\n{page_instructions}")

        # 3. STREAM INSTRUCTIONS (domain-specific, stream-level)
        stream_instructions = await self._load_stream_instructions(context)
        if stream_instructions:
            sections.append(f"== STREAM CONTEXT ==\n{stream_instructions}")

        # 4. CONTEXT (page context + user role + loaded data)
        page_context = await self._build_page_context(current_page, context)
        if page_context:
            sections.append(f"== CURRENT CONTEXT ==\n{page_context}")

        # 5. PAYLOAD MANIFEST (payloads from conversation history, if any)
        payload_manifest = self._build_payload_manifest(db_messages)
        if payload_manifest:
            sections.append(f"== CONVERSATION DATA ==\n{payload_manifest}")

        # 6. CAPABILITIES (tools + payloads + client actions)
        capabilities = self._build_capabilities_section(
            current_page, active_tab, active_subtab, user_role=user_role
        )
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
        current_page: str,
        active_tab: Optional[str],
        active_subtab: Optional[str],
        user_role: Optional[str] = None,
    ) -> str:
        """Build capabilities section listing available tools, payloads, and client actions."""
        from tools.registry import get_tools_for_page

        parts = []

        # Tools
        tools = get_tools_for_page(
            current_page, active_tab, active_subtab, user_role=user_role
        )
        if tools:
            tool_lines = [f"- {t.name}: {t.description}" for t in tools]
            parts.append("TOOLS:\n" + "\n".join(tool_lines))

        # LLM Payloads (structured response formats the LLM can generate)
        payload_configs = get_all_payloads_for_page(
            current_page, active_tab, active_subtab
        )
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
        client_actions = get_client_actions(current_page)
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

1. **Define** — Design the right table schema. Help them nail down what columns they need, what types and options make sense, and what the table should track. Think ahead: include columns they'll want for categorization and enrichment later.
2. **Populate** — Fill the table with data. This could mean importing a CSV, adding records manually, using chat to generate sample data, or researching and adding entries via web search. During this phase, don't suggest restructuring unless the schema is clearly broken for the data being entered.
3. **Organize & Enrich** — Make the data more useful. This is where you shine. Common patterns:
   - *Add a categorization column*: User says "tag these by priority" → propose a select column (SCHEMA_PROPOSAL), then after it's applied, offer to populate it (for_each_row or DATA_PROPOSAL).
   - *Add an enrichment column*: User says "find the LinkedIn URL for each company" → propose a text column, then use for_each_row to research and fill it.
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
Be conversational and helpful. Keep responses concise and factual. Don't over-explain.

## Suggestions — Guide the User Forward
After every response, think: "What would the user naturally want to do next?" Then offer it as SUGGESTED_VALUES. This is one of your most important UX behaviors — suggestions turn a blank text box into a clear set of next steps.

Phase-aware examples:
- **Phase 1 (just created a table):** "Import a CSV" / "Add sample rows" / "Populate with AI research"
- **Phase 2 (just imported or added data):** "Add a category column" / "Research more details" / "Show me a summary"
- **Phase 3 (just added/enriched a column):** "Fill it with AI research" / "Tag each row" / "Add another column"
- **Phase 4 (just answered a question or did an update):** Likely follow-up questions or related actions
- **After a proposal:** "What else can you do?" / "Show me the data" (don't suggest what the card already does)
- **After an error or confusion:** Rephrase what they likely meant as 2-3 options

Always include suggestions unless the conversation is clearly finished or the user just needs to act on a proposal card.

## Important: How Proposals Work
When you emit a SCHEMA_PROPOSAL or DATA_PROPOSAL payload, an interactive card appears in the chat panel. This card has:
- **Checkboxes** next to each proposed change — the user can uncheck changes they don't want
- A primary action button — **Create Table** (for new tables), **Apply** (for schema updates and data changes)
- A **Cancel** button to dismiss the proposal

**Critical: After emitting a proposal, your text response must tell the user what to do with the card.** Specifically:
- Briefly describe what you're proposing
- Tell them they can uncheck individual changes they don't want
- Tell them to click the primary button to execute or **Cancel** to dismiss
- Do NOT ask "Would you like me to proceed?" or "Ready to continue?" — the user acts on the card, not by typing to you
- Do NOT emit a second proposal in the same turn — one proposal per response

If the user's next message is about something else, the proposal card remains available for them to act on later.

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
Offer clickable chips the user can tap to send as their next message. These reduce friction and guide the user forward — use them generously whenever there are clear next steps.
SUGGESTED_VALUES:
[{"label": "Display Text", "value": "text to send"}]

Good times to suggest:
- After creating a table: "Import a CSV", "Add some sample rows", "Research and populate data"
- After a schema change: "Fill the new column with AI research", "Add some rows"
- After populating data: "Add a category column", "Research more details for each row", "Export as CSV"
- After answering a question: follow-up questions the user likely has
- When the user seems unsure: 2-3 concrete next steps they can take
- After any significant action: what they'd naturally want to do next

Keep suggestions short (2-6 words per label). Offer 2-4 at a time. Make the most likely next step the first option.

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
        self, response_text: str, context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Parse LLM response to extract structured components."""
        import json
        import re

        current_page = context.get("current_page", "unknown")
        active_tab = context.get("active_tab")
        active_subtab = context.get("active_subtab")

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
        payload_configs = get_all_payloads_for_page(
            current_page, active_tab, active_subtab
        )
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
                        payload_text = message[marker_pos : end_pos]
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
