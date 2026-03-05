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

## Two Operations

### 1. Conversation Loading (page-driven)

**Trigger:** Page component mounts or route param (`tableId`) changes.

**Who calls:** Each page calls `loadForContext()` directly from a `useEffect` driven by route params — NOT from ChatTray. ChatTray is purely a UI component; it does not drive conversation loading.

**Endpoint:** `GET /api/chats/by-context?current_page=...&table_id=...`

**Service method:** `ChatService.get_for_context()`

**Steps:**

1. Derive scope from `current_page` + `table_id` → e.g. `"table:42"`
2. Query: `WHERE user_id = ? AND app = ? AND scope = "table:42"` (most recent)
3. **Found** → return it with messages
4. **Not found** → return 404 (frontend shows empty chat)

Lookup only — never creates. Conversations are only created on first message send (via `_setup_chat`).

**State machine:** The conversation to load is determined by the URL, not by context state. `tableId` from `useParams()` is the driver:

| URL | tableId | Scope loaded |
|---|---|---|
| `/tables` | null | `"tables_list"` |
| `/tables/42` | 42 | `"table:42"` |
| `/tables/42/edit` | 42 | `"table:42"` |

### 2. Message Persistence & Migration (on each message send)

**Trigger:** User sends a message via `POST /api/chat/stream`.

**Service method:** `ChatStreamService._setup_chat()`

**Steps:**

1. Derive scope from context → e.g. `"table:42"`
2. If `conversation_id` provided:
   a. Load conversation
   b. If derived scope differs from stored scope AND table_id is present → migrate scope
   c. Save message to this conversation
3. If no `conversation_id`:
   a. Create new conversation with derived scope
   b. Save message

Migration happens here because the context change IS the signal. When the accept-proposal handler updates context to `{current_page: "table_view", table_id: 42}` and then sends a message, `_setup_chat` sees the scope mismatch and migrates.

---

## Scope Migration

Migration is handled by the backend when it detects a scope mismatch during message persistence. The frontend triggers it implicitly by updating context and sending a message.

### tables_list → table:\<id\>

**Scenario:** User is on the Tables List page. They ask the assistant to create a table. The conversation is created with scope `"tables_list"`. The user accepts the schema proposal, and the table is created (id=42).

**What happens:**

1. Accept-proposal handler creates the table → gets `table_id = 42`
2. Handler updates context: `{current_page: "table_view", table_id: 42}`
3. Handler sends message: `[User accepted and created "Bug Tracker"]`
4. `_setup_chat` loads conversation, derives scope `"table:42"`, sees mismatch → migrates
5. Handler navigates to `/tables/42`
6. TableViewPage mounts → calls `loadForContext('table_view', 42)` → finds the migrated conversation

The context change is the telegraph. The backend detects the mismatch and acts on it. No separate migration endpoint, no frontend migration logic.

---

## Frontend Contract

The frontend never constructs scope strings. It provides `current_page` + `table_id` and the backend derives scope.

**Conversation loading is page-driven:**

- Each page calls `loadForContext(currentPage, tableId)` in a `useEffect` driven by route params
- ChatTray does NOT trigger loads — it only renders the loaded conversation
- `loadForContext()` (in ChatContext) calls `getChatByContext()` which hits the backend

**Context updates are separate from loading:**

- Pages call `updateContext({ current_page, table_id, columns, rows, ... })` to push AI context
- ChatTray passes `initialContext` to set base context on mount
- These do NOT trigger conversation loading — they only enrich the context sent with messages

After reset (new conversation), the chat stays empty until the user sends a message, which creates a new conversation via `_setup_chat`.

---

## Key Files

| File | Role |
|---|---|
| `services/chat_service.py` → `derive_scope()` | Single source of truth for scope format |
| `services/chat_service.py` → `get_for_context()` | Conversation loading (lookup only) |
| `services/chat_service.py` → `migrate_to_table()` | Scope migration (called by _setup_chat) |
| `services/chat_stream_service.py` → `_setup_chat()` | Message persistence with scope migration |
| `routers/chat.py` → `GET /by-context` | Passes current_page + table_id to service |
| `frontend/context/ChatContext.tsx` → `loadForContext()` | Loads conversation by page context |
| `frontend/pages/TablesListPage.tsx` | Calls `loadForContext('tables_list')` on mount |
| `frontend/pages/TableViewPage.tsx` | Calls `loadForContext('table_view', tableId)` on mount/tableId change |
| `frontend/pages/TableEditPage.tsx` | Calls `loadForContext('table_edit', tableId)` on mount/tableId change |
| `frontend/components/chat/ChatTray.tsx` | UI only — does NOT drive conversation loading |
