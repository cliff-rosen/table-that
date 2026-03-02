# Chat Message Flow

> Step-by-step walkthrough of everything that happens from the moment a user
> does something that updates chat context through to the final response
> rendering in the frontend.

---

## Overview

```
User action on page  ──►  Context updated  ──►  User submits message
        │                                              │
        │                                              ▼
        │                                     Frontend sends request
        │                                     (message + conversation_id + context)
        │                                              │
        │                                              ▼
        │                                     Router receives request
        │                                              │
        │                                              ▼
        │                                     ChatStreamService
        │                                       1. Persist user message
        │                                       2. Build system prompt
        │                                       3. Build message history
        │                                       4. Resolve tools
        │                                              │
        │                                              ▼
        │                                     Agent Loop
        │                                       Call model ──► Execute tools ──► Repeat
        │                                              │
        │                                              ▼
        │                                     SSE events stream to frontend
        │                                       text_delta, tool_start, tool_complete, ...
        │                                              │
        │                                              ▼
        │                                     Parse & finalize response
        │                                       Extract payloads, suggestions, etc.
        │                                              │
        │                                              ▼
        │                                     Complete event with ChatResponsePayload
        │                                              │
        │                                              ▼
        │                                     Frontend renders
        │                                       Message + payload + suggestions
```

---

## Step 0: Context Updates (Before the Message)

Before the user ever types a message, the frontend keeps the chat context
in sync with what the user is looking at. Every page that supports chat
uses `updateContext()` from `ChatContext` to push its current state into a
shared context object.

### What triggers context updates

Any change to the page's dynamic state:
- Table data loads or changes (rows, columns, schema)
- Filters, sort, or search state changes
- Row selection changes
- Navigation between pages or tabs
- Modal/viewer open/close

### What the context contains

```typescript
// Example from TableViewPage.tsx
updateContext({
    current_page: 'table_view',
    table_id: table.id,
    table_name: table.name,
    table_description: table.description || '',
    columns: table.columns,
    row_count: totalRows,
    sample_rows: rows.slice(0, 20).map(r => ({ id: r.id, data: r.data })),
    active_sort: sort,
    active_filters: Object.keys(filters).length > 0 ? filters : undefined,
    selected_rows: selectedRows,
});
```

The context is stored in a `useRef` (not just state) so that when
`sendMessage` fires, it always reads the latest context — not a stale
closure.

### Key files

| File | What it does |
|------|-------------|
| `frontend/src/context/ChatContext.tsx` | Stores context, exposes `updateContext()` and `setContext()` |
| `frontend/src/pages/TableViewPage.tsx` | Pushes table_view context on every data/filter/sort change |
| `frontend/src/pages/TableEditPage.tsx` | Pushes table_edit context on schema changes |
| `frontend/src/pages/TablesListPage.tsx` | Pushes tables_list context with table summaries |

---

## Step 1: User Submits a Message

The user types in the ChatTray input and clicks send (or presses Enter).
This calls `sendMessage(content)` on `ChatContext`.

### What `sendMessage` does immediately

1. **If `newConversation` option is set**: clears `chatId` and replaces messages
2. **Creates a user message object** and appends it to the messages array (so
   the UI shows the message immediately)
3. **Sets loading state**: `isLoading = true`, clears streaming text, status,
   and tool progress
4. **Creates an `AbortController`** (stored in a ref) for cancellation support

### What gets sent to the backend

```typescript
chatApi.streamMessage({
    message: content,                      // The user's text
    context: contextRef.current,           // Latest page context snapshot
    interaction_type: interactionType,     // "text_input", "value_selected", or "action_executed"
    action_metadata: actionMetadata,       // Optional metadata for actions
    conversation_id: chatIdRef.current     // null for new conversations
})
```

### Key files

| File | What it does |
|------|-------------|
| `frontend/src/context/ChatContext.tsx` | `sendMessage()` orchestrates the full request/response cycle |
| `frontend/src/lib/api/chatApi.ts` | `streamMessage()` — opens SSE connection and yields parsed events |
| `frontend/src/components/chat/ChatTray.tsx` | UI that captures user input and calls `sendMessage` |

