# QA Walkthrough Report

**Date:** 2026-03-02
**Test User:** qa_test_20260302_0457@test.example.com
**Base URL:** http://192.168.0.12:5173
**Browser:** Playwright (Chromium)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Register + Empty State | PASS | 0 |
| 2 | Core Flow Step 1 | Create Table | PASS | 0 |
| 3 | Core Flow Step 2 | Populate Data | PASS | 1 |
| 4 | Core Flow Step 3 | Add Column | PASS | 0 |
| 5 | Core Flow Step 4 | Enrich | PASS | 0 |
| 6 | Cross-Cutting | Session + UI + Console | PASS | 0 |
| 7 | Context Integrity | Table navigation + chat context | FAIL | 2 |

**Overall: 6/7 phases passed**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1 | n/a | PASS | PASS | Landing, registration, empty state all clean |
| 2 | PASS | PASS | PASS | AI produced correct SCHEMA_PROPOSAL, table preview rendered well |
| 3 | PASS | PASS | PASS | DATA_PROPOSAL with 5 rows, apply worked with progress + success banner |
| 4 | PASS | PASS | PASS | SCHEMA_PROPOSAL update for 1 new column, strip + apply worked |
| 5 | PASS | PASS | PASS | enrich_column tool called, research log visible, all 5 websites found |
| 6 | n/a | PASS | PASS | Session persistence, dark mode, profile all working |
| 7 | FAIL | PASS | FAIL | AI text referenced wrong table after navigation; tools targeted correct table |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Registration form shows: email, password, confirm password | PASS | 1b | |
| Password validation: minimum 5 characters | NOT TESTED | -- | API test covers this |
| Successful registration auto-logs in | PASS | 1b | |
| Redirects to /tables after registration | PASS | 1b | |
| Empty state shows: table icon, "No tables yet" | PASS | 1c | |
| "Build a Table with AI" button | PASS | 1c | Primary gradient button with sparkles icon |
| "or create one manually" link visible | PASS | 1c | |
| Starter prompts grid visible | PASS | 1c | 6 starters in 3x2 grid |
| Header shows: Ask AI, Import CSV, Create Table | PASS | 1c | |
| Dark mode toggle visible | PASS | 1c | Moon icon in header |
| Profile link and Logout button | PASS | 1c | |

### Core Flow (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| AI responds with SCHEMA_PROPOSAL (create) | PASS | 2 | Correct proposal with columns + sample rows |
| Table preview appears with proposed columns | PASS | 2 | "Proposed Table" card with 8 columns + 3 sample rows |
| Apply creates table, preview disappears | PASS | 2 | Navigated to /tables/138 |
| AI sends follow-up suggesting data population | PASS | 2 | Suggestion chips: Add applications, Import CSV, etc. |
| AI responds with DATA_PROPOSAL | PASS | 3 | 5 rows of realistic job application data |
| ProposalActionBar appears | PASS | 3 | "AI Proposed Changes -- 5 additions" with Select/Deselect All |
| Apply inserts rows with progress | PASS | 3 | "All 5 changes applied" success banner + toast |
| Auto-dismiss after apply | PASS | 3 | Action bar dismissed, table refreshed |
| SCHEMA_PROPOSAL (update) for new column | PASS | 4 | "Schema changes proposed -- 1 new column" |
| New column appears in header | PASS | 4 | Website column added (scrollable to view) |
| AI suggests filling new column | PASS | 4 | "Research company websites" chip |
| enrich_column tool called | PASS | 5 | "Enrich Column" button visible in chat |
| Research log available | PASS | 5 | "5 found, 0 not found" |
| Progress bar during enrichment | PASS | 5 | "AI Enrichment -- Searching..." with row-by-row progress |
| Enriched data applied to table | PASS | 5 | All 5 websites populated: stripe.com, airbnb.com, etc. |

### Context Integrity (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| AI knows correct table after proposal-created table | PASS | 7b | Correctly identified QA Pets with 6 columns |
| Navigate to Table A, AI references Table A | PASS | 7c | Correctly identified Job Applications |
| Navigate back to Table B, AI references Table B | FAIL | 7d | AI said "Job Applications" when viewing QA Pets |
| Chat conversation from Table A not shown in Table B | FAIL | 7c/7d | Chat history carries across table navigations |
| Tool calls target correct table after navigation | PASS | 7e | Data proposal correctly targeted QA Pets |

