# Chat System Quality Framework

Reference for evaluating chat sessions and prioritizing improvements.

---

## Critical Success Factors

A chat request resolves successfully when all of the following hold. Failure at any layer produces a degraded experience, but the failure modes are different — some cause wrong answers, some cause no answer, some cause wasted cost.

### 1. Chat Context Accuracy

**Question:** Does the LLM know what the user is looking at right now?

The system prompt's CURRENT CONTEXT section must accurately reflect the user's page state — which page, which stream/report, whether an article modal is open, what data is loaded. This comes from the frontend context dict passed through the page-specific `build_context()` function.

**What good looks like:**
- The user is on the reports page viewing a specific article → context includes the article's title, abstract, stance analysis, relevance score
- The user is on the edit stream page's semantic tab → context includes the stream name, purpose, and current topic list

**Failure modes:**
- Frontend sends a `current_page` value with no registered page config → LLM gets "The user is currently on: [page_name]" with no useful context
- Context builder exists but omits key state (e.g., which tab is active, what filters are applied)
- Context is stale — reflects the state when the conversation started, not the current state

**How to check:** Compare the CURRENT CONTEXT section of the system prompt (available in the trace) against what the user actually sees on screen.

---

### 2. Instruction Quality

**Question:** Does the LLM have a clear mental model of its role and how to behave?

The layered instruction system — global preamble, page instructions, stream instructions — must give the LLM clear guidance on:
- Its identity and role (biomedical research assistant)
- The two query types (navigation/how-to vs. data/analysis) and how to route between them
- Page-specific behavioral guidance (e.g., "focus on the specific article being viewed")
- Domain-specific context from stream instructions (e.g., terminology, research focus)

**What good looks like:**
- User asks "how do I create a stream?" → LLM recognizes this as a how-to question and calls get_help
- User asks "which articles discuss immunotherapy?" → LLM recognizes this as a data question and calls search_articles_in_reports
- User asks about a specific article while on the article viewer → LLM answers from context without unnecessary tool calls

**Failure modes:**
- Instructions are vague or contradictory between layers
- Page instructions don't reinforce the query routing guidance from the preamble
- LLM over-relies on tools when the answer is already in context
- LLM answers from training data when it should use tools

**How to check:** Read the full system prompt in the trace. Is the routing guidance clear? Does the page instruction reinforce the global preamble or leave the LLM to figure it out?

---

### 3. Adequate Toolset

**Question:** Can the LLM actually do what the user needs?

For navigation/how-to queries → the `get_help` tool must be available. For data/analysis queries → the page-specific data tools must cover the space of things users actually ask about. Tool resolution is dynamic: global tools + page tools + tab tools + subtab tools, filtered by user role.

**What good looks like:**
- Every common user question on a page has a tool that can answer it
- Tools cover both lookup (get specific item) and search (find items matching criteria) patterns
- The user's role doesn't block tools they reasonably need

**Failure modes:**
- A page has no data tools and the user asks a data question → LLM can only answer from context or confabulate
- A tool exists but requires context that isn't available (e.g., `search_articles_in_reports` needs `stream_id` but the user isn't in a stream context)
- A capability exists as a structured LLM response (payload) but there's no tool to fetch the data needed to generate it

**How to check:** For each page, list the top 10 things users ask. For each question, identify which tool answers it. Any gaps?

---

### 4. Help Content Coverage

**Question:** When the LLM reaches for help documentation, is the answer actually there?

Even if the `get_help` tool exists and works, the YAML help files must contain answers to the questions users ask. Missing topics create dead ends where the model either confabulates or gives an unhelpful "I don't have information about that."

**What good looks like:**
- Every feature visible in the UI has a corresponding help topic
- Help content is accurate and matches current behavior
- Topics are organized so the LLM can find them (clear category/topic naming)

