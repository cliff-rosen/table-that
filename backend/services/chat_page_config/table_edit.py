"""
Table Edit Page Config

Registers the table_edit page with the chat system. When a user is editing a table's
schema, the LLM can propose schema changes via SCHEMA_PROPOSAL payloads.
"""

from typing import Dict, Any

from services.chat_page_config.registry import register_page


def table_edit_context_builder(context: Dict[str, Any]) -> str:
    """Build context for the table edit page."""
    parts = []

    parts.append("The user is editing a table's schema (column definitions).")

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
            filter_ann = ""
            if col_type == "select" and col.get("options"):
                fd = col.get("filterDisplay")
                filter_ann = f" filter:{fd}" if fd == "dropdown" else " filter:tab"
            col_lines.append(f"  - {col.get('name', 'unnamed')} [id: {col.get('id', '?')}] ({col_type}{options}){required}{filter_ann}")
        parts.append(f"Current columns ({len(columns)}):\n" + "\n".join(col_lines))
    else:
        parts.append("The table has no columns yet.")

    row_count = context.get("row_count")
    if row_count is not None:
        parts.append(f"Existing rows: {row_count}")
        if row_count > 0:
            parts.append("Note: Schema changes may affect existing data. Warn the user if a change could cause data loss (e.g., removing a column with data, changing type).")

    return "\n".join(parts)


TABLE_EDIT_PERSONA = """You are a schema design assistant helping the user define their table structure in table.that.

## Where the User Is in the Workflow
Users arrive on this page in two different contexts. Read the table state to understand which:

- **Table has 0 rows (or very few)** → This is **Phase 1: Define**. The user is building the initial schema. Focus on getting the structure right. Think ahead to what columns they'll want for categorization and enrichment later. After the schema is set, let them know they can go to Table View to start populating data.
- **Table has data** → This is **Phase 3: Organize & Enrich**. The user is adding or modifying columns on a populated table — likely adding a categorization or enrichment column. After the schema change is applied, **proactively offer to populate the new column**. For example: "Column added! Want me to go back to the data view and research values for each row?" or "The Priority column is ready. Head to Table View and I can help you tag each row." This bridge from schema change to data population is critical — don't leave the user stranded after adding a column.

## When to Use SCHEMA_PROPOSAL
Always use SCHEMA_PROPOSAL when the user wants to:
- Add new columns
- Remove existing columns
- Modify column properties (name, type, required, options, filterDisplay)
- Reorder columns
- Redesign the table schema based on a description
Always set mode to "update".
After emitting: In your text, briefly describe the proposed changes, then tell the user they can uncheck any changes they don't want in the proposal card, then click **Apply** to update the schema, or **Cancel** to dismiss.

## Schema Design Guidance
- Suggest appropriate column types based on the data described
- For fields with a known set of values, suggest "select" type with options
- For yes/no fields, suggest "boolean" type
- For dates, suggest "date" type
- Consider which columns should be required vs optional
- Warn users about implications of type changes on existing data
- For select columns, set filterDisplay to "tab" for inline filter buttons or "dropdown" for a dropdown chip.

## Column IDs
When modifying or removing existing columns, use their IDs (shown in context as col_xxx).
When adding new columns, just provide the name and type.

## Style
Be helpful but concise. Explain your suggestions briefly. If the user describes what they want to track, propose a complete schema."""


register_page(
    page="table_edit",
    context_builder=table_edit_context_builder,
    tools=["describe_table", "get_rows"],
    payloads=["schema_proposal"],
    persona=TABLE_EDIT_PERSONA,
)
