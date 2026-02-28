# Agent Graph

## Overview

This document maps the agent ecosystem for table.that development. Each node is an agent described by the contract schema in `agent-contract-schema.md`. Edges are data flows: one agent's output is another agent's input.

## Graph Structure

```
                    ┌─────────────────┐
                    │  PMF Director   │
                    │   (strategy)    │
                    └───────┬─────────┘
                            │ reads signal reports
            ┌───────────────┼───────────────────┐
            │               │                   │
    ┌───────▼──────┐ ┌──────▼───────┐ ┌────────▼────────┐
    │ QA Walkthrough│ │ Eval Runner  │ │ Usage Analyst   │
    │   (signal)   │ │  (signal)    │ │   (signal)      │
    └──────────────┘ └──────────────┘ └─────────────────┘
            │               │                   │
            │ writes        │ writes            │ writes
            ▼               ▼                   ▼
    qa-latest.md     eval-latest.md     usage-latest.md


    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ Demo Producer│ │ Code Review  │ │  Marketing   │
    │ (execution)  │ │ (execution)  │ │  (strategy)  │
    └──────────────┘ └──────────────┘ └──────────────┘

    ┌──────────────┐ ┌──────────────┐
    │   Roadmap    │ │ Migrate-Prod │
    │ (operations) │ │ (operations) │
    └──────────────┘ └──────────────┘
```

## Signal Directory

All signal reports live in `_specs/signal/`. These are the persistent artifacts that connect signal agents to the strategy layer.

| File | Producer | Consumer | Content |
|------|----------|----------|---------|
| `qa-latest.md` | QA Walkthrough | PMF Director | Latest walkthrough findings: pass/fail per scenario, screenshots, blockers |
| `eval-latest.md` | Eval Runner | PMF Director | Tool accuracy scores: per-tool correct/incorrect/coverage |
| `usage-latest.md` | Usage Analyst | PMF Director | User metrics: active users, journey stage distribution, drop-off funnel |
| `demo-log.md` | Demo Producer | PMF Director, Marketing | Demos produced: date, audience, video path, any distribution/feedback notes |
| `marketing-latest.md` | Marketing | PMF Director | Market analysis: vertical assessment, channel strategy, distribution plan, reachability scores |

---

## Agent Contracts

### PMF Director

```yaml
agent:
  name: pmf-director
  display_name: PMF Director
  mandate: "What should we work on right now to reach product-market fit?"
  layer: strategy

  inputs:
    - name: Product spec
      type: file
      source: _specs/product/table-that-v1-spec.md
      required: true
      description: What we're building

    - name: PMF criteria
      type: file
      source: _specs/product/pmf-criteria.md
      required: true
      description: Target user, success measures, launch blockers

    - name: Roadmap
      type: file
      source: _specs/product/ROADMAP.md
      required: true
      description: All planned work with priorities and categories

    - name: Prior briefs
      type: directory
      source: _specs/product/pmf-briefs/
      required: false
      description: Previous Priority Briefs to avoid repeating recommendations

    - name: QA signal
      type: signal_report
      source: _specs/signal/qa-latest.md
      required: false
      description: Latest QA walkthrough findings

    - name: Eval signal
      type: signal_report
      source: _specs/signal/eval-latest.md
      required: false
      description: Latest tool accuracy scores

    - name: Usage signal
      type: signal_report
      source: _specs/signal/usage-latest.md
      required: false
      description: Latest user behavior metrics

    - name: Demo log
      type: signal_report
      source: _specs/signal/demo-log.md
      required: false
      description: Demos produced and any feedback

    - name: Marketing signal
      type: signal_report
      source: _specs/signal/marketing-latest.md
      required: false
      description: Vertical assessment, channel strategy, reachability analysis

  outputs:
    - name: Priority Brief
      type: file
      destination: _specs/product/pmf-briefs/YYYY-MM-DD.md
      format: Priority Brief template (see skill)
      consumers: [human]
      description: Top 3 recommendations with reasoning, deprioritizations, gaps, blockers

    - name: Proposed Roadmap
      type: file
      destination: _specs/product/ROADMAP-proposed.md
      format: Roadmap with changelog header
      consumers: [human]
      description: Roadmap with proposed priority/category/status changes

    - name: Summary
      type: conversation
      destination: (conversation)
      format: free text
      consumers: [human]
      description: Brief summary of recommendations and changes

  side_effects: []

  trigger:
    type: on_demand
    detail: /pmf-director

  authority:
    level: propose
    description: Writes proposals to separate files. Never overwrites ROADMAP.md.

  dependencies:
    upstream: [qa-walkthrough, eval-runner, usage-analyst, demo-producer, marketing]
    downstream: []
```

