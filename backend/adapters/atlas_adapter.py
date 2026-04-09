"""
atlas_adapter.py — table.that AgentTrace → Atlas Failure Debugger adapter

Converts table.that's AgentTrace (our native execution trace format) into the
telemetry schema expected by Kiyoshi Sasano's llm-failure-atlas matcher.

    pip install agent-failure-debugger
    https://github.com/kiyoshisasano/llm-failure-atlas


================================================================================
SCHEMA COMPARISON: table.that AgentTrace vs Atlas Telemetry
================================================================================

table.that captures a complete agent loop execution as an AgentTrace. Atlas
expects a flat dict of 9 telemetry sections. Here's how they relate:

TABLE.THAT AgentTrace                    ATLAS Telemetry
========================                 ========================

AgentTrace                               (top-level dict)
  trace_id: str (UUID)                     (no equivalent — we add to metadata)
  model: str                               (no equivalent)
  max_tokens: int                          (no equivalent)
  max_iterations: int                      (no equivalent)
  temperature: float                       (no equivalent)
  system_prompt: str                       (no equivalent)
  tools: List[ToolDefinition]              (no equivalent)
  context: dict                            (no equivalent)
  initial_messages: List[dict]           → input.ambiguity_score (Tier 2 heuristic
                                             applied to last user message)
  iterations: List[AgentIteration]       → tools.*, state.*, reasoning.*,
    ├ iteration: int                         interaction.*, grounding.*
    ├ messages_to_model: List[dict]          (boundary snapshot — no Atlas equiv)
    ├ response_content: List[dict]       → reasoning.replanned (scan text blocks)
    │   (text blocks + tool_use blocks)  → interaction.clarification_triggered
    ├ stop_reason: str                       (no direct equiv)
    ├ usage: TokenUsage                      (no direct equiv)
    ├ api_call_ms: int                       (no direct equiv)
    └ tool_calls: List[ToolCall]         → tools.*, state.*
        ├ tool_use_id: str                   (no equiv)
        ├ tool_name: str                 → tools.call_count, unique_tools
        ├ tool_input: dict               → tools.repeat_count (with tool_name)
        ├ output_from_executor: Any          (raw — richer than Atlas expects)
        ├ output_type: str               → tools.error_count (when "error")
        ├ output_to_model: str           → tools.soft_error_count (scan markers)
        │                                → grounding.source_data_length
        │                                → grounding.tool_provided_data
        ├ payload: Optional[dict]            (UI-specific — no Atlas equiv)
        ├ progress_events: Optional[List]    (streaming — no Atlas equiv)
        └ execution_ms: int                  (no direct equiv)
  raw_text: str                          → response.alignment_score (vs query)
                                         → grounding.response_length
                                         → grounding.uncertainty_acknowledged
                                         → grounding.expansion_ratio
  total_iterations: int                      (no direct equiv)
  outcome: Literal[...]                  → state.chain_error_occurred
                                         → state.output_produced
  error_message: Optional[str]               (no direct equiv)
  final_response: Optional[FinalResponse]    (UI-specific — no Atlas equiv)
  total_input_tokens: int                    (no direct equiv)
  total_output_tokens: int                   (no direct equiv)
  total_duration_ms: int                     (no direct equiv)
  peak_input_tokens: Optional[int]       → context.max_input_tokens
                                         → context.context_utilization
                                         → context.truncated


================================================================================
ATLAS TELEMETRY SECTIONS — WHAT EACH MEANS AND WHERE WE MAP FROM
================================================================================

SECTION         PURPOSE                          OUR COVERAGE
-------         -------                          ------------
input           Query ambiguity estimation       Tier 2 heuristic on user message
interaction     Clarification / correction       Clarification: scan LLM text
                                                 Correction: limited (no feedback loop)
reasoning       Replanning / hypothesis          Scan LLM text across iterations
cache           Semantic cache behavior          N/A — we don't use semantic caching
retrieval       RAG retrieval quality            N/A — no RAG pipeline
response        Output alignment with intent     Tier 2 heuristic (query vs response)
tools           Tool call patterns               STRONG — direct field mapping
state           Execution progress tracking      STRONG — direct field mapping
grounding       Evidence basis of response       STRONG — from tool outputs
context         Context window pressure          STRONG — peak_input_tokens


================================================================================
FAILURE PATTERNS THIS ADAPTER ENABLES
================================================================================

PATTERN                         FIELDS NEEDED                    STATUS
-------                         -------------                    ------
agent_tool_call_loop            tools.repeat_count,              FULL
                                state.any_tool_looping,
                                reasoning.replanned

premature_termination           state.output_produced,           FULL
                                state.chain_error_occurred,
                                tools.call_count

failed_termination              state.chain_error_occurred,      FULL
                                state.output_produced

context_truncation_loss         context.truncated,               FULL
                                context.context_utilization

incorrect_output                response.alignment_score,        PARTIAL
                                interaction.user_correction,     (no correction
                                grounding.*                       feedback yet)

clarification_failure           input.ambiguity_score,           FULL
                                interaction.clarification,
                                reasoning.hypothesis_count

insufficient_observability      meta (auto-computed)             FULL

unmodeled_failure               meta (auto-computed)             PARTIAL

semantic_cache_intent_bleeding  cache.*                          N/A
rag_retrieval_drift             retrieval.*, cache.*             N/A
prompt_injection_via_retrieval  retrieval.*                      N/A
instruction_priority_inversion  retrieval.*                      N/A


================================================================================
TIER SYSTEM (Atlas's signal extraction taxonomy)
================================================================================

Atlas categorizes each telemetry field by how it's derived:

  Tier 1 — Deterministic: Direct field mapping from trace data. No inference.
           Example: tools.call_count = len(tool_calls). Can't be wrong.

  Tier 2 — Computed: Heuristic scoring from text or structure. Approximate.
           Example: input.ambiguity_score = word-count + pronoun heuristic.
           These are the same heuristics Atlas's own LangChain adapter uses.

  Tier 3 — LLM-assisted: Use an LLM to evaluate ambiguous signals.
           Not implemented in any Atlas adapter yet.

For each field below, the tier is noted. Our Tier 1 mappings are exact.
Our Tier 2 mappings use the same heuristics as Atlas's LangChain adapter.


================================================================================
USAGE
================================================================================

    # From a saved trace (e.g., from message.extras["trace"])
    from adapters.atlas_adapter import TableThatAdapter

    adapter = TableThatAdapter()
    telemetry = adapter.build_matcher_input(trace_dict)

    # With metadata (includes source + trace_id)
    result = adapter.build_with_metadata(trace_dict)
    # result = {"telemetry": {...}, "metadata": {"source": "table_that", ...}}

    # With the debugger
    from agent_failure_debugger import run_pipeline
    diagnosis = run_pipeline(telemetry)

    # CLI
    python -m adapters.atlas_adapter path/to/trace.json
    python -m adapters.atlas_adapter path/to/trace.json --with-metadata
"""

