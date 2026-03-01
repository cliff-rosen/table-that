# Management Plane

## What This Is

This document describes how we develop table.that — the methodology, the operational cycle, the agent ecosystem, and how they fit together. It's the entry point for understanding the management layer that sits above the codebase.

## The Goal

Reach product-market fit for table.that. PMF means real users completing the build-populate-enrich loop, coming back, and telling others about it.

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

---

## The Process

The project has three phases:

```
Definition ──► Operational (cyclic) ──► Target Reached (PMF)
  (now)
```

**Definition** is where we are now — establishing methodology, building the management plane, wiring up agents.

**Target Reached** is PMF — real users, organic growth, the product works and spreads.

**Operational** is where we'll spend most of our time. It's a cycle:

### The Operational Cycle

```
    ┌──────────────────────────────────────────────┐
    │                                              │
    ▼                                              │
Strategize ──► Build ──► Verify ──► Deploy ──► Observe
```

Five nodes. Each transition has a quality gate. Observation feeds back into the next strategy cycle.

### Nodes

**Strategize** — Analyze all available signal, review the roadmap, decide what to work on next.
- Reads: signal reports (QA, evals, usage, marketing), roadmap, prior briefs
- Produces: Priority Brief (top recommendations with rationale), Proposed Roadmap changes
- Human approves priorities and directs execution

**Build** — Implement the chosen work. Design the approach, write the code.
- Reads: roadmap item, product spec, technical docs, codebase
- Produces: code changes (on a branch or uncommitted)
- Includes planning as a sub-phase — scope and approach are defined before writing code

**Verify** — Confirm the changes are correct, safe, and ready to ship.
- Reads: code changes, existing tests, live app (for E2E)
- Produces: test results, review findings, pass/fail signal
- Multiple checks: code review, automated tests, pre-deploy QA, eval scores

**Deploy** — Ship to production.
- Reads: verified code, migration scripts
- Produces: running production code
- Includes database migrations, deployment script execution, post-deploy smoke test

**Observe** — Gather signal on the deployed changes and the product overall.
- Reads: live production app, usage data, tool outputs
- Produces: signal reports written to `_specs/signal/` (QA, evals, usage, marketing analysis)
- These reports persist and are consumed by the next Strategize cycle

### Transitions and Quality Gates

Each transition has a gate — a set of conditions that must be met before advancing.

| Transition | Gate | What blocks advancement |
|------------|------|------------------------|
| Strategize → Build | **Scope is clear.** Chosen work item has a defined scope, dependencies are met, approach is understood. | Ambiguous requirements, unmet dependencies, no clear acceptance criteria. |
| Build → Verify | **Code is complete.** Implementation addresses the scope, no known gaps, ready for review. | Incomplete implementation, build errors, untested assumptions. |
| Verify → Deploy | **All checks pass.** Code review clean. Automated tests pass. Pre-deploy QA walkthrough passes for affected areas. Eval scores acceptable (no regressions). | Failing tests, review findings, QA failures, eval score regressions. |
| Deploy → Observe | **Deployment succeeds.** Production deployment completes. Post-deploy smoke test passes on prod. | Failed deployment, smoke test failures, rollback needed. |
| Observe → Strategize | **Signal is current.** Signal reports have been updated to reflect the current state of the product. | Stale or missing signal reports. |

### Failure Paths

When a gate fails, the cycle doesn't advance — it routes back:

- **Verify fails** → back to Build. Fix the issue, then re-enter Verify.
- **Deploy fails** → back to Build or Verify depending on the failure. Deployment bugs need code fixes; config issues may just need a re-verify.
- **Observe reveals a regression** → enters the next Strategize cycle as a high-priority signal. The PMF Director should flag it.

### Roadmap Management

The roadmap is not a node in the cycle — it's a side effect that updates at transitions:
- Strategize: item moves to "prioritized" / new items added
- Build: item is in progress
- Deploy: item status changes to done, resolved date set
- Observe: new defects or items may be added based on findings

Managed via the `/roadmap` skill. Single source of truth: `_specs/product/ROADMAP.md`.

---

## The Agent Ecosystem

Agents are defined by contracts (see `agent-contract-schema.md`) and connected through a graph (see `agent-graph.md`). Each agent serves one or more nodes in the operational cycle.

### Agents by Cycle Node

| Cycle Node | Agent | Mandate | Status |
|------------|-------|---------|--------|
| **Strategize** | PMF Director | What should we work on to reach PMF? | Exists (needs signal file update) |
| **Strategize** | Marketing | Which vertical, and how do we reach its users? | Not built |
| **Build** | — | (Human + Claude Code, no dedicated agent) | — |
| **Verify** | Code Review | Does this code follow our practices? | Exists |
| **Verify** | QA Walkthrough | Does the product work from a user's perspective? | Exists (needs signal output) |
| **Verify** | Eval Runner | Are the AI tools giving accurate answers? | Not built |
| **Deploy** | Migrate-Prod | Run production database migrations | Exists |
| **Observe** | QA Walkthrough | What's working/broken in production? | Same agent, different target (prod vs dev) |
| **Observe** | Eval Runner | Are tool accuracy scores holding? | Same agent, monitoring mode |
| **Observe** | Usage Analyst | Where are users dropping off? | Not built |
| **Observe** | Demo Producer | What does the product look like for a given audience? | Exists (needs signal output) |
| **Utility** | Roadmap | Track planned work | Exists |

