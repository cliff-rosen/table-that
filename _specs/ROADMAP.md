# table.that Roadmap

## Defects

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|

## Features

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|
| #1 | P2 | Background/scheduled for_each_row | open | 2026-02-26 | |
| #2 | P1 | Extensible for_each_row framework | open | 2026-02-26 | |
| #3 | P1 | Improved for_each_row results UX | open | 2026-02-26 | |
| #4 | P1 | Rich table display | open | 2026-02-26 | |
| #5 | P2 | Google social login | open | 2026-02-26 | |
| #6 | P2 | Mobile experience | open | 2026-02-26 | |
| #7 | P2 | Email and SMS integration | open | 2026-02-26 | |

## Tasks

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|

## Details

### #1 — Background/scheduled for_each_row
Currently for_each_row runs synchronously in the chat stream. Need a background variant that can be kicked off and run asynchronously, with support for scheduling (e.g., "refresh LinkedIn URLs every week"). Enables long-running research jobs without blocking the chat, and opens the door to scheduled/recurring table maintenance.

### #2 — Extensible for_each_row framework
Generalize for_each_row beyond just web research. Support simple tool calls, agentic multi-step tool chains, and custom operations per row. The framework should be pluggable so new row-level operations can be added without changing the orchestration layer.

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
