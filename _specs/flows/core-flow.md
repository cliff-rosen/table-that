# Core Flow

> Single authoritative document for the core product loop.
> Supersedes: inline-proposals.md, schema-proposal-sequences.md, stress-test-bug-tracker.md (phases 1-2, 6), user-journey-phases.md

---

## Overview

The core flow is the essential product loop that every table.that user performs:

```
Create Table → Populate with Data → Add Enrichment Column → Enrich with AI
                                          ↑                        |
                                          └────────────────────────┘
```

Users cycle between steps 3 and 4 repeatedly — adding columns and enriching them — building richer tables over time. The AI assistant guides users through this loop via chat on the left panel, while the table renders on the right.

---

## Layout

```
┌──────────────────────────────────────────────────────────────────┐
│  Header (app bar, navigation)                                    │
├────────────────────┬─────────────────────────────────────────────┤
│                    │  [SchemaProposalStrip or ProposalActionBar] │
│   Chat Panel       │─────────────────────────────────────────────│
│   (left)          │                                              │
│                    │   Table / Data Grid                         │
│   - AI messages    │   (right)                                   │
│   - User input     │                                             │
│   - Suggestion     │   - Column headers                         │
│     chips          │   - Row data                                │
│                    │   - Inline editing                          │
│                    │   - Filter bar                              │
├────────────────────┴─────────────────────────────────────────────┤
│  Footer                                                          │
└──────────────────────────────────────────────────────────────────┘
```

- **Chat panel**: Left side, toggleable from header
- **Table**: Right side, always visible when a table is open
- **Proposal UI**: Thin strip or action bar above the table (between header and table grid)
- **Suggestion chips**: Appear below AI messages in chat, clickable shortcuts for next actions

---

## Step 1: Create the Table

### What happens

1. **User describes what they need** in chat (e.g., "I want to build a bug tracker" or "Create a table of SaaS competitors")
2. **AI emits `SCHEMA_PROPOSAL`** with mode `"create"`, including:
   - `table_name` and `table_description`
   - `operations`: all `"add"` actions defining columns (name, type, required, options)
   - `sample_rows`: 2-3 example rows to preview
3. **SchemaProposalStrip appears** above the table area (blue/indigo gradient bar)
   - Shows: "Schema changes proposed — N new columns"
   - Buttons: **Apply** and **Dismiss**
4. **Table preview renders** with proposed columns
   - Column headers visible with green highlight (proposed additions)
   - Sample rows shown if included
5. **User clicks Apply**
   - Frontend calls `PUT /api/tables/{id}` with full columns array
   - Sample rows inserted via `POST /api/tables/{id}/rows` (if included and user opted in)
   - Strip disappears
   - Table refreshes with created columns
   - Success toast shown
6. **AI sends follow-up message** suggesting population
   - Suggestion chips appear: e.g., "Import a CSV", "Add sample rows", "Populate with AI research"

### Proposal type

`SCHEMA_PROPOSAL` with `mode: "create"`

### UI component

**SchemaProposalStrip** — thin bar above table with indigo gradient background

### Visual cues

| Element | Color |
|---------|-------|
| New columns in table header | Green highlight |
| Strip background | Blue/indigo gradient |
| Apply button | Default (primary) |
| Dismiss button | Outline |

### After Apply

- Strip auto-dismisses
- Chat receives "[User accepted schema proposal]" message
- AI suggests next step (population) with suggestion chips
- No suggestion chips shown while proposal is active

---

## Step 2: Populate with Data

### What happens

1. **User asks AI to add data** (e.g., "Add 10 sample bugs" or "Research SaaS competitors and add them")
2. **AI gathers data** — either from its knowledge or using web tools (`search_web`, `fetch_webpage`, `research_web`)
3. **AI emits `DATA_PROPOSAL`** with:
   - `operations`: array of `"add"` actions, each with `data` mapping column names to values
   - `reasoning`: brief explanation
