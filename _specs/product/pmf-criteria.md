# Product-Market Fit Criteria for table.that

## Target User

**Primary:** Anyone who needs to collect, organize, and act on structured information from the web — for work or personal life.

Examples (professional):
- Small business owners comparing vendors, tracking leads, evaluating partnerships
- Recruiters managing candidate pipelines across job boards
- Authors/creators tracking submission targets (publishers, grants, conferences)
- Consultants building comparison matrices for clients
- Real estate professionals tracking properties, brokerages, market data

Examples (personal):
- Apartment hunters comparing rentals across neighborhoods
- Parents researching schools, summer camps, or pediatricians
- Travelers building itineraries with hotels, restaurants, activities
- Hobbyists tracking gear, collecting info on models/brands
- Students organizing grad school applications, scholarship options

**What they have in common:**
- They need structured data about real-world entities (companies, people, products, places)
- They currently use spreadsheets, bookmarks, or scattered notes — and spend hours manually researching
- They don't write code and won't use APIs, scraping tools, or complex integrations
- They value accuracy and want to verify what AI produces before acting on it

**Not our user (v1):**
- Data engineers who want SQL/API access
- Teams needing real-time collaboration on the same table
- Users who need complex relational data (joins, foreign keys)
- Users whose primary need is computation/formulas (use a spreadsheet)

## Core Value Proposition

**"Describe what you need. Get a real, researched table you can act on."**

The value loop in three steps:
1. **Build** — Describe your need in plain English. AI designs the schema.
2. **Populate** — AI researches real data from the web. Not samples. Real entities you can contact, visit, or evaluate.
3. **Enrich** — Add columns and AI researches each row individually. Turn a list into an intelligence asset.

The killer insight: the AI doesn't just structure data — it does the research work that would take hours of Googling, tab-switching, and copy-pasting. Every row is a real thing the user can act on.

## What "Good Enough to Launch" Looks Like

### Must work reliably (launch blockers)

1. **Table creation from chat** — User describes what they need, AI proposes a reasonable schema, user approves, table is created. This must work on the first try for common use cases.

2. **Population with real data** — AI proposes real, verifiable entries (not hallucinated or generic). For common domains (businesses, products, publishers, schools), the data should be accurate enough that the user doesn't have to re-research everything.

3. **For-each-row enrichment** — User adds a column and asks AI to research each row. The per-row research should complete without errors for at least 80% of rows and return useful (not obviously wrong) results.

4. **Data proposal review and apply** — User can see what AI proposes, check/uncheck individual items, and apply. This flow must be smooth and not lose data.

5. **Basic table operations** — Sort, filter, inline edit, add/delete rows, import/export CSV. These are table stakes (literally). They must work without bugs.

6. **Authentication and data isolation** — Users can sign up, log in, and only see their own tables. No data leakage.

### Should work well (launch quality)

7. **Research quality** — The web research should use multiple sources, not just the first snippet. Users should be able to see what the AI found and judge the quality.

8. **Schema intelligence** — AI should suggest appropriate column types (select with options, boolean for yes/no questions). Columns should have useful filter chips.

9. **Error recovery** — When a for-each-row run fails partway through, partial results should be preserved. User shouldn't have to start over.

10. **Response time** — Table creation under 15 seconds. Population proposals under 90 seconds. Per-row enrichment under 30 seconds per row.

### Nice to have (post-launch)

11. Background/scheduled research jobs
12. Multiple conversations per table (history)
13. Mobile-responsive layout
14. Google social login
15. Domain-specific tool packs (academic, real estate, etc.)

## Success Measures

### Leading indicators (can measure now)

- **Time to first table**: How long from sign-up to a populated table with real data? Target: under 5 minutes.
- **Research accuracy**: Spot-check enrichment results. What percentage are correct/useful? Target: 70%+ correct on first pass.
- **Completion rate**: Of users who start a chat, how many end up with a populated table? Target: 60%+.
- **Return rate**: Do users come back and create a second table? Target: 30%+ within a week.

### Lagging indicators (measure after launch)

- **Organic signups**: Users finding and signing up without direct outreach.
- **Use case diversity**: Are users applying it to domains we didn't explicitly target?
- **Word of mouth**: Users sharing or recommending the product.
- **Willingness to pay**: Users expressing interest in paid tiers.

### Sean Ellis test

"How would you feel if you could no longer use table.that?"
- Target: 40%+ say "very disappointed" among users who have completed the full build-populate-enrich loop at least once.

## What We Optimize For

1. **Time to first value** — The user should have a useful, populated table within their first session. Every friction point between "I need a list of X" and "here's a researched list of X" is a PMF killer.

2. **Data quality over data quantity** — 10 real, verified entries beat 50 hallucinated ones. The user needs to trust that what AI produces is actionable.

3. **Transparency** — The user should always understand what AI did and why. Proposals over silent mutations. Research logs over black-box answers.

## What We Don't Optimize For (v1)

- Feature completeness — We don't need every spreadsheet feature. We need the AI research loop to be excellent.
- Visual polish beyond usability — Clean and functional beats beautiful but slow.
- Scale — We don't need to handle tables with 100K rows. 500 rows with rich per-row research is the sweet spot.
- Collaboration — Single-user is fine for v1. Multi-user adds complexity without validating the core value prop.
- Platform breadth — Web only. No mobile app, no desktop app, no API.
