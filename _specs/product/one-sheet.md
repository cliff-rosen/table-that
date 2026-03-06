# table.that — One Sheet

---

## The Problem

You need structured data about real things — vendors, apartments, job listings, restaurants, publishers, leads. Today you do one of two things:

1. **Manual research.** Open 30 browser tabs, Google each item, copy-paste into a spreadsheet, repeat for every column. Hours of work for a table that's stale by next week.

2. **Ask ChatGPT.** It generates a table that looks great — until you check it. Three of ten rows actually updated. A column you didn't touch changed. You ask it to fix things. It "fixes" them and breaks something else. You spend more time auditing the AI than doing the research yourself.

Neither works. Manual research is slow. AI chatbots can't maintain a real table — they regenerate everything on every request, lose track of what changed, and mix facts with hallucinations.

---

## What table.that Does

table.that is a table builder with an AI research assistant built in. You describe what you need in plain English. The AI builds the table, researches real data from the live web, and lets you review every change before it's applied.

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

Everyone who's tried to use a chatbot for structured data has hit the same wall. The problems are structural — not bugs that will get fixed in the next release.

| | Generic AI Chatbot | table.that |
|---|---|---|
| **Data source** | Training data (months to years old) | Live web research per row |
| **Adding a column** | Regenerates entire table; other values may silently change | Researches only the new column; existing data untouched |
| **Reviewing changes** | All-or-nothing; copy to spreadsheet to edit | Row-by-row checkboxes; edit any cell before applying |
| **What changed?** | No visibility — the AI outputs a new table and you spot-check | Proposals show exactly what's being added or changed, with old → new values |
| **Filtering and sorting** | Re-prompt each time for a new view | Instant filter chips and column sorts on typed data |
| **Coming back next week** | New conversation = start over | Table persists; re-enrich anytime |
| **50+ rows** | Context falls apart; rows get dropped or changed | Database-backed; scales without degradation |

The short version: chatbots are text generators. They produce a new block of text every time you ask. table.that maintains a real, persistent, typed table where every change is surgical and reviewable.

---

## The Compound Effect

The gap widens with scale and time:

- **More rows** — A chatbot managing 50 rows starts dropping data. table.that doesn't.
- **More columns** — Each new column in a chatbot risks corrupting existing data. table.that enriches one column at a time.
- **Ongoing use** — Next month you need to add new entries and re-check old ones. A chatbot starts from scratch. table.that re-enriches only what's changed.

For a 20-row vendor comparison with 8 columns, a chatbot saves about 10 minutes on the first draft and then costs hours of verification and manual cleanup. table.that saves the hours.

---

## Try It

**table.that** is free to start. Describe what you need and have a working, researched table in minutes.

- "Build me a list of the 10 best Italian restaurants in Chicago"
- "Compare project management tools with pricing and features"
- "Track my job applications with status, dates, and follow-ups"
- "Find publishers that accept science fiction short stories"

**https://table.that**
