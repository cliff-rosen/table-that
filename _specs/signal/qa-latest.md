# QA Walkthrough Report

**Date:** 2026-03-04
**Test User:** qa_test_20260304_1900@test.example.com (converted from guest)
**Base URL:** http://localhost:5174
**Browser:** Playwright (Chromium)
**Scope:** Phases 1-5 (New User Flow + Core Flow)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Guest + Register + Tables List | PASS | 0 |
| 2 | Core Flow Step 1 | Create Table | PASS | 0 |
| 3 | Core Flow Step 2 | Populate Data | PASS | 0 |
| 4 | Core Flow Step 3 | Add Column | PASS | 0 |
| 5 | Core Flow Step 4 | Enrich | PASS | 0 |
| 6 | Cross-Cutting | Session + UI + Console | SKIP | — |
| 7 | Context Integrity | Table navigation + chat context | SKIP | — |

**Overall: 5/5 tested phases passed**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1a | n/a | PASS | PASS | Landing page renders correctly |
| 1b-alt | n/a | PASS | PASS | Guest flow, guest limit, pill disabling all working |
| 1b | n/a | PASS | PASS | Guest conversion resets limit, restores UI |
| 1c | n/a | PASS | PASS | Registered user sees correct header + StarterGrid |
| 2 | PASS | PASS | PASS | AI proposed correct schema, preview with sample data |
| 3 | PASS | PASS | PASS | AI proposed 5 realistic rows, all applied successfully |
| 4 | PASS | PASS | PASS | AI added Website column in correct position |
| 5 | PASS | PASS | PASS | AI researched all 5 career URLs, 100% found rate |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Pain-statement hero visible | PASS | 1a | "Here's your updated table." / "You check. It's not updated." |
| Textarea with placeholder "Describe your table..." | PASS | 1a | Correct placeholder |
| "Create Table" submit button | PASS | 1a | Disabled when empty |
| 4 starter pills (full prompt text) | PASS | 1a | All 4 present with full prompt as label |
| Header: "Log in" and "Get Started" links | PASS | 1a | Both present |
| No "session expired" message | PASS | 1a | Clean load |
| Guest flow: pill → guest session → /tables + chat | PASS | 1b-alt | "Track Job Applications" → guest login → /tables, chat open, prompt sent |
| Guest restrictions (no Import/Create/StarterGrid/Edit Schema) | PASS | 1b-alt | All hidden for guest |
| "Log in" + "Register to save your work" in header (guest) | PASS | 1b-alt | Both present |
| Guest limit: input hidden, pills disabled | PASS | 1b-alt | After 2 messages: "Register to continue" shown, 4 suggestion pills all [disabled] |
| GuestRegistrationModal: 2 fields | PASS | 1b | "Save your work" heading, email + password, "Create Account" button |
| Registration resets guest limit | PASS | 1b | Input restored, pills re-enabled, Edit Schema appeared |
| Header switches to profile + logout | PASS | 1b | Profile icon + Logout after conversion |
| Import CSV + Create Table in header (registered) | PASS | 1c | Both visible |
| StarterGrid visible (registered) | PASS | 1c | 6 starter cards (title + description format) |
| Dark mode toggle visible | PASS | 1c | Moon icon in header |
| PromptHero (no tables, chat closed) | NOT TESTED | 1c | User had 1 table from guest flow |
| "Your table will appear here" (chat open, no tables) | PASS | 1b-alt | Shown before table was created |

