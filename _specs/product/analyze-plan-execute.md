# Analyze-Plan-Execute: The Core Interaction Model

## Overview

Every table-building conversation follows a two-phase structure:

1. **Goal Elicitation** — a one-time upfront activity that establishes what we're building and how we'll know it's done
2. **Iterative Gap-Closing** — a loop that runs until the goal is achieved, with each iteration narrowing the distance

## Phase 1: Goal Elicitation

Before any table work begins, the system must establish the goal. This is not optional — it's the prerequisite for everything else.

The system asks focused questions to understand what the user is trying to accomplish. The output is a **Goal State**:

```
GoalState:
  goal: string                # What the user wants to accomplish
  success_factors:             # Concrete, trackable criteria for "done"
    - string                   # e.g. "Table covers all FDA-approved EGFR TKIs"
    - string                   # e.g. "Each drug has response rate from pivotal trial"
    - string                   # e.g. "Safety data includes most common grade 3+ AEs"
    - ...
```

**Example:**

User: "I want a table of EGFR inhibitors"

After goal elicitation:
```
goal: "Compare approved EGFR inhibitors for first-line NSCLC treatment selection"
success_factors:
  - "All FDA-approved EGFR TKIs for NSCLC are included"
  - "Each drug has indication and line of therapy"
  - "Response rate (ORR) from pivotal trial for each drug"
  - "Median PFS from pivotal trial for each drug"
  - "Key grade 3+ adverse events listed for each drug"
  - "Approval year and pivotal trial name included"
```

The success factors are the contract. They define done. Everything that follows is measured against them.

### When Goal Elicitation Can Be Light

Not every conversation needs deep goal elicitation. If the user says "make me a table with these exact columns: name, dose, route" — the goal is self-evident. The system should recognize when the request is already specific enough and not force unnecessary questioning.

The user can also override: skip goal elicitation entirely and go straight to building. The system adapts, but it knows there's no goal state to measure against.

## Phase 2: Iterative Gap-Closing

Once the goal state exists, the system enters a loop. Each iteration follows the analyze-plan-execute cycle, but "analyze" now has a specific job: **compare current state against the success factors and determine what to do next.**

### The Loop

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│  ANALYZE: Check success factors against current     │
│  state. Which factors are achieved? Which aren't?   │
│  What type of work closes the next gap?             │
│       │                                             │
│       ▼                                             │
│  PLAN: Propose the specific work for this hop       │
│  (schema change, row addition, enrichment)          │
│       │                                             │
│       ▼                                             │
│  EXECUTE: Do the work, report progress              │
│       │                                             │
│       ▼                                             │
│  Loop back to ANALYZE                               │
│       │                                             │
│  All success factors achieved? ──► Done             │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Analysis Within the Loop

During goal elicitation, analysis is open-ended — exploring what the user needs. During the loop, analysis is focused triage. The system looks at the table, compares against the success factors, and asks:

| Question | If Yes → Work Type |
|----------|--------------------|
| Does the table lack columns needed for a success factor? | Schema activity (add/modify columns) |
| Does the table lack rows it should have? | Row population (search, import) |
| Do existing rows have empty cells for required columns? | Enrichment (fill gaps) |
| Are filled cells low-quality or unverified? | Re-enrichment or validation |
| Are all success factors satisfied? | Done |

The success factor delta drives everything. The system doesn't do work speculatively — it does the work that closes the most important remaining gap.

### Success Factor Tracking

At each analysis step, the system evaluates each success factor:

```
Success Factor Status:
  ✓ "All FDA-approved EGFR TKIs for NSCLC are included"     — achieved (8 drugs found)
  ✓ "Each drug has indication and line of therapy"            — achieved (all rows filled)
  ✗ "Response rate (ORR) from pivotal trial for each drug"   — 3 of 8 filled
  ✗ "Median PFS from pivotal trial for each drug"            — 0 of 8 filled
  ✗ "Key grade 3+ adverse events listed for each drug"       — 0 of 8 filled
  ✓ "Approval year and pivotal trial name included"          — achieved
```

This status drives the next hop: "ORR is partially filled, PFS and AEs are empty. Next hop: enrich the ORR column for the remaining 5 drugs, then move to PFS."

## Mode Management

### State

The conversation carries:

```
phase: "goal_elicitation" | "building"
mode: "analyzing" | "planning" | "executing"
mode_locked: boolean
goal_state: GoalState | null
```

### Phase 1: Goal Elicitation

During goal elicitation, mode management does not apply. The system is always in a single posture: understanding what the user wants. There is no planning or executing — the only work is establishing the goal and success factors.

