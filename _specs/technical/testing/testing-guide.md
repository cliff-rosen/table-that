# Testing Guide

> How to run tests, what they cover, and where to find results.

---

## Conceptual Model

### Test depth (what calls what)

Testing is organized as a stack. The top layer is closest to the user; the bottom layer is deepest in the backend. Each layer exercises the layers below it.

```
┌─────────────────────────────────────────────────────────┐
│  QA Walkthrough  (Playwright browser)                   │
│  Tests: full UX — AI decisions, proposal rendering,     │
│         chat interaction, visual correctness             │
│                                                         │
│  Exercises the same HTTP endpoints as the API tests,    │
│  but through the real frontend React app.               │
├────────────────────────┬────────────────────────────────┤
│  Auth Flow Tests       │  Core Flow Tests               │
│  (pytest, HTTP)        │  (pytest, HTTP)                │
│                        │                                │
│  Tests: backend        │  Tests: backend                │
│  contract — request/   │  contract — tables,            │
│  response, status      │  rows, schema updates,         │
│  codes, auth guards    │  pagination, isolation         │
├────────────────────────┴────────────────────────────────┤
│  Tool Tests  (pytest, Python functions)                 │
│  Tests: internal logic — tool executors, core           │
│         generators, enrichment strategies               │
│                                                         │
│  Calls Python functions directly, not HTTP.             │
│  Catches logic bugs that API tests would see as         │
│  wrong output values.                                   │
└─────────────────────────────────────────────────────────┘
```

**Overlap between layers:**

The QA Walkthrough and API tests both exercise the same HTTP endpoints (`POST /api/tables`, `POST /api/auth/register`, etc.), but from different angles:

| | QA Walkthrough | API Tests |
|---|---|---|
| **Calls endpoints via** | Browser (React app → fetch) | Python `requests` library |
| **Also tests** | AI decision quality, proposal UI, visual layout, chat SSE | Nothing beyond the HTTP response |
| **Speed** | 5-10 minutes | 55 seconds |
| **Deterministic** | No — AI may not cooperate (phases can SKIP) | Yes — same input always gives same output |
| **Catches** | Frontend rendering bugs, AI behavior regressions, UX flow breaks | Contract bugs, auth logic, data integrity, isolation |

Tool tests go one level deeper — they skip HTTP entirely and call `execute_compute_value()`, `_lookup_web_core()`, `strategy.execute_one()` as Python functions. They catch bugs in tool logic that the API tests would only see as "wrong value in response."

### Asset dependencies (what each layer needs to run)

```
                    ┌──────────────────────┐
                    │     Flow Specs       │
                    │  (define "correct")  │
                    ├──────────────────────┤
                    │ core-flow.md         │
                    │ new-user-flow.md     │
                    └──────┬───────┬───────┘
                           │       │
              ┌────────────┘       └────────────┐
              ▼                                 ▼
┌──────────────────────────┐    ┌───────────────────────────┐
│   QA Walkthrough Skill   │    │     API Test Suites       │
│                          │    │                           │
│ Reads:                   │    │ Reads:                    │
│  · SKILL.md (phases,     │    │  · conftest.py (APIClient,│
│    rubric, report fmt)   │    │    fixtures)              │
│                          │    │  · helpers.py (writers)   │
│ Needs running:           │    │                           │
│  · Frontend dev server   │    │ Needs running:            │
│  · Backend server        │    │  · Backend server         │
│  · Playwright MCP        │    │                           │
│                          │    │                           │
│ Writes:                  │    │ Writes:                   │
│  · _specs/signal/        │    │  · backend/tests/results/ │
│    qa-latest.md ─────────┼──┐ │    auth_flow_results.md   │
│                          │  │ │    core_flow_results.md   │
└──────────────────────────┘  │ └───────────────────────────┘
                              │
                              │  ┌───────────────────────────┐
                              │  │     Tool Tests            │
                              │  │                           │
                              │  │ Reads:                    │
                              │  │  · helpers.py (writers)   │
                              │  │                           │
                              │  │ Needs running:            │
                              │  │  · Backend (DB + web)     │
                              │  │                           │
                              │  │ Writes:                   │
                              │  │  · backend/tests/results/ │
                              │  │    tool_test_results.md   │
                              │  └───────────────────────────┘
                              │
                              ▼
                    ┌──────────────────────┐
                    │   PMF Director       │
                    │   reads qa-latest.md │
                    │   as signal input    │
                    └──────────────────────┘
```

