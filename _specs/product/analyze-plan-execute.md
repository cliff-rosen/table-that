# Analyze-Plan-Execute: The Core Interaction Model

## The Journey

Every conversation has a starting point (the user's initial request) and a destination (the well-defined goal). The system's job is to narrow the distance between them.

At any moment, the system knows three things:

1. **Where I am** — the current state of play
2. **Where I'm going** — the goal, once elicited and well-defined
3. **What I'm working on now** — the current sub-goal that narrows the distance

The work is iterative. Early on, the gap is large — we're figuring out what the user actually needs. Later, it's small — we're filling specific cells. But the motion is always the same: assess the gap, pick the next thing that narrows it, do that thing, reassess.

## The Three Modes

The system operates in one of three modes at all times:

### Analyzing

Understanding the situation. Asking questions. Surfacing assumptions. Clarifying intent.

The system is curious and questioning. It does not propose solutions or take action. It gathers the information needed to form a plan.

### Planning

Proposing an approach based on current understanding. Presenting it for validation.

The system is propositional. It presents structured proposals (schema designs, enrichment strategies, column configurations) for the user to accept, modify, or reject.

### Executing

Carrying out a validated plan. Acting, not asking.

The system is efficient and progress-oriented. It reports on what it's doing, surfaces issues, and minimizes narration. It does not second-guess the plan unless it encounters a problem.

## Mode Outputs and Handoffs

Each mode produces a structured artifact that becomes the input to the next mode. These are not just conversation prose — they are well-defined schemas.

### Analyzing -> Goal Definition

The output of analyzing is a **Goal Definition**:

```
GoalDefinition:
  objective: string       # What the user wants to accomplish
  audience: string        # Who will use this table / for what context
  success_criteria: string  # How we'll know the table is done and useful
  constraints: string[]   # Budget, time, data source limitations, etc.
```

This artifact feeds into planning. The plan is shaped by the goal, not by the literal words of the original request.

**Example:**
- User says: "I want a table of EGFR inhibitors"
- After analyzing: `{objective: "Compare approved EGFR inhibitors for first-line NSCLC treatment", audience: "Oncology team evaluating treatment options", success_criteria: "Table covers all FDA-approved EGFR TKIs with efficacy and safety data from pivotal trials", constraints: ["Focus on approved drugs only", "Need response rate and PFS data"]}`

### Planning -> Execution Plan

The output of planning is an **Execution Plan**:

```
ExecutionPlan:
  goal: GoalDefinition          # The goal this plan serves
  schema: SchemaProposal        # Table structure (columns, types)
  data_strategy: DataStrategy   # How to populate the table
    sources: string[]           # Where data comes from
    enrichment_order: string[]  # Which columns to fill first
    strategies_by_column: map   # Column -> enrichment strategy
  estimated_scope: string       # How many rows, how much work
```

This artifact feeds into executing. The execution phase follows the plan, doesn't reinvent it.

**Example:**
- Schema: 7 columns (Drug Name, Target, Indication, Line of Therapy, ORR, PFS, Key Toxicities)
- Strategy: Drug Name and Target via quick_lookup. ORR and PFS via deep_research from pivotal trial publications. Key Toxicities via extraction.
- Scope: ~8 approved EGFR TKIs

### Executing -> Results

The output of executing is the **populated table**, verifiable against the goal definition and execution plan.

During execution, the system also produces progress artifacts:

```
ExecutionProgress:
  plan: ExecutionPlan           # The plan being executed
  completed_steps: string[]     # What's done
  current_step: string          # What's in progress
  issues: Issue[]               # Problems encountered
  results_summary: string       # Current state of the table
```

## Mode Management

### State

The conversation carries two fields:

- **`mode`**: `"analyzing"` | `"planning"` | `"executing"`
- **`mode_locked`**: `boolean`

### Default behavior (mode_locked = false)

The current mode is passed to the LLM in the system prompt. The LLM is instructed to declare the current mode as part of its structured response. The system updates the mode based on the LLM's declaration.

The LLM transitions modes based on what's happening:
- When it has enough information to propose a plan, it transitions from analyzing to planning
- When the user accepts a plan, it transitions from planning to executing
- When it encounters something that needs rethinking, it transitions back to analyzing

Any transition is valid in any direction. There is no enforced sequence.

### User override (mode_locked = true)

The user can set the mode explicitly via the UI. When they do, `mode_locked` becomes true. The LLM still sees the mode in its prompt and adapts its behavior accordingly, but it cannot change the mode. The mode changes only when:

- The user sets a different mode
- The user removes the lock (mode_locked returns to false, LLM resumes managing transitions)

### Visibility

The current mode is always visible in the UI. The user can see what posture the system is in and change it at any time.

## How Mode Affects the Chat Config Layers

### Persona / Identity

| Mode | Tone | Initiative |
|------|------|------------|
| Analyzing | Curious, questioning | Understand before acting |
| Planning | Propositional, structured | Propose and validate |
| Executing | Efficient, progress-oriented | Act and report |

### Tools

| Mode | Available Tools |
|------|----------------|
| Analyzing | Read-only: search, get_rows, describe schema. No mutations. |
| Planning | Proposal tools: schema_proposal, enrichment preview. Nothing applied. |
| Executing | Mutation tools: enrich_column, modify_schema, create rows. Action-oriented. |

### Payloads

| Mode | Payload Types |
|------|--------------|
| Analyzing | Informational: summaries, previews, options to consider |
| Planning | Proposals: schema_proposal, data_proposal. Accept/dismiss. |
| Executing | Progress/results: enrichment progress, completion reports |

### Context Builder

| Mode | Context Emphasis |
|------|-----------------|
| Analyzing | High-level: what tables exist, user history, broad data landscape |
| Planning | Detailed: current schema, sample data, available sources, constraints |
| Executing | Operational: row counts, progress, errors, remaining work |

### Client Actions

| Mode | Available Actions |
|------|------------------|
| Analyzing | "Show me examples", "What are my options", "Tell me more" |
| Planning | "Accept", "Dismiss", "Modify", "Start over" |
| Executing | "Cancel", "Pause", "Skip this row", "Show progress" |

## The Missing Piece Today

The current system skips the analyzing phase entirely. A user says "I want a table of EGFR inhibitors" and immediately gets a schema proposal. The schema is shaped by the literal words, not by the user's underlying goal.

The first implementation step is adding the top-level analyzing phase: before proposing anything, establish what the user is trying to accomplish, who it's for, and what success looks like. This doesn't require new infrastructure — it's a persona/prompt change plus the mode state on the conversation. But it fundamentally changes the quality of everything downstream, because every plan is now shaped by a well-understood goal.

## Transition Gates

While any transition is valid (the user can always override), the system should be aware of what's missing:

| Transition | Natural gate |
|------------|-------------|
| Analyzing -> Planning | Goal definition exists |
| Planning -> Executing | Execution plan exists and user has accepted it |
| Executing -> complete | Results satisfy the goal's success criteria |

If the user skips ahead (e.g., goes straight to executing without a plan), the system adapts — but it knows there's no plan artifact and can flag that if issues arise.
