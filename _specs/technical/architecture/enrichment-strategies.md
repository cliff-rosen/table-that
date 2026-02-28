# Enrichment Strategies Architecture

## Overview

The enrichment system powers the "Enrich" step of table.that's build-populate-enrich loop. When a user asks AI to fill a column by researching each row, the system dispatches a **strategy** that determines how each cell's value is obtained.

The architecture has four layers:

```
enrich_column tool (orchestrator)
    │
    ├── Strategy dispatch (lookup / research / computation)
    │       │
    │       └── execute_one() per row → yields RowStep trace
    │
    ├── Value coercion (post-strategy, type-aware)
    │
    └── Data proposal (user reviews before applying)
```

---

## Strategy Base Class

**File:** `backend/tools/builtin/strategies/base.py`

Every strategy implements the `RowStrategy` abstract class:

```python
class RowStrategy(ABC):
    name: str            # Registry key ("lookup", "research", "computation")
    display_name: str    # UI label ("Quick Lookup", "Deep Research")
    kind: str            # "enrichment" (produces value) or "action" (side effect, future)
    max_steps: int       # Default step budget (2 for lookup, 5 for research, 1 for computation)

    def validate_params(params: dict) -> None           # Raise if params invalid
    async def execute_one(row_data, params, ...) -> AsyncGenerator[RowStep]  # The work
```

### Key data structures

**RowStep** — A single trace entry in the enrichment log:
- `type`: Action kind (`"search"`, `"fetch"`, `"compute"`, `"answer"`, `"error"`, `"thinking"`, `"coverage"`)
- `detail`: Human-readable description
- `data`: Optional dict with extra info (URL, snippet, etc.)

**EnrichmentResult** — Final output of a strategy:
- `value`: The cell value (or None if not found)
- `confidence`: `"high"` / `"medium"` / `"low"` / `"none"`
- `steps`: List of RowStep items (the full trace)

### Template interpolation

All strategies support `{Column Name}` placeholders in their parameters. The `interpolate_template()` method replaces these with actual row values using case-insensitive matching. Example: `"What year was {Company} founded?"` becomes `"What year was Acme Corp founded?"` for a row where Company = "Acme Corp".

---

## Strategy Registry

**File:** `backend/tools/builtin/strategies/__init__.py`

Strategies register themselves at import time:

```python
register_strategy(LookupStrategy())    # from lookup.py
register_strategy(ResearchStrategy())  # from research.py
register_strategy(ComputationStrategy())  # from computation.py
```

Lookup functions:
- `get_strategy(name)` — Get by name
- `get_all_strategies()` — All registered
- `get_strategies_by_kind(kind)` — Filter by "enrichment" or "action"

New strategies register by creating a file in `strategies/`, implementing `RowStrategy`, and adding an import to `__init__.py`.

---

## The Three Strategies

### 1. Lookup (`lookup.py`)

**Purpose:** Fast factual lookups from web search snippets. No page fetching.

**Parameters:**
- `question` (required) — Template with `{Column}` placeholders

**How it works:**
1. Interpolate template with row data
2. Call `_lookup_web_core()` in `web.py`
3. Core runs Claude Haiku with only `search_web` available (no `fetch_webpage`)
4. Max 2 turns: search, then optionally refine query
5. System prompt forces snippet-only answers: "Extract from snippets. If ambiguous, respond 'Could not determine an answer.'"

**Best for:** Founding year, headquarters city, CEO name, website URL, yes/no factual questions.

**Step budget:** 2 turns max. Cheapest strategy.

### 2. Research (`research.py`)

**Purpose:** Multi-turn web research with synthesis. The agent searches, reads pages, and produces a best-effort answer.

**Parameters:**
- `question` (required) — Template with `{Column}` placeholders
- `thoroughness` (optional) — `"exploratory"` (default) or `"comprehensive"`

