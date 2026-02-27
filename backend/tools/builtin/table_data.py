"""
Table Data Tools

Tools for the AI assistant to manipulate table data (create, update, delete, search rows).
Includes for_each_row — a streaming tool that iterates rows with web research.
"""

import json
import logging
import re
from typing import Any, AsyncGenerator, Dict, Union

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from tools.registry import ToolConfig, ToolProgress, ToolResult, register_tool
from models import TableDefinition, TableRow

logger = logging.getLogger(__name__)

# ── Limits ────────────────────────────────────────────────────────────────
MAX_ROWS_PER_TABLE = 100        # Hard cap on rows in any single table
MAX_ROWS_PER_FOR_EACH = 20      # Max row_ids accepted by the for_each_row tool


def _get_table_id(context: Dict[str, Any]) -> int | None:
    """Extract table_id from chat context."""
    return context.get("table_id")


def _resolve_column_id(columns: list, name_or_id: str) -> str | None:
    """Map a column name or ID to the column ID."""
    for col in columns:
        if col["id"] == name_or_id:
            return col["id"]
        if col["name"].lower() == name_or_id.lower():
            return col["id"]
    return None


async def _get_table_for_user(db: AsyncSession, table_id: int, user_id: int) -> TableDefinition | None:
    """Get a table definition, verifying ownership."""
    result = await db.execute(
        select(TableDefinition).where(
            TableDefinition.id == table_id,
            TableDefinition.user_id == user_id,
        )
    )
    return result.scalars().first()


# =============================================================================
# Tool Executors
# =============================================================================