---

## Step 2: Request Hits the Backend Router

The frontend POSTs to `/api/chat/stream`. The router sets up SSE streaming.

### What the router does

1. **Authenticates the user** via `get_current_user` dependency
2. **Injects `user_role`** into the request context (for role-aware help docs
   and tool filtering)
3. **Creates a `CancellationToken`** and starts a background task to monitor
   client disconnection
4. **Creates the `ChatStreamService`** with the user's DB session and user_id
5. **Iterates** the service's async generator, wrapping each event as an SSE
   `data:` line

### Key file

| File | What it does |
|------|-------------|
| `backend/routers/chat_stream.py` | `POST /api/chat/stream` — SSE endpoint, disconnect monitoring |

---

## Step 3: ChatStreamService — Setup and Prompt Assembly

This is where the heavy lifting happens. `stream_chat_message()` is an
async generator that orchestrates everything.

### 3a. Chat Persistence Setup

```
_setup_chat(request)
  ├── If conversation_id provided → verify it exists
  ├── If not → create a new conversation record
  └── Save the user's message to the conversation
```

The `chat_id` is emitted immediately as a `chat_id` SSE event so the
frontend knows the conversation ID even if the user cancels.

### 3b. Build the System Prompt

The system prompt is assembled in sections. Each section is built independently
and joined with `\n\n`.

```
_build_system_prompt(context, chat_id, db_messages)

┌─────────────────────────────────────────────────────────────┐
│  1. GLOBAL PREAMBLE                                          │
│     What table.that is, the assistant's role, user journey   │
│     phases, style guide, how proposals work.                 │
│     Source: GLOBAL_PREAMBLE constant or DB override          │
│     (ChatConfig scope="system", scope_key="global_preamble") │
├─────────────────────────────────────────────────────────────┤
│  2. PAGE INSTRUCTIONS                                        │
│     Page-specific persona and behavior guidance.             │
│     Source: DB override (ChatConfig scope="page",            │
│     scope_key=current_page) or code default from             │
│     chat_page_config/<page>.py persona field, or             │
│     DEFAULT_PAGE_INSTRUCTIONS fallback.                      │
├─────────────────────────────────────────────────────────────┤
│  3. STREAM INSTRUCTIONS                                      │
│     Domain-specific instructions from the research stream.   │
│     Source: ChatConfig table (currently returns None).        │
├─────────────────────────────────────────────────────────────┤
│  4. CONTEXT                                                  │
│     Dynamic page state — what the user is looking at.        │
│     Source: context_builder(context) from the page's         │
│     registered PageConfig, plus user role.                   │
├─────────────────────────────────────────────────────────────┤
│  5. CONVERSATION DATA (payload manifest)                     │
│     Summaries of payloads from earlier in this conversation  │
│     so the LLM can reference them by ID.                     │
│     Source: db_messages extras.payloads                       │
├─────────────────────────────────────────────────────────────┤
│  6. CAPABILITIES                                             │
│     What tools, structured responses, and client actions     │
│     are available right now.                                 │
│     Source: Tool registry + payload registry + page config   │
│     resolved for page + tab + subtab.                        │
├─────────────────────────────────────────────────────────────┤
│  7. HELP                                                     │
│     Consolidated help section: narrative, tool usage guide,  │
│     and a table-of-contents of all help topics.              │
│     Source: help registry + DB overrides                     │
├─────────────────────────────────────────────────────────────┤
│  8. FORMAT RULES                                             │
│     Fixed instructions for SUGGESTED_VALUES and              │
│     SUGGESTED_ACTIONS marker syntax.                         │
│     Source: FORMAT_INSTRUCTIONS constant                     │
└─────────────────────────────────────────────────────────────┘
```

### 3c. Build Message History

```
_build_messages_from_history(request, db_messages)
  ├── Load prior messages from the conversation (already fetched)
  ├── Skip the last message (the user message we just saved)
  ├── For assistant messages: strip [[tool:N]] markers
  │   (prevents the LLM from learning to reproduce them)
  └── Append the current user message at the end
```

