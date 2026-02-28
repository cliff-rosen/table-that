"""
Value Coercion Layer

Centralizes preamble stripping and type-aware value coercion.
Called by the orchestrator after each strategy returns.
"""

import logging
import re
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# ── Preamble patterns (merged from table_data.py and web.py) ─────────────

_PREAMBLE_PATTERNS = [
    re.compile(r"^(?:Based on (?:my |the )?(?:research|search|findings|results)[\s,]*)", re.IGNORECASE),
    re.compile(r"^(?:According to (?:the |their |my )?\w*[\s,]*)", re.IGNORECASE),
    re.compile(r"^(?:After (?:searching|researching|looking)[^,]*,\s*)", re.IGNORECASE),
    re.compile(r"^(?:I found that\s+)", re.IGNORECASE),
    re.compile(r"^(?:The (?:official )?(?:website|URL|link|homepage|address|answer|result|value) (?:for .+? )?is:?\s+)", re.IGNORECASE),
    re.compile(r"^(?:(?:It|This) (?:appears|seems|looks like) (?:that |to be )?\s*)", re.IGNORECASE),
    re.compile(r"^(?:(?:I )?need to (?:fetch|search|look).+?[:\.]\s*)", re.IGNORECASE | re.DOTALL),
    re.compile(r"^(?:let me .+?[:\.]\s*)", re.IGNORECASE | re.DOTALL),
    re.compile(r"^(?:the (?:answer|result|latest|information) (?:is|was|to .+? is) )", re.IGNORECASE),
]

# ── Not-found sentinels ──────────────────────────────────────────────────

_NOT_FOUND_SENTINELS = {
    "n/a",
    "na",
    "not available",
    "not found",
    "not applicable",
    "could not determine",
    "could not determine an answer",
    "could not determine an answer.",
    "unknown",
    "none",
    "no data",
    "no result",
    "no answer",
    "",
}


def strip_preamble(text: str) -> str:
    """Remove common LLM preamble phrases so the answer is a clean value."""
    result = text.strip()
    for pattern in _PREAMBLE_PATTERNS:
        new_result = pattern.sub("", result).strip()
        if new_result != result:
            logger.debug(
                f"strip_preamble: removed preamble, "
                f"before={result[:80]!r}, after={new_result[:80]!r}"
            )
            result = new_result
    # Strip wrapping quotes if the entire value is quoted
    if len(result) >= 2 and result[0] == result[-1] and result[0] in ('"', "'"):
        result = result[1:-1].strip()
    return result


def is_not_found(value: Optional[str]) -> bool:
    """Check if a value is a not-found sentinel."""
    if not value:
        return True
    return value.strip().lower().rstrip(".") in _NOT_FOUND_SENTINELS


def coerce_value(
    value: str,
    column_type: str = "text",
    column_options: Optional[list] = None,
) -> Tuple[str, str]:
    """
    Coerce a raw enrichment value to a clean cell value.

    Returns (coerced_value, confidence) where confidence is
    "high", "medium", "low", or "none".
    """
    # Step 1: Strip preambles
    cleaned = strip_preamble(value)

    # Step 2: Check not-found
    if is_not_found(cleaned):
        return ("", "none")

    # Step 3: Type-specific coercion
    confidence = "high"

    if column_type == "number":
        cleaned, confidence = _coerce_number(cleaned)
    elif column_type == "boolean":
        cleaned, confidence = _coerce_boolean(cleaned)
    elif column_type == "select" and column_options:
        cleaned, confidence = _coerce_select(cleaned, column_options)
    elif column_type == "text":
        # Cap length
        if len(cleaned) > 2000:
            cleaned = cleaned[:2000]
            confidence = "medium"

    return (cleaned, confidence)


def _coerce_number(value: str) -> Tuple[str, str]:
    """Coerce a value to a number string."""
    # Strip currency symbols, commas, units
    stripped = re.sub(r'[£€$¥₹]', '', value).strip()
    stripped = stripped.replace(',', '')
    # Try to extract a number
    match = re.search(r'-?\d+(?:\.\d+)?', stripped)
    if match:
        num_str = match.group(0)
        # If we had to strip a lot, lower confidence
        confidence = "high" if stripped == num_str else "medium"
        return (num_str, confidence)
    return (value, "low")


def _coerce_boolean(value: str) -> Tuple[str, str]:
    """Coerce a value to boolean."""
    lower = value.strip().lower()
    if lower in ("yes", "true", "1", "y"):
        return ("true", "high")
    if lower in ("no", "false", "0", "n"):
        return ("false", "high")
    return (value, "low")


def _coerce_select(value: str, options: list) -> Tuple[str, str]:
    """Coerce a value to match one of the select column options."""
    lower = value.strip().lower()
    # Exact match (case-insensitive)
    for opt in options:
        if opt.lower() == lower:
            return (opt, "high")
    # Partial/fuzzy match: check if any option is contained in the value or vice versa
    for opt in options:
        if opt.lower() in lower or lower in opt.lower():
            return (opt, "medium")
    return (value, "low")