**How it works:**
1. Interpolate template, enrich query with row context ("Given: Company: Acme, URL: acme.com")
2. Call `_research_web_core()` in `web.py`
3. Core runs Claude Haiku with `search_web` + `fetch_webpage`
4. Forces `search_web` on first turn, then the agent decides its own path
5. Agent iterates: search → read results → maybe fetch a page → maybe search again → synthesize answer

**Two thoroughness levels:**

| Aspect | Exploratory | Comprehensive |
|--------|-------------|---------------|
| Max steps | ~5 (config default) | 8-15 |
| Max tokens per call | 1024 | 2048 |
| Search strategy | 1-2 approaches, refine once if needed | At least 3 different query angles, fetch 2-3 pages, cross-reference |
| Post-research | None | Coverage assessment: Haiku evaluates whether the answer is complete (high/medium/low) |

**System prompt rules:**
- NEVER answer from memory. Always search first.
- Make a genuine effort: try at least 2 approaches before giving up.
- Output goes directly into a spreadsheet cell. No preambles, no "Based on my research..."
- If truly stuck: "Could not determine an answer."

**Best for:** Submission guidelines, feature comparisons, qualitative assessments, anything requiring synthesis from multiple sources.

### 3. Computation (`computation.py`)

**Purpose:** Derive values from existing columns. No external data.

**Parameters:**
- `formula` (required) — Expression like `"{Price} * {Quantity}"` or `"round({Score} / {Max}) * 100"`

**How it works (two-phase):**

1. **Safe eval** — Interpolate placeholders, check that the expression uses only safe operations (arithmetic, `abs`, `round`, `min`, `max`, `int`, `float`, `str`, `len`). If safe, evaluate directly in Python. No imports, no function defs, no builtins beyond the safe set.

2. **Haiku fallback** — If the expression is too complex for safe eval (unit conversions, conditional logic, text operations), send the formula + row context to Claude Haiku and let it compute the answer.

**Best for:** Price calculations, rating normalization, unit conversion, concatenation, conditional logic.

**Step budget:** 1 step. Fastest strategy.

---

## Value Coercion Layer

**File:** `backend/tools/builtin/strategies/coerce.py`

Runs after every strategy, before the result enters the data proposal. Three steps:

### Step 1: Preamble stripping (`strip_preamble`)

LLMs often prefix answers with "Based on my research..." or "According to the website...". The coercion layer strips these using compiled regex patterns. Also removes wrapping quotes.

Example: `"Based on my research, 2010"` → `"2010"`

### Step 2: Not-found detection (`is_not_found`)

Checks against sentinel values: `"n/a"`, `"unknown"`, `"not available"`, `"none"`, `"not found"`, empty string, etc. Case-insensitive, strips trailing periods.

If detected, returns `None` so the cell stays empty rather than getting a useless placeholder.

### Step 3: Type-aware coercion (`coerce_value`)

Given the raw answer string, the target column type, and the column options (for select), produces a clean value:

| Column Type | Coercion Logic | Confidence |
|-------------|---------------|------------|
| **number** | Strip currency symbols ($ € £ ¥ ₹), remove commas, extract first number via regex | "high" if clean, "medium" if had to strip extras |
| **boolean** | Map yes/true/1/y → `"true"`, no/false/0/n → `"false"` | "high" if certain, "low" if ambiguous |
| **select** | Exact case-insensitive match → "high". Fuzzy substring match → "medium". No match → "low" (value returned as-is) | Varies |
| **text** | Truncate to 2000 chars | "medium" if truncated, "high" otherwise |

**Return value:** `(coerced_value, confidence_string)`

This layer is the key defense against the "paragraphs in select columns" problem. It doesn't improve research quality, but it ensures raw research output doesn't corrupt cell values.

---

## Orchestrator

**File:** `backend/tools/builtin/table_data.py` — `execute_enrich_column()`

The `enrich_column` tool ties everything together.

### Input

