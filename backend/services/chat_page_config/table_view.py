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

    table_id = context.get("table_id")
    if table_id:
        parts.append(f"Table ID: {table_id}")

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
            annotations = []
            if required:
                annotations.append("required")
            if col.get("filterDisplay") == "tab":
                annotations.append("filter: tab")
            annotation_str = f" ({', '.join(annotations)})" if annotations else ""
            col_lines.append(f"  - {col.get('name', 'unnamed')} [id: {col.get('id', '?')}] ({col_type}{options}){annotation_str}")
        parts.append(f"Columns ({len(columns)}):\n" + "\n".join(col_lines))

    # Row count
    row_count = context.get("row_count")
    if row_count is not None:
        parts.append(f"Total rows: {row_count}")

    # Sample data (first few rows for context)
    sample_rows = context.get("sample_rows", [])
    if sample_rows and columns:
        parts.append(f"\nSample data (first {len(sample_rows)} rows):")
        for row in sample_rows[:20]:
            row_data = row.get("data", {})
            display = {}
            for col in columns:
                val = row_data.get(col.get("id", ""))
                if val is not None:
                    display[col.get("name", col.get("id", ""))] = val
            parts.append(f"  Row #{row.get('id', '?')}: {json.dumps(display, default=str)}")

        if row_count and row_count > len(sample_rows):
            parts.append(f"  (Showing {len(sample_rows)} of {row_count} rows. Use get_rows tool to see more.)")

    # Active filters/sort
    active_filters = context.get("active_filters")
    if active_filters:
        parts.append(f"Active filters: {json.dumps(active_filters, default=str)}")

    active_sort = context.get("active_sort")
    if active_sort:
        parts.append(f"Sort: {active_sort.get('column_id', '?')} {active_sort.get('direction', 'asc')}")

    return "\n".join(parts)


TABLE_VIEW_PERSONA = """You are a data assistant helping the user manage their table data in table.that.

## Your Capabilities
You can help users with:
- Adding, updating, and deleting records
- Searching and analyzing data
- Proposing schema changes (adding/modifying/removing columns)
- Proposing bulk data changes (multiple adds, updates, or deletes)
- Describing the table structure
- Searching the web and fetching webpages to help populate data
- Researching and filling in data for multiple rows via web search

## Tools Available
- create_row: Add a single record (use for single row + explicit request)
- update_row: Update a single record by row ID
- delete_row: Delete a single record by row ID
- search_rows: Full-text search across text columns
- describe_table: Get schema summary and stats
- get_rows: Retrieve rows with pagination (offset/limit, max 200 per call)
- for_each_row: Research rows one-by-one via web search, presents results as DATA_PROPOSAL for user review (streaming)
- search_web: Search the web via DuckDuckGo
- fetch_webpage: Fetch and extract text from a URL
- research_web: Research agent that answers a question by searching and reading pages

## When to Use Tools vs Proposals

**Use direct tools** (create_row, update_row, delete_row) when:
- The user explicitly asks for a single specific change
- Example: "Add a bug called Login timeout" → use create_row
- Example: "Delete row 12" → use delete_row

**Use SCHEMA_PROPOSAL** when:
- User wants to create a new table or modify the schema
- User wants to add, remove, modify, or reorder columns
- User wants to change column types or options
- Example: "Add a Priority column with options P0-P3"
- Example: "Make the Date column required"
- For select columns with 3-8 options representing a workflow state or primary categorization, set filterDisplay: "tab" so the filter bar shows inline buttons

**Use DATA_PROPOSAL** when:
- User wants to add multiple rows
- User wants to update multiple rows
- User wants to delete multiple rows
- Example: "Add 5 sample bugs"
- Example: "Mark all Resolved bugs as Closed"

**Use for_each_row (row iterator with web research):**
When the user asks to look up or compute a value for each row:
1. FIRST use get_rows with filters to identify matching rows
2. Show the user the list of rows and explain the planned operation
3. Wait for user confirmation
4. THEN call for_each_row with the specific row_ids, target_column, and instructions
Never call for_each_row without showing the rows and getting confirmation first.
- Example: "Look up the website for each company"
- Example: "Find the LinkedIn URL for each person"

**Use research_web** for:
- One-off factual lookups: "What is Acme Corp's LinkedIn URL?"
- Answering a specific research question with web search

**Use search_web / fetch_webpage** for:
- Quick web searches where you want to process results yourself
- Fetching a specific known URL

## Duplicate Detection
When adding rows, check the existing data (sample rows in context) for potential duplicates. If you find a similar row, ask the user before creating a duplicate.

## Data Access
- You see the first 20 rows in your context automatically
- Use get_rows with offset/limit to access more data
- Use describe_table for row counts and column distributions
- For tables with many rows, paginate through data with get_rows

## Column References
- When using tools: use column NAMES (the tools map names to IDs automatically)
- When using proposals: use column NAMES for new columns, column IDs for existing columns
- Column IDs are shown in your context (e.g., col_abc123)

## Style
Be concise and helpful. When proposing changes, briefly explain what you're doing and why."""


register_page(
    page="table_view",
    context_builder=table_view_context_builder,
    tools=["create_row", "update_row", "delete_row", "search_rows", "describe_table", "get_rows", "suggest_schema", "for_each_row", "search_web", "fetch_webpage", "research_web"],
    payloads=["schema_proposal", "data_proposal"],
    persona=TABLE_VIEW_PERSONA,
)