### QA Walkthrough

```yaml
agent:
  name: qa-walkthrough
  display_name: QA Walkthrough
  mandate: "Is the product working correctly from a new user's perspective?"
  layer: signal

  inputs:
    - name: Live app
      type: api
      source: http://192.168.0.12:5173 (dev) or https://tablethat.ironcliff.ai (prod)
      required: true
      description: The running application, accessed via Playwright browser

    - name: Test scenarios
      type: file
      source: (embedded in skill)
      required: true
      description: Predefined user journey scenarios to walk through

  outputs:
    - name: QA Report
      type: file
      destination: _specs/signal/qa-latest.md
      format: Structured report with per-scenario pass/fail, screenshots, blockers
      consumers: [pmf-director, human]
      description: What's working and what's broken in the live product

    - name: Screenshots
      type: file
      destination: _specs/signal/qa-screenshots/
      format: PNG files
      consumers: [human]
      description: Visual evidence at key checkpoints

    - name: Conversation summary
      type: conversation
      destination: (conversation)
      format: free text
      consumers: [human]
      description: Narrated walkthrough with findings

  side_effects:
    - description: Registers a throwaway test account
      reversible: true
    - description: Creates and deletes test tables
      reversible: true

  trigger:
    type: on_demand
    detail: /qa-walkthrough

  authority:
    level: read_only
    description: Observes the app via browser. Creates throwaway data for testing only.

  dependencies:
    upstream: []
    downstream: [pmf-director]
```

### Eval Runner

```yaml
agent:
  name: eval-runner
  display_name: Eval Runner
  mandate: "Are the AI tools giving accurate answers?"
  layer: signal

  inputs:
    - name: Ground truth dataset
      type: file
      source: tests/evals/ (to be created)
      required: true
      description: Questions with known-correct answers for each tool/strategy

    - name: Tool endpoints
      type: api
      source: Backend API (tool execution)
      required: true
      description: The actual tools being evaluated

  outputs:
    - name: Eval Report
      type: file
      destination: _specs/signal/eval-latest.md
      format: Per-tool accuracy table with scores, examples of failures
      consumers: [pmf-director, human]
      description: How accurate each tool/strategy is against ground truth

  side_effects: []

  trigger:
    type: on_demand
    detail: /eval (to be created)

  authority:
    level: read_only
    description: Runs queries against tools and compares to ground truth. Changes nothing.

  dependencies:
    upstream: []
    downstream: [pmf-director]
```

### Usage Analyst

```yaml
agent:
  name: usage-analyst
  display_name: Usage Analyst
  mandate: "What are users doing, and where are they dropping off?"
  layer: signal

  inputs:
    - name: Tracking events
      type: api
      source: GET /api/tracking/admin/events
      required: true
      description: Raw event stream from EventTrackingService

    - name: Journey stage definitions
      type: file
      source: _specs/product/pmf-criteria.md
      required: true
      description: What the four stages are and what success looks like

  outputs:
    - name: Usage Report
      type: file
      destination: _specs/signal/usage-latest.md
      format: Metrics summary with funnel, active users, stage distribution
      consumers: [pmf-director, human]
      description: User behavior metrics and funnel analysis

  side_effects: []

  trigger:
    type: on_demand
    detail: /usage (to be created)

  authority:
    level: read_only
    description: Queries tracking API. Changes nothing.

  dependencies:
    upstream: []
    downstream: [pmf-director]
```

