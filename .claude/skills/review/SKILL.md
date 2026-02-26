---
name: review
description: Review code against all project practices (backend + frontend + layout + modals). Run with no args to review uncommitted changes, or specify files/directories.
---

# Code Review

## Arguments
$ARGUMENTS — optional: file path(s), directory name (e.g., "backend", "frontend"), or blank to review all uncommitted changes.

## Instructions

Use the `code-review` agent to perform a thorough review against the project's practice documents.

### Determine scope from arguments:

**No arguments (or "all"):**
- Review all uncommitted changes (staged + unstaged)
- Run `git diff` and `git diff --cached` to identify changed files
- If there are no changes, tell the user there's nothing to review

**Specific file(s)** (e.g., `backend/routers/tables.py`):
- Review only those files, even if they have no uncommitted changes

**Directory scope** (e.g., `backend`, `frontend`):
- Review uncommitted changes within that directory
- If no changes in that directory, review key files (routers, services, or components)

### Execute the review:

1. Spawn the `code-review` agent with a clear prompt describing the scope
2. The agent will read practice docs, review the code, and produce a structured report
3. Return the agent's report to the user

### After the review:

- If the agent found critical issues, ask the user if they'd like you to fix them
- If the agent found practice evolution observations, ask the user if they'd like to update the practice docs
