# QA Walkthrough Report

**Date:** 2026-03-04
**Test User:** qa_test_20260304_1945@test.example.com
**Base URL:** http://localhost:5174
**Browser:** Playwright (Chromium)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Guest Flow + Registration | PASS | 0 |
| 2 | Core Flow Step 1 | Create Table | PASS | 0 |
| 3 | Core Flow Step 2 | Populate Data | PASS | 1 |
| 4 | Core Flow Step 3 | Add Column | PASS | 0 |
| 5 | Core Flow Step 4 | Enrich | PASS | 1 |
| 6 | Cross-Cutting | Session + UI + Console | PASS | 1 |
| 7 | Context Integrity | Table navigation + chat context | PASS | 0 |

**Overall: 7/7 phases passed**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1 | n/a | PASS | PASS | Landing page, guest flow, registration all clean |
| 2 | PASS | PASS | PASS | Schema proposal with preview table, sample data, Create/Dismiss |
| 3 | PASS | PASS | PASS | AI used create_row tools directly (no DATA_PROPOSAL) — valid path |
| 4 | PASS | PASS | PASS | SCHEMA_PROPOSAL (update) with strip, green highlight, filter tabs |
| 5 | MINOR | PASS | PASS | [D] Priority values inconsistent with AI's own explanation (see #1) |
| 6 | n/a | PASS | PASS | Session persistence, theme toggle, console audit clean |
| 7 | PASS | PASS | PASS | Context correctly switches between tables; conversations isolated |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Pain-statement hero visible | PASS | 1a | |
| Textarea + Create Table button + 4 starters | PASS | 1a | Button disabled until text entered |
| Guest flow: prompt -> guest session -> /tables + chat | PASS | 1b-alt | Starter pill clicked, redirected, chat opened |
| Guest restrictions (no Import/Create/StarterGrid/Edit Schema) | PASS | 1b-alt | All hidden for guests |
| "Log in" + "Register to save your work" in header (guest) | PASS | 1b-alt | |
| Registration via "Register to save your work" link | PASS | 1b-alt | In-page modal after guest limit |
| Successful registration auto-logs in | PASS | 1b-alt | Header switched to profile + Logout |
| Stays on current page after registration | PASS | 1b-alt | Remained on /tables/208 |
| PromptHero visible (no tables, chat closed) | SKIP | 1c | Tested guest flow instead |
| "Your table will appear here" (chat open, no tables) | PASS | 1b-alt | Shown while waiting for AI |
| Import CSV + Create Table in header (hidden for guests) | PASS | 1b-alt | Hidden for guest, appeared after registration |

### Core Flow (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| AI responds with SCHEMA_PROPOSAL (create) | PASS | 2 | Preview table with columns, sample data, Create/Dismiss |
| SchemaProposalCard appears (create mode) | PASS | 2 | "Proposed Table" card with preview |
| Apply creates table, card disappears | PASS | 2 | Navigated to /tables/208 |
| AI responds with tool calls (create_row) | PASS | 3 | 5 create_row tool calls, not DATA_PROPOSAL |
| Table auto-refreshes with new rows | PASS | 3 | 8 rows after adding 5 |
| SCHEMA_PROPOSAL (update) for new column | PASS | 4 | SchemaProposalStrip: "1 new column" |
| New column appears with placeholder | PASS | 4 | Priority column with "—" values |
| Apply adds column, strip disappears | PASS | 4 | 7 columns, Priority filter tabs appeared |
| enrich_column tool called | PASS | 5 | Tool name: "Enrich Column" |
| Strategy and results card | PASS | 5 | Card title: "AI Proposed Changes — 8 updates". Research log: 8 found, 0 not found |
| Progress bar during enrichment | PASS | 5 | "AI Enrichment — Searching..." with progress bar |
| Enriched data applied to table | PASS | 5 | All 8 rows updated, action bar auto-dismissed |
| No proposal reappearing after acceptance | PASS | 5 | chatId-based scanning ref reset working correctly |

## Issues Found

| # | Severity | Layer | Phase | Description | Evidence |
|---|----------|-------|-------|-------------|----------|
| 1 | Low | D | 5 | Enrichment assigned "High" to 7/8 rows including sample companies (Acme Corp, Global Solutions) that the AI's own explanation categorized as "Low Priority." The enrichment strategy's web research overrode sensible heuristics. | qa-5-enrichment-complete.png — AI text says "Low: sample companies" but cells show "High" |
| 2 | Low | D | 3 | AI used direct create_row tool calls instead of DATA_PROPOSAL for batch insertion. This bypasses the proposal review UX (checkboxes, selective apply). Not a bug — valid path — but less user control. | qa-3-populated.png |
| 3 | Cosmetic | P | 6 | loadForContext 404 errors logged to console.error when no conversation exists yet. These are expected (lookup-only) but noisy — could be console.log level. | Console audit: 4 occurrences of "Failed to load chat for context" |

## Screenshots

| File | Phase | Description |
|------|-------|-------------|
| qa-1a-landing.png | 1a | Landing page with hero, textarea, starters |
| qa-1b-alt-guest.png | 1b-alt | Guest flow: schema proposal card for Job Applications |
| qa-2-table-created.png | 2 | Table created with 3 sample rows, suggestion chips |
| qa-3-populated.png | 3 | 8 rows after adding 5 via create_row tools |
| qa-4-add-column.png | 4 | SchemaProposalStrip: Priority column proposed |
| qa-4-column-added.png | 4 | Priority column added, filter tabs visible |
| qa-5-enriching.png | 5 | Enrichment in progress with search status |
| qa-5-enrichment-complete.png | 5 | DataProposalActionBar: 8 updates, research log |
| qa-5-enriched.png | 5 | Priority values applied, table updated |
| qa-6a-after-relogin.png | 6a | Tables list after logout/login, data persisted |
| qa-6b-theme-toggle.png | 6b | Light mode toggle |
| qa-7a-second-table.png | 7a | QA Pets table created |
| qa-7b-context-after-create.png | 7b | AI correctly identifies QA Pets after creation |
| qa-7c-context-switch.png | 7c | AI correctly identifies Job Applications after nav |

## Console Errors (Unexpected)

None. All console errors were expected:
- 401 on `/api/tracking/events` (unauthenticated tracking calls)
- 404 on `/api/chats/by-context` (no conversation exists yet — expected for lookup-only pattern)

## Recommendations

1. **Low priority**: Consider downgrading the `loadForContext` 404 handling from `console.error` to `console.log` — these are expected "no conversation yet" responses, not errors.
2. **Low priority**: The enrichment strategy for the Priority column assigned "High" to almost everything. Consider whether the `computation` strategy (no web search needed) would be more appropriate for deriving values from existing row data.
3. **Informational**: The AI chose direct `create_row` tool calls instead of `DATA_PROPOSAL` for batch row insertion. This is a valid path but skips the proposal review UX. If proposal-based insertion is preferred for batch operations, this could be guided via system prompt tuning.