4. **ProposalActionBar appears** above the table (violet/blue gradient bar)
   - Shows: "AI Proposed Changes — N additions"
   - Controls: Select All / Deselect All links, **Apply** and **Dismiss** buttons
5. **New rows appear in table** below existing data
   - Green tint on added rows
   - Each row has a checkbox (checked by default)
6. **User reviews rows**, unchecks any unwanted ones
7. **User clicks Apply**
   - Frontend executes sequential `POST /api/tables/{id}/rows` calls
   - Progress bar shows in action bar: "Applying changes... X / Y"
   - Each row shows spinner → checkmark (success) or X (error)
8. **After completion**
   - Success banner: "All N changes applied" (green) or "Applied X of Y — Z failed" (amber)
   - Toast confirms
   - Action bar auto-dismisses after 600ms
   - Table refreshes with saved rows

### Proposal type

`DATA_PROPOSAL` with `"add"` operations

### UI component

**ProposalActionBar** — thin bar above table with violet/blue gradient background

### Visual cues

| Element | Color |
|---------|-------|
| Added rows in table | Green tint, green left border |
| Updated cells (if any) | Amber highlight, hover shows "Was: {old}" |
| Deleted rows (if any) | Red tint, strikethrough, opacity-60 |
| Progress bar | Blue fill on gray track |
| Success banner | Green background |
| Mixed result banner | Amber background |

### After Apply

- Action bar auto-dismisses (600ms delay)
- Chat receives "[User accepted data proposal]" message
- AI suggests next step (enrichment) with suggestion chips
- e.g., "Add a category column", "Research more details", "Show me a summary"

---

## Step 3: Add an Enrichment Column

### What happens

1. **User asks to add a new column** (e.g., "Add a Website column" or "Add a Priority column with High/Medium/Low options")
2. **AI emits `SCHEMA_PROPOSAL`** with mode `"update"`, including:
   - `operations`: one or more `"add"` actions for new columns
   - Column type, options (for select), required flag as appropriate
3. **SchemaProposalStrip appears** above the table
   - Shows: "Schema changes proposed — 1 new column"
4. **New column appears in table header** with green highlight
   - Existing data rows show empty cells in the new column
5. **User clicks Apply**
   - Frontend calls `PUT /api/tables/{id}` with updated columns array
   - Strip disappears
   - Table refreshes with new column added
6. **AI sends follow-up** offering to populate the new column
   - e.g., "Column added! Want me to research websites for each row?"
   - Suggestion chips: "Fill it with AI research", "I'll do it manually"

### Proposal type

`SCHEMA_PROPOSAL` with `mode: "update"`, `action: "add"`

### UI component

**SchemaProposalStrip** — same as Step 1

### Visual cues

| Element | Color |
|---------|-------|
| New column header | Green highlight |
| Modified columns (if any) | Amber highlight |
| Removed columns (if any) | Red, strikethrough |
| Strip background | Blue/indigo gradient |

### After Apply

- Strip auto-dismisses
- AI proactively suggests enrichment for the new column
- This naturally leads to Step 4

---

## Step 4: Enrich with AI Research

### What happens

1. **User asks AI to fill the new column** (e.g., "Research the website for each company" or "Categorize each bug by component")
2. **AI calls `enrich_column` tool** with:
   - `row_ids`: list of rows to process (max 20 per call)
   - `target_column`: the column to fill
   - `strategy`: one of `"lookup"`, `"research"`, or `"computation"`
   - `params`: strategy-specific (question template with `{Column}` placeholders, or formula)
3. **Progress streams in ProposalActionBar** as rows are processed
   - Action bar appears with violet/blue gradient
   - Progress bar advances: "Applying changes... X / Y"
   - Each row shows spinner while processing
4. **Results appear as `DATA_PROPOSAL`** with `"update"` operations
   - Updated cells show green highlight in the target column
   - Research log available (expandable) showing search steps, sources, confidence
5. **User reviews results**
   - Can uncheck individual rows they disagree with
   - Can expand research log to see how AI arrived at each answer