Result: `[...prior_history, {role: "user", content: message}]`

Note: Tool call/result exchanges from prior turns are NOT included —
only the user and assistant text messages. Tool history from the current
turn is managed by the agent loop itself.

### 3d. Resolve Tools

```
get_tools_for_page_dict(current_page, active_tab, active_subtab, user_role)
  ├── All global tools (is_global=True)
  ├── + page-wide tools from PageConfig
  ├── + tab-specific tools from TabConfig
  ├── + subtab-specific tools from SubTabConfig
  └── + role-filtered (some tools restricted by user_role)
```

Returns: `Dict[str, ToolConfig]` — tool name → full config (description,
input_schema, executor function)

### Key files

| File | What it does |
|------|-------------|
| `backend/services/chat_stream_service.py` | `stream_chat_message()`, `_build_system_prompt()`, `_build_messages_from_history()` |
| `backend/services/chat_page_config/registry.py` | `get_context_builder()`, `get_client_actions()`, payload/tool resolution |
| `backend/services/chat_page_config/<page>.py` | Per-page context builders and config |
| `backend/tools/registry.py` | `get_tools_for_page_dict()` — tool resolution |
| `backend/schemas/payloads.py` | `get_all_payloads_for_page()` — payload resolution |
| `backend/services/chat_service.py` | `get_messages()`, `create_chat()`, `add_message()` |

---

## Step 4: Agent Loop

The assembled system prompt, messages, and tools are handed to
`run_agent_loop()`. This is the core agentic processing engine.

### Loop structure

```
for iteration in 1..max_iterations:
    ┌─────────────────────────────────┐
    │  1. Call model (streaming)      │
    │     → yields AgentTextDelta     │
    │       events as tokens arrive   │
    ├─────────────────────────────────┤
    │  2. Check stop reason           │
    │     → No tool_use blocks?       │
    │       → AgentComplete, return   │
    ├─────────────────────────────────┤
    │  3. Process tool calls          │
    │     For each tool_use block:    │
    │     → AgentToolStart            │
    │     → Execute tool              │
    │     → AgentToolProgress (if     │
    │       streaming tool)           │
    │     → AgentToolComplete         │
    │     → Collect payloads          │
    ├─────────────────────────────────┤
    │  4. Append tool exchange to     │
    │     messages and loop back to 1 │
    └─────────────────────────────────┘

If max_iterations reached:
    → One final model call WITHOUT tools
    → "Provide a final summary" instruction
    → AgentComplete
```

### Tool execution details

Tools can return results in several ways:
- **Sync function**: returns `str` or `ToolResult`
- **Async function**: returns `str` or `ToolResult`
- **Sync generator**: yields `ToolProgress` events, returns `ToolResult` via `StopIteration`
- **Async generator**: yields `ToolProgress` and final `ToolResult`

A `ToolResult` contains:
- `text`: What the model sees as the tool output
- `payload`: Optional structured data for the frontend (not sent to the model)

### Trace building

The `TraceBuilder` records everything as the loop runs:
- System prompt, tool definitions, messages at each iteration
- Token usage per API call
- Tool calls with inputs, outputs, timing
- Final outcome (complete / max_iterations / cancelled / error)

### Cancellation

A `CancellationToken` is checked:
- Before each iteration
- During model streaming
- Before and during each tool execution

If cancelled, the loop emits `AgentCancelled` with whatever was collected so far.

### Key file

| File | What it does |
|------|-------------|
| `backend/agents/agent_loop.py` | `run_agent_loop()` — the full agentic loop |

---

## Step 5: SSE Event Streaming

As the agent loop yields events, `ChatStreamService.stream_chat_message()`
translates them to SSE event JSON and yields them to the router.

### Event mapping

