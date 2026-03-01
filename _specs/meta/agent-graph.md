# Agent Graph

## Overview

This document defines the players (agents and skills) that implement the operational cycle described in `management-plane.md`. Each player is mapped to the cycle node(s) it serves.

For the contract schema that defines each player's inputs, outputs, and side effects, see `agent-contract-schema.md`.

## The Operational Cycle (reference)

```
Strategize → Build → Verify → Deploy → Observe
     ↑                                      │
     └──────────────────────────────────────┘
```

## Players

A player is anything that performs work in the cycle — whether implemented as a skill (runs in main conversation context) or an agent (runs as an isolated subprocess).

| Player | Cycle Node(s) | Type | Needs MCP? | Status |
|--------|---------------|------|------------|--------|
| PMF Director | Strategize | skill | No | Exists |
| Marketing | Strategize | ? | No | Not built |
| Code Review | Verify | agent | No | Exists |
| QA Walkthrough | Verify, Observe | skill | Yes (Playwright) | Exists |
| Eval Runner | Verify, Observe | ? | No | Not built |
| Usage Analyst | Observe | ? | No | Not built |
| Demo Producer | Observe | skill | Yes (Playwright) | Exists |
| Roadmap | (all transitions) | skill | No | Exists |
| Migrate-Prod | Deploy | skill | No | Exists |

### Skill vs. Agent Decision

- **Skill** — Runs in the main conversation. Has access to MCP tools (Playwright browser, etc.) and full conversation history. Use when the player needs to interact with the live app or needs conversation flow.
- **Agent** — Runs as a subprocess with its own context. Isolated, typically uses a cheaper model. Use when the player should run without polluting the main context, or when it does pure file/code analysis.

Key constraint: anything that needs Playwright MCP **must** be a skill (or run in main context). Agent subprocesses don't have MCP access.

## Players by Cycle Node

### Strategize

Players that decide what to work on.

