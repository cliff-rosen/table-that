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

## Part 1B: Entity Types — The Missing Abstraction

The vertical analysis above treats each domain as a collection of "research challenges." But there's a deeper structural pattern: **every table row represents a typed entity**, and the system doesn't know that today.

Currently a table is just rows × columns with generic types (text, number, select, boolean, date). A row in a publisher table and a row in a SaaS comparison table are both just "a bunch of cells." The system has no idea that one row *is* a publisher and the other *is* a software product. This means every enrichment operation starts from zero — generic web search with no domain knowledge.

### What an Entity Type Carries

An entity type is metadata attached to the table (not individual rows) that tells the system what kind of thing each row represents. It carries:

| Property | Description | Example (SaaS Product) | Example (PubMed Article) |
|----------|-------------|----------------------|------------------------|
| **Identity anchor** | How you uniquely identify this entity | Product name + homepage URL | PMID (PubMed ID) |
| **Canonical data source** | Where authoritative data lives | Product website, pricing page | PubMed API (E-utilities) |
| **Known attributes** | What columns make sense and their extraction logic | Price/seat/mo, free plan, G2 rating, integrations | Title, authors, journal, citation count, DOI |
| **Verification method** | How to confirm the entity is real | Does the homepage resolve? Is it a real product? | Does the PMID exist in PubMed? |
| **Research strategy** | API lookup vs web search vs hybrid | Structured extraction from pricing page + review site scrape | Direct API query — no web search needed |

### Why This Matters for Tooling

Without entity types, the tooling has to be general-purpose. With entity types, each step in the pipeline can specialize:

- **Populate:** A SaaS Product table searches G2 category pages and "best X for Y" roundups. A PubMed Article table queries the PubMed API directly. A Publisher table searches literary directories.
- **Enrich:** A "price" column on a SaaS Product knows to check the pricing page and extract a number. A "citation count" column on a PubMed Article calls Semantic Scholar. The system doesn't just "research" — it knows *where to look* and *what format to expect*.
- **Verify:** A SaaS Product is verified by checking if the homepage URL resolves and the product name appears on it. A PubMed Article is verified by checking if the PMID exists. A Publisher is verified by checking the submission guidelines URL.
- **Refresh:** A SaaS Product's price might change monthly. A PubMed Article's citation count changes over weeks. The entity type informs refresh cadence.

### Candidate Entity Types

Starting from the verticals above, here are the entity types that cover the most ground:

| Entity Type | Verticals Served | Identity Anchor | Primary Data Source |
|-------------|-----------------|-----------------|-------------------|
| **Website / URL** | Generic (any web-searchable entity) | URL | Web search + fetch |
| **SaaS Product** | Product Comparisons, Competitive Intel | Name + homepage URL | Product page, pricing page, G2/Capterra |
| **Local Business** | Local Business Research | Name + address (or Google Place ID) | Google Places API |
| **Publisher** | Publishing & Creative Submissions | Name + website URL | Publisher website, literary directories |
| **PubMed Article** | Academic & Scientific Research | PMID | PubMed E-utilities API |
| **Clinical Trial** | Medical Research | NCT Number | ClinicalTrials.gov API v2 |
| **Event / Conference** | Event & Conference Research | Name + URL + dates | Event website |
| **Grant / Funding** | Grants & Funding Sources | Grant name + program URL | Grants.gov, foundation sites |
| **Job Listing** | Job Market Research | Title + company + listing URL | Job board APIs |
| **Company** | Vendor Eval, Competitive Intel | Name + domain | Crunchbase, company website |

**The simplest entity type is "Website / URL"** — it's the fallback. If the system doesn't recognize a more specific type, every row is just "a thing with a URL." This is what the system effectively does today. Entity types are a progressive enhancement: you start with Website and specialize as the system learns the domain.

### Where Entity Type Lives in the Data Model

Entity type is a **table-level** property, not a column or row property. All rows in a table share the same entity type. This means:

- The `TableDefinition` gets a new optional field: `entity_type: Optional[str]`
- The AI infers the entity type during table creation (or the user specifies it)
- System prompts, enrichment strategies, and verification logic branch on entity type
- Column suggestions are entity-type-aware ("SaaS Product tables usually have a pricing column")

This is lightweight — it's a single string field that the rest of the system can use as a dispatch key.

---

## Deep Dive: Product Comparisons (SaaS Product Entity Type)

This section traces a concrete user journey through the system, showing where entity type awareness changes the tooling at each step.

