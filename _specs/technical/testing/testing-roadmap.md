# Testing Roadmap

## Current State

### What Exists
- **1 backend E2E test suite** (`backend/tests/test_multi_tenancy_e2e.py`, ~750 lines) — covers invitation flow, org subscriptions, chat, article notes, stance analysis. Most of this tests old KH flows, not table.that.
- **pytest configured** — `pytest.ini` with asyncio support, `conftest.py` with e2e marker
- **Frontend test tooling installed** — vitest, @testing-library/react, jsdom all in package.json
- **Frontend tests: zero** — vitest.config.ts exists but `setupTests.ts` is missing and no test files written
- **No CI/CD** — deploy.ps1 builds frontend but runs no tests
- **No browser automation** — no Playwright, Cypress, or Selenium

### What Doesn't Exist
- Unit tests for any service or model
- API endpoint tests for table.that (71 endpoints, 0 tested)
- Frontend component tests
- Browser-based E2E tests
- Pre-deploy smoke test script
- Test coverage reporting
- Any automated test gate before deploy

---

## The Four Pillars

### Pillar 1: Backend API Tests (pytest)

**Goal:** Fast, isolated tests for every REST endpoint. No browser needed. Run in seconds.

**What to test (71 endpoints across 10 routers):**

| Router | Endpoints | Priority | Reason |
|--------|-----------|----------|--------|
| `tables.py` | 12 (CRUD + import/export + search) | P0 | Core product — tables + rows are everything |
| `auth.py` | 8 (register, login, password reset, token) | P0 | Broken auth = no app |
| `chat.py` + `chat_stream.py` | 5 (list, get, stream) | P1 | Chat is the primary UX |
| `organization.py` | 5 (org CRUD + members) | P1 | Multi-tenancy correctness |
| `admin.py` | 14 (orgs, users, invitations, config) | P2 | Admin-only, lower traffic |
| `user.py` | 4 (me, update, password, admins) | P2 | Simple CRUD |
| `help.py` | 14 (help content management) | P3 | Admin content management |
| `tracking.py` | 3 (events) | P3 | Analytics, not user-facing |

**Approach:**
- **Test client:** Use FastAPI's `TestClient` (from `starlette.testclient`) — no running server needed
- **Database:** Use a test MySQL database (or SQLite in-memory for speed)
- **Auth:** Create a test fixture that generates valid JWT tokens
- **Structure:** One test file per router: `tests/test_tables.py`, `tests/test_auth.py`, etc.
- **Patterns:**
  - Happy path for every endpoint
  - Auth failures (no token, expired token, wrong user)
  - Not-found cases (404)
  - Validation failures (bad input → 400)
  - Access control (user A can't see user B's tables)

**Example test shape:**
```python
def test_create_table(client, auth_headers):
    response = client.post("/api/tables", json={
        "name": "Test Table",
        "description": "A test",
        "columns": [{"name": "Name", "type": "text"}]
    }, headers=auth_headers)
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Table"
    assert len(data["columns"]) == 1

def test_create_table_unauthorized(client):
    response = client.post("/api/tables", json={...})
    assert response.status_code == 401

def test_get_table_wrong_user(client, auth_headers_user_b):
    # User B can't see User A's table
    response = client.get("/api/tables/1", headers=auth_headers_user_b)
    assert response.status_code == 404
```

---

### Pillar 2: Browser Automation (Playwright MCP)

**Goal:** Give Claude the ability to drive a real browser — see the page, click things, fill forms, assert what's visible.

**Setup:**
1. Install Playwright MCP server: `npx @anthropic/mcp-playwright` (or `@anthropic-ai/mcp-playwright`)
2. Configure in `.claude/settings.json` under `mcpServers`:
   ```json
   {
     "mcpServers": {
       "playwright": {
         "command": "npx",
         "args": ["@anthropic-ai/mcp-playwright"]
       }
     }
   }
   ```
3. This gives Claude tools like: `browser_navigate`, `browser_click`, `browser_fill`, `browser_screenshot`, `browser_evaluate`

**What this enables:**
- Claude can open `http://192.168.0.12:5173`, log in, create a table, add rows, and verify the UI
- Visual regression checking — take screenshots and compare
- Real user flow validation that catches frontend bugs API tests miss
- Debug UI issues by literally looking at the page

**Limitations to be aware of:**
- Slower than API tests (seconds per action vs milliseconds)
- Requires dev server running
- Flaky if UI animations/loading states aren't handled
- Not a replacement for API tests — a complement