6. **User clicks Apply**
   - Frontend executes sequential `PUT /api/tables/{id}/rows/{row_id}` calls
   - Progress tracking same as Step 2
7. **After completion**
   - Success/mixed banner shown
   - Auto-dismisses after 600ms
   - Table refreshes with enriched data

### Enrichment strategies

| Strategy | When to use | Example |
|----------|------------|---------|
| **lookup** | Simple fact with definitive answer | "What year was {Company} founded?" |
| **research** | Complex question needing multiple sources | "What are all approved treatments for {Disease}?" |
| **computation** | Derive from existing columns | "{Price} * {Quantity}" |

Research strategy supports two thoroughness levels:
- **exploratory** (default): reasonable sampling, good for summaries and descriptions
- **comprehensive**: exhaustive multi-angle search, cross-references sources, includes coverage assessment

### Proposal type

`DATA_PROPOSAL` with `"update"` operations (emitted by `enrich_column` tool)

### UI component

**ProposalActionBar** — same as Step 2, plus optional **ResearchLog** section

### Visual cues

| Element | Color |
|---------|-------|
| Updated cells | Green highlight |
| Strategy badge in research log | Teal (lookup), Blue (research), Amber (computation) |
| Confidence indicator | Green (high), Amber (medium), Red (low) |
| Progress bar | Blue fill |

### After Apply

- Auto-dismisses
- AI suggests next actions with chips
- User often loops back to Step 3 (add another column) or continues in Step 4 (enrich more rows)

---

## Key Rules

### One proposal at a time
A new proposal replaces any existing one. The UI never shows two proposal bars simultaneously.

### Cell editing disabled during proposals
Users cannot directly edit table cells while a proposal is active. They must Apply or Dismiss first.

### No suggestion chips during proposals
The backend suppresses suggestion chips while a proposal is active — the user's next action should be Apply or Dismiss, not chatting.

### Tool vs. Proposal decision
| Scenario | Mechanism |
|----------|-----------|
| Single row, user explicitly asked | Direct tool (`create_row`, `update_row`, `delete_row`) |
| Multiple rows, or AI-initiated | `DATA_PROPOSAL` |
| Any schema change | `SCHEMA_PROPOSAL` |
| Multi-row enrichment | `enrich_column` → `DATA_PROPOSAL` |

### Column name vs. ID
- **Proposals use column names** (not IDs) — frontend resolves names to IDs
- **Tools use column names** in `values`/`changes` parameters
- **Schema modify/remove/reorder use column IDs** (since they reference existing columns)

### Limits
- Max 100 rows per table
- Max 20 rows per `enrich_column` call
- Max 200 rows per `get_rows` call
- AI states limits matter-of-factly, no apologies

---

## Verification Checklist

### Step 1: Create Table

- [ ] User describes a table in chat
- [ ] AI responds with a message containing `SCHEMA_PROPOSAL:`
- [ ] SchemaProposalStrip appears above table area (blue/indigo gradient)
- [ ] Strip shows "Schema changes proposed — N new columns"
- [ ] Proposed columns visible in table header with green highlight
- [ ] Sample rows shown in table (if proposal includes them)
- [ ] Apply button enabled, Dismiss button enabled
- [ ] Clicking Apply: table created, columns appear, strip disappears
- [ ] Success toast shown
- [ ] AI sends follow-up message suggesting data population
- [ ] Suggestion chips appear (e.g., "Import a CSV", "Add sample rows")
- [ ] No suggestion chips shown while proposal strip is active (before Apply/Dismiss)
- [ ] Clicking Dismiss: strip disappears, no table changes, no follow-up

### Step 2: Populate with Data

