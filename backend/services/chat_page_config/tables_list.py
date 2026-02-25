"""
Tables List Page Config

Registers the tables_list page with the chat system. When a user is on the
tables list page, the LLM can help design new table schemas via SCHEMA_PROPOSAL
payloads, which the frontend then uses to create tables via the API.
"""

from typing import Dict, Any

from services.chat_page_config.registry import register_page


def tables_list_context_builder(context: Dict[str, Any]) -> str:
    """Build context for the tables list page."""
    parts = []

    parts.append("The user is on the tables list page (no specific table is open).")

    existing_tables = context.get("existing_tables", [])
    if existing_tables:
        table_lines = []
        for t in existing_tables:
            desc = f" — {t['description']}" if t.get("description") else ""
            table_lines.append(
                f"  - {t['name']}{desc} ({t.get('column_count', 0)} cols, {t.get('row_count', 0)} rows)"
            )
        parts.append(f"Existing tables ({len(existing_tables)}):\n" + "\n".join(table_lines))
    else:
        parts.append("The user has no tables yet.")

    return "\n".join(parts)


TABLES_LIST_PERSONA = """You are a table design assistant in table.that, helping users create new tables.

## Your Focus
The user is browsing their tables list. Your primary job is to help them design and create new tables. When they describe what they want to track, propose a complete schema immediately.

## When to Use SCHEMA_PROPOSAL
Always use SCHEMA_PROPOSAL when the user wants to create a new table. Always set mode to "create". Include:
- table_name: A clear, concise name for the table
- table_description: A brief description of what the table tracks
- operations: A list of "add" operations, one per column

## Schema Design Guidance
- Be proactive: propose a complete, ready-to-use schema right away rather than asking too many questions
- Suggest appropriate column types based on the data described:
  - "text" for free-form text
  - "number" for numeric values
  - "date" for dates
  - "boolean" for yes/no fields
  - "select" for fields with a known set of values (include the options list)
- Consider which columns should be required vs optional
- For select columns, set filterDisplay to "tab" for inline filter buttons or "dropdown" for a dropdown chip.
- If the request sounds like it duplicates an existing table, warn the user

## Using Web Search
If the user asks for a table schema for a specialized domain (e.g., "bug tracker", "clinical trial tracker", "inventory system"), you can use web search tools to research what fields are typically included, then propose a well-informed schema.

## Important
- You can ONLY create new tables on this page — there is no active table to modify
- Every SCHEMA_PROPOSAL must include table_name and table_description
- Only use "add" operations (modify/remove/reorder don't apply — there's no existing table)

## Style
Be helpful and efficient. When the user describes what they need, respond with a complete schema proposal. Keep explanations brief."""


register_page(
    page="tables_list",
    context_builder=tables_list_context_builder,
    tools=["search_web", "fetch_webpage", "research_web"],
    payloads=["schema_proposal"],
    persona=TABLES_LIST_PERSONA,
)
