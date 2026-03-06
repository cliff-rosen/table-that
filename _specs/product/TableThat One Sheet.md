# TableThat — One Sheet

---

## The Problem

You need structured data about real things — vendors, apartments, job listings, restaurants, publishers, leads. Today you do one of two things:

1. **Manual research.** Open 30 browser tabs, Google each item, copy-paste into a spreadsheet, repeat for every column. Hours of work for a table that's stale by next week.

2. **Ask ChatGPT.** It generates a table that looks great — until you check it. Three of ten rows actually updated. A column you didn't touch changed. You ask it to fix things. It "fixes" them and breaks something else. You spend more time auditing the AI than doing the research yourself.

Neither works. Manual research is slow. AI chatbots can't maintain a real table — they regenerate everything on every request, lose track of what changed, and mix facts with hallucinations.

---

## What TableThat Does

TableThat is a table builder with an AI research assistant built in. You describe what you need in plain English. The AI builds the table, researches real data from the live web, and lets you review every change before it's applied.

**Three steps:**

**Build** — Describe your table. "Compare project management tools with pricing and features." The AI designs a typed schema — text, numbers, dates, dropdowns, yes/no fields — tailored to your use case. You review and adjust before anything is created.

**Populate** — The AI searches the web and finds real entities. Real businesses with real addresses. Real products with real pricing. Not training data from last year. You see every proposed row, uncheck the ones you don't want, edit anything that's off, and apply.

**Enrich** — Add a column anytime. "Check if each vendor has SOC2 certification." The AI researches each row individually — visits websites, extracts the answer, fits it to the column type. Your existing data is never touched. You review the results before they're applied.

---

## Who It's For

Anyone who collects, organizes, and acts on structured information — for work or personal life.

- **Business owners** comparing vendors, tracking leads, evaluating partnerships
- **Recruiters** managing candidate pipelines across job boards
- **Consultants** building comparison matrices for clients
- **Writers and creators** tracking publishers, grants, and submission windows
- **Apartment hunters** comparing listings across neighborhoods
- **Parents** researching schools, camps, or pediatricians
- **Students** organizing grad school applications and scholarship options
- **Travelers** building itineraries with hotels, restaurants, and activities

What they share: they need structured data about real-world things, they currently spend hours on manual research, and they want to verify what AI produces before acting on it.

---

## Why Not Just Use ChatGPT or Claude?

Chatbots can produce tables — as text in a conversation, as artifacts, even as exported spreadsheet files. The problem isn't that no table exists. The problem is that there's no real collaboration between you and the AI around that table.

When you ask ChatGPT to add a column, it regenerates the whole thing and hands it back. What changed? You don't know — check every cell. Want to keep most of the new rows but reject two? You can't. Want to edit one value before accepting? Copy it into a spreadsheet first. Even when the AI creates a Google Sheet or Excel file, it's a one-way handoff: the AI dumps the output, you receive it, and any back-and-forth means re-prompting and getting a whole new file. There is no workflow where the AI says "here's what I want to change" and you say "yes to these, no to those."

These aren't missing features that will ship next quarter. They're limitations of an interface where the AI generates and you receive.

**TableThat is built around the opposite model.** The table is a real, persistent, interactive object — with typed columns, sortable headers, filter chips, editable cells. It's always there, always in the same place, always showing you the current state of your data. The AI doesn't own the table. You do. When the AI wants to make a change — a new column, a batch of rows, enriched values — it proposes. You see exactly what's being added or modified, in a purpose-built review interface. Uncheck a row you don't want. Edit a cell that's wrong. Accept the rest. Your existing data is never touched unless you approve it.

This isn't a chat window that happens to output tables. It's a table tool with a deliberate, consistent UX — designed so you always know where your data is, what the AI is suggesting, and what will happen when you click Apply.

The chat is the assistant. The table is the product.

| | Generic AI Chatbot | TableThat |
|---|---|---|
| **The data** | Text in chat, artifacts, or exported files — a new output each time | A persistent interactive table with typed columns, sorts, filters |
| **AI collaboration** | One-way: AI generates, you receive | Proposal workflow: AI suggests, you review, accept, or reject per-row |
| **Adding a column** | Regenerates entire table; other values may silently change | Researches only the new column; existing data untouched |
| **Reviewing changes** | All-or-nothing; copy to spreadsheet to edit | Row-by-row checkboxes; edit any cell before applying |
| **What changed?** | No visibility — spot-check everything | Proposals show exactly what's being added or changed |
| **Direct manipulation** | Everything goes through the chat prompt | Click to sort, filter, edit cells, check/uncheck rows |
| **Coming back later** | New conversation = start over | Table persists; re-enrich anytime |

---

## Try It

**TableThat** is free to start. Describe what you need and have a working, researched table in minutes.

- "Build me a list of the 10 best Italian restaurants in Chicago"
- "Compare project management tools with pricing and features"
- "Track my job applications with status, dates, and follow-ups"
- "Find publishers that accept science fiction short stories"

**https://tablethat.ai**