# Chat System Improvement Plan

Analysis date: 2026-02-10

Weaknesses identified by auditing the chat stream service, system prompt assembly, tooling, help content, and page configurations end-to-end.

---

## 1. Increase `CHAT_MAX_TOKENS` (Critical)

**File:** `backend/services/chat_stream_service.py:58`

`CHAT_MAX_TOKENS = 2000` is far too low. The model frequently needs to:
- Summarize reports with 20+ articles after tool calls
- Generate LLM payloads (SCHEMA_PROPOSAL, RETRIEVAL_PROPOSAL, ARTIFACT_CHANGES) which are large JSON blocks + explanatory text
- Synthesize deep_research findings

A truncated JSON payload fails parsing silently — the feature just doesn't work. The model is constantly forced to compress output, producing incomplete tool summaries, truncated structured payloads, and abrupt responses.

**Fix:** Increase to at least 4096 (8192 for payload-generating pages if feasible). Consider making it configurable per-page via ChatConfig.

---

## 2. Add Tool Chaining Guidance to System Prompt (High)

**File:** `backend/services/chat_stream_service.py` (GLOBAL_PREAMBLE or page instructions)

The system prompt lists available tools but never explains common multi-step patterns. The model doesn't know:

- To compare reports, call `list_stream_reports` first to discover report IDs, then `compare_reports`
- To find an article's notes, call `search_articles_in_reports` to get the article_id, then `get_notes_for_article`
- To get details on an article mentioned by name, search first, then get details

Without these hints the model tries direct calls that fail (e.g., `compare_reports` without IDs), wasting iterations. With `max_iterations=5`, each failure is expensive.

**Fix:** Add a "Common Workflows" subsection to the capabilities section or page instructions listing 3-5 key chaining patterns. Could also be added as help content.

---

## 3. Fix Unregistered Payload Types (High)

**File:** `backend/schemas/payloads.py`

Several tools return payload types that are never registered:

| Payload type | Returned by | Problem |
|---|---|---|
| `pubmed_full_text_links` | `pubmed.py` get_full_text | Summarizer returns "Unknown payload type" in manifest |
| `stream_list` | `streams.py` list_research_streams | Same |
| `stream_details` | `streams.py` get_stream_details | Same |

When these appear in the payload manifest (conversation history), the LLM sees "Unknown payload type" entries which are confusing and unhelpful.

**Fix:** Add `register_payload_type()` calls with proper schemas and summarizers for all three.

---

## 4. Register `workbench_article_viewer` Page Config (High)

**Files:** `frontend/src/components/stream/QueryRefinementWorkbench.tsx:142`, `backend/services/chat_page_config/`

The query refinement workbench sends `current_page: 'workbench_article_viewer'` but no backend page config is registered for this value. It falls through to `DEFAULT_PAGE_INSTRUCTIONS` ("No special instructions for this page"), gets no context builder, no persona, and no page-specific tools. The LLM has zero context about what the user is looking at.

**Fix:** Either register a dedicated page config for `workbench_article_viewer`, or alias it to `article_viewer` in the page resolution logic.

---

## 5. Clean Up Dead Page Configs (Medium)

**Files:** `backend/services/chat_page_config/streams_list.py`, `backend/services/chat_page_config/new_stream.py`

Two page configs have carefully designed payloads but the corresponding frontend pages **don't include ChatTray**:

| Page config | Payloads defined | Frontend status |
|---|---|---|
| `streams_list` | stream_suggestions, portfolio_insights, quick_setup | StreamsPage has no ChatTray |
| `new_stream` | stream_template, topic_suggestions, validation_feedback | NewStreamPage/CreateStreamPage have no ChatTray |

These are dead code. Either wire up ChatTray on those pages or remove the configs to avoid maintenance burden.

**Decision needed:** Are these pages planned to get chat support? If yes, add ChatTray. If no, delete the configs and their associated LLM payload types.

---

## 6. Add Missing Help Topics (Medium)

**File:** `backend/help/*.yaml`

