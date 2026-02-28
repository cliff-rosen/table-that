# Agent Contract Schema

## Purpose

This document defines the standard schema for describing an agent in the table.that development system. Every agent — whether it's a strategy advisor, a QA tester, or a code reviewer — is described using this contract. The contract is the node definition in the agent graph.

## The Contract

```yaml
agent:
  name: string                    # Unique identifier (kebab-case)
  display_name: string            # Human-readable name
  mandate: string                 # Single question or responsibility this agent answers
  layer: enum                     # strategy | signal | execution | operations

  inputs:
    - name: string                # What this input is called
      type: enum                  # file | directory | api | codebase | conversation | signal_report
      source: string              # Path, URL, or agent name that produces it
      required: boolean           # Can the agent run without this?
      description: string         # What this input tells the agent

  outputs:
    - name: string                # What this output is called
      type: enum                  # file | conversation | side_effect
      destination: string         # Path or description of where it goes
      format: string              # Markdown template, JSON schema, or free text
      consumers: list[string]     # Which agents read this output
      description: string         # What this output contains

  side_effects:                   # Things the agent changes in the world beyond its outputs
    - description: string         # What it does (e.g., "registers a throwaway account")
      reversible: boolean         # Can it be undone?

  trigger:
    type: enum                    # on_demand | on_cadence | on_event
    detail: string                # Skill name, cron expression, or event description

  authority:
    level: enum                   # read_only | propose | execute
    description: string           # What it can change directly vs what it proposes

  dependencies:
    upstream: list[string]        # Agents whose output this agent consumes
    downstream: list[string]      # Agents that consume this agent's output
```

## Field Definitions

### `mandate`

The single question this agent is responsible for answering. If you can't state it in one sentence, the agent is too broad.

Good mandates:
- "What should we work on right now to reach PMF?"
- "Is the product working from a new user's perspective?"
- "Are the AI tools giving accurate answers?"

Bad mandates:
- "Help with development" (too vague)
- "Scan code, run tests, check quality, and report" (too many responsibilities)

### `layer`

Where the agent sits in the development lifecycle:

| Layer | Purpose | Consumes | Produces |
|-------|---------|----------|----------|
| **strategy** | Decides what to work on | Signal reports, directives | Priorities, roadmap proposals |
| **signal** | Observes and measures | Live app, codebase, data, user behavior | Signal reports (persistent files) |
| **execution** | Does the work | Priorities, specs, codebase | Code changes, artifacts |
| **operations** | Ships and maintains | Code, config | Deployments, migrations |

### `inputs`

Every input must be concrete and enumerable. Not "the codebase" but "the registered tools in `backend/tools/builtin/`". Not "user feedback" but "`_specs/signal/usage-latest.md` produced by the usage-analyst agent."

Input types:
- **file** — A specific file the agent reads
- **directory** — A directory the agent scans
- **api** — A live API endpoint the agent queries
- **codebase** — A pattern-based scan of the codebase (grep/glob)
- **conversation** — Information from the current conversation with the user
- **signal_report** — A file produced by another agent

### `outputs`

Every output must have a destination and format. Signal agents must produce persistent files, not just conversation text. The `consumers` field explicitly names which agents read this output, making the graph edges visible.

Output types:
- **file** — A file written to a specific path
- **conversation** — Text returned to the user in the conversation
- **side_effect** — A change to external state (database, deployment, live app)

### `authority`

Three levels:
- **read_only** — Observes only, changes nothing
- **propose** — Produces recommendations or proposed changes in separate files; human applies
- **execute** — Makes changes directly (writes to roadmap, deploys code, modifies database)

### `dependencies`

Explicit edges in the agent graph. `upstream` means "I consume output from these agents." `downstream` means "these agents consume my output." This makes the graph traversable and lets us identify broken links (an agent expecting input that no other agent produces).

## Design Principles

1. **One mandate per agent.** If an agent has two mandates, split it into two agents. Composition happens through the graph, not through monolithic agents.

2. **Signal agents produce persistent artifacts.** A signal that exists only in a conversation is useless to other agents. Every signal agent writes a report file that the strategy layer can read without re-running the signal agent.

3. **Strategy agents don't gather their own signal.** The PMF Director reads signal reports. It does not scan the codebase, run tests, or browse the app. If it needs a signal that doesn't exist, that's a gap in the signal layer, not a reason to expand the strategy agent.

4. **Inputs and outputs define the graph edges.** If agent A's output is agent B's input, that's a dependency. Make it explicit. Don't have agents implicitly sharing information through "well, they both read the codebase."

5. **Authority matches layer.** Strategy agents propose. Signal agents read. Execution agents execute (with human approval). Operations agents execute on explicit command.
