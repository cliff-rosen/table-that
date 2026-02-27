# Verticals, Orchestration Challenges, and Tooling Design

## Context

Table That's three-step formula (Build, Populate, Enrich) works across many domains, but the quality of results depends heavily on whether the AI can actually *research* real data for a given vertical. The current tooling — Google Custom Search + webpage fetching + a mini research agent — is general-purpose. This document explores which verticals are promising, what makes each one hard, and what tooling abstractions would make them succeed.

---

## Part 1: Candidate Verticals

### Tier 1 — Strong fit today (web-searchable, public data)

#### 1. Publishing & Creative Submissions
*"Find publishers accepting unsolicited children's manuscripts"*

- **Why it works:** Publisher directories, submission guidelines, and literary agent databases are all public web content. The data is relatively stable (guidelines don't change weekly).
- **Enrichment examples:** Picture book friendliness, response time, simultaneous submission policy, recent acquisitions.
- **Challenges:** Some directories (QueryTracker, Duotrope) are paywalled. Submission windows open/close seasonally.
- **Tooling gap:** Calendar/date-awareness for submission windows.

#### 2. Product & Service Comparisons
*"Compare project management tools for a 10-person team"*

- **Why it works:** Product pages, feature lists, and pricing are public. G2, Capterra, and blog roundups provide comparison data.
- **Enrichment examples:** Pricing tier, free plan limits, integrations count, G2 rating, ideal team size.
- **Challenges:** Pricing is complex (per-seat, tiered, hidden enterprise pricing). Feature matrices are marketing-speak. Review sites have their own biases.
- **Tooling needs:** Structured extraction from product/pricing pages. Review aggregation across G2/Capterra/Reddit.

#### 3. Event & Conference Research
*"Find AI conferences in Europe in Q3 2026"*

- **Why it works:** Conference websites are public with dates, locations, CFP deadlines, ticket prices.
- **Enrichment examples:** Speaker quality, past attendance size, CFP deadline, student discount availability.
- **Challenges:** Dates shift year-to-year. Many niche events have poor SEO. No single authoritative directory.
- **Tooling gap:** Date extraction and comparison. Calendar-aware filtering.

#### 4. Grants & Funding Sources
*"Find grants for women-owned small businesses in clean energy"*

- **Why it works:** Grants.gov, foundation directories, and government sites are public. Eligibility criteria are published.
- **Enrichment examples:** Deadline, award amount range, eligibility match score, past recipients.
- **Challenges:** Eligibility criteria are complex (location, revenue, industry codes). Deadlines are critical — stale data is worse than no data.
- **Tooling gap:** Eligibility matching against user profile. Date/deadline tracking.

#### 5. Vendor & Supplier Evaluation
*"Find organic packaging suppliers for food products"*

- **Why it works:** Business directories (ThomasNet, Alibaba) and company websites are searchable. Certifications and capabilities are published.
- **Enrichment examples:** MOQ, certifications (FDA, organic), lead time, location, review sentiment.
- **Challenges:** B2B pricing requires quotes. Quality data is sparse. Many suppliers have poor web presence.
- **Tooling gap:** Business directory API access. RFQ generation.

#### 6. Local Business Research
*"Find coworking spaces in Portland with monthly plans under $300"*

- **Why it works:** Google Maps, Yelp, and business websites have rich public data.
- **Enrichment examples:** Price range, amenities, meeting room availability, parking, transit access, review sentiment.
- **Challenges:** Pricing often requires visiting individual sites. Review quality varies wildly.
- **Tooling needs:** Google Places API integration. Review sentiment extraction.

### Tier 2 — Good fit with targeted tooling

#### 7. Academic & Scientific Research
*"Find clinical trials for Type 2 diabetes treatments in Phase 3"*

- **Why it works:** PubMed, ClinicalTrials.gov, Semantic Scholar have public APIs with structured data. This is one of the few domains with *excellent* free APIs.
- **Enrichment examples:** Citation count, trial status, enrollment target, primary endpoint, funding source.
- **Challenges:** Medical/scientific accuracy is critical — hallucinations are dangerous. Jargon requires domain knowledge. Users expect precise filtering (MeSH terms, trial phases).
- **Tooling needs:** PubMed API, ClinicalTrials.gov API, Semantic Scholar API. Domain-specific prompt templates.

#### 8. Job Market Research
*"Find remote senior React developer positions paying $150k+"*

- **Why it works:** Job boards have some API access. Company career pages are public.
- **Enrichment examples:** Glassdoor rating, company size, interview difficulty, benefits summary, visa sponsorship.
- **Challenges:** Listings expire fast (days, not months). Salary data is often missing or ranges are huge. Glassdoor/LinkedIn data is behind auth walls.
- **Tooling needs:** Job board APIs (Indeed, LinkedIn Jobs). Salary data normalization. Freshness tracking.

#### 9. Competitive Intelligence
*"Track features and pricing of our 5 main competitors"*

- **Why it works:** Product pages, changelogs, press releases, and Crunchbase profiles are public.
- **Enrichment examples:** Latest funding round, employee count trend, recent feature launches, pricing changes.
- **Challenges:** Requires *ongoing* monitoring, not one-shot research. Competitor pages are designed to obscure (especially pricing). News is time-sensitive.
- **Tooling needs:** Crunchbase/PitchBook API. Change detection (re-research scheduling). News/RSS monitoring.

#### 10. Real Estate & Property
*"Find investment properties in Austin under $400k with positive cash flow potential"*

- **Why it works:** Public records, tax assessor data, and some listing data are accessible.
- **Enrichment examples:** Rent estimate, cap rate, school district rating, walkability score, crime stats.
- **Challenges:** MLS data is heavily restricted. Zillow/Redfin APIs are limited or deprecated. Property data requires combining multiple sources (tax records + listings + neighborhood data).
- **Tooling needs:** Public records API. Neighborhood data aggregation. Mortgage/cash flow calculators.

### Tier 3 — Possible but hard

#### 11. Talent & Recruitment
*"Find senior ML engineers in Berlin who've worked at startups"*

- **Challenges:** People data is the hardest vertical. LinkedIn is locked down. GDPR restricts processing of personal data. GitHub profiles give partial signal at best. The ethical and legal landscape is complex.
- **Tooling needs:** Would require LinkedIn API partnership or similar. Not a good near-term target.

#### 12. Travel Planning
*"Compare flights from LAX to Tokyo in June"*

- **Challenges:** Pricing is hypervolatile (changes hourly). Booking sites actively block scrapers. API access (Google Flights, Skyscanner) is restricted or expensive. The result the user wants is a *booking*, not a table.
- **Assessment:** Poor fit — the user's end goal isn't a research table, it's a transaction.

#### 13. Financial & Investment Research
*"Screen stocks with P/E under 15 and dividend yield over 3%"*

- **Challenges:** Financial data has excellent APIs (Yahoo Finance, Alpha Vantage) but compliance implications. Investment advice carries legal risk. Data quality matters enormously (stale financials = bad decisions).
- **Assessment:** Technically feasible but liability-heavy. Better left to purpose-built financial tools.

---

## Part 2: Cross-Cutting Orchestration Challenges

These challenges appear across most verticals. They're not specific to any one domain — they're structural problems in how AI researches and populates data.

### Challenge 1: Research Depth Calibration

**The problem:** The current research agent doesn't know when it has "enough" data. For some cells, a search snippet is sufficient ("What city is this company in?" — one snippet answers it). For others, the agent needs to read multiple pages and synthesize ("Is this publisher friendly to debut authors?" — requires reading submission guidelines, author testimonials, and editor interviews).

**What goes wrong today:** The agent either under-researches (grabs the first snippet) or over-researches (fetches 5 pages when one would do). There's no mechanism to match research effort to question difficulty.

**Design direction:** Research effort should be parameterized per-column or per-question. A "lookup" column (city, URL, founding year) gets 1-2 search steps. An "analysis" column (friendliness rating, quality score) gets 5-8 steps with explicit multi-source requirements. The system prompt should define effort tiers, and the enrichment request should tag which tier applies.

### Challenge 2: Structured Value Extraction

**The problem:** `for_each_row` currently returns free text. When the target column is a `select` type with options like "High / Medium / Low", the agent sometimes dumps a paragraph of reasoning into the cell instead of picking one of the allowed values. (We saw this in the demo — Annick Press got a wall of text instead of "High".)

**What goes wrong today:** The research agent is prompted to "answer the question" but not to "produce a value that fits the column type." There's no post-processing to validate or coerce the result.

**Design direction:** The enrichment pipeline needs a **value extraction step** after research. Given the raw research answer and the target column schema (type, options, constraints), a fast model call coerces the answer into a valid value. For select columns: pick the closest option. For numbers: extract the numeric value. For dates: parse to ISO. For text: summarize to a reasonable length. This is a cheap Haiku call that dramatically improves data quality.

### Challenge 3: Entity Verification

**The problem:** When AI propulates a table with "real" entities (companies, products, people, organizations), how do we know they actually exist? The AI might hallucinate a plausible-sounding publisher that doesn't exist, or confuse two similarly-named companies.

**What goes wrong today:** No verification step. The user has to manually check each entity. For 12 rows this is manageable; for 50+ it's not.

**Design direction:** After populating, run a lightweight verification pass. For each entity: (1) Does the website URL return a 200? (2) Does the entity name appear on the page at that URL? (3) Do key claimed facts match what's on the page? This could be a "verify" tool or an automatic post-population step. Flag unverified rows in the UI.

### Challenge 4: Source Attribution

**The problem:** Users need to know *where* the AI found its data. "This publisher accepts unsolicited manuscripts" — says who? A 2019 blog post? The publisher's own website from last month? Without sources, the data isn't actionable.

**What goes wrong today:** The research trace captures search queries and URLs fetched, but this isn't surfaced to the user. The cell value is just the answer with no provenance.

**Design direction:** Every researched cell should have an expandable "sources" section showing the URLs that informed the answer, with timestamps. This could be stored as cell metadata (not visible in the main table, but available on click/hover). The `for_each_row` pipeline already tracks which URLs it fetched — the plumbing exists, it just needs to be surfaced.

### Challenge 5: Staleness & Refresh

**The problem:** Data goes stale. Job listings expire. Prices change. Events get rescheduled. A table populated in February might be useless by April.

**What goes wrong today:** No concept of data age or refresh. Every `for_each_row` run is a full re-research from scratch.

**Design direction:** Track a `researched_at` timestamp per cell (or per row). Allow users to trigger re-research on stale rows ("refresh rows older than 30 days"). For critical verticals (job listings, event dates), suggest automatic refresh schedules. This ties into roadmap item #1 (background/scheduled for_each_row).

### Challenge 6: Rate Limiting & Scale

**The problem:** Google Custom Search has a free tier of 100 queries/day and 10,000 queries/day on the paid tier. A 50-row table with a 5-step research pipeline per row = 250 search queries for one enrichment pass. Two enrichment columns = 500 queries. This hits limits fast.

**What goes wrong today:** No query budgeting. The agent uses searches liberally. Rate limit errors (429s) are handled with retries but not with strategic query reduction.

**Design direction:** Query budget awareness. The system should estimate "this enrichment will need ~300 searches" and warn if that exceeds limits. Within research, prefer snippet answers over page fetches when possible. Cache search results across rows (if row 3 and row 7 both need info from the same domain, reuse the fetch). Consider alternative search providers as fallback (Bing, SerpAPI, Brave Search).

### Challenge 7: Cross-Row Intelligence

**The problem:** `for_each_row` treats each row independently. But sometimes the best research strategy uses cross-row context. "Find the cheapest option" requires seeing all rows. "Rank these by quality" requires comparison. "Deduplicate" requires finding matches.

**What goes wrong today:** Each row's research is isolated. The agent can't say "I already found that Company A and Company B are the same entity" or "Based on all rows, the price range is $X-$Y so this one is an outlier."

**Design direction:** Support a pre-scan or post-scan phase around for_each_row. Pre-scan: agent looks at all rows and plans research strategy. Post-scan: agent reviews all results for consistency, deduplication, and comparative analysis. This is different from per-row enrichment — it's table-level intelligence.

---

## Part 3: Tooling Architecture for Vertical Success

### Current Tool Stack
```
search_web          Google Custom Search (10 results max)
fetch_webpage       URL -> extracted text (8000 char limit)
research_web        Autonomous search+fetch loop (5-8 steps, Haiku)
for_each_row        Parallel per-row research (max 20 rows, 3 concurrent)
```

### What's Missing: Five Tool Abstractions

#### 1. Structured Extraction Tool
**What it does:** Given a URL and a target schema, extract specific fields rather than dumping raw text.

```
extract_structured(
  url="https://example.com/product",
  fields={
    "price": "number",
    "rating": "number (1-5)",
    "features": "text[]",
    "free_trial": "boolean"
  }
)
→ { "price": 29.99, "rating": 4.2, "features": ["SSO", "API", "Webhooks"], "free_trial": true }
```

**Why it matters:** The current `fetch_webpage` returns 8000 chars of text that the research agent has to parse. Structured extraction lets the agent say "I need the price from this page" and get just the price. Dramatically reduces token waste and improves accuracy.

**Implementation:** `fetch_webpage` + a Haiku call with the field schema as output format. Cheap and fast. Could cache extractions per URL+schema combo.

#### 2. API Data Source Adapters

**What it does:** Direct access to structured data APIs, returning table-ready results.

```
query_api(
  source="pubmed",
  query="CRISPR gene therapy 2025",
  limit=20,
  fields=["title", "authors", "journal", "year", "doi", "citation_count"]
)
→ [{ "title": "...", "authors": "...", ... }, ...]
```

**Why it matters:** Web search is lossy. For domains with good APIs (PubMed, ClinicalTrials.gov, Google Places, GitHub), going direct gets structured, authoritative data with no scraping fragility.

**Design principle:** Each adapter normalizes its API's response into a flat dict matching table column types. The adapter handles pagination, rate limiting, and authentication internally. The AI agent doesn't need to know the API's query syntax — it describes what it wants in natural language, and the adapter translates.

**Priority adapters:**
| Adapter | Vertical | API | Auth |
|---------|----------|-----|------|
| Google Places | Local business | Places API v2 | API key |
| PubMed | Academic | E-utilities | Free, no key |
| ClinicalTrials.gov | Medical | API v2 | Free, no key |
| GitHub | Developer tools | REST/GraphQL | Token |
| Google Scholar | Academic | SerpAPI proxy | API key |
| Crunchbase | Startup/VC | REST | API key (paid) |
| ProductHunt | Product comparison | GraphQL | Token |

**Don't build adapters for:** APIs that are expensive, restrictive, or don't add much over web search.

#### 3. Value Coercion / Post-Processing Tool

**What it does:** Takes raw research output and coerces it into a valid cell value for the target column type.

```
coerce_value(
  raw_answer="Based on my research, Penny Candy Books has a strong track record of publishing debut picture book authors, including several award winners. They actively encourage first-time submissions and their guidelines specifically mention welcoming new voices. I would rate their friendliness as HIGH.",
  column_type="select",
  column_options=["High", "Medium", "Low"]
)
→ "High"
```

**Why it matters:** This is the fix for Challenge 2 (structured value extraction). Without it, select columns get paragraphs and number columns get "approximately $29.99 per month depending on the plan." A fast Haiku call with strict output formatting solves this for pennies.

**Implementation:** Sits between `research_web` output and `data_proposal` generation in the `for_each_row` pipeline. Always runs. No configuration needed — it reads the column schema from the table.

#### 4. Verification Tool

**What it does:** Validates that a researched entity/fact is real.

```
verify_entity(
  name="Penny Candy Books",
  claimed_url="https://pennycandybooks.com",
  claimed_facts={"type": "publisher", "accepts": "unsolicited manuscripts"}
)
→ { "url_alive": true, "name_on_page": true, "facts_confirmed": ["type", "accepts"], "confidence": 0.95 }
```

**Why it matters:** Catches hallucinated entities before they reach the user. A publisher that doesn't exist, a product with the wrong URL, a company that was acquired — these undermine trust in the whole table.

**Implementation:** HTTP HEAD check on URL (alive?), then a quick fetch + Haiku check ("Does this page confirm the entity name and these facts?"). Run as an optional post-population pass. Flag rows that fail verification in the UI.

#### 5. Change Detection / Refresh Tool

**What it does:** Re-researches specific cells and reports what changed.

```
refresh_rows(
  row_ids=[1, 5, 12],
  columns=["price", "status"],
  strategy="only_if_stale",
  max_age_days=30
)
→ { "updated": [5], "unchanged": [1, 12], "changes": { 5: { "price": "$29 → $35" } } }
```

**Why it matters:** Tables are living documents. The initial research is the starting point, not the final word. Users need confidence that their data is current, especially for time-sensitive verticals (job listings, event dates, pricing).

**Implementation:** Requires cell-level `researched_at` metadata. On refresh, re-runs the original research for stale cells and diffs against the current value. Presents changes as a data proposal for user review (not auto-applied). Ties into background/scheduled execution (roadmap #1).

### How Tools Compose: The Enrichment Pipeline

Today:
```
for_each_row → research_web → raw text → data_proposal
```

With the new abstractions:
```
for_each_row
  → [API adapter OR research_web]     # data acquisition
  → structured extraction              # if web source, extract fields
  → value coercion                     # fit to column type
  → verification (optional)            # fact-check
  → data_proposal                      # user review
```

Each step is independent and composable. A "lookup" column (URL, city) might skip research entirely and just use an API adapter. An "analysis" column (friendliness rating) needs full research + extraction + coercion. The effort tier (from Challenge 1) determines which steps run.

---

## Part 4: Vertical Prioritization

Given the current tool stack and the abstractions above, here's a prioritized roadmap:

### Phase 1: Fix the foundation (no new tools needed)
- **Value coercion** — Fix the #1 quality issue (select columns getting paragraphs). Cheap Haiku call in the for_each_row pipeline.
- **Source attribution** — Surface the URLs already tracked in the research trace. Frontend change only.
- **Research effort tiers** — System prompt changes to calibrate depth per question type.

### Phase 2: First API adapter + structured extraction
- **Google Places adapter** — Unlocks local business research (Tier 1 vertical). Well-documented API, generous free tier.
- **Structured extraction tool** — Useful across all verticals. Replaces "dump 8000 chars and hope the agent finds the number."
- **Target vertical:** Local Business Research + Product Comparisons.

### Phase 3: Domain-specific adapters
- **PubMed + ClinicalTrials.gov** — Free, no auth, structured data. Unlocks academic/medical research vertical.
- **GitHub adapter** — Unlocks developer tool comparison, open source project research.
- **Target verticals:** Academic Research, Developer Tools.

### Phase 4: Verification + refresh
- **Verification tool** — Post-population fact-checking. High trust impact.
- **Change detection** — Staleness tracking and selective refresh. Requires cell metadata.
- **Target verticals:** All verticals benefit, but especially Competitive Intelligence and Job Market.
