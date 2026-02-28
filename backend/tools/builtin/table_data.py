"""
Table Data Tools

Tools for the AI assistant to manipulate table data (create, update, delete, search rows).
Includes enrich_column — a strategy-based streaming enrichment dispatcher.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, Optional, Union

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolProgress, ToolResult, register_tool
from models import TableDefinition, TableRow
from services.table_service import TableService
from services.row_service import RowService
from schemas.table import RowCreate, RowUpdate

logger = logging.getLogger(__name__)

# ── Limits ────────────────────────────────────────────────────────────────
MAX_ROWS_PER_TABLE = 100        # Hard cap on rows in any single table
MAX_ROWS_PER_ENRICH = 20        # Max row_ids accepted by the enrich_column tool


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

async def _get_table(db: AsyncSession, table_id: int, user_id: int) -> Optional[TableDefinition]:
    """Get a table via TableService, returning None instead of raising on not found."""
    table_service = TableService(db)
    try:
        return await table_service.get(table_id, user_id)
    except HTTPException:
        return None


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

    table = await _get_table(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    # Check row limit
    table_service = TableService(db)
    current_count = await table_service.get_row_count(table_id)
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

    row_service = RowService(db)
    row = await row_service.create(table_id, RowCreate(data=data))

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

    table = await _get_table(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    row_id = params.get("row_id")
    if not row_id:
        return "Error: row_id is required."

    values = params.get("values", {})
    if not values:
        return "Error: No values provided to update."

    # Map names to IDs
    mapped_data = {}
    unmapped = []
    for key, value in values.items():
        col_id = _resolve_column_id(table.columns, key)
        if col_id:
            mapped_data[col_id] = value
        else:
            unmapped.append(key)

    if unmapped:
        available = ", ".join(c["name"] for c in table.columns)
        return f"Error: Unknown columns: {', '.join(unmapped)}. Available columns: {available}"

    row_service = RowService(db)
    try:
        await row_service.update(table_id, row_id, RowUpdate(data=mapped_data))
    except HTTPException:
        return f"Error: Row #{row_id} not found in this table."

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

    table = await _get_table(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    row_id = params.get("row_id")
    if not row_id:
        return "Error: row_id is required."

    row_service = RowService(db)
    try:
        await row_service.delete(table_id, row_id)
    except HTTPException:
        return f"Error: Row #{row_id} not found in this table."

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

    table = await _get_table(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    query = params.get("query", "").strip()
    if not query:
        return "Error: Search query is required."

    limit = min(params.get("limit", 20), 50)

    text_cols = [c for c in table.columns if c.get("type") in ("text", "select")]
    if not text_cols:
        return "This table has no text columns to search."

    row_service = RowService(db)
    rows = await row_service.search(table_id, query, table.columns, limit)

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

    table = await _get_table(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    # Get row count
    table_service = TableService(db)
    row_count = await table_service.get_row_count(table_id)

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
        row_service = RowService(db)
        all_rows, _ = await row_service.list(table_id, offset=0, limit=MAX_ROWS_PER_TABLE)

        lines.append(f"\nValue distributions:")
        for col in distributable:
            counts: Dict[str, int] = {}
            for row in all_rows:
                val = row.data.get(col["id"]) if row.data else None
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

# create_row tool: create a new row with specified column values
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

# update_row tool: update an existing row by ID with new column values
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

# delete_row tool: delete a row by ID
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

# search_rows tool: search for rows matching a text query across all text columns
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

# describe_table tool: get a summary of the current table's schema, columns, and row count
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

    table = await _get_table(db, table_id, user_id)
    if not table:
        return "Error: Table not found or access denied."

    offset = max(params.get("offset", 0), 0)
    limit = min(max(params.get("limit", 50), 1), 200)

    row_service = RowService(db)
    rows, total = await row_service.list(table_id, offset=offset, limit=limit)

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


def _row_label(row: TableRow, columns: list) -> str:
    """Get a short label for a row (first non-empty text value)."""
    for col in columns:
        if col.get("type") in ("text", "select"):
            val = row.data.get(col["id"])
            if val:
                s = str(val)
                return s[:40] + "..." if len(s) > 40 else s
    return f"Row #{row.id}"


# =============================================================================
# enrich_column — Strategy-based enrichment dispatcher
# =============================================================================

_VALID_STRATEGIES = ("lookup", "research", "computation")

# Concurrency per strategy type (research-comprehensive gets lower concurrency)
_STRATEGY_CONCURRENCY = {
    "lookup": 3,
    "research": 3,
    "research_comprehensive": 2,
    "computation": 10,
}


async def execute_enrich_column(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
    """
    Strategy-based enrichment dispatcher.

    Replaces for_each_row with a strategy enum parameter. Each strategy
    encapsulates a different enrichment workflow (quick lookup,
    deep research, computation). Results are presented as a DATA_PROPOSAL
    for user review.
    """
    from tools.builtin.strategies import get_strategy
    from tools.builtin.strategies.coerce import coerce_value, is_not_found

    table_id = _get_table_id(context)
    if not table_id:
        yield ToolResult(text="Error: No table context available.")
        return

    table = await _get_table(db, table_id, user_id)
    if not table:
        yield ToolResult(text="Error: Table not found or access denied.")
        return

    row_ids = params.get("row_ids", [])
    target_column = params.get("target_column", "").strip()
    strategy_name = params.get("strategy", "").strip()
    strategy_params = params.get("params", {})

    # ── Validation ────────────────────────────────────────────────────
    if not row_ids:
        yield ToolResult(text="Error: row_ids is required (list of row IDs to process).")
        return
    if len(row_ids) > MAX_ROWS_PER_ENRICH:
        yield ToolResult(
            text=f"Error: Too many rows ({len(row_ids)}). Maximum is {MAX_ROWS_PER_ENRICH} rows per call."
        )
        return
    if not target_column:
        yield ToolResult(text="Error: target_column is required.")
        return
    if not strategy_name:
        yield ToolResult(text="Error: strategy is required. Options: " + ", ".join(_VALID_STRATEGIES))
        return
    if strategy_name not in _VALID_STRATEGIES:
        yield ToolResult(text=f"Error: Unknown strategy '{strategy_name}'. Options: " + ", ".join(_VALID_STRATEGIES))
        return

    # Look up strategy
    strategy = get_strategy(strategy_name)
    if not strategy:
        yield ToolResult(text=f"Error: Strategy '{strategy_name}' not found in registry.")
        return

    # Validate strategy-specific params
    param_error = strategy.validate_params(strategy_params)
    if param_error:
        yield ToolResult(text=f"Error: {param_error}")
        return

    # Resolve target column
    target_col_id = _resolve_column_id(table.columns, target_column)
    target_col_name = target_column
    target_col_type = "text"
    target_col_options = None
    if target_col_id:
        for col in table.columns:
            if col["id"] == target_col_id:
                target_col_name = col["name"]
                target_col_type = col.get("type", "text")
                target_col_options = col.get("options")
                break
    else:
        available = ", ".join(c["name"] for c in table.columns)
        yield ToolResult(text=f"Error: Unknown column '{target_column}'. Available: {available}")
        return

    # Fetch rows by IDs
    row_service = RowService(db)
    rows = await row_service.get_by_ids(table_id, row_ids)

    if not rows:
        yield ToolResult(text="Error: No matching rows found for the given row_ids.")
        return

    cancel_token = context.get("_cancellation_token")

    import asyncio

    # Determine thoroughness for research strategy
    thoroughness = strategy_params.get("thoroughness", "exploratory") if strategy_name == "research" else None
    is_comprehensive = thoroughness == "comprehensive"

    # Comprehensive research gets lower concurrency since each row does more work
    if is_comprehensive:
        concurrency = _STRATEGY_CONCURRENCY.get("research_comprehensive", 2)
    else:
        concurrency = _STRATEGY_CONCURRENCY.get(strategy_name, 3)

    total = len(rows)
    progress_label = f"{strategy.display_name} (comprehensive)" if is_comprehensive else strategy.display_name
    yield ToolProgress(
        stage="starting",
        message=f"{progress_label}: enriching {total} rows ({concurrency} at a time)...",
        progress=0.0,
    )

    progress_queue: asyncio.Queue = asyncio.Queue()
    completed_count = 0

    async def enrich_one_row(row_obj):
        """Enrich a single row using the selected strategy."""
        nonlocal completed_count
        label = _row_label(row_obj, table.columns)

        # Check cancellation
        if cancel_token and cancel_token.is_cancelled:
            completed_count += 1
            log_entry: Dict[str, Any] = {
                "row_id": row_obj.id,
                "label": label,
                "status": "cancelled",
                "value": None,
                "steps": [{"action": "error", "detail": "Cancelled by user"}],
                "strategy": strategy_name,
            }
            if thoroughness:
                log_entry["thoroughness"] = thoroughness
            return {"operation": None, "log": log_entry}

        await progress_queue.put(ToolProgress(
            stage="enriching",
            message=f"Starting: {label}",
            progress=completed_count / total,
        ))

        # Build row_data dict: {column_name: value}
        row_data = {}
        for col in table.columns:
            val = row_obj.data.get(col["id"])
            if val is not None:
                row_data[col["name"]] = val

        enrichment_value = None
        row_steps = []
        confidence = "none"

        try:
            async for step in strategy.execute_one(
                row_data, strategy_params, table.columns, db, user_id, cancel_token
            ):
                # Convert EnrichmentStep to dict for research log
                step_dict: Dict[str, Any] = {"action": step.type, "detail": step.detail}
                if step.data:
                    step_dict.update(step.data)

                row_steps.append(step_dict)

                # Yield progress for search/fetch/compute steps
                if step.type == "search":
                    query_short = step.detail[:60] if step.detail else ""
                    await progress_queue.put(ToolProgress(
                        stage="searching",
                        message=f"[{label}] Searching: {query_short}",
                        progress=completed_count / total,
                    ))
                elif step.type == "fetch":
                    url_short = step.detail[:60] + "..." if len(step.detail) > 60 else step.detail
                    await progress_queue.put(ToolProgress(
                        stage="fetching",
                        message=f"[{label}] Reading: {url_short}",
                        progress=completed_count / total,
                    ))
                elif step.type == "compute":
                    await progress_queue.put(ToolProgress(
                        stage="computing",
                        message=f"[{label}] Computing...",
                        progress=completed_count / total,
                    ))
                elif step.type == "answer":
                    enrichment_value = step.data.get("value") if step.data else step.detail

        except Exception as e:
            logger.error(f"enrich_column: row {row_obj.id} ({label}) crashed: {e}", exc_info=True)
            row_steps.append({"action": "error", "detail": f"Strategy crashed: {e}"})

        # Coerce value
        raw_value = enrichment_value
        if enrichment_value and not is_not_found(enrichment_value):
            coerced, coerce_confidence = coerce_value(
                enrichment_value, target_col_type, target_col_options
            )
            enrichment_value = coerced
            confidence = coerce_confidence
        else:
            enrichment_value = None
            confidence = "none"

        completed_count += 1

        is_valid = enrichment_value is not None and enrichment_value != ""

        if enrichment_value:
            logger.info(
                f"enrich_column: row {row_obj.id} ({label}) result "
                f"(valid={is_valid}, confidence={confidence}, len={len(enrichment_value)}): "
                f"{enrichment_value[:150]!r}"
            )

        if is_valid and enrichment_value:
            short_val = enrichment_value[:60] + "..." if len(enrichment_value) > 60 else enrichment_value
            await progress_queue.put(ToolProgress(
                stage="row_done",
                message=f"{label} → {short_val}",
                progress=completed_count / total,
            ))
            found_log: Dict[str, Any] = {
                "row_id": row_obj.id,
                "label": label,
                "status": "found",
                "value": enrichment_value,
                "steps": row_steps,
                "strategy": strategy_name,
                "confidence": confidence,
                "raw_value": raw_value,
            }
            if thoroughness:
                found_log["thoroughness"] = thoroughness
            return {
                "operation": {
                    "action": "update",
                    "row_id": row_obj.id,
                    "changes": {target_col_name: enrichment_value},
                },
                "log": found_log,
            }
        else:
            await progress_queue.put(ToolProgress(
                stage="row_skipped",
                message=f"No result for {label}",
                progress=completed_count / total,
            ))
            nf_log: Dict[str, Any] = {
                "row_id": row_obj.id,
                "label": label,
                "status": "not_found",
                "value": None,
                "steps": row_steps,
                "strategy": strategy_name,
                "confidence": confidence,
            }
            if thoroughness:
                nf_log["thoroughness"] = thoroughness
            return {"operation": None, "log": nf_log}

    # Run all rows with concurrency limit
    semaphore = asyncio.Semaphore(concurrency)

    async def bounded_enrich(row_obj):
        async with semaphore:
            return await enrich_one_row(row_obj)

    _DONE = object()

    async def run_all():
        results = await asyncio.gather(
            *[bounded_enrich(row) for row in rows]
        )
        await progress_queue.put(_DONE)
        return results

    runner = asyncio.create_task(run_all())

    # Drain progress queue
    while True:
        item = await progress_queue.get()
        if item is _DONE:
            break
        if cancel_token and cancel_token.is_cancelled:
            logger.info("enrich_column: cancellation detected, stopping workers")
            runner.cancel()
            break
        yield item

    # Collect results
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
            text=f"Enrichment cancelled by user after processing {completed_count} of {total} rows. "
                 f"Found values for {found_count} rows before cancellation.",
        )
        return

    # Emit final result
    yield ToolProgress(
        stage="complete",
        message=f"{progress_label} complete: {found_count} found, {skipped} not found",
        progress=1.0,
    )

    log_count = len(research_log)
    summary = (
        f"Enriched {total} rows for '{target_col_name}' using {strategy.display_name}. "
        f"Found values for {found_count} rows, {skipped} not found. "
        f"Results have been automatically presented to the user as a "
        f"Data Proposal card with a full research trace. "
        f"IMPORTANT: Do NOT write a DATA_PROPOSAL in your response — "
        f"it is already delivered via the tool payload. "
        f"Do NOT call research_web or other tools to retry failed rows. "
        f"Just briefly summarize what was found and what was not."
    )

    logger.info(
        f"enrich_column: EMITTING ToolResult — strategy={strategy_name}, ops={found_count}, "
        f"skipped={skipped}, research_log_entries={log_count}"
    )

    yield ToolResult(
        text=summary,
        payload={
            "type": "data_proposal",
            "data": {
                "reasoning": (
                    f"{strategy.display_name}: {strategy_params.get('question') or strategy_params.get('formula', '')} — "
                    f"found {found_count} of {total} rows"
                ),
                "operations": operations,
                "research_log": research_log,
            },
        },
    )

register_tool(ToolConfig(
    name="enrich_column",
    description=(
        "Enrich a column with derived or researched data using a specific strategy. "
        "Strategies: lookup (simple factual lookups — find THE answer or report not found), "
        "research (multi-step web research — always synthesize a useful answer; supports "
        "thoroughness: 'exploratory' for sampling or 'comprehensive' for exhaustive coverage), "
        "computation (derive from existing columns). "
        "Processes rows in parallel and presents results as a Data Proposal. "
        f"Maximum {MAX_ROWS_PER_ENRICH} rows per call. "
        "Does NOT modify the database — results are shown for review first."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "row_ids": {
                "type": "array",
                "items": {"type": "integer"},
                "description": f"List of row IDs to process (max {MAX_ROWS_PER_ENRICH}; get these from get_rows first)",
            },
            "target_column": {
                "type": "string",
                "description": "Column name to fill with enriched values",
            },
            "strategy": {
                "type": "string",
                "enum": list(_VALID_STRATEGIES),
                "description": (
                    "Enrichment strategy: "
                    "'lookup' for simple factual lookups (has a definitive answer), "
                    "'research' for complex multi-step research (synthesize from multiple sources), "
                    "'computation' for deriving from existing columns"
                ),
            },
            "params": {
                "type": "object",
                "description": (
                    "Strategy-specific parameters. Use {Column Name} for row value placeholders. "
                    "lookup: {question}. "
                    "research: {question, thoroughness}. "
                    "computation: {formula}."
                ),
                "properties": {
                    "question": {
                        "type": "string",
                        "description": "Question template with {Column Name} placeholders, e.g. 'What year was {Company} founded?'",
                    },
                    "formula": {
                        "type": "string",
                        "description": "Computation formula using {Column Name} placeholders, e.g. '{Price} * {Quantity}'",
                    },
                    "thoroughness": {
                        "type": "string",
                        "enum": ["exploratory", "comprehensive"],
                        "description": (
                            "Research depth (research strategy only). "
                            "'exploratory' (default): reasonable sampling. "
                            "'comprehensive': exhaustive multi-angle search with coverage assessment."
                        ),
                    },
                },
            },
        },
        "required": ["row_ids", "target_column", "strategy", "params"],
    },
    executor=execute_enrich_column,
    streaming=True,
    category="table_data",
    payload_type="data_proposal",
))
