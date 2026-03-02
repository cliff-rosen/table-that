# LLM Response Output Schema

> Formal specification of what constitutes a valid LLM text response in the table.that chat system.
>
> **Source of truth:** `backend/schemas/payloads.py` (payload definitions), `backend/services/chat_stream_service.py` (parsing logic, format instructions)

## Overview

The LLM operates in an agentic loop. Each turn, it produces a **response** consisting of:

1. **Content blocks** — zero or more `text` blocks and zero or more `tool_use` blocks (standard Claude API)
2. The **text blocks** are concatenated into a single string, which is then parsed for structured elements

This document specifies the implicit schema of that concatenated text string — the "output schema" that the system prompt instructs the LLM to follow and that `_parse_llm_response()` extracts from.

## Response Structure

A valid LLM text response is a string containing **up to four element types**, in any order:

```
┌──────────────────────────────────────────────────────┐
│  Plain text (conversational message to the user)     │
│                                                      │
│  SCHEMA_PROPOSAL: { ... }     ← 0 or 1 payload      │
│    — OR —                                            │
│  DATA_PROPOSAL: { ... }       ← 0 or 1 payload      │
│                                                      │
│  SUGGESTED_VALUES: [ ... ]    ← 0 or 1               │
│                                                      │
│  SUGGESTED_ACTIONS: [ ... ]   ← 0 or 1               │
└──────────────────────────────────────────────────────┘
```

**Constraints:**
- At most **one** custom payload per response (first match wins)
- Custom payloads and suggestions are **mutually exclusive by convention** — the system prompt tells the LLM not to emit suggestions when a proposal is present
- All structured elements are **stripped** from the message before it reaches the user — only the plain text portion is displayed

---

## Element 1: Plain Text

Everything in the response that is not captured by a marker below.

- **Always present** (may be empty if the response is purely structured)
- Displayed to the user as the chat message
- Supports markdown formatting
- After parsing, stored as `result["message"]`

---

## Element 2: SUGGESTED_VALUES

Clickable chip suggestions that the user can tap to send as their next message.

### Format

```
SUGGESTED_VALUES:
[
  {"label": "Display Text", "value": "text to send as next message"},
  {"label": "Another Option", "value": "another thing to send"}
]
```

### Schema

```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "label": {
        "type": "string",
        "description": "Display text on the chip (2-6 words)"
      },
      "value": {
        "type": "string",
        "description": "Text sent as the user's next message when clicked"
      }
    },
    "required": ["label", "value"]
  }
}
```

### Rules

- **Marker:** `SUGGESTED_VALUES:` (exact string, case-sensitive)
- **Cardinality:** 2-4 items recommended
- **When to include:**
  - After creating a table
  - After a schema change
  - After populating data
  - After answering a question
  - When the user seems unsure
- **When NOT to include:**
  - After emitting a SCHEMA_PROPOSAL or DATA_PROPOSAL (user must act on proposal first)
  - When the conversation is clearly finished

### Parsing

- Marker detected by exact string match
- JSON extracted by `_extract_json_array()` (balanced bracket matching)
- Must be a valid JSON array
- Marker + JSON stripped from message text

---

## Element 3: SUGGESTED_ACTIONS

Clickable buttons that trigger client-side UI actions.

### Format

```
SUGGESTED_ACTIONS:
[
  {"label": "Button Text", "action": "action_identifier", "handler": "client"}
]
```

### Schema

```json
{
  "type": "array",
  "items": {
    "type": "object",
    "properties": {
      "label": {
        "type": "string",
        "description": "Button display text"
      },
      "action": {
        "type": "string",
        "description": "Must be from the CLIENT ACTIONS list in capabilities"
      },
      "handler": {
        "const": "client",
        "description": "Always 'client'"
      }
    },
    "required": ["label", "action", "handler"]
  }
}
```

### Available Actions

Actions are registered per-page via `ClientAction` in `chat_page_config/registry.py`. Global actions (all pages):

| Action | Description |
|--------|-------------|
| `close_chat` | Close the chat panel |

Pages may register additional actions. The LLM is instructed to **only use actions listed in the CLIENT ACTIONS section** of its system prompt — never invent new ones.

### Rules

- **Marker:** `SUGGESTED_ACTIONS:` (exact string, case-sensitive)
- **Constraint:** `action` field must match a registered `ClientAction.action` identifier
- Same mutual exclusion with proposals as SUGGESTED_VALUES

### Parsing

- Same extraction logic as SUGGESTED_VALUES (`_extract_json_array()`)
- Marker + JSON stripped from message text

---

## Element 4: Custom Payloads

Structured data proposals that appear as interactive UI elements (inline in the table, not in chat).

### Available Payload Types

Payloads are registered in `backend/schemas/payloads.py` and assigned to pages in `chat_page_config/{page}.py`.

