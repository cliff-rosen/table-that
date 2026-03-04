# QA Walkthrough Report

**Date:** 2026-03-03
**Test User:** qa_test_20260303_1500@test.example.com
**Base URL:** http://localhost:5174
**Browser:** Playwright (Chromium)
**Scope:** New User Flow only (Phase 1)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 1 | New User Flow | Landing + Guest Flow + Register + Empty State | PASS | 0 |
| 2 | Core Flow Step 1 | Create Table | NOT RUN | — |
| 3 | Core Flow Step 2 | Populate Data | NOT RUN | — |
| 4 | Core Flow Step 3 | Add Column | NOT RUN | — |
| 5 | Core Flow Step 4 | Enrich | NOT RUN | — |
| 6 | Cross-Cutting | Session + UI + Console | NOT RUN | — |
| 7 | Context Integrity | Table navigation + chat context | NOT RUN | — |

**Overall: 1/1 phases passed (scoped to "new user only")**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 1a | n/a | PASS | PASS | Landing page renders correctly |
| 1b-alt | n/a | PASS | PASS | Guest flow works end-to-end |
| 1b | n/a | PASS | PASS | Registration auto-logs in, redirects to /tables |
| 1c | n/a | PASS | PASS | PromptHero and waiting state both work |

## Checklist Coverage

### New User Flow (`_specs/flows/new-user-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| Pain-statement hero visible | PASS | 1a | "Here's your updated table." / "You check. It's not updated." |
| Textarea + Create Table button + 4 starters | PASS | 1a | All present; button disabled when empty |
| Header: "Log in" and "Get Started" links | PASS | 1a | Both link to /login and /register |
| No "session expired" message | PASS | 1a | Clean load |
| Guest flow: starter pill → guest session → /tables + chat | PASS | 1b-alt | "Favorite Restaurants" pill → guest login → /tables with chat open and prompt sent |
| Guest restrictions (no Import/Create/StarterGrid) | PASS | 1b-alt | All hidden for guest |
| "Register to save your work" in header (guest) | PASS | 1b-alt | Blue link in top-right |
| Registration form shows: email, password, confirm password | PASS | 1b | All three fields present |
| No "session expired" or error message | PASS | 1b | Clean form |
| Successful registration auto-logs in | PASS | 1b | Redirected directly to /tables |
| Redirects to /tables after registration | PASS | 1b | URL confirmed |
| No console errors | PASS | 1b | 0 errors (only expected 401 on tracking) |
| PromptHero visible (no tables, chat closed) | PASS | 1c | "What do you want to track?" heading, textarea, button, 4 pills, manual link |
| Submitting prompt opens chat and sends message | PASS | 1c | "Track my job applications" → chat opened, AI responded with SCHEMA_PROPOSAL |
| "Your table will appear here" (chat open, no tables) | PASS | 1c | Faded table icon + heading shown |
| Import CSV + Create Table in header | PASS | 1c | Visible in right panel header when chat open |
| Dark mode toggle visible | PASS | 1c | Moon icon in header |

## Issues Found

No issues found. All checklist items passed.

## Screenshots

| File | Phase | Description |
|------|-------|-------------|
| qa-1a-landing.png | 1a | Landing page with pain-statement hero |
| qa-1b-alt-guest.png | 1b-alt | Guest flow: chat open, "Register to save your work" in header, waiting state |
| qa-1b-post-register.png | 1b | Post-registration: PromptHero empty state with profile/logout in header |
| qa-1c-empty-state.png | 1c | Chat open with AI streaming + waiting state |
| qa-1c-proposal-preview.png | 1c | ProposedTablePreview rendered with Job Applications table |
| qa-1c-layout-bug.png | 1c | Wide viewport showing PromptHero clean render |

## Console Errors (Unexpected)

None. Only expected 401 on `/api/tracking/events` (unauthenticated guest tracking call).

## Notes

- Backend must be running on localhost:8001 (not reachable at LAN IP 192.168.0.12:8001 — bound to 127.0.0.1)
- QA skill default BASE_URL updated from :5173 to :5174 during this run
- The chat panel auto-opens on registration (welcome message), but PromptHero still renders correctly because the internal `chatOpen` state starts as false

## Recommendations

None — the new user flow is working correctly across all paths (guest try-it, explicit registration, PromptHero, waiting state).
