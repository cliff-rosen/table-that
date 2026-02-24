"""
Table View Page Config

Registers the table_view page with the chat system. When a user is viewing a table,
the LLM gets context about the table schema, row count, and sample data.
"""

import json
from typing import Dict, Any

from services.chat_page_config.registry import register_page, TabConfig


def table_view_context_builder(context: Dict[str, Any]) -> str:
    """Build context for the table view page."""
    parts = []

    parts.append("The user is viewing a data table.")

    table_name = context.get("table_name")
    if table_name:
        parts.append(f"Table name: {table_name}")

    table_description = context.get("table_description")
    if table_description:
        parts.append(f"Description: {table_description}")

    # Column schema
    columns = context.get("columns", [])
    if columns:
        col_lines = []
        for col in columns:
            col_type = col.get("type", "text")
            required = " (required)" if col.get("required") else ""
            options = ""
            if col_type == "select" and col.get("options"):
                options = f" [{', '.join(col['options'])}]"
            col_lines.append(f"  - {col.get('name', 'unnamed')} ({col_type}{options}){required}")
        parts.append(f"Columns ({len(columns)}):\n" + "\n".join(col_lines))

    # Row count
    row_count = context.get("row_count")
    if row_count is not None:
        parts.append(f"Total rows: {row_count}")

    # Sample data (first few rows for context)
    sample_rows = context.get("sample_rows", [])
    if sample_rows and columns:
        parts.append(f"\nSample data (first {len(sample_rows)} rows):")
        for row in sample_rows[:10]:
            row_data = row.get("data", {})
            display = {}
            for col in columns:
                val = row_data.get(col.get("id", ""))
                if val is not None:
                    display[col.get("name", col.get("id", ""))] = val
            parts.append(f"  Row #{row.get('id', '?')}: {json.dumps(display, default=str)}")

    # Active filters/sort
    active_filters = context.get("active_filters")
    if active_filters:
        parts.append(f"Active filters: {json.dumps(active_filters, default=str)}")

    active_sort = context.get("active_sort")
    if active_sort:
        parts.append(f"Sort: {active_sort.get('column_id', '?')} {active_sort.get('direction', 'asc')}")

    return "\n".join(parts)


TABLE_VIEW_PERSONA = """You are a data assistant helping the user manage their table data.

You can:
- Add new records to the table (use create_row)
- Update existing records (use update_row with the row ID)
- Delete records (use delete_row with the row ID)
- Search through the data (use search_rows)
- Describe the table schema (use describe_table)

When adding or updating records, use column NAMES (not IDs). The tools will map them automatically.

When the user asks about their data, search first using search_rows, then provide insights.
If the user asks you to add multiple records, create them one at a time using create_row."""


register_page(
    page="table_view",
    context_builder=table_view_context_builder,
    tools=["create_row", "update_row", "delete_row", "search_rows", "describe_table", "suggest_schema"],
    persona=TABLE_VIEW_PERSONA,
)