### Core Flow (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| AI responds with SCHEMA_PROPOSAL (create) | PASS | 2 | 5 columns: Company, Role, Salary, Status, Interview Date |
| Schema preview appears with sample data | PASS | 2 | 3 sample rows in preview, "Include sample data" checkbox |
| Apply creates table, preview disappears | PASS | 2 | Table created, navigated to /tables/172 |
| AI sends follow-up with suggestion chips | PASS | 2 | 4 chips: Add my first application, Import CSV, Add sample applications, Research companies |
| AI responds with DATA_PROPOSAL | PASS | 3 | 5 additions: Google, Stripe, Airbnb, Netflix, Shopify |
| ProposalActionBar appears | PASS | 3 | "AI Proposed Changes — 5 additions", Select All/Deselect All, Apply All 5 |
| Each row has checkbox (checked by default) | PASS | 3 | All 5 checked |
| Apply inserts rows with progress | PASS | 3 | Success: "All 5 changes applied" |
| AI follow-up with enrichment suggestions | PASS | 3 | "Add a priority column", "Research company details", etc. |
| SCHEMA_PROPOSAL (update) for new column | PASS | 4 | "Schema changes proposed — 1 new column" (Website) |
| New column header visible with green highlight | PASS | 4 | Website column between Company and Role |
| Existing rows show empty cells | PASS | 4 | All 5 rows show "—" in Website |
| Column added, strip disappears | PASS | 4 | 6 columns now |
| AI suggests filling the new column | PASS | 4 | "Research career page URLs for all companies" chip |
| enrich_column tool called | PASS | 5 | Tool name: "Enrich Column" (chip in chat) |
| Research log summary | PASS | 5 | 5 found, 0 not found |
| Enriched data applied to table | PASS | 5 | All 5 career URLs populated correctly |
| Tools used | PASS | 5 | Get Rows + Enrich Column (2 tools visible) |

## Enrichment Details (Phase 5)

| Company | URL Found | Value |
|---------|-----------|-------|
| Netflix | Yes | https://jobs.netflix.com/ |
| Shopify | Yes | https://www.shopify.com/careers |
| Google | Yes | https://www.google.com/about/careers/applications/ |
| Stripe | Yes | https://stripe.com/jobs |
| Airbnb | Yes | https://careers.airbnb.com/ |

## Issues Found

No issues found. All checklist items passed.

## Screenshots

All in `_specs/signal/qa-runs/20260304-1900/`:

| File | Phase | Description |
|------|-------|-------------|
| qa-1a-landing.png | 1a | Landing page: hero, textarea, 4 starter pills, header |
| qa-1b-alt-guest.png | 1b-alt | Guest: chat open, schema proposal preview, guest header |
| qa-1b-alt-guest-limit.png | 1b-alt | Guest limit hit: pills disabled, "Register to continue" shown |
| qa-1b-post-register.png | 1b | After conversion: Edit Schema visible, chat input restored |
| qa-1c-tables-list.png | 1c | Tables list: 1 table, Import CSV, Create Table, 6 StarterGrid cards |
| qa-2-table-created.png | 2 | Table created: 5 columns, 0 rows, chat with follow-up |
| qa-3-data-proposal.png | 3 | Data proposal: 5 rows with green tint, checkboxes, Apply All 5 |
| qa-3-populated.png | 3 | After apply: 5 rows saved, AI follow-up with suggestions |
| qa-4-add-column.png | 4 | Schema proposal: Website column with green highlight |
| qa-4-column-added.png | 4 | Column added: 6 columns, empty Website cells |
| qa-5-enrichment-complete.png | 5 | Enrichment results: 5 URLs found, research log, Apply All 5 |
| qa-5-enriched.png | 5 | After apply: all 5 career URLs populated in table |

## Console Errors (Unexpected)

None. Only expected 401 on `/api/tracking/events` (unauthenticated guest tracking call).

## Recommendations

1. **GUEST_TURN_LIMIT is set to 2** — fires after just the initial prompt + "[User accepted...]" system message. Consider increasing to allow guests to explore more before hitting the limit.
2. **PromptHero empty state not testable via guest flow** — guest always creates a table, so PromptHero (no tables + chat closed) requires a separate fresh registration test.
3. **Schema preview sample data checkbox unchecked by default** — the "Include sample data (3 rows)" checkbox was unchecked, so the table was created empty. This is fine behavior but worth noting — the sample data from the preview was not carried over.