import json
import sys
from collections import Counter
from typing import Any


# ---------------------------------------------------------------------------
# Atlas base adapter interface (inlined to avoid requiring the atlas package
# just to define the adapter — the interface is stable and tiny)
# ---------------------------------------------------------------------------

class BaseAdapter:
    """
    Atlas adapter interface. Subclasses implement normalize() and
    extract_features(). The base class provides build_matcher_input()
    which chains them.

    See: llm_failure_atlas/adapters/base_adapter.py
    """
    source: str = "unknown"

    def normalize(self, raw_log: dict) -> dict:
        raise NotImplementedError

    def extract_features(self, normalized: dict) -> dict:
        raise NotImplementedError

    def build_matcher_input(self, raw_log: dict) -> dict:
        normalized = self.normalize(raw_log)
        return self.extract_features(normalized)

    def build_with_metadata(self, raw_log: dict) -> dict:
        telemetry = self.build_matcher_input(raw_log)
        return {
            "telemetry": telemetry,
            "metadata": {
                "source": self.source,
                "adapter_version": "1.0",
            },
        }


# ---------------------------------------------------------------------------
# Soft-error markers (shared with Atlas's LangChain adapter)
# ---------------------------------------------------------------------------

# When a tool returns successfully (no exception) but its output text contains
# one of these markers, Atlas considers it a "soft error" — the tool ran but
# didn't produce usable data. Used for tools.soft_error_count and state
# progress tracking.
TOOL_SOFT_ERROR_MARKERS = [
    "error", "unavailable", "service unavailable",
    "could not", "failed to", "exception",
    "no results", "0 results", "0 matching",
    "not found", "no data", "no records",
    "empty", "none found", "[]",
]


# ---------------------------------------------------------------------------
# The adapter
# ---------------------------------------------------------------------------