The flow specs are the authoritative source of truth. They define what "correct" means for both the QA Walkthrough (which checks each item via browser) and the API tests (which check the subset that's testable via HTTP). The QA Walkthrough skill doc (SKILL.md) translates flow spec checklists into browser test phases. The API tests translate them into pytest assertions.

Results flow downstream: all test layers write reports, but only `qa-latest.md` feeds into the PMF Director signal loop.

---

## Quick reference

| Layer | Command | Speed | Deterministic | Results file |
|-------|---------|-------|---------------|-------------|
| Auth flow | `pytest tests/test_auth_flow.py -v -s` | ~25s | Yes | `tests/results/auth_flow_results.md` |
| Core flow | `pytest tests/test_core_flow.py -v -s` | ~30s | Yes | `tests/results/core_flow_results.md` |
| Tool tests | `pytest tests/test_tools.py -v -s` | ~45s | Yes | `tests/results/tool_test_results.md` |
| All pytest | `pytest tests/test_auth_flow.py tests/test_core_flow.py tests/test_tools.py -v -s` | ~90s | Yes | All three |
| QA Walkthrough | `/qa-walkthrough` | 5-10 min | No | `_specs/signal/qa-latest.md` |

---

## Layer 1: Auth Flow Tests

### Command

```bash
cd backend
python -m pytest tests/test_auth_flow.py -v -s
```

### Prerequisites

- Backend running at `http://localhost:8000` (override with `TEST_BASE_URL` env var)

### What's covered (9 tests)

| Test | Flow Spec Reference | What it checks |
|------|-------------------|----------------|
| `test_register_new_user` | NUF Step 1 | POST register → 200, returns token + user_id |
| `test_register_duplicate_email` | NUF Step 1 | Duplicate email → 400 |
| `test_register_short_password` | NUF Step 1 | Password < 5 chars → 422 |
| `test_login_valid` | NUF Step 2 | POST login (form-encoded) → 200, returns token |
| `test_login_wrong_password` | NUF Step 2 | Wrong password → 401 |
| `test_login_nonexistent` | NUF Step 2 | Unknown email → 401 |
| `test_tables_list_empty` | NUF Step 3 | New user sees empty tables list |
| `test_auth_required` | Cross | No token → 401 |
| `test_profile_accessible` | Cross | GET /user/me returns correct email |

### What's NOT covered

- Invitation-based registration (`/register?token=...`)
- Passwordless login (magic link)
- Password reset flow
- Token expiry and refresh
- Rate limiting

### Results

`backend/tests/results/auth_flow_results.md` — overwritten each run.

---

## Layer 2: Core Flow Tests

### Command

```bash
cd backend
python -m pytest tests/test_core_flow.py -v -s
```

### Prerequisites

- Backend running at `http://localhost:8000`

### What's covered (15 tests)

| Test | Flow Spec Reference | What it checks |
|------|-------------------|----------------|
| `test_create_table` | CF Step 1 | POST /tables → 201, schema matches |
| `test_create_table_all_types` | CF Step 1 | text, number, date, boolean, select all accepted |
| `test_create_table_select_options` | CF Step 1 | Select options stored correctly |
| `test_get_table` | CF Step 1 | GET /tables/{id} returns full schema |
| `test_create_row` | CF Step 2 | POST row → 201, data matches |
| `test_create_multiple_rows` | CF Step 2 | 3 rows created, GET returns all 3 |
| `test_rows_pagination` | CF Step 2 | offset/limit params work correctly |
| `test_search_rows` | CF Step 2 | POST /rows/search finds matching content |
| `test_add_column` | CF Step 3 | PUT with new column preserves existing row data |
| `test_existing_rows_null_new_column` | CF Step 3 | Old rows have null for new column |
| `test_update_row` | CF Step 4 | PUT row changes only the target column |
| `test_update_multiple_rows` | CF Step 4 | Sequential updates (enrichment simulation) |
| `test_full_lifecycle` | All 4 steps | create → populate → add column → update → verify |
| `test_delete_row` | Cross | DELETE row works, row count drops |
| `test_table_isolation` | Cross | User A's table returns 404 for User B |

### What's NOT covered

- Chat/SSE conversation (the AI deciding to emit proposals) — too async for synchronous HTTP tests
- SCHEMA_PROPOSAL and DATA_PROPOSAL payload rendering — that's frontend, covered by QA Walkthrough
- CSV import/export endpoints
- Bulk delete
- Column sorting
- `enrich_column` tool (covered by tool tests below)

### Results

`backend/tests/results/core_flow_results.md` — overwritten each run.

---

## Layer 3: Tool Tests (pre-existing)

### Command

```bash
cd backend
python -m pytest tests/test_tools.py -v -s
```

### Prerequisites

- Backend running (needs live DB connection and web access for search/research tools)

### What's covered (25 tests)

| Section | Tests | What it checks |
|---------|-------|----------------|
| Standalone Tools | 13 | compute_value, lookup_web, research_web, search_web, fetch_webpage |
| Core Generators | 4 | _compute_core, _lookup_web_core, _research_web_core step traces |
| Table Tools | 6 | create_row, get_rows, search_rows, describe_table, update_row, delete_row (via service layer) |
| Strategies | 3 | lookup, computation, research strategy execute_one() |

### Key difference from core flow tests

Tool tests call **Python functions directly** (service layer, tool executors). Core flow tests call **HTTP endpoints** (the full request/response cycle including auth, routing, serialization). Both are needed — tool tests catch logic bugs, API tests catch contract bugs.

### Results

`backend/tests/results/tool_test_results.md` — overwritten each run.

---

## Layer 4: QA Walkthrough (Browser Tests)

### Command

```
/qa-walkthrough
```

With arguments:
- `/qa-walkthrough prod` — run against production (`https://tablethat.ironcliff.ai`)
- `/qa-walkthrough phase 1-3` — run specific phases
- `/qa-walkthrough new user only` — just the new user flow
- `/qa-walkthrough core only` — just the core flow phases

### Prerequisites

- Dev server running at `http://192.168.0.12:5173` (or prod URL)
- Playwright MCP browser tools available in Claude

### What's covered (6 phases)

| Phase | Flow Spec | What it tests |
|-------|-----------|---------------|
| 1: New User Flow | `new-user-flow.md` | Landing page → register → empty state UX |
| 2: Create Table | `core-flow.md` Step 1 | Chat → SCHEMA_PROPOSAL → SchemaProposalStrip → Apply |
| 3: Populate Data | `core-flow.md` Step 2 | Chat → DATA_PROPOSAL → ProposalActionBar → Apply |
| 4: Add Column | `core-flow.md` Step 3 | Chat → schema update proposal → Apply |
| 5: Enrich | `core-flow.md` Step 4 | Chat → enrich_column → progress → Apply |
| 6: Cross-Cutting | Both | Session persistence, dark mode, profile, console errors |

### What's NOT covered

- Cell editing, column sorting, filter bar interactions
- CSV import/export via UI
- Mobile/narrow viewport behavior
- Error recovery (network failures mid-apply)
- Manual table creation (non-AI path)

### Phases that may SKIP

Phases 4 and 5 depend on AI cooperation — the AI must produce the right proposal type. If it doesn't, they're marked **SKIP** with notes, not FAIL. This is expected behavior.

### Evaluation rubric

Every phase is graded on three layers (DTP):
- **[D] Decision** — Did the AI choose the right tool/response?
- **[T] Tool** — Did tools execute without errors?
- **[P] Presentation** — Was the UI clear and intuitive?

### Results

`_specs/signal/qa-latest.md` — overwritten each run. This is the file the PMF Director reads.

---

## Running everything

### All API + tool tests (no browser)

```bash
cd backend
python -m pytest tests/test_auth_flow.py tests/test_core_flow.py tests/test_tools.py -v -s
```

~90 seconds. Produces three report files in `backend/tests/results/`.

### Full validation (API + browser)

1. Run the pytest command above
2. Then `/qa-walkthrough`

### Just the fast contract tests (skip slow web-calling tool tests)

```bash
cd backend
python -m pytest tests/test_auth_flow.py tests/test_core_flow.py -v -s
```

~55 seconds. Skips the tool tests that make live web requests.

---

## Results file locations

| File | What it contains | Written by |
|------|-----------------|------------|
| `backend/tests/results/auth_flow_results.md` | Auth flow test results | test_auth_flow.py |
| `backend/tests/results/core_flow_results.md` | Core flow test results | test_core_flow.py |
| `backend/tests/results/tool_test_results.md` | Tool/strategy test results | test_tools.py |
| `_specs/signal/qa-latest.md` | QA Walkthrough browser test report | /qa-walkthrough skill |

All results files are overwritten on each run. They are not committed to git.

---

## Shared infrastructure

### `backend/tests/helpers.py`

`ResultsWriter` and `FlowResultsWriter` — collect test records and write markdown reports. Used by all three pytest modules.

### `backend/tests/conftest.py`

- `APIClient` class — HTTP client with `register()`, `login()`, auto Bearer token
- `api_client` fixture — unauthenticated client
- `authed_client` fixture — registers a fresh user, returns authenticated client
- `test_user_email` / `test_user_password` fixtures — unique per module
- `table_lifecycle` fixture — factory that creates tables and auto-deletes on teardown
- `db` fixture — async DB session (used by test_tools.py)

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `TEST_BASE_URL` | `http://localhost:8000` | Backend URL for API tests |
| `TEST_ADMIN_EMAIL` | `admin@example.com` | Admin credentials (not currently used by flow tests) |
| `TEST_ADMIN_PASSWORD` | `adminpassword` | Admin credentials (not currently used by flow tests) |

---

## Coverage gaps (known)

These are intentionally not tested yet:

| Area | Why |
|------|-----|
| Chat/SSE streaming | Async SSE is hard to test synchronously; QA Walkthrough covers it via browser |
| CSV import/export | Lower priority than core flow |
| Admin endpoints | P2 priority per testing roadmap |
| Organization/multi-tenancy | P1 priority, not yet implemented |
| Frontend component tests (vitest) | `setupTests.ts` exists but no test files written |
| CI/CD integration | No automated test gate before deploy |
| Pre-deploy smoke tests | Planned but not built |

---

## Flow spec alignment

Both API test suites and the QA Walkthrough are organized around the two flow specs:

- `_specs/flows/new-user-flow.md` — Registration, login, empty state
- `_specs/flows/core-flow.md` — Create table → populate → add column → enrich

The verification checklists in those specs define what "correct" looks like. API tests validate the backend contract. QA Walkthrough validates the full UX including AI behavior.
