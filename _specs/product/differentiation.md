# Competitive Differentiation: TableThat vs Generic Chatbots

## Purpose

This document analyzes why the Build → Populate → Enrich workflow fails when attempted through generic AI chatbots (ChatGPT, Claude, Gemini, etc.) and succeeds through TableThat. The goal is to understand — concretely, through specific use cases — where the structural advantages lie and what failure modes the generic tools exhibit.

---

## Our Core Workflows

For reference, TableThat's value loop:

1. **Build** — User describes what they need in natural language. AI proposes a typed schema (columns with types, select options, required flags). User reviews and approves.
2. **Populate** — AI researches real entities from the web and proposes rows as a reviewable data proposal. User selects which to keep, edits values, applies.
3. **Enrich** — User adds a column (e.g., "Website URL" or "Year Founded"). AI researches each existing row individually using web search, fetching, and extraction. Results appear as a reviewable proposal with per-row confidence.
4. **Maintain** — User filters, sorts, edits inline, adds rows, re-enriches. The table is a living workspace.

The key structural properties that enable this:

- **Persistent structured state** — The table schema and data persist across turns. The AI sees the current state every turn.
- **Typed columns** — Select options, booleans, numbers, and dates are enforced, not just text.
- **Proposal-and-review pattern** — Every bulk change is shown as an interactive diff the user can selectively accept.
- **Per-row agentic research** — Enrichment runs a multi-step research loop per row (search → fetch → extract → coerce), not a single LLM generation.
- **Value coercion** — Research outputs are type-fitted to the column (text → select option, free text → boolean, etc.).

---

## Use Case Analysis

### Use Case 1: "Build me a list of the 20 best Italian restaurants in Chicago"

**What TableThat does:**
1. AI proposes a schema: Name (text), Neighborhood (select), Price Range (select: $, $$, $$$), Cuisine Style (select), Rating (number), Website (text), Phone (text), Michelin Stars (number), Open Since (date)
2. User reviews schema, adjusts (maybe removes Michelin Stars, adds Vegetarian Options as boolean)
3. AI uses web search → fetch → extraction to find real restaurants. Proposes 20 rows as a data proposal with real names, real addresses, real ratings pulled from actual sources.
4. User reviews the list in a table, unchecks ones they don't want, edits a misspelled name, applies.
5. User adds a "Reservation Link" column. AI enriches each row — visits each restaurant's website, finds the OpenTable or Resy link.

**What happens in ChatGPT/Claude:**

The user asks the same question. The chatbot generates a numbered list in markdown:

```
1. Alinea - $$$$ - Michelin 3-star - Lincoln Park
2. Girl & the Goat - $$$ - West Loop
3. Spiaggia - $$$$ - Gold Coast
...
```

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Data is from training data, not live web** | Accuracy | ChatGPT doesn't search the web by default. Even with browsing enabled, it searches once and summarizes — it doesn't systematically research 20 entities individually. Restaurants that opened or closed since training are wrong. |
| **Output is a flat text list, not a table** | Structure | Markdown tables are static text. User can't sort, filter, or edit individual cells. To change one rating, they re-prompt the whole list. |
| **No schema** | Structure | The "columns" are whatever the AI decided to include. No types, no options, no consistency. One row might say "$$$" and another "expensive." |
| **Can't incrementally enrich** | Workflow | User says "now add the website for each one." The chatbot regenerates the entire list with websites added — potentially changing other values in the process. No isolated column operation. |
| **No selective review** | Trust | User can't uncheck row #7 and keep the rest. It's all or nothing. Copy-paste into a spreadsheet to get editability, losing the AI connection. |
| **State resets** | Persistence | If the conversation is long, the chatbot loses context on the original list. In a new session, the list is gone entirely. |
| **Hallucinated data** | Accuracy | The chatbot confidently generates restaurant details from its training data. No way to know which details are current vs. outdated vs. invented. No research trail. |

---

### Use Case 2: "Track my job applications"

