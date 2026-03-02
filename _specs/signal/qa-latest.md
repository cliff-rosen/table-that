# QA Walkthrough Report

**Date:** 2026-03-02
**Test User:** qa_test_20260302_0025@test.example.com
**Base URL:** http://192.168.0.12:5173
**Browser:** Playwright (Chromium)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Register + Empty State | PASS | 0 |
| 2 | Core Flow Step 1 | Create Table | PASS | 0 |
| 3 | Core Flow Step 2 | Populate Data | PASS | 0 |
| 4 | Core Flow Step 3 | Add Column | PASS | 0 |
| 5 | Core Flow Step 4 | Enrich | PASS | 1 |
| 6 | Cross-Cutting | Session + UI + Console | PASS | 0 |

**Overall: 6/6 phases passed**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1 | n/a | PASS | PASS | Landing, registration, empty state all clean |
| 2 | PASS | PASS | PASS | AI produced SCHEMA_PROPOSAL with 9 well-chosen columns including extras (Job URL, Contact Person, Notes, Follow-up Date) |
| 3 | PASS | PASS | PASS | AI produced DATA_PROPOSAL with 6 realistic sample applications across different statuses |
| 4 | PASS | PASS | PASS | AI produced SCHEMA_PROPOSAL (update) adding Priority column with P0-P3 select options |
| 5 | PASS (with note) | PASS | PASS | Enrichment completed successfully. Minor [D] issue: AI chat said P1 for Google/Shopify and P2 for Stripe/Microsoft, but computation strategy assigned P0 to all of them. Only Airbnb (rejected) got P3. |
| 6 | n/a | PASS | PASS | Session persistence, dark mode, profile all working |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Page loads without errors | PASS | 1a | |
| Hero text visible: "Tell AI what you're tracking" | PASS | 1a | |
| "Get Started Free" CTA links to /register | PASS | 1a | |
| "Already have an account?" links to /login | PASS | 1a | |
| Three-step section visible (Describe, Populate, Put AI to work) | PASS | 1a | |
| Feature cards section visible | PASS | 1a | |
| No "session expired" message visible | PASS | 1a | |
| Header shows "Log in" and "Get Started" links | PASS | 1a | |
| Registration form shows: email, password, confirm password | PASS | 1b | |
| No "session expired" or error message for first-time visitors | PASS | 1b | |
| Password validation: minimum 5 characters | NOT TESTED | — | API test covers this |
| Successful registration auto-logs in | PASS | 1b | |
| Redirects to /tables after registration | PASS | 1b | |
| Empty state shows: table icon, "No tables yet" heading | PASS | 1c | |
| "Build a Table with AI" button (primary, gradient with sparkles) | PASS | 1c | |
| "or create one manually" link visible | PASS | 1c | |
| Starter prompts grid visible (3 columns on desktop) | PASS | 1c | 6 starter prompts in 3-column grid |
| Header shows: Ask AI, Import CSV, Create Table buttons | PASS | 1c | |
| Dark mode toggle visible in header | PASS | 1c | |
| Profile link and Logout button visible | PASS | 1c | |

