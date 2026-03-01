# Management Plane

## What This Is

This document describes how we develop Table That — the methodology, the tools, the agent ecosystem, and how they fit together. It's the entry point for understanding the management layer that sits above the codebase.

## The Goal

Reach product-market fit for table that. PMF means real users completing the build-populate-enrich loop, coming back, and telling others about it.

## The Methodology

We use a two-prong approach (documented fully in `_specs/product/pmf-criteria.md`):

### Prong 1: Pick the right market

A vertical is worth pursuing if:
- There's a **real pain point** — people spending hours on manual web research and spreadsheet wrangling
- The audience is **reachable** — we can find and convert them without a massive marketing budget

### Prong 2: Build the right product

Product quality is evaluated on three layers (the **DTP framework**):

| Layer | Question | Fix when broken |
|-------|----------|-----------------|
| **D — Decision** | Does the AI make the right choices about what to say and which tools to call? | Prompt tuning (system/page prompts), tool design (tool descriptions, parameter schemas, when/how tools present themselves to the AI) |
| **T — Tool** | Do the tools execute correctly and reliably? | Engineering (tool code, API integrations, error handling) |
| **P — Presentation** | Is the result laid out in a way the user can follow? | Frontend UX work |

D and T are **tunable** through existing configuration levers — system prompts, page-level prompts, tool configurations. The right configuration values come from **observing real users**, not guessing. This creates a flywheel: more users → more failure data → better tuning → better quality → more users. The accumulated tuning knowledge is our defensibility.

### How the two prongs connect

1. **Prepare:** Choose a vertical where both prongs look viable. Get DTP to baseline quality through synthetic testing (demos, QA walkthroughs, evals).
2. **Launch:** Put the product in front of real users in that vertical.
3. **Observe:** Watch where D and T fail. Track through signal agents.
4. **Tune:** Adjust prompts and tool configs based on observed failures.
5. **Repeat:** Quality improves, more users arrive, loop tightens.

## The Specs Directory

All project documentation lives in `_specs/`. Organized by audience and purpose:

```
_specs/
├── meta/                          ← You are here. How we manage the project.
│   ├── management-plane.md        ← This document
│   ├── agent-contract-schema.md   ← Schema for defining agent nodes
│   └── agent-graph.md             ← Full agent ecosystem with contracts
│
├── product/                       ← What we're building and why
│   ├── table-that-v1-spec.md      ← Product specification
│   ├── pmf-criteria.md            ← PMF definition, DTP rubric, vertical methodology
│   ├── verticals-and-tooling.md   ← Candidate verticals + tooling readiness
│   ├── ROADMAP.md                 ← All planned work (single source of truth)
│   ├── ROADMAP-proposed.md        ← PMF Director's proposed changes (never auto-applied)
│   └── pmf-briefs/                ← Priority Briefs produced by PMF Director
│
├── signal/                        ← Persistent artifacts from signal agents (to be created)
│   ├── qa-latest.md               ← QA Walkthrough output
│   ├── eval-latest.md             ← Eval Runner output
│   ├── usage-latest.md            ← Usage Analyst output
│   ├── demo-log.md                ← Demo Producer log
│   └── marketing-latest.md        ← Marketing agent output
│
└── technical/                     ← How things work (architecture, testing, reference)
    ├── architecture/              ← System design docs
    ├── chat/                      ← Chat system configuration and patterns
    ├── testing/                   ← Test plans and strategies
    └── reference/                 ← External reference material
```

## The Agent Ecosystem

Agents are defined by contracts (see `agent-contract-schema.md`) and connected through a graph (see `agent-graph.md`). The graph has four layers:

### Layers

| Layer | Purpose | Agents |
|-------|---------|--------|
| **Strategy** | Decides what to work on | PMF Director, Marketing |
| **Signal** | Observes and measures | QA Walkthrough, Eval Runner, Usage Analyst |
| **Execution** | Does the work | Demo Producer, Code Review |
| **Operations** | Ships and maintains | Roadmap, Migrate-Prod |

### Key design principles

1. **One mandate per agent.** If an agent has two jobs, split it.
2. **Signal agents produce persistent files.** A finding that exists only in a conversation is invisible to other agents. Signal agents write to `_specs/signal/`.
3. **Strategy agents don't gather their own signal.** The PMF Director reads signal reports. It does not scan the codebase, run tests, or browse the app. If it needs a signal that doesn't exist, that's a gap in the signal layer.
4. **Inputs and outputs define the graph edges.** Dependencies are explicit, not implied.
5. **Authority matches layer.** Strategy proposes. Signal reads. Execution executes (with approval). Operations executes on command.

### Implementation: skills vs. agents

Claude Code has two mechanisms for agent implementation:

- **Skills** (`.claude/skills/*/SKILL.md`) — Invoked via `/slash-command`. Run in the main conversation context. Have access to everything (MCP tools, full conversation history).
- **Agents** (`.claude/agents/*.md`) — Launched as subprocesses via the Task tool. Run in isolated context. Typically use a cheaper model (sonnet).