The help system has 40 topics across 9 categories but notable gaps. When the model calls `get_help` for these and gets "Topic not found," it either confabulates or gives an unhelpful "I don't know."

Priority missing topics:

| Topic | Why it matters |
|---|---|
| **Deep research tool** | Global tool, no documentation. Users don't know it exists or how to use it |
| **PubMed query syntax** | Tablizer tells users to "formulate queries" but no guide on Boolean operators, MeSH terms, field tags |
| **Report comparison** | `compare_reports` tool exists but no user-facing documentation |
| **Dashboard page** | Users on dashboard have no help context |
| **Team/org management** | "How do I invite someone?" has no answer |
| **Stream curation workflow** | Include/exclude article workflow is undocumented |

**Fix:** Create YAML help topics for at least deep research, PubMed query syntax, and report comparison. The others can follow.

---

## 7. Tighten Tool Descriptions (Medium)

**File:** `backend/tools/builtin/reports.py`, `backend/tools/builtin/pubmed.py`

Several tool descriptions don't tell the model about constraints, leading to predictable failures:

**a) `search_articles_in_reports`** — Says "Search across all reports in the stream" but requires `stream_id` in context. Should say "Only available when a stream is selected."

**b) `get_report_articles`** — No mention of result size. Reports with 200 articles dump everything. The model should know to use condensed mode by default and warn about large results.

**c) `get_notes_for_article`** — Schema has `required: []` but executor errors if neither article_id nor pmid provided. Schema should require at least one.

**d) `compare_reports`** — Doesn't tell the model to call `list_stream_reports` first to discover IDs. (Partially addressed by item 2 above.)

**Fix:** Update tool descriptions and schemas to accurately reflect requirements and constraints.

---

## 8. Remove "Ask Before Proceeding" from deep_research (Medium)

**File:** `backend/tools/builtin/deep_research.py:99`

The description says: *"Before calling this tool, inform the user that deep research typically takes 1-3 minutes and ask if they'd like to proceed."*

The model can't pause mid-turn and wait for confirmation. It either calls the tool immediately (ignoring the instruction) or responds with "shall I proceed?" without calling it (wasting a turn). The instruction creates a contradiction.

**Fix:** Change to: *"When calling this tool, inform the user that research is underway and typically takes 1-3 minutes."* — instruction to narrate, not to gate.

---

## 9. Add Off-Topic Guardrails (Medium)

**File:** `backend/services/chat_stream_service.py` (GLOBAL_PREAMBLE)

The preamble says "Be conversational and helpful" but doesn't address off-topic questions. The model has `search_web` and `deep_research` available globally, so it may try to answer anything ("write me a poem," "what's the weather") by launching expensive web searches.

**Fix:** Add a line to the preamble: *"You are specialized for biomedical research intelligence. For questions clearly outside this domain, politely redirect: 'I'm designed to help with research intelligence in Knowledge Horizon. For that question, you'd want to use [X].'"*

---

## 10. Consider Adaptive Context Loading (Low)

**File:** `backend/services/chat_stream_service.py` (_load_report_context, _format_report_articles)

`_load_report_context()` always dumps up to 30 articles (with 200-char abstracts and 150-char rationales) into context regardless of what the user asked. For a report with many articles, this section alone can be 10,000+ tokens — squeezed against the 2000-token output limit.

Similarly, `get_report_articles` in expanded mode returns ALL articles with full abstracts.

**Fix (after item 1 is done):** If max_tokens is raised sufficiently, this becomes less urgent. Otherwise, consider:
- Loading article list only on demand (via tools) instead of in context
- Reducing default context to just report summary + highlights + article count
- Adding a `limit` parameter to `get_report_articles`

---

## Execution Order

| Phase | Items | Effort |
|---|---|---|
| **Quick wins** | 1, 3, 8 | Small code changes, immediate impact |
| **Tool quality** | 2, 7 | Text updates to descriptions and prompt |
| **Page config cleanup** | 4, 5 | Decide on dead configs, register missing page |
| **Content gaps** | 6, 9 | Write help YAML files, update preamble |
| **Architecture** | 10 | Larger refactor, do after item 1 |
