# Proposal Components

How the frontend renders inline proposals from AI chat payloads.

---

## Types (types/)

### schemaProposal.ts — Types + apply logic for column-level changes

| Export | Purpose |
|---|---|
| `SchemaProposalData` | `{ mode, operations, table_name, sample_rows }` |
| `SchemaOperation` | `{ action: add\|modify\|remove\|reorder, ... }` |
| `applySchemaOperations()` | Applies ops to a column array |
| `generateColumnId()` | Creates `col_xxxxxxxx` IDs |
| `buildColumnNameMap()` | Column ID → name lookup |

### dataProposal.ts — Types for row-level changes

| Export | Purpose |
|---|---|
| `DataProposalData` | `{ reasoning, operations, research_log }` |
| `DataOperation` | `add\|update\|delete` discriminated union |
| `ResearchLogEntry` | Per-row enrichment trace |
| `ResearchStep` | Individual search/fetch/compute step |
| `OpResult` / `OpStatus` | Execution state per operation |

Note: `dataProposal.ts` is pure types. `schemaProposal.ts` has types + logic. The asymmetry exists because data proposal logic is stateful (lives in `useTableProposal`), while schema proposal logic (`applySchemaOperations`) is a pure function used by multiple callers (the hook, ProposedTablePreview, TableEditPage).

---

## Logic (hooks/)

### useTableProposal.ts — Single hook, one state slot, discriminated union

**Input:** `handlePayload({ type, data })` — called by the page's useEffect when a new message arrives with a `custom_payload`.

**Internal state:** `proposal = { kind: 'data', data } | { kind: 'schema', data } | null`

Mutual exclusion — setting one clears the other.

**Computed values:**

| Value | Purpose |
|---|---|
| `displayRows` | Real rows + proposed adds/updates merged in |
| `displayColumns` | Real columns + proposed schema changes |
| `rowMeta` | `Map<rowId, { action, opIndex, oldValues }>` |
| `columnMeta` | `Map<colId, { action, changes }>` |
| `proposalOverlay` | Discriminated union passed to DataTable |

**Return shape:**

| Field | Consumer |
|---|---|
| `dataBar` | ProposalActionBar |
| `schemaBar` | SchemaProposalStrip |
| `dismiss()` | Both strips |
| `proposalOverlay` | DataTable |
| `displayRows` / `displayColumns` | DataTable |

---

## UI Components (components/table/)

| Component | Role |
|---|---|
| `ProposalActionBar` | Strip above table for data proposals (checkboxes, apply/dismiss). Uses ProgressBar + ResearchLog from ProposalWidgets. |
| `SchemaProposalStrip` | Strip above table for schema update proposals (summary, apply/dismiss). |
| `ProposedTablePreview` | Full table preview on TablesListPage for create-mode proposals. Standalone — NOT wired through useTableProposal. |
| `ProposalWidgets` | Shared sub-components: `OpStatusIcon`, `ProgressBar`, `ResearchLog` (+ ResearchLogRow, ResearchStepRow, StrategyBadge, etc.) |
| `DataTable` | Receives `proposalOverlay` for row tinting (green=add, amber=update, red=delete), per-row checkboxes, and column highlights (green=new, amber=modified, red=removing). |

### Why ProposedTablePreview is standalone

Create-mode proposals have no existing table to overlay onto, so useTableProposal's display-merging logic doesn't apply. The create flow is fundamentally different: generate columns from operations, render sample data in a preview table, navigate to the new table on accept.

---

## Detection (page-level useEffects)

Each page has a `useEffect` that scans new messages using a `lastCheckedIndexRef` pattern:

| Page | Detects | Action |
|---|---|---|
| `TableViewPage` | `data_proposal`, `schema_proposal(update)` | `proposal.handlePayload()` → inline overlay |
| `TablesListPage` | `schema_proposal(create)` | `setActiveProposal()` → ProposedTablePreview |
| `TableEditPage` | `schema_proposal` | Auto-applies immediately (no preview) |

TableViewPage also has a separate useEffect (before `useTableProposal`) that scans for data-modifying tool calls (`create_row`, `update_row`, `delete_row`) and triggers `fetchRows()` to auto-refresh.

---

## Flow Summary

```
ChatContext stores custom_payload on ChatMessage
              │
              ▼
Page useEffect scans new messages via lastCheckedIndexRef
              │
              ├─ TableViewPage ──► useTableProposal.handlePayload()
              │                          │
              │                    ┌─────┴──────┐
              │                    ▼             ▼
              │              kind:'data'    kind:'schema'
              │                    │             │
              │                    ▼             ▼
              │           ProposalActionBar  SchemaProposalStrip
              │                    │             │
              │                    └──────┬──────┘
              │                           ▼
              │                    DataTable (proposalOverlay)
              │
              ├─ TablesListPage ──► setActiveProposal()
              │                          │
              │                          ▼
              │                   ProposedTablePreview
              │
              └─ TableEditPage ──► auto-apply + save
```
