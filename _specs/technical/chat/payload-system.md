# Payload System

How structured data flows from the backend LLM/tools to inline frontend rendering.

---

## Backend: Birth of a Payload

Payloads reach the frontend via two paths:

### Path A: LLM Text Markers

The system prompt (built by `_build_capabilities_section` in `chat_stream_service.py:698-743`) injects instructions telling the LLM it can write structured markers in its response text:

```
SCHEMA_PROPOSAL: { "mode": "create", "operations": [...] }
DATA_PROPOSAL: { "reasoning": "...", "operations": [...] }
```

Which markers are available depends on the page. Configured in each page's `register_page()` call:

| Page | Payloads |
|---|---|
| `table_view` | `schema_proposal`, `data_proposal` |
| `tables_list` | `schema_proposal` |
| `table_edit` | `schema_proposal` |

The marker instructions come from `register_payload_type()` in `backend/schemas/payloads.py` (lines 385-461). Each registration includes:
- `llm_instructions`: Text injected into the system prompt
- `parse_marker`: The string prefix to regex-match (e.g. `SCHEMA_PROPOSAL:`)
- `parser`: Function to parse the JSON after the marker
- `summarize`: Function to produce a human-readable summary for the payload manifest

### Path B: Tool Return Values

Tools return payloads via `ToolResult`:

```python
# backend/tools/registry.py
@dataclass
class ToolResult:
    text: str
    payload: Optional[Dict[str, Any]] = None  # {"type": ..., "data": ...}
```

Example from `enrich_column` (`backend/tools/builtin/table_data.py:791-804`):

```python
yield ToolResult(
    text=summary,
    payload={
        "type": "data_proposal",
        "data": {
            "reasoning": "...",
            "operations": operations,
            "research_log": research_log,
        },
    },
)
```

The agent loop (`backend/agents/agent_loop.py`) collects tool payloads in `collected_payloads` across all iterations.

---

## Backend: Parsing and Merging

**File:** `backend/services/chat_stream_service.py`

### 1. Text Parsing (lines 1099-1132)

`_parse_llm_response()` processes the accumulated LLM text:
- Regex-matches markers (handles optional bold/italic: `**SCHEMA_PROPOSAL**:`)
- Extracts JSON via brace-balanced parsing (`_extract_json_object()`)
- Calls the registered parser function
- Strips the marker + JSON from the message text

### 2. Merge (lines 208-234)

Tool payloads take priority:
- Start with all tool payloads
- If the LLM also wrote a text marker of the same type, the text version is **skipped** (tool version is richer, e.g. includes `research_log`)
- If the text marker is a different type, it's added

### 3. Same-Type Merging (lines 376-439)

`_merge_same_type_payloads()` combines multiple payloads of the same type (e.g. two `enrich_column` calls each producing `data_proposal`). Their `operations` and `research_log` arrays are concatenated.

### 4. Final Assembly (line 240)

`_process_payloads()` assigns each payload a unique 8-char ID and a human-readable summary. The **last** payload becomes the active `custom_payload` on the SSE `CompleteEvent`. All payloads are persisted in `extras.payloads[]` for future retrieval via the `get_payload` tool.

### Payload Manifest

For multi-turn conversations, `_build_payload_manifest()` (lines 476-513) scans previous assistant messages and builds a manifest for the system prompt:

```
AVAILABLE PAYLOADS (use get_payload tool to retrieve full data):
- [a1b2c3d4] Create table: "Product Comparison" -- 3 additions
- [e5f6g7h8] Data proposal: 5 additions
```

This appears under `== CONVERSATION DATA ==` in the system prompt.

---

## Frontend: Detection and Routing

### ChatContext Stores the Payload

When the SSE `complete` event arrives, `ChatContext.tsx:135-157` builds a `ChatMessage` with the `custom_payload` field:

```typescript
const assistantMessage: ChatMessage = {
    role: 'assistant',
    content: responsePayload.message,
    custom_payload: responsePayload.custom_payload,  // { type, data }
    tool_history: responsePayload.tool_history,
    ...
};
setMessages(prev => [...prev, assistantMessage]);
```

Type definition (`types/chat.ts`):

