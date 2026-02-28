"""
Payload Schema Registry

Central definitions for all payload types used in the chat system.
This is the SINGLE SOURCE OF TRUTH for payload definitions.

Tools reference payloads by name (payload_type field).
Pages declare which payloads they use (in their TabConfig/page config).

Payloads can be:
- Global (is_global=True): Automatically available on all pages
- Non-global (is_global=False): Must be explicitly added to a page

For LLM payloads (source="llm"), this also defines:
- parse_marker: Text marker to look for in LLM output
- parser: Function to extract JSON from LLM output
- llm_instructions: Instructions for the LLM on when/how to use this payload
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


# =============================================================================
# Parser Factory
# =============================================================================


def make_json_parser(payload_type: str) -> Callable[[str], Optional[Dict[str, Any]]]:
    """Create a standard JSON parser for a payload type."""

    def parser(text: str) -> Optional[Dict[str, Any]]:
        try:
            data = json.loads(text.strip())
            return {"type": payload_type, "data": data}
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse {payload_type} JSON: {e}")
            return None

    return parser


# =============================================================================
# PayloadType Definition
# =============================================================================


@dataclass
class PayloadType:
    """Complete definition of a payload type."""

    name: str  # e.g., "search_results"
    description: str  # Human-readable description
    schema: Dict[str, Any]  # JSON schema for the data field
    source: str = "tool"  # "tool" or "llm"
    is_global: bool = False  # If True, available on all pages

    # For LLM payloads (source="llm"):
    parse_marker: Optional[str] = None  # e.g., "SCHEMA_PROPOSAL:"
    parser: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None
    llm_instructions: Optional[str] = None  # Instructions for LLM

    # For payload manifest (summarize for LLM context):
    summarize: Optional[Callable[[Dict[str, Any]], str]] = None  # Returns brief summary


# =============================================================================
# Payload Type Registry
# =============================================================================

_payload_types: Dict[str, PayloadType] = {}


def register_payload_type(payload_type: PayloadType) -> None:
    """Register a payload type."""
    _payload_types[payload_type.name] = payload_type


def get_payload_type(name: str) -> Optional[PayloadType]:
    """Get a payload type by name."""
    return _payload_types.get(name)


def get_all_payload_types() -> List[PayloadType]:
    """Get all registered payload types."""
    return list(_payload_types.values())


def get_payload_schema(name: str) -> Optional[Dict[str, Any]]:
    """Get the JSON schema for a payload type."""
    payload_type = _payload_types.get(name)
    return payload_type.schema if payload_type else None


def get_global_payload_types() -> List[PayloadType]:
    """Get all global payload types."""
    return [p for p in _payload_types.values() if p.is_global]


def get_payload_types_by_source(source: str) -> List[PayloadType]:
    """Get payload types by source ('tool' or 'llm')."""
    return [p for p in _payload_types.values() if p.source == source]


def get_payload_types_by_names(names: List[str]) -> List[PayloadType]:
    """Get payload types by a list of names."""
    return [_payload_types[name] for name in names if name in _payload_types]


def summarize_payload(payload_type: str, data: Dict[str, Any]) -> str:
    """
    Generate a brief summary of a payload for the LLM context manifest.

    Args:
        payload_type: The type name of the payload
        data: The payload data

    Returns:
        A brief summary string (1-2 sentences max)
    """
    pt = _payload_types.get(payload_type)
    if not pt:
        return f"Unknown payload type: {payload_type}"

    if pt.summarize:
        try:
            return pt.summarize(data)
        except Exception as e:
            logger.warning(f"Failed to summarize payload {payload_type}: {e}")
            return pt.description

    # Default: just return the description
    return pt.description


# =============================================================================
# table.that Payload Registrations
# =============================================================================


def _summarize_schema_proposal(data: Dict[str, Any]) -> str:
    """Summarize a schema proposal for the payload manifest."""
    mode = data.get("mode")
    ops = data.get("operations", [])
    counts = {}
    for op in ops:
        action = op.get("action", "unknown")
        counts[action] = counts.get(action, 0) + 1
    parts = []
    for action, count in counts.items():
        label = {"add": "addition", "modify": "modification", "remove": "removal"}.get(
            action, action
        )
        if count > 1:
            label += "s"
        parts.append(f"{count} {label}")
    summary = ", ".join(parts) if parts else "empty proposal"
    table_name = data.get("table_name")
    if table_name:
        summary = f'"{table_name}" — {summary}'
    prefix = "Create table" if mode == "create" else "Schema proposal"
    return f"{prefix}: {summary}"


def _summarize_data_proposal(data: Dict[str, Any]) -> str:
    """Summarize a data proposal for the payload manifest."""
    ops = data.get("operations", [])
    counts = {}
    for op in ops:
        action = op.get("action", "unknown")
        counts[action] = counts.get(action, 0) + 1
    parts = []
    for action, count in counts.items():
        label = {"add": "addition", "update": "update", "delete": "deletion"}.get(
            action, action
        )
        if count > 1:
            label += "s"
        parts.append(f"{count} {label}")
    return f"Data proposal: {', '.join(parts)}" if parts else "Data proposal: empty"


SCHEMA_PROPOSAL_INSTRUCTIONS = """SCHEMA_PROPOSAL (propose table schema changes):
When the user asks you to create a table, add/remove/modify columns, change column types, reorder columns, or rename the table, respond with a SCHEMA_PROPOSAL in your message text.