| Agent Loop Event | SSE Event | Frontend handling |
|-----------------|-----------|-------------------|
| `AgentThinking` | `StatusEvent` ("Thinking...") | Sets status text |
| `AgentTextDelta` | `TextDeltaEvent` | Appends to streaming text display |
| `AgentToolStart` | `ToolStartEvent` | Shows "Running {tool}..." status |
| `AgentToolProgress` | `ToolProgressEvent` | Updates tool progress indicator |
| `AgentToolComplete` | `TextDeltaEvent` (`[[tool:N]]` marker) + `ToolCompleteEvent` | Clears tool progress, inserts tool marker in text |
| `AgentComplete` / `AgentCancelled` | _(triggers finalization — see Step 6)_ | — |
| `AgentError` | `ErrorEvent` | Shows error message |

### SSE wire format

```
data: {"type":"status","message":"Thinking..."}

data: {"type":"text_delta","text":"Here's what I found"}

data: {"type":"tool_start","tool":"search_web","input":{"query":"..."}}

data: {"type":"tool_complete","tool":"search_web","index":0}

data: {"type":"complete","payload":{...}}
```

### Key file

| File | What it does |
|------|-------------|
| `backend/services/chat_stream_service.py` | Event translation in `stream_chat_message()` |
| `backend/schemas/chat.py` | SSE event type definitions (Pydantic models) |

---

## Step 6: Response Finalization

After the agent loop completes, `stream_chat_message()` performs several
post-processing steps before emitting the final `complete` event.

### 6a. Parse LLM Response

```
_parse_llm_response(collected_text, context)
  ├── Extract SUGGESTED_VALUES: [...] marker → suggested_values list
  ├── Extract SUGGESTED_ACTIONS: [...] marker → suggested_actions list
  ├── Extract payload markers (e.g., SCHEMA_PROPOSAL: {...})
  │   → custom_payload dict
  └── Clean markers from message text
```

The parser uses the payload registry to know which markers to look for
(only payloads registered for the current page + tab + subtab are checked).

### 6b. Merge Payloads

Payloads come from two sources:
1. **Tool payloads**: `ToolResult.payload` from tool execution (collected during agent loop)
2. **LLM text payloads**: Parsed from marker syntax in the LLM's text output

Merge rules:
- Tool payloads take priority over text-parsed payloads of the same type
- Multiple payloads of the same type (e.g., two `data_proposal` payloads from
  two `for_each_row` tool calls) are merged by concatenating their operations
  and research logs

### 6c. Process Payloads

