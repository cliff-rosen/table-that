"""
Lookup Strategy

Thin wrapper around _lookup_web_core. Interpolates the question template,
delegates to the core lookup loop, and translates step dicts to RowSteps.
"""

import logging
from typing import Any, AsyncGenerator, Dict, Optional

from tools.builtin.strategies.base import RowStep, RowStrategy
from tools.builtin.strategies import register_strategy

logger = logging.getLogger(__name__)


class LookupStrategy(RowStrategy):
    name = "lookup"
    display_name = "Lookup"
    max_steps = 2

    def validate_params(self, params: Dict[str, Any]) -> Optional[str]:
        if not params.get("question"):
            return "lookup requires 'question' in params"
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
        from tools.builtin.web import _lookup_web_core

        question = self.interpolate_template(params["question"], row_data)

        async for step in _lookup_web_core(
            question, self.max_steps, db, user_id, cancellation_token=cancel_token,
        ):
            action = step["action"]

            if action == "search":
                yield RowStep(
                    type="search",
                    detail=step.get("query", ""),
                    data={"detail": step.get("detail", "")},
                )
            elif action == "thinking":
                yield RowStep(type="thinking", detail=step.get("text", ""))
            elif action == "error":
                yield RowStep(type="error", detail=step.get("detail", "Unknown error"))
            elif action == "answer":
                value = step.get("text")
                yield RowStep(
                    type="answer",
                    detail=value or "",
                    data={"value": value},
                )


register_strategy(LookupStrategy())