async def execute_create_row(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Create a new row in the current table."""
    table_id = _get_table_id(context)
    if not table_id:
        return "Error: No table context available. The user must be viewing a table."

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    # Check row limit
    count_result = await db.execute(
        select(func.count(TableRow.id)).where(TableRow.table_id == table_id)
    )
    current_count = count_result.scalar() or 0
    if current_count >= MAX_ROWS_PER_TABLE:
        return f"Error: Table has reached the maximum of {MAX_ROWS_PER_TABLE} rows."

    values = params.get("values", {})
    if not values:
        return "Error: No values provided. Provide column_name: value pairs."

    # Map column names to IDs
    data = {}
    unmapped = []
    for key, value in values.items():
        col_id = _resolve_column_id(table.columns, key)
        if col_id:
            data[col_id] = value
        else:
            unmapped.append(key)

    if unmapped:
        available = ", ".join(c["name"] for c in table.columns)
        return f"Error: Unknown columns: {', '.join(unmapped)}. Available columns: {available}"

    row = TableRow(table_id=table_id, data=data)
    db.add(row)
    await db.commit()
    await db.refresh(row)

    # Format response
    display = {col["name"]: data.get(col["id"], "") for col in table.columns if col["id"] in data}
    return f"Created row #{row.id} with values: {json.dumps(display, default=str)}"


async def execute_update_row(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Update an existing row in the current table."""
    table_id = _get_table_id(context)
    if not table_id:
        return "Error: No table context available."

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    row_id = params.get("row_id")
    if not row_id:
        return "Error: row_id is required."

    values = params.get("values", {})
    if not values:
        return "Error: No values provided to update."

    # Get the row
    result = await db.execute(
        select(TableRow).where(TableRow.id == row_id, TableRow.table_id == table_id)
    )
    row = result.scalars().first()
    if not row:
        return f"Error: Row #{row_id} not found in this table."

    # Map names to IDs and merge
    current_data = dict(row.data) if row.data else {}
    unmapped = []
    for key, value in values.items():
        col_id = _resolve_column_id(table.columns, key)
        if col_id:
            current_data[col_id] = value
        else:
            unmapped.append(key)

    if unmapped:
        available = ", ".join(c["name"] for c in table.columns)
        return f"Error: Unknown columns: {', '.join(unmapped)}. Available columns: {available}"

    row.data = current_data
    await db.commit()

    return f"Updated row #{row_id} successfully."


async def execute_delete_row(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Delete a row from the current table."""
    table_id = _get_table_id(context)
    if not table_id:
        return "Error: No table context available."

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    row_id = params.get("row_id")
    if not row_id:
        return "Error: row_id is required."

    result = await db.execute(
        select(TableRow).where(TableRow.id == row_id, TableRow.table_id == table_id)
    )
    row = result.scalars().first()
    if not row:
        return f"Error: Row #{row_id} not found in this table."

    await db.delete(row)
    await db.commit()

    return f"Deleted row #{row_id}."


async def execute_search_rows(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Search across text columns in the current table."""
    table_id = _get_table_id(context)
    if not table_id:
        return "Error: No table context available."

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    query = params.get("query", "").strip()
    if not query:
        return "Error: Search query is required."

    limit = min(params.get("limit", 20), 50)

    # Find text/select columns
    text_cols = [c for c in table.columns if c.get("type") in ("text", "select")]
    if not text_cols:
        return "This table has no text columns to search."

    # Build search conditions
    from sqlalchemy import or_
    conditions = []
    for col in text_cols:
        conditions.append(
            func.json_extract(TableRow.data, f"$.{col['id']}").like(f"%{query}%")
        )

    stmt = (
        select(TableRow)
        .where(TableRow.table_id == table_id, or_(*conditions))
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    if not rows:
        return f"No rows found matching '{query}'."

    # Format results
    lines = [f"Found {len(rows)} row(s) matching '{query}':\n"]
    for row in rows:
        display = {}
        for col in table.columns:
            val = row.data.get(col["id"])
            if val is not None:
                display[col["name"]] = val
        lines.append(f"  Row #{row.id}: {json.dumps(display, default=str)}")

    return "\n".join(lines)


async def execute_describe_table(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Describe the current table's schema, stats, and value distributions."""
    table_id = _get_table_id(context)
    if not table_id:
        return "Error: No table context available."

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    # Get row count
    count_result = await db.execute(
        select(func.count(TableRow.id)).where(TableRow.table_id == table_id)
    )
    row_count = count_result.scalar() or 0

    lines = [
        f"Table: {table.name}",
        f"Description: {table.description or '(none)'}",
        f"Rows: {row_count}",
        f"Columns ({len(table.columns)}):",
    ]

    for col in table.columns:
        required = " (required)" if col.get("required") else ""
        col_type = col["type"]
        if col_type == "select" and col.get("options"):
            col_type += f" [{', '.join(col['options'])}]"
        lines.append(f"  - {col['name']} [id: {col['id']}] ({col_type}){required}")

    # Value distributions for select and boolean columns
    distributable = [c for c in table.columns if c.get("type") in ("select", "boolean")]
    if distributable and row_count > 0:
        # Fetch all rows to compute distributions
        all_rows_result = await db.execute(
            select(TableRow.data).where(TableRow.table_id == table_id)
        )
        all_data = [r[0] for r in all_rows_result.all()]

        lines.append(f"\nValue distributions:")
        for col in distributable:
            counts: Dict[str, int] = {}
            for row_data in all_data:
                val = row_data.get(col["id"]) if row_data else None
                if col["type"] == "boolean":
                    key = "Yes" if val else "No"
                else:
                    key = str(val) if val is not None else "(empty)"
                counts[key] = counts.get(key, 0) + 1
            dist_parts = [f"{k}: {v}" for k, v in sorted(counts.items(), key=lambda x: -x[1])]
            lines.append(f"  {col['name']}: {', '.join(dist_parts)}")

    return "\n".join(lines)


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
    name="create_row",
    description="Add a new record to the current table. Provide column values as name:value pairs.",
    input_schema={
        "type": "object",
        "properties": {
            "values": {
                "type": "object",
                "description": "Column name to value mapping, e.g. {\"Name\": \"John\", \"Age\": 30}"
            }
        },
        "required": ["values"]
    },
    executor=execute_create_row,
    category="table_data",
))

register_tool(ToolConfig(
    name="update_row",
    description="Update an existing record in the current table. Provide the row ID and the column values to change.",
    input_schema={
        "type": "object",
        "properties": {
            "row_id": {
                "type": "integer",
                "description": "The ID of the row to update"
            },
            "values": {
                "type": "object",
                "description": "Column name to new value mapping"
            }
        },
        "required": ["row_id", "values"]
    },
    executor=execute_update_row,
    category="table_data",
))

register_tool(ToolConfig(
    name="delete_row",
    description="Delete a record from the current table by its row ID.",
    input_schema={
        "type": "object",
        "properties": {
            "row_id": {
                "type": "integer",
                "description": "The ID of the row to delete"
            }
        },
        "required": ["row_id"]
    },
    executor=execute_delete_row,
    category="table_data",
))

register_tool(ToolConfig(
    name="search_rows",
    description="Search for records in the current table by matching text across all text columns.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search text to match against"
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of results to return (default: 20, max: 50)"
            }
        },
        "required": ["query"]
    },
    executor=execute_search_rows,
    category="table_data",
))

