"""
Table Data Tools

Tools for the AI assistant to manipulate table data (create, update, delete, search rows).
"""

import json
import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from tools.registry import ToolConfig, register_tool
from models import TableDefinition, TableRow

logger = logging.getLogger(__name__)


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


async def execute_suggest_schema(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Suggest a table schema based on a description of the data."""
    import uuid

    description = params.get("description", "").strip()
    if not description:
        return "Error: Please provide a description of the data you want to store."

    column_count = min(params.get("column_count", 5), 20)

    # The LLM calling this tool will use its own intelligence to suggest columns.
    # This tool just formats the suggestion as a structured response.
    columns = params.get("columns", [])
    if not columns:
        return (
            "Please suggest columns directly based on the user's description. "
            "For each column provide: name, type (text/number/date/boolean/select), "
            "and for select columns provide options. Return as a formatted list."
        )

    # Format the suggestion
    lines = [f"Suggested schema for: {description}\n"]
    for col in columns:
        col_id = f"col_{uuid.uuid4().hex[:8]}"
        col_type = col.get("type", "text")
        required = " (required)" if col.get("required") else ""
        options = ""
        if col_type == "select" and col.get("options"):
            options = f" [{', '.join(col['options'])}]"
        lines.append(f"  - {col.get('name', 'unnamed')} ({col_type}{options}){required}  [id: {col_id}]")

    lines.append(f"\nTotal: {len(columns)} columns")
    return "\n".join(lines)


register_tool(ToolConfig(
    name="suggest_schema",
    description="Suggest a table schema based on a description of the data the user wants to store. Use this when a user asks for help designing a table.",
    input_schema={
        "type": "object",
        "properties": {
            "description": {
                "type": "string",
                "description": "Description of the data to store"
            },
            "columns": {
                "type": "array",
                "description": "Suggested column definitions",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string", "description": "Column name"},
                        "type": {"type": "string", "enum": ["text", "number", "date", "boolean", "select"], "description": "Column type"},
                        "required": {"type": "boolean", "description": "Whether this column is required"},
                        "options": {"type": "array", "items": {"type": "string"}, "description": "Options for select type columns"}
                    },
                    "required": ["name", "type"]
                }
            },
            "column_count": {
                "type": "integer",
                "description": "Suggested number of columns (default: 5, max: 20)"
            }
        },
        "required": ["description", "columns"]
    },
    executor=execute_suggest_schema,
    category="table_data",
))
