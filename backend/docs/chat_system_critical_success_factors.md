# Chat System Critical Success Factors

A living guide to designing and maintaining an effective AI chat assistant for Knowledge Horizon.

---

## 1. Query Classification

**The LLM must first determine what type of help the user needs.**

### 1.1 Two Primary Modes

| Mode | Description | Example Queries |
|------|-------------|-----------------|
| **Navigation/Steering** | Help user understand or use the application | "How do I create a new stream?", "What do the date fields mean?", "Are dates inclusive?" |
| **Data Analysis** | Help user analyze or interpret their data | "Which articles mention CRISPR?", "Summarize the key findings", "Compare these two reports" |

### 1.2 Classification Signals

**Navigation signals:**
- Questions about "how to" do something
- Questions about what fields/options mean
- Questions about system behavior or semantics
- References to UI elements, settings, configuration

**Analysis signals:**
- Questions about article content
- Requests to summarize, compare, or find patterns
- Questions about specific data values
- Requests to filter or search within results

---

## 2. Ambiguity Detection and Resolution

**The LLM must detect ambiguity and handle it appropriately based on severity.**

### 2.1 Ambiguity Levels

| Level | Description | Strategy |
|-------|-------------|----------|
| **None** | Query intent is clear | Proceed directly |
| **Marginal** | Reasonable interpretation exists, but alternatives possible | State interpretation, then proceed |
| **High** | Multiple plausible interpretations, can't reasonably guess | Ask user to clarify |

### 2.2 Marginal Ambiguity: State and Proceed

When the LLM can make a reasonable interpretation but alternatives exist:

1. **State the interpretation explicitly**
2. **Proceed with the answer**
3. **Optionally note alternatives**

**Examples:**

| Query | Response Pattern |
|-------|------------------|
| "What are the dates for this report?" | "I'll show you the date range configured for this report (Jan 1 - Jan 31, 2026). If you're asking what these dates mean semantically, let me know." |
| "Why is this article here?" | "I'll explain why this article was included in the report based on its filter score. If you're asking about the inclusion criteria in general, I can explain that instead." |
| "Tell me about the filters" | "I'll describe the semantic filters configured for this stream. [proceeds with explanation]" |

**Template:**
```
"I'm interpreting this as [interpretation]. [Answer].
If you meant [alternative], let me know."
```

Or more concise:
```
"[Answer based on interpretation]. (If you meant [alternative], just ask.)"
```

### 2.3 High Ambiguity: Ask for Clarification

When multiple interpretations are equally plausible:

1. **Acknowledge the question**
2. **Present the interpretations as options**
3. **Ask user to choose**

**Examples:**

| Query | Response |
|-------|----------|
| "Tell me about the dates" | "I can help with dates in a few ways: (1) Explain what the date fields mean and how they're used, (2) Show you the specific dates configured for this report, or (3) Explain how date filtering works in searches. Which would be most helpful?" |
| "What's wrong with this?" | "I'd be happy to help diagnose an issue. Can you tell me more about what you're seeing that seems wrong? Is it unexpected articles, missing articles, incorrect dates, or something else?" |

**Template:**
```
"I can interpret this a few ways:
1. [Interpretation A]
2. [Interpretation B]
Which did you have in mind?"
```

### 2.4 Ambiguity Detection Signals

**Signals suggesting ambiguity:**

| Signal | Example | Why Ambiguous |
|--------|---------|---------------|
| Vague referent | "this", "it", "the data" | What specifically? |
| Missing context | "Why doesn't it work?" | What is "it"? What's the expected behavior? |
| Dual-purpose terms | "dates", "filter", "report" | Could mean the concept or specific values |
| Implicit scope | "Show me everything" | Everything in what context? |

**Questions to detect ambiguity:**
- Is the user asking about a concept or specific data?
- Is there a clear referent for pronouns/demonstratives?
- Could this question apply to multiple contexts in the app?
- Does the user seem to be troubleshooting or learning?

### 2.5 Common Ambiguous Patterns

