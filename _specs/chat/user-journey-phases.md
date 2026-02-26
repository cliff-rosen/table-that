# Chat User Journey: The Four Phases

The AI assistant must always understand where the user is in their journey and guide them forward. Every table goes through four phases. Users don't think in these terms — the AI does, and uses this understanding to give the right help at the right time.

---

## Phase 1: Define the Structure

**Where:** Tables List page (new table) or Table Edit page (restructuring)

The user has an idea — "I want to track my job applications" or "I need a competitor analysis." The AI's job is to turn that fuzzy idea into a solid schema.

**What the AI does:**
- Propose a complete schema via SCHEMA_PROPOSAL — not just what the user asked for, but what they'll wish they had later
- Think ahead to Phase 3: include columns the user will want for categorization and enrichment (e.g., a "Status" select column, a "Notes" text column, a "Source URL" text column)
- Suggest appropriate types — don't make everything text. Dates should be dates, yes/no should be boolean, anything with a known set of values should be select with options pre-filled
- Ask clarifying questions when the domain is ambiguous, but don't over-ask — make a good proposal and let them adjust

**Phase is complete when:** The table exists with a defined schema.

**Signals the AI can read:**
- User is on tables_list page with no tables → brand new, start here
- User is on tables_list page with existing tables → might be creating a new table or might need something else
- User is on table_edit page → restructuring an existing table (could be Phase 1 revisited from Phase 3)

---

## Phase 2: Get the Data In

**Where:** Table View page (table exists but is empty or sparse)

The table has a schema. Now it needs data. There are several paths and the AI should help the user pick the right one:

1. **CSV Import** — User has data in a spreadsheet. Point them to the Import button. If the CSV columns don't match the schema, help them understand the mapping.
2. **AI-assisted population** — The user describes what they want and the AI uses tools to create rows. Good for "add the top 10 project management tools" or "create entries for these 5 companies."
3. **Web research** — The AI uses search_web and research_web to find real data and populate the table. Good for "find all Y Combinator companies in the healthcare space."
4. **Manual entry** — User clicks Add Record and fills in forms. The AI shouldn't push this path — it's the slowest option.

**What the AI does:**
- Recognize when a table is empty and proactively suggest population strategies
- For AI-assisted population, use DATA_PROPOSAL for bulk adds so the user can review before committing
- For web research population, use for_each_row when filling multiple rows with researched data
- Don't suggest restructuring at this phase unless the schema is clearly broken for the data being entered

**Phase is complete when:** The table has a meaningful set of initial records.

**Signals the AI can read:**
- Table has 0 rows → definitely Phase 2
- Table has a few rows but user is still adding → still Phase 2
- Table has rows and user starts asking questions about the data → transitioning to Phase 3

---

## Phase 3: Organize and Enrich

**Where:** Table View page and Table Edit page (table has data)

This is where table.that's AI really shines. The user has data but wants to make it more useful. Common patterns:

1. **Add categorization columns** — "I want to tag each row as high/medium/low priority." This means going back to Phase 1 briefly (add a select column via schema proposal), then using for_each_row to populate it.
2. **Add enrichment columns** — "I want to know the founding year of each company." Same pattern: add the column, then research and fill it.
3. **Clean and normalize** — "Standardize the date formats" or "Fix the company names to use their official names."
4. **Analyze and summarize** — "Which category has the most entries?" or "What's the average deal size?"

**What the AI does:**
- Recognize that adding a column + populating it is a two-step operation and guide the user through both steps
- When the user asks to "categorize" or "tag" data, propose a select column with appropriate options, then offer to fill it
- When the user asks to "research" or "find out" something about each row, propose a text/number/date column, then use for_each_row
- Proactively suggest enrichment: "You have company names — would you like me to research and add their founding year, employee count, or industry?"

**Phase is complete when:** It's not — users cycle between Phase 3 and Phase 4 repeatedly. Each enrichment round makes the data more actionable.

**Signals the AI can read:**
- User asks to add/change columns on a populated table → Phase 3
- User asks to "categorize," "tag," "classify," "label" rows → Phase 3 (add column + populate)
- User asks to "research," "find," "look up" something for rows → Phase 3 (add column + for_each_row)

---

## Phase 4: Act on It

**Where:** Table View page (table has structured, enriched data)

The data is organized. Now the user wants to use it — make decisions, export subsets, track progress, or just understand what they have.

1. **Filter and explore** — Use the filter bar to slice data by category, status, or boolean flags
2. **Update status** — Mark items as done, change priorities, update progress
3. **Export** — Pull a filtered CSV for a report or to share with someone
4. **Ongoing maintenance** — Add new rows as new items come in, update existing rows as things change

**What the AI does:**
- Help with data questions: "Show me all high-priority items that are still open"
- Help with bulk updates: "Mark all items from Q1 as archived"
- Help with analysis: "What's the breakdown by status?" or "Which items have been open the longest?"
- Recognize when the user needs a new column or category to support their workflow → loop back to Phase 3

**Signals the AI can read:**
- User asks questions about existing data → Phase 4
- User asks to filter, sort, or export → Phase 4
- User asks to update rows → Phase 4
- User asks to add a column or restructure while acting on data → looping back to Phase 3

---

## The Cycle

The phases are not strictly linear. The typical cycle is:

```
1. Define → 2. Populate → 3. Organize → 4. Act
                              ↑            |
                              └────────────┘
```

Users frequently loop between Organize and Act. They act on their data, realize they need another dimension, go back to add a column and populate it, then return to acting. The AI should make this loop feel effortless — recognize the intent, propose the schema change, fill the data, and get out of the way.

---

## How the AI Detects Phase

The AI doesn't ask "what phase are you in?" It reads the signals:

| Signal | Likely Phase |
|--------|-------------|
| No tables exist | Phase 1 |
| On tables_list, asking to build something | Phase 1 |
| Table exists, 0 rows | Phase 2 |
| Table exists, few rows, user adding more | Phase 2 |
| User says "categorize," "tag," "add a column for..." | Phase 3 |
| User says "research," "find out," "look up" for each row | Phase 3 |
| User asks about data, filters, exports | Phase 4 |
| User asks to update/delete specific rows | Phase 4 |
| User asks to add column on populated table | Phase 3 (from 4) |

The AI uses the page context (which page, row count, column count, sample data) plus the user's message to determine the phase and respond appropriately.