The choice between skill and agent is an implementation detail — the contract schema describes *what* the agent does regardless of *how* it runs. Use a skill when the agent needs the main context (MCP tools, conversation flow). Use an agent subprocess when it should run in isolation (code review, where you don't want to pollute the main context).

### Signal flow

```
Signal agents observe → write to _specs/signal/ → strategy agents read →
produce recommendations → human approves → execution agents act
```

This flow is the operational backbone. When it's fully wired:
- Run `/qa-walkthrough` → writes qa-latest.md
- Run `/eval` → writes eval-latest.md
- Run `/usage` → writes usage-latest.md
- Run `/marketing` → writes marketing-latest.md
- Run `/pmf-director` → reads all signal files → produces Priority Brief + Proposed Roadmap
- Human reviews, approves changes, directs execution

## The Roadmap

`_specs/product/ROADMAP.md` is the single source of truth for all planned work. Each item has:

- **ID** — Unique, incrementing (`#1`, `#2`, ...)
- **Priority** — P1 (do now), P2 (do soon), P3 (backlog)
- **Category** — CORE, GROWTH, QUALITY, INFRA, AI, META
- **Quality Layer** — D, T, P, or combinations. Which DTP layer(s) this item improves. `—` for items that don't directly address product quality (growth, measurement, infrastructure).
- **Status** — open or done

The PMF Director proposes roadmap changes to `ROADMAP-proposed.md`. Humans review and apply (or don't). The roadmap is never auto-modified by strategy agents.

## Current State

### What works now

| Component | Status | Notes |
|-----------|--------|-------|
| Product spec | Complete | `table-that-v1-spec.md` |
| PMF criteria | Complete | Target user, DTP rubric, vertical methodology, tuning loop |
| Roadmap | Active | 22 open items with priorities, categories, and DTP layers |
| Agent contract schema | Complete | YAML schema for defining agents |
| Agent graph | Complete | All agents defined with contracts, dependencies mapped |
| PMF Director skill | Exists | Needs update: should read signal files instead of scanning codebase |
| QA Walkthrough | Exists (skill + agent) | Needs consolidation; needs to write to `_specs/signal/qa-latest.md` |
| Demo Producer skill | Exists | Needs to append to `_specs/signal/demo-log.md` |
| Code Review | Exists (skill + agent) | Working as designed |
| Roadmap skill | Exists | Working as designed |
| Migrate-Prod skill | Exists | Working as designed |

### What's partially implemented

| Component | Status | What's missing |
|-----------|--------|----------------|
| Signal directory | Not created | `_specs/signal/` doesn't exist yet, no signal files |
| QA signal output | Defined in contract | Agent doesn't write persistent report yet |
| Demo signal output | Defined in contract | Skill doesn't append to demo-log.md yet |
| PMF Director signal reading | Defined in contract | Still scans codebase instead of reading signal files |

### What doesn't exist yet

| Component | Dependency | Notes |
|-----------|------------|-------|
| Eval Runner agent | Roadmap #25, ground truth dataset | Measures tool accuracy (D, T) |
| Usage Analyst agent | Roadmap #23 (journey tracking) | Measures funnel and drop-off |
| Marketing agent | Signal files | Vertical selection + distribution strategy |
| Signal directory | None | Just needs to be created |

## Management Plane Roadmap

### Phase 1: Wire up the signal loop (do now)

1. Create `_specs/signal/` directory with template files
2. Update QA Walkthrough to write `qa-latest.md`
3. Update Demo Producer to append to `demo-log.md`
4. Update PMF Director to read signal files instead of scanning codebase
5. Consolidate QA Walkthrough (skill + agent duplication)

**Outcome:** The core signal → strategy flow works end-to-end. Running `/qa-walkthrough` then `/pmf-director` produces informed recommendations based on persistent signal.

### Phase 2: Build missing signal agents (do soon)

6. Build Eval Runner — needs ground truth dataset first (roadmap #25)
7. Build Usage Analyst — needs journey tracking first (roadmap #23)
8. Build Marketing agent — vertical scoring + distribution planning

**Outcome:** All four signal types (QA, eval, usage, marketing) feed into the PMF Director. Strategy recommendations are grounded in real data.

### Phase 3: Close the loop (do after real users)

9. Instrument the tuning loop — track D/T/P failures per vertical, tie to prompt/tool config changes
10. Build per-vertical config profiles — system prompt + tool config bundles tuned from observation data
11. Marketing agent produces actionable channel plans based on usage signal

**Outcome:** The system becomes self-improving. Observation drives tuning, tuning drives quality, quality drives growth.

## File Reference

| File | Purpose | Owner |
|------|---------|-------|
| `_specs/meta/management-plane.md` | This document — how it all fits together | Human |
| `_specs/meta/agent-contract-schema.md` | Schema for defining agent contracts | Human |
| `_specs/meta/agent-graph.md` | Full agent graph with all contracts | Human |
| `_specs/product/pmf-criteria.md` | PMF definition, DTP rubric, vertical methodology | Human |
| `_specs/product/ROADMAP.md` | All planned work | Human (via `/roadmap` skill) |
| `_specs/product/ROADMAP-proposed.md` | PMF Director's proposed changes | PMF Director |
| `_specs/product/pmf-briefs/*.md` | Priority Briefs | PMF Director |
| `_specs/signal/*.md` | Signal reports | Signal agents |
| `.claude/skills/*/SKILL.md` | Skill implementations | Human |
| `.claude/agents/*.md` | Agent subprocess definitions | Human |
| `CLAUDE.md` | Code practices (Claude Code convention — must stay in root) | Human |
| `CODE_STRUCTURE_CHECKLIST.md` | Detailed code rules (paired with CLAUDE.md) | Human |