| Pattern | Interpretations | Resolution Strategy |
|---------|-----------------|---------------------|
| "What are the [X] for this [Y]?" | Semantic meaning vs actual values | Marginal - default to values, mention semantics available |
| "Why is [X]?" | How the system works vs this specific case | Marginal - answer specific case, offer general explanation |
| "Tell me about [X]" | Overview vs specific aspect | High if X is broad - ask what aspect |
| "How do I [X]?" | Step-by-step vs conceptual | Usually clear - give steps |
| "[Something] isn't working" | High - need specifics | Ask what they expected vs what happened |

### 2.6 Context Reduces Ambiguity

Use available context to reduce ambiguity:

| Context | How It Helps |
|---------|--------------|
| Current page/view | User asking about "this report" while viewing Report X |
| Recent actions | User just ran a search, now asking "why so few results?" |
| Conversation history | Previous questions establish topic |
| User role | Admin vs regular user affects likely intent |

**Rule**: Leverage context before asking for clarification. Don't ask users to repeat what's already clear from context.

### 2.7 Anti-Patterns

| Anti-Pattern | Problem | Better Approach |
|--------------|---------|-----------------|
| Always asking for clarification | Annoying, feels unhelpful | Make reasonable interpretation for marginal cases |
| Never asking for clarification | May answer wrong question | Ask when truly ambiguous |
| Guessing without stating | User doesn't know your interpretation | Always state your interpretation |
| Listing too many options | Overwhelming | Max 3-4 options, group if more |
| Clarifying obvious things | Wastes time, patronizing | Trust context and reasonable inference |

---

## 3. Tool Design Principles

**The right tools with the right parameters, clearly communicated.**

### 3.1 Tool Design Rules

1. **One tool, one purpose** - Avoid multi-purpose tools that require complex logic to use correctly
2. **Obvious parameters** - Parameter names should make their purpose clear
3. **Sensible defaults** - Common cases shouldn't require specifying optional parameters
4. **Fail clearly** - Return helpful error messages, not cryptic failures

### 3.2 Tool Documentation Requirements

Each tool must have:
- **Clear description** of what it does and when to use it
- **Parameter descriptions** with examples
- **Return value description** with structure
- **Usage examples** for common cases
- **Anti-patterns** - when NOT to use this tool

### 3.3 Tool Set Completeness

The LLM should never need a "convoluted path" to an answer. If users commonly need X, there should be a direct tool for X.

**Signs of missing tools:**
- LLM chains multiple tools to answer simple questions
- LLM apologizes that it can't do something users expect
- LLM uses generic tools when domain-specific would be better

### 3.4 Tool Adequacy: Don't Force It

**If the available tools aren't adequate for the task, say so. Don't attempt elaborate workarounds.**

#### The Problem with Low-Level Tools

Low-level tools (like web search, basic fetch, raw database queries) can *technically* be combined to accomplish many tasks. But "technically possible" doesn't mean "should attempt."

**Example**: A user asks "Compare the number of CRISPR articles across all my reports from Q1 vs Q2."

With only low-level tools, the LLM might need to:
1. List all reports
2. For each report, query article counts
3. Filter by date range
4. Categorize by quarter
5. Aggregate and compare

This is fragile, slow, error-prone, and likely to fail partway through. The right response is: *"I don't have a tool designed for cross-report comparisons. I can look at individual reports, but comparing aggregates across reports would require a reporting tool I don't currently have access to."*

#### Rule: Recognize Tool-Task Mismatch

| Task Complexity | Tool Level | Action |
|-----------------|------------|--------|
| Simple lookup | Basic tools available | Proceed |
| Multi-step but straightforward | Tools exist for each step | Proceed with care |
| Complex aggregation/comparison | Only low-level primitives | **Defer** - tell user tools aren't adequate |
| Cross-entity analysis | No direct tool | **Defer** - explain the gap |

#### Signs You Should Defer

- Task requires more than 3-4 chained tool calls
- Each step depends on parsing/interpreting previous results
- Failure at any step makes the whole result unreliable
- The "plan" feels like a fragile Rube Goldberg machine
- You're not confident the result will be correct

#### How to Defer Gracefully

