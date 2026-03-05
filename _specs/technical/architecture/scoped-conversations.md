# Scoped Conversations — Design & Lifecycle

Each conversation is bound to an entity via a `scope` column. The backend owns all scope logic — the frontend never constructs or passes scope strings.

---

## Scope Values

| Scope | Meaning |
|---|---|
| `"tables_list"` | Conversation on the Tables List page (table creation flow) |
| `"table:<id>"` | Conversation bound to a specific table |

---

## Scope Derivation

Single source of truth: `derive_scope()` in `services/chat_service.py`.

Input: `current_page` + `table_id` from context.

| current_page | table_id | Derived scope |
|---|---|---|
| `tables_list` | — | `"tables_list"` |
| `table_view` | 42 | `"table:42"` |
| `table_edit` | 42 | `"table:42"` |

---

## Three Operations

### 1. Conversation Loading (on page open)

**Trigger:** ChatTray opens or user navigates to a different page/table.

**Endpoint:** `GET /api/chats/by-context?current_page=...&table_id=...`

**Service method:** `ChatService.get_or_create_for_context()`

**Steps:**

1. Derive scope from `current_page` + `table_id` → e.g. `"table:42"`
2. Query: `WHERE user_id = ? AND app = ? AND scope = "table:42"` (most recent)
3. **Found** → return it
4. **Not found** → create new conversation with that scope, return it

No migration logic here. Simple lookup or create.

### 2. Message Persistence (on each message send)

**Trigger:** User sends a message via `POST /api/chat/stream`.

**Service method:** `ChatStreamService._setup_chat()`

**Steps:**

1. Derive scope from context → e.g. `"table:42"`
2. If `conversation_id` provided → load it, save message
3. If no `conversation_id` → create new conversation with derived scope, save message

No migration logic here either. By the time messages are sent, scope is already correct.

### 3. Explicit Migration (on table creation)

**Trigger:** User accepts a schema proposal and a table is created.

**Endpoint:** `PATCH /api/chats/{chat_id}/migrate`

**Service method:** `ChatService.migrate_to_table(chat_id, user_id, table_id)`

**Steps:**

1. Derive new scope from table_id → `"table:42"`
2. Update conversation's scope column
3. Return success

This is called explicitly by the frontend at the moment of table creation, when we know both the conversation ID and the new table ID.

---

## Scope Migration

Migration is **explicit, not automatic**. It happens at a single well-defined moment.

### tables_list → table:\<id\>

**Scenario:** User is on the Tables List page. They ask the assistant to create a table. The conversation is created with scope `"tables_list"`. The user accepts the schema proposal, and the table is created (id=42).

**What happens:**

1. Accept-proposal handler creates the table → gets `table_id = 42`
2. Handler calls `PATCH /api/chats/{chatId}/migrate` with `table_id = 42`
3. Backend updates conversation scope from `"tables_list"` to `"table:42"`
4. Handler navigates to `/tables/42`
5. ChatTray on table_view loads → queries for `"table:42"` → finds the migrated conversation

The migration is telegraphed — we know at table creation time that it needs to happen, so we do it right then. No guessing, no fallback queries, no fragile in-memory state chains.

---

## Frontend Contract

The frontend never constructs scope strings. It provides context:

- Pages call `updateContext({ current_page, table_id, ... })`
- ChatTray reads `current_page` and `table_id` from context
- `getChatByContext(currentPage, tableId)` sends these to the backend
- Backend derives scope, loads or creates conversation, returns it
- At table creation time, frontend calls `migrateToTable(tableId)` — the only explicit migration point

---

## Key Files

| File | Role |
|---|---|
| `services/chat_service.py` → `derive_scope()` | Single source of truth for scope format |
| `services/chat_service.py` → `get_or_create_for_context()` | Conversation loading (lookup or create) |
| `services/chat_service.py` → `migrate_to_table()` | Explicit scope migration |
| `services/chat_stream_service.py` → `_setup_chat()` | Message persistence (no migration) |
| `routers/chat.py` → `GET /by-context` | Passes current_page + table_id to service |
| `routers/chat.py` → `PATCH /{chat_id}/migrate` | Explicit migration endpoint |
| `frontend/lib/api/chatApi.ts` → `migrateChat()` | Calls migration endpoint |
| `frontend/context/ChatContext.tsx` → `loadForContext()` | Loads conversation by page context |
| `frontend/context/ChatContext.tsx` → `migrateToTable()` | Calls migrateChat with current chatId |
