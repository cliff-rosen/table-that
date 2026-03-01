# table.that Roadmap

## Categories

| Code | Category | Description |
|------|----------|-------------|
| CORE | Core Product | Features in the build-populate-enrich loop |
| GROWTH | Growth & Distribution | Sharing, onboarding, analytics, conversion |
| QUALITY | Quality & Reliability | Testing, bug fixes, error handling, UX polish |
| INFRA | Infrastructure | Architecture, background jobs, deployment |
| AI | AI & Research | Enrichment quality, strategies, tooling, prompting |
| META | Meta / Process | Dev automation, orchestration, internal tooling |

## Quality Layers

Each item is tagged with the quality layer(s) it addresses. See `pmf-criteria.md` for the full rubric.

| Code | Layer | Question |
|------|-------|----------|
| D | Decision | Does the AI make the right choices about what to say and which tools to call? |
| T | Tool | Do the tools execute correctly and reliably? |
| P | Presentation | Is the result laid out in a way the user can follow? |

## Defects

| ID | P | Cat | Lyr | Title | Status | Created | Resolved |
|----|---|-----|-----|-------|--------|---------|----------|
| #21 | P1 | QUALITY | T | fetch_webpage 403s on bot-protected sites (Zillow, StreetEasy, etc.) | open | 2026-02-27 | |
| #30 | P1 | QUALITY | T | Chat cancel functionality not correctly implemented | open | 2026-03-01 | |
| #31 | P2 | QUALITY | P | Tool history renders poorly during streaming | open | 2026-03-01 | |

## Features

| ID | P | Cat | Lyr | Title | Status | Created | Resolved |
|----|---|-----|-----|-------|--------|---------|----------|
| #1 | P2 | INFRA | T | Background/scheduled for_each_row | open | 2026-02-26 | |
| #2 | — | — | — | Extensible for_each_row framework | done | 2026-02-26 | 2026-02-27 |
| #3 | P1 | CORE | P | Improved for_each_row results UX | open | 2026-02-26 | |
| #4 | P1 | CORE | P | Rich table display | open | 2026-02-26 | |
| #5 | P2 | GROWTH | — | Google social login | open | 2026-02-26 | |
| #6 | P2 | CORE | P | Mobile experience | open | 2026-02-26 | |
| #7 | P2 | CORE | T | Email and SMS integration | open | 2026-02-26 | |
| #8 | — | — | — | Research effort thresholds and prompting | done | 2026-02-26 | 2026-02-27 |
| #14 | P1 | META | — | AI-driven development automation | open | 2026-02-26 | |
| #15 | P1 | AI | D,T | Vertical-specific tooling & prompting | open | 2026-02-27 | |
| #16 | P1 | AI | D,T | Domain tool packs & dynamic vertical detection | open | 2026-02-27 | |
| #17 | P1 | AI | D | Entity type system (table-level row typing) | open | 2026-02-27 | |
| #18 | P2 | META | D | Harvest orchestration guidelines from Google Drive | open | 2026-02-27 | |
| #19 | P1 | AI | T | Recommendations tool via SerpAPI | open | 2026-02-27 | |
| #20 | P1 | INFRA | T | Persistent Job Architecture for Long-Running Agents | open | 2026-02-27 | |
| #22 | P1 | CORE | D,P | Direct update policy, audit log, and frontend staleness | open | 2026-02-27 | |
| #23 | P1 | GROWTH | — | User journey stage tracking (build → populate → organize → enrich) | open | 2026-02-27 | |
| #24 | P1 | GROWTH | — | Shareable tables (public links, no-login viewing, viral distribution) | open | 2026-02-27 | |
| #27 | P1 | CORE | P | Direct UI triggers for column enrichment (bypass chat) | open | 2026-03-01 | |
| #32 | P1 | CORE | T | Multi-column enrichment in a single pass | open | 2026-03-01 | |
| #33 | P1 | CORE | P,T | Column-level entity types (URL, email, phone, address, etc.) | open | 2026-03-01 | |
| #28 | P1 | GROWTH | P | First-time empty state and onboarding (templates, suggested prompts, guided first table) | open | 2026-03-01 | |
| #29 | P1 | CORE | P | Visual impact for core operations (animations for schema creation, data population, enrichment) | open | 2026-03-01 | |