Note: QA Walkthrough and Eval Runner appear in both **Verify** and **Observe**. In Verify they're pre-deploy checks (gate keepers). In Observe they're post-deploy monitoring (signal producers). Same agent, different context and target.

### Key Design Principles

1. **One mandate per agent.** If an agent has two jobs, split it.
2. **Signal agents produce persistent files.** A finding that exists only in a conversation is invisible to other agents. Signal agents write to `_specs/signal/`.
3. **Strategy agents don't gather their own signal.** The PMF Director reads signal reports. It does not scan the codebase, run tests, or browse the app. If it needs a signal that doesn't exist, that's a gap in the signal layer.
4. **Inputs and outputs define the graph edges.** Dependencies are explicit, not implied.
5. **Agents serve the cycle.** Every agent maps to a cycle node. An agent that doesn't serve any node doesn't belong in the graph.

### Implementation: Skills vs. Agents

Claude Code has two mechanisms for agent implementation:

- **Skills** (`.claude/skills/*/SKILL.md`) — Invoked via `/slash-command`. Run in the main conversation context. Have access to everything (MCP tools, full conversation history).
- **Agents** (`.claude/agents/*.md`) — Launched as subprocesses via the Task tool. Run in isolated context. Typically use a cheaper model (sonnet).

The choice between skill and agent is an implementation detail — the contract schema describes *what* the agent does regardless of *how* it runs. Use a skill when the agent needs the main context (MCP tools, conversation flow). Use an agent subprocess when it should run in isolation (code review, where you don't want to pollute the main context).

### Signal Flow

```
Observe agents run → write to _specs/signal/ → Strategize agents read →
produce recommendations → human approves → Build begins
```

When fully wired:
- Run `/qa-walkthrough` → writes qa-latest.md
- Run `/eval` → writes eval-latest.md
- Run `/usage` → writes usage-latest.md
- Run `/marketing` → writes marketing-latest.md
- Run `/pmf-director` → reads all signal files → produces Priority Brief + Proposed Roadmap
- Human reviews, approves changes, directs next Build cycle

---

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
├── signal/                        ← Persistent artifacts from signal agents
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

## The Roadmap

`_specs/product/ROADMAP.md` is the single source of truth for all planned work. Each item has:

- **ID** — Unique, incrementing (`#1`, `#2`, ...)
- **Priority** — P1 (do now), P2 (do soon), P3 (backlog)
- **Category** — CORE, GROWTH, QUALITY, INFRA, AI, META
- **Quality Layer** — D, T, P, or combinations. Which DTP layer(s) this item improves. `—` for items that don't directly address product quality (growth, measurement, infrastructure).
- **Status** — open or done

The PMF Director proposes roadmap changes to `ROADMAP-proposed.md`. Humans review and apply (or don't). The roadmap is never auto-modified by strategy agents.

---

## Current State

We are in the **Definition phase** — establishing the process, wiring up agents, building the management plane.

### What's ready for the operational cycle

| Cycle Node | Readiness | What works | What's missing |
|------------|-----------|------------|----------------|
| **Strategize** | Partial | PMF Director skill exists, roadmap + PMF criteria defined | PMF Director still scans codebase instead of reading signal files. Marketing agent not built. Signal directory not created. |
| **Build** | Ready | Human + Claude Code with full codebase access, code practices documented | — |
| **Verify** | Partial | Code Review agent works. QA Walkthrough exists. | QA doesn't write persistent signal. Eval Runner not built. No formal pre-deploy gate defined. |
| **Deploy** | Ready | deploy.ps1 works, Migrate-Prod skill works | No automated pre-deploy gate enforcement (manual today). |
| **Observe** | Minimal | QA Walkthrough can run against prod. Demo Producer exists. | No signal directory. QA/Demo don't write persistent reports. Usage Analyst not built. Eval Runner not built. |

### Transition to operational

To exit Definition and enter the Operational cycle, we need:

1. **Signal directory exists** with template files (`_specs/signal/`)
2. **At least one signal agent writes persistent output** (QA Walkthrough → qa-latest.md)
3. **PMF Director reads signal files** instead of scanning codebase
4. **Verify gate is defined** — what checks must pass before Deploy

Once those are in place, we can run the cycle — even if some agents are missing, the cycle structure works and we fill in gaps iteratively.

### Implementation priority

| # | Task | Enables |
|---|------|---------|
| 1 | Create `_specs/signal/` directory with template files | All signal flow |
| 2 | Update QA Walkthrough to write `qa-latest.md` | Observe → Strategize flow |
| 3 | Update PMF Director to read signal files | Strategize node works correctly |
| 4 | Define Verify gate checklist | Build → Verify → Deploy flow |
| 5 | Update Demo Producer to append to `demo-log.md` | Observe signal completeness |
| 6 | Build Eval Runner | Verify + Observe quality (D, T measurement) |
| 7 | Build Usage Analyst | Observe signal (requires journey tracking #23) |
| 8 | Build Marketing agent | Strategize completeness |

---

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
| `_specs/signal/*.md` | Signal reports | Signal/Observe agents |
| `.claude/skills/*/SKILL.md` | Skill implementations | Human |
| `.claude/agents/*.md` | Agent subprocess definitions | Human |
| `CLAUDE.md` | Code practices (Claude Code convention — must stay in root) | Human |
| `CODE_STRUCTURE_CHECKLIST.md` | Detailed code rules (paired with CLAUDE.md) | Human |