**What TableThat does:**
1. User says "I need to track my job applications." AI proposes: Company (text), Position (text), Status (select: Applied, Phone Screen, Interview, Offer, Rejected), Date Applied (date), Salary Range (text), Contact Name (text), Notes (text), Follow Up Date (date), Heard Back (boolean)
2. User applies schema. Starts adding rows manually or via chat.
3. Over weeks, user updates statuses, adds new applications, filters by Status to see active pipeline.
4. User says "look up the company website and Glassdoor rating for each company." AI enriches with live web research per row.

**What happens in ChatGPT/Claude:**

User asks "help me track my job applications." The chatbot suggests a spreadsheet template or offers a markdown table. Subsequent interactions:

- "Add Acme Corp, applied yesterday for Senior Engineer" → chatbot outputs the updated markdown table. The whole table. Every time.
- "Change Acme Corp status to Interview" → chatbot outputs the entire table again with one cell changed.
- After 15 applications and 30 updates, the conversation is enormous and the chatbot starts dropping rows or getting confused about which version is current.

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **No persistent state** | Persistence | The "table" exists only as text in the conversation. Every modification requires regenerating the entire table. |
| **Drift and data loss** | Accuracy | As the conversation grows, the chatbot loses track of the canonical state. Row 8 silently disappears. A status reverts to a previous value. The user doesn't notice until they do. |
| **No filtering or sorting** | Structure | "Show me only the ones where I haven't heard back" requires the chatbot to regenerate a filtered view — which is a new text block, not an interactive filter. |
| **Can't do partial updates** | Workflow | "Mark all 'Applied' as 'Rejected' if it's been more than 30 days" is nearly impossible. The chatbot has to identify qualifying rows, regenerate the full table, and hope it doesn't introduce errors. |
| **No inline editing** | Structure | To fix a typo in one cell, you either re-prompt the whole table or manually edit the markdown (if the chatbot even supports that). |
| **Cross-session loss** | Persistence | Start a new conversation — your table is gone. ChatGPT's memory feature stores preferences, not structured data. |

---

### Use Case 3: "Compare the top 10 project management tools"

**What TableThat does:**
1. AI proposes a schema: Name, Category (select: Full PM, Kanban, Hybrid), Pricing (text), Free Tier (boolean), Team Size (text), Key Features (text), Integrations (text), Website (text)
2. AI researches each tool from the web, proposes 10 rows with real current pricing, real feature lists.
3. User applies, then says "add a column for whether they have a Gantt chart view."
4. AI enriches: for each tool, searches "[tool name] Gantt chart," visits the product page, extracts yes/no. Results come back as boolean values with confidence levels.
5. User filters: Free Tier = Yes, has Gantt chart = Yes. Three tools remain. User exports as CSV to share with the team.

**What happens in ChatGPT/Claude:**

Chatbot produces a comparison table from training data. Pricing is from 2024. One tool has been acquired and renamed. The "Free Tier" column has inconsistent values ("Yes", "Free plan available", "Freemium").

User asks "which ones have a Gantt chart?" The chatbot regenerates the whole table with a Gantt column added — but it's answering from training data, not from checking each product's current feature page.

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Stale data** | Accuracy | Training data is months to years old. SaaS pricing changes quarterly. Features are added and removed. Acquisitions happen. |
| **No per-entity research** | Accuracy | The chatbot answers the Gantt chart question from memory, not by visiting 10 product pages. It's guessing, not researching. |
| **Inconsistent types** | Structure | Without typed columns, "Free Tier" might be "Yes," "Free plan available," "Limited free tier," or "✓" across different rows. Can't filter reliably. |
| **Can't export** | Workflow | Markdown table → copy → paste into Google Sheets → manually clean up formatting. Every update means re-doing this. |
| **No incremental column addition** | Workflow | Adding "Gantt chart" regenerates all 10 rows. The chatbot might change the pricing values it previously generated — the user can't tell what changed. |

---

### Use Case 4: "Research publishers that accept science fiction short stories"

**What TableThat does:**
1. AI proposes: Publication Name, Submission Type (select: Open, Closed, Invite Only), Payment (select: Pro, Semi-Pro, Token, None), Word Count Limit (number), Response Time (text), Website (text), Submission URL (text), Simultaneous Subs (boolean), Last Updated (date)
2. AI researches real publications from writer databases and market listings. Proposes 20 rows with verified details.
3. User enriches: "check which ones are currently open for submissions" — AI visits each publication's submissions page, checks real-time status.
4. User filters: Open = Yes, Payment = Pro or Semi-Pro. Sorts by Response Time. Exports the shortlist.

