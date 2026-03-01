# Inline Proposals — Sequence of Operations

This document describes how all three proposal types work end-to-end: what the LLM returns, what the frontend shows, and what happens when the user accepts or dismisses.

---

## Overview

All proposals follow the same pattern:
1. User asks the AI something in chat
2. LLM emits a payload (JSON block) alongside its **text response**
3. Frontend intercepts the payload and renders the proposed changes **inline** — directly in the table or in the main content area
4. User reviews, optionally unchecks items, then clicks **Apply** or **Dismiss**
5. On accept: changes are committed to the database, UI refreshes, chat is notified
6. On dismiss: proposal UI clears, no changes made

### Critical: The LLM's text response must guide the user

The payload alone is not enough. The LLM's text response is the user's primary guide to understanding what just happened and what to do next. Every proposal response **must**:

1. **Describe what was proposed** — briefly summarize the changes ("I've designed a 5-column table for tracking Italian restaurants" or "I'm proposing to add a Priority column and remove the old Status column")
2. **Explain where to look** — tell the user where the changes are visible ("You can see the proposed table with sample data in the main area" or "The proposed changes are highlighted in the table — new rows at the top in green, updates in amber")
3. **Explain the controls** — tell the user what they can do ("You can uncheck any columns you don't need" or "Uncheck any rows you don't want")
4. **Name the action buttons** — explicitly say "Click **Create Table** to build it or **Dismiss** to start over" / "Click **Apply** to execute or **Dismiss** to cancel"
5. **Not ask permission** — never say "Would you like me to proceed?" or "Ready to continue?" — the user acts on the inline controls, not by typing

Without this guidance, users see a proposal appear in the table but don't know what to do with it. The text response is the bridge between "AI did something" and "user knows how to act."

---

## 1. Create Table Proposal

**Page:** TablesListPage
**Payload type:** `schema_proposal` with `mode: "create"`
**LLM tool:** Emits `SCHEMA_PROPOSAL:` JSON block

### 1.1 What the LLM returns

```json
{
  "mode": "create",
  "table_name": "Italian Restaurants in Chicago",
  "table_description": "A curated list of Italian restaurants...",
  "reasoning": "Based on your request, I've designed a table...",
  "operations": [
    { "action": "add", "column": { "name": "Name", "type": "text", "required": true } },
    { "action": "add", "column": { "name": "Neighborhood", "type": "select", "options": ["River North", "Lincoln Park", ...], "filterDisplay": "tab" } },
    { "action": "add", "column": { "name": "Rating", "type": "number" } },
    { "action": "add", "column": { "name": "Price Range", "type": "select", "options": ["$", "$$", "$$$", "$$$$"] } }
  ],
  "sample_rows": [
    { "Name": "RPM Italian", "Neighborhood": "River North", "Rating": 4.5, "Price Range": "$$$" },
    { "Name": "Monteverde", "Neighborhood": "West Loop", "Rating": 4.7, "Price Range": "$$$" }
  ]
}
```

The LLM's text response should say something like:
> "I've designed a table for Italian restaurants in Chicago. You can see a preview of the table with sample data. Uncheck any columns you don't need, then click **Create Table** to build it, or **Dismiss** to start over."

### 1.2 What the frontend shows

The main content area (replacing the tables grid) shows `ProposedTablePreview`:
- Table name and description in a header
- A rendered table with the proposed columns as headers (with type badges)
- Sample data rows with staggered fade-in animation
- "Include sample data" checkbox at the bottom
- **Dismiss** and **Create Table** buttons

The chat tray remains visible on the left with the AI's message.

### 1.3 Acceptance flow

When user clicks **Create Table**:
1. `applySchemaOperations([], operations)` → generates column definitions with IDs
2. `createTable({ name, description, columns })` → API call creates the table
3. If "Include sample data" is checked: `createRow()` for each sample row (column names mapped to IDs)
4. `updateContext()` → set active table in chat context
5. `sendMessage('[User accepted and created "Table Name"...]')` → notify chat
6. `navigate('/tables/{id}')` → go to the new table's view page

### 1.4 Dismissal flow

User clicks **Dismiss** → `setActiveProposal(null)` → tables grid reappears, proposal is gone.

---

