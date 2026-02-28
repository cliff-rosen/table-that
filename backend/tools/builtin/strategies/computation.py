"""
Computation Strategy

Thin wrapper around _compute_core. Interpolates the formula template,
delegates to the core compute function, and translates step dicts to RowSteps.
"""

import logging
from typing import Any, AsyncGenerator, Dict, Optional

from tools.builtin.strategies.base import RowStep, RowStrategy
from tools.builtin.strategies import register_strategy

logger = logging.getLogger(__name__)


class ComputationStrategy(RowStrategy):
    name = "computation"
    display_name = "Computation"
    max_steps = 1

    def validate_params(self, params: Dict[str, Any]) -> Optional[str]:
        if not params.get("formula"):
            return "computation requires 'formula' in params"
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
        from tools.builtin.compute import _compute_core

        # Interpolate {Column Name} placeholders first, then pass to core
        # with empty row_data since values are already resolved
        resolved_formula = self.interpolate_template(params["formula"], row_data)

        async for step in _compute_core(
            resolved_formula, {}, cancellation_token=cancel_token,
        ):
            action = step["action"]

            if action == "compute":
                yield RowStep(
                    type="compute",
                    detail=step.get("detail", ""),
                    data={
                        "formula": step.get("formula", ""),
                        "result": step.get("result", ""),
                    },
                )
            elif action == "error":
                yield RowStep(type="error", detail=step.get("detail", "Unknown error"))
            elif action == "answer":
                value = step.get("text")
                yield RowStep(
                    type="answer",
                    detail=value or "",
                    data={"value": value},
                )


register_strategy(ComputationStrategy())
