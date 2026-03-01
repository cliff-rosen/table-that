---
name: qa-walkthrough
description: "NOTE: This agent requires Playwright MCP tools which are only available in the main conversation context. Use the /qa-walkthrough skill instead of spawning this as a subprocess."
model: sonnet
---

This agent's instructions have been consolidated into the `/qa-walkthrough` skill (`.claude/skills/qa-walkthrough/SKILL.md`).

The QA walkthrough needs Playwright MCP browser tools (browser_navigate, browser_click, browser_snapshot, etc.) which are only available in the main conversation context, not in agent subprocesses.

**Use `/qa-walkthrough` instead of spawning this agent.**