Format — write this as TEXT in your message (not a tool call):
SCHEMA_PROPOSAL: {
  "mode": "create|update",
  "reasoning": "Brief explanation of what changes you're proposing",
  "table_name": "Table Name",
  "table_description": "Description",
  "operations": [
    { "action": "add", "column": { "name": "Col Name", "type": "text|number|date|boolean|select", "required": true|false, "options": ["a","b"] } },
    { "action": "add", "column": { ... }, "after_column_id": "col_xxx" },
    { "action": "modify", "column_id": "col_xxx", "changes": { "name": "New Name", "type": "select", "options": [...], "required": true } },
    { "action": "remove", "column_id": "col_xxx" },
    { "action": "reorder", "column_id": "col_xxx", "after_column_id": "col_yyy" }
  ]
}

Rules:
- "mode" is REQUIRED. Set "create" when proposing a brand-new table, "update" when modifying an existing table.
  - create: only "add" operations are valid; table_name and table_description are required.
  - update: all operations are valid; table_name and table_description are optional (only include if renaming/changing description).
- Use column NAMES when adding columns. Use column IDs (from context) when modifying/removing/reordering.
- For select columns, always include the full options list (not just additions).
- filterDisplay controls the filter UI for select columns: "tab" for inline buttons, "dropdown" for a dropdown chip. Always use a string value, never null.
- Always include a brief "reasoning" field.
- The user will see this as an interactive proposal card in the chat panel. For new tables, the button says **Create Table**. For schema updates, it says **Apply**. They can uncheck individual changes before acting."""


DATA_PROPOSAL_INSTRUCTIONS = """DATA_PROPOSAL (propose bulk data changes):
When the user asks you to add multiple rows, update multiple rows, delete multiple rows, or make bulk changes to data, respond with a DATA_PROPOSAL in your message text.

Format — write this as TEXT in your message (not a tool call):
DATA_PROPOSAL: {
  "reasoning": "Brief explanation of what data changes you're proposing",
  "operations": [
    { "action": "add", "data": { "Column Name": "value", "Another Column": 42 } },
    { "action": "update", "row_id": 5, "changes": { "Column Name": "new value" } },
    { "action": "delete", "row_id": 12 }
  ]
}

Rules:
- Use column NAMES (not IDs) in data values and changes.
- For updates, only include the columns being changed (not all columns).
- For adds, include values for all relevant columns.
- The user will see this as an interactive proposal card in the chat panel showing additions (green), updates (amber), and deletions (red). They can uncheck individual operations, then click **Apply** to execute or **Cancel** to dismiss.