### Core Flow (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Chat panel opens with welcome message | PASS | 2 | Welcome message + 4 suggested action buttons |
| AI responds with SCHEMA_PROPOSAL (create) | PASS | 2 | 9 columns proposed including extras |
| SchemaProposalStrip appears | PASS | 2 | Blue/indigo gradient with "Schema changes proposed" |
| Proposed columns visible with green highlight | PASS | 2 | |
| Apply creates table, strip disappears | PASS | 2 | |
| Success toast shown | PASS | 2 | |
| AI sends follow-up suggesting data population | PASS | 2 | With 4 suggestion chips |
| URL changed to /tables/{id} | PASS | 2 | /tables/113 |
| AI responds with DATA_PROPOSAL | PASS | 3 | 6 sample job applications |
| ProposalActionBar appears (violet/blue gradient) | PASS | 3 | "AI Proposed Changes — 6 additions" |
| New rows appear with green tint | PASS | 3 | |
| Each row has checkbox (checked by default) | PASS | 3 | |
| Select All / Deselect All links work | PASS | 3 | Visible in action bar |
| Apply button shows correct count | PASS | 3 | "Apply All 6" |
| Progress bar appears, rows show spinners then checkmarks | PASS | 3 | |
| Success banner: "All N changes applied" | PASS | 3 | "All 6 changes applied" |
| Action bar auto-dismisses | PASS | 3 | |
| Table refreshes with saved rows | PASS | 3 | |
| AI sends follow-up with suggestion chips | PASS | 3 | 4 chips including "Add a Priority column" |
| SCHEMA_PROPOSAL (update) for new column | PASS | 4 | Priority column with P0-P3 options |
| SchemaProposalStrip shows "1 new column" | PASS | 4 | |
| New column header visible with green highlight | PASS | 4 | |
| Column added, strip disappears | PASS | 4 | |
| AI proactively suggests filling new column | PASS | 4 | "Set priorities for existing applications" chip |
| enrich_column tool called | PASS | 5 | Visible as "Enrich Column" tool use in chat |
| ProposalActionBar appears with progress | PASS | 5 | "AI Proposed Changes — 6 updates" |
| Research Log shows results | PASS | 5 | "6 found, 0 not found" |
| After enrichment: updated cells show values | PASS | 5 | P0-Critical for 5, P3-Low for Airbnb |
| Apply saves enriched data | PASS | 5 | "All 6 changes applied" success banner |
| Action bar auto-dismisses after completion | PASS | 5 | |
| Table refreshes with enriched data | PASS | 5 | Priority column populated |

## Issues Found

| # | Severity | Layer | Phase | Description | Evidence |
|---|----------|-------|-------|-------------|----------|
| 1 | Low | D | 5 | Enrichment priority values don't match AI's stated reasoning. AI chat said P1 for Google/Shopify, P2 for Stripe/Microsoft, but computation strategy assigned P0 - Critical to all four. Only Airbnb (rejected) correctly got P3 - Low. The enrichment "flattened" the priority distribution. | qa-5-enriching.png — chat lists P0/P1/P2/P3 breakdown but table shows 5x P0 + 1x P3 |

## Screenshots

| File | Phase | Description |
|------|-------|-------------|
| qa-1a-landing.png | 1a | Landing page |
| qa-1b-post-register.png | 1b | Post-registration redirect to /tables |
| qa-1c-empty-state.png | 1c | Empty state with starter prompts |
| qa-2-schema-proposal.png | 2 | Schema proposal card for Job Applications |
| qa-2-table-created.png | 2 | Table created with 9 columns |
| qa-3-data-proposal.png | 3 | Data proposal with 6 sample rows |
| qa-3-populated.png | 3 | Table populated with 6 rows |
| qa-4-add-column.png | 4 | Schema proposal for Priority column |
| qa-4-column-added.png | 4 | Priority column added to table |
| qa-5-enriching.png | 5 | Enrichment results with ProposalActionBar |
| qa-5-enriched.png | 5 | Table with enriched Priority values |
| qa-6a-after-relogin.png | 6a | Tables list after logout/login |
| qa-6b-theme-toggle.png | 6b | Dark mode active |

## Console Errors (Unexpected)

None. All 4 console errors were expected 401s on `/api/tracking/events` (unauthenticated tracking endpoint calls during logout).

## Recommendations

1. **[Low] Improve enrichment priority differentiation** — The computation strategy for the Priority column assigned P0 - Critical to 5 of 6 rows, which doesn't meaningfully differentiate. Consider tuning the computation strategy prompt to produce more varied priority assignments that match the AI's own reasoning (it correctly identified P1/P2/P3 tiers in its chat message but the tool didn't follow through).

2. **No blocking issues found** — All 6 phases passed. The core flow (build -> populate -> add column -> enrich) works end-to-end through the browser UX. Session persistence, auth, dark mode, and profile all function correctly.