| Payload | Marker | Pages | Purpose |
|---------|--------|-------|---------|
| `schema_proposal` | `SCHEMA_PROPOSAL:` | tables_list, table_edit, table_view | Create/modify table schema |
| `data_proposal` | `DATA_PROPOSAL:` | table_view | Bulk add/update/delete rows |

Only **one** custom payload can appear per response (first match wins during parsing).

### Marker Matching

Payload markers support optional markdown bold/italic wrapping:

```
SCHEMA_PROPOSAL: { ... }        ← plain
**SCHEMA_PROPOSAL**: { ... }    ← bold
*SCHEMA_PROPOSAL*: { ... }      ← italic
**SCHEMA_PROPOSAL:** { ... }    ← bold with colon inside
```

Regex pattern: `\*{0,2}MARKER_TEXT\*{0,2}\s*:`

### Parsing

1. For each registered LLM payload on the current page, check for its marker
2. Extract JSON object after marker using `_extract_json_object()` (balanced brace matching)
3. Pass to `PayloadType.parser` (typically `make_json_parser()` which wraps as `{"type": name, "data": parsed}`)
4. Strip marker + JSON from message text
5. Stop after first successful match

---

### 4a. SCHEMA_PROPOSAL

Proposes creating a new table or modifying an existing table's schema.

#### Format

```
SCHEMA_PROPOSAL: {
  "mode": "create",
  "reasoning": "Brief explanation",
  "table_name": "My Table",
  "table_description": "What this table tracks",
  "operations": [
    {"action": "add", "column": {"name": "Name", "type": "text", "required": true}},
    {"action": "add", "column": {"name": "Status", "type": "select", "options": ["Active", "Inactive"]}}
  ],
  "sample_rows": [
    {"Name": "Acme Corp", "Status": "Active"},
    {"Name": "Globex", "Status": "Inactive"}
  ]
}
```

#### Schema

```json
{
  "type": "object",
  "required": ["mode", "operations"],
  "properties": {
    "mode": {
      "type": "string",
      "enum": ["create", "update"]
    },
    "reasoning": {
      "type": "string"
    },
    "table_name": {
      "type": "string",
      "description": "Required for create, optional for update (only if renaming)"
    },
    "table_description": {
      "type": "string",
      "description": "Required for create, optional for update"
    },
    "operations": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/definitions/schema_operation" }
    },
    "sample_rows": {
      "type": "array",
      "maxItems": 5,
      "items": { "type": "object", "additionalProperties": true },
      "description": "Required for create mode. 2-3 realistic example rows."
    }
  }
}
```

#### Operation Types

**Add column:**
```json
{
  "action": "add",
  "column": {
    "name": "Column Name",
    "type": "text|number|date|boolean|select",
    "required": false,
    "options": ["only", "for", "select"],
    "filterDisplay": "tab|dropdown"
  },
  "after_column_id": "col_xxx"
}
```
- `after_column_id` is optional — controls placement. Omit to append at end.
- `filterDisplay`: `"tab"` for inline filter buttons, `"dropdown"` for dropdown chip. Only for select columns.
- `options`: required for select type, ignored for others.

**Modify column:**
```json
{
  "action": "modify",
  "column_id": "col_xxx",
  "changes": {
    "name": "New Name",
    "type": "select",
    "options": ["Full", "Options", "List"],
    "required": true,
    "filterDisplay": "dropdown"
  }
}
```
- `column_id` references existing column (from context).
- `changes` contains only the fields being changed.
- For select type changes, include the **full** options list (not incremental).

**Remove column:**
```json
{
  "action": "remove",
  "column_id": "col_xxx"
}
```

**Reorder column:**
```json
{
  "action": "reorder",
  "column_id": "col_xxx",
  "after_column_id": "col_yyy"
}
```
- Omit `after_column_id` to move to first position.

#### Mode Rules

| Rule | `create` | `update` |
|------|----------|----------|
| Valid operations | `add` only | `add`, `modify`, `remove`, `reorder` |
| `table_name` | Required | Optional (only if renaming) |
| `table_description` | Required | Optional |
| `sample_rows` | Required (2-3 rows) | Not used |
| Column references | By name | By `column_id` (from context) |

---

### 4b. DATA_PROPOSAL

Proposes bulk data changes — adding, updating, or deleting rows.

#### Format

```
DATA_PROPOSAL: {
  "reasoning": "Adding sample job applications",
  "operations": [
    {"action": "add", "data": {"Company": "Acme Corp", "Position": "Engineer", "Status": "Applied"}},
    {"action": "update", "row_id": 5, "changes": {"Status": "Interview"}},
    {"action": "delete", "row_id": 12}
  ]
}
```

#### Schema

```json
{
  "type": "object",
  "required": ["operations"],
  "properties": {
    "reasoning": {
      "type": "string"
    },
    "operations": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/definitions/data_operation" }
    }
  }
}
```