### The User Request

> "Compare project management tools for a 10-person team"

### Step 1: Table Creation (Build)

**Today:** The main agent (Sonnet) creates a table with columns it thinks are useful, drawing from training data. Column choices are reasonable but generic — it might pick "Price" (text) instead of "Price/seat/mo" (number).

**With entity type:** The system recognizes this as a SaaS Product table. It knows:
- There should be a **URL column** (the product's homepage — this is the identity anchor)
- Pricing should be a **number** column normalized to $/seat/month
- "Free Plan" should be a **select** column with options: Yes / No / Limited
- "Best For" should be a **select** column: Small teams / Mid-size / Enterprise
- "G2 Rating" should be a **number** column (1.0-5.0)

The column schema proposal becomes entity-type-aware. Instead of the AI improvising columns, it starts from a template and customizes.

### Step 2: Entity Selection (Populate)

**Today:** The AI populates rows largely from its training data. It knows Asana, Monday, Jira, Linear because those are in the training set. It might use `search_web` to supplement, but there's no structured approach to *discovering* entities.

**With entity type:** The SaaS Product entity type carries a populate strategy:
1. Search G2 category pages ("best project management software for small teams")
2. Search "best X for Y" roundup articles from authoritative sources
3. Extract a candidate list of 15-20 products from those pages (using structured extraction)
4. AI curates to 10-12 based on the user's criteria ("10-person team" filters out enterprise-only)
5. For each selected product, grab the homepage URL (identity anchor) and verify it resolves

This is the difference between "list some project management tools" and "research which project management tools are actually relevant."

### Step 3: Enrichment (Enrich)

This is where entity type has the biggest impact. Let's trace three columns:

#### Column: "Price/seat/mo" (number)

**Today's pipeline:**
```
for_each_row("Find the price") →
  research_web("Asana pricing per seat monthly") →
  Haiku searches, maybe fetches pricing page →
  Returns: "Plans start at $10.99/user/month for Starter, $24.99 for Business" →
  Raw string goes into number column (broken)
```

**With entity type + tooling:**
```
for_each_row("Find the price") →
  Entity type says: check {homepage_url}/pricing →
  fetch_webpage(url + "/pricing") →
  structured_extraction(page_text, {"monthly_price_per_seat": "number"}, context="10-person team, most relevant plan") →
  Returns: 10.99 →
  value_coercion confirms it's a valid number →
  Clean number in cell
```

Key differences: (a) the system knows *where* to look (pricing page, not random web search), (b) structured extraction pulls the specific number, (c) the user's context ("10-person team") guides which plan to select.

#### Column: "G2 Rating" (number)

**Today's pipeline:**
```
research_web("Asana G2 rating") →
  Haiku searches, gets snippets like "Asana has a 4.3 rating on G2" →
  Returns: "4.3" or "Asana has a 4.3/5 rating on G2 based on 12,000+ reviews"
```

**With entity type + tooling:**
```
Entity type says: G2 rating comes from g2.com/products/{slug}/reviews →
  search_web("{product_name} site:g2.com") →
  structured_extraction(g2_page, {"rating": "number", "review_count": "number"}) →
  Returns: 4.3 →
  value_coercion confirms valid number in 1.0-5.0 range
```

This could also be a future G2 API adapter — but even without an API, knowing to search G2 specifically is a big improvement over generic web search.

#### Column: "Best For" (select: Small teams / Mid-size / Enterprise)

**Today's pipeline:**
```
research_web("What team size is Asana best for") →
  Haiku searches, reads product page and reviews →
  Returns: "Asana is best suited for mid-size to large teams of 10-500 people,
  with features like portfolios and workload management that shine at scale..." →
  Paragraph goes into select column (broken)
```

**With entity type + tooling:**
```
research_web("What team size is {product_name} best for") →
  Returns same paragraph →
  value_coercion(raw_answer, type="select", options=["Small teams", "Mid-size", "Enterprise"]) →
  Returns: "Mid-size" →
  Clean select value in cell
```

Value coercion alone fixes this — no entity-type-specific logic needed.

### Step 4: Cross-Row Normalization

**Today:** Each row is enriched independently. Row 1's price might be monthly, row 2's might be annual. No consistency check.

**With entity type:** After all rows are enriched, run a normalization pass:
1. Scan all "Price/seat/mo" values — are they all monthly? Flag any that look annual.
2. Scan all "G2 Rating" values — are they all on the same scale?
3. Check for duplicate products (did the AI include both "Jira" and "Jira Software"?)

This is a single LLM call that reviews the full table, not per-row research. The entity type tells the system *what* to normalize (prices should all be monthly, ratings should all be 1-5).

### Step 5: Verification

**With entity type:**
- For each row, HTTP HEAD the homepage URL. If it 404s, flag the row.
- Fetch the homepage, check that the product name appears and it's actually a project management tool (not a different product with a similar name).
- For critical columns (price), compare the researched value against what's currently on the pricing page.

### Summary: What Entity Types Unlock for Product Comparisons

| Pipeline Step | Without Entity Type | With Entity Type |
|--------------|-------------------|-----------------|
| **Column design** | AI improvises | Starts from SaaS Product template |
| **Entity discovery** | Training data + generic search | G2 categories, roundup articles |
| **Price extraction** | Generic web search, raw string | Fetch /pricing, structured extraction, number |
| **Rating extraction** | Generic search | Search G2 specifically, extract number |
| **Select columns** | Paragraphs in cells | Value coercion to valid options |
| **Consistency** | None | Cross-row normalization pass |
| **Verification** | None | Homepage URL check + name confirmation |

---

## Part 2: Cross-Cutting Orchestration Challenges

These challenges appear across most verticals. They're not specific to any one domain — they're structural problems in how AI researches and populates data.

### Challenge 1: Research Depth Calibration — SOLVED

> **Implementation:** Three strategies (lookup/research/computation) with different step budgets. Research strategy supports `thoroughness` parameter: "exploratory" (5 steps, 1-2 search angles) vs "comprehensive" (8-15 steps, 3+ query angles, coverage assessment).

**The problem:** The current research agent doesn't know when it has "enough" data. For some cells, a search snippet is sufficient ("What city is this company in?" — one snippet answers it). For others, the agent needs to read multiple pages and synthesize ("Is this publisher friendly to debut authors?" — requires reading submission guidelines, author testimonials, and editor interviews).

**What goes wrong today:** The agent either under-researches (grabs the first snippet) or over-researches (fetches 5 pages when one would do). There's no mechanism to match research effort to question difficulty.

**Design direction:** Research effort should be parameterized per-column or per-question. A "lookup" column (city, URL, founding year) gets 1-2 search steps. An "analysis" column (friendliness rating, quality score) gets 5-8 steps with explicit multi-source requirements. The system prompt should define effort tiers, and the enrichment request should tag which tier applies.

### Challenge 2: Structured Value Extraction — SOLVED

> **Implementation:** `strategies/coerce.py` runs after every strategy. Three phases: preamble stripping (26 regex patterns), not-found detection (16 sentinels), type-aware coercion (number/boolean/select/text). Returns `(value, confidence)`. No LLM call needed for most cases — pure regex and string matching.

**The problem:** `for_each_row` currently returns free text. When the target column is a `select` type with options like "High / Medium / Low", the agent sometimes dumps a paragraph of reasoning into the cell instead of picking one of the allowed values. (We saw this in the demo — Annick Press got a wall of text instead of "High".)

**What goes wrong today:** The research agent is prompted to "answer the question" but not to "produce a value that fits the column type." There's no post-processing to validate or coerce the result.

**Design direction:** The enrichment pipeline needs a **value extraction step** after research. Given the raw research answer and the target column schema (type, options, constraints), a fast model call coerces the answer into a valid value. For select columns: pick the closest option. For numbers: extract the numeric value. For dates: parse to ISO. For text: summarize to a reasonable length. This is a cheap Haiku call that dramatically improves data quality.

### Challenge 3: Entity Verification

**The problem:** When AI propulates a table with "real" entities (companies, products, people, organizations), how do we know they actually exist? The AI might hallucinate a plausible-sounding publisher that doesn't exist, or confuse two similarly-named companies.

**What goes wrong today:** No verification step. The user has to manually check each entity. For 12 rows this is manageable; for 50+ it's not.

**Design direction:** After populating, run a lightweight verification pass. For each entity: (1) Does the website URL return a 200? (2) Does the entity name appear on the page at that URL? (3) Do key claimed facts match what's on the page? This could be a "verify" tool or an automatic post-population step. Flag unverified rows in the UI.

### Challenge 4: Source Attribution — PARTIALLY SOLVED

> **Implementation:** The research log captures every search query and every fetched URL with full trace detail. This is surfaced in the DataProposalCard so users can see what the AI found before applying results. Not yet available as per-cell hover metadata after data is applied.

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

### Current Tool Stack (Updated)

The enrichment system has been redesigned as a strategy-based dispatcher. See `_specs/technical/architecture/enrichment-strategies.md` for the full architecture.

```
enrich_column       Strategy-based enrichment orchestrator (max 20 rows, concurrent)
  ├── lookup        Snippet-only web search (1-2 turns, cheapest)
  ├── research      Multi-turn agentic research (exploratory or comprehensive)
  └── computation   Formula eval from existing columns (safe eval + Haiku fallback)

search_web          Google Custom Search (10 results max)
fetch_webpage       URL -> extracted text (8000 char limit)
coerce_value        Post-strategy type-aware value fitting (preamble strip + type coercion)
```

Key improvements over the original `for_each_row` + `research_web` pipeline:
- **Strategy selection** — not every column needs deep research; lookups are 10x cheaper
- **Value coercion** — solves Challenge 2 (paragraphs in select columns)
- **Thoroughness levels** — exploratory vs comprehensive addresses Challenge 1 (depth calibration)
- **Research log** — every step traced with URLs, providing source attribution (Challenge 4)
- **Cancellation support** — partial results preserved on cancel

### Proposed Tool Abstractions (Five)

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

#### 3. Value Coercion / Post-Processing Tool — IMPLEMENTED

> **Status:** Built and deployed in `backend/tools/builtin/strategies/coerce.py`. Runs automatically after every strategy execution.

**What it does:** Takes raw research output and coerces it into a valid cell value for the target column type.

```
coerce_value(
  raw_answer="Based on my research, Penny Candy Books has a strong track record of publishing debut picture book authors, including several award winners. They actively encourage first-time submissions and their guidelines specifically mention welcoming new voices. I would rate their friendliness as HIGH.",
  column_type="select",
  column_options=["High", "Medium", "Low"]
)
→ "High"
```

**Why it matters:** This is the fix for Challenge 2 (structured value extraction). Without it, select columns get paragraphs and number columns get "approximately $29.99 per month depending on the plan."

**Implementation details:** Three-phase pipeline: (1) preamble stripping via 26 compiled regex patterns, (2) not-found sentinel detection (16 patterns), (3) type-aware coercion (number: strip currency + extract first number, boolean: map yes/no variants, select: exact then fuzzy match, text: length cap). Returns `(value, confidence)` tuple. No LLM call needed for most cases. See `_specs/technical/architecture/enrichment-strategies.md` for full details.

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

**Before (original design):**
```
for_each_row → research_web → raw text → data_proposal
```

**Current implementation:**
```
enrich_column
  → strategy dispatch (lookup / research / computation)
  → per-row execution with trace logging
  → value coercion (preamble strip + type fitting)
  → data_proposal with research_log
```

**Future with all abstractions:**
```
enrich_column
  → strategy dispatch (lookup / research / computation / extraction / api_adapter)
  → per-row execution with trace logging
  → value coercion
  → verification (optional)
  → data_proposal with research_log + sources
```

Each step is independent and composable. A "lookup" column (URL, city) uses snippet-only search. An "analysis" column (friendliness rating) uses comprehensive research. A "price" column on a SaaS table could use a future extraction strategy to fetch the pricing page directly. The strategy selection determines which steps run.

---

## Part 4: Vertical Prioritization

Given the current tool stack and the abstractions above, here's a prioritized roadmap:

### Phase 1: Fix the foundation (no new tools needed) — MOSTLY COMPLETE

| Item | Status | Notes |
|------|--------|-------|
| Value coercion | Done | `strategies/coerce.py` — preamble strip + type-aware fitting. No LLM call for most cases. |
| Research effort tiers | Done | Lookup (1-2 steps) vs Research exploratory (~5 steps) vs Research comprehensive (8-15 steps). Thoroughness param on research strategy. |
| Source attribution | Partial | Research log captures every search query and fetched URL with full trace. Frontend surfaces this in DataProposalCard. Not yet available as per-cell metadata on hover. |

### Phase 2: First API adapter + structured extraction — NOT STARTED

- **Google Places adapter** — Unlocks local business research (Tier 1 vertical). Well-documented API, generous free tier.
- **Structured extraction tool** — Useful across all verticals. Replaces "dump 8000 chars and hope the agent finds the number."
- **Target vertical:** Local Business Research + Product Comparisons.
- **Note:** The extraction strategy was designed in `base.py` as a future strategy type but not yet implemented. Could be built as a new strategy that calls `fetch_webpage` on a known URL pattern (e.g., `{Homepage}/pricing`) and then runs a structured Haiku extraction.

### Phase 3: Domain-specific adapters — NOT STARTED

- **PubMed + ClinicalTrials.gov** — Free, no auth, structured data. Unlocks academic/medical research vertical.
- **GitHub adapter** — Unlocks developer tool comparison, open source project research.
- **Target verticals:** Academic Research, Developer Tools.
- **Note:** Each adapter would register as a new strategy in the strategies folder. The orchestrator, coercion layer, and data proposal flow are already generic enough to support this.

### Phase 4: Verification + refresh — NOT STARTED

- **Verification tool** — Post-population fact-checking. High trust impact.
- **Change detection** — Staleness tracking and selective refresh. Requires cell metadata.
- **Target verticals:** All verticals benefit, but especially Competitive Intelligence and Job Market.
- **Note:** Requires persistent job architecture (roadmap #20) for background re-research and cell-level `researched_at` metadata.

---

## Part 5: Implementation Status Summary

*Added 2026-02-27. Tracks what's been built vs what's still proposed.*

### What's Built

| Component | Location | What It Does |
|-----------|----------|-------------|
| **Strategy base class** | `strategies/base.py` | `RowStrategy` ABC with `execute_one()` async generator, `RowStep` trace, `EnrichmentResult`, template interpolation |
| **Strategy registry** | `strategies/__init__.py` | `register_strategy()` / `get_strategy()` — pluggable strategy dispatch |
| **Lookup strategy** | `strategies/lookup.py` | Snippet-only web search, 1-2 turns, cheapest option |
| **Research strategy** | `strategies/research.py` | Multi-turn agentic research with exploratory and comprehensive modes |
| **Computation strategy** | `strategies/computation.py` | Safe eval + Haiku fallback for formulas over existing columns |
| **Value coercion** | `strategies/coerce.py` | Preamble strip (26 patterns), not-found detection (16 sentinels), type-aware coercion (number/boolean/select/text) with confidence |
| **Orchestrator** | `table_data.py` | `enrich_column` tool: concurrent workers, progress streaming, cancellation, research log, data proposal output |
| **Web research core** | `web.py` | `_lookup_web_core()` and `_research_web_core()` — the inner Claude loops that do actual searching and fetching |
| **Compute core** | `compute.py` | `_compute_core()` — safe Python eval with Haiku fallback |

### What's Proposed but Not Built

| Component | Roadmap | What It Would Do |
|-----------|---------|-----------------|
| **Structured extraction** | Part 3, Abstraction 1 | Fetch a known URL + extract specific fields via schema. Reduces token waste. |
| **API adapters** | Part 3, Abstraction 2; Roadmap #15, #16 | Direct structured data from PubMed, Google Places, ClinicalTrials.gov, etc. |
| **Verification tool** | Part 3, Abstraction 4 | Post-enrichment fact-check: URL alive, name on page, facts match. |
| **Refresh/staleness** | Part 3, Abstraction 5 | Cell-level `researched_at`, selective re-research, change detection. Requires roadmap #20. |
| **Entity types** | Part 1B; Roadmap #17 | Table-level `entity_type` field for strategy dispatch, column suggestions, verification templates. |
| **Domain tool packs** | Roadmap #16 | Bundled tools + prompts per vertical, auto-activated on domain detection. |
| **Recommendations tool** | Roadmap #19 | SerpAPI-based curated list discovery for the Populate step. |

### How Challenges Map to Current State

| Challenge | Status | How It's Addressed |
|-----------|--------|-------------------|
| 1. Research depth calibration | **Solved** | Three strategies (lookup/research/computation) + thoroughness levels (exploratory/comprehensive) |
| 2. Structured value extraction | **Solved** | Coercion layer: preamble strip + type-aware fitting after every strategy |
| 3. Entity verification | Not started | Proposed as optional post-enrichment pass |
| 4. Source attribution | **Partially solved** | Research log captures all search queries and fetched URLs. Not yet surfaced as per-cell hover metadata. |
| 5. Staleness & refresh | Not started | Requires cell metadata + background jobs (roadmap #20) |
| 6. Rate limiting & scale | Not addressed | No query budgeting yet. Concurrency limits help but don't solve the fundamental issue. |
| 7. Cross-row intelligence | Not started | Each row still researched independently. Pre/post-scan phases not implemented. |

### Architecture Reference

Full technical documentation of the strategies system: `_specs/technical/architecture/enrichment-strategies.md`