The phase transitions from `goal_elicitation` to `building` when a `GoalState` is established (either through conversation or because the user's request was specific enough to derive one immediately).

The user can skip goal elicitation entirely, in which case the system enters `building` without a goal state. It adapts, but it has no success factors to measure against.

### Phase 2: Building (mode cycles)

Once in the building phase, the analyze/plan/execute mode cycle is active. This is where mode management applies.

**Default Behavior (mode_locked = false):**

The current mode is passed to the LLM in the system prompt. The LLM is instructed to declare the current mode as part of its structured response. The system updates the mode based on the LLM's declaration.

Any transition is valid in any direction. The LLM transitions based on what's happening:
- When it has assessed the gap and knows what to do, it moves from analyzing to planning
- When the user accepts a plan, it moves from planning to executing
- When it encounters something that needs rethinking, it moves back to analyzing
- When execution completes a hop, it moves back to analyzing (loop iteration)

**User Override (mode_locked = true):**

The user can set the mode explicitly via the UI. When they do, `mode_locked` becomes true. The LLM sees the mode and adapts, but cannot change it. The lock is released when the user sets a different mode or explicitly unlocks.

### Visibility

The current phase and mode are always visible in the UI. During goal elicitation, the UI shows that the system is establishing the goal. During building, the UI shows the current mode (analyzing/planning/executing). The user can override at any time.

## Mode Outputs and Handoffs

Each mode produces a structured artifact that feeds forward.

### Analyzing Output

**During Goal Elicitation (no goal state yet):**

Produces a `GoalState` — the goal and success factors.

**During the Loop (goal state exists):**

Produces a **Gap Assessment** — which success factors are met, which aren't, and what type of work is needed next.

```
GapAssessment:
  achieved: string[]           # Success factors that are met
  remaining: string[]          # Success factors not yet met
  next_work_type: "schema" | "rows" | "enrichment" | "validation"
  rationale: string            # Why this is the right next hop
```

### Planning Output

Produces an **Execution Plan** scoped to the current hop:

```
ExecutionPlan:
  targets: string[]            # Which success factors this hop addresses
  work_type: "schema" | "rows" | "enrichment" | "validation"
  steps: Step[]                # Concrete steps
  expected_outcome: string     # What the table looks like after this hop
```

The plan is scoped — it doesn't try to solve everything at once. It addresses one or a few success factors per hop.

### Executing Output

Produces **results** — the actual changes to the table. After execution completes, the system loops back to analyzing, which re-evaluates the success factors.

## How Mode Affects the Chat Config Layers

### Persona / Identity

| Mode | Tone | Initiative |
|------|------|------------|
| Analyzing (goal elicitation) | Curious, focused | Understand the goal, don't propose yet |
| Analyzing (in loop) | Diagnostic, evaluative | Assess gaps, categorize next work |
| Planning | Propositional, structured | Propose and validate |
| Executing | Efficient, progress-oriented | Act and report |

### Tools

| Mode | Available Tools |
|------|----------------|
| Analyzing | Read-only: search, get_rows, describe schema. No mutations. |
| Planning | Proposal tools: schema_proposal, enrichment preview. Nothing applied. |
| Executing | Mutation tools: enrich_column, modify_schema, create rows. |

### Payloads

| Mode | Payload Types |
|------|--------------|
| Analyzing | Informational: gap assessments, data previews, options |
| Planning | Proposals: schema_proposal, data_proposal. Accept/dismiss. |
| Executing | Progress/results: enrichment progress, completion reports |

### Context Builder

| Mode | Context Emphasis |
|------|-----------------|
| Analyzing | Goal state, success factor status, table overview |
| Planning | Current schema, sample data, available sources, constraints |
| Executing | Row counts, progress, errors, remaining work |

### Client Actions

| Mode | Available Actions |
|------|------------------|
| Analyzing | "Show me examples", "What are my options" |
| Planning | "Accept", "Dismiss", "Modify" |
| Executing | "Cancel", "Pause", "Skip" |

## What Changes

### Immediate

The most impactful change is adding goal elicitation. When a user starts a new table conversation:

1. Don't immediately propose a schema
2. Ask focused questions to establish the goal and success factors
3. Use the success factors to drive every subsequent decision

This is primarily a persona/prompt change plus storing the goal state on the conversation.

### Medium-term

- Mode state on the conversation (`mode`, `mode_locked`, `goal_state`)
- Mode-aware tool filtering and persona adjustment
- Success factor tracking and gap assessment
- Mode visibility and override in the UI

### Longer-term

- Automated success factor evaluation (system checks factors against actual table state)
- Smart hop selection (prioritize the highest-value remaining gap)
- Cross-conversation learning (goals and patterns from past tables inform new ones)
