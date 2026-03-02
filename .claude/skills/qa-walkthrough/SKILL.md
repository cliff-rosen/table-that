---
name: qa-walkthrough
description: Run a flow-aligned QA walkthrough of the table.that app. Tests the New User Flow and Core Flow using Playwright MCP, producing a structured report with DTP assessment.
---

# QA Walkthrough

## Arguments
$ARGUMENTS — optional: BASE_URL (default: http://192.168.0.12:5173) or specific phases to run (e.g., "phase 1-3", "core only"), or "prod" to run against https://tablethat.ironcliff.ai

## Instructions

You are running a QA walkthrough of the table.that application, organized around two authoritative flow specs:

1. **New User Flow** (`_specs/flows/new-user-flow.md`) — Registration, login, empty state
2. **Core Flow** (`_specs/flows/core-flow.md`) — Create table, populate, add column, enrich

This skill runs directly in the main conversation (not as a subprocess) because it needs Playwright MCP browser tools.

### Prerequisites

- Dev server must be running at the BASE_URL (default: `http://192.168.0.12:5173`)
- If argument is "prod", use `https://tablethat.ironcliff.ai`
- Playwright MCP browser tools must be available
- If the browser fails to launch, try `mcp__playwright__browser_install` first

### Test Configuration

Generate a unique test email for this run:
- Format: `qa_test_YYYYMMDD_HHmm@test.example.com` (use current timestamp)
- Password: `QaTest123!`

### Evaluation Rubric (DTP)

At every phase, evaluate the experience on three layers:

1. **Decision quality [D]** — Did the AI make the right call about what to say or which tools to use? Did it understand the user's intent? Did it pick the right tool/strategy?
2. **Tool reliability [T]** — Did the tools execute correctly? Any crashes, timeouts, 403s, empty results, lost data?
3. **Presentation clarity [P]** — Could the user follow what happened? Are results shown clearly? Are errors actionable? Is the flow intuitive?

Tag each issue you find with its layer: `[D]`, `[T]`, or `[P]`. The same symptom (e.g., "enrichment returned garbage") could be any layer — diagnose which one.

### Partial walkthrough

If the user specified specific phases or areas:
- "new user only" → Run only Phase 1
- "core only" → Run Phases 2-5 (need to register first, but focus on core)
- "phase 1-3" → Run Phases 1-3
- "cross only" → Run Phase 6

---

## Test Phases

Execute each phase in order. Take a screenshot at every checkpoint marked with [SCREENSHOT]. Check console errors at every phase transition.

---

### Phase 1: New User Flow

**Flow spec:** `_specs/flows/new-user-flow.md`

#### 1a. Landing Page

1. Navigate to the BASE_URL
2. [SCREENSHOT] `qa-1a-landing.png`
3. Check console errors (filter out expected 401s on `/api/tracking/events`)
4. **Verify (NUF checklist items):**
   - [ ] Page loads without errors
   - [ ] Hero text is visible: "Tell AI what you're tracking"
   - [ ] "Get Started Free" CTA link exists and points to /register
   - [ ] "Already have an account?" link exists and points to /login
   - [ ] Three-step section is visible (Describe it, Populate it, Put AI to work)
   - [ ] Feature cards section is visible
   - [ ] No "session expired" message visible
   - [ ] Header shows "Log in" and "Get Started" links

#### 1b. Registration

1. Click "Get Started Free"
2. **Verify (NUF Registration checklist):**
   - [ ] Registration form shows: email, password, confirm password
   - [ ] No "session expired" or error message visible to first-time visitors
3. Fill in the test email and password (both password fields)
4. Click "Register"
5. **Verify:**
   - [ ] Successful registration auto-logs in (no separate login step)
   - [ ] Redirects to `/tables`
   - [ ] No errors in console (filter out expected 401s)
6. [SCREENSHOT] `qa-1b-post-register.png`

#### 1c. Tables List (Empty State)

1. **Verify (NUF Tables List checklist):**
   - [ ] Empty state shows: table icon, "No tables yet" heading, description text
   - [ ] "Build a Table with AI" button (primary, gradient with sparkles icon)
   - [ ] "or create one manually" link visible
   - [ ] Starter prompts grid visible (3 columns on desktop)
   - [ ] Header shows: Ask AI, Import CSV, Create Table buttons
   - [ ] Dark mode toggle visible in header
   - [ ] Profile link and Logout button visible
2. [SCREENSHOT] `qa-1c-empty-state.png`

---

### Phase 2: Create Table (Core Flow Step 1)

**Flow spec:** `_specs/flows/core-flow.md` — Step 1

1. Click "Build a Table with AI" (or "Ask AI" button)
2. **Verify chat panel opens with:**
   - [ ] Welcome message with action paths
   - [ ] Suggested action buttons visible
   - [ ] Text input field at bottom
   - [ ] No console errors loading the chat
3. Type a table request (e.g., "I want to track job applications with company, position, status, salary, and application date")
4. Wait up to 30 seconds for the AI response to complete
5. [SCREENSHOT] `qa-2-schema-proposal.png`
6. **Verify (CF Step 1 checklist):**
   - [ ] AI responds with message containing SCHEMA_PROPOSAL
   - [ ] SchemaProposalStrip appears above table area (blue/indigo gradient)
   - [ ] Strip shows "Schema changes proposed — N new columns"
   - [ ] Proposed columns visible in table header with green highlight
   - [ ] Apply button enabled, Dismiss button enabled
   - [ ] No suggestion chips shown while proposal strip is active
7. Click "Apply" in the schema proposal strip
8. **Verify:**
   - [ ] Table created, columns appear, strip disappears
   - [ ] Success toast shown
   - [ ] AI sends follow-up message suggesting data population
   - [ ] Suggestion chips appear (e.g., "Add sample rows")
   - [ ] URL changed to /tables/{id}
9. [SCREENSHOT] `qa-2-table-created.png`

---

### Phase 3: Populate Data (Core Flow Step 2)

**Flow spec:** `_specs/flows/core-flow.md` — Step 2

1. Ask AI to add data (type "Add 5 sample job applications" or click a suggested action)
2. Wait up to 30 seconds for the data proposal to complete
3. [SCREENSHOT] `qa-3-data-proposal.png`
4. **Verify (CF Step 2 checklist):**
   - [ ] AI responds with message containing DATA_PROPOSAL
   - [ ] ProposalActionBar appears above table (violet/blue gradient)
   - [ ] Bar shows "AI Proposed Changes — N additions"
   - [ ] New rows appear in table with green tint
   - [ ] Each row has a checkbox (checked by default)
   - [ ] Select All / Deselect All links work
   - [ ] Apply button shows correct count
   - [ ] No suggestion chips while action bar is active
5. Click "Apply" (or "Apply All")
6. **Verify:**
   - [ ] Progress bar appears, rows show spinners then checkmarks
   - [ ] Success banner: "All N changes applied" (green background)
   - [ ] Action bar auto-dismisses after ~600ms
   - [ ] Table refreshes with saved rows (real IDs, no longer green)
   - [ ] AI sends follow-up with suggestion chips for enrichment
7. [SCREENSHOT] `qa-3-populated.png`

---

### Phase 4: Add Column (Core Flow Step 3)

**Flow spec:** `_specs/flows/core-flow.md` — Step 3

> Note: This phase depends on AI cooperation. If the AI doesn't produce a proper SCHEMA_PROPOSAL, mark as SKIP with notes.

1. Ask AI to add a column (e.g., "Add a Website column" or "Add a notes column")
2. Wait up to 30 seconds for the schema proposal
3. [SCREENSHOT] `qa-4-add-column.png`
4. **Verify (CF Step 3 checklist):**
   - [ ] AI responds with SCHEMA_PROPOSAL (mode: update)
   - [ ] SchemaProposalStrip appears with "Schema changes proposed — 1 new column"
   - [ ] New column header visible with green highlight
   - [ ] Existing rows show empty cells in new column
5. Click "Apply"
6. **Verify:**
   - [ ] Column added, strip disappears, table refreshes
   - [ ] AI proactively suggests filling the new column
   - [ ] Suggestion chips for enrichment (e.g., "Fill it with AI research")
7. [SCREENSHOT] `qa-4-column-added.png`

---

### Phase 5: Enrich (Core Flow Step 4)

**Flow spec:** `_specs/flows/core-flow.md` — Step 4

> Note: This phase depends on AI cooperation and enrich_column tool. If the AI doesn't call enrich_column, mark as SKIP with notes.

1. Ask AI to fill the new column (e.g., "Research the website for each company" or click suggested action)
2. Wait up to 60 seconds for enrichment (this is slower — multiple web searches)
3. [SCREENSHOT] `qa-5-enriching.png` (capture during progress if possible)
4. **Verify (CF Step 4 checklist):**
   - [ ] AI calls enrich_column tool (visible in chat as tool use)
   - [ ] ProposalActionBar appears with progress bar
   - [ ] Progress bar advances as rows are processed
   - [ ] After enrichment: updated cells show green highlight
5. If enrichment completes with a data proposal, click "Apply"
6. **Verify:**
   - [ ] Progress tracking, success banner
   - [ ] Auto-dismisses after completion
   - [ ] Table refreshes with enriched data in target column
7. [SCREENSHOT] `qa-5-enriched.png`

---

### Phase 6: Cross-Cutting Checks

**Flow spec:** Both flows

#### 6a. Session Persistence

1. Click "Logout"
2. **Verify:**
   - [ ] Redirects to landing page
   - [ ] No "session expired" message on landing page
3. Click "Log in"
4. Log in with the test credentials
5. **Verify:**
   - [ ] Login form loads without errors
   - [ ] Redirects to /tables after login
   - [ ] Previously created table is visible with correct row count
   - [ ] Data persisted across logout/login
6. [SCREENSHOT] `qa-6a-after-relogin.png`

#### 6b. UI Polish

1. **Dark/Light mode toggle:**
   - Click the theme toggle button in the header
   - [SCREENSHOT] `qa-6b-theme-toggle.png`
   - Verify the theme changed (background color)
   - Toggle back

2. **Profile page:**
   - Click the profile icon in the header
   - **Verify:**
     - [ ] Settings page loads
     - [ ] Email displayed (matches test email)
     - [ ] Full Name and Job Title fields present
   - Navigate back to Tables

#### 6c. Console Error Audit

1. Fetch all console errors accumulated during the test
2. **Categorize:**
   - **Expected:** 401 on `/api/tracking/events` (unauthenticated), CORS warnings
   - **Unexpected:** Any 404s, 500s, unhandled promise rejections, React errors

---

## Cleanup

After all tests, close the browser.

Note: Do NOT delete the test user or table — leave them for manual inspection if needed.

---

## Output

### 1. Signal Report

Write the full report to `_specs/signal/qa-latest.md`, overwriting the previous content. Use this format:

```markdown
# QA Walkthrough Report

**Date:** [current date]
**Test User:** [email used]
**Base URL:** [URL tested]
**Browser:** Playwright (Chromium)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Register + Empty State | PASS/FAIL | [count] |
| 2 | Core Flow Step 1 | Create Table | PASS/FAIL | [count] |
| 3 | Core Flow Step 2 | Populate Data | PASS/FAIL | [count] |
| 4 | Core Flow Step 3 | Add Column | PASS/FAIL/SKIP | [count] |
| 5 | Core Flow Step 4 | Enrich | PASS/FAIL/SKIP | [count] |
| 6 | Cross-Cutting | Session + UI + Console | PASS/FAIL | [count] |

**Overall: [X/6 phases passed]**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1 | n/a | PASS/FAIL | PASS/FAIL | [notes] |
| 2 | PASS/FAIL | PASS/FAIL | PASS/FAIL | [notes] |
| 3 | PASS/FAIL | PASS/FAIL | PASS/FAIL | [notes] |
| 4 | PASS/FAIL/SKIP | PASS/FAIL/SKIP | PASS/FAIL/SKIP | [notes] |
| 5 | PASS/FAIL/SKIP | PASS/FAIL/SKIP | PASS/FAIL/SKIP | [notes] |
| 6 | n/a | PASS/FAIL | PASS/FAIL | [notes] |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Registration form shows: email, password, confirm password | PASS/FAIL | 1b | |
| Password validation: minimum 5 characters | NOT TESTED | — | API test covers this |
| Successful registration auto-logs in | PASS/FAIL | 1b | |
| Redirects to /tables after registration | PASS/FAIL | 1b | |
| Empty state shows: table icon, "No tables yet" | PASS/FAIL | 1c | |
| "Build a Table with AI" button | PASS/FAIL | 1c | |
| Starter prompts grid visible | PASS/FAIL | 1c | |
| Header shows: Ask AI, Import CSV, Create Table | PASS/FAIL | 1c | |

### Core Flow (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| AI responds with SCHEMA_PROPOSAL (create) | PASS/FAIL | 2 | |
| SchemaProposalStrip appears | PASS/FAIL | 2 | |
| Apply creates table, strip disappears | PASS/FAIL | 2 | |
| AI responds with DATA_PROPOSAL | PASS/FAIL | 3 | |
| ProposalActionBar appears | PASS/FAIL | 3 | |
| Apply inserts rows with progress | PASS/FAIL | 3 | |
| SCHEMA_PROPOSAL (update) for new column | PASS/FAIL/SKIP | 4 | |
| New column appears with green highlight | PASS/FAIL/SKIP | 4 | |
| enrich_column tool called | PASS/FAIL/SKIP | 5 | |
| Progress bar during enrichment | PASS/FAIL/SKIP | 5 | |
| Enriched data applied to table | PASS/FAIL/SKIP | 5 | |

## Issues Found

| # | Severity | Layer | Phase | Description | Evidence |
|---|----------|-------|-------|-------------|----------|
| 1 | Critical/Medium/Low/Cosmetic | D/T/P | [phase] | [description] | [screenshot or console log] |

## Screenshots

[List all screenshots taken with filenames]

## Console Errors (Unexpected)

[List any unexpected console errors with context]

## Recommendations

[Prioritized list of fixes needed before release]
```

### 2. Conversation Summary

After writing the signal report, present a summary to the user:
- Overall pass/fail count
- DTP assessment highlights
- Critical issues (if any)
- Top recommendations
- Offer to fix any issues found

---

## Timing Notes

- AI chat responses typically take 10-20 seconds. Use `browser_wait_for` with appropriate timeouts.
- Data proposal application takes 5-10 seconds for 5-8 rows.
- Enrichment can take 30-60 seconds (multiple web searches per row).
- If a response seems stuck after 45 seconds, take a screenshot and note it as a timeout issue.

## Error Recovery

- If registration fails (email taken), generate a new email with a different timestamp and retry.
- If the chat returns an error, screenshot it, note it, and try to continue with remaining phases.
- If the browser crashes, note the phase and error, and report what was completed.
- Phases 4-5 may SKIP if AI doesn't produce the expected proposal type — this is acceptable and should be noted but not treated as a failure.
