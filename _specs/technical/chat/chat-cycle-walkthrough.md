# Chat Request-Response Cycle Walkthrough

Full trace of a single user message through the table.that chat system.

---

## Step 1: Context Building

**File:** `frontend/src/pages/TableViewPage.tsx` (lines 147-170)

TableViewPage reactively pushes table state into ChatContext whenever table, rows, filters, sort, or selection changes:

```
updateContext({ current_page, table_id, table_name, columns, row_count, sample_rows, active_sort, active_filters, selected_rows })
```

**File:** `frontend/src/context/ChatContext.tsx` (lines 223-227)

`updateContext` merges into `contextRef` (a ref, used at send-time to avoid stale closures) and `setContextState` (React state, for consumers that need reactivity).

---

## Step 2: User Sends Message

**File:** `frontend/src/components/chat/ChatTray.tsx` (lines ~434-443)

User submits input → `handleSubmit()` → calls `sendMessage(text, InteractionType.TEXT_INPUT)` from ChatContext.

**File:** `frontend/src/context/ChatContext.tsx` (lines 62-214)

`sendMessage` does:
1. Creates `userMessage`, appends to `messages` state
2. Sets `isLoading=true`, clears error/streaming/status state
3. Creates `AbortController` for cancellation
4. Begins `for await` loop over `chatApi.streamMessage({ message, context: contextRef.current, interaction_type, action_metadata, conversation_id: chatIdRef.current })`

---

## Step 3: HTTP/SSE Connection

**File:** `frontend/src/lib/api/chatApi.ts` (lines 74-143)

`chatApi.streamMessage()` is an async generator that:
1. Calls `makeStreamRequest('/api/chat/stream', request, 'POST', signal)`
2. Buffers incoming data, splits on newlines, parses `data: {json}` lines
3. Yields typed `StreamEvent` objects back to ChatContext

**File:** `frontend/src/lib/api/streamUtils.ts` (lines 49-155)

`makeStreamRequest()`:
- `fetch()` POST to `/api/chat/stream` with `Authorization: Bearer {token}`, `Accept: text/event-stream`
- Reads response body as `ReadableStream`, decodes chunks via `TextDecoder`
- Yields raw `StreamUpdate` objects containing text data

---

## Step 4: Backend Router

**File:** `backend/routers/chat_stream.py` (lines 36-112)

`POST /api/chat/stream` endpoint:
1. Validates `ChatRequest` (message, context, interaction_type, action_metadata, conversation_id)
2. Spawns `monitor_disconnect()` background task (polls `is_disconnected()` every 0.5s)
3. Creates `ChatStreamService` (injected via factory + `Depends`)
4. Iterates `service.stream_chat_message(request, cancellation_token)` → wraps each yielded JSON as SSE `data:` lines
5. Returns `EventSourceResponse` with 1s keepalive ping

---

## Step 5: ChatStreamService

**File:** `backend/services/chat_stream_service.py` (lines 80-369)

### 5a. Persistence Setup (line 96)
- Resolves or creates conversation via `ChatService`
- Saves user message to DB
- Emits `ChatIdEvent` immediately so frontend has the conversation_id

### 5b. System Prompt Building (lines 118-127)
Calls `_build_system_prompt()` which assembles sections:
1. **Global preamble** — defines table.that, user phases, AI role, style
2. **Page persona** — from `chat_page_config` registry (e.g. `table_view.py` lines 103-237)
3. **Context** — calls the page's `context_builder` (formats table schema, sample rows, filters into text)
4. **Payload manifest** — summaries of prior payloads in conversation
5. **Capabilities** — lists available tools, payload markers, client actions
6. **Help TOC** — help system table of contents
7. **Format rules** — SUGGESTED_VALUES / SUGGESTED_ACTIONS marker syntax

### 5c. Tool Resolution (lines 129-136)
Calls `get_tools_for_page_dict(current_page, ...)` from `tools/registry.py` — merges global tools + page-specific tools (for `table_view`: create_row, update_row, delete_row, search_rows, describe_table, get_rows, enrich_column, search_web, fetch_webpage, research_web).

### 5d. Agent Loop (lines 144-199)
Calls `run_agent_loop()` and maps `AgentEvent` types to SSE `StreamEvent` types:

| Agent Event         | SSE Event          |
|---------------------|--------------------|
| `AgentThinking`     | `StatusEvent`      |
| `AgentTextDelta`    | `TextDeltaEvent`   |
| `AgentToolStart`    | `ToolStartEvent`   |
| `AgentToolProgress` | `ToolProgressEvent`|
| `AgentToolComplete` | `TextDeltaEvent` (injects `[[tool:N]]` marker) + `ToolCompleteEvent` |
| `AgentComplete`     | *(captured, not yielded — triggers completion)* |
| `AgentError`        | `ErrorEvent`       |

---

## Step 6: Agent Loop (Tool Execution)

**File:** `backend/agents/agent_loop.py` (lines 277-482)