**Failure modes:**
- User asks about a feature with no help topic → model confabulates or says "I don't know"
- Help content is outdated and describes old behavior
- Topic exists but under a category the LLM doesn't think to look in
- Help TOC in system prompt doesn't surface the right topics for the LLM to discover

**How to check:** Review help tool calls in traces. When the model calls `get_help`, does it get a useful result? Track "topic not found" responses.

---

### 5. Tool Presentation

**Question:** Does the LLM know when and how to use each tool?

Two sub-factors:

**(a) Selection guidance** — The system prompt must guide tool selection. "Use help for how-to, use data tools for analysis" is the high-level rule, but the LLM also needs to know tool chaining patterns (e.g., "to compare reports, first call list_stream_reports to get IDs, then call compare_reports").

**(b) API contract** — The tool's `description` and `input_schema` must be clear enough that the LLM calls it correctly with the right parameters. Required fields must be marked required. Context-dependent parameters must explain when they're needed.

**What good looks like:**
- Tool descriptions explain not just what the tool does, but when to use it and what prerequisites exist
- Input schemas have accurate required/optional markings and clear descriptions
- Common multi-tool workflows are documented somewhere the LLM can reference

**Failure modes:**
- Tool description doesn't mention that a parameter comes from context, so the LLM passes garbage
- Schema says `required: []` but the executor errors if a field is missing
- LLM doesn't know it needs to chain tools (e.g., calls compare_reports without knowing the report IDs)
- Tool description is so long it wastes context budget, or so short it's ambiguous

**How to check:** Review tool calls in traces. Are parameters correct? Do tools error because of bad inputs? Does the model retry with corrected inputs (indicating it learned from the error) or give up?

---

### 6. Query Classification Accuracy

**Question:** Does the LLM correctly categorize the user's intent?

