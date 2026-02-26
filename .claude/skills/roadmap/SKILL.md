---
name: roadmap
description: View, add, and manage roadmap artifacts (defects, features, tasks) in the project tracker.
---

# Roadmap Artifact Tracker

## Arguments
$ARGUMENTS — optional: an action like "add defect ...", "add feature ...", "add task ...", "resolve #3", "list", "show #5", or freeform discussion about what to work on next.

## Instructions

The roadmap file lives at `_specs/ROADMAP.md`. This is the single source of truth for all project artifacts.

### If no arguments provided (or "list" / "show"):
- Read `_specs/ROADMAP.md` and display a summary of open artifacts grouped by type (defects, features, tasks)
- Include resolved items count but don't list them unless asked

### If the user wants to add an artifact:
1. Read the current `_specs/ROADMAP.md`
2. Determine the next ID number (increment from the highest existing ID)
3. Add the new artifact to the appropriate section with status `open`
4. Include today's date as the created date
5. Write the updated file
6. Confirm what was added

### If the user wants to resolve/close an artifact:
1. Read the current `_specs/ROADMAP.md`
2. Find the artifact by ID number
3. Change its status to `resolved` and add today's date as the resolved date
4. Write the updated file
5. Confirm what was resolved

### If the user wants to discuss priorities or what to work on:
1. Read `_specs/ROADMAP.md`
2. Provide a thoughtful summary of open items and suggest priorities based on severity/impact

### Format rules for the roadmap file:
- Every artifact gets a unique incrementing ID: `#1`, `#2`, `#3`, etc.
- Each artifact has: ID, type (defect/feature/task), status (open/resolved), severity or priority (P0-P3), title, description, created date, resolved date (if applicable)
- Group by type: Defects first, then Features, then Tasks
- Within each group, open items before resolved items
- Keep descriptions concise — one or two sentences max
- If the file doesn't exist yet, create it with the template below

### Template for new roadmap file:

```markdown
# table.that Roadmap

## Defects

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|

## Features

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|

## Tasks

| ID | P | Title | Status | Created | Resolved |
|----|---|-------|--------|---------|----------|

## Details

(Detailed descriptions go here, keyed by ID)
```

### Severity / Priority:
- **P0**: Broken in production, blocks users
- **P1**: Significant issue or high-value feature, do soon
- **P2**: Normal priority, plan for it
- **P3**: Nice to have, backlog
