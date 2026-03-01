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

### Should have (growth lever)

11. **Shareable tables** — Public link sharing with zero-friction viewing (no login required). This is the primary organic distribution mechanism. Every shared table is a product demo. Fork/duplicate for signed-in users to convert viewers into creators. (Roadmap #24)

### Nice to have (post-launch)

12. Background/scheduled research jobs
13. Multiple conversations per table (history)
14. Mobile-responsive layout
15. Google social login
16. Domain-specific tool packs (academic, real estate, etc.)

## Success Measures

### Leading indicators (can measure now)

- **Time to first table**: How long from sign-up to a populated table with real data? Target: under 5 minutes.
- **Research accuracy**: Spot-check enrichment results. What percentage are correct/useful? Target: 70%+ correct on first pass.
- **Completion rate**: Of users who start a chat, how many end up with a populated table? Target: 60%+.
- **Return rate**: Do users come back and create a second table? Target: 30%+ within a week.

### Lagging indicators (measure after launch)

- **Organic signups**: Users finding and signing up without direct outreach.
- **Use case diversity**: Are users applying it to domains we didn't explicitly target?
- **Shared table views**: How many people view a table via a shared link? Ratio of viewers to creators indicates viral potential.
- **Fork rate**: Of viewers who see a shared table, how many fork it or sign up? Target: 10%+.
- **Word of mouth**: Users sharing or recommending the product.
- **Willingness to pay**: Users expressing interest in paid tiers.

### Sean Ellis test

"How would you feel if you could no longer use table.that?"
- Target: 40%+ say "very disappointed" among users who have completed the full build-populate-enrich loop at least once.

## Quality Evaluation Rubric

Every user interaction with the AI should be evaluated on three layers. Each layer has a different failure mode and a different fix:

1. **Decision quality** — Did the AI make the right call about what to say or which tools to use? A wrong decision is a prompting and/or tool design problem — both system/page prompts (what the AI is told to do) and tool descriptions (how tools present themselves to the AI, what their parameters signal) shape the AI's choices. Example failures: AI tries to research when the user just wants to rename a column; AI calls `lookup` when `deep_research` was needed; AI proposes 50 generic rows instead of 10 researched ones.

2. **Tool reliability** — Given the AI made the right decision, did the tool execute correctly? A tool failure is an engineering problem. Example failures: `fetch_webpage` returns 403 on a bot-protected site; research times out; enrichment crashes mid-run and loses partial results; SerpAPI returns empty results for a reasonable query.

3. **Presentation clarity** — Given everything worked, could the user follow what happened? A presentation failure is a UX problem. Example failures: enrichment results are buried in chat instead of shown inline; data proposal card doesn't make it clear which rows are new vs updated; error messages are technical instead of actionable; research log exists but the user doesn't know where to find it.

The same bad user experience can fail at any one of these layers, and diagnosing which layer failed determines the fix. The QA Walkthrough agent should evaluate every interaction against all three layers.

## Vertical Selection Methodology

PMF requires two things simultaneously: the right market and a working product. Neither alone is sufficient.

### Prong 1: Market Addressability

The vertical must satisfy two conditions:

1. **Real pain point** — People in this vertical are currently spending hours doing manual web research, copy-pasting into spreadsheets, or managing scattered bookmarks. The pain is active and recurring, not hypothetical.

2. **Reachable audience** — We can find and reach these people without a seven- or eight-figure marketing campaign. They congregate in identifiable communities (Reddit, forums, Slack groups, professional associations, Facebook groups). Or the use case lends itself to organic distribution (shared tables that spread to people who have the same need).

If the pain point is real but the audience is unreachable (enterprise procurement teams behind firewalls), it doesn't work. If the audience is easy to reach but the pain point is mild (hobbyist collectors who enjoy the manual work), it doesn't work either.

### Prong 2: Product Quality (Three Layers)

For the chosen vertical, all three quality layers must work well:

1. **Decision quality (D)** — The AI makes the right choices for this vertical's use cases. It picks the right tools, asks the right clarifying questions, structures the table appropriately, and researches with domain-appropriate strategies. A real estate vertical needs the AI to understand property types, brokerages, and market data. A publishing vertical needs it to understand submission guidelines and genre categories.

2. **Tool reliability (T)** — The tools execute correctly for this vertical's data sources. If the vertical requires scraping real estate listing sites that block bots, tool reliability is low until #21 is fixed. If it requires API access to domain-specific databases, tool reliability depends on those integrations existing.

3. **Presentation clarity (P)** — The results are laid out in a way that makes sense for this vertical's users. A vendor comparison needs sortable columns with clear categories. A submission tracker needs status tracking with dates. The table display, data proposal cards, and enrichment results must all be intuitive for the specific use case.

### How to evaluate a vertical

For each candidate vertical, score both prongs:

| Criterion | Question | Signal |
|-----------|----------|--------|
| Pain intensity | How many hours/week do they spend on this manually? | >2 hrs = strong |
| Frequency | How often do they need to do this? | Weekly+ = strong |
| Reachability | Can we find 1,000 of these people for <$500? | Yes = strong |
| Shareability | Would they share a table they built? | Natural sharing = strong |
| Decision quality | Does generic prompting work, or do we need vertical-specific tuning? | Generic works = ready now |
| Tool reliability | Do the data sources we can access cover this vertical? | Public web = ready now |
| Presentation fit | Does a flat table with filters serve this use case well? | Yes = ready now |

A vertical is ready to pursue when both prongs score well. A vertical where the market is strong but the product needs work tells us what to build next. A vertical where the product works great but the market is thin tells us to keep looking.

### The Tuning Loop

D and T are not fixed properties of the product — they're tunable through existing configuration levers:

- **System-level prompts** — Global AI behavior (what the AI does by default across all pages)
- **Page-level prompts** — Per-page AI instructions (a "vendor comparison" page can have different AI behavior than a "submission tracker" page)
- **Tool configurations** — Which tools are available, what parameters they use, what strategies they employ

These levers already exist in the app architecture. Improving D and T for a vertical doesn't require new code — it requires the right configuration values. The question is: where do the right values come from?

**They come from observation, not guessing.**

The GTM strategy is not "perfect the product for a vertical, then launch into it." It's:

1. **Launch with generic tuning** — The default system prompts and tool configs work across verticals at a baseline level. Good enough to be useful, not yet optimized for any specific domain.
2. **Observe real users** — Watch where D and T fail. The AI called the wrong tool (D failure). The web scraper got blocked on a domain that matters for this vertical (T failure). The research strategy was too shallow for this use case (D failure). Track these through the signal agents (QA, Eval, Usage).
3. **Tune the knobs** — Adjust system prompts, page configs, and tool parameters based on observed failures. "For real estate use cases, default to deep_research instead of quick_lookup." "When the user mentions brokerages, include the recommendations tool." "For this vertical, the AI should suggest these specific columns."
4. **Quality improves** — The vertical-specific tuning makes D and T better for that cohort. Fewer wrong tool calls, fewer research failures, better schema suggestions.
5. **Repeat** — More users in the vertical generate more failure data, which enables tighter tuning.

This loop has two strategic implications:

**GTM:** Preparing for a market means getting D, T, and P to a baseline for that vertical's common use cases. Refining in the market means running the observation loop and tightening configs. The first is achievable with synthetic testing (demos, QA walkthroughs). The second requires real users.

**Defensibility:** The accumulated tuning knowledge is the moat. Anyone can build a table+AI app on top of the same LLM APIs. But the insight that "for commercial real estate, the AI should structure tables with these columns, use these research strategies, and avoid these common failure modes" — that's proprietary. It comes from the observation loop. More users in a vertical → more failure data → better tuning → better quality → more users. The flywheel compounds. A competitor starting from scratch would need to accumulate the same user-driven tuning data to match the quality, and by then the tuned product has more users generating more data.

## What We Optimize For

1. **Time to first value** — The user should have a useful, populated table within their first session. Every friction point between "I need a list of X" and "here's a researched list of X" is a PMF killer.

2. **Data quality over data quantity** — 10 real, verified entries beat 50 hallucinated ones. The user needs to trust that what AI produces is actionable.

3. **Transparency** — The user should always understand what AI did and why. Proposals over silent mutations. Research logs over black-box answers.

## What We Don't Optimize For (v1)

- Feature completeness — We don't need every spreadsheet feature. We need the AI research loop to be excellent.
- Visual polish beyond usability — Clean and functional beats beautiful but slow.
- Scale — We don't need to handle tables with 100K rows. 500 rows with rich per-row research is the sweet spot.
- Collaboration — Single-user creation is fine for v1. Sharing is read-only (no collaborative editing). Multi-user editing adds complexity without validating the core value prop.
- Platform breadth — Web only. No mobile app, no desktop app, no API.
