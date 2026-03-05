# QA Walkthrough Report

**Date:** 2026-03-04
**Test User:** qa_test_20260304_1845@test.example.com (converted from guest)
**Base URL:** http://localhost:5174
**Browser:** Playwright (Chromium)
**Scope:** Phase 1 only (New User Flow)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Guest + Register + Tables List | PASS | 0 |
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
| 1b-alt | n/a | PASS | PASS | Guest flow, guest limit, pill disabling all working |
| 1b | n/a | PASS | PASS | Guest conversion resets limit, restores UI |
| 1c | n/a | PASS | PASS | Registered user sees correct header + StarterGrid |

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
| Guest limit: input hidden, pills disabled | PASS | 1b-alt | After 2 messages: "Register to continue" shown, 3 suggestion pills all [disabled] |
| GuestRegistrationModal: 2 fields | PASS | 1b | "Save your work" heading, email + password, "Create Account" button |
| Registration resets guest limit | PASS | 1b | Input restored, pills re-enabled, Edit Schema appeared |
| Header switches to profile + logout | PASS | 1b | Profile icon + Logout after conversion |
| Import CSV + Create Table in header (registered) | PASS | 1c | Both visible |
| StarterGrid visible (registered) | PASS | 1c | 6 starter cards (title + description format) |
| Dark mode toggle visible | PASS | 1c | Moon icon in header |
| PromptHero (no tables, chat closed) | NOT TESTED | 1c | User had 1 table from guest flow |
| "Your table will appear here" (chat open, no tables) | PASS | 1b-alt | Shown before table was created |

## Issues Found

No issues found. All checklist items passed.

## Screenshots

All in `_specs/signal/qa-runs/20260304-1845/`:

| File | Phase | Description |
|------|-------|-------------|
| qa-1a-landing.png | 1a | Landing page: hero, textarea, 4 starter pills, header |
| qa-1b-alt-guest.png | 1b-alt | Guest: chat open, schema proposal preview, guest header |
| qa-1b-alt-guest-limit.png | 1b-alt | Guest limit hit: pills disabled, "Register to continue" shown |
| qa-1b-post-register.png | 1b | After conversion: Edit Schema visible, chat input restored |
| qa-1c-tables-list.png | 1c | Tables list: 1 table, Import CSV, Create Table, 6 StarterGrid cards |

## Console Errors (Unexpected)

None. Only expected 401 on `/api/tracking/events` (unauthenticated guest tracking call).

## Recommendations

1. **GUEST_TURN_LIMIT is set to 2** — fires after just the initial prompt + "[User accepted...]" system message. User plans to increase this.
2. **PromptHero empty state not testable via guest flow** — guest always creates a table, so PromptHero (no tables + chat closed) requires a separate fresh registration test.
