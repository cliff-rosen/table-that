# table.that v1 Product Specification

## Overview

table.that is a modern data table builder where users define schemas, manage structured data, and interact with an AI chat assistant that understands their tables. The chat assistant is not a bolt-on — it is the primary power interface. Every significant operation flows through chat as a reviewable proposal.

---

## 1. Table Management

### 1.1 Table CRUD
- **Create table**: Name, description, column definitions
- **List tables**: Card grid with name, description, column count, row count, last updated
- **Edit table**: Modify name, description, column schema (via editor UI or chat proposal)
- **Delete table**: With confirmation, cascade deletes all rows

### 1.2 Column Types (v1)
| Type | Storage | Display | Filter | Sort |
|------|---------|---------|--------|------|
| `text` | string | Plain text, truncated | Full-text search | Alphabetical |
| `number` | float/int | Right-aligned, tabular nums | — | Numeric |
| `date` | ISO string | Formatted date | — | Chronological |
| `boolean` | bool | Yes/No dot indicator | Toggle chips (Yes/No/All) | Boolean |
| `select` | string | Badge | Multi-select chip filter | Alphabetical |

### 1.3 Column Definition Fields
- `id`: Stable `col_xxxx` identifier (survives renames)
- `name`: Display name
- `type`: One of the five types above
- `required`: Boolean
- `default`: Optional default value
- `options`: String array (select type only)

---

## 2. Data View (Table View Page)

### 2.1 Data Table
- Spreadsheet-style grid with column headers
- Click-to-edit inline editing (type-appropriate editors)
- Row selection checkboxes with bulk operations
- Column sorting (click header to cycle: asc → desc → none)

### 2.2 Toolbar
- **Search**: Full-text search across text columns
- **Add Record**: Opens form modal
- **Delete Selected**: Bulk delete with confirmation
- **Import CSV**: Upload CSV into existing table
- **Export CSV**: Download current data (respects active filters)

### 2.3 Filter Bar
Positioned between toolbar and data table. Always visible.

- **Boolean columns**: Three-state toggle chip per column — All | Yes | No
- **Select columns**: Multi-select dropdown chip per column — shows options with checkboxes
- Chips always visible (not hidden behind a menu)
- Active filters highlighted; inactive muted
- Filters AND-combined
- Row count updates to reflect filtered results
- Export and search respect active filters

### 2.4 Chat Panel
- Chat tray on the left side, open by default
- Toggle button in page header
- Chat receives table context: schema, row count, sample rows, active filters/sort, value distributions
- Auto-refreshes data when chat executes data-modifying tools or user applies a data proposal

### 2.5 Navigation
- "Edit Schema" button in header → schema editor
- Back to tables list via TopBar

---

## 3. Schema Editor (Table Edit Page)

### 3.1 Schema Editor UI
- Table name and description fields
- Column list with per-column editing: name, type, required, options
- Reorder columns (up/down)
- Add/remove columns
- Save bar with unsaved changes indicator

### 3.2 Chat Panel
- Chat tray on the left, open by default
- Chat receives schema context: table name, description, columns with IDs, row count
- **Primary power interface** — schema changes flow through proposals

### 3.3 Navigation
- "View Data" button → data view
- Back to tables list via TopBar

---

## 4. Chat Tools (Direct Actions)

Tools the LLM calls directly for simple, immediate, single-item operations.

### 4.1 Tools available on table_view page

| Tool | Description | Parameters |
|------|-------------|------------|
| `describe_table` | Schema + stats summary: row count, value distributions for select/boolean columns | (none) |
| `get_rows` | Retrieve rows by range. Returns row IDs and data. | `offset (default 0), limit (default 50, max 200)` |
| `search_rows` | Full-text search across text columns | `query, limit?` |
| `create_row` | Add a single record | `column_values: {name: value, ...}` |
| `update_row` | Update a record by ID | `row_id, column_values: {name: value, ...}` |
| `delete_row` | Delete a record by ID | `row_id` |
| `get_help` | Retrieve help documentation | `category?, topic?` |

### 4.2 Tools available on table_edit page

| Tool | Description | Parameters |
|------|-------------|------------|
| `describe_table` | Current schema + stats | (none) |
| `get_rows` | Retrieve rows by range | `offset, limit` |
| `get_help` | Retrieve help documentation | `category?, topic?` |

