# QA Walkthrough Report

**Date:** 2026-03-04 (23:29 – 23:41)
**Test User:** qa_test_20260304_2329@test.example.com
**Base URL:** http://192.168.0.12:5174
**Browser:** Playwright (Chromium)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Guest + Register + Empty State | PASS | 0 |
| 2 | Core Flow Step 1 | Create Table | PASS | 1 |
| 3 | Core Flow Step 2 | Populate Data | PASS | 1 |
| 4 | Core Flow Step 3 | Add Column | PASS | 0 |
| 5 | Core Flow Step 4 | Enrich | FAIL | 1 |
| 6 | Cross-Cutting | Session + UI + Console | PASS | 0 |
| 7 | Context Integrity | Table navigation + chat context | PASS | 1 |

**Overall: 6/7 phases passed**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1 | n/a | PASS | PASS | Landing, guest flow, registration all clean |
| 2 | PASS | PASS | PASS | Minor: AI says "empty table" after including sample data |
| 3 | PASS | PASS | PASS | SUGGESTED_VALUES raw JSON visible in chat (pre-existing) |
| 4 | PASS | PASS | PASS | Column added cleanly |
| 5 | FAIL | PASS | PASS | Inner LLM didn't call submit_answer for ambiguous companies; "Could not determine an answer..." leaked into cell values |
| 6 | n/a | PASS | PASS | Session persistence, dark mode, profile all work |
| 7 | PASS | PASS | FAIL | AI context switches correctly, but chat panel doesn't reset conversation history on table navigation |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Pain-statement hero visible | PASS | 1a | "Here's your updated table." hero displayed |
| Textarea + Create Table button + 4 starters | PASS | 1a | All present and functional |
| Guest flow: prompt → guest session → /tables + chat | PASS | 1b-alt | Clicked starter pill, redirected correctly |
| Guest restrictions (no Import/Create/StarterGrid/Edit Schema) | PASS | 1b-alt | All restricted elements hidden |
| "Log in" + "Register to save your work" in header (guest) | PASS | 1b-alt | Both links visible |
| Registration form shows: email, password, confirm password | PASS | 1b | Form loaded correctly |
| Successful registration auto-logs in | PASS | 1b | Auto-login after registration |
| Redirects to /tables after registration | PASS | 1b | Correct redirect |
| PromptHero visible (no tables, chat closed) | PASS | 1c | Heading, textarea, starters, manual link all visible |
| "Your table will appear here" (chat open, no tables) | PASS | 1c | Shown during guest flow with chat open |
| Import CSV + Create Table in header (hidden for guests) | PASS | 1c | Visible for registered users, hidden for guests |

### Core Flow (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| AI responds with SCHEMA_PROPOSAL (create) | PASS | 2 | Correct proposal generated |
| SchemaProposalStrip appears | PASS | 2 | Preview table shown with proposed columns |
| Apply creates table, strip disappears | PASS | 2 | Table created at /tables/190, 6 columns |
| AI responds with DATA_PROPOSAL | PASS | 3 | 5 rows proposed with realistic data |
| ProposalActionBar appears | PASS | 3 | "AI Proposed Changes — 5 additions" with checkboxes |
| Apply inserts rows with progress | PASS | 3 | All 5 rows applied, success banner shown |
| SCHEMA_PROPOSAL (update) for new column | PASS | 4 | Website column proposed |
| New column appears with green highlight | PASS | 4 | Column added after Company |
| enrich_column tool called | PASS | 5 | Tool name: "Enrich Column" |
| Strategy and results card | FAIL | 5 | Card title: "AI Enrichment Results". Strategy: Lookup. Research log: "8 found, 0 not found" — incorrect, 2 entries had "Could not determine..." text |
| Progress bar during enrichment | PASS | 5 | Progress bar advanced during processing |
| Enriched data applied to table | FAIL | 5 | Dismissed — 2 of 8 values were failure text, not real URLs |

## Issues Found

| # | Severity | Layer | Phase | Description | Evidence |
|---|----------|-------|-------|-------------|----------|
| 1 | Critical | D | 5 | **submit_answer not called by inner LLM**: For ambiguous companies (Global Solutions, Acme Corp), the inner Haiku model produced free text ("Could not determine an answer. The search results show multiple companies with...") instead of calling the `submit_answer` tool. The text fallback path's `is_not_found()` regex didn't catch this phrasing, so the failure text leaked into proposed cell values. Research log incorrectly shows "8 found, 0 not found". | qa-5-enrichment-complete.png |
| 2 | Low | D | 2 | AI says "empty table ready to go" in follow-up message, but table was created with sample data (3 rows) | qa-2-table-created.png |
| 3 | Low | P | 3,7b | SUGGESTED_VALUES raw JSON visible in chat messages — the payload tag isn't being stripped from the rendered text | qa-3-populated.png, qa-7b-context-after-create.png |
| 4 | Medium | P | 7c | **Chat doesn't reset conversation on table navigation**: When navigating from QA Pets to Job Applications table, the chat panel still shows the QA Pets conversation history. The AI's backend context correctly switches (it reports the right table), but the UI shows a confusing mix of conversations from different tables. | qa-7c-context-switch.png |

## Screenshots

| File | Phase | Description |
|------|-------|-------------|
| qa-1a-landing.png | 1a | Landing page |
| qa-1b-alt-guest.png | 1b-alt | Guest try-it flow |
| qa-2-table-created.png | 2 | Table created with schema |
| qa-3-data-proposal.png | 3 | Data proposal with 5 rows |
| qa-3-populated.png | 3 | Table populated with 8 rows |
| qa-4-add-column.png | 4 | Website column proposed |
| qa-4-column-added.png | 4 | Website column added |
| qa-5-enrichment-complete.png | 5 | Enrichment results (critical bug visible) |
| qa-6a-after-relogin.png | 6a | Tables list after logout/login |
| qa-6b-theme-toggle.png | 6b | Dark mode toggle |
| qa-7a-second-table.png | 7a | QA Pets table created |
| qa-7b-context-after-create.png | 7b | AI correctly identifies QA Pets |
| qa-7c-context-switch.png | 7c | Context switch — mixed chat history |
| qa-7d-context-return.png | 7d | Return to QA Pets — AI context correct |
| qa-7e-data-after-nav.png | 7e | Data proposal targets correct table |

## Console Errors (Unexpected)

None. Only expected 401 on `/api/tracking/events` (unauthenticated tracking endpoint during logout).

## Recommendations

1. **Critical — Fix submit_answer adoption**: The inner LLM (Haiku) doesn't consistently call `submit_answer` for ambiguous lookups. Options:
   - Strengthen the system prompt to make submit_answer mandatory
   - Use `tool_choice: {"type": "any"}` to force tool use on the final turn
   - Improve `_text_fallback_answer()` to catch more "Could not determine..." phrasings
   - Add `is_not_found()` sentinel for "Could not determine an answer"

2. **Medium — Fix chat conversation persistence across table navigation**: The chat panel should either (a) switch to a table-specific conversation when navigating to a different table, or (b) start a new conversation. Currently it shows a confusing mix of messages from different table contexts.

3. **Low — Strip SUGGESTED_VALUES from rendered chat text**: The `SUGGESTED_VALUES: [{...}]` JSON appears raw in chat messages. This payload tag should be parsed and stripped before rendering, similar to how SCHEMA_PROPOSAL and DATA_PROPOSAL are handled.

4. **Low — Fix "empty table" wording**: When table is created with sample data, AI should acknowledge the sample rows exist rather than saying "empty table ready to go."