| Parameter | Type | Description |
|-----------|------|-------------|
| `row_ids` | list[int] | Up to 20 rows per call |
| `target_column` | str | Column name or ID to fill |
| `strategy` | str | `"lookup"`, `"research"`, or `"computation"` |
| `params` | dict | Strategy-specific: `question`, `formula`, `thoroughness` |

### Concurrency

Strategies run rows concurrently with a semaphore:

| Strategy | Max concurrent workers |
|----------|----------------------|
| lookup | 3 |
| research (exploratory) | 3 |
| research (comprehensive) | 2 |
| computation | 10 |

### Per-row flow

For each row:
1. Build `row_data` dict: `{column_name: cell_value}` for all columns
2. Call `strategy.execute_one()` — yields `RowStep` items (the trace)
3. Extract the step with `type="answer"` as the raw result
4. Run `coerce_value(raw, target_type, target_options)` to clean it
5. Build a research log entry with: row_id, label, status, value, confidence, raw_value, steps, strategy, thoroughness

### Progress streaming

The orchestrator yields `ToolProgress` events as work proceeds:

| Stage | When |
|-------|------|
| `starting` | Beginning enrichment |
| `searching` | Strategy is doing web searches |
| `fetching` | Strategy is fetching pages |
| `computing` | Computation strategy running |
| `row_done` | One row completed (includes value + confidence) |
| `row_skipped` | Row skipped (empty identity column, etc.) |
| `complete` | All rows done |
| `cancelled` | User cancelled mid-run |

Progress fraction (0.0 to 1.0) is included so the frontend can show a progress bar.

### Output

The orchestrator produces a `data_proposal` payload:

```json
{
  "reasoning": "Quick Lookup: What year was {Company} founded? — found 8 of 10 rows",
  "operations": [
    {"action": "update", "row_id": 1, "changes": {"Founded": "2010"}},
    {"action": "update", "row_id": 2, "changes": {"Founded": "2015"}}
  ],
  "research_log": [
    {
      "row_id": 1,
      "label": "Acme Corp",
      "status": "found",
      "value": "2010",
      "confidence": "high",
      "raw_value": "2010",
      "steps": [
        {"action": "search", "detail": "Acme Corp founding year", "data": {...}},
        {"action": "answer", "value": "2010"}
      ],
      "strategy": "lookup"
    }
  ]
}
```

The user reviews results in a DataProposalCard. Results are NOT auto-applied.

### Cancellation

The orchestrator accepts a `CancellationToken` via context. It checks the token between rows and before starting new work. If cancelled, partial results are preserved and returned as a data proposal (the user can still apply whatever completed).

---

## How to Add a New Strategy

1. Create `backend/tools/builtin/strategies/my_strategy.py`
2. Implement `RowStrategy`:
   - Set `name`, `display_name`, `kind`, `max_steps`
   - Implement `validate_params()` to check required parameters
   - Implement `execute_one()` as an async generator yielding `RowStep` items
   - Yield a final `RowStep(type="answer", detail="the value")` with the result
3. Add `from . import my_strategy` to `strategies/__init__.py`
4. Call `register_strategy(MyStrategy())` at module level in your file
5. The orchestrator in `table_data.py` picks it up automatically via the registry

The coercion layer runs automatically on whatever your strategy returns. You don't need to handle type fitting.

---

## Relationship to Verticals

The strategy system is **generic by design**. It handles Tier 1 verticals (publishing, product comparison, local business, events, vendors) without domain-specific configuration. The three strategies cover the spectrum from cheap lookups to deep research to pure computation.

Domain-specific enhancements (entity types, API adapters, structured extraction) would layer on top of this foundation. An API adapter strategy, for example, would register as a new strategy that calls PubMed or Google Places directly instead of doing web search. The orchestrator, coercion layer, and data proposal flow remain the same.

See `_specs/product/verticals-and-tooling.md` for the full vertical analysis and the tooling abstractions that would extend this system.
