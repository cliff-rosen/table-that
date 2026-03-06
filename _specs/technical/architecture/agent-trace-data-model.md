# Agent Trace Data Model

How tool execution data is captured, stored, and displayed.

---

## Data Flow

```
Model requests tool call
  → agent_loop._process_tools() executes tool, captures everything
    → TraceBuilder.add_iteration() accumulates iterations
      → chat_stream_service attaches final_response, persists to DB
        → Frontend receives AgentTrace as diagnostics
```

---

## Schema

### AgentTrace

Top-level trace object. One per chat message. Stored in `Message.extras.trace`.

| Field | Type | Description |
|-------|------|-------------|
| `trace_id` | string (UUID) | Unique identifier for this trace |
| `model` | string | Model used (e.g. "claude-sonnet-4-20250514") |
| `max_tokens` | int | Max tokens setting |
| `max_iterations` | int | Max agent loop iterations allowed |
| `temperature` | float | Temperature setting |
| `system_prompt` | string | Full system prompt text |
| `tools` | ToolDefinition[] | Tool schemas available to the model |
| `context` | dict | Request context (page, table_id, etc.) |
| `initial_messages` | dict[] | Conversation history sent to model |
| `iterations` | AgentIteration[] | Each round-trip with the model |
| `final_response` | FinalResponse | What was sent to the frontend |
| `outcome` | string | "complete", "max_iterations", "cancelled", "error" |
| `error_message` | string? | Error details if outcome is "error" |
| `total_iterations` | int | Number of iterations |
| `total_input_tokens` | int | Cumulative input tokens across all iterations |
| `total_output_tokens` | int | Cumulative output tokens |
| `peak_input_tokens` | int? | Largest single-iteration input token count |
| `total_duration_ms` | int | Wall-clock time for entire agent loop |

### AgentIteration

One model API call and its tool executions. Multiple iterations happen when the model calls tools and the loop continues.

| Field | Type | Description |
|-------|------|-------------|
| `iteration` | int | 1-indexed iteration number |
| `messages_to_model` | dict[] | Exact messages array sent to the API |
| `response_content` | dict[] | Model's content blocks (text and tool_use) |
| `stop_reason` | string | "end_turn", "tool_use", "max_tokens" |
| `usage` | TokenUsage | `{input_tokens, output_tokens}` |
| `api_call_ms` | int | Model API latency |
| `tool_calls` | ToolCall[] | Tool executions from this iteration (empty if none) |

**`response_content` blocks** are the raw content blocks from the model response:
- `{type: "text", text: "..."}` — the model's reasoning/message text
- `{type: "tool_use", id: "...", name: "...", input: {...}}` — tool call request

The text blocks serve as **assistant reasoning** — what the model was thinking when it decided to call tools.

### ToolCall

A single tool execution with data captured at every boundary.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| `tool_use_id` | string | Model's tool_use block | Correlates with model's reference |
| `tool_name` | string | Model's tool_use block | Tool identifier |
| `tool_input` | dict | Model's tool_use block | Exact input requested by model |
| `output_from_executor` | any | Raw executor result | What the executor actually returned (before formatting) |
| `output_type` | string | Result classification | "ToolResult", "str", "error", etc. |
| `output_to_model` | string | ToolResult.text | Text sent back to model in tool_result message |
| `payload` | dict? | ToolResult.payload | Structured data for frontend: `{type, data}` |
| `progress_events` | ToolProgressRecord[]? | Yielded ToolProgress items | Step-by-step execution events |
| `execution_ms` | int | Timer | Total execution time |

### ToolProgressRecord

A real-time update emitted during tool execution. Streamed to frontend immediately AND recorded in the trace.

| Field | Type | Description |
|-------|------|-------------|
| `stage` | string | Step category (see stage values below) |
| `message` | string | Human-readable status text |
| `progress` | float | 0.0 to 1.0 (0 if indeterminate) |
| `data` | ProgressData? | Rich event data — search results, answers, errors (see below) |
| `elapsed_ms` | int | Milliseconds since tool execution started |

