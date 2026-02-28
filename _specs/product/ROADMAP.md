# table.that Roadmap

## Defects

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|
| #21 | P1 | fetch_webpage 403s on bot-protected sites (Zillow, StreetEasy, etc.) | open | 2026-02-27 | |

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
| #14 | P1 | AI-driven development automation | open | 2026-02-26 | |
| #15 | P1 | Vertical-specific tooling & prompting | open | 2026-02-27 | |
| #16 | P1 | Domain tool packs & dynamic vertical detection | open | 2026-02-27 | |
| #17 | P1 | Entity type system (table-level row typing) | open | 2026-02-27 | |
| #18 | P2 | Harvest orchestration guidelines from Google Drive | open | 2026-02-27 | |
| #19 | P1 | Recommendations tool via SerpAPI | open | 2026-02-27 | |
| #20 | P1 | Persistent Job Architecture for Long-Running Agents | open | 2026-02-27 | |
| #22 | P1 | Direct update policy, audit log, and frontend staleness | open | 2026-02-27 | |

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

### #2 — Extensible for_each_row framework (strategy-based enrichment)
Redesign for_each_row as a strategy dispatcher. The outer loop is fixed (iterate rows, collect results, present data_proposal), but the inner operation per cell varies based on what's being asked. Strategies:

- **Quick lookup** — Single search, snippet-level answer. For factual questions with short answers (city, founding year, yes/no). 1-2 search steps max, no page fetches. Cheapest and fastest.
- **Extraction** — Targeted fetch of a known page (e.g., the URL column value + `/pricing`) followed by structured extraction of specific fields. No searching — go directly to the source. For prices, ratings, feature lists, contact info.
- **Deep research** — Full agentic research loop with scorecard, multi-source synthesis, and explicit exit criteria. For judgment calls, analysis columns, qualitative assessments. This is what `research_web` does today, but with better prompting and effort calibration (ties to #8).
- **API lookup** — Direct call to a structured data source (PubMed, Google Places, ClinicalTrials.gov). No web search at all. Deterministic, fast, authoritative. Each API adapter (#15) becomes a strategy option.
- **Computation** — Derive a value from other columns in the same row. No external data needed. Math, concatenation, conditional logic.
- **Recommendation harvest** — Use SerpAPI (#19) to find curated lists, extract entities. Primarily for the Populate step rather than per-cell enrichment.

Strategy selection can be: (a) explicit from the user ("look up the pricing page for each"), (b) inferred by the AI from the column type and question, or (c) driven by entity type metadata (#17). Each strategy has its own context curation (sterile context per the orchestration principles), and all strategies pass through value coercion before reaching the data_proposal. The framework is pluggable — new strategies register like tools do today.

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
Set up proper test infrastructure: FastAPI TestClient, JWT token factory fixture, test DB configuration in conftest.py. Fix the missing frontend setupTests.ts. Then write the first high-value tests: full CRUD coverage for tables.py (12 endpoints) and auth.py (8 endpoints) — happy paths, auth failures, not-found, validation errors, and cross-user access control. See `_specs/technical/testing/testing-roadmap.md` for full details.

### #10 — Playwright MCP browser automation setup
Install and configure the Playwright MCP server so Claude can drive a real browser. Config goes in `.claude/settings.json` under `mcpServers`. This gives Claude tools like browser_navigate, browser_click, browser_fill, browser_screenshot. Enables visual testing, real user flow validation, and debugging UI issues by literally looking at the page.

### #11 — User test agent (browser-driven E2E)
Create `.claude/agents/user-test.md` — a sub-agent that uses Playwright MCP to run user-journey tests. Has a library of scenarios (login, create table, import CSV, chat interaction, inline editing, filter/sort). Invokable via `/test` slash command with optional scenario name. Takes screenshots at key checkpoints, reports pass/fail with visual evidence.

### #12 — Pre-deploy smoke test suite + /smoke skill
Create `tests/test_smoke.py` — a fast pytest suite that validates core functionality against a live server: health check, auth flow, table CRUD, row CRUD, import/export, chat stream initiation. Also create a `/smoke` slash command that runs the pytest suite and optionally follows up with a quick browser check. Integrate into deploy.ps1 as a gate — fail deploy if smoke tests fail.

### #13 — Full API endpoint test coverage (P1-P3 routers)
After the foundation (#9) is in place, extend test coverage to all remaining routers: chat (5 endpoints), organization (5), admin (14), user (4), help (14), tracking (3). Priority order matches the testing roadmap. Goal: every endpoint has at least a happy-path test and an auth-failure test. 71 endpoints total.

### #19 — Recommendations tool via SerpAPI
Build a `get_recommendations` tool that uses SerpAPI to find curated "best of" and recommendation lists for a given topic. When a user asks "find the best project management tools" or "recommend Italian restaurants in Chicago," this tool queries SerpAPI for roundup articles, listicles, and review aggregator pages — the kind of content where humans have already done the curation work. The tool extracts recommended entities (products, businesses, services) from these results and returns them as structured candidates for table population. This is fundamentally different from generic web search: instead of searching for individual entities one by one, it finds lists where someone has already assembled and vetted a set of recommendations. This becomes a primary data source for the Populate step, especially for Product Comparison (#2 vertical), Local Business (#6), and Vendor Evaluation (#5). Implementation: SerpAPI query with result-type filtering → fetch top listicle/roundup pages → structured extraction of entity names + key attributes → return as candidate list. Pairs with value coercion and entity verification for quality. We already have a SERPAPI_KEY in the backend env.

### #18 — Harvest orchestration guidelines from Google Drive
User has a directory of orchestration guidelines in Google Drive covering workflow design, agent coordination, and research strategies. Need to: (1) download/access the documents, (2) review them against the verticals-and-tooling analysis and the current system architecture, (3) extract actionable patterns — research strategies, prompting techniques, effort calibration rules, tool composition patterns — that should be incorporated into the codebase (system prompts, tool configs, or specs). This is a one-time knowledge harvest, not an ongoing sync.

### #17 — Entity type system (table-level row typing)
Add an `entity_type` field to TableDefinition that tells the system what kind of thing each row represents (SaaS Product, Local Business, Publisher, PubMed Article, etc.). Entity types carry: identity anchor (how to uniquely identify the entity), canonical data source, known attributes with extraction logic, verification method, and research strategy. The AI infers entity type during table creation. Falls back to generic "Website/URL" when unrecognized. Start with 2-3 types (Website, SaaS Product, Local Business), expand based on usage. Ties into #15 (vertical tooling) and #16 (dynamic detection) — entity type is the output of vertical detection and the dispatch key for tool packs. See `_specs/product/verticals-and-tooling.md` Part 1B for full design.

### #16 — Domain tool packs & dynamic vertical detection
Two-part feature: (1) **Domain tool packs** — bundled sets of tools, API adapters, and system prompt instructions tailored to specific verticals (e.g., a "travel" pack includes flight/hotel search APIs and travel-specific prompting; an "academic" pack includes PubMed/ClinicalTrials APIs and citation-aware prompting). Each pack defines which tools are available, how research should be conducted, and what enrichment columns make sense. (2) **Dynamic vertical detection** — when a user describes what they need ("help me plan a trip to Japan" or "find clinical trials for lupus"), the system classifies the domain and automatically activates the relevant tool pack. The agent gets the right tools and prompt instructions without the user having to configure anything. Detection happens at table creation time and can be refined as the conversation evolves.

### #15 — Vertical-specific tooling & prompting
Research and develop domain-specific tool configurations, data source integrations, and prompt strategies for target verticals (product comparison, lead research, academic research, etc.). Includes new tool abstractions (structured extraction, API adapters, verification) and per-vertical prompt templates. See `_specs/product/verticals-and-tooling.md` for the full analysis of candidate verticals, orchestration challenges, and tooling design requirements.

### #21 — fetch_webpage 403s on bot-protected sites
Sites like Zillow, StreetEasy, LinkedIn return 403 Forbidden to the current fetch_webpage tool because it uses a plain HTTP client with no browser fingerprint. Need a headless browser fallback: when a direct fetch gets a 403 or other bot-block signal, retry with a real browser (Playwright/Puppeteer) that renders JavaScript and presents a normal browser fingerprint.

### #20 — Persistent Job Architecture for Long-Running Agents
Decouple agentic loop execution from client connections so jobs survive disconnects and are resumable across sessions and devices. Durable job records with stable IDs, background workers keyed by job ID, append-only event logs for progress/tool results, client as event log subscriber (replay + tail on reconnect), and worker-side resumability via checkpointed tool results.

### #22 — Direct update policy, audit log, and frontend staleness
Three related issues around tool-driven table mutations: (1) **Policy clarity** — establish clear, consistent rules for when the AI uses direct update tools (update_row, delete_row) vs presenting a data_proposal for user approval. Communicate this policy to both the AI (system prompt) and the user (help text). (2) **Audit log with undo** — when the AI makes direct updates, log them in a reviewable history so the user can see what changed and undo individual mutations. Even though the user didn't explicitly approve, the changes should be transparent and reversible. (3) **Frontend staleness** — when a tool mutates table data server-side, the frontend table view doesn't refresh. The user sees a chat message saying "I updated the row" but the table still shows stale data. Need a mechanism to signal the frontend to re-fetch after tool-driven mutations.

### #14 — AI-driven development automation
Use AI automation to drive as much of the product development lifecycle as possible — from roadmap management to implementation to release. The goal is to get a product-market-fit version of table.that into the marketplace with AI automatically populating, processing, and prioritizing the roadmap itself. This is meta: the roadmap should be self-managing via AI, and that capability is itself a milestone toward PMF. Includes: automated roadmap triage and prioritization, AI-generated task breakdowns from user feedback, automated spec writing, CI/CD integration for autonomous implementation cycles, and self-updating roadmap based on what's been shipped.