### 4.3 Tool behavior
- Tools use column **names** (not IDs) — mapping happens internally
- `describe_table` returns schema, total row count, value distributions for select/boolean columns
- `get_rows` returns paginated rows. The LLM uses this to see data beyond the 20-row sample in the context. It can call this multiple times to scan the full table.
- `search_rows` searches text columns and returns matching rows
- `create_row` / `update_row` validate required fields and types
- Single-row tools (`create_row`, `update_row`, `delete_row`) are for **trivially simple, single-item operations only**. Anything involving multiple items must go through a proposal payload.

---

## 5. Chat Payloads (Proposal System)

Payloads are structured data the LLM emits in its response. They render as interactive cards the user can review, edit, and accept or reject. This is the core UX pattern of table.that.

**Two payload types:**

### 5.1 Schema Proposal (`schema_proposal`)

**Marker:** `SCHEMA_PROPOSAL:`
**Pages:** `table_edit`, `table_view`

**When the LLM uses this:** Any request to change the table structure — adding columns, removing columns, changing types, renaming, reordering, or proposing a whole new schema.

**Payload structure:**
```json
{
  "reasoning": "Why these changes are proposed",
  "table_name": "Optional new name",
  "table_description": "Optional new description",
  "operations": [
    {
      "action": "add",
      "column": { "name": "Status", "type": "select", "required": false, "options": ["A", "B"] },
      "after_column_id": "col_xxx"
    },
    {
      "action": "modify",
      "column_id": "col_abc",
      "changes": { "name": "New Name", "required": true }
    },
    {
      "action": "remove",
      "column_id": "col_xyz"
    },
    {
      "action": "reorder",
      "column_id": "col_abc",
      "position": 0
    }
  ]
}
```

**Frontend card (SchemaProposalCard):**
- Each operation is a line item with a checkbox
- Color-coded: green=add, blue=modify, red=remove, gray=reorder
- Modify shows a diff (old → new for each changed field)
- User can uncheck items, expand to edit fields, override values
- "Apply Selected" computes the final column array and calls `PUT /api/tables/{id}`
- On success: schema editor / data view refreshes

### 5.2 Data Proposal (`data_proposal`)

**Marker:** `DATA_PROPOSAL:`
**Pages:** `table_view`

**When the LLM uses this:** Any request involving multiple row changes — bulk additions, bulk updates, bulk deletes, or any combination. Also used when the user asks the LLM to populate the table, generate sample data, clean up data, or transform values.

The LLM uses direct tools (`create_row`, `update_row`, `delete_row`) only for trivially simple single-row operations explicitly requested. Everything else goes through `DATA_PROPOSAL`.

**Payload structure:**
```json
{
  "reasoning": "Why these changes are proposed",
  "operations": [
    {
      "action": "add",
      "data": { "Company": "Acme Corp", "Position": "Engineer", "Status": "Applied" }
    },
    {
      "action": "update",
      "row_id": 42,
      "changes": { "Status": "Interview", "Heard Back": true }
    },
    {
      "action": "delete",
      "row_id": 17
    }
  ]
}
```

**Operation types:**
| Action | Fields | Description |
|--------|--------|-------------|
| `add` | `data: {column_name: value}` | Insert a new row |
| `update` | `row_id`, `changes: {column_name: value}` | Modify specific fields in a row |
| `delete` | `row_id` | Delete a row |

**Frontend card (DataProposalCard):**
- Renders as a mini data table showing all proposed changes
- Grouped into sections: Additions, Updates, Deletions
- **Additions**: Show the full row data in a green-tinted row
- **Updates**: Show the row with changed cells highlighted (old → new). Unchanged cells shown muted for context.
- **Deletions**: Show the row data in a red-tinted strikethrough row
- Each row has a checkbox — user can select/deselect individual operations
- User can click into cells on add/update rows to edit values before accepting
- Summary line: "3 additions, 2 updates, 1 deletion"
- "Apply Selected" button executes checked operations one by one:
  - Adds call `POST /api/tables/{id}/rows`
  - Updates call `PUT /api/tables/{id}/rows/{row_id}`
  - Deletes call `DELETE /api/tables/{id}/rows/{row_id}`
- Progress tracking: each row shows pending → running → done/error
- On completion: data view auto-refreshes