**What happens in ChatGPT/Claude:**

Chatbot produces a list from training data. Some publications have folded. Submission windows have changed. Payment rates are outdated. The user has no way to know which entries are current without manually checking each one — which is the exact work the tool was supposed to eliminate.

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Can't verify current status** | Accuracy | Publication submission windows change monthly. The chatbot can't check whether Clarkesworld is currently open — it answers from training data. |
| **No per-row live verification** | Workflow | The fundamental operation ("check each publisher's current status") requires visiting 20 different websites. The chatbot does zero web fetches for this — it generates all 20 answers from memory. |
| **Outdated payment rates** | Accuracy | Pro rates change. Semi-pro markets upgrade. New markets launch. Training data can't track this. |
| **No ongoing maintenance** | Persistence | Next month, user wants to recheck. In a chatbot, they start from scratch. In TableThat, they re-run enrichment on the existing table. |

---

### Use Case 5: "Find apartments in Brooklyn under $3,000/month"

**What TableThat does:**
1. AI proposes: Address, Neighborhood (select), Bedrooms (number), Rent (number), Broker Fee (boolean), Pets Allowed (boolean), Laundry (select: In-Unit, In-Building, None), Transit (text), Listing URL (text)
2. AI searches real estate listing aggregators (StreetEasy, etc.) and proposes real listings.
3. User enriches: "check if each building has a doorman" — AI researches each address individually.
4. User filters: Pets Allowed = Yes, Bedrooms >= 1, Rent <= 2800. Sorts by Neighborhood.

**What happens in ChatGPT/Claude:**

Chatbot cannot access real estate listing sites in real-time. Generates fictional or training-data-based listings. Addresses may not exist. Prices are from whenever the training data was cut. Availability is unknown. The user gets a list that looks helpful but is functionally useless for actually finding an apartment.

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Fictional listings** | Accuracy | The chatbot generates plausible-sounding apartment listings that don't exist. "123 Atlantic Ave, 2BR, $2,400" — maybe that building doesn't have rentals, or the price is wrong, or the building was demolished. |
| **No live availability** | Accuracy | Apartment listings change daily. A list from training data is guaranteed stale. |
| **Can't filter numerically** | Structure | "Show me only under $2,800" in a chatbot means regenerating the list. In TableThat, it's a column filter. |
| **No structured comparison** | Workflow | Side-by-side comparison of 15 apartments across 8 dimensions is a table operation. In a chatbot, it's a wall of text. |

---

## Failure Mode Taxonomy

Across all use cases, chatbot failures cluster into five structural categories:

### 1. Statelessness
Generic chatbots don't maintain structured state across turns. The "table" is text in the conversation, regenerated on every modification. This causes:
- Data drift (values silently change between regenerations)
- Data loss (rows disappear in long conversations)
- No incremental updates (every change regenerates everything)
- Cross-session loss (new conversation = start over)

**TableThat advantage:** Persistent database-backed table with typed schema. The AI sees the current state as structured context every turn. Changes are surgical (update one cell, add one column) not generative (regenerate the whole table).

### 2. No Real-Time Research Per Entity
Generic chatbots answer from training data or, at best, a single web search summarized into a response. They don't run a research loop per row — search, fetch, extract, verify — for each entity in a list.

**TableThat advantage:** The enrichment pipeline runs a multi-step agentic research loop per row. Each cell value is the result of live web research, not LLM generation. The user gets a research trace showing exactly what sources were consulted.