The preamble defines two query types — navigation/how-to and data/analysis — but real queries are often ambiguous. "What does filter score mean?" could be a help lookup (what is this concept?) or a data question (what's the filter score for this specific article?). Context determines the right answer.

**What good looks like:**
- Unambiguous queries are routed correctly on the first try
- Ambiguous queries are resolved using page context (e.g., if an article is open and has a filter score, answer from context; otherwise, use help)
- The LLM states its interpretation before answering when there's genuine ambiguity

**Failure modes:**
- LLM calls a data tool for a how-to question → wastes an iteration, gets wrong type of answer
- LLM calls get_help for a data question → gets conceptual explanation instead of the specific answer
- LLM answers from training data when tools would give a better, grounded answer
- LLM uses a tool when the answer is already in its context → wastes an iteration, same answer

**How to check:** Sample chat sessions and manually classify each user query. Compare against what the LLM actually did. Misclassification rate is the metric.

---

### 7. Context Window Budget

**Question:** Is the prompt well-balanced, or does one section crowd out the others?

The system prompt is dense: preamble + page instructions + stream instructions + report data (up to 30 articles with abstracts) + capabilities + help TOC + format rules. On data-heavy pages, this can consume a large portion of the 200k context window. As the conversation grows, history competes with the static prompt sections. If context is starved, quality degrades.

**What good looks like:**
- System prompt is informative but proportional — doesn't dump data the user hasn't asked about
- Conversation history has room to grow over many turns
- Tool results fit comfortably alongside history and prompt
- The `peak_input_tokens` metric stays well below the warning threshold for typical conversations

**Failure modes:**
- Report context loads 30 articles with abstracts on every turn even when the user is asking about help topics
- A single tool result (e.g., expanded article list for a 200-article report) blows the context
- Long conversations trigger the context warning after just a few turns because the prompt is already large
- The model's response is truncated (`stop_reason: "max_tokens"`) because output budget is too low relative to input size

**How to check:** Look at `peak_input_tokens` across sessions. Correlate with page type and conversation length. Are reports-page conversations hitting the warning much earlier than other pages?

---

### 8. Tool Result Quality

**Question:** When a tool returns data, can the LLM actually use it to answer the question?

Even if the right tool is called with the right parameters, the result must be (a) correct, (b) formatted so the LLM can reason about it, and (c) not so large that it crowds out everything else.

**What good looks like:**
- Tool results include the data needed to answer the question, formatted as readable text
- Large results have truncation or modes (condensed vs. expanded) to manage size
- The text representation for the LLM and the payload for the frontend are appropriate for their respective consumers
- Results include enough metadata for follow-up (e.g., article IDs so the user can ask for more detail)

**Failure modes:**
- Tool dumps 200 articles with full abstracts → LLM can't synthesize and truncates its summary
- Tool returns terse output that omits data the LLM needs to answer the question
- Result format is hard for the LLM to parse (e.g., deeply nested JSON instead of readable text)
- Multiple tool calls in sequence accumulate so much text that later results push earlier ones out of effective context

**How to check:** For tool calls in traces, compare `output_to_model` size against the quality of the LLM's final response. Are large tool outputs correlated with worse answers?

---

### 9. Error Recovery

**Question:** When something goes wrong mid-turn, does the LLM handle it gracefully?

Tools can fail for valid reasons: no stream context, no report selected, article not found, API timeout. The LLM must handle these failures by either trying an alternative approach, explaining to the user what's needed, or failing transparently — not by confabulating an answer or silently dropping the question.

**What good looks like:**
- Tool returns an error → LLM explains to the user what context is needed ("I need you to select a report first")
- Tool returns partial data → LLM works with what it has and notes the limitation
- Tool fails → LLM tries an alternative tool or approach before giving up
- LLM never presents error messages as answers

**Failure modes:**
- LLM relays raw error strings to the user ("Error: No stream context available")
- LLM ignores the tool error and answers from training data instead
- LLM retries the same failed tool call with the same parameters (wastes iterations)
- LLM hits max_iterations because it's stuck in a tool-error loop

**How to check:** Search traces for tool outputs containing "Error:". What did the model do next? Did it recover, relay, or loop?

---

## Observability Gaps

Signals we should track to measure these factors but currently don't:

| Signal | Relevant factors | Status |
|---|---|---|
| Final iteration `stop_reason` | 7, 8 | In trace data but not surfaced as a top-level field |
| Tool error count per turn | 3, 5, 9 | Must parse tool outputs for "Error:" — no structured flag |
| Payload parse success/failure | 7, 8 | Silently dropped on failure, only logged as warning |
| Help tool miss rate | 4 | Must check tool output for "not found" responses |
| Peak context as % of window | 7 | Tracked via `peak_input_tokens` and warning threshold |
| Tools called vs. tools available | 3, 6 | In trace data but not summarized |
| Iterations used vs. max_iterations | 5, 9 | `outcome` field partially captures this |

---

## Applying the Framework

### Evaluating a single session

Walk through the trace:
1. Read the system prompt — is context accurate? Are instructions clear? (Factors 1, 2)
2. Check tool calls — right tools? Right parameters? Successful? (Factors 3, 5, 6)
3. Check help calls — did the topic exist? Was it useful? (Factor 4)
4. Check tool results — right size? Useful format? (Factor 8)
5. Check for errors — how did the model recover? (Factor 9)
6. Check metrics — peak context, stop_reason, iterations (Factor 7)
7. Read the final response — did it actually answer the question?

### Evaluating the system

For each page, ask:
1. What are the top 10 things users ask on this page?
2. For each question, trace the ideal path: which factor is the bottleneck?
3. Prioritize improvements by which factor fails most often

### When adding a new feature

Before shipping, verify:
1. Page config registered with accurate context builder (Factor 1)
2. Page instructions written and route-aware (Factor 2)
3. Tools cover the feature's query space (Factor 3)
4. Help topics written for new concepts (Factor 4)
5. Tool descriptions include prerequisites and chaining patterns (Factor 5)
6. Context budget tested with realistic data volumes (Factor 7)