**PMF Director** — `/pmf-director`
- Mandate: What should we work on right now to reach PMF?
- Reads: signal reports (`_specs/signal/*`), roadmap, PMF criteria, prior briefs
- Writes: Priority Brief (`_specs/product/pmf-briefs/YYYY-MM-DD.md`), Proposed Roadmap (`ROADMAP-proposed.md`)
- Authority: propose (never overwrites ROADMAP.md)
- Contract: [below](#pmf-director)

**Marketing** — `/marketing` (to be created)
- Mandate: Which vertical should we target, and how do we reach its users?
- Reads: PMF criteria, verticals doc, signal reports (usage, demos, QA)
- Writes: `_specs/signal/marketing-latest.md`
- Authority: propose
- Contract: [below](#marketing)

### Build

No dedicated players. Build is human + Claude Code in conversation. Planning happens as a sub-phase of Build using plan mode.

### Verify

Players that gate the transition from Build to Deploy.

**Code Review** — `/review`
- Mandate: Does this code follow our project practices?
- Reads: changed files, CLAUDE.md, CODE_STRUCTURE_CHECKLIST.md
- Writes: conversation (findings with file:line references)
- Authority: read-only
- Implementation: skill invokes agent subprocess (isolated context for large code reads)
- Contract: [below](#code-review)

**QA Walkthrough** — `/qa-walkthrough`
- Mandate: Does the product work from a new user's perspective?
- Reads: live app (via Playwright browser)
- Writes: `_specs/signal/qa-latest.md`, screenshots
- Authority: read-only (creates throwaway test accounts)
- In Verify: run against dev to gate deploys. In Observe: run against prod to gather signal.
- Contract: [below](#qa-walkthrough)

**Eval Runner** — `/eval` (to be created)
- Mandate: Are the AI tools giving accurate answers?
- Reads: ground truth dataset (`tests/evals/`), tool endpoints
- Writes: `_specs/signal/eval-latest.md`
- Authority: read-only
- In Verify: check for accuracy regressions before deploy. In Observe: track accuracy over time.
- Contract: [below](#eval-runner)

### Deploy

**Migrate-Prod** — `/migrate-prod`
- Mandate: Run database migrations against production.
- Reads: migration scripts in `backend/migrations/`
- Writes: database schema changes
- Authority: execute
- Contract: [below](#migrate-prod)

Deployment itself is `deploy.ps1` (not a player — a script).

### Observe

Players that gather signal after deployment (or on-demand).

**QA Walkthrough** — same player as Verify, run against production URL.

**Eval Runner** — same player as Verify, run as monitoring (not gating).

**Usage Analyst** — `/usage` (to be created)
- Mandate: Where are users dropping off in the funnel?
- Reads: tracking events API (`GET /api/tracking/admin/events`), journey stage definitions
- Writes: `_specs/signal/usage-latest.md`
- Authority: read-only
- Dependency: requires journey tracking (roadmap #23) to be implemented first
- Contract: [below](#usage-analyst)

**Demo Producer** — `/demo`
- Mandate: What does the product look like in action for a specific audience?
- Reads: live app (via Playwright), build script (`_demo/build_video.py`)
- Writes: video files, storyboards, `_specs/signal/demo-log.md`
- Authority: execute
- Contract: [below](#demo-producer)

### Utility (serves all transitions)

**Roadmap** — `/roadmap`
- Mandate: Track planned work. Record changes.
- Reads/writes: `_specs/product/ROADMAP.md`
- Authority: execute (directly modifies roadmap on command)
- Contract: [below](#roadmap)

## Signal Directory

All signal reports live in `_specs/signal/`. These are the persistent artifacts that connect Observe to Strategize.

| File | Producer | Consumer(s) | Content |
|------|----------|-------------|---------|
| `qa-latest.md` | QA Walkthrough | PMF Director | Pass/fail per phase, issues tagged by DTP layer, screenshots |
| `eval-latest.md` | Eval Runner | PMF Director | Per-tool accuracy scores, failure examples |
| `usage-latest.md` | Usage Analyst | PMF Director | Funnel metrics, stage distribution, drop-off points |
| `demo-log.md` | Demo Producer | PMF Director, Marketing | Demos produced: date, audience, video path, feedback |
| `marketing-latest.md` | Marketing | PMF Director | Vertical scorecard, channel plan, reachability assessment |

---

## Player Contracts

Detailed contracts for each player. Schema defined in `agent-contract-schema.md`.

### PMF Director

```yaml
agent:
  name: pmf-director
  mandate: "What should we work on right now to reach product-market fit?"
  cycle_node: strategize
  implementation: skill

  inputs:
    - { name: Product spec, type: file, source: "_specs/product/table-that-v1-spec.md" }
    - { name: PMF criteria, type: file, source: "_specs/product/pmf-criteria.md" }
    - { name: Roadmap, type: file, source: "_specs/product/ROADMAP.md" }
    - { name: Management plane, type: file, source: "_specs/meta/management-plane.md" }
    - { name: Prior briefs, type: directory, source: "_specs/product/pmf-briefs/" }
    - { name: QA signal, type: signal_report, source: "_specs/signal/qa-latest.md", required: false }
    - { name: Eval signal, type: signal_report, source: "_specs/signal/eval-latest.md", required: false }
    - { name: Usage signal, type: signal_report, source: "_specs/signal/usage-latest.md", required: false }
    - { name: Demo log, type: signal_report, source: "_specs/signal/demo-log.md", required: false }
    - { name: Marketing signal, type: signal_report, source: "_specs/signal/marketing-latest.md", required: false }

  outputs:
    - { name: Priority Brief, type: file, destination: "_specs/product/pmf-briefs/YYYY-MM-DD.md", consumers: [human] }
    - { name: Proposed Roadmap, type: file, destination: "_specs/product/ROADMAP-proposed.md", consumers: [human] }

  authority: propose
  side_effects: []
```

### Marketing

```yaml
agent:
  name: marketing
  mandate: "Which vertical should we target, and how do we reach the people in it?"
  cycle_node: strategize
  implementation: TBD

  inputs:
    - { name: PMF criteria, type: file, source: "_specs/product/pmf-criteria.md" }
    - { name: Verticals analysis, type: file, source: "_specs/product/verticals-and-tooling.md" }
    - { name: Demo log, type: signal_report, source: "_specs/signal/demo-log.md", required: false }
    - { name: Usage signal, type: signal_report, source: "_specs/signal/usage-latest.md", required: false }
    - { name: QA signal, type: signal_report, source: "_specs/signal/qa-latest.md", required: false }

  outputs:
    - { name: Marketing report, type: file, destination: "_specs/signal/marketing-latest.md", consumers: [pmf-director, human] }

  authority: propose
  side_effects: []
```

### Code Review

```yaml
agent:
  name: code-review
  mandate: "Does this code follow our project practices?"
  cycle_node: verify
  implementation: agent (subprocess via /review skill wrapper)

  inputs:
    - { name: Code changes, type: codebase, source: "uncommitted changes or specified files" }
    - { name: Project rules, type: file, source: "CLAUDE.md, CODE_STRUCTURE_CHECKLIST.md" }

  outputs:
    - { name: Review findings, type: conversation, consumers: [human] }

  authority: read_only
  side_effects: []
```

### QA Walkthrough

```yaml
agent:
  name: qa-walkthrough
  mandate: "Is the product working correctly from a new user's perspective?"
  cycle_node: [verify, observe]
  implementation: skill (needs Playwright MCP)

  inputs:
    - { name: Live app, type: api, source: "http://192.168.0.12:5173 (dev) or https://tablethat.ironcliff.ai (prod)" }

  outputs:
    - { name: QA Report, type: file, destination: "_specs/signal/qa-latest.md", consumers: [pmf-director, human] }
    - { name: Screenshots, type: file, destination: "qa-*.png", consumers: [human] }

  authority: read_only
  side_effects:
    - { description: "Registers a throwaway test account", reversible: true }
    - { description: "Creates and deletes test tables", reversible: true }
```

### Eval Runner

```yaml
agent:
  name: eval-runner
  mandate: "Are the AI tools giving accurate answers?"
  cycle_node: [verify, observe]
  implementation: TBD

  inputs:
    - { name: Ground truth dataset, type: file, source: "tests/evals/ (to be created)" }
    - { name: Tool endpoints, type: api, source: "backend API" }

  outputs:
    - { name: Eval Report, type: file, destination: "_specs/signal/eval-latest.md", consumers: [pmf-director, human] }

  authority: read_only
  side_effects: []
```

### Usage Analyst

```yaml
agent:
  name: usage-analyst
  mandate: "What are users doing, and where are they dropping off?"
  cycle_node: observe
  implementation: TBD
  dependency: "Requires journey tracking (roadmap #23)"

  inputs:
    - { name: Tracking events, type: api, source: "GET /api/tracking/admin/events" }
    - { name: Journey stage definitions, type: file, source: "_specs/product/pmf-criteria.md" }

  outputs:
    - { name: Usage Report, type: file, destination: "_specs/signal/usage-latest.md", consumers: [pmf-director, human] }

  authority: read_only
  side_effects: []
```

### Demo Producer

```yaml
agent:
  name: demo-producer
  mandate: "What does this product look like in action for a specific audience?"
  cycle_node: observe
  implementation: skill (needs Playwright MCP)

  inputs:
    - { name: Audience description, type: conversation, source: "/demo argument" }
    - { name: Live app, type: api, source: "http://192.168.0.12:5173" }
    - { name: Build script, type: file, source: "_demo/build_video.py" }

  outputs:
    - { name: Demo video, type: file, destination: "_demo/table-that-demo-{usecase}.mp4", consumers: [human] }
    - { name: Storyboard, type: file, destination: "_demo/storyboard-{usecase}.json", consumers: [human] }
    - { name: Demo log entry, type: file, destination: "_specs/signal/demo-log.md", consumers: [pmf-director, marketing] }

  authority: execute
  side_effects:
    - { description: "Registers a throwaway demo account", reversible: true }
    - { description: "Creates tables and data in the live app", reversible: true }
```

### Roadmap

```yaml
agent:
  name: roadmap
  mandate: "What's on the roadmap, and record this change."
  cycle_node: utility (all transitions)
  implementation: skill

  inputs:
    - { name: Roadmap file, type: file, source: "_specs/product/ROADMAP.md" }
    - { name: User command, type: conversation, source: "/roadmap argument" }

  outputs:
    - { name: Updated roadmap, type: file, destination: "_specs/product/ROADMAP.md", consumers: [pmf-director, human] }

  authority: execute
  side_effects: []
```

### Migrate-Prod

```yaml
agent:
  name: migrate-prod
  mandate: "Run database migrations against production."
  cycle_node: deploy
  implementation: skill

  inputs:
    - { name: Migration scripts, type: file, source: "backend/migrations/" }

  outputs:
    - { name: Migration result, type: conversation, consumers: [human] }

  authority: execute
  side_effects:
    - { description: "Modifies production database schema", reversible: false }
```
