"""
Compute Tool

Standalone tool for evaluating formulas. Safe eval with Haiku fallback.
Also used by the computation strategy via _compute_core.
"""

import logging
import os
import re
from typing import Any, AsyncGenerator, Dict, Optional

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, register_tool

logger = logging.getLogger(__name__)

# Safe math operations for simple formula eval
_SAFE_NAMES = {
    "abs": abs, "round": round, "min": min, "max": max,
    "int": int, "float": float, "str": str, "len": len,
    "True": True, "False": False, "None": None,
}


def _try_safe_eval(formula: str, row_data: Dict[str, Any]) -> Optional[str]:
    """
    Try to evaluate a simple formula safely.
    Substitutes {Key} placeholders from row_data, then evals.
    Returns the result as a string, or None if it can't be safely evaluated.
    """
    resolved = formula
    for key, val in row_data.items():
        placeholder = "{" + key + "}"
        if placeholder in resolved:
            try:
                num_val = float(val) if val is not None else 0
                resolved = resolved.replace(placeholder, str(num_val))
            except (ValueError, TypeError):
                resolved = resolved.replace(placeholder, repr(str(val) if val is not None else ""))

    # Check for unresolved placeholders
    if re.search(r'\{[^}]+\}', resolved):
        return None

    # Only allow safe characters
    if not re.match(r'^[\d\s\+\-\*/\(\)\.,<>=!a-zA-Z_\"\']+$', resolved):
        return None

    try:
        result = eval(resolved, {"__builtins__": {}}, _SAFE_NAMES)
        return str(result)
    except Exception:
        return None


async def _compute_core(
    formula: str,
    row_data: Dict[str, Any],
    cancellation_token=None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Core computation as an async generator.

    Phase 1: safe eval. Phase 2: Haiku fallback.

    Yields step dicts:
      {"action": "compute", "detail": "...", "formula": "...", "result": "..."}
      {"action": "error", "detail": "..."}
      {"action": "answer", "text": str | None}  — always last
    """
    if cancellation_token and cancellation_token.is_cancelled:
        yield {"action": "error", "detail": "Cancelled by user"}
        yield {"action": "answer", "text": None}
        return

    # Phase 1: safe eval
    result = _try_safe_eval(formula, row_data)
    if result is not None:
        yield {
            "action": "compute",
            "detail": f"{formula} = {result}",
            "formula": formula,
            "result": result,
        }
        yield {"action": "answer", "text": result}
        return

    # Phase 2: Haiku fallback
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    row_context = "\n".join(f"- {k}: {v}" for k, v in row_data.items() if v is not None)

    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=256,
            system=(
                "You are a computation assistant. Evaluate the formula given the data. "
                "Return ONLY the computed result — no explanation, no preamble."
            ),
            messages=[{
                "role": "user",
                "content": (
                    f"Formula: {formula}\n\n"
                    f"Data:\n{row_context}\n\n"
                    "Compute the result."
                ) if row_context else (
                    f"Formula: {formula}\n\n"
                    "Compute the result."
                ),
            }],
        )
        text_blocks = [b for b in response.content if b.type == "text"]
        if text_blocks:
            from tools.builtin.strategies.coerce import strip_preamble
            text = strip_preamble(text_blocks[0].text)
            yield {
                "action": "compute",
                "detail": f"{formula} = {text}" if text else formula,
                "formula": formula,
                "result": text,
            }
            yield {"action": "answer", "text": text or None}
            return
    except Exception as e:
        logger.warning(f"compute: LLM compute failed: {e}")
        yield {"action": "error", "detail": f"Computation failed: {e}"}

    yield {"action": "answer", "text": None}


async def execute_compute_value(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Standalone tool executor: evaluate a formula with data substitution."""
    formula = params.get("formula", "").strip()
    if not formula:
        return "Error: formula is required."

    data = params.get("data", {})
    cancel_token = context.get("_cancellation_token")

    answer = None
    async for step in _compute_core(formula, data, cancellation_token=cancel_token):
        if step["action"] == "answer":
            answer = step.get("text")

    return answer or "Error: Could not compute result."


register_tool(ToolConfig(
    name="compute_value",
    description=(
        "Evaluate a formula or expression. Supports basic math with {Key} placeholders "
        "for value substitution. Use this for one-off calculations like '15 * 23' or "
        "'{Price} * {Quantity}'. Falls back to AI for complex expressions."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "formula": {
                "type": "string",
                "description": "Formula to evaluate. Use {Key} placeholders for data substitution, e.g. '{Price} * {Quantity}' or '15 * 23'",
            },
            "data": {
                "type": "object",
                "description": "Key-value pairs for placeholder substitution, e.g. {\"Price\": 10, \"Quantity\": 5}",
            },
        },
        "required": ["formula"],
    },
    executor=execute_compute_value,
    category="compute",
    is_global=True,
    streaming=False,
))