### Demo Producer

```yaml
agent:
  name: demo-producer
  display_name: Demo Producer
  mandate: "What does this product look like in action for a specific audience?"
  layer: execution

  inputs:
    - name: Audience description
      type: conversation
      source: User provides via /demo argument
      required: true
      description: Who the demo is for and what use case to showcase

    - name: Live app
      type: api
      source: http://192.168.0.12:5173
      required: true
      description: The running application for screenshot capture

    - name: Build script
      type: file
      source: _demo/build_video.py
      required: true
      description: Video assembly pipeline (ffmpeg + edge-tts + ImageMagick)

  outputs:
    - name: Demo video
      type: file
      destination: _demo/table-that-demo-{usecase}.mp4
      format: MP4 video (90-150 seconds)
      consumers: [human]
      description: Narrated demo video tailored to the audience

    - name: Storyboard
      type: file
      destination: _demo/storyboard-{usecase}.json
      format: JSON with scenes, narration, zoom specs
      consumers: [human, demo-producer]
      description: Scene-by-scene plan for the video

    - name: Demo log entry
      type: file
      destination: _specs/signal/demo-log.md
      format: Append-only log entry
      consumers: [pmf-director]
      description: Record of what demo was produced, for whom, and any feedback

  side_effects:
    - description: Registers a throwaway demo account
      reversible: true
    - description: Creates tables and data in the live app for capture
      reversible: true
    - description: Captures screenshots to _demo/frames/
      reversible: true

  trigger:
    type: on_demand
    detail: /demo <audience>

  authority:
    level: execute
    description: Creates files, interacts with live app, produces video artifacts.

  dependencies:
    upstream: []
    downstream: [pmf-director]
```

### Marketing

```yaml
agent:
  name: marketing
  display_name: Marketing
  mandate: "Which vertical should we target, and how do we reach the people in it?"
  layer: strategy

  inputs:
    - name: PMF criteria
      type: file
      source: _specs/product/pmf-criteria.md
      required: true
      description: Target user, vertical selection methodology, success measures

    - name: Verticals analysis
      type: file
      source: _specs/product/verticals-and-tooling.md
      required: true
      description: Candidate verticals with tooling readiness assessment

    - name: Demo log
      type: signal_report
      source: _specs/signal/demo-log.md
      required: false
      description: Demos produced — which verticals have we showcased?

    - name: Usage signal
      type: signal_report
      source: _specs/signal/usage-latest.md
      required: false
      description: What verticals are actual users pursuing?

    - name: QA signal
      type: signal_report
      source: _specs/signal/qa-latest.md
      required: false
      description: Product quality by layer (D/T/P) — what works and what doesn't

    - name: Prior marketing reports
      type: directory
      source: _specs/signal/marketing/
      required: false
      description: Previous marketing analyses to build on

  outputs:
    - name: Marketing report
      type: file
      destination: _specs/signal/marketing-latest.md
      format: Vertical scorecard, channel plan, distribution strategy
      consumers: [pmf-director, human]
      description: Which vertical to target, why, and how to reach its users

    - name: Summary
      type: conversation
      destination: (conversation)
      format: free text
      consumers: [human]
      description: Key recommendations and next actions

  side_effects: []

  trigger:
    type: on_demand
    detail: /marketing (to be created)

  authority:
    level: propose
    description: Produces recommendations. Does not execute campaigns or spend money.

  dependencies:
    upstream: [qa-walkthrough, eval-runner, usage-analyst, demo-producer]
    downstream: [pmf-director]
```

### Code Review

```yaml
agent:
  name: code-review
  display_name: Code Review
  mandate: "Does this code follow our project practices?"
  layer: execution

  inputs:
    - name: Code changes
      type: codebase
      source: Uncommitted changes or specified files
      required: true
      description: The code to review

    - name: Project rules
      type: file
      source: CLAUDE.md, CODE_STRUCTURE_CHECKLIST.md
      required: true
      description: Coding standards and patterns to check against

  outputs:
    - name: Review findings
      type: conversation
      destination: (conversation)
      format: Categorized findings with file:line references
      consumers: [human]
      description: What violates project practices and how to fix it

  side_effects: []

  trigger:
    type: on_demand
    detail: /review [files]

  authority:
    level: read_only
    description: Reads code, reports findings. Changes nothing.

  dependencies:
    upstream: []
    downstream: []
```