**Key difference from schema proposal:** Data proposals execute as individual API calls per row (with progress tracking), not as a single atomic call. This lets some operations succeed even if others fail, and gives the user real-time progress.

---

## 6. LLM Decision Rules

The persona instructs the LLM when to use tools vs proposals:

| Situation | Mechanism |
|-----------|-----------|
| User says "add a row for Acme Corp" | Direct tool: `create_row` |
| User says "update row 42 status to Interview" | Direct tool: `update_row` |
| User says "add 10 sample companies" | Payload: `DATA_PROPOSAL` (10 add operations) |
| User says "mark all Applied rows as Rejected" | Payload: `DATA_PROPOSAL` (N update operations) |
| User says "delete all rows where Status is Withdrawn" | Payload: `DATA_PROPOSAL` (N delete operations) |
| User says "clean up the company names" | Payload: `DATA_PROPOSAL` (N update operations) |
| User says "add a Status column" | Payload: `SCHEMA_PROPOSAL` (1 add operation) |
| User says "redesign this schema for a CRM" | Payload: `SCHEMA_PROPOSAL` (full replacement) |
| User says "make Company required" | Payload: `SCHEMA_PROPOSAL` (1 modify operation) |
| User says "how do I add a filter?" | Direct tool: `get_help` |

**The rule is simple:** One row, unambiguous → tool. Everything else → proposal.

---

## 7. Chat Persona & Context

### 7.1 Global Preamble
```
You are the AI assistant for table.that, a modern data table builder.
You help users manage their data tables — creating schemas, adding and
editing records, filtering and analyzing data, and suggesting improvements.

Three types of interactions:
1. How-to questions → Use get_help tool
2. Single-row data operations → Use data tools directly
3. Schema changes or multi-row data operations → ALWAYS use proposals
   (SCHEMA_PROPOSAL or DATA_PROPOSAL)
```

### 7.2 Table View Persona
```
The user is viewing their data table. You can:
- Add/update/delete a single record using tools (only for trivially simple requests)
- Search and describe the data
- Propose bulk data changes using DATA_PROPOSAL
- Propose schema changes using SCHEMA_PROPOSAL

RULES:
- For ANY operation involving 2+ rows: use DATA_PROPOSAL
- For ANY schema change: use SCHEMA_PROPOSAL
- Use column NAMES (not IDs) in proposals and conversation
- DATA_PROPOSAL operations use column names; the frontend maps to IDs
- Include reasoning in every proposal
```

### 7.3 Table Edit Persona
```
The user is editing their table schema. You are a powerful schema designer.
- Propose new schemas, modify columns, suggest improvements
- ALWAYS use SCHEMA_PROPOSAL — never describe changes in plain text
- For select columns, suggest sensible options
- Consider data implications when changing types
- When proposing a full schema, include table name and description
- Reference existing columns by their IDs from the context
```

### 7.4 Context Builders

**table_view context** (sent every turn):
- Table name, description, column schema (with IDs)
- Total row count
- First 20 rows as sample: `[{id, data: {col_name: value}}]`
- Active sort and filter state
- Value distributions for select/boolean columns (e.g., `Status: {Applied: 12, Interview: 5, ...}`)
- Note to LLM: "You see 20 sample rows. Use get_rows(offset, limit) to access more. Use describe_table for full stats."

**table_edit context** (sent every turn):
- Table name, description
- Full column schema with IDs, types, required, options
- Row count (to inform about data impact of changes)
- Note to LLM: "Use get_rows to inspect existing data before proposing type changes."

---

## 8. Payload Lifecycle & State

### 8.1 Payload states
| State | Meaning | Button display |
|-------|---------|----------------|
| `pending` | Just received, not yet reviewed | "View Proposal" |
| `applied` | All selected items applied successfully | "✓ Applied" |
| `partial` | Some items applied, some skipped | "✓ Partially Applied" |
| `rejected` | User clicked Cancel | "✗ Rejected" |
| `error` | Apply failed | "⚠ Failed" |

### 8.2 Payload manifest (what the LLM sees)
On subsequent turns, the system prompt includes a summary of prior payloads:
```
Previous proposals in this conversation:
- p_a8f3c2 (schema_proposal): "6 additions, rename table" — APPLIED
- p_b9c4d3 (data_proposal): "10 additions" — APPLIED
- p_c0d1e2 (data_proposal): "3 updates, 1 deletion" — PENDING (not yet reviewed)
```

