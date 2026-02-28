"""
Strategy Base Classes

Defines the ABC for row strategies and the shared data types
(RowStep, EnrichmentResult) that strategies produce.

Strategies come in two kinds:
  - "enrichment": produces a cell value (enrich_column)
  - "action": performs a side effect per row (act_on_rows — future)
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, List, Optional
import re


@dataclass
class RowStep:
    """A single step in the strategy trace (shown in the research log UI)."""

    type: str  # Strategy-specific: search, fetch, extract, compute, answer, error, etc.
    detail: str  # Human-readable description
    data: Optional[Dict[str, Any]] = None  # Structured data for UI rendering


# Backwards-compat alias
EnrichmentStep = RowStep


@dataclass
class EnrichmentResult:
    """Final result of enriching a single row."""

    value: Optional[str]  # Enriched value (None = not found)
    confidence: str = "high"  # "high" | "medium" | "low" | "none"
    steps: List[RowStep] = field(default_factory=list)
    raw_value: Optional[str] = None  # Pre-coercion value (set by orchestrator)


class RowStrategy(ABC):
    """
    Base class for all per-row strategies.

    kind = "enrichment" — produces a cell value (used by enrich_column)
    kind = "action"     — performs a side effect (used by act_on_rows, future)
    """

    name: str  # Registry key: "lookup", "research", "computation", etc.
    display_name: str  # UI label: "Quick Lookup", "Extraction", etc.
    kind: str = "enrichment"  # "enrichment" or "action"
    max_steps: int = 2  # Default max inner steps

    @abstractmethod
    def validate_params(self, params: Dict[str, Any]) -> Optional[str]:
        """
        Validate strategy-specific params.
        Returns an error message string if invalid, None if valid.
        """
        ...

    @abstractmethod
    async def execute_one(
        self,
        row_data: Dict[str, Any],
        params: Dict[str, Any],
        columns: list,
        db: Any,
        user_id: int,
        cancel_token: Any = None,
    ) -> AsyncGenerator[RowStep, None]:
        """
        Process a single row. Yields RowStep items as work progresses.
        The LAST yielded step with type="answer" contains the final value/status.
        """
        ...
        yield  # type: ignore  # Make this a generator

    def interpolate_template(self, template: str, row_data: Dict[str, Any]) -> str:
        """
        Replace {Column Name} placeholders with actual row values.
        Unresolved placeholders are left as-is.
        """

        def replacer(match: re.Match) -> str:
            col_name = match.group(1)
            # Try exact match first, then case-insensitive
            if col_name in row_data:
                return str(row_data[col_name])
            for key, val in row_data.items():
                if key.lower() == col_name.lower():
                    return str(val)
            return match.group(0)  # Leave unresolved

        return re.sub(r"\{([^}]+)\}", replacer, template)