register_tool(ToolConfig(
    name="describe_table",
    description="Get a summary of the current table's schema, columns, and row count.",
    input_schema={
        "type": "object",
        "properties": {},
    },
    executor=execute_describe_table,
    category="table_data",
))


async def execute_get_rows(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Retrieve rows from the current table with offset/limit pagination."""
    table_id = _get_table_id(context)
    if not table_id:
        return "Error: No table context available."

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    offset = max(params.get("offset", 0), 0)
    limit = min(max(params.get("limit", 50), 1), 200)

    # Get total count
    count_result = await db.execute(
        select(func.count(TableRow.id)).where(TableRow.table_id == table_id)
    )
    total = count_result.scalar() or 0

    # Get rows
    stmt = (
        select(TableRow)
        .where(TableRow.table_id == table_id)
        .order_by(TableRow.id)
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.scalars().all()

    if not rows:
        if offset > 0:
            return f"No rows found at offset {offset}. Table has {total} total rows."
        return "The table is empty (0 rows)."

    # Format results
    lines = [f"Rows {offset + 1}-{offset + len(rows)} of {total} total:\n"]
    for row in rows:
        display = {}
        for col in table.columns:
            val = row.data.get(col["id"])
            if val is not None:
                display[col["name"]] = val
        lines.append(f"  Row #{row.id}: {json.dumps(display, default=str)}")

    if offset + len(rows) < total:
        lines.append(f"\n(More rows available. Use offset={offset + len(rows)} to continue.)")

    return "\n".join(lines)


register_tool(ToolConfig(
    name="get_rows",
    description="Retrieve rows from the current table with pagination. Use this to see data beyond the sample rows in context. Returns rows with their IDs and all column values.",
    input_schema={
        "type": "object",
        "properties": {
            "offset": {
                "type": "integer",
                "description": "Starting row index (0-based). Default: 0"
            },
            "limit": {
                "type": "integer",
                "description": "Number of rows to return (1-200). Default: 50"
            }
        },
    },
    executor=execute_get_rows,
    category="table_data",
))



# =============================================================================
# for_each_row — Streaming row iterator with web research
# =============================================================================

_PREAMBLE_PATTERNS = [
    re.compile(r"^(?:Based on (?:my |the )?research,?\s*)", re.IGNORECASE),
    re.compile(r"^(?:According to (?:the |their |my )?\w*[\s,]*)", re.IGNORECASE),
    re.compile(r"^(?:After (?:searching|researching|looking)[^,]*,\s*)", re.IGNORECASE),
    re.compile(r"^(?:I found that\s+)", re.IGNORECASE),
    re.compile(r"^(?:The (?:official )?(?:website|URL|link|homepage|address|answer|result|value) (?:for .+? )?is:?\s+)", re.IGNORECASE),
    re.compile(r"^(?:(?:It|This) (?:appears|seems|looks like) (?:that |to be )?\s*)", re.IGNORECASE),
]


def _strip_preamble(text: str) -> str:
    """Remove common LLM preambles so the answer is a clean value."""
    text = text.strip()
    for pat in _PREAMBLE_PATTERNS:
        text = pat.sub("", text)
    # Remove wrapping quotes if the entire value is quoted
    if len(text) >= 2 and text[0] == text[-1] and text[0] in ('"', "'"):
        text = text[1:-1]
    return text.strip()

def _row_label(row: TableRow, columns: list) -> str:
    """Get a short label for a row (first non-empty text value)."""
    for col in columns:
        if col.get("type") in ("text", "select"):
            val = row.data.get(col["id"])
            if val:
                s = str(val)
                return s[:40] + "..." if len(s) > 40 else s
    return f"Row #{row.id}"


async def execute_for_each_row(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
    """
    Streaming tool: research rows one-by-one, then present results as a DATA_PROPOSAL.

    Does NOT write to the database. Streams progress during research so the user
    sees what's happening, then emits a data_proposal payload at the end for the
    user to review and selectively approve.
    """
    from tools.builtin.web import _research_web_core

    table_id = _get_table_id(context)
    if not table_id:
        yield ToolResult(text="Error: No table context available.")
        return

    table = await _get_table_for_user(db, table_id, user_id)
    if not table:
        yield ToolResult(text="Error: Table not found or access denied.")
        return

    row_ids = params.get("row_ids", [])
    target_column = params.get("target_column", "").strip()
    instructions = params.get("instructions", "").strip()

    if not row_ids:
        yield ToolResult(text="Error: row_ids is required (list of row IDs to process).")
        return
    if len(row_ids) > MAX_ROWS_PER_FOR_EACH:
        yield ToolResult(
            text=f"Error: Too many rows ({len(row_ids)}). Maximum is {MAX_ROWS_PER_FOR_EACH} rows per call."
        )
        return
    if not target_column:
        yield ToolResult(text="Error: target_column is required.")
        return
    if not instructions:
        yield ToolResult(text="Error: instructions are required.")
        return

    # Resolve target column
    target_col_id = _resolve_column_id(table.columns, target_column)
    target_col_name = target_column
    if target_col_id:
        for col in table.columns:
            if col["id"] == target_col_id:
                target_col_name = col["name"]
                break
    else:
        available = ", ".join(c["name"] for c in table.columns)
        yield ToolResult(text=f"Error: Unknown column '{target_column}'. Available: {available}")
        return

    # Fetch rows by IDs
    stmt = (
        select(TableRow)
        .where(TableRow.table_id == table_id, TableRow.id.in_(row_ids))
        .order_by(TableRow.id)
    )
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    if not rows:
        yield ToolResult(text="Error: No matching rows found for the given row_ids.")
        return

    # Extract cancellation token from context (injected by agent_loop)
    cancel_token = context.get("_cancellation_token")

    # Fetch configurable max research steps once (not per-row)
    from services.chat_service import ChatService
    chat_service = ChatService(db)
    max_research_steps = await chat_service.get_max_research_steps()

    import asyncio

    CONCURRENCY = 3
    total = len(rows)
    yield ToolProgress(
        stage="starting",
        message=f"Researching {total} rows ({CONCURRENCY} at a time)...",
        progress=0.0,
    )

    # Queue for streaming progress from parallel workers back to the generator
    progress_queue: asyncio.Queue = asyncio.Queue()
    completed_count = 0

    async def research_one_row(row_obj):
        """Research a single row. Puts ToolProgress into the queue. Returns result dict."""
        nonlocal completed_count
        label = _row_label(row_obj, table.columns)

        # Check cancellation before starting this row
        if cancel_token and cancel_token.is_cancelled:
            completed_count += 1
            return {
                "operation": None,
                "log": {
                    "row_id": row_obj.id,
                    "label": label,
                    "status": "cancelled",
                    "value": None,
                    "steps": [{"action": "error", "detail": "Cancelled by user"}],
                },
            }

        await progress_queue.put(ToolProgress(
            stage="researching",
            message=f"Starting: {label}",
            progress=completed_count / total,
        ))

        research_result = None
        row_steps = []

        try:
            # Build query from row data + instructions
            parts = []
            for col in table.columns:
                val = row_obj.data.get(col["id"])
                if val is not None:
                    parts.append(f"{col['name']}: {val}")
            row_context = ", ".join(parts)
            built_query = (
                f"Given: {row_context}. {instructions}\n\n"
                "IMPORTANT: Return ONLY the raw answer value. No preamble, no explanation. "
                "Your output goes directly into a spreadsheet cell."
            )

            async for step in _research_web_core(built_query, max_research_steps, db, user_id, cancellation_token=cancel_token):
                action = step["action"]

                if action == "search":
                    row_steps.append({
                        "action": "search",
                        "query": step["query"],
                        "detail": step.get("detail", ""),
                    })
                    await progress_queue.put(ToolProgress(
                        stage="searching",
                        message=f"[{label}] Searching: {step['query'][:60]}",
                        progress=completed_count / total,
                    ))
                elif action == "fetch":
                    url = step["url"]
                    url_short = url[:60] + "..." if len(url) > 60 else url
                    row_steps.append({
                        "action": "fetch",
                        "url": url,
                        "detail": step.get("detail", ""),
                    })
                    await progress_queue.put(ToolProgress(
                        stage="fetching",
                        message=f"[{label}] Reading: {url_short}",
                        progress=completed_count / total,
                    ))
                elif action == "thinking":
                    row_steps.append({
                        "action": "thinking",
                        "text": step["text"],
                    })
                elif action == "error":
                    row_steps.append({
                        "action": "error",
                        "detail": step.get("detail", "Unknown error"),
                    })
                elif action == "answer":
                    research_result = step.get("text")
                    row_steps.append({
                        "action": "answer",
                        "text": research_result,
                    })

        except Exception as e:
            logger.error(f"for_each_row: row {row_obj.id} ({label}) crashed: {e}", exc_info=True)
            row_steps.append({
                "action": "error",
                "detail": f"Research crashed: {e}",
            })

        # Strip common LLM preambles that leak through despite instructions
        if research_result:
            research_result = _strip_preamble(research_result)

        # Check if we got a valid result
        is_valid = (
            research_result
            and research_result.lower() not in ("n/a", "could not determine an answer.", "")
        )

        if research_result:
            logger.info(
                f"for_each_row: row {row_obj.id} ({label}) result "
                f"(valid={is_valid}, len={len(research_result)}): "
                f"{research_result[:150]!r}"
            )
        else:
            logger.warning(f"for_each_row: row {row_obj.id} ({label}) returned None")

        completed_count += 1

        if is_valid and research_result:
            short_val = research_result[:60] + "..." if len(research_result) > 60 else research_result
            await progress_queue.put(ToolProgress(
                stage="row_done",
                message=f"{label} → {short_val}",
                progress=completed_count / total,
            ))
            return {
                "operation": {
                    "action": "update",
                    "row_id": row_obj.id,
                    "changes": {target_col_name: research_result},
                },
                "log": {
                    "row_id": row_obj.id,
                    "label": label,
                    "status": "found",
                    "value": research_result,
                    "steps": row_steps,
                },
            }
        else:
            await progress_queue.put(ToolProgress(
                stage="row_skipped",
                message=f"No result for {label}",
                progress=completed_count / total,
            ))
            return {
                "operation": None,
                "log": {
                    "row_id": row_obj.id,
                    "label": label,
                    "status": "not_found",
                    "value": None,
                    "steps": row_steps,
                },
            }

    # Run all rows in parallel with concurrency limit
    semaphore = asyncio.Semaphore(CONCURRENCY)

    async def bounded_research(row_obj):
        async with semaphore:
            return await research_one_row(row_obj)

    # Sentinel to signal all work is done
    _DONE = object()

    async def run_all():
        results = await asyncio.gather(
            *[bounded_research(row) for row in rows]
        )
        await progress_queue.put(_DONE)
        return results

    runner = asyncio.create_task(run_all())

    # Drain progress queue while workers run, yielding each item to the caller
    while True:
        item = await progress_queue.get()
        if item is _DONE:
            break
        if cancel_token and cancel_token.is_cancelled:
            logger.info("for_each_row: cancellation detected, stopping workers")
            runner.cancel()
            break
        yield item

    # Collect results (gather preserves order); handle cancellation
    cancelled = cancel_token and cancel_token.is_cancelled
    try:
        results = runner.result()
    except (asyncio.CancelledError, asyncio.InvalidStateError):
        results = []
        cancelled = True

    operations = [r["operation"] for r in results if r["operation"]]
    research_log = [r["log"] for r in results]
    skipped = sum(1 for r in results if r["operation"] is None)
    found_count = len(operations)

    if cancelled:
        yield ToolProgress(
            stage="cancelled",
            message=f"Cancelled — {found_count} found before cancellation",
            progress=completed_count / total if total else 1.0,
        )
        yield ToolResult(
            text=f"Research cancelled by user after processing {completed_count} of {total} rows. "
                 f"Found values for {found_count} rows before cancellation.",
        )
        return

    # Emit final result
    yield ToolProgress(
        stage="complete",
        message=f"Research complete: {found_count} found, {skipped} not found",
        progress=1.0,
    )

    # Always emit a data_proposal payload so the user can see research traces,
    # even when no values were found
    log_count = len(research_log)
    summary = (
        f"Researched {total} rows for '{target_col_name}'. "
        f"Found values for {found_count} rows, {skipped} not found. "
        f"Results have been automatically presented to the user as a "
        f"Data Proposal card with a full research trace. "
        f"IMPORTANT: Do NOT write a DATA_PROPOSAL in your response — "
        f"it is already delivered via the tool payload. "
        f"Do NOT call research_web or other tools to retry failed rows. "
        f"Just briefly summarize what was found and what was not."
    )

    logger.info(
        f"for_each_row: EMITTING ToolResult — ops={found_count}, "
        f"skipped={skipped}, research_log_entries={log_count}, "
        f"summary={summary!r}"
    )

    yield ToolResult(
        text=summary,
        payload={
            "type": "data_proposal",
            "data": {
                "reasoning": (
                    f"Web research: {instructions} — "
                    f"found {found_count} of {total} rows"
                ),
                "operations": operations,
                "research_log": research_log,
            },
        },
    )


register_tool(ToolConfig(
    name="for_each_row",
    description=(
        "Research table rows in parallel using web search, then present results as a "
        "Data Proposal for the user to review and selectively approve. "
        "Processes up to 3 rows concurrently for faster results. "
        f"Maximum {MAX_ROWS_PER_FOR_EACH} rows per call. "
        "Does NOT modify the database — results are shown for review first. "
        "IMPORTANT: Always show the user the rows and get confirmation before calling this tool."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "row_ids": {
                "type": "array",
                "items": {"type": "integer"},
                "description": f"List of row IDs to process (max {MAX_ROWS_PER_FOR_EACH}; get these from get_rows first)",
            },
            "target_column": {
                "type": "string",
                "description": "Column name to fill with researched values",
            },
            "instructions": {
                "type": "string",
                "description": "What to research per row, e.g. 'Find the LinkedIn URL for this company'",
            },
        },
        "required": ["row_ids", "target_column", "instructions"],
    },
    executor=execute_for_each_row,
    streaming=True,
    category="table_data",
    payload_type="data_proposal",
))