## Tasks

| ID | P | Cat | Lyr | Title | Status | Created | Resolved |
|----|---|-----|-----|-------|--------|---------|----------|
| #9 | P1 | QUALITY | T | Backend API test foundation + table/auth tests | open | 2026-02-26 | |
| #10 | P1 | QUALITY | — | Playwright MCP browser automation setup | open | 2026-02-26 | |
| #11 | P1 | QUALITY | D,T,P | User test agent (browser-driven E2E) | open | 2026-02-26 | |
| #12 | P1 | QUALITY | T | Pre-deploy smoke test suite + /smoke skill | open | 2026-02-26 | |
| #13 | P2 | QUALITY | T | Full API endpoint test coverage (P1-P3 routers) | open | 2026-02-26 | |
| #25 | P2 | AI | D,T | Tool accuracy evals with ground truth | open | 2026-02-28 | |
| #26 | P1 | QUALITY | D,T,P | Chat/journey replay with full payload inspection | open | 2026-02-28 | |

## Details

### #1 — Background/scheduled for_each_row
Currently for_each_row runs synchronously in the chat stream. Need a background variant that can be kicked off and run asynchronously, with support for scheduling (e.g., "refresh LinkedIn URLs every week"). Enables long-running research jobs without blocking the chat, and opens the door to scheduled/recurring table maintenance.

### #2 — Extensible for_each_row framework (strategy-based enrichment) — DONE
Implemented as `enrich_column` tool with strategy-based dispatch. Three strategies registered: lookup (snippet-only, 2 turns), research (multi-turn with exploratory/comprehensive thoroughness), computation (safe eval + Haiku fallback). Value coercion layer handles type fitting. See `_specs/technical/architecture/enrichment-strategies.md`.

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

### #8 — Research effort thresholds and prompting — DONE
Implemented via the strategy system. Lookup strategy (1-2 steps, snippet-only) vs Research strategy with thoroughness parameter (exploratory ~5 steps vs comprehensive 8-15 steps with coverage assessment). System prompts enforce effort rules. Research log captures full trace.

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

### #14 — AI-driven development automation
Use AI automation to drive as much of the product development lifecycle as possible — from roadmap management to implementation to release. The goal is to get a product-market-fit version of table.that into the marketplace with AI automatically populating, processing, and prioritizing the roadmap itself. This is meta: the roadmap should be self-managing via AI, and that capability is itself a milestone toward PMF. Includes: automated roadmap triage and prioritization, AI-generated task breakdowns from user feedback, automated spec writing, CI/CD integration for autonomous implementation cycles, and self-updating roadmap based on what's been shipped.

### #15 — Vertical-specific tooling & prompting
Research and develop domain-specific tool configurations, data source integrations, and prompt strategies for target verticals (product comparison, lead research, academic research, etc.). Includes new tool abstractions (structured extraction, API adapters, verification) and per-vertical prompt templates. See `_specs/product/verticals-and-tooling.md` for the full analysis of candidate verticals, orchestration challenges, and tooling design requirements.

### #16 — Domain tool packs & dynamic vertical detection
Two-part feature: (1) **Domain tool packs** — bundled sets of tools, API adapters, and system prompt instructions tailored to specific verticals (e.g., a "travel" pack includes flight/hotel search APIs and travel-specific prompting; an "academic" pack includes PubMed/ClinicalTrials APIs and citation-aware prompting). Each pack defines which tools are available, how research should be conducted, and what enrichment columns make sense. (2) **Dynamic vertical detection** — when a user describes what they need ("help me plan a trip to Japan" or "find clinical trials for lupus"), the system classifies the domain and automatically activates the relevant tool pack. The agent gets the right tools and prompt instructions without the user having to configure anything. Detection happens at table creation time and can be refined as the conversation evolves.

