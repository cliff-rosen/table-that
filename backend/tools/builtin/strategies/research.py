"""
Research Strategy

Wraps the existing _research_web_core multi-step search agent.
This is the most thorough strategy — multi-turn search+fetch+synthesis.

The key distinction: research is BEST-EFFORT SYNTHESIS. Whatever information
is found, the strategy should synthesize a useful answer. It should almost
never return "not found" — instead it evaluates how well the gathered
information meets the criteria of what was asked.

Supports two thoroughness levels:
  - "exploratory" (default): Reasonable sampling. Good for summaries, descriptions.
  - "comprehensive": Exhaustive multi-angle search with coverage assessment.
"""

import logging
import os
from typing import Any, AsyncGenerator, Dict, Optional

import anthropic

from tools.builtin.strategies.base import RowStep, RowStrategy
from tools.builtin.strategies import register_strategy

logger = logging.getLogger(__name__)

_VALID_THOROUGHNESS = ("exploratory", "comprehensive")


class ResearchStrategy(RowStrategy):
    name = "research"
    display_name = "Research"
    max_steps = 5

    def validate_params(self, params: Dict[str, Any]) -> Optional[str]:
        if not params.get("question"):
            return "research requires 'question' in params"
        thoroughness = params.get("thoroughness")
        if thoroughness and thoroughness not in _VALID_THOROUGHNESS:
            return f"thoroughness must be one of {_VALID_THOROUGHNESS}, got '{thoroughness}'"
        return None

    async def execute_one(
        self,
        row_data: Dict[str, Any],
        params: Dict[str, Any],
        columns: list,
        db: Any,
        user_id: int,
        cancel_token: Any = None,
    ) -> AsyncGenerator[RowStep, None]:
        from tools.builtin.web import _research_web_core
        from services.chat_service import ChatService

        thoroughness = params.get("thoroughness", "exploratory")

        # Build query from template + row data
        question = params.get("question", "")
        query = self.interpolate_template(question, row_data)

        # Add row context for richer results
        row_context_parts = []
        for key, val in row_data.items():
            if val is not None and str(val).strip():
                row_context_parts.append(f"{key}: {val}")
        row_context = ", ".join(row_context_parts)

        if thoroughness == "comprehensive":
            built_query = (
                f"Given: {row_context}. {query}\n\n"
                "IMPORTANT: Your goal is COMPLETE COVERAGE. Find ALL relevant items, not just the first few. "
                "Search from multiple angles and cross-reference sources. "
                "Synthesize everything you find into a comprehensive answer. "
                "If coverage may be incomplete, note it briefly at the end. "
                "Your output goes directly into a spreadsheet cell, so return ONLY the answer value. "
                "No preamble, no explanation."
            )
        else:
            built_query = (
                f"Given: {row_context}. {query}\n\n"
                "IMPORTANT: Always provide an answer based on what you find. "
                "Synthesize whatever information is available into a useful response. "
                "Even partial information is valuable — summarize what you found. "
                "Your output goes directly into a spreadsheet cell, so return ONLY the answer value. "
                "No preamble, no explanation."
            )

        # Get max research steps from config
        chat_service = ChatService(db)
        max_research_steps = await chat_service.get_max_research_steps()

        # Adjust step budget based on thoroughness
        if thoroughness == "comprehensive":
            max_research_steps = min(max(max_research_steps, 8), 15)
        # Exploratory uses config value as-is

        answer_value = None
        search_count = 0
        fetch_count = 0

        try:
            async for step in _research_web_core(
                built_query, max_research_steps, db, user_id,
                cancellation_token=cancel_token, thoroughness=thoroughness,
            ):
                action = step["action"]

                if action == "search":
                    search_count += 1
                    yield RowStep(
                        type="search",
                        detail=step.get("query", ""),
                        data={"detail": step.get("detail", "")},
                    )
                elif action == "fetch":
                    fetch_count += 1
                    yield RowStep(
                        type="fetch",
                        detail=step.get("url", ""),
                        data={"detail": step.get("detail", "")},
                    )
                elif action == "thinking":
                    yield RowStep(
                        type="thinking",
                        detail=step.get("text", ""),
                    )
                elif action == "error":
                    yield RowStep(
                        type="error",
                        detail=step.get("detail", "Unknown error"),
                    )
                elif action == "answer":
                    answer_value = step.get("text")
                    yield RowStep(
                        type="answer",
                        detail=answer_value or "",
                        data={"value": answer_value},
                    )

        except Exception as e:
            logger.error(f"research: crashed: {e}", exc_info=True)
            yield RowStep(type="error", detail=f"Research crashed: {e}")
            yield RowStep(type="answer", detail="", data={"value": None})
            return

        # Coverage assessment step (comprehensive only)
        if thoroughness == "comprehensive" and answer_value:
            try:
                client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
                coverage_resp = await client.messages.create(
                    model="claude-haiku-4-5-20251001",
                    max_tokens=256,
                    messages=[{
                        "role": "user",
                        "content": (
                            f"Question: {query}\n"
                            f"Answer produced: {answer_value[:500]}\n"
                            f"Research stats: {search_count} searches, {fetch_count} pages fetched\n\n"
                            "Rate the coverage of this answer: high, medium, or low. "
                            "In one sentence, note what might be missing. "
                            "Format: LEVEL: explanation"
                        ),
                    }],
                )
                coverage_text = coverage_resp.content[0].text.strip() if coverage_resp.content else ""
                # Parse level from response
                level = "medium"
                lower = coverage_text.lower()
                if lower.startswith("high"):
                    level = "high"
                elif lower.startswith("low"):
                    level = "low"
                yield RowStep(
                    type="coverage",
                    detail=coverage_text,
                    data={"level": level},
                )
            except Exception as e:
                logger.warning(f"research: coverage assessment failed: {e}")
                # Non-fatal — just skip the coverage step


register_strategy(ResearchStrategy())
