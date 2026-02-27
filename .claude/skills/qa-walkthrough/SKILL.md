---
name: qa-walkthrough
description: Run a fresh-eyes QA walkthrough of the table.that app as a new user. Uses Playwright MCP to test landing page, registration, chat, table creation, and more.
---

# QA Walkthrough

## Arguments
$ARGUMENTS — optional: BASE_URL (default: http://192.168.0.12:5173) or specific phases to run (e.g., "phase 1-3", "chat only")

## Instructions

Spawn the `qa-walkthrough` agent with a prompt that includes:
1. The BASE_URL to test (from arguments or default)
2. Any phase restrictions (from arguments)
3. Instruction to generate a unique test email and run the full test suite

### Full walkthrough (default — no arguments):

Spawn the qa-walkthrough agent with:
```
Run the full QA walkthrough against http://192.168.0.12:5173 (or the provided BASE_URL).
Generate a unique test email using the current timestamp.
Execute all 10 phases and produce the structured QA report.
```

### Partial walkthrough (with arguments):

If the user specified specific phases or areas, modify the agent prompt accordingly:
- "landing only" → Run only Phase 1
- "chat" → Run Phases 1-6 (need to register to test chat)
- "phase 7-10" → Assume user is already logged in, start from table interactions

### After the walkthrough:

1. Present the full QA report to the user
2. If issues were found, ask if the user wants you to fix them
3. Screenshots are saved in the current working directory with `qa-*` prefix