### Roadmap (Utility)

```yaml
agent:
  name: roadmap
  display_name: Roadmap Manager
  mandate: "What's on the roadmap, and record this change."
  layer: operations

  inputs:
    - name: Roadmap file
      type: file
      source: _specs/product/ROADMAP.md
      required: true
      description: Current roadmap state

    - name: User command
      type: conversation
      source: /roadmap argument
      required: false
      description: Action to perform (add, resolve, list, show)

  outputs:
    - name: Updated roadmap
      type: file
      destination: _specs/product/ROADMAP.md
      format: Roadmap markdown with tables and details
      consumers: [pmf-director, human]
      description: Modified roadmap file

    - name: Confirmation
      type: conversation
      destination: (conversation)
      format: free text
      consumers: [human]
      description: What was changed

  side_effects: []

  trigger:
    type: on_demand
    detail: /roadmap [action]

  authority:
    level: execute
    description: Directly modifies ROADMAP.md on user command.

  dependencies:
    upstream: []
    downstream: [pmf-director]
```

---

## Data Flow Summary

```
DIRECTIVES (stable, human-authored)
    │
    ├── table-that-v1-spec.md ──────────────────► PMF Director
    ├── pmf-criteria.md ───────────────────────►┬ PMF Director
    │                                           └ Marketing
    └── ROADMAP.md ─────────────────────────────► PMF Director
                                                      │
SIGNAL REPORTS (produced by signal/strategy agents)    │
    │                                                  │
    ├── qa-latest.md ◄──── QA Walkthrough ────────────►│
    ├── eval-latest.md ◄── Eval Runner ───────────────►│
    ├── usage-latest.md ◄─ Usage Analyst ────────────►┬│
    ├── demo-log.md ◄───── Demo Producer ────────────►┤│
    └── marketing-latest.md ◄── Marketing ───────────►┘│
                                                       │
                                                       ▼
                                              Priority Brief
                                              Proposed Roadmap
                                                       │
                                                       ▼
                                                    HUMAN
                                                       │
                                               approves / adjusts
                                                       │
                                                       ▼
                                               Execution agents
                                               (plan, code, test)
```

## Gap Analysis

### Agents that exist and are well-defined
- **PMF Director** — exists, needs skill update to read signal files instead of scanning codebase
- **Demo Producer** — exists, needs to append to demo-log.md
- **Roadmap** — exists, works as designed

### Agents that exist but need output changes
- **QA Walkthrough** — needs to write `_specs/signal/qa-latest.md` instead of only conversation output
- **Code Review** — works fine as conversation-only (no downstream agent consumers)

### Agents that don't exist yet
- **Eval Runner** — roadmap #25, produces accuracy scores
- **Usage Analyst** — not on roadmap, queries EventTrackingService, produces funnel metrics
- **Marketing** — vertical selection + distribution strategy, consumes signal reports, produces channel plans

### Agents we might need later (not yet)
- **Plan Agent** — "Given this roadmap item, what's the implementation plan?" (currently done ad-hoc in conversation)
- **Test Agent** — "Do the tests pass after this change?" (currently manual)
- **Deploy Agent** — "Ship this to production" (currently deploy.ps1, not agent-wrapped)

---

## Implementation Priority

1. **Create `_specs/signal/` directory** and initialize empty signal files
2. **Update QA Walkthrough skill** to write persistent report
3. **Update Demo Producer skill** to append to demo-log.md
4. **Update PMF Director skill** to read signal files instead of scanning codebase
5. **Build Eval Runner** (#25) — produces eval-latest.md
6. **Build Usage Analyst** — produces usage-latest.md (requires journey tracking #23 first)
