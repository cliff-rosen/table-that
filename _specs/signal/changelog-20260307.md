# Changes — March 6-7, 2026

## 1. Proposal Lifecycle Overhaul (biggest change)

**What:** Moved proposal ownership from page components into ChatContext. Chat input is now **locked** during proposals — replaced with Accept/Dismiss buttons.

**Why:** Eliminates the entire class of "what if the user chats during a proposal" bugs. No more proposal collision, no more prompt hacks to warn about active proposals.

**Where to look:**
- `frontend/src/context/ChatContext.tsx` — new `pendingProposal` state, `resolveProposal()`, proposal detection on message complete
- `frontend/src/components/chat/ChatTray.tsx` — bottom area swaps between text input and amber Accept/Dismiss bar
- `frontend/src/pages/TableViewPage.tsx` — simplified: removed payload scanning effects, bridges ChatContext proposal into `useTableProposal`
- `frontend/src/pages/TablesListPage.tsx` — simplified: derives `activeProposal` from ChatContext instead of scanning messages

## 2. Direct Data Tools Removed from LLM

**What:** `create_row`, `update_row`, `delete_row` set to `is_global=False`. The LLM can no longer call them. ALL data changes now go through proposals.

**Where to look:**
- `backend/tools/builtin/table_data.py` — `is_global=False` on all three tools
- `backend/services/chat_page_config/table_view.py` — tools list no longer includes them; persona rewritten around "proposals only"

## 3. Column ID Bug Fix

**What:** LLM was fabricating column IDs like `col_name` instead of using real ones like `col_ixvgowhd`. Two causes: sample data used column names as keys, and the example IDs in instructions looked like fabricated names.

**Where to look:**
- `backend/services/chat_page_config/table_view.py` — sample data and selected rows now use column IDs as keys
- `backend/tools/builtin/table_data.py` — `get_rows` and `search_rows` tool results now use column IDs as keys
- `backend/schemas/payloads.py` — DATA_PROPOSAL instructions: realistic example IDs, explicit "do NOT fabricate" warning
- `backend/routers/tables.py` — defensive `_remap_column_keys()` in create_row and update_row endpoints

## 4. Prompt Cleanup

**What:** Removed active-proposal warnings and direct-tool guidance from all prompts (no longer needed). "Apply" renamed to "Accept" throughout. Suggestion suppression reinforced.

**Where to look:**
- `backend/services/chat_stream_service.py` — global preamble and FORMAT_INSTRUCTIONS
- `backend/services/chat_page_config/table_view.py` — persona rewrite
- `backend/services/chat_page_config/tables_list.py` — removed proposal warning from context builder

## 5. Diagnostics UI Refactor (separate effort)

**What:** Extracted shared tool call rendering into reusable components. Tightened spacing. Added `ToolCallDetail`, `ToolCallList`, `ToolCallShared`.

**Where to look:**
- `frontend/src/components/chat/diagnostics/` — new files: `ToolCallDetail.tsx`, `ToolCallList.tsx`, `ToolCallShared.tsx`
- `frontend/src/components/chat/ToolResultCard.tsx` and `DiagnosticsPanel.tsx` — slimmed down

## 6. New Spec Docs

- `_specs/product/TableThat One Sheet.md` — product positioning document
- `_specs/technical/architecture/data-mutation-paths.md` — maps all AI-to-table mutation paths
- `_specs/technical/architecture/agent-trace-data-model.md` — documents the trace/diagnostics data model

---

## Testing Priorities

Changes 1-3 are the highest risk. The core flow to test: ask the AI to add rows, verify the chat input locks, verify Accept/Dismiss works, verify column IDs in the proposal are correct and data appears in the table.