class TableThatAdapter(BaseAdapter):
    """
    Adapter from table.that's AgentTrace to Atlas's telemetry format.

    Input: An AgentTrace dict (i.e., AgentTrace.model_dump() output, or the
    "trace" key from a message's extras column).

    Our AgentTrace schema (backend/schemas/chat.py):
      - trace_id, model, max_tokens, max_iterations, temperature
      - system_prompt, tools (definitions), context
      - initial_messages: the conversation history sent to the agent
      - iterations: List[AgentIteration], each containing:
          - messages_to_model (exact API input)
          - response_content (content blocks: text + tool_use)
          - stop_reason, usage (TokenUsage), api_call_ms
          - tool_calls: List[ToolCall], each with:
              - tool_name, tool_input, output_type, output_to_model,
                output_from_executor, execution_ms, progress_events
      - raw_text, total_iterations, outcome, error_message
      - total_input_tokens, total_output_tokens, total_duration_ms
      - peak_input_tokens (context window high-water mark)
    """

    source = "table_that"

    # Context window size for Claude models (used for utilization ratio).
    # Claude sonnet/opus with 200k context.
    MODEL_CONTEXT_LIMIT = 200_000

    # A tool called this many times with zero successes = looping.
    # Matches Atlas's LangChain adapter threshold.
    LOOP_THRESHOLD = 3

    # -----------------------------------------------------------------------
    # normalize: AgentTrace dict → intermediate structure
    # -----------------------------------------------------------------------

    def normalize(self, raw_log: dict) -> dict:
        """
        Reshape AgentTrace into a flat intermediate structure that
        extract_features() can work with cleanly.

        AgentTrace is iteration-centric (iterations → tool_calls).
        Atlas is step-type-centric (llm_steps, tool_steps).
        This method bridges that structural difference.

        Mapping:
          AgentTrace.iterations[*].response_content  → llm_outputs[]
            We extract text blocks from response_content. Each iteration
            may have multiple text blocks (interleaved with tool_use blocks).

          AgentTrace.iterations[*].tool_calls[]      → tool_steps[]
            Flattened across all iterations into a single list.

          AgentTrace.initial_messages[-1]             → query
            The last user message is the query that triggered this agent run.

          AgentTrace.raw_text                         → response
            The concatenated assistant response.
        """
        iterations = raw_log.get("iterations", [])

        # -- Extract the user's query from the last user message --
        query = ""
        for msg in reversed(raw_log.get("initial_messages", [])):
            if msg.get("role") == "user":
                # Content can be a string or list of content blocks
                content = msg.get("content", "")
                if isinstance(content, list):
                    # Extract text from content blocks
                    query = " ".join(
                        block.get("text", "")
                        for block in content
                        if isinstance(block, dict) and block.get("type") == "text"
                    )
                else:
                    query = str(content)
                break

        # -- Collect LLM text outputs from each iteration --
        # Each iteration's response_content is a list of content blocks.
        # Text blocks contain the model's reasoning/response text.
        # Tool_use blocks are handled separately via tool_calls.
        llm_outputs: list[dict] = []
        for iteration in iterations:
            texts = []
            for block in iteration.get("response_content", []):
                if isinstance(block, dict) and block.get("type") == "text":
                    texts.append(block.get("text", ""))
            if texts:
                llm_outputs.append({
                    "iteration": iteration.get("iteration", 0),
                    "text": "\n".join(texts),
                    "stop_reason": iteration.get("stop_reason", ""),
                })

        # -- Flatten tool calls across all iterations --
        # Each tool_call retains its original fields; we add the iteration
        # number for context.
        tool_steps: list[dict] = []
        for iteration in iterations:
            for tc in iteration.get("tool_calls", []):
                tool_steps.append({
                    "iteration": iteration.get("iteration", 0),
                    **tc,
                })

        return {
            "query": query,
            "response": raw_log.get("raw_text", ""),
            "llm_outputs": llm_outputs,
            "tool_steps": tool_steps,
            "outcome": raw_log.get("outcome", "complete"),
            "error_message": raw_log.get("error_message"),
            "total_iterations": raw_log.get("total_iterations", 0),
            "peak_input_tokens": raw_log.get("peak_input_tokens"),
            "trace_id": raw_log.get("trace_id", ""),
        }

    # -----------------------------------------------------------------------
    # extract_features: intermediate → Atlas telemetry dict
    # -----------------------------------------------------------------------

    def extract_features(self, normalized: dict) -> dict:
        """
        Map our normalized structure into Atlas's 9-section telemetry format.

        Each section is extracted by a dedicated method (matching Atlas's
        LangChain adapter pattern). See the method docstrings for field-by-
        field mapping details and tier classification.
        """
        telemetry = {
            "input": self._extract_input(normalized),
            "interaction": self._extract_interaction(normalized),
            "reasoning": self._extract_reasoning(normalized),
            "cache": self._extract_cache(normalized),
            "retrieval": self._extract_retrieval(normalized),
            "response": self._extract_response(normalized),
            "tools": self._extract_tools(normalized),
            "state": self._extract_state(normalized),
            "grounding": self._extract_grounding(normalized),
        }

        # Context section (optional in Atlas — only the callback handler
        # produces it, but it's highly relevant for us since we track
        # peak_input_tokens explicitly).
        peak = normalized.get("peak_input_tokens")
        if peak is not None:
            utilization = round(peak / self.MODEL_CONTEXT_LIMIT, 3)
            telemetry["context"] = {
                "truncated": utilization >= 0.90,
                "critical_info_present": False,  # not deterministically inferable
                "max_input_tokens": peak,
                "context_utilization": utilization,
            }

        return telemetry

    # -----------------------------------------------------------------------
    # input section
    # -----------------------------------------------------------------------

    def _extract_input(self, normalized: dict) -> dict:
        """
        Atlas field: input.ambiguity_score (float, 0.0–1.0)
        Tier: 2 (heuristic — same algorithm as LangChain adapter)

        Source: The user's query extracted from initial_messages.

        Heuristic: baseline 0.3, adjusted by:
          +0.2 if query is very short (<=3 words)
          +0.1 if query is short (<=6 words)
          +0.15 if contains ambiguous pronouns (it, that, this, they, them)
          +0.15 if contains hedging/alternatives (or, maybe, either, perhaps)

        This is intentionally identical to Atlas's LangChain adapter so that
        the same thresholds trigger the same failure patterns.
        """
        query = normalized.get("query", "")
        return {"ambiguity_score": self._estimate_ambiguity(query)}

    # -----------------------------------------------------------------------
    # interaction section
    # -----------------------------------------------------------------------

    def _extract_interaction(self, normalized: dict) -> dict:
        """
        Atlas fields:
          interaction.clarification_triggered (bool)
            Tier: 2 — scan LLM text for clarification markers
            Source: llm_outputs[*].text (our response_content text blocks)

          interaction.user_correction_detected (bool)
            Tier: 2 — limited coverage
            Source: We don't currently have a user feedback loop in our trace.
                    Atlas's LangChain adapter checks trace.feedback.user_correction
                    (from LangSmith feedback) or infers from topic-pivot patterns.
                    We can only do the topic-pivot inference.

        NOTE: user_correction_detected is used by the "incorrect_output" pattern.
        Without explicit feedback data, this field will undercount corrections.
        If we add user feedback tracking to table.that, we should update this.
        """
        # -- clarification_triggered --
        # Same markers as Atlas's LangChain adapter (both direct clarification
        # questions and Claude-style information requests).
        clarification_markers = [
            # Direct clarification
            "could you clarify", "did you mean", "can you specify",
            "what do you mean", "please clarify", "which one",
            # Information requests (Claude-style)
            "could you provide", "could you please provide",
            "can you provide", "i need the", "i need to know",
            "what is the", "what is your", "which ",
            "please provide", "please specify",
        ]

        clarification = False
        for output in normalized["llm_outputs"]:
            text = output.get("text", "").lower()
            if any(marker in text for marker in clarification_markers):
                clarification = True
                break

        # -- user_correction_detected --
        # Infer from topic-pivot pattern (same heuristic as LangChain adapter).
        # This fires when the response admits failure on the original topic
        # AND pivots to a different one.
        correction_detected = False
        query = normalized.get("query", "").lower()
        response = normalized.get("response", "").lower()
        if query and response:
            admits_failure = any(m in response for m in [
                "couldn't find", "could not find", "unable to find",
                "no results", "unfortunately", "wasn't able", "was not able",
            ])
            topic_pivot = False
            pivot_pairs = [
                ({"flight", "flights"}, {"hotel", "hotels", "inn", "lodge", "suites"}),
                ({"restaurant", "restaurants"}, {"cafe", "cafes", "bar", "bars"}),
                ({"buy", "purchase"}, {"rent", "lease"}),
            ]
            for query_topics, alt_topics in pivot_pairs:
                if (query_topics & set(query.split())) and (alt_topics & set(response.split())):
                    topic_pivot = True
                    break
            correction_detected = admits_failure and topic_pivot

        return {
            "clarification_triggered": clarification,
            "user_correction_detected": correction_detected,
        }

    # -----------------------------------------------------------------------
    # reasoning section
    # -----------------------------------------------------------------------

    def _extract_reasoning(self, normalized: dict) -> dict:
        """
        Atlas fields:
          reasoning.replanned (bool)
            Tier: 2 — scan LLM text from iteration 2+ for strategy-change markers
            Source: llm_outputs where iteration >= 2

            Used by: agent_tool_call_loop pattern. If the model replanned,
            the "no_replanning_before_repeat" signal won't fire, which reduces
            confidence in the loop diagnosis (i.e., it tried to adapt).

          reasoning.hypothesis_count (int, default 1)
            Tier: 2 — scan all LLM text for branching markers
            Source: all llm_outputs

            Used by: clarification_failure pattern. If hypothesis_count > 1,
            the "no_hypothesis_branching" signal won't fire.

        Markers are identical to Atlas's LangChain adapter. Note that "let me
        try" and "actually" are deliberately excluded — they commonly appear
        before simple retries and don't indicate genuine replanning.
        """
        replanning_markers = [
            "different approach", "reconsider", "correction",
            "let me reconsider", "try a different",
            "change strategy", "switch to",
        ]
        branching_markers = [
            "alternatively", "on the other hand", "another option",
            "option 1", "option a", "could also mean",
            "there are two", "there are several",
        ]

        replanned = False
        hypothesis_count = 1

        for output in normalized["llm_outputs"]:
            text = output.get("text", "").lower()
            iteration = output.get("iteration", 0)

            # Replanning only counts from iteration 2+ (you can't replan
            # before you've planned)
            if iteration >= 2 and not replanned:
                if any(m in text for m in replanning_markers):
                    replanned = True

            # Hypothesis branching can appear in any iteration
            if hypothesis_count == 1:
                if any(m in text for m in branching_markers):
                    hypothesis_count = 2

        return {"replanned": replanned, "hypothesis_count": hypothesis_count}

    # -----------------------------------------------------------------------
    # cache section
    # -----------------------------------------------------------------------

    def _extract_cache(self, normalized: dict) -> dict:
        """
        Atlas fields: cache.hit, cache.similarity, cache.query_intent_similarity

        NOT APPLICABLE — table.that does not use a semantic cache layer.

        We return safe defaults that prevent cache-related failure patterns
        from firing. Atlas treats missing/default fields as "no signal" and
        won't diagnose cache failures.

        Patterns disabled by these defaults:
          - semantic_cache_intent_bleeding (requires cache.hit=True)
          - rag_retrieval_drift (requires cache.hit=True + similarity>=0.85)
        """
        return {
            "hit": False,
            "similarity": 0.0,
            "query_intent_similarity": 1.0,  # 1.0 = no mismatch
        }

    # -----------------------------------------------------------------------
    # retrieval section
    # -----------------------------------------------------------------------

    def _extract_retrieval(self, normalized: dict) -> dict:
        """
        Atlas fields: retrieval.skipped (and optional adversarial fields)

        NOT APPLICABLE — table.that does not have a RAG retrieval pipeline.
        Our tools fetch data directly (PubMed, web search, etc.) rather than
        through a retriever → vector store → document chain.

        We set skipped=True which is accurate: there is no retrieval step.

        Patterns disabled by this:
          - rag_retrieval_drift
          - prompt_injection_via_retrieval
          - instruction_priority_inversion
        """
        return {"skipped": True}

    # -----------------------------------------------------------------------
    # response section
    # -----------------------------------------------------------------------

    def _extract_response(self, normalized: dict) -> dict:
        """
        Atlas field: response.alignment_score (float, 0.0–1.0)
        Tier: 2 (heuristic — same algorithm as LangChain adapter)

        Source: query (from initial_messages) vs response (raw_text)

        Heuristic: word overlap between query and response, with penalties:
          - Topic pivot penalty (0.2x): response addresses a different entity
            than what was asked about
          - Negation penalty (0.5x): response contains failure/negation markers

        Used by: incorrect_output pattern (threshold < 0.5 triggers the
        "output_misaligned_with_intent" signal).
        """
        query = normalized.get("query", "")
        response = normalized.get("response", "")
        return {"alignment_score": self._estimate_alignment(query, response)}

    # -----------------------------------------------------------------------
    # tools section
    # -----------------------------------------------------------------------

    def _extract_tools(self, normalized: dict) -> dict:
        """
        Atlas fields — all Tier 1 (direct mapping from our ToolCall records):

          tools.call_count (int)
            Source: len(tool_steps)
            = total number of tool invocations across all iterations

          tools.repeat_count (int)
            Source: Counter of (tool_name, sorted tool_input) pairs
            = max repetitions of any single (tool, input) combo, minus 1
            Used by: agent_tool_call_loop pattern (threshold >= 3)

          tools.unique_tools (int)
            Source: distinct tool_name values
            = how many different tools were used

          tools.error_count (int)
            Source: tool_calls where output_type == "error"
            = hard failures (exceptions, crashes)
            In table.that, output_type is set by the agent loop when a tool
            executor raises an exception.

          tools.soft_error_count (int)
            Tier: 2 (marker scanning — same markers as LangChain adapter)
            Source: tool_calls where output_type != "error" but output_to_model
                    contains soft-error markers
            = tools that ran but returned no usable data
        """
        tool_steps = normalized["tool_steps"]
        call_count = len(tool_steps)

        # -- repeat_count --
        # Detect identical calls: same tool name + same input parameters.
        # json.dumps with sort_keys ensures dict ordering doesn't cause
        # false negatives.
        calls = [
            (tc["tool_name"], json.dumps(tc.get("tool_input", {}), sort_keys=True))
            for tc in tool_steps
        ]
        call_counts = Counter(calls)
        max_repeat = max(call_counts.values()) if call_counts else 0
        repeat_count = max_repeat - 1 if max_repeat > 1 else 0

        # -- unique_tools --
        unique_tools = len(set(tc["tool_name"] for tc in tool_steps)) if tool_steps else 0

        # -- error_count (Tier 1) --
        # In table.that, output_type == "error" means the tool executor raised
        # an exception. This is a hard error — the tool didn't complete.
        error_count = sum(
            1 for tc in tool_steps
            if tc.get("output_type") == "error"
        )

        # -- soft_error_count (Tier 2) --
        # Tool completed (no exception) but output suggests it found nothing
        # useful. We scan output_to_model (the formatted string sent back to
        # the model) for the same markers Atlas uses.
        soft_error_count = 0
        for tc in tool_steps:
            if tc.get("output_type") == "error":
                continue  # already counted as hard error
            output = (tc.get("output_to_model") or "").lower()
            if any(marker in output for marker in TOOL_SOFT_ERROR_MARKERS):
                soft_error_count += 1

        return {
            "call_count": call_count,
            "repeat_count": repeat_count,
            "unique_tools": unique_tools,
            "error_count": error_count,
            "soft_error_count": soft_error_count,
        }

    # -----------------------------------------------------------------------
    # state section
    # -----------------------------------------------------------------------

    def _extract_state(self, normalized: dict) -> dict:
        """
        Execution progress tracking — mostly Tier 1 (direct mapping).

        Atlas fields:

          state.progress_made (bool)
            Tier: 1/2 — any tool produced usable (non-error) output
            Source: tool_steps output_type + output_to_model scanning

          state.tool_progress (dict)
            Tier: 1 — per-tool breakdown of {calls, successes, failures, progress}
            Source: tool_steps grouped by tool_name

          state.any_tool_looping (bool)
            Tier: 1 — any tool called >= LOOP_THRESHOLD times with 0 successes
            Source: computed from tool_progress
            Used by: agent_tool_call_loop pattern

          state.output_produced (bool)
            Tier: 1 — did the agent produce a final response?
            Source: response (raw_text) non-empty check
            Used by: premature_termination pattern

          state.chain_error_occurred (bool)
            Tier: 1 — did the execution end in error?
            Source: outcome == "error"
            Note: In Atlas's LangChain adapter, this checks for chain-type
            step errors. In table.that, we check the top-level outcome field,
            which is set when the agent loop catches an unhandled exception.
            Used by: failed_termination pattern
        """
        tool_steps = normalized["tool_steps"]

        if not tool_steps:
            response = normalized.get("response", "")
            return {
                "progress_made": True,  # no tools needed = progress by default
                "tool_progress": {},
                "any_tool_looping": False,
                "output_produced": bool(response and response.strip()),
                "chain_error_occurred": normalized.get("outcome") == "error",
            }

        # -- per-tool progress --
        tool_progress: dict[str, dict[str, Any]] = {}
        for tc in tool_steps:
            name = tc.get("tool_name", "unknown")
            if name not in tool_progress:
                tool_progress[name] = {
                    "calls": 0, "successes": 0, "failures": 0,
                    "progress": False,
                }
            entry = tool_progress[name]
            entry["calls"] += 1

            # Classify this call as success or failure
            is_hard_error = tc.get("output_type") == "error"
            output_text = (tc.get("output_to_model") or "").lower()
            is_soft_error = (
                not is_hard_error
                and bool(output_text)
                and any(m in output_text for m in TOOL_SOFT_ERROR_MARKERS)
            )

            if is_hard_error or is_soft_error:
                entry["failures"] += 1
            elif output_text:
                entry["successes"] += 1
                entry["progress"] = True

        any_tool_looping = any(
            tp["calls"] >= self.LOOP_THRESHOLD and tp["successes"] == 0
            for tp in tool_progress.values()
        )

        progress_made = any(tp["progress"] for tp in tool_progress.values())

        response = normalized.get("response", "")
        output_produced = bool(response and response.strip())
        chain_error_occurred = normalized.get("outcome") == "error"

        return {
            "progress_made": progress_made,
            "tool_progress": tool_progress,
            "any_tool_looping": any_tool_looping,
            "output_produced": output_produced,
            "chain_error_occurred": chain_error_occurred,
        }

    # -----------------------------------------------------------------------
    # grounding section
    # -----------------------------------------------------------------------

    def _extract_grounding(self, normalized: dict) -> dict:
        """
        Evidence basis assessment — how well-grounded is the response?

        Atlas fields:

          grounding.tool_provided_data (bool)
            Tier: 1 — did any tool return usable (non-error) data?
            Source: tool_steps with non-error output_type and output_to_model
                    not matching soft-error markers.

          grounding.uncertainty_acknowledged (bool)
            Tier: 2 — does the response disclose uncertainty?
            Source: scan raw_text for ~30 uncertainty markers
            Same markers as Atlas's LangChain adapter.

          grounding.response_length (int)
            Tier: 1 — character count of final response
            Source: len(raw_text)

          grounding.source_data_length (int)
            Tier: 1 — character count of usable tool outputs
            Source: sum of len(output_to_model) for non-error tool calls
            Note: In table.that, output_to_model is the formatted string that
            was sent back to the model as a tool_result. This is the closest
            analog to "source data" — it's what the model actually saw.

          grounding.expansion_ratio (float)
            Tier: 1 — response_length / source_data_length
            Source: computed from the above two fields
            Used by: incorrect_output pattern (high ratio = response contains
            more content than the tools provided, suggesting fabrication).
        """
        tool_steps = normalized["tool_steps"]
        response = normalized.get("response", "")

        # -- tool_provided_data + source_data_length --
        tool_provided_data = False
        source_data_length = 0
        for tc in tool_steps:
            if tc.get("output_type") == "error":
                continue
            output_text = tc.get("output_to_model", "")
            if not any(m in output_text.lower() for m in TOOL_SOFT_ERROR_MARKERS):
                tool_provided_data = True
                source_data_length += len(output_text)

        # -- uncertainty_acknowledged --
        # Same markers as Atlas's LangChain adapter, covering:
        # data absence, grounding qualification, data staleness
        uncertainty_markers = [
            # Data absence
            "couldn't find", "could not find",
            "unable to find", "unable to retrieve",
            "no results", "no relevant results",
            "wasn't able", "was not able",
            "don't have access", "do not have access",
            "can't get", "cannot get",
            # Grounding qualification
            "based on general", "based on historical",
            "based on typical", "based on common",
            "i don't have", "i do not have",
            # Data staleness
            "may not accurately reflect",
            "data is outdated", "outdated", "not current",
            "approximately", "estimated",
            "rough estimate", "general estimate",
            "as of the latest available",
        ]
        uncertainty_acknowledged = (
            any(m in response.lower() for m in uncertainty_markers)
            if response else False
        )

        # -- expansion_ratio --
        response_length = len(response)
        if source_data_length > 0:
            expansion_ratio = round(response_length / source_data_length, 2)
        else:
            expansion_ratio = 0.0 if response_length == 0 else float("inf")

        return {
            "tool_provided_data": tool_provided_data,
            "uncertainty_acknowledged": uncertainty_acknowledged,
            "response_length": response_length,
            "source_data_length": source_data_length,
            "expansion_ratio": expansion_ratio,
        }

    # -----------------------------------------------------------------------
    # Shared Tier 2 heuristics
    # -----------------------------------------------------------------------

    @staticmethod
    def _estimate_ambiguity(query: str) -> float:
        """
        Tier 2 heuristic: estimate how ambiguous a user query is.
        Identical to Atlas's LangChain adapter implementation.

        Scale: 0.0 (perfectly clear) to 1.0 (highly ambiguous)
        Baseline: 0.3 (assumes some inherent ambiguity in natural language)
        """
        if not query:
            return 0.5

        score = 0.3
        words = query.split()

        # Short queries are more ambiguous
        if len(words) <= 3:
            score += 0.2
        elif len(words) <= 6:
            score += 0.1

        # Pronouns without clear referent
        ambiguous_pronouns = {"it", "that", "this", "they", "them"}
        if any(w.lower() in ambiguous_pronouns for w in words):
            score += 0.15

        # Hedging / multiple possible intents
        if any(w.lower() in {"or", "maybe", "either", "perhaps"} for w in words):
            score += 0.15

        return min(1.0, round(score, 2))

    @staticmethod
    def _estimate_alignment(query: str, response: str) -> float:
        """
        Tier 2 heuristic: estimate how well the response addresses the query.
        Identical to Atlas's LangChain adapter implementation.

        Scale: 0.0 (completely misaligned) to 1.0 (perfectly aligned)
        Method: word overlap with topic-pivot and negation penalties.
        """
        if not query or not response:
            return 0.5

        query_words = set(query.lower().split())
        response_words = set(response.lower().split())

        if not query_words:
            return 0.5

        # Base: what fraction of query words appear in the response?
        overlap = len(query_words & response_words) / len(query_words)

        # Topic pivot penalty: response talks about a different entity
        topic_pairs = [
            ({"flight", "flights", "fly", "flying", "airline"},
             {"hotel", "hotels", "inn", "lodge", "suites", "accommodation"}),
            ({"buy", "purchase", "order"},
             {"rent", "lease", "subscribe"}),
            ({"cancel", "cancellation"},
             {"book", "booking", "reserve"}),
        ]
        for query_topics, response_topics in topic_pairs:
            query_has = bool(query_topics & query_words)
            response_has = bool(response_topics & response_words)
            query_addressed = bool(query_topics & response_words)
            if query_has and response_has and not query_addressed:
                overlap *= 0.2

        # Negation penalty: response indicates failure
        negation_markers = [
            "couldn't find", "no flights", "unfortunately",
            "unable to find", "no results", "not available",
        ]
        if any(m in response.lower() for m in negation_markers):
            overlap *= 0.5

        return round(min(1.0, overlap), 2)

    # -----------------------------------------------------------------------
    # Enhanced metadata (extends base class)
    # -----------------------------------------------------------------------

    def build_with_metadata(self, raw_log: dict) -> dict:
        """
        Build telemetry with table.that-specific metadata.

        Extends the base class to include our trace_id (for correlation)
        and configuration details that aren't part of the telemetry schema
        but are useful for debugging.
        """
        result = super().build_with_metadata(raw_log)
        result["metadata"].update({
            "trace_id": raw_log.get("trace_id", ""),
            "model": raw_log.get("model", ""),
            "total_iterations": raw_log.get("total_iterations", 0),
            "outcome": raw_log.get("outcome", ""),
            "total_duration_ms": raw_log.get("total_duration_ms", 0),
        })
        return result


# ---------------------------------------------------------------------------
# CLI — for testing against exported traces
# ---------------------------------------------------------------------------

def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]

    if not args:
        print("Usage: python -m adapters.atlas_adapter trace.json [--with-metadata]")
        print()
        print("  trace.json    An AgentTrace dict (from message.extras['trace'])")
        print("  --with-metadata  Include source metadata in output")
        sys.exit(1)

    with open(args[0], encoding="utf-8") as f:
        raw_log = json.load(f)

    adapter = TableThatAdapter()

    if "--with-metadata" in sys.argv:
        result = adapter.build_with_metadata(raw_log)
    else:
        result = adapter.build_matcher_input(raw_log)

    print(json.dumps(result, indent=2, default=str))


if __name__ == "__main__":
    main()
