# Data Mutation Paths: How the AI Changes Tables

This document maps every path through which the AI can modify a user's table — schema or data — and how each path is governed by user consent.

---

## Design Principle: All Changes Are Proposals

ALL data and schema changes go through proposals. The AI never writes directly to the table. The user always reviews proposed changes (highlighted in the table) and clicks **Accept** or **Dismiss**.

While a proposal is active, the chat input is locked — the user must resolve the proposal before sending another message. This eliminates proposal collision, active-proposal prompt hacks, and the entire class of "what if the user chats during a proposal" edge cases.

---

## Mutation Paths

### Path A: LLM-emitted DATA_PROPOSAL

**For:** All row changes — adds, updates, deletes (single or bulk).

The LLM writes `DATA_PROPOSAL: {...}` in its response. The backend parser extracts it into `custom_payload`. The frontend renders proposed rows inline in the table with green/amber/red highlights. The user clicks Accept or Dismiss in the chat panel.

Examples:
- "Add Acme Corp as a customer" → DATA_PROPOSAL with 1 add
- "Add 5 sample bugs" → DATA_PROPOSAL with 5 adds
- "Delete row 12" → DATA_PROPOSAL with 1 delete
- "Mark all Resolved as Closed" → DATA_PROPOSAL with update operations

### Path B: LLM-emitted SCHEMA_PROPOSAL

**For:** All column/schema changes — add, remove, modify, reorder columns.

Same mechanism as Path A but for schema. Two modes: `create` (new table on tables_list page) and `update` (modify existing table on table_view/table_edit pages).

### Path C: enrich_column tool → DATA_PROPOSAL

**For:** AI-powered column enrichment (lookup, research, computation).

The LLM calls `enrich_column` as a tool. The tool runs strategy-based enrichment and yields a `data_proposal` payload. The frontend treats it identically to Path A.

### Direct data tools (REMOVED)

`create_row`, `update_row`, `delete_row` are **not registered** on any page. They exist in the codebase for internal use (the Apply flow calls them via the API) but the LLM cannot invoke them. This eliminates:
- The "single vs bulk" heuristic ambiguity
- The risk of unapproved data changes
- The need for prompt instructions about when to use direct tools vs proposals
- The inconsistency where some changes need approval and others don't

---

## UX During Proposals

### Chat panel (left)
- **Recording light:** Amber pulsing indicator with proposal description
- **Accept/Dismiss buttons** replace the text input
- Chat input is locked — user must resolve the proposal first

### Data table (right)
- Proposed changes highlighted inline (green for adds, amber for updates, red for deletes)
- Checkboxes per row for selective acceptance
- ProposalActionBar / SchemaProposalStrip for detailed controls

### Proposal lifecycle
1. AI sends response with proposal payload
2. ChatContext detects proposal, sets `pendingProposal`
3. Chat input locks, Accept/Dismiss buttons appear
4. Page component bridges `pendingProposal` into local proposal UI (highlights, action bar)
5. User clicks Accept → page applies changes → calls `resolveProposal()` → chat unlocks
6. User clicks Dismiss → page clears proposal → calls `resolveProposal()` → chat unlocks

---

## Prompt Coverage

The system prompt addresses proposals in three places:

1. **Global preamble** (`chat_stream_service.py`): "How Proposals Work" section explains the layout, highlighting, and locked-input behavior.

2. **Payload instructions** (`payloads.py`): `SCHEMA_PROPOSAL_INSTRUCTIONS` and `DATA_PROPOSAL_INSTRUCTIONS` define the format, rules, and examples.

3. **Page personas** (`table_view.py`, `tables_list.py`, `table_edit.py`): Page-specific guidance on when to use each proposal type and strategy selection for enrich_column.

No active-proposal warnings are needed in the prompt since the user literally cannot chat while a proposal is pending.
