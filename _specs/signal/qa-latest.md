# QA Walkthrough Report

**Date:** 2026-03-04
**Test User:** qa_test_20260304_1200@test.example.com (converted from guest)
**Base URL:** http://localhost:5174
**Browser:** Playwright (Chromium)
**Scope:** Phase 1 only (New User Flow)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Guest + Register + Tables List | PASS | 2 |
| 2 | Core Flow Step 1 | Create Table | SKIP | — |
| 3 | Core Flow Step 2 | Populate Data | SKIP | — |
| 4 | Core Flow Step 3 | Add Column | SKIP | — |
| 5 | Core Flow Step 4 | Enrich | SKIP | — |
| 6 | Cross-Cutting | Session + UI + Console | SKIP | — |
| 7 | Context Integrity | Table navigation + chat context | SKIP | — |

**Overall: 1/1 tested phases passed**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1a | n/a | PASS | PASS | Landing page renders correctly |
| 1b-alt | n/a | PASS | PASS | Guest flow works end-to-end, guest limit + pill disabling confirmed |
| 1b | n/a | PASS | PASS | Registration via guest conversion works, resets limit |
| 1c | n/a | PASS | PASS | Tables list shows correct elements for registered user |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Pain-statement hero visible | PASS | 1a | "Here's your updated table." / "You check. It's not updated." |
| Textarea with placeholder "Describe your table..." | PASS | 1a | Correct placeholder text |
| "Create Table" submit button | PASS | 1a | Disabled when textarea empty (correct) |
| 4 starter pills on landing | PASS | 1a | Full prompt text shown as button labels, not short titles (see Issue #1) |
| Header: "Log in" and "Get Started" links | PASS | 1a | Both present in PublicTopBar |
| No "session expired" message | PASS | 1a | Clean landing page |
| Guest flow: prompt → guest session → /tables + chat | PASS | 1b-alt | Clicked "Track Job Applications" pill, redirected to /tables, chat opened, prompt sent |
| Guest restrictions (no Import/Create/StarterGrid/Edit Schema) | PASS | 1b-alt | No Import CSV, no Create Table, no StarterGrid, no Edit Schema in toolbar |
| "Log in" + "Register to save your work" in header (guest) | PASS | 1b-alt | Both buttons present |
| Guest limit: input hidden, pills disabled | PASS | 1b-alt | After 2 messages (GUEST_TURN_LIMIT=2): input replaced with "Register to continue", all 4 suggestion pills [disabled] |
| GuestRegistrationModal: 2 fields, converts account | PASS | 1b | "Save your work" heading, email + password, "Create Account" button |
| Registration resets guest limit | PASS | 1b | After conversion: input restored, pills re-enabled, Edit Schema appeared |
| Header switches to profile + logout | PASS | 1b | Profile icon + Logout shown after conversion |
| Import CSV + Create Table in header (registered) | PASS | 1c | Both buttons visible on /tables |
| StarterGrid visible (registered) | PASS | 1c | 6 starter cards shown (see Issue #2) |
| Dark mode toggle visible | PASS | 1c | Moon icon present in header |
| PromptHero (no tables, chat closed) | NOT TESTED | 1c | User already had 1 table from guest flow, so PromptHero not triggered |
| "Your table will appear here" (chat open, no tables) | PASS | 1b-alt | Shown during guest flow before table creation |

## Issues Found

| # | Severity | Layer | Phase | Description | Evidence |
|---|----------|-------|-------|-------------|----------|
| 1 | Low | P | 1a | Landing page starter pills show full prompt text as button labels (e.g., "Build me a list of top dentists...") rather than short titles ("Find a Dentist"). Spec says short names. Not a bug — different display format on landing vs. tables list. | qa-1a-landing.png |
| 2 | Low | P | 1c | StarterGrid shows 6 starters (includes "Plan a Wedding" and "Home Renovation") while landing page shows only 4 and spec documents only 4. Not a bug — different components use different subsets of starter prompts. | qa-1c-empty-state.png |

## Screenshots

| File | Phase | Description |
|------|-------|-------------|
| qa-1a-landing.png | 1a | Landing page with hero, textarea, 4 starter pills |
| qa-1b-alt-guest.png | 1b-alt | Guest session: chat open, schema proposal showing, "Your table will appear here" |
| qa-1b-alt-guest-table.png | 1b-alt | Guest after table creation: guest limit hit, pills disabled, "Register to continue" |
| qa-1b-post-register.png | 1b | After guest conversion: Edit Schema visible, chat input restored, registered header |
| qa-1c-empty-state.png | 1c | Tables list for registered user: 1 table card, StarterGrid with 6 starters |

## Console Errors (Unexpected)

None. Only expected 401 on `/api/tracking/events` (unauthenticated guest tracking call).

## Recommendations

1. **Update spec starter pill documentation** — Landing page shows full prompt text as pill labels, not short titles. The StarterGrid on tables list shows 6 starters with short titles + descriptions. Document both behaviors separately.
2. **GUEST_TURN_LIMIT is set to 2** — Fires almost immediately (initial prompt + "[User accepted...]" system message = 2). Guest barely interacts before being blocked. The user mentioned they'd increase this.
3. **Test PromptHero empty state separately** — The guest flow always creates a table, so PromptHero (shown when no tables + chat closed) can only be tested with a fresh registered user who has no tables yet.