**Stage values**: `enrich_start`, `searching`, `fetching`, `computing`, `answer`, `row_done`, `skip`, `error`, `fail`

**`data` field (ProgressData)** — not every event carries data, but when it does:

| Field | Type | Present when | Description |
|-------|------|-------------|-------------|
| `result` | string | `searching`, `fetching` | The actual search results or fetched page content. Can be thousands of chars. |
| `outcome` | string | `answer`, `error` | `"found"`, `"not_found"`, or `"error"` |
| `value` | string | `answer` with outcome=found | The extracted answer (e.g. "200 Montague St") |
| `explanation` | string | `answer`, `error` | Why this answer was chosen, or what went wrong |
| `formula` | string | `computing` | The formula being evaluated |

Example progression for an enrichment row:

```
{stage: "enrich_start", message: "Processing Store A",           data: null}
{stage: "searching",    message: "Searching Google for address", data: {result: "1. Store A - 200 Montague St...\n2. ..."}}
{stage: "fetching",     message: "Reading storea.com/about",     data: {result: "About Us\nLocated at 200 Montague..."}}
{stage: "answer",       message: "Found value",                  data: {outcome: "found", value: "200 Montague St", explanation: "Confirmed from website"}}
{stage: "row_done",     message: "Store A complete",             data: null}
```

### FinalResponse

What was sent to the frontend as the assistant's response. Attached to the trace after the agent loop completes.

| Field | Type | Description |
|-------|------|-------------|
| `message` | string | Assistant message text |
| `suggested_values` | SuggestedValue[]? | Clickable suggestion chips |
| `suggested_actions` | SuggestedAction[]? | Action buttons |
| `custom_payload` | dict? | Primary payload for rendering (e.g. schema_proposal, data_proposal) |
| `tool_history` | ToolHistoryEntry[]? | Simplified tool call summary |
| `conversation_id` | int? | Conversation ID |

### ToolHistoryEntry

Simplified tool call summary stored in `FinalResponse.tool_history`. This is a lossy summary — it has only name, input, and output. No progress events, no payload, no timing.

| Field | Type | Description |
|-------|------|-------------|
| `tool_name` | string | Tool identifier |
| `input` | dict | Tool input |
| `output` | string or dict | Tool output |

---

## Storage

All of the above is stored as JSON in `Message.extras`:

```json
{
  "trace": { /* full AgentTrace */ },
  "tool_history": [ /* ToolHistoryEntry[] */ ],
  "custom_payload": { "type": "...", "data": {...} },
  "payloads": [ /* all payloads with IDs */ ],
  "suggested_values": [...],
  "suggested_actions": [...]
}
```

---

## Frontend Display

Three components display tool call data, using different subsets:

### ToolHistoryPanel (user chat tray → "View N tools")

Data source: `AgentTrace.iterations` → extracts `ToolCall[]` + assistant text from `response_content`

Shows: tool name, status, timing, assistant reasoning, input, progress timeline, output, payload, fullscreen

Falls back to `ToolHistoryEntry[]` when trace is not available.

### DiagnosticsPanel Tools tab (diagnostics modal)

Data source: Same as ToolHistoryPanel — `AgentTrace.iterations` → `ToolCall[]`

Shows: Same fields plus iteration number. Currently reimplements rendering instead of sharing with ToolHistoryPanel.

### AgentResponseCard Tools tab (diagnostics modal → Messages → Agent Response)

Data source: `FinalResponse.tool_history` → `ToolHistoryEntry[]`

Shows: tool name, input, output only. Simple two-column layout. No progress, payload, or timing.

---

## Key Design Principles

1. **Capture at every boundary**: `tool_input` is exactly what the model sent, `output_from_executor` is the raw result, `output_to_model` is what went back. No reconstruction needed.

2. **Stream AND record**: Progress events are yielded to the frontend in real-time for live updates, and also accumulated in the trace for replay.

3. **Payload separation**: `output_to_model` (text the LLM sees) and `payload` (structured data for UI) are separate concerns. The LLM never sees the payload.

4. **Lossy summary**: `ToolHistoryEntry` is a convenience for simple displays. The full `ToolCall` in the trace is the source of truth.
