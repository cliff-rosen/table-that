# Chat System Architecture

This guide explains how the chat system works and how to add chat to a new page.

## Core Concepts

The chat system gives the LLM two types of capabilities:

| Capability | How It Works | Defined In |
|------------|--------------|------------|
| **Tools** | LLM calls a function → function returns data | `tools/builtin/{category}.py` |
| **LLM Payloads** | LLM writes structured output → system parses it | `schemas/payloads.py` |

Both can produce **payloads** - structured data that the frontend renders as interactive cards.

### Tools vs LLM Payloads

```
TOOLS (external capabilities)
─────────────────────────────
LLM decides to call: get_report_articles(report_id=5)
                            │
                            ▼
              Tool executes, queries DB
                            │
                            ▼
              Returns: ToolResult(
                  text="Found 10 articles...",
                  payload={type: "article_list", data: {...}}
              )

LLM PAYLOADS (structured output)
────────────────────────────────
LLM writes in response: "Here's my suggestion:
                         SCHEMA_PROPOSAL: {"changes": {...}}"
                            │
                            ▼
              System finds marker, parses JSON
                            │
                            ▼
              Extracts: {type: "schema_proposal", data: {...}}
```

**When to use which:**
- **Tools**: When you need to fetch/compute data the LLM doesn't have
- **LLM Payloads**: When you want the LLM to output structured suggestions/proposals

### Other Concepts

| Concept | Purpose | Defined In |
|---------|---------|------------|
| **Page Config** | What tools/payloads are available on a page | `chat_page_config/{page}.py` |
| **Payload Manifest** | Tracks payloads from conversation history | Automatic |

## How It Works

```
User sends message
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  ChatStreamService builds system prompt from:               │
│                                                             │
│  1. Identity (page-specific or default)                     │
│  2. Context (what user is viewing - from context_builder)   │
│  3. Stream instructions (if applicable)                     │
│  4. Payload manifest (previous payloads in conversation)    │
│  5. Available tools (global + page + tab)                   │
│  6. Client actions (things LLM can suggest UI do)           │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  LLM processes message, may call tools                      │
│                                                             │
│  Tool returns ToolResult:                                   │
│    - text: What LLM sees                                    │
│    - payload: {type, data} for frontend rendering           │
└─────────────────────────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────────────────┐
│  Frontend receives response                                 │
│                                                             │
│  - Text streams to chat                                     │
│  - Payload rendered via payloadHandlers[type].render()      │
│  - Payload saved to conversation (for manifest next turn)   │
└─────────────────────────────────────────────────────────────┘
```

## File Structure

```
backend/
├── services/chat_page_config/
│   ├── registry.py          # PageConfig, TabConfig, register_page()
│   ├── __init__.py           # Imports all page configs
│   ├── reports.py            # Example: reports page config
│   └── {page_name}.py        # Your new page config
├── schemas/
│   └── payloads.py           # PayloadType definitions + registry
├── tools/
│   ├── registry.py           # ToolConfig, register_tool()
│   └── builtin/
│       ├── reports.py        # Report tools
│       └── {category}.py     # Your tools
└── services/
    └── chat_stream_service.py  # Orchestrates everything

frontend/
└── src/components/chat/
    └── ChatTray.tsx          # Chat UI component
```

---

## Backend: Page Configuration

### PageConfig Structure

```python
register_page(
    page="my_page",                    # Unique page identifier
    context_builder=build_context,      # Function returning context string
    identity=CUSTOM_IDENTITY,           # Optional: custom system prompt
    tools=["tool_a", "tool_b"],         # Optional: page-wide tools (by name)
    payloads=["payload_a"],             # Optional: page-wide payloads (by name)
    tabs={                              # Optional: tab-specific config
        "tab1": TabConfig(
            tools=["tab1_tool"],
            payloads=["tab1_payload"],
            subtabs={                   # Optional: subtab-specific
                "subtab1": SubTabConfig(tools=["subtab_tool"])
            }
        )
    },
    client_actions=[                    # Optional: UI actions LLM can suggest
        ClientAction(action="navigate_to_item", description="...", parameters=["id"])
    ]
)
```

### Resolution Logic

Tools and payloads are resolved as: **global + page + tab + subtab**

- `is_global=True` on tool/payload → available everywhere
- `is_global=False` → must be listed in page/tab config

### Example Page Config

```python
# backend/services/chat_page_config/my_page.py

from typing import Dict, Any
from .registry import register_page, ClientAction

# Custom identity (optional - omit to use default)
MY_PAGE_IDENTITY = """You are an assistant helping users with...

You have access to tools that let you:
- Do X
- Do Y
"""

def build_context(context: Dict[str, Any]) -> str:
    """Tell the LLM what the user is currently viewing."""
    item_id = context.get("item_id")
    item_name = context.get("item_name")

    parts = ["Page: My Page"]
    if item_id:
        parts.append(f"Viewing: {item_name} (ID {item_id})")
    else:
        parts.append("No item selected")

    return "\n".join(parts)

register_page(
    page="my_page",
    context_builder=build_context,
    identity=MY_PAGE_IDENTITY,
    client_actions=[
        ClientAction(action="select_item", description="Select an item", parameters=["item_id"])
    ]
    # Tools are global, so not listed here
)
```

Don't forget to import in `__init__.py`:
```python
from . import my_page
```

---

## Backend: Tools

Tools are functions the LLM can call. Most tools are global (available everywhere).

### ToolConfig Structure

