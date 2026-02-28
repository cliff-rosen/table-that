# PMF Director Agent

## Purpose

A strategic agent responsible for driving table.that to product-market fit. It sits above implementation agents (QA, demo, code) and answers one question: **what should we be working on right now, and why?**

It does not write code. It reads directives, reads reality, and produces prioritized recommendations that trace back to the goal of PMF.

## How It Works

The agent operates in a loop:

```
Read directives → Read current state → Read signal → Synthesize → Recommend
```

Each cycle produces a short, prioritized work recommendation with reasoning. The human reviews, approves or adjusts, and the implementation agents execute.

## Inputs

### 1. Directives (stable, human-authored)

These define what we're building, for whom, and what's in/out. They change infrequently and only by human decision.

| Document | What it contains |
|----------|-----------------|
| `_specs/product/table-that-v1-spec.md` | Full product spec — features, architecture, UX |
| `_specs/product/pmf-criteria.md` | Definition of PMF for table.that — target user, core value prop, success measures, what "good enough" looks like |
| `_specs/product/design-principles.md` (to create) | What's in and what's out — architectural boundaries, UX philosophy, explicit non-goals |
| `CLAUDE.md` | Code structure rules, layout patterns, modal guidelines |

### 2. Current State (changes frequently, machine-readable)

The actual state of the product and the work tracking around it.

| Source | What it tells us |
|--------|-----------------|
| `_specs/product/ROADMAP.md` | Open defects, features, tasks with priorities |
| Codebase | What's actually implemented — registered tools, page configs, routes, frontend components |
| Git log | What shipped recently, velocity, direction of recent work |
| `_specs/*.md` | Design docs, in-progress specs, architectural decisions |
| Test results | What's passing, what's failing, what has no coverage |

### 3. Signal (external, tells us what matters to users)

Evidence from real usage about what's working and what isn't.

| Source | What it tells us |
|--------|-----------------|
| Usage/analytics logs | Which features get used, where users drop off, session patterns |
| User feedback | Bug reports, feature requests, confusion points, support questions |
| Demo results | What resonates with prospects, what falls flat, which verticals generate interest |
| QA walkthrough findings | What's broken, what's confusing, rough edges in the UX |
| Competitive landscape | What comparable tools do, where table.that is differentiated or behind |

## Output

Each cycle produces a **Priority Brief** — a short document with:

1. **Top 3 recommendations** — what to work on next, in order
2. **Reasoning** — why each item matters for PMF, traced back to directives and signal
3. **What to stop or deprioritize** — items on the roadmap that aren't contributing to PMF right now
4. **Gaps identified** — things not on the roadmap that should be, based on signal
5. **Blockers** — anything preventing progress on the top recommendations

The brief is concise. Not a strategy deck — a decision aid. Each recommendation should be actionable within 1-2 days of focused work.

## Autonomy Model

**Phase 1 (now): Advisory.** The agent produces recommendations. Human reviews, approves or adjusts. Implementation agents execute on approved items.

**Phase 2 (later): Semi-autonomous.** The agent can directly reprioritize roadmap items, create task breakdowns, and spawn implementation plans for approved patterns. Human approves at the plan level, not the individual task level.

**Phase 3 (future): Autonomous loop.** The agent monitors signal continuously, adjusts priorities, generates specs, dispatches implementation agents, verifies results via QA agents, and reports outcomes. Human intervenes by exception.

## Relationship to Other Agents

```
PMF Director (strategy)
    │
    ├── Roadmap skill (tracking)
    ├── QA Walkthrough agent (signal: what's broken)
    ├── Demo agent (signal: what resonates)
    ├── Review skill (signal: code quality)
    │
    └── [Future] Implementation agents
        ├── Plan agent (design)
        ├── Code agent (build)
        └── Test agent (verify)
```

The PMF Director doesn't replace these agents. It directs them. It decides *what* QA should focus on, *which* demo to build next, and *what* implementation to prioritize.

## Documents to Create

To fully operationalize this agent, we need:

1. **`_specs/product/pmf-criteria.md`** — Created. Defines target user, core value loop, success measures, launch criteria.
2. **`_specs/product/design-principles.md`** — Explicit in/out decisions, architectural non-goals, UX philosophy. Things like "we will never require users to write code" or "we optimize for time-to-first-value over feature completeness."

These are the directives the agent reasons against. Without them, it's just looking at a roadmap with no compass.

## Invocation

The agent should be invocable as a skill (`/pmf-review` or similar) that:

1. Reads all directive documents
2. Scans the codebase for current implementation state
3. Reads the roadmap
4. Checks available signal (usage logs, recent QA results, recent demos)
5. Produces a Priority Brief

It can also run on a cadence — e.g., at the start of each work session, or after a batch of changes ships.