Each payload gets:
- A unique `payload_id` (first 8 chars of UUID)
- A `summary` (human-readable, from the payload registry's summarizer)

### 6d. Persist Assistant Message

The assistant's response is saved to the conversation with extras:
```python
extras = {
    "tool_history": [...],        # What tools were called
    "custom_payload": {...},      # Active payload for UI
    "payloads": [...],            # All payloads with IDs/summaries
    "trace": {...},               # Full agent execution trace
    "suggested_values": [...],    # Parsed suggestion chips
    "suggested_actions": [...]    # Parsed action buttons
}
```

### 6e. Context Window Warning

If the agent trace shows peak input tokens exceeded 70% of the context window
(140k of 200k), a warning string is included in the final payload.

### 6f. Emit Complete Event

```python
ChatResponsePayload(
    message=parsed["message"],           # Clean text (markers stripped)
    suggested_values=[...],              # Clickable suggestion chips
    suggested_actions=[...],             # Action buttons
    custom_payload={type, data, ...},    # Structured payload for rendering
    tool_history=[...],                  # Tool calls and results
    conversation_id=chat_id,             # For conversation continuity
    warning=context_warning,             # Optional context window warning
    diagnostics=trace                    # Full agent trace (for diagnostics panel)
)
```

### 6g. Teardown Safety Net

If the message was NOT saved (due to cancellation, disconnect, or error), the
`finally` block uses `asyncio.shield()` with a fresh DB session to persist
whatever text was collected. This prevents orphaned user messages without a
corresponding assistant response.

### Key file

| File | What it does |
|------|-------------|
| `backend/services/chat_stream_service.py` | `_parse_llm_response()`, `_merge_same_type_payloads()`, `_process_payloads()`, teardown logic |

---

## Step 7: Frontend Receives the Complete Event

Back in `ChatContext.sendMessage()`, the async for-await loop processes each
SSE event as it arrives.

### During streaming (text_delta events)

- `streamingText` state accumulates text as it arrives
- The ChatTray renders this as a live-updating message bubble

### On `complete` event

1. **Create assistant message** from the payload:
   ```typescript
   {
       role: 'assistant',
       content: responsePayload.message,
       suggested_values: responsePayload.suggested_values,
       suggested_actions: responsePayload.suggested_actions,
       custom_payload: responsePayload.custom_payload,
       tool_history: responsePayload.tool_history,
       warning: responsePayload.warning,
       diagnostics: responsePayload.diagnostics
   }
   ```
2. **Append to messages array** — replaces the streaming text with the final message
3. **Clear streaming state** — `streamingText = ''`, `statusText = null`
4. **Store conversation_id** — for subsequent messages in this conversation

### Rendering in ChatTray

The ChatTray renders each assistant message with:
- **Markdown text** via `MarkdownRenderer`
- **`[[tool:N]]` markers** replaced with inline `ToolResultCard` components
- **Payload** (if present): looked up in the `payloadRegistry` to find the
  matching React component (e.g., `SchemaProposalCard`, `DataProposalCard`)
- **Suggested values**: rendered as clickable chips below the message
- **Suggested actions**: rendered as action buttons
- **Tool history**: expandable panel showing what tools ran
- **Diagnostics**: expandable panel showing the full agent trace (for debugging)

### Payload handling

The `onPayloadReceived` callback on ChatTray allows the parent page to
intercept payloads. For example, `TableViewPage` captures `schema_proposal`
and `data_proposal` payloads and renders them as inline proposals in the
table rather than in the chat panel.

### Side effects on completion

Some pages watch for chat completion and trigger refreshes:
```typescript
// TableViewPage: if chat used data-modifying tools, refresh rows
if (lastMsg.tool_history?.some(t => DATA_TOOLS.includes(t.tool_name))) {
    fetchRows();
}
```

### Key files

| File | What it does |
|------|-------------|
| `frontend/src/context/ChatContext.tsx` | SSE event processing, state management |
| `frontend/src/components/chat/ChatTray.tsx` | Message rendering, payload dispatch, suggestion chips |
| `frontend/src/lib/chat/payloadRegistry.ts` | Maps payload types to React components |
| `frontend/src/lib/chat/payloads.ts` | Registers all payload handlers |

---

## Quick Reference: The Full Path

| # | What | Where | Key Function/Method |
|---|------|-------|-------------------|
| 0 | Context updates as user navigates | `ChatContext.tsx` | `updateContext()` |
| 1 | User clicks Send | `ChatTray.tsx` → `ChatContext.tsx` | `sendMessage()` |
| 2 | HTTP POST to `/api/chat/stream` | `chatApi.ts` | `streamMessage()` |
| 3 | Router opens SSE response | `chat_stream.py` | `chat_stream()` |
| 4 | Persist user message, get chat_id | `chat_stream_service.py` | `_setup_chat()` |
| 5 | Build system prompt (8 sections) | `chat_stream_service.py` | `_build_system_prompt()` |
| 6 | Build message history from DB | `chat_stream_service.py` | `_build_messages_from_history()` |
| 7 | Resolve tools for page+tab+subtab | `tools/registry.py` | `get_tools_for_page_dict()` |
| 8 | Run agent loop (model + tools) | `agent_loop.py` | `run_agent_loop()` |
| 9 | Stream SSE events to frontend | `chat_stream_service.py` | Event translation in `stream_chat_message()` |
| 10 | Parse response (payloads, suggestions) | `chat_stream_service.py` | `_parse_llm_response()` |
| 11 | Merge and process payloads | `chat_stream_service.py` | `_merge_same_type_payloads()`, `_process_payloads()` |
| 12 | Persist assistant message | `chat_stream_service.py` | `_save_assistant_message()` |
| 13 | Emit `complete` event | `chat_stream_service.py` | `ChatResponsePayload` construction |
| 14 | Frontend processes complete event | `ChatContext.tsx` | `sendMessage()` complete handler |
| 15 | Render message + payload + suggestions | `ChatTray.tsx` | Message rendering loop |