```python
# backend/tools/builtin/my_tools.py

from tools.registry import ToolConfig, ToolResult, register_tool

async def execute_my_tool(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> ToolResult:
    """Tool implementation."""
    item_id = params.get("item_id")

    # Do work...
    items = await some_service.get_items(item_id)

    # Return text for LLM + payload for frontend
    return ToolResult(
        text=f"Found {len(items)} items: {', '.join(i.name for i in items)}",
        payload={
            "type": "item_list",
            "data": {"items": [i.to_dict() for i in items], "total": len(items)}
        }
    )

register_tool(ToolConfig(
    name="get_items",
    description="Get items for a category",
    input_schema={
        "type": "object",
        "properties": {
            "item_id": {"type": "integer", "description": "Item ID"}
        },
        "required": ["item_id"]
    },
    executor=execute_my_tool,
    category="my_category",
    is_global=True  # Default - available on all pages
))
```

### Key Points

- Tools can be sync or async (async preferred)
- Return `ToolResult(text=..., payload=...)` for UI rendering
- Return plain string if no payload needed
- Use services, not raw DB queries

---

## Backend: Payloads

Payloads are structured data for frontend rendering. There are two types:

### Tool Payloads (source="tool")

Returned by tools. Simple - just register the type for the manifest.

```python
# backend/schemas/payloads.py

def _summarize_item_list(data: Dict[str, Any]) -> str:
    """Brief summary for payload manifest."""
    return f"List of {data.get('total', 0)} items"

register_payload_type(PayloadType(
    name="item_list",
    description="List of items",
    source="tool",
    is_global=True,
    summarize=_summarize_item_list,
    schema={"type": "object", "properties": {"items": {"type": "array"}}}
))
```

### LLM Payloads (source="llm")

Generated by the LLM in its response text. Requires additional fields:

```python
register_payload_type(PayloadType(
    name="schema_proposal",
    description="Proposed changes to configuration",
    source="llm",
    is_global=False,  # Must be enabled per page

    # These make it work:
    parse_marker="SCHEMA_PROPOSAL:",           # Marker to find in LLM output
    parser=make_json_parser("schema_proposal"), # Extracts and validates JSON
    llm_instructions="""                        # Injected into system prompt
SCHEMA_PROPOSAL - Use when user asks for recommendations:

SCHEMA_PROPOSAL: {
  "proposed_changes": {"field": "value"},
  "reasoning": "Why these changes..."
}
""",
    summarize=_summarize_schema_proposal,
    schema={...}
))
```

**How LLM payloads work:**
1. `llm_instructions` is added to system prompt (under "STRUCTURED RESPONSES")
2. LLM writes `SCHEMA_PROPOSAL: {...}` in its response
3. `_parse_response()` finds the marker and extracts JSON
4. Parsed payload is sent to frontend like any other payload

### Payload Manifest

All payloads (tool or LLM) are saved to conversation history. On subsequent turns, the LLM sees:

```
== CONVERSATION DATA ==
AVAILABLE PAYLOADS (use get_payload tool to retrieve full data):
- [abc123] List of 5 items
- [def456] Schema proposal with 3 changes
```

The LLM can call `get_payload(payload_id="abc123")` to retrieve full data without stuffing context.

---

## Frontend: ChatTray

The frontend renders payloads via `payloadHandlers`.

```tsx
<ChatTray
    initialContext={{
        current_page: "my_page",
        active_tab: activeTab,      // Important for tab-specific tools/payloads
        item_id: selectedItem?.id,
        item_name: selectedItem?.name,
    }}
    payloadHandlers={{
        item_list: {
            render: (payload, callbacks) => (
                <ItemListCard
                    data={payload}
                    onAccept={callbacks.onAccept}
                    onReject={callbacks.onReject}
                />
            ),
            onAccept: (data) => handleAccept(data),
            onReject: () => handleReject(),
        }
    }}
/>
```

### Payload Handler Options

```typescript
{
    render: (payload, callbacks) => ReactNode,  // How to display
    onAccept?: (data) => void,                   // Accept button handler
    onReject?: () => void,                       // Reject button handler
    renderOptions?: {
        panelWidth?: string,
        headerTitle?: string,
        headerIcon?: string,
    }
}
```

---

## Checklist: Adding Chat to a New Page

### Backend

1. **Create page config**: `backend/services/chat_page_config/{page}.py`
   - [ ] Define `build_context()` function
   - [ ] Define custom identity (optional)
   - [ ] Define client actions (optional)
   - [ ] Call `register_page()` with tools/payloads lists

2. **Import in `__init__.py`**: `from . import {page}`

3. **Create tools** (if fetching/computing data): `backend/tools/builtin/{category}.py`
   - [ ] Implement async tool function
   - [ ] Register with `register_tool()`
   - [ ] Return `ToolResult` with payload for frontend rendering

4. **Register payloads**: `backend/schemas/payloads.py`

   For **tool payloads**:
   - [ ] Define `summarize` function
   - [ ] Register with `source="tool"`

   For **LLM payloads** (structured output):
   - [ ] Define `parse_marker`, `parser`, `llm_instructions`
   - [ ] Define `summarize` function
   - [ ] Register with `source="llm"`
   - [ ] Add payload name to page config

### Frontend

5. **Add ChatTray to page component**
   - [ ] Pass `initialContext` with `current_page`, `active_tab`, relevant IDs
   - [ ] Define `payloadHandlers` for each payload type

6. **Create payload card components** (if needed)
   - [ ] Render payload data
   - [ ] Handle accept/reject actions

### Test

- [ ] Context appears correctly in diagnostics
- [ ] Tools are available (check diagnostics)
- [ ] LLM payload instructions appear in system prompt (check diagnostics)
- [ ] Payloads render in chat
- [ ] Payload manifest appears on subsequent turns
