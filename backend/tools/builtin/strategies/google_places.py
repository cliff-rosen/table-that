"""
Google Places Strategy

Thin wrapper around _google_places_core. Interpolates query/location templates,
delegates to the core lookup, and translates step dicts to RowSteps.
"""

import logging
from typing import Any, AsyncGenerator, Dict, Optional

from tools.builtin.strategies.base import RowStep, RowStrategy
from tools.builtin.strategies import register_strategy

logger = logging.getLogger(__name__)


class GooglePlacesStrategy(RowStrategy):
    name = "google_places"
    display_name = "Google Places"
    max_steps = 1

    def validate_params(self, params: Dict[str, Any]) -> Optional[str]:
        if not params.get("query"):
            return "google_places requires 'query' in params (e.g. '{Business Name}')"
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
        from tools.builtin.google_places import _google_places_core

        query = self.interpolate_template(params["query"], row_data)
        location = params.get("location", "")
        if location:
            location = self.interpolate_template(location, row_data)

        async for step in _google_places_core(query, location or None):
            action = step["action"]

            if action == "search":
                yield RowStep(type="search", detail=step.get("query", ""))
            elif action == "error":
                yield RowStep(type="error", detail=step.get("detail", ""))
            elif action == "answer":
                outcome = step.get("outcome", "not_found")
                value = step.get("value")
                yield RowStep(
                    type="answer",
                    detail=value or "",
                    data={
                        "outcome": outcome,
                        "value": value,
                        "matched_name": step.get("matched_name"),
                        "explanation": step.get("explanation"),
                    },
                )


register_strategy(GooglePlacesStrategy())