#### Operation Types

**Add row:**
```json
{
  "action": "add",
  "data": {
    "Column Name": "value",
    "Another Column": 42,
    "Date Column": "2024-03-15"
  }
}
```
- Keys are column **names** (not IDs).
- Include values for all relevant columns.

**Update row:**
```json
{
  "action": "update",
  "row_id": 5,
  "changes": {
    "Column Name": "new value"
  }
}
```
- `row_id` is the database row ID (from context/tools).
- Only include columns being changed.

**Delete row:**
```json
{
  "action": "delete",
  "row_id": 12
}
```

#### When to Use DATA_PROPOSAL vs Direct Tools

| Scenario | Approach |
|----------|----------|
| Single row, explicit user request | `create_row` / `update_row` / `delete_row` tools |
| Multiple rows | DATA_PROPOSAL |
| "Add some sample data" | DATA_PROPOSAL |
| "Update all X to Y" | DATA_PROPOSAL |
| Uncertain | Prefer DATA_PROPOSAL (user reviews before applying) |

#### Frontend Rendering

| Operation | Visual Treatment |
|-----------|-----------------|
| `add` | Green tint, shown at top of table |
| `update` | Amber-highlighted cells, hover tooltip shows old value |
| `delete` | Red tint, strikethrough text, reduced opacity |

Each proposed row has a checkbox. Action bar above table shows Apply / Dismiss.

---

## Parsing Pipeline

**File:** `chat_stream_service.py` — `_parse_llm_response()` (line 1025)

### Input

The concatenated text from all `text` content blocks in the LLM response.

### Processing Order

1. **SUGGESTED_VALUES** — find marker, extract JSON array, remove from message
2. **SUGGESTED_ACTIONS** — find marker, extract JSON array, remove from message
3. **Custom payloads** — iterate registered LLM payloads for current page, find first marker match, extract JSON object, remove from message

### Output

```python
{
    "message": str,              # Clean text (all markers/JSON removed)
    "suggested_values": list | None,
    "suggested_actions": list | None,
    "custom_payload": dict | None  # {"type": "schema_proposal", "data": {...}}
}
```

### JSON Extraction

Both `_extract_json_object()` and `_extract_json_array()` use `_extract_balanced()`:

- Tracks brace/bracket depth
- Handles string escaping (`\"`)
- Returns the balanced substring from opening to matching closing character
- Returns `None` if no valid balanced structure found

### Error Handling

- Invalid JSON: logged as warning, element skipped (treated as not present)
- Missing marker: element not present in result
- Malformed payload: logged, skipped — plain text preserved

---

## Page Availability Matrix

Which elements are available on which pages:

| Element | tables_list | table_edit | table_view |
|---------|-------------|------------|------------|
| Plain text | Yes | Yes | Yes |
| SUGGESTED_VALUES | Yes | Yes | Yes |
| SUGGESTED_ACTIONS | Yes | Yes | Yes |
| SCHEMA_PROPOSAL | Yes | Yes | Yes |
| DATA_PROPOSAL | No | No | Yes |

---

## System Prompt Assembly

The system prompt that teaches the LLM this schema is assembled by `_build_system_prompt()` in 8 sections:

| # | Section | Contains |
|---|---------|----------|
| 1 | Global Preamble | Identity, user journey phases, role, style, proposal mechanics |
| 2 | Page Instructions | Page-specific persona and workflow guidance |
| 3 | Stream Instructions | Domain-specific context (currently unused) |
| 4 | Current Context | Table schema, sample rows, row count, filters, sort state |
| 5 | Payload Manifest | Summaries of payloads from conversation history |
| 6 | Capabilities | Tools list + STRUCTURED RESPONSES (payload instructions) + CLIENT ACTIONS |
| 7 | Help | Help system TOC and narratives |
| 8 | Format Rules | SUGGESTED_VALUES and SUGGESTED_ACTIONS format specs |

The payload output schemas (SCHEMA_PROPOSAL, DATA_PROPOSAL) are injected via section 6 (Capabilities → STRUCTURED RESPONSES), sourced from `PayloadType.llm_instructions`.

The suggestion formats (SUGGESTED_VALUES, SUGGESTED_ACTIONS) are injected via section 8 (Format Rules), from the `FORMAT_INSTRUCTIONS` constant.

---

## Extensibility

To add a new payload type:

1. Define the schema, instructions, parser, and summarizer in `backend/schemas/payloads.py`
2. Call `register_payload_type(PayloadType(..., source="llm", parse_marker="NEW_MARKER:", ...))`
3. Add the payload name to the relevant page config in `chat_page_config/{page}.py`
4. Build a frontend handler via `registerPayloadHandler()` in `frontend/src/lib/chat/payloads.ts`

See `_specs/technical/chat/adding-chat-to-page.md` for the full guide.