### #17 — Entity type system (table-level row typing)
Add an `entity_type` field to TableDefinition that tells the system what kind of thing each row represents (SaaS Product, Local Business, Publisher, PubMed Article, etc.). Entity types carry: identity anchor (how to uniquely identify the entity), canonical data source, known attributes with extraction logic, verification method, and research strategy. The AI infers entity type during table creation. Falls back to generic "Website/URL" when unrecognized. Start with 2-3 types (Website, SaaS Product, Local Business), expand based on usage. Ties into #15 (vertical tooling) and #16 (dynamic detection) — entity type is the output of vertical detection and the dispatch key for tool packs. See `_specs/product/verticals-and-tooling.md` Part 1B for full design.

### #18 — Harvest orchestration guidelines from Google Drive
User has a directory of orchestration guidelines in Google Drive covering workflow design, agent coordination, and research strategies. Need to: (1) download/access the documents, (2) review them against the verticals-and-tooling analysis and the current system architecture, (3) extract actionable patterns — research strategies, prompting techniques, effort calibration rules, tool composition patterns — that should be incorporated into the codebase (system prompts, tool configs, or specs). This is a one-time knowledge harvest, not an ongoing sync.

### #19 — Recommendations tool via SerpAPI
Build a `get_recommendations` tool that uses SerpAPI to find curated "best of" and recommendation lists for a given topic. When a user asks "find the best project management tools" or "recommend Italian restaurants in Chicago," this tool queries SerpAPI for roundup articles, listicles, and review aggregator pages — the kind of content where humans have already done the curation work. The tool extracts recommended entities (products, businesses, services) from these results and returns them as structured candidates for table population. This is fundamentally different from generic web search: instead of searching for individual entities one by one, it finds lists where someone has already assembled and vetted a set of recommendations. This becomes a primary data source for the Populate step, especially for Product Comparison (#2 vertical), Local Business (#6), and Vendor Evaluation (#5). Implementation: SerpAPI query with result-type filtering → fetch top listicle/roundup pages → structured extraction of entity names + key attributes → return as candidate list. Pairs with value coercion and entity verification for quality. We already have a SERPAPI_KEY in the backend env.

### #20 — Persistent Job Architecture for Long-Running Agents
Decouple agentic loop execution from client connections so jobs survive disconnects and are resumable across sessions and devices. Durable job records with stable IDs, background workers keyed by job ID, append-only event logs for progress/tool results, client as event log subscriber (replay + tail on reconnect), and worker-side resumability via checkpointed tool results.

### #21 — fetch_webpage 403s on bot-protected sites
Sites like Zillow, StreetEasy, LinkedIn return 403 Forbidden to the current fetch_webpage tool because it uses a plain HTTP client with no browser fingerprint. Need a headless browser fallback: when a direct fetch gets a 403 or other bot-block signal, retry with a real browser (Playwright/Puppeteer) that renders JavaScript and presents a normal browser fingerprint.

### #22 — Direct update policy, audit log, and frontend staleness
Three related issues around tool-driven table mutations: (1) **Policy clarity** — establish clear, consistent rules for when the AI uses direct update tools (update_row, delete_row) vs presenting a data_proposal for user approval. Communicate this policy to both the AI (system prompt) and the user (help text). (2) **Audit log with undo** — when the AI makes direct updates, log them in a reviewable history so the user can see what changed and undo individual mutations. Even though the user didn't explicitly approve, the changes should be transparent and reversible. (3) **Frontend staleness** — when a tool mutates table data server-side, the frontend table view doesn't refresh. The user sees a chat message saying "I updated the row" but the table still shows stale data. Need a mechanism to signal the frontend to re-fetch after tool-driven mutations.

### #23 — User journey stage tracking (build → populate → organize → enrich)
Track each table's progression through the four core stages: (1) **Build** — schema defined, (2) **Populate** — initial data seeded (via AI research, manual entry, or CSV import), (3) **Organize** — user sorts, filters, or rearranges, (4) **Enrich** — for-each-row AI enrichment run. Store the current stage per table and timestamp transitions. This gives us the key PMF signal: where do users drop off? If most tables never get past Build, the population flow is broken. If they populate but never enrich, the enrichment UX needs work. Feed this data into the PMF Director as a primary signal source. Also enables in-product nudges ("Your table has data but no enrichment yet — try adding a column and letting AI research each row").

### #25 — Tool accuracy evals with ground truth
Build an eval suite that compares tool outputs against known-correct answers — e.g. "What are all Claude model families?" checked against an authoritative list, or "What year was Google founded?" checked against "1998". Separate from the mechanical test harness (tests/test_tools.py), which only verifies tools run without errors. These evals measure answer quality: exact match, fuzzy match, recall against a curated answer set. Should cover lookup_web, research_web, compute_value, and all enrichment strategies. Results go to a scored dashboard showing per-tool accuracy over time, so we can catch regressions when we change prompts or tool logic.

### #26 — Chat/journey replay with full payload inspection
Ability to replay a user's chat session and table journey with full visibility into what happened at each step: what the user said, what the AI decided to do, which tools were called with what arguments, what the tools returned, and what payloads were sent to the frontend (schema proposals, data proposals, enrichment results). This is the core diagnostic tool for the DTP tuning loop — you can't fix D failures if you can't see what decision the AI made, you can't fix T failures if you can't see what the tool returned, and you can't fix P failures if you can't see what was presented. Needs: (1) **Persistent chat/event log** — store the full conversation including tool calls, tool results, and payload contents (not just the user-visible messages). (2) **Replay UI or export** — ability to walk through a session step by step, or export the full trace for analysis. (3) **Payload inspection** — see the actual schema_proposal, data_proposal, and enrichment payloads that were sent, not just that they were sent. This is distinct from #23 (journey stage tracking, which is aggregate funnel metrics) — this is per-session forensics.

### #27 — Direct UI triggers for column enrichment (bypass chat)
Users can currently only enrich a column by asking the chatbot in natural language. Need a direct UI path — e.g. right-click column header → "Enrich with AI", or a button in column settings — that launches enrichment without requiring a chat message. Reduces friction for users who know what they want and shouldn't have to phrase it as a conversation. Should reuse the same strategy-based backend (enrich_column tool) but trigger it from a UI action instead of a chat tool call. This is the first step toward a broader pattern: key table operations should be triggerable from both chat and direct UI, with chat as the discovery/guidance layer and UI as the power-user fast path.

### #28 — First-time empty state and onboarding
The most critical moment in the discovery journey is what a user sees when they log in for the first time to an empty space. Currently: an empty tables list with a chat panel and no guidance. This is where most users decide to engage or leave. Needs: (1) **Suggested first prompts** tailored to common use cases ("Try: 'Build me a list of Italian restaurants in Chicago'" or "Track my job applications"). Not generic — specific enough that the user can imagine the result. (2) **Template gallery** — pre-built schemas for common verticals (vendor comparison, submission tracker, apartment hunting, trip planning). One click to start with a real structure. (3) **Visual preview** — show what a finished, enriched table looks like before the user builds their first one. A 10-second preview that sells the outcome. (4) **Progressive disclosure** — don't dump everything at once. Guide the user through Build, then Populate, then Enrich as natural next steps. This is a Friction 2 item (discovery journey) — see pmf-criteria.md "Two Types of Friction."

### #29 — Visual impact for core operations
The Build→Populate→Enrich loop has natural moments of drama that currently feel clinical. Schema proposals appear as flat cards. Data populates silently. Enrichment results just appear in cells. These moments should feel impressive — they represent hours of manual work being done in seconds. Needs: (1) **Schema creation animation** — when the user approves a schema proposal, the table should appear with a satisfying reveal, not just a page load. (2) **Data population visual** — rows appearing one by one or in a cascade, with a sense of real-time discovery. The data proposal card itself should feel like opening a gift, not reading a spreadsheet. (3) **Enrichment progress** — per-row progress visible in the table itself, results landing with visual confirmation (subtle highlight, checkmark, color transition). The column filling in should feel like watching the AI work. (4) **Before/after contrast** — make the transformation from empty table to populated to enriched feel like three distinct, visually satisfying stages. This is both a P (presentation) improvement and a Friction 2 (discovery journey) improvement — visual impact is part of how users discover the value.

### #24 — Shareable tables (public links, no-login viewing, viral distribution)
Make tables shareable via public link. When a user creates a useful table (restaurant picks, vendor comparisons, publisher lists), they should be able to share it with a URL that anyone can open without registering. This is a critical growth lever: a shared table is a product demo that sells itself. Requirements: (1) **One-click share** — generate a public URL for any table, with optional read-only or comment-enabled modes. (2) **Zero-friction viewing** — recipients see the full table immediately, no login wall, no signup prompt blocking the content. (3) **Gentle conversion** — after viewing, show a soft CTA: "Want to make your own? Sign up free." or "Fork this table to customize it." Never gate the content. (4) **Fork/duplicate** — signed-in users can copy a shared table to their own account and modify it. (5) **Owner control** — creator can revoke the link, set it to expire, or make it unlisted. This is potentially the highest-leverage PMF feature: every shared table is organic distribution. A restaurant list texted to friends, a vendor comparison emailed to a team, a school list posted in a parent group. Each one shows the product in action to new users who have a reason to care.

### #33 — Column-level entity types (URL, email, phone, address, etc.)
Complement #17 (row-level entity typing) with column-level entity types. Where #17 tells the system "each row is a SaaS Product," this tells it "this column holds URLs" or "this column holds phone numbers." An entity type is a semantic overlay on top of the base column type (text, number, etc.) — it drives rendering (URLs as clickable links, emails as mailto, phones as callable), validation (is this a well-formed URL?), and potentially enrichment behavior (an address column could auto-geocode). Some entity types may require structured/JSON storage — a URL has href + display text + domain; an address has street + city + state + zip — so the column stores richer data than a plain string while the entity type knows how to render and edit it. Start with URL, email, phone; expand to address, currency, rating, etc. based on vertical needs.

### #32 — Multi-column enrichment in a single pass
When enriching multiple related columns (e.g. phone number + website URL for a store, or founded year + CEO for a company), run them in a single per-row loop instead of separate passes. The AI already visits the same sources for both — doing two loops wastes time, API calls, and money. Need a way to define multiple target columns for one enrichment run, where a single research pass extracts all values at once and writes them to their respective columns. This changes the enrichment model from "one column at a time" to "one research question per row that fills N columns."

### #30 — Chat cancel functionality not correctly implemented
Chat cancel button needs to be properly written and tested for all cases: cancelling during tool execution, during streaming text, during proposal generation, during enrich_column multi-row processing. Need to verify the cancel signal propagates correctly from frontend → backend SSE → agent loop, that partial results are handled gracefully, and that the UI returns to a clean state after cancel.

### #31 — Tool history renders poorly during streaming
When a chat message is being streamed, tool history shows as a raw list ("tool one, tool two, tool three") instead of proper formatted cards. Once the message is fully streamed, tool history renders correctly as clickable inline chips with the ToolResultCard component. The issue is that during streaming, tool_history isn't available yet (it arrives in the complete event), so the inline `[[tool:N]]` markers in the streaming text don't resolve to cards. Need a better streaming-time representation — either suppress the markers during streaming or show placeholder cards.