---

### Pillar 3: User Test Agent

**Goal:** A Claude sub-agent (`.claude/agents/user-test.md`) that knows how to use Playwright MCP to run user-journey tests.

**Agent design:**
- Has a library of test scenarios (login, create table, import CSV, chat interaction, etc.)
- Knows the app's URL, test credentials, and page structure
- Can be invoked with `/test` or `/test login-flow` or `/test table-crud`
- Takes screenshots at key checkpoints
- Reports pass/fail with visual evidence

**Test scenarios to build:**

| Scenario | Steps | Validates |
|----------|-------|-----------|
| Login flow | Navigate → enter creds → verify dashboard | Auth, redirect, session |
| Create table | Login → new table → add columns → save | Table CRUD, column types |
| Add rows | Open table → add row → fill data → verify | Row CRUD, data persistence |
| Import CSV | Open table → import → map columns → verify data | Import pipeline, schema detection |
| Export CSV | Open table with data → export → verify download | Export pipeline |
| Chat interaction | Open chat → send message → wait for response | Chat stream, tool execution |
| Table edit inline | Open table → click cell → edit → tab out → verify saved | Inline editing, auto-save |
| Filter/sort | Open table with data → apply filter → verify rows | FilterBar, query logic |

**Agent structure:**
- Reads test scenarios from a markdown file or has them built in
- Uses Playwright MCP tools to execute each step
- Screenshots before/after key actions
- Produces a structured report

---

### Pillar 4: Pre-Deploy Smoke Tests

**Goal:** A single command (`/smoke` or a script) that validates core functionality before deploying.

**What it runs:**

```
Pre-Deploy Smoke Test
=====================
1. Backend health      → GET /health (or root endpoint)
2. Auth flow           → POST /login with test creds → get token
3. Table CRUD          → Create table → get table → delete table
4. Row CRUD            → Create row → get row → update row → delete row
5. Import/Export       → Import CSV → export CSV → compare
6. Chat basics         → POST /api/chat/stream → verify SSE response starts
7. Frontend build      → npm run build (no errors)
8. Type check          → npx tsc --noEmit (no errors)
```

**Implementation options:**
- **Option A: pytest suite** — A `tests/test_smoke.py` that runs against a live server (like the existing E2E test). Fast, reliable, API-level.
- **Option B: `/smoke` skill** — A Claude slash command that runs the pytest smoke suite and optionally follows up with a quick browser check via Playwright.
- **Option C: Both** — pytest for the API checks (can be scripted/CI'd), skill for the browser checks (interactive).

**Recommended: Option C.** The pytest smoke suite becomes the automated gate. The `/smoke` skill wraps it and adds the browser layer when you want a full check.

**Deploy integration:**
Add to `deploy.ps1`:
```powershell
# Run smoke tests before deploying
python -m pytest tests/test_smoke.py -v --tb=short
if ($LASTEXITCODE -ne 0) { Write-Error "Smoke tests failed!"; exit 1 }
```

---

## Implementation Order

### Phase 1: Foundation (do first)
1. **Fix frontend test setup** — Create missing `setupTests.ts`, verify `npm run test` works
2. **Create backend test fixtures** — TestClient setup, JWT token factory, test DB config in `conftest.py`
3. **Write table CRUD API tests** — The core product, highest value
4. **Write auth API tests** — Can't use the app without auth working

### Phase 2: Coverage + Browser
5. **Install Playwright MCP** — Get browser automation available to Claude
6. **Create user-test agent** — `.claude/agents/user-test.md` with scenario library
7. **Write remaining P1 API tests** — Chat, organization endpoints
8. **Build first browser test scenarios** — Login flow, create table flow

### Phase 3: Automation
9. **Create smoke test suite** — `tests/test_smoke.py` with the 8-point checklist
10. **Create `/smoke` skill** — Slash command wrapping pytest + optional browser check
11. **Integrate into deploy.ps1** — Fail deploy if smoke tests fail
12. **Write P2/P3 API tests** — Admin, user, help, tracking endpoints

---

## Key Decisions Needed

1. **Test database strategy** — Separate MySQL test DB? SQLite in-memory? Test transactions that roll back?
2. **Test credentials** — Hardcoded test user in conftest, or environment variables like the current E2E tests?
3. **Playwright MCP vs Playwright scripts** — MCP gives Claude interactive access; scripts give reproducible CI runs. We probably want both eventually, but MCP first for the interactive workflow.