### 3. No Typed Structure
Generic chatbot output is text. Even markdown tables are flat strings with no enforcement of types, options, or consistency. This means:
- No filtering (can't filter by a select option that doesn't exist as a concept)
- No sorting (can't numerically sort a column that mixes "$2,400" and "about 2400")
- Inconsistent values (same concept expressed different ways across rows)
- No validation (nothing prevents nonsense values)

**TableThat advantage:** Typed columns (text, number, date, boolean, select with defined options). Value coercion ensures research results fit the column type. Filters and sorts work because the data is structurally consistent.

### 4. No Selective Review
Generic chatbots present output as a monolithic block. The user either accepts the whole thing or re-prompts. There's no mechanism to:
- Accept row 3 but reject row 7
- Edit one cell before accepting
- See what changed between the old and new version

**TableThat advantage:** Proposal-and-review pattern with per-row checkboxes, inline editing before apply, and visual diffs (green for additions, amber for updates, red for deletions).

### 5. No Incremental Enrichment
Generic chatbots can't isolate a column operation. "Add the website for each company" in a chatbot means regenerating the entire table with a new column — and the chatbot may change other values in the process. There's no concept of "hold these 8 columns fixed and research only column 9."

**TableThat advantage:** `enrich_column` is a first-class operation. It adds values to one column across existing rows without touching any other data. Each row's enrichment is an independent research task with its own trace.

---

## The Compound Advantage

The individual advantages above compound. Consider the full workflow for "compare project management tools":

In a chatbot:
1. Generate list (from memory, stale) → 2. Copy to spreadsheet → 3. Manually Google each tool's current pricing → 4. Manually check feature pages → 5. Manually update spreadsheet → 6. Re-sort manually → 7. Next month, start over

In TableThat:
1. AI proposes schema (user reviews) → 2. AI researches current data (user reviews) → 3. User adds a column → 4. AI researches per row (user reviews) → 5. Filter, sort, export → 6. Next month, re-enrich

The chatbot saves time on step 1 (generating the initial list). TableThat saves time on steps 1 through 7 and continues saving time on every subsequent update. The more columns and the more rows, the wider the gap. For a 20-row table with 10 columns, the chatbot saves maybe 10 minutes (the initial list generation). TableThat saves hours (the ongoing research, maintenance, and re-verification).

---

## Part 2: The Analytical Enrichment Angle

The use cases above focus on *research* — discovering new facts about entities from the web. But there's a whole second mode where the table is an **analytical workspace** for data the user already has or is accumulating over time. Here, enrichment isn't "look up the website" — it's "categorize this," "score this," "tag this," "flag this for follow-up." The columns you're adding exist for **sorting, filtering, and decision-making**, not for capturing external facts.

This is the vendor list, the candidate pipeline, the deal tracker, the content calendar. Data that lives and evolves. You're constantly asking: "which of these need attention?" "how do these break down by category?" "which ones meet my criteria?" The table is a persistent analytical lens on an evolving set of entities.

### Why This Angle Matters Separately

In the research angle, the chatbot's main failure is **it can't access live data**. In the analytical angle, the chatbot's main failure is different: **it can't maintain and evolve a structured dataset that you filter and act on repeatedly.** Even if the chatbot had perfect knowledge, the workflow still breaks because the *interaction pattern* is wrong — you need persistent state, typed filters, incremental updates, and the ability to revisit and re-analyze.

---

### Use Case 6: "Evaluate our vendor shortlist"

A procurement manager has 30 vendors to evaluate for a software purchase. They already have names and basic info. They need to systematically assess each one.

**What TableThat does:**
1. User creates a table (or imports CSV) with: Vendor Name, Product, Annual Cost, Contract Length.
2. User says "add a column for Security Compliance — SOC2, ISO 27001, or Neither." AI proposes a select column. Applied.
3. User says "research each vendor's security certifications." AI enriches per row from live web data. Results are select values (SOC2 / ISO 27001 / Both / Neither), not free text.
4. User says "add a Priority column — High, Medium, Low — based on whether they meet our budget under $50K and have SOC2." AI enriches using computation strategy — reads each row's cost and compliance, applies the rule, sets the select value.
5. User filters: Priority = High, Security = SOC2 or Both. Seven vendors remain. User exports for the review committee.
6. Two weeks later, user updates: "mark DataCo as eliminated — they failed the demo." Changes one row's Status. Filters still work. Table is current.
7. A month later, new vendors are added. User re-enriches the Priority column. New rows get scored automatically.

**What happens in ChatGPT/Claude:**

User pastes the 30 vendor names and asks for analysis. The chatbot generates a wall of text — maybe a markdown table — with its assessment of each vendor from training data.

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Can't apply rules consistently across 30 rows** | Consistency | User says "if cost < $50K and SOC2, mark as High priority." In a chatbot, this is a single generation where the LLM applies the rule to all 30 rows at once. It will make mistakes — misread a number, skip a row, apply the logic inconsistently. There's no mechanical guarantee that the rule was applied the same way to row 1 and row 30. |
| **Can't re-apply after changes** | Persistence | User eliminates 5 vendors and adds 3 new ones. "Re-score the priorities." The chatbot has to regenerate everything. In TableThat, re-enriching the Priority column only processes rows that need updating. |
| **Can't filter the result** | Structure | "Show me only the High priority vendors with SOC2." In a chatbot, this means asking it to regenerate a filtered sublist. The user can't toggle filters interactively, combine filter criteria, or quickly switch between views. |
| **Status tracking doesn't work** | Persistence | Vendor evaluations evolve over weeks. Statuses change (Evaluating → Demo Scheduled → Approved → Eliminated). In a chatbot, there's no persistent Status column to update — every change requires restating the entire context. |
| **Exported snapshots go stale immediately** | Workflow | User copies the chatbot's table to a spreadsheet. Next week, three vendors updated their pricing. The spreadsheet is stale. There's no connection between the chatbot's output and the user's working data. |

---

### Use Case 7: "Manage my content calendar"

A marketing manager tracks blog posts, social media, and email campaigns. Needs to plan, schedule, tag by theme, track status, and spot gaps.

**What TableThat does:**
1. Schema: Title, Channel (select: Blog, Twitter, LinkedIn, Email, Newsletter), Status (select: Idea, Drafting, Review, Scheduled, Published), Theme (select: Product, Culture, Tutorial, Case Study), Author, Publish Date (date), Performance (select: High, Medium, Low, Not Measured)
2. User adds 40 content items over several weeks via chat and manual entry.
3. User says "tag the Performance column based on engagement — use High if it was shared more than 50 times." AI enriches using web research (checks share counts on published items) + computation (applies the threshold).
4. User filters: Theme = Tutorial, Status = Published, Performance = Low. "These are the tutorials that didn't land. What themes did well?"
5. AI can see the filtered data and answer analytically: "Your Case Study posts consistently perform High. Your Tutorial posts average Low except when paired with the Product theme."
6. User says "flag everything from January that doesn't have a Performance rating yet." AI adds a Needs Review (boolean) column and enriches based on date + Performance.

**What happens in ChatGPT/Claude:**

User describes their content calendar and asks for help organizing it. The chatbot can brainstorm content ideas or suggest a structure — but it can't *be* the calendar.

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Can't accumulate data over time** | Persistence | A content calendar grows week by week. Each new item is a row. In a chatbot, you'd need to paste the entire calendar every time you want to add an item or ask a question about it. After 40 items, you're hitting context limits. |
| **Can't answer analytical questions about the data** | Structure | "What percentage of my Blog posts are in Drafting status?" requires counting across a structured dataset. The chatbot would need the full dataset in context, and even then it's doing arithmetic on markdown text — error-prone. TableThat has the data in a database with typed columns; the AI sees distributions in its context. |
| **Can't derive columns from existing data** | Workflow | "Flag everything from January without a Performance rating" is a computation across two columns (date + performance). In a chatbot, this is a one-shot LLM generation applied to a text blob. In TableThat, it's a per-row computation with type-aware coercion to boolean. |
| **Filters don't exist** | Structure | Switching between views — "show me just the Scheduled items" vs "show me just the Low performers" — is instantaneous with filter chips. In a chatbot, each view is a new request that regenerates a filtered list. |
| **No visual density** | Presentation | 40 items across 8 columns is a spreadsheet-density problem. A chatbot presents this as a long markdown table or a list — neither supports the information density needed for editorial planning. |

---

### Use Case 8: "Score and prioritize inbound leads"

A sales rep gets 50 inbound leads per week. Needs to score them and prioritize follow-up.

**What TableThat does:**
1. Import CSV from CRM export: Company, Contact Name, Email, Title, Company Size, Source.
2. User says "add a Lead Score column — Hot, Warm, Cold — based on company size over 100, title contains VP or Director, and source is Referral or Demo Request." AI proposes select column, then enriches using computation. Each row is scored by rule.
3. User says "research the company website and industry for each lead." AI enriches two columns (Website, Industry) via live web research.
4. User says "add a Follow-Up Action column — schedule demo, send deck, nurture email — and recommend one for each lead based on their score and industry." AI enriches using a combination of the existing data: Hot leads get "schedule demo," Warm leads in Tech get "send deck," Cold leads get "nurture email."
5. User filters: Lead Score = Hot. Sorts by Company Size descending. Calls the first five today.
6. Next week: imports a new batch. Re-enriches Lead Score. Existing scored leads keep their values. New leads get scored.

**What happens in ChatGPT/Claude:**

User pastes 50 leads and asks "score these." Chatbot generates scores — but:

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Can't ingest 50 rows reliably** | Scale | Pasting 50 rows of CSV into a chatbot stretches context. The chatbot may truncate, lose rows, or misparse the data. And next week, you're pasting 50 more — the chatbot has no memory of last week's batch. |
| **Scoring rules applied inconsistently** | Consistency | The chatbot applies "company size > 100 + VP title + referral source → Hot" to 50 rows in a single generation. By row 35, it's pattern-matching rather than faithfully applying the rule. It might score a 90-person company as Hot because the title looked senior enough. No mechanical enforcement. |
| **Can't combine computed + researched columns** | Workflow | "Score based on size and title (from the data), plus industry (which needs to be researched first)" is a two-pass operation: research Industry, then compute Score using Industry as an input. Chatbots have no concept of column dependencies or multi-pass enrichment. |
| **Can't re-score on new batches** | Persistence | New leads arrive. The scoring logic needs to run again on just the new rows, preserving previous scores. In a chatbot, there's no concept of "run this on the new rows." You regenerate everything. |
| **Can't act on the scored data** | Workflow | "Show me the Hot leads, sorted by company size" is a filter + sort. In a chatbot, it's a new prompt. The scored list exists only as text. |

---

### Use Case 9: "Track and triage customer support issues"

A support lead tracks recurring issues to identify patterns and advocate for fixes.

**What TableThat does:**
1. Schema: Issue Description, Customer, Severity (select: Critical, High, Medium, Low), Product Area (select: Auth, Billing, API, Dashboard, Mobile), Status (select: New, Investigating, Escalated, Fixed), First Reported (date), Occurrences (number), Engineering Ticket (text)
2. User adds issues over time via chat ("add a new issue: customers can't reset passwords, critical, Auth area, 12 reports this week").
3. User says "re-categorize severity based on occurrences — anything with 10+ is Critical, 5-9 is High." AI enriches Severity using computation against the Occurrences column.
4. User filters: Status = New or Investigating, Severity = Critical. Five issues need immediate attention.
5. User says "which Product Area has the most Critical issues?" AI reads the table context (value distributions are in the system prompt) and answers: "Auth has 3 Critical, Billing has 2."
6. Monthly: user says "show me the trend — how many new issues per Product Area this month vs last?" The data is in the table; AI can compute from the date and product area columns.

**What happens in ChatGPT/Claude:**

The support lead tries to use a chatbot as an issue tracker. They describe issues conversationally.

**Failure modes:**

| Failure | Category | Why it happens |
|---------|----------|----------------|
| **Can't accumulate over time** | Persistence | Issues trickle in over weeks. A chatbot conversation that spans weeks is unworkable — context limits, drift, loss. A new conversation means re-entering everything. |
| **Can't reclassify in bulk** | Workflow | "Re-score severity based on occurrences" requires reading a number column and writing to a select column across all rows. This is an enrichment operation. The chatbot would need the full dataset, apply the rule in one shot, and regenerate the whole table. |
| **Can't answer aggregate questions** | Structure | "Which Product Area has the most Critical issues?" is a group-by + count query. TableThat's context builder sends value distributions to the AI as structured data. A chatbot has to count from a text blob. |
| **No ongoing canonical state** | Persistence | The "table" in a chatbot is whichever markdown block was generated most recently. Is issue #7 still "Investigating"? Did someone update it? The chatbot doesn't know. TableThat has a row that persists and gets updated in place. |
| **Can't cross-reference with a filter** | Structure | "Show me Critical Auth issues that are still New" is a two-column filter. Instant in TableThat. In a chatbot, it's a re-prompt that regenerates a filtered list — and the next question requires a different filter, another re-prompt. |

---

## Analytical Enrichment Failure Modes

The analytical use cases reveal failure categories that are distinct from the research-focused ones:

### 6. No Rule-Based Computation Across Rows

When enrichment means "apply this rule to every row" (scoring, categorizing, flagging), chatbots apply the rule via a single generation — essentially asking the LLM to be a for-loop. This is inherently unreliable:
- Rules are applied with decreasing fidelity as the row count increases
- No guarantee of consistency between row 1 and row 50
- No ability to re-apply after data changes without regenerating everything

**TableThat advantage:** The computation strategy applies the rule per row, mechanically. Each row is an independent operation. Re-enrichment runs only on rows that need it. The result is coerced to the column type (select option, boolean, number), not free text.

### 7. No Persistent Analytical State

Analytical workflows are inherently temporal — data accumulates, statuses change, new items arrive. The user needs a stable workspace they return to daily or weekly. Chatbots are session-scoped. Even with memory features, they store preferences, not datasets.

**TableThat advantage:** Database-backed persistence. The table exists between sessions. The user opens it, sees current state, filters to their view, makes updates, closes it. Next week, it's still there with all their changes.

### 8. No Interactive Filtering

The core act of analysis is filtering: show me X where Y. In a spreadsheet or TableThat, this is instantaneous and combinable — filter by status AND priority AND date range, then switch to a different combination. In a chatbot, every filter combination is a new prompt that regenerates the view.

**TableThat advantage:** Typed filter bar with boolean toggles and select dropdowns. Filters compose (AND). Active filters persist across interactions. The AI sees the active filter state and can reason about the filtered subset.

### 9. No Column Dependencies

Real analytical workflows have column dependencies: Score depends on Size + Title. Priority depends on Score + Deadline. Status depends on Priority + Last Contact. Chatbots have no concept of these dependencies. TableThat doesn't model them explicitly yet either — but the enrichment system allows multi-pass enrichment where later columns can read earlier columns' values.

**TableThat advantage:** Enrichment can reference any existing column via `{Column Name}` interpolation. A second enrichment pass can use the output of the first. This enables chained analytical logic: research → categorize → score → prioritize.

### 10. No Aggregate Awareness

Analytical questions are often about the *distribution* — "how many in each category?" "what's the trend?" "which segment is underperforming?" Chatbots working from text blobs can attempt these but are error-prone. TableThat's context builder sends structured value distributions (e.g., `Status: {New: 12, Investigating: 8, Fixed: 23}`) to the AI every turn.

**TableThat advantage:** The AI receives pre-computed aggregate statistics as structured context. It doesn't need to count rows — it reads the distribution and reasons about it. This makes analytical questions reliable, not approximations.

---

## Where Generic Chatbots Are Actually Fine

To be honest about where the advantage is thin or nonexistent:

- **One-off factual questions** — "What's the capital of France?" Don't need a table.
- **Small, static lists from common knowledge** — "List the planets in order." Training data is fine, no research needed, no ongoing maintenance.
- **Creative brainstorming** — "Give me 10 ideas for a blog post." The output is meant to be disposable, not maintained.
- **Analysis of user-provided data** — "Here's my spreadsheet, what patterns do you see?" The chatbot can analyze provided data reasonably well (though it can't persist modifications).

The differentiation is strongest when:
- The data involves **real-world entities that change** (businesses, products, people, listings)
- The user needs to **maintain and update** the data over time
- **Per-entity research** is required (not just general knowledge)
- The user needs to **filter, sort, compare, and act** on the data
- Multiple **enrichment passes** add progressive value to the same dataset