```
"That's a great question, but I don't have the right tools to answer it reliably.
I can [what you CAN do], but [what you CAN'T do] would require [missing capability].
Would [simpler alternative] help, or is this something that needs a different approach?"
```

**Example responses:**

| Request | Response |
|---------|----------|
| "Compare article counts across all streams" | "I can check individual streams, but I don't have a cross-stream comparison tool. Want me to look at specific streams you name?" |
| "Show me trends over the last 6 months" | "I can pull data for specific reports, but I don't have a trend analysis tool. I'd need to manually compile multiple reports which may be error-prone." |
| "Find all articles that were in Report A but not Report B" | "I don't have a report diff tool. I could try to compare article lists manually, but with large reports this would be unreliable." |

#### Don't Make Assumptions About Tool Behavior

When tool documentation is incomplete:
- Don't guess at undocumented behavior (e.g., what fields a search covers)
- Don't invent parameters or limits
- Acknowledge what you don't know rather than making claims

### 3.5 Current Tool Inventory

*Updated: 2026-02-02*

| Tool | Purpose | Mode |
|------|---------|------|
| `get_help` | Retrieve help documentation by category/topic | Navigation |
| `list_stream_reports` | List all reports for a stream | Analysis |
| `get_report_summary` | Get executive summary, highlights, thematic analysis | Analysis |
| `get_report_articles` | Get articles in a report (condensed or expanded) | Analysis |
| `search_articles_in_reports` | Search articles by PMID, title, author, etc. | Analysis |
| `get_article_details` | Get full details for a specific article | Analysis |
| `get_notes_for_article` | Get personal and shared notes on an article | Analysis |
| `compare_reports` | Compare two reports (new/removed/shared articles) | Analysis |
| `get_starred_articles` | Get starred articles across all reports | Analysis |
| `search_pubmed` | Search PubMed for additional articles | Analysis |
| `get_pubmed_article` | Get full details of a PubMed article by PMID | Analysis |
| `get_full_text` | Get full text from PubMed Central (if available) | Analysis |
| `search_web` | Search the web for information | Analysis |
| `fetch_webpage` | Fetch and read webpage content | Analysis |
| `get_payload` | Retrieve payload from earlier in conversation | Utility |

---

## 4. Help System Design

**The foundation for navigation mode.**

### 4.1 Three Critical Factors

| Factor | Description | Failure Mode |
|--------|-------------|--------------|
| **Knowing when to use it** | LLM recognizes navigation queries | LLM tries to analyze data instead of checking docs |
| **Right table of contents** | Help topics are discoverable | LLM can't find relevant help even when it exists |
| **Right content** | Documentation is accurate and complete | LLM finds help but it doesn't answer the question |

### 4.2 Help Content Requirements

Documentation must include:

#### A. Feature Documentation
- What each feature does
- How to access/use it
- Common workflows

#### B. Field Semantics (CRITICAL)
Every user-visible field must have documented semantics:

```markdown
## Report Date Range

**Fields**: `start_date`, `end_date`

**Semantics**:
- Both dates are INCLUSIVE
- Dates refer to publication date (when article became available)
- Articles with publication_date >= start_date AND <= end_date are included

**Edge cases**:
- If article has only year (no month/day), it's normalized to Jan 1
- Electronic publication date is used when earlier than print date
```

#### C. System Behavior
- What happens when user takes action X
- How data flows through the system
- Business rules and constraints

#### D. Glossary
- Domain terms (e.g., "semantic filter", "retrieval group")
- Abbreviations
- Relationships between concepts

### 4.3 Help System Architecture

```
Help Index (searchable)
    │
    ├── Getting Started
    │   ├── Creating your first stream
    │   └── Understanding the dashboard
    │
    ├── Features
    │   ├── Research Streams
    │   ├── Reports
    │   ├── Article Curation
    │   └── ...
    │
    ├── Field Reference
    │   ├── Report fields
    │   ├── Article fields
    │   ├── Stream configuration fields
    │   └── ...
    │
    └── Glossary
        └── Term definitions
```

### 4.4 Maintaining Help Content

**When developers change the system, they must update help content.**