## 2. Update Schema Proposal

**Pages:** TableViewPage, TableEditPage
**Payload type:** `schema_proposal` with `mode: "update"`
**LLM tool:** Emits `SCHEMA_PROPOSAL:` JSON block

### 2.1 What the LLM returns

```json
{
  "mode": "update",
  "reasoning": "Adding a Priority column with P0-P3 options...",
  "table_name": null,
  "table_description": null,
  "operations": [
    { "action": "add", "column": { "name": "Priority", "type": "select", "options": ["P0", "P1", "P2", "P3"], "filterDisplay": "tab" }, "after_column_id": "col_abc123" },
    { "action": "modify", "column_id": "col_def456", "changes": { "required": true } },
    { "action": "remove", "column_id": "col_ghi789" }
  ]
}
```

The LLM's text response should say something like:
> "I've proposed 3 schema changes. You can review them highlighted in the table — added columns in green, removed in red, modified in amber. Uncheck any you don't want, then click **Apply** or **Dismiss**."

### 2.2 What the frontend shows

The table itself IS the proposal view. There is no separate card or operation list — the user sees the proposed changes directly in context with their existing data.

**A thin control strip** appears above the table (between filter bar and DataTable):
- Brief label: "Schema changes proposed" with a summary (e.g., "1 new column, 1 removed")
- **Dismiss** and **Apply** buttons
- That's it — no operation list, no checkboxes in the strip. The table below tells the full story.

**Column headers — added columns:**
- Appear in their proposed position (respecting `after_column_id`)
- Entire column (header + all cells) has a **green tint** background
- Green left border on the header cell
- Header shows the column name + type badge (e.g., "Priority · select")
- All data cells below show "—" placeholder (no data exists yet)

**Column headers — removed columns:**
- Entire column (header + all cells) has a **red tint** background with reduced opacity
- Red left border on the header cell
- Header text has **strikethrough**
- A small warning label below the column name: **"Data will be lost"** in red text
- Data cells show the existing values with strikethrough and reduced opacity — the user can see exactly what data they're about to lose