This helps the LLM understand what has been accepted and what hasn't.

---

## 9. Help Content

YAML-based. TOC injected into system prompt. Full content via `get_help` tool.

### 9.1 Categories and Topics

**general**
- `getting-started`: What table.that is, navigation, creating your first table
- `column-types`: Each type explained with examples and when to use it

**tables**
- `creating-tables`: Creating via UI and via chat
- `editing-schema`: Modifying columns via editor and via chat proposals
- `importing-data`: CSV import, auto-detect schema
- `exporting-data`: CSV export, filtered exports

**data**
- `adding-records`: Via form, inline editing, or chat
- `editing-records`: Inline click-to-edit
- `filtering`: Boolean/select filter chips, text search
- `sorting`: Column header sorting
- `bulk-operations`: Row selection, bulk delete, chat bulk proposals

**chat**
- `overview`: What chat can do, tools vs proposals
- `schema-proposals`: How to ask for schema changes, reviewing proposals
- `data-proposals`: How to ask for bulk data operations, reviewing proposals
- `single-operations`: Quick single-row adds/edits/deletes via chat

### 9.2 Principles
- Summaries are concise (in TOC, read by LLM every turn)
- Full content has examples (retrieved on demand via get_help)
- Help teaches the LLM what it can do — the LLM reads help to decide how to respond

---

## 10. Filter Bar Detail

### 10.1 Layout
```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar: [Search...] | 5 cols, 42 rows | [+ Add] [Import] ... │
├─────────────────────────────────────────────────────────────────┤
│ Filters: [Status ▾: All]  [Active ▾: All]  [Heard Back: All]  │
├─────────────────────────────────────────────────────────────────┤
│ Data table...                                                   │
```

### 10.2 Boolean filter chip
Three-state toggle button:
- **All** (muted) → click → **Yes** (highlighted green) → click → **No** (highlighted red) → click → **All**
- Shows column name + current state

### 10.3 Select filter chip
Dropdown with checkboxes:
- Click chip → dropdown shows all options with checkboxes + "All" toggle
- When all checked (or none): chip shows "All" (muted)
- When some checked: chip shows selected count or values, highlighted blue
- Clicking "All" toggles all on/off

### 10.4 Filter state
```typescript
interface FilterState {
  column_id: string;
  type: 'boolean' | 'select';
  // For boolean: value is true, false, or null (all)
  // For select: values is string[] of selected options (empty = all)
  value?: boolean | null;
  values?: string[];
}
```

Filters sent to backend as query params on the list rows endpoint.

---

## 11. Technical Architecture

### 11.1 Backend Components
| File | Purpose |
|------|---------|
| `schemas/payloads.py` | Register `schema_proposal` and `data_proposal` payload types with markers, parsers, summarizers |
| `tools/builtin/table_data.py` | `create_row`, `update_row`, `delete_row`, `search_rows`, `describe_table` tools |
| `services/chat_page_config/table_view.py` | Page config: context builder, tools, payloads, persona |
| `services/chat_page_config/table_edit.py` | Page config: context builder, tools, payloads, persona |
| `help/general.yaml` | Help: getting-started, column-types |
| `help/tables.yaml` | Help: creating, editing, importing, exporting |
| `help/data.yaml` | Help: records, filtering, sorting, bulk ops |
| `help/chat.yaml` | Help: overview, schema proposals, data proposals |

### 11.2 Frontend Components
| File | Purpose |
|------|---------|
| `components/table/FilterBar.tsx` | Boolean toggle chips + select dropdown chips |
| `components/chat/SchemaProposalCard.tsx` | Interactive schema change review UI |
| `components/chat/DataProposalCard.tsx` | Interactive bulk data change review UI |
| `lib/chat/payloads.ts` | Register payload handlers |

### 11.3 API Endpoints Used by Proposals
Schema proposals use the existing endpoint:
- `PUT /api/tables/{id}` — accepts full column array + name + description

Data proposals use existing row endpoints:
- `POST /api/tables/{id}/rows` — create row
- `PUT /api/tables/{id}/rows/{row_id}` — update row
- `DELETE /api/tables/{id}/rows/{row_id}` — delete row

No new backend endpoints needed for proposals. The frontend executor maps proposal operations to existing API calls.