## Issues Found

| # | Severity | Layer | Phase | Description | Evidence |
|---|----------|-------|-------|-------------|----------|
| 1 | Medium | P | 3 | Suggestion chips visible while data proposal action bar is active | qa-3-data-proposal.png: chips "Add my real applications", "Research company details", "Add a priority column" visible alongside proposal bar. Spec says "No suggestion chips while action bar is active" |
| 2 | Critical | D/T | 7d | AI conversational response references wrong table after multi-navigation | qa-7d-context-return.png: Viewing QA Pets (/tables/140) but AI says "The Job Applications table has 9 columns" and lists Job Applications columns. The chat session's conversational context does not update when re-navigating to a different table. |
| 3 | Medium | P | 7c/7d | Chat history from other tables persists across navigation | When navigating from Table A to Table B, conversation history from Table A is still visible in the chat panel. Spec says "Chat conversation from Table A does not appear when viewing Table B." |

## Screenshots

- `qa-1a-landing.png` -- Landing page (full page)
- `qa-1b-post-register.png` -- Tables list after registration
- `qa-1c-empty-state.png` -- Empty state with starter prompts
- `qa-2-schema-proposal.png` -- Schema proposal for Job Applications
- `qa-2-table-created.png` -- Table created with columns
- `qa-3-data-proposal.png` -- Data proposal with 5 rows
- `qa-3-populated.png` -- Table populated with data
- `qa-4-add-column.png` -- Schema proposal for Website column
- `qa-4-column-added.png` -- Website column added
- `qa-5-enriching.png` -- Enrichment in progress
- `qa-5-enrichment-complete.png` -- Enrichment results with action bar
- `qa-5-enriched.png` -- Enrichment applied
- `qa-6a-after-relogin.png` -- Tables list after re-login
- `qa-6b-theme-toggle.png` -- Dark mode
- `qa-7a-second-table.png` -- QA Pets table created
- `qa-7b-context-after-create.png` -- AI correctly identifies QA Pets
- `qa-7c-context-switch.png` -- AI correctly identifies Job Applications
- `qa-7d-context-return.png` -- FAIL: AI incorrectly says Job Applications when on QA Pets
- `qa-7e-data-after-nav.png` -- Data proposal correctly targets QA Pets

## Console Errors (Unexpected)

None. All 4 console errors were expected 401s on `/api/tracking/events` (from logout tracking calls when unauthenticated).

## Recommendations

### Priority 1 (Critical -- fix before release)

1. **Fix chat context on cross-table navigation (Issue #2):** When a user navigates from Table A -> list -> Table B, the AI's system prompt / context should update to reflect the current table. Currently, the conversational response uses stale context from the last table viewed in that chat session, even though tool calls correctly target the right table. This creates a confusing experience where the AI tells the user they're on the wrong table.

   Root cause likely: The chat session persists across table navigations and the AI's system prompt context is either not updated or the chat history overwhelms the updated context. The tools use `table_id` from the URL correctly, but the LLM's text generation draws from chat history.

   Potential fixes:
   - Start a new chat conversation when navigating to a different table
   - Inject a clear system message when the table context changes (e.g., "[System: User navigated to table 'QA Pets' (id=140)]")
   - Ensure the system prompt with current table context is re-sent on each message

### Priority 2 (Medium -- fix soon)

2. **Suppress suggestion chips during active proposal (Issue #1):** The spec states chips should not appear while a proposal bar is active. The AI is still emitting `SUGGESTED_VALUES` after data proposals even when an action bar is shown. The frontend should filter these out, or the backend should suppress them when a proposal is pending.

3. **Clear or scope chat history per table (Issue #3):** When navigating to a different table, the chat panel should either clear conversation history or clearly scope it to the current table. Showing QA Pets conversation history when viewing Job Applications (and vice versa) is confusing.

### Priority 3 (Low -- nice to have)

4. **Auto-scroll to new column in schema proposal:** When a new column is proposed but is off-screen (requires horizontal scroll), auto-scroll or highlight it more prominently so users can see the proposed change.

5. **Schema proposal visual differences from spec:** The spec describes a "SchemaProposalStrip" with blue/indigo gradient and green-highlighted column headers for new columns. The actual UI uses a "Proposed Table" card for creation and a plain strip for updates. Consider aligning the visual cues more closely with the spec (green highlights on new columns).
