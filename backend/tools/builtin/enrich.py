"""
Enrich Rows Tool

Streaming agentic tool that loops through table rows, performing web research
per row to fill in a target column. Results are presented as a DATA_PROPOSAL.
"""

import json
import logging
import os
from typing import Any, AsyncGenerator, Dict, List, Optional, Union

import anthropic
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import TableDefinition, TableRow
from tools.registry import ToolConfig, ToolProgress, ToolResult, register_tool

logger = logging.getLogger(__name__)

# Reuse web tool executors for inner tool calls
from tools.builtin.web import execute_search_web, execute_fetch_webpage


def _get_table_id(context: Dict[str, Any]) -> int | None:
    return context.get("table_id")


def _resolve_column_id(columns: list, name_or_id: str) -> str | None:
    for col in columns:
        if col["id"] == name_or_id:
            return col["id"]
        if col["name"].lower() == name_or_id.lower():
            return col["id"]
    return None


def _resolve_column_name(columns: list, name_or_id: str) -> str | None:
    for col in columns:
        if col["id"] == name_or_id:
            return col["name"]
        if col["name"].lower() == name_or_id.lower():
            return col["name"]
    return None


async def _get_table_for_user(db: AsyncSession, table_id: int, user_id: int) -> TableDefinition | None:
    result = await db.execute(
        select(TableDefinition).where(
            TableDefinition.id == table_id,
            TableDefinition.user_id == user_id,
        )
    )
    return result.scalars().first()


def _row_display(row: TableRow, columns: list) -> str:
    """Format row data using column names."""
    display = {}
    for col in columns:
        val = row.data.get(col["id"])
        if val is not None:
            display[col["name"]] = val
    return json.dumps(display, default=str)


def _row_label(row: TableRow, columns: list) -> str:
    """Get a short label for a row (first non-empty text value)."""
    for col in columns:
        if col.get("type") in ("text", "select"):
            val = row.data.get(col["id"])
            if val:
                s = str(val)
                return s[:40] + "..." if len(s) > 40 else s
    return f"Row #{row.id}"


# Mini tool definitions for inner LLM call
_INNER_TOOLS = [
    {
        "name": "search_web",
        "description": "Search the web. Returns titles, URLs, and snippets.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "num_results": {"type": "integer", "description": "1-10, default 5"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_webpage",
        "description": "Fetch a webpage and extract its text content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch"},
            },
            "required": ["url"],
        },
    },
]


async def _enrich_single_row(
    row: TableRow,
    columns: list,
    target_column_name: str,
    instructions: str,
    db: AsyncSession,
    user_id: int,
) -> Optional[str]:
    """
    Run a single LLM turn with tool access to research a value for one row.
    Returns the extracted value or None.
    """
    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    row_data = _row_display(row, columns)

    prompt = (
        f"Row data: {row_data}\n\n"
        f"Task: {instructions}\n\n"
        f"Find the value for the '{target_column_name}' column. "
        f"Use search_web and fetch_webpage tools as needed. "
        f"After researching, respond with ONLY the value — no explanation, no quotes, just the raw value. "
        f"If you cannot determine the value, respond with exactly: N/A"
    )

    messages = [{"role": "user", "content": prompt}]

    # Allow up to 3 LLM turns (initial + 2 tool-use rounds)
    for _turn in range(3):
        try:
            response = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=messages,
                tools=_INNER_TOOLS,
                system="You are a research assistant. Your job is to find a specific piece of information for a data table row. Be concise.",
            )
        except Exception as e:
            logger.warning(f"Inner LLM call failed for row #{row.id}: {e}")
            return None

        # Check for tool use
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        if not tool_uses:
            # Extract text response
            for block in response.content:
                if block.type == "text":
                    text = block.text.strip()
                    if text and text.upper() != "N/A":
                        return text
            return None

        # Execute tool calls and continue the conversation
        messages.append({"role": "assistant", "content": response.content})

        tool_results: List[Dict[str, Any]] = []
        for tool_use in tool_uses:
            context_stub: Dict[str, Any] = {}
            if tool_use.name == "search_web":
                result_text = await execute_search_web(tool_use.input, db, user_id, context_stub)
            elif tool_use.name == "fetch_webpage":
                result_text = await execute_fetch_webpage(tool_use.input, db, user_id, context_stub)
            else:
                result_text = f"Unknown tool: {tool_use.name}"

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result_text,
            })

        messages.append({"role": "user", "content": tool_results})

    # If we exhausted turns, return None
    return None


# =============================================================================
# enrich_rows — Streaming async generator
# =============================================================================