When to use DATA_PROPOSAL vs direct tools:
- Single row + explicit user request → use create_row/update_row/delete_row tools directly
- Multiple rows, or user says "add some sample data", "update all X", "mark these as Y" → use DATA_PROPOSAL
- When in doubt, prefer DATA_PROPOSAL so the user can review before changes are applied."""


# -- Schema for a column definition inside a schema_proposal add operation
_COLUMN_DEF_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string", "description": "Column display name"},
        "type": {
            "type": "string",
            "enum": ["text", "number", "date", "boolean", "select"],
        },
        "required": {"type": "boolean"},
        "options": {
            "type": "array",
            "items": {"type": "string"},
            "description": "Options for select-type columns",
        },
        "filterDisplay": {
            "type": "string",
            "enum": ["tab", "dropdown"],
            "description": "'tab' for inline filter buttons, 'dropdown' for dropdown chip (default). Only for select columns.",
        },
    },
    "required": ["name", "type"],
}

# -- Schema for individual schema operations
_SCHEMA_OPERATION = {
    "oneOf": [
        {
            "type": "object",
            "description": "Add a new column",
            "properties": {
                "action": {"const": "add"},
                "column": _COLUMN_DEF_SCHEMA,
                "after_column_id": {
                    "type": "string",
                    "description": "Insert after this column ID (optional)",
                },
            },
            "required": ["action", "column"],
        },
        {
            "type": "object",
            "description": "Modify an existing column",
            "properties": {
                "action": {"const": "modify"},
                "column_id": {
                    "type": "string",
                    "description": "ID of the column to modify (e.g. col_abc123)",
                },
                "changes": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "type": {
                            "type": "string",
                            "enum": ["text", "number", "date", "boolean", "select"],
                        },
                        "required": {"type": "boolean"},
                        "options": {"type": "array", "items": {"type": "string"}},
                        "filterDisplay": {
                            "type": "string",
                            "enum": ["tab", "dropdown"],
                        },
                    },
                },
            },
            "required": ["action", "column_id", "changes"],
        },
        {
            "type": "object",
            "description": "Remove a column",
            "properties": {
                "action": {"const": "remove"},
                "column_id": {
                    "type": "string",
                    "description": "ID of the column to remove",
                },
            },
            "required": ["action", "column_id"],
        },
        {
            "type": "object",
            "description": "Reorder a column",
            "properties": {
                "action": {"const": "reorder"},
                "column_id": {
                    "type": "string",
                    "description": "ID of the column to move",
                },
                "after_column_id": {
                    "type": "string",
                    "description": "Place after this column ID (omit for first position)",
                },
            },
            "required": ["action", "column_id"],
        },
    ]
}

# -- Schema for individual data operations
_DATA_OPERATION = {
    "oneOf": [
        {
            "type": "object",
            "description": "Add a new row",
            "properties": {
                "action": {"const": "add"},
                "data": {
                    "type": "object",
                    "description": "Column name → value pairs for the new row",
                    "additionalProperties": True,
                },
            },
            "required": ["action", "data"],
        },
        {
            "type": "object",
            "description": "Update an existing row",
            "properties": {
                "action": {"const": "update"},
                "row_id": {"type": "integer", "description": "ID of the row to update"},
                "changes": {
                    "type": "object",
                    "description": "Column name → new value pairs (only changed columns)",
                    "additionalProperties": True,
                },
            },
            "required": ["action", "row_id", "changes"],
        },
        {
            "type": "object",
            "description": "Delete a row",
            "properties": {
                "action": {"const": "delete"},
                "row_id": {"type": "integer", "description": "ID of the row to delete"},
            },
            "required": ["action", "row_id"],
        },
    ]
}

# schema_proposal: for proposing new tables or schema changes
register_payload_type(
    PayloadType(
        name="schema_proposal",
        description="Proposed schema changes for the table",
        schema={
            "type": "object",
            "properties": {
                "mode": {
                    "type": "string",
                    "enum": ["create", "update"],
                    "description": "'create' for new table, 'update' for modifying existing table",
                },
                "reasoning": {
                    "type": "string",
                    "description": "Why these changes are proposed",
                },
                "table_name": {
                    "type": "string",
                    "description": "New table name (required for create, optional for update/rename)",
                },
                "table_description": {
                    "type": "string",
                    "description": "New table description (required for create, optional for update)",
                },
                "operations": {
                    "type": "array",
                    "items": _SCHEMA_OPERATION,
                    "description": "List of schema operations to apply",
                    "minItems": 1,
                },
            },
            "required": ["mode", "operations"],
        },
        source="llm",
        is_global=False,
        parse_marker="SCHEMA_PROPOSAL:",
        parser=make_json_parser("schema_proposal"),
        llm_instructions=SCHEMA_PROPOSAL_INSTRUCTIONS,
        summarize=_summarize_schema_proposal,
    )
)

# data_proposal: for proposing bulk data changes (add/update/delete rows)
register_payload_type(
    PayloadType(
        name="data_proposal",
        description="Proposed bulk data changes (additions, updates, deletions)",
        schema={
            "type": "object",
            "properties": {
                "reasoning": {
                    "type": "string",
                    "description": "Why these changes are proposed",
                },
                "operations": {
                    "type": "array",
                    "items": _DATA_OPERATION,
                    "description": "List of data operations to apply (adds, updates, deletes)",
                    "minItems": 1,
                },
            },
            "required": ["operations"],
        },
        source="llm",
        is_global=False,
        parse_marker="DATA_PROPOSAL:",
        parser=make_json_parser("data_proposal"),
        llm_instructions=DATA_PROPOSAL_INSTRUCTIONS,
        summarize=_summarize_data_proposal,
    )
)
