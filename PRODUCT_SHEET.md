# table.that — The Modern Data Table Builder

## What it is
table.that lets anyone turn structured data into a fully functional web application in minutes. Describe your columns, and you instantly get a live table with record creation, inline editing, filtering, sorting, and an AI assistant that understands your data and helps you work with it.

## The problem
Teams everywhere manage critical information in spreadsheets that lack validation, access control, and intelligence. Traditional database tools require technical expertise. The gap between "I have tabular data" and "I have an app to manage it" is still too wide.

## How it works
1. **Define your schema** — Name your table, describe your columns (text, number, date, boolean, select, etc.), and set any constraints. Do it through a form or just tell the AI chat what you need in plain English.
2. **Start working immediately** — Your table is live. Add records, edit inline, delete, filter by any column, sort ascending or descending, and search across all fields. No deployment, no configuration.
3. **AI rides shotgun** — A context-aware chat assistant sits alongside your table at all times. It knows your schema, sees your data, and can help you add records, bulk-update fields, analyze patterns, generate summaries, and answer questions about what's in front of you.

## Core capabilities
- **Schema-first table creation** — Define column types, labels, defaults, and validation rules. Modify your schema as needs evolve.
- **Full CRUD** — Add, view, edit, and delete records through a clean, responsive table UI with inline editing.
- **Filter & sort** — Column-level filters (text search, exact match, range, boolean toggle), multi-column sorting, and a global search bar. Combine filters freely.
- **AI columns** — Add computed columns powered by an LLM. Write a prompt template referencing other columns, and the AI evaluates every row — classify, extract, score, or summarize.
- **Chat overlay** — The AI assistant is page-aware. It knows your schema, your current filters, and your visible data. Ask it to add records, suggest filters, explain trends, or bulk-edit rows. It proposes changes for your review before applying them.
- **Import & export** — Bring data in from CSV. Export filtered views to CSV anytime.
- **Multiple tables** — Create as many tables as you need, each with its own schema and chat context.

## Who it's for
Anyone who today reaches for a spreadsheet, an Airtable base, or a quick Access/FileMaker database — project managers, operations teams, researchers, small business owners, internal tools builders. If you have rows and columns of data you need to manage, table.that gets you there faster and smarter.

## Tech foundation
React + TypeScript frontend, Python/FastAPI backend, PostgreSQL storage, LLM integration with streaming responses and tool execution. The chat system uses a layered configuration architecture — global behavior rules, per-table persona, schema-aware context injection, and extensible tool registration — so the AI assistant is always grounded in what the user is actually doing.