```typescript
interface CustomPayload {
    type: string;   // "schema_proposal" or "data_proposal"
    data: unknown;
}
```

### Pages Watch Messages

Each page has a `useEffect` that scans new messages using a `lastCheckedIndexRef` pattern:

**TableViewPage** (`pages/TableViewPage.tsx:173-203`) — merged effect scans for both:
- `tool_history` containing data-modifying tools (auto-refresh rows)
- `custom_payload` (routed to `proposal.handlePayload()`)

**TablesListPage** (`pages/TablesListPage.tsx:189-199`) — detects `schema_proposal` with `mode === 'create'`, sets `activeProposal` state to render `ProposedTablePreview`.

**TableEditPage** (`pages/TableEditPage.tsx:386-396`) — detects any `schema_proposal`, immediately calls `handleSchemaProposalAccept` which auto-applies and auto-saves.

---

## Frontend: Inline Rendering

### useTableProposal Hook

**File:** `hooks/useTableProposal.ts`

`handlePayload` (lines 258-275) is the main router for TableViewPage:

| Payload | Behavior |
|---|---|
| `data_proposal` | Stores as `{ kind: 'data', data }`. Initializes all ops as checked/pending. |
| `schema_proposal` (update) | Stores as `{ kind: 'schema', data }`. |

Setting a new proposal always resets the previous one (mutual exclusion).

The hook computes derived state for inline rendering:

| Computed Value | Purpose |
|---|---|
| `displayRows` | Merges proposed adds/updates into real rows |
| `rowMeta` | Maps row IDs to proposal metadata (action, opIndex, oldValues) |
| `displayColumns` | Applies proposed schema changes to column list |
| `columnMeta` | Maps column IDs to proposal metadata (action, changes) |
| `proposalOverlay` | Discriminated union passed to DataTable for visual highlights |

### Inline UI Components

| Component | Used For |
|---|---|
| `ProposalActionBar` | Strip above table for data proposals (checkboxes, apply/dismiss) |
| `SchemaProposalStrip` | Strip above table for schema update proposals |
| `ProposedTablePreview` | Full preview on TablesListPage for create-mode proposals |
| `DataTable` overlays | Row tinting (green=add, amber=update, red=delete), column highlights |

---

## Payload Schemas

### SchemaProposalData

**File:** `types/schemaProposal.ts`

```typescript
interface SchemaProposalData {
    mode: 'create' | 'update';
    reasoning?: string;
    table_name?: string;
    table_description?: string;
    operations: SchemaOperation[];
    sample_rows?: Record<string, unknown>[];
}

interface SchemaOperation {
    action: 'add' | 'modify' | 'remove' | 'reorder';
    column?: { name, type, required?, options?, filterDisplay? };
    column_id?: string;
    after_column_id?: string;
    changes?: Partial<{ name, type, required, options }>;
}
```

### DataProposalData

**File:** `types/dataProposal.ts`

```typescript
interface DataProposalData {
    reasoning?: string;
    operations: DataOperation[];
    research_log?: ResearchLogEntry[];  // Tool-only (enrich_column)
}

type DataOperation =
    | { action: 'add', data: Record<string, unknown> }
    | { action: 'update', row_id: number, changes: Record<string, unknown> }
    | { action: 'delete', row_id: number }
```

---

## Flow Summary

```
Backend:
  System prompt includes payload marker instructions per page
  LLM writes "SCHEMA_PROPOSAL: {...}" in text  ─┐
  OR tool returns ToolResult(payload={...})      ─┤
                                                  ▼
  _parse_llm_response() extracts text markers
  Merge: tool payloads take priority, same-type combined
  Assign IDs and summaries
  CompleteEvent.custom_payload = last payload
  Persist all in extras.payloads[]

Frontend:
  ChatContext stores custom_payload on ChatMessage
  Page useEffect scans new messages via lastCheckedIndexRef
  Routes to handler:
    TableViewPage  → useTableProposal.handlePayload()  → inline overlay
    TablesListPage → setActiveProposal()                → ProposedTablePreview
    TableEditPage  → handleSchemaProposalAccept()       → auto-apply + save
```
