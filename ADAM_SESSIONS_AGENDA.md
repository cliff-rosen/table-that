# Adam Sessions Agenda

Three focused sessions before final lineup.

---

## Session 1: UX Polish

### Part A — Quick-Fix Walkthrough (30 min)

Walk through the app together, flag and fix the obvious stuff:

- Visual consistency (spacing, alignment, dark mode gaps)
- Dead-end states (empty tables, first-use experience, error messages)
- Mobile / narrow-viewport breakage
- Anything that looks "demo-broken" — stuff a first-time viewer would trip on

**Goal:** Punch list of small fixes, assign owners, close within a day.

### Part B — Chat / Payload / Table Choreography (30 min)

The core loop is: chat proposes something → payload panel shows it → user accepts → table updates. Right now the pieces work but don't feel like one coherent flow.

Discuss:

- **Visual language mismatch** — The payload panel (SchemaProposalCard / DataProposalCard) and the table itself use different styling, density, and terminology. Should the proposal preview mirror the table's look so acceptance feels like "confirming what you already see"?
- **Panel placement & transitions** — Floating side panel vs. modal vs. inline. When should each mode trigger? Is the auto-open behavior right?
- **Progress & completion signals** — When enrich_column runs row-by-row, the progress card is inside chat. Should the table itself show partial fills in real time?
- **Post-accept continuity** — After the user accepts, what's the next prompt from the system? How does the chat "know" to suggest the next logical step?

**Goal:** Agree on 3-5 concrete changes that make the loop feel unified.

---

## Session 2: Tooling Strategy

The column enhancement tool (enrich_column / for_each_row) is the core value driver. How the LLM decides *what strategy to use* for a given column determines whether the result is useful or garbage.

### Topics

- **Strategy taxonomy** — What are the distinct strategies? (web search per row, lookup against a known dataset, compute from existing columns, call an external API, etc.) Do we formalize these as sub-tools or let the LLM freestyle?
- **Strategy selection pitfalls** — The recurring problem: LLM picks a naive approach (e.g., guessing instead of searching, or searching too broadly). How do we constrain or guide selection? Prompt engineering vs. explicit tool routing vs. user hints?
- **Row-level vs. batch** — Some strategies work better in batch (e.g., one API call for all rows). How do we surface that option without overcomplicating the UX?
- **Confidence & fallback** — When a strategy fails or returns low-confidence results, what does the user see? How do we avoid silent garbage?
- **Framing for the user** — How much of the strategy is visible? Does the user pick "research mode" vs. "compute mode" or does it just happen? What's the right level of transparency?

**Goal:** Agreed strategy framework — which strategies we support at launch, how the LLM picks one, and what the user sees.

---

## Session 3: Product & Go-to-Market

Two sides of the same question: how do we make this useful to real people and get it in front of them.

### Part A — Vertical Release Strategy (Product)

- **Picking the first cohort** — What vertical or use case do we target first? (Biotech researchers, sales teams, analysts, etc.) What makes a good first cohort: pain level, data availability, willingness to try new tools?
- **Cohort-specific packaging** — For a given vertical, what does a "release" look like? Pre-built templates? Curated tool strategies? Domain-specific system prompts? Sample datasets?
- **Success metric** — How do we know the release worked? What's the minimum signal (usage, retention, word-of-mouth)?

### Part B — Distribution (Market)

- **Channels** — Where do we actually reach the target cohort? (Community posts, direct outreach, content marketing, partnerships, product directories?)
- **Demo / landing experience** — What does someone see in the first 60 seconds? Is the current landing page doing its job?
- **Feedback loop** — How do we collect and act on early-user feedback fast enough to iterate before the next cohort?

**Goal:** One-page plan — first cohort, what we ship for them, how we reach them, and how we measure.
