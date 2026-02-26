# table.that Roadmap

## Defects

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|

## Features

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|
| #1 | P2 | Background/scheduled for_each_row | open | 2026-02-26 | |
| #2 | P1 | Extensible for_each_row framework | open | 2026-02-26 | |
| #3 | P1 | Improved for_each_row results UX | open | 2026-02-26 | |
| #4 | P1 | Rich table display | open | 2026-02-26 | |
| #5 | P2 | Google social login | open | 2026-02-26 | |
| #6 | P2 | Mobile experience | open | 2026-02-26 | |
| #7 | P2 | Email and SMS integration | open | 2026-02-26 | |
| #8 | P1 | Research effort thresholds and prompting | open | 2026-02-26 | |

## Tasks

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|
| #9 | P1 | Backend API test foundation + table/auth tests | open | 2026-02-26 | |
| #10 | P1 | Playwright MCP browser automation setup | open | 2026-02-26 | |
| #11 | P1 | User test agent (browser-driven E2E) | open | 2026-02-26 | |
| #12 | P1 | Pre-deploy smoke test suite + /smoke skill | open | 2026-02-26 | |
| #13 | P2 | Full API endpoint test coverage (P1-P3 routers) | open | 2026-02-26 | |

## Details

### #1 — Background/scheduled for_each_row
Currently for_each_row runs synchronously in the chat stream. Need a background variant that can be kicked off and run asynchronously, with support for scheduling (e.g., "refresh LinkedIn URLs every week"). Enables long-running research jobs without blocking the chat, and opens the door to scheduled/recurring table maintenance.

### #2 — Extensible for_each_row framework
Generalize for_each_row beyond just web research. Support simple tool calls, agentic multi-step tool chains, and custom operations per row. The framework should be pluggable so new row-level operations can be added without changing the orchestration layer.

### #3 — Improved for_each_row results UX
Better real-time progress and results display for row-level operations. User shouldn't have to bounce between chat, data table, and side panel. Show results inline with clear per-row status, let user selectively accept/reject individual row results, and stream updates as each row completes rather than waiting for the whole batch.

### #4 — Rich table display
Multi-line row support for long text fields, URL column type with clickable links, show/hide columns toggle, and general polish to make the data table visually organized and information-dense without clutter. Users should see what matters and be able to tuck away what they don't need right now.

### #5 — Google social login
Add "Sign in with Google" as a login option. Starting with Google OAuth2, then can expand to other providers later. Reduces friction for new users who don't want to create yet another password.

### #6 — Mobile experience
Make table.that work well on mobile devices. Key challenges: table display on narrow screens, chat tray layout, touch-friendly interactions, responsive navigation. Need to decide between responsive web, PWA, or native — and what the core mobile use case even is (viewing/acting on data vs building tables).

### #7 — Email and SMS integration
Connect to email and text messages as data sources. Users have a wealth of personal information in their inbox and messages that could drive table population and enrichment (e.g., pull contacts from email, extract order details, track conversations). Could work as an import source, an ongoing sync, or an AI-assisted extraction pipeline.

### #8 — Research effort thresholds and prompting
The for_each_row web research pipeline needs better prompting and tooling around effort thresholds at each stage. Key issues: (1) When has enough searching been done to answer the question? Currently Claude often takes the first snippet answer without verifying. (2) When should it fetch a page vs trust snippets? (3) When should it refine the search query vs give up? (4) The search result snippets themselves aren't logged in the research trace, so users can't evaluate whether Claude made good decisions. Need to tune the system prompt, add structured decision points, and ensure the research log captures enough detail (especially the actual search result snippets) for users to audit research quality.

### #9 — Backend API test foundation + table/auth tests
Set up proper test infrastructure: FastAPI TestClient, JWT token factory fixture, test DB configuration in conftest.py. Fix the missing frontend setupTests.ts. Then write the first high-value tests: full CRUD coverage for tables.py (12 endpoints) and auth.py (8 endpoints) — happy paths, auth failures, not-found, validation errors, and cross-user access control. See `_specs/testing-roadmap.md` for full details.

### #10 — Playwright MCP browser automation setup
Install and configure the Playwright MCP server so Claude can drive a real browser. Config goes in `.claude/settings.json` under `mcpServers`. This gives Claude tools like browser_navigate, browser_click, browser_fill, browser_screenshot. Enables visual testing, real user flow validation, and debugging UI issues by literally looking at the page.

### #11 — User test agent (browser-driven E2E)
Create `.claude/agents/user-test.md` — a sub-agent that uses Playwright MCP to run user-journey tests. Has a library of scenarios (login, create table, import CSV, chat interaction, inline editing, filter/sort). Invokable via `/test` slash command with optional scenario name. Takes screenshots at key checkpoints, reports pass/fail with visual evidence.

### #12 — Pre-deploy smoke test suite + /smoke skill
Create `tests/test_smoke.py` — a fast pytest suite that validates core functionality against a live server: health check, auth flow, table CRUD, row CRUD, import/export, chat stream initiation. Also create a `/smoke` slash command that runs the pytest suite and optionally follows up with a quick browser check. Integrate into deploy.ps1 as a gate — fail deploy if smoke tests fail.

### #13 — Full API endpoint test coverage (P1-P3 routers)
After the foundation (#9) is in place, extend test coverage to all remaining routers: chat (5 endpoints), organization (5), admin (14), user (4), help (14), tracking (3). Priority order matches the testing roadmap. Goal: every endpoint has at least a happy-path test and an auth-failure test. 71 endpoints total.