async def execute_enrich_rows(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
    """Enrich table rows by researching each one via web search."""
    table_id = _get_table_id(context)
    if not table_id:
        yield ToolResult(text="Error: No table context available.")
        return

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        yield ToolResult(text="Error: Table not found or access denied.")
        return

    target_column = params.get("target_column", "").strip()
    instructions = params.get("instructions", "").strip()
    filter_conditions = params.get("filter", {})
    only_empty = params.get("only_empty", True)
    limit = min(max(params.get("limit", 25), 1), 50)

    if not target_column:
        yield ToolResult(text="Error: target_column is required.")
        return
    if not instructions:
        yield ToolResult(text="Error: instructions are required.")
        return

    # Resolve target column
    target_col_id = _resolve_column_id(table.columns, target_column)
    target_col_name = _resolve_column_name(table.columns, target_column)
    if not target_col_id or not target_col_name:
        available = ", ".join(c["name"] for c in table.columns)
        yield ToolResult(text=f"Error: Unknown column '{target_column}'. Available: {available}")
        return

    # Fetch rows
    yield ToolProgress(stage="setup", message="Finding rows to enrich...", progress=0.0)

    stmt = (
        select(TableRow)
        .where(TableRow.table_id == table_id)
        .order_by(TableRow.id)
        .limit(500)  # Fetch up to 500, then filter
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    # Apply column-value filters
    if filter_conditions:
        col_filters = {}
        for key, val in filter_conditions.items():
            col_id = _resolve_column_id(table.columns, key)
            if col_id:
                col_filters[col_id] = val
            else:
                available = ", ".join(c["name"] for c in table.columns)
                yield ToolResult(text=f"Error: Unknown filter column '{key}'. Available: {available}")
                return

        filtered = []
        for row in rows:
            match = True
            for col_id, expected in col_filters.items():
                actual = row.data.get(col_id)
                if str(actual).lower() != str(expected).lower():
                    match = False
                    break
            if match:
                filtered.append(row)
        rows = filtered

    # Filter to only_empty rows if requested
    if only_empty:
        rows = [r for r in rows if not r.data.get(target_col_id)]

    # Apply limit
    rows = rows[:limit]

    if not rows:
        yield ToolResult(text=f"No rows to enrich. All rows already have a value for '{target_col_name}' or no rows match the filter.")
        return

    yield ToolProgress(
        stage="enriching",
        message=f"Enriching {len(rows)} rows...",
        progress=0.0,
        data={"total": len(rows)},
    )

    # Process each row
    results: List[Dict[str, Any]] = []
    for i, row in enumerate(rows):
        label = _row_label(row, table.columns)
        yield ToolProgress(
            stage="enriching",
            message=f"Processing row {i + 1}/{len(rows)}: {label}",
            progress=i / len(rows),
            data={"row_id": row.id, "row_index": i, "total": len(rows)},
        )

        value = await _enrich_single_row(
            row, table.columns, target_col_name, instructions, db, user_id
        )
        results.append({"row_id": row.id, "value": value})

    # Build DATA_PROPOSAL operations
    operations = []
    for r in results:
        if r["value"] is not None:
            operations.append({
                "action": "update",
                "row_id": r["row_id"],
                "changes": {target_col_name: r["value"]},
            })

    yield ToolProgress(
        stage="complete",
        message=f"Enriched {len(operations)} of {len(rows)} rows",
        progress=1.0,
    )

    if not operations:
        yield ToolResult(text=f"Could not find values for any of the {len(rows)} rows.")
        return

    yield ToolResult(
        text=f"Enriched {len(operations)} of {len(rows)} rows for '{target_col_name}'. Presenting DATA_PROPOSAL for review.",
        payload={
            "type": "data_proposal",
            "data": {
                "reasoning": f"Web research: {instructions} (enriched {len(operations)} rows)",
                "operations": operations,
            },
        },
    )


register_tool(ToolConfig(
    name="enrich_rows",
    description=(
        "Enrich table data by researching each row using web search. "
        "For each matching row, performs web searches based on the row's data "
        "and fills in a target column. Results are presented as a DATA_PROPOSAL for user review. "
        "Use this when the user asks to look up information for each row (e.g., 'find the website for each company')."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "target_column": {
                "type": "string",
                "description": "Column name to fill with researched values",
            },
            "instructions": {
                "type": "string",
                "description": "How to research/compute the value (e.g., 'search for the company website URL')",
            },
            "filter": {
                "type": "object",
                "description": "Column name:value pairs to select which rows to process (optional, omit for all rows)",
            },
            "only_empty": {
                "type": "boolean",
                "description": "Only process rows where the target column is empty (default: true)",
            },
            "limit": {
                "type": "integer",
                "description": "Max rows to process (default 25, max 50)",
            },
        },
        "required": ["target_column", "instructions"],
    },
    executor=execute_enrich_rows,
    streaming=True,
    category="table_data",
    payload_type="data_proposal",
))