- [ ] User asks AI to add rows (via chat or suggestion chip)
- [ ] AI gathers data (may use web tools — search_web, fetch_webpage, etc.)
- [ ] AI responds with message containing `DATA_PROPOSAL:`
- [ ] ProposalActionBar appears above table (violet/blue gradient)
- [ ] Bar shows "AI Proposed Changes — N additions"
- [ ] New rows appear in table with green tint
- [ ] Each row has a checkbox (checked by default)
- [ ] Select All / Deselect All links work
- [ ] Unchecking a row excludes it from Apply
- [ ] Apply button shows correct count: "Apply All N" or "Apply X of N"
- [ ] Apply disabled when 0 selected
- [ ] Clicking Apply: progress bar appears, rows show spinners → checkmarks
- [ ] Success banner: "All N changes applied" (green background)
- [ ] Action bar auto-dismisses after ~600ms
- [ ] Table refreshes with saved rows (real IDs, no longer green)
- [ ] AI sends follow-up with suggestion chips for enrichment
- [ ] No suggestion chips while action bar is active

### Step 3: Add Enrichment Column

- [ ] User asks to add a column (via chat or suggestion chip)
- [ ] AI responds with `SCHEMA_PROPOSAL:` (mode: update)
- [ ] SchemaProposalStrip appears with "Schema changes proposed — 1 new column"
- [ ] New column header visible with green highlight
- [ ] Existing rows show empty cells in new column
- [ ] Clicking Apply: column added, strip disappears, table refreshes
- [ ] AI proactively suggests filling the new column
- [ ] Suggestion chips: "Fill it with AI research" or similar

### Step 4: Enrich with AI Research

- [ ] User asks AI to fill the column (via chat or suggestion chip)
- [ ] AI calls `enrich_column` tool (visible in chat as tool use)
- [ ] ProposalActionBar appears with progress bar
- [ ] Progress bar advances as rows are processed: "Applying changes... X / Y"
- [ ] Individual rows show spinners while being enriched
- [ ] After enrichment completes: updated cells show green highlight
- [ ] Research log section available (expandable, collapsed by default)
- [ ] Research log shows strategy badge (lookup/research/computation)
- [ ] Research log shows confidence percentage per row
- [ ] Research log shows step-by-step process (search → fetch → answer)
- [ ] User can uncheck individual rows before applying
- [ ] Clicking Apply: sequential PUT calls, progress tracking, success banner
- [ ] Auto-dismisses after completion
- [ ] Table refreshes with enriched data in target column

### Cross-Step Checks

- [ ] Only one proposal active at a time (new replaces old)
- [ ] Cell editing disabled while any proposal is active
- [ ] Dismissing a proposal clears all proposal state (no lingering highlights)
- [ ] Chat panel stays functional throughout (user can scroll history)
- [ ] Proposal state survives scrolling in the table
- [ ] Dark mode: all proposal UI elements render correctly
- [ ] Mobile/narrow viewport: proposal bars remain usable

### Context Integrity

Verifies that the chat AI always operates on the correct table, especially after navigations and chat-mediated changes (e.g., proposal acceptance that creates a table and navigates).

**After chat-mediated table creation (proposal accept → navigate):**
- [ ] AI knows the correct table name after accepting a proposal that creates a new table
- [ ] AI lists the correct columns for the newly created table
- [ ] AI does not reference columns/data from a previously viewed table
- [ ] Tool calls (add rows, enrich) target the correct table_id

**After navigating between tables:**
- [ ] Navigate from Table A to list to Table B: AI references Table B, not Table A
- [ ] Navigate back to Table A: AI references Table A, not Table B
- [ ] Chat conversation from Table A does not appear when viewing Table B
- [ ] Context includes correct columns, row count, and sample rows for current table

**Continued interaction after navigation:**
- [ ] Asking AI to add rows after navigating to a table targets the correct table
- [ ] Asking AI to modify schema after navigating targets the correct table
- [ ] AI's understanding of column types/options matches the current table

### Error Cases

- [ ] Network error during Apply: error toast, proposal stays active (user can retry)
- [ ] Partial failure in data apply: amber banner "Applied X of Y — Z failed"
- [ ] Enrichment finds no results for some rows: "not found" shown, row unchecked
- [ ] User cancels mid-enrichment: progress stops, partial results shown for review
- [ ] AI proposes schema for column name that already exists: handled gracefully