**Column headers — modified columns:**
- Header has an **amber tint** background
- Amber left border on the header cell
- A subtitle below the column name showing what changed: e.g., "→ required" or "→ type: number" or "→ renamed: New Name"
- Data cells render normally (modifications don't affect existing data)

**Reorder operations:** Not shown visually — they just affect the column position in the rendered table. The reordered column appears in its new position.

**Rows:** All existing data rows render normally. They just gain/lose columns based on the proposal. This lets the user see the full impact — "if I add this column, here's what my table will look like; if I remove that column, here's the data I'll lose."

### 2.3 Acceptance flow (TableViewPage)

When user clicks **Apply**:
1. `applySchemaOperations(table.columns, operations)` → new column definitions
2. `updateTable(tableId, { columns, name?, description? })` → API call
3. `setTable(updated)` → update local state, table re-renders with real schema
4. `fetchRows()` → refresh rows (removed columns are gone from data)
5. `showSuccessToast('Schema updated')`
6. `sendMessage('[User accepted the schema proposal and applied changes to "Table Name".]')` → notify chat
7. Proposal state clears, table shows the real updated schema

### 2.4 Acceptance flow (TableEditPage)

Same as TableViewPage, but:
- Updates the editing form state (`setColumns`, `setName`, `setDescription`)
- Auto-saves via `updateTable()`
- No chat callback message

### 2.5 Dismissal flow

User clicks **Dismiss** → proposal state clears → table returns to showing its current real schema. No changes made, no data lost.

---

## 3. Data Proposal

**Page:** TableViewPage
**Payload type:** `data_proposal`
**LLM tool:** Emits `DATA_PROPOSAL:` JSON block (or emitted by `enrich_column` tool)

### 3.1 What the LLM returns

```json
{
  "reasoning": "Adding 3 sample bugs and updating the status of row 5...",
  "operations": [
    { "action": "add", "data": { "Name": "Login timeout", "Status": "Open", "Priority": "P1" } },
    { "action": "add", "data": { "Name": "CSS misalignment", "Status": "Open", "Priority": "P2" } },
    { "action": "update", "row_id": 5, "changes": { "Status": "Resolved" } },
    { "action": "delete", "row_id": 12 }
  ],
  "research_log": [...]
}
```

The LLM's text response should say something like:
> "I've proposed 2 new rows, 1 update, and 1 deletion. You can review the changes highlighted in the table — new rows at the top in green, updates in amber, deletions in red. Uncheck any you don't want, then click **Apply** or **Dismiss**."

### 3.2 What the frontend shows

A `ProposalActionBar` appears between the filter bar and the DataTable. The table itself shows proposed changes inline:

**Added rows:** Virtual rows prepended at the top of the table with:
- Green tint background (`bg-green-50`)
- Green left border (`border-l-4 border-l-green-400`)
- Negative IDs (not yet in database)
- Proposal checkbox in the selection column

**Updated rows:** Existing rows patched with new values:
- Amber left border (`border-l-4 border-l-amber-400`)
- Changed cells highlighted with amber background (`bg-amber-100/60`)
- Hover tooltip on changed cells: "Was: {old value}"
- Proposal checkbox in the selection column

**Deleted rows:** Existing rows marked for deletion:
- Red tint background (`bg-red-50`) with reduced opacity (`opacity-60`)
- Red left border (`border-l-4 border-l-red-400`)
- Strikethrough text on all cells
- Proposal checkbox in the selection column

**Non-proposed rows:** Render normally with their standard selection checkboxes.

**Action bar:**
- "AI Proposed Changes" title with summary counts
- Select All / Deselect All
- **Dismiss** and **Apply N of M** buttons
- Collapsible research log (if present)

**During execution (Apply clicked):**
- Per-row status icons replace checkboxes: spinner → checkmark → X
- Progress bar in the action bar
- Checkboxes disabled

**After execution completes:**
- Action bar shows "All N changes applied" or "Applied X of Y — Z failed"
- **Done** button
- Table shows real refreshed data (no more virtual rows or patches)

### 3.3 Acceptance flow

When user clicks **Apply**:
1. For each checked operation, sequentially:
   - Set operation status to "running" (spinner shows in row)
   - Execute: `createRow()`, `updateRow()`, or `deleteRow()` via API
   - Set status to "success" (checkmark) or "error" (X icon)
2. After all operations complete: `fetchRows()` → refresh table with real data
3. Phase transitions to "done" — table shows real data, action bar shows summary
4. User clicks **Done**:
   - `sendMessage('[User accepted the data proposal and applied all changes.]')` → notify chat
   - All proposal state clears, table returns to normal

### 3.4 Dismissal flow

User clicks **Dismiss** → all proposal state clears → table shows original unmodified data.

---

## State Management Summary

| Proposal Type | Hook / State | Controls | Where Inline Changes Show |
|---------------|-------------|----------|--------------------------|
| Create table | `activeProposal` state in TablesListPage | Built into `ProposedTablePreview` | Main content area (replaces table grid) |
| Update schema | `useInlineSchemaProposal` hook | Thin control strip (Apply/Dismiss) | Table column headers + full columns |
| Data changes | `useInlineProposal` hook | `ProposalActionBar` | Table rows and cells |

---

## Chat Integration Rules

All three flows share these rules:

1. **Payload interception:** `onPayloadReceived` returns `true` to suppress the floating chat panel card
2. **After acceptance:** `sendMessage()` notifies the chat that the user acted, so the AI can continue the conversation
3. **After dismissal:** No chat notification (the proposal just disappears)
4. **One proposal at a time:** Only one proposal can be active. A new proposal replaces any existing one.
5. **Cell editing disabled:** While any proposal is active, inline cell editing is disabled
6. **No stacking:** A data proposal and schema proposal cannot both be active simultaneously

---

## Implementation Status

| Proposal Type | Status | Key Files |
|---------------|--------|-----------|
| Create table | **Done** (ProposedTablePreview) | `ProposedTablePreview.tsx`, `TablesListPage.tsx` |
| Update schema | **Not started** — still renders as card in chat panel | Needs: `useInlineSchemaProposal.ts`, thin control strip, DataTable column rendering changes |
| Data changes | **Done** (inline in table) | `useInlineProposal.ts`, `ProposalActionBar.tsx`, `DataTable.tsx`, `TableViewPage.tsx` |