Checklist for code changes:
- [ ] Does this change any user-visible behavior?
- [ ] Does this add/modify/remove any fields?
- [ ] Does this change any semantics?
- [ ] Is the help content updated to match?

---

## 5. Semantic Documentation Inventory

**What the developer knows that the chat system must also know.**

### 5.1 Date Semantics

| Context | Field | Semantics |
|---------|-------|-----------|
| Report | `start_date`, `end_date` | Inclusive range for article publication_date |
| Article | `publication_date` | When article became available (electronic > print) |
| Pipeline | `date_type` | Which date to filter on (publication vs entry) |

*See: [Article Date Field Analysis](./article_date_field_analysis.md)*

### 5.2 Filter Semantics

| Field | Semantics |
|-------|-----------|
| `filter_score` | 0.0-1.0, higher = more relevant |
| `filter_threshold` | Articles with score >= threshold pass |
| `passed_semantic_filter` | True if score >= threshold OR curator override |

### 5.3 Inclusion Semantics

| Field | Semantics |
|-------|-----------|
| `included_in_report` | SOURCE OF TRUTH - article appears in report |
| `curator_included` | Curator manually added (overrides filter rejection) |
| `curator_excluded` | Curator manually removed (overrides filter pass) |

### 5.4 Status Semantics

*TODO: Document pipeline statuses, report statuses, etc.*

---

## 6. Anti-Patterns to Avoid

### 6.1 Tool Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Querying data to answer semantic questions | Slow, may give wrong answer | Check documentation first |
| Chaining tools when one would suffice | Confusing, error-prone | Add the direct tool |
| Using generic search for specific lookups | Inefficient | Add specific lookup tools |

### 6.2 Response Anti-Patterns

| Anti-Pattern | Problem | Solution |
|--------------|---------|----------|
| Guessing at semantics | May be wrong | Always verify against docs |
| Over-explaining implementation | User doesn't care | Focus on user-level meaning |
| Giving data without context | Meaningless numbers | Explain what the data means |

---

## 7. Testing & Validation

### 7.1 Query Test Cases

Maintain a set of test queries for each mode:

**Navigation queries:**
- "Are report dates inclusive or exclusive?"
- "What does filter_score mean?"
- "How do I add an article to a report?"

**Analysis queries:**
- "How many articles are in this report?"
- "Which articles mention gene therapy?"
- "Summarize the findings on drug resistance"

**Ambiguous queries:**
- "Tell me about the dates" (need clarification)
- "Why was this article included?" (could be either)

### 7.2 Success Criteria

| Criterion | Measure |
|-----------|---------|
| Correct mode selection | LLM uses docs for navigation, tools for analysis |
| Answer accuracy | Answers match ground truth |
| Response time | Under X seconds for common queries |
| Fallback handling | Graceful when uncertain |

---

## 8. Continuous Improvement

### 8.1 Feedback Signals

- User corrections ("That's not what I meant")
- Repeated questions (documentation gap?)
- Tool chain length (missing direct tool?)
- Error rates by tool/query type

### 8.2 Update Triggers

| Trigger | Action |
|---------|--------|
| New feature added | Add feature documentation + tool if needed |
| Field semantics changed | Update field reference |
| Common user confusion | Improve documentation clarity |
| Convoluted tool usage | Consider new direct tool |

---

## Appendix: Documentation Templates

### A. Field Reference Template

```markdown
## [Field Name]

**Location**: Where this field appears (Report, Article, etc.)

**Type**: Data type (string, date, boolean, etc.)

**Semantics**: What this field means in plain language

**Values**: Possible values and their meanings (for enums/booleans)

**Relationships**: How this field relates to other fields

**Edge Cases**: Special handling for unusual situations

**Example**: Concrete example with explanation
```

### B. Feature Documentation Template

```markdown
## [Feature Name]

**Purpose**: What problem this feature solves

**Access**: How to access this feature in the UI

**Workflow**: Step-by-step usage

**Fields**: Key fields and their meanings (link to field reference)

**Tips**: Best practices and common patterns

**Troubleshooting**: Common issues and solutions
```