Main loop (up to `max_iterations`):
1. Calls Anthropic API via `client.messages.stream()` — yields `AgentTextDelta` for each token
2. Checks response for `tool_use` blocks
3. If no tools → yields `AgentComplete`, returns
4. If tools → dispatches each to its registered executor:
   - Yields `AgentToolStart` per tool
   - Executor receives `(tool_input, db, user_id, context)`, returns `str` or `ToolResult` (with optional `payload`)
   - For generator-based tools, yields `AgentToolProgress` events during execution
   - Yields `AgentToolComplete` with text result
5. Appends assistant content + tool results to message history, loops

---

## Step 7: Response Completion & Persistence

**File:** `backend/services/chat_stream_service.py` (lines 201-322)

After agent loop completes:
1. **Parse LLM response** (lines 204) — extracts `SUGGESTED_VALUES:`, `SUGGESTED_ACTIONS:`, and custom payloads (SCHEMA_PROPOSAL, DATA_PROPOSAL) from text
2. **Merge payloads** — tool-emitted payloads take priority over text-parsed; same-type payloads are merged (e.g. concatenated operations)
3. **Persist** assistant message to DB with all extras (tool_history, payloads, trace)
4. **Token warning** — if usage > 70% of 140k context window, adds a warning
5. **Emit `CompleteEvent`** with full `ChatResponsePayload`: message, suggested_values, suggested_actions, custom_payload, tool_history, conversation_id, warning, diagnostics

---

## Step 8: Frontend Processes SSE Events

**File:** `frontend/src/context/ChatContext.tsx` (lines 105-182)

| Event Type      | State Update                                         |
|-----------------|------------------------------------------------------|
| `text_delta`    | Accumulate text → `setStreamingText()`               |
| `status`        | `setStatusText(event.message)`                       |
| `tool_start`    | `setStatusText("Running {tool}...")` + `setActiveToolProgress(...)` |
| `tool_progress` | Append to `activeToolProgress.updates`               |
| `tool_complete` | Clear `activeToolProgress` and `statusText`          |
| `complete`      | Create `assistantMessage` → append to `messages[]`, clear `streamingText`, `statusText`, set `isLoading=false`, set `chatId` |
| `error`         | `setError()` + append error message to `messages[]`  |
| `chat_id`       | `setChatId(event.conversation_id)`                   |

---

## Step 9: ChatTray Renders & Detects Payloads

**File:** `frontend/src/components/chat/ChatTray.tsx`

**Rendering (lines ~577-596):**
- Each message rendered via `MessageContent` component
- `MessageContent` parses `[[tool:N]]` markers → inline `ToolResultCard` components
- Markdown via `MarkdownRenderer`

**Payload detection (lines ~354-386):**
- Watches `messages[]` for new messages with `custom_payload`
- Calls `onPayloadReceived?.(payloadInfo)` — parent (TableViewPage) decides:
  - Returns `true` → parent handles inline (table proposals shown as strips/bars)
  - Returns `false` → ChatTray shows in its own floating panel

---

## Step 10: Table Refresh

**File:** `frontend/src/pages/TableViewPage.tsx`

### Mechanism A: Auto-refresh on tool usage (lines 172-190)

Watches `messages[]`. When a new assistant message arrives with `tool_history` containing `create_row`, `update_row`, or `delete_row` → calls `fetchRows()`.

```
const DATA_TOOLS = ['create_row', 'update_row', 'delete_row'];
useEffect(() => {
    // scan new messages for data-tool usage → fetchRows()
}, [messages, fetchRows]);
```

### Mechanism B: Proposal-based refresh

`useTableProposal` hook receives `fetchRows` as callback. When user clicks "Apply" on a data/schema proposal → executes operations → calls `fetchRows()`.

---

## Key Files Quick Reference

| Layer | File | Purpose |
|-------|------|---------|
| Context | `frontend/src/context/ChatContext.tsx` | State management, sendMessage orchestrator |
| UI | `frontend/src/components/chat/ChatTray.tsx` | Chat panel, input, message rendering, payload detection |
| API Client | `frontend/src/lib/api/chatApi.ts` | SSE stream parsing, typed event yielding |
| Stream Utils | `frontend/src/lib/api/streamUtils.ts` | Raw fetch + ReadableStream → text chunks |
| Page | `frontend/src/pages/TableViewPage.tsx` | Context pushing, auto-refresh, proposal handling |
| Router | `backend/routers/chat_stream.py` | HTTP endpoint, disconnect monitoring, SSE response |
| Service | `backend/services/chat_stream_service.py` | Prompt building, agent orchestration, persistence, payload parsing |
| Agent | `backend/agents/agent_loop.py` | LLM calls, tool dispatch loop, event yielding |
| Page Config | `backend/services/chat_page_config/table_view.py` | Page persona, context builder, tool list |
| Tools | `backend/tools/builtin/` | Individual tool executors |
| Proposals | `frontend/src/hooks/useTableProposal.ts` | Inline proposal UI state machine |
