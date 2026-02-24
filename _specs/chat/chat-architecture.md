# Chat System Architecture

## Overview

The chat system provides an intelligent, context-aware assistant that understands where the user is in the application and what they're working on. It combines streaming LLM interactions with tool execution to help users explore research, manage streams, and work with their data.

### Core Capabilities

| Capability | Description |
|------------|-------------|
| **Page Context** | The assistant knows what page you're on, what report/stream/article you're viewing, and adapts its behavior accordingly |
| **Tool Execution** | The LLM can call tools (search PubMed, fetch articles, etc.) and the system streams progress updates in real-time |
| **Rich Payloads** | Tools and the LLM can return structured data that renders as interactive cards, tables, or custom UI |
| **Interactive Suggestions** | The assistant can offer clickable suggestions and action buttons to guide the conversation |
| **Conversation Persistence** | Conversations are saved and can be continued across sessions |

---

## Chat Assistance Philosophy

The chat system serves as an expert colleague who can see what the user is doing. It has two roles:

### 1. Guide & Facilitate

Make it easier for users to navigate and use the application. This includes:

- **Constructing queries**: Building proper syntax (PubMed queries, search filters) the user doesn't know
- **Filling forms**: Populating search fields, filter criteria, or configurations from natural language
- **Setting up features**: Creating AI columns with well-crafted criteria
- **Walking through workflows**: Guiding multi-step processes with actionable steps
- **Discovering features**: Surfacing capabilities the user didn't know existed

This is about **helping users drive the application**. Chat does the work, user approves—when chat suggests a query or configuration, it returns a payload the user can **Accept** (apply immediately) or **Dismiss**.

```
User: "I want to find EGFR resistance articles"
Chat: "Here's a well-formed PubMed query for that:"

┌─────────────────────────────────────────────────┐
│ Suggested Query                                 │
│                                                 │
│ (EGFR[MeSH] OR "epidermal growth factor        │
│ receptor") AND (resistance OR resistant) AND   │
│ (lung neoplasms[MeSH] OR "lung cancer")        │
│                                                 │
│ [Accept]  [Dismiss]                             │
└─────────────────────────────────────────────────┘

User clicks Accept → Query populates the search field
```

### 2. Enhance

Add an intelligence layer over the data in the app. This includes:

- **Analyze loaded results**: Answer questions about current data
- **Synthesize patterns**: Identify trends across many items
- **Cross-reference**: Find relationships the user would miss
- **Compute insights**: Statistics, distributions, comparisons

This is about **capabilities beyond what the UI offers**—the LLM can see all the data and reason about it.

```
User: [Has 35 trials loaded]
User: "What's the most common phase among these?"

Chat: "Looking at your 35 trials:
- Phase 3: 18 trials (51%)
- Phase 2: 12 trials (34%)
- Phase 1: 5 trials (14%)

The majority are late-stage trials."
```

### When to Guide vs. Enhance

| User Intent | Mode | Reasoning |
|-------------|------|-----------|
| "Find EGFR resistance articles" | Guide | Construct query, return payload |
| "Help me write a better query" | Guide | Actionable output (query suggestion payload) |
| "I want to filter to only Phase 3" | Guide | Set up AI column, return payload |
| "Which trials have OS as primary endpoint?" | Enhance | Factual question, analyze loaded data |
| "What patterns do you see?" | Enhance | Synthesis across results |
| "Am I missing relevant articles?" | Guide | Suggest broader query, walk through comparison |
| "How do I compare searches?" | Guide | Explain workflow with actionable steps |

### Payloads Enable Guide Mode

The payload system is how chat **does the work** for the user. Common actionable payloads:

| Payload Type | Accept Action | Use Case |
|--------------|---------------|----------|
| `query_suggestion` | Populates search field | Query formulation |
| `ai_column_suggestion` | Creates AI column with criteria | Filtering/enrichment |
| `trial_search_suggestion` | Populates trial search form | TrialScout searches |
| `filter_suggestion` | Applies filter to results | Quick filtering |

---

## Core Concepts: Entity Relationships

Understanding the relationship between the four core entities is key to understanding the entire system.

### The Four Entities

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DEFINITIONS                                        │
│         (What exists - don't know about pages)                               │
│                                                                              │
│   ┌─────────────────────────┐      ┌─────────────────────────┐              │
│   │      PayloadType        │      │       ToolConfig        │              │
│   │  (schemas/payloads.py)  │      │   (tools/registry.py)   │              │
│   ├─────────────────────────┤      ├─────────────────────────┤              │
│   │ • name                  │      │ • name                  │              │
│   │ • schema                │      │ • input_schema          │              │
│   │ • is_global             │      │ • executor              │              │
│   │ • parse_marker          │      │ • is_global             │              │
│   │ • parser                │      │ • payload_type (ref)    │              │
│   │ • llm_instructions      │      └─────────────────────────┘              │
│   └─────────────────────────┘                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ referenced by name
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                          CONFIGURATIONS                                      │
│         (How pages use them - reference definitions by name)                 │
│                                                                              │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                          PageConfig                                  │   │
│   │                (chat_page_config/<page>.py)                          │   │
│   ├─────────────────────────────────────────────────────────────────────┤   │
│   │ • context_builder: (context) → str                                  │   │
│   │ • payloads: ["payload_a", "payload_b"]     ← page-wide              │   │
│   │ • tools: ["tool_x"]                        ← page-wide              │   │
│   │ • tabs: {                                                           │   │
│   │     "tab1": TabConfig(payloads=[...], tools=[...])                 │   │
│   │     "tab2": TabConfig(payloads=[...], tools=[...])                 │   │
│   │   }                                                                 │   │
│   │ • client_actions: [...]                                             │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Principles

**1. Definitions don't know about pages**

PayloadType and ToolConfig are pure definitions. They describe *what* a payload or tool is, not *where* it's used. This keeps them reusable and maintainable.

```python
# PayloadType just defines the payload - no page references
register_payload_type(PayloadType(
    name="schema_proposal",
    is_global=False,  # Just says "not everywhere by default"
    parse_marker="SCHEMA_PROPOSAL:",
    parser=make_json_parser("schema_proposal"),
    llm_instructions="...",
    schema={...}
))
```

**2. Pages declare what they use**

PageConfig references payloads and tools by name. This is where the connection happens.

```python
# PageConfig references payloads by name
register_page(
    page="edit_stream",
    payloads=["schema_proposal"],  # ← references the PayloadType by name
    tabs={
        "semantic": TabConfig(payloads=["validation_results"]),
    }
)
```

**3. The `is_global` flag controls defaults**

| `is_global` | Meaning |
|-------------|---------|
| `True` | Automatically available on ALL pages (no config needed) |
| `False` | Only available when explicitly added to a page/tab config |

Most tools are `is_global=True` (useful everywhere). Most LLM payloads are `is_global=False` (page-specific).

**4. Resolution is always: global + page + tab + subtab + stream instructions**

When the system needs to know what tools/payloads are available for a request:

```
Available = (all where is_global=True)
          + (page-wide from PageConfig)
          + (tab-specific from TabConfig)
          + (subtab-specific from SubTabConfig)

System Prompt = context_builder output
              + payload instructions (llm_instructions)
              + stream-specific instructions (if stream_id provided)
```

**5. Stream Instructions add per-stream customization**

Each research stream can have optional `chat_instructions` that customize how the LLM responds for that stream's context:

| Field | Where | Purpose |
|-------|-------|---------|
| `chat_instructions` | `ResearchStream.chat_instructions` | Optional text that gets added to the system prompt when the user is working in that stream's context |

```python
# Example: A stream for oncology research might have:
chat_instructions = """
When discussing articles in this stream:
- Focus on clinical trial methodology and patient outcomes
- Highlight drug interactions and contraindications
- Note any biomarker or genetic targets mentioned
"""
```

These instructions are loaded by `_get_stream_instructions()` when a `stream_id` is present in the request context.

### Visual Summary

```
                    ┌────────────────────────┐
                    │  User on page          │
                    │  "edit_stream"         │
                    │  tab: "execute"        │
                    │  subtab: "workbench"   │
                    │  stream_id: 42         │
                    └────────┬───────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │           RESOLUTION                    │
        │                                         │
        │  Tools = global tools                   │
        │        + page tools                     │
        │        + tab tools                      │
        │        + subtab tools                   │
        │                                         │
        │  Payloads = global payloads             │
        │           + page payloads               │
        │           + tab payloads                │
        │           + subtab payloads             │
        └────────────────────────────────────────┘
                             │
                             ▼
        ┌────────────────────────────────────────┐
        │  System prompt includes:                │
        │  • Context from context_builder         │
        │  • Instructions for each payload        │
        │  • Tool definitions for Anthropic API   │
        │  • Stream-specific instructions         │
        │    (from ResearchStream.chat_instruc-   │
        │    tions if stream_id is present)       │
        └────────────────────────────────────────┘
```

### Where Things Live

| Entity | File | Purpose |
|--------|------|---------|
| **PayloadType** | `schemas/payloads.py` | Single source of truth for all payload definitions |
| **ToolConfig** | `tools/registry.py` | Single source of truth for all tool definitions |
| **PageConfig** | `chat_page_config/<page>.py` | Per-page configuration that references payloads/tools |
| **TabConfig** | (within PageConfig) | Tab-specific subset of payloads/tools |
| **SubTabConfig** | (within TabConfig) | Subtab-specific subset for finer control |
| **Stream Instructions** | `ResearchStream.chat_instructions` | Per-stream customization for LLM behavior |

---

## 1. Page Context System

The chat adapts to the user's current location in the app. This is the foundation that makes the assistant useful.

### Context Design Principle

**If the user sees it on screen and it's dynamic, it should be in the context.**

This is critical because:
- The user might ask "Why did I get so few results?" but the answer is that they have a narrow date filter
- Without seeing all UI state, the LLM can't diagnose obvious issues or provide relevant guidance
- Small, lightweight state is cheap to include and dramatically improves assistance quality

**Always include:**
- All form field values (search terms, filters, date ranges)
- Pagination state (current page, rows per page)
- Sort state (column, direction)
- Selection state (selected items)
- Modal/viewer state (what detail view is open)
- Results summary (totals, filtered counts)

**For data items** (articles, trials, etc.):
- Send summaries (id, title, key fields) - not full records
- Provide a tool (`retrieve_items`) so the LLM can fetch full details on-demand

### What Context Includes

```typescript
interface ChatContext {
    current_page: string;       // "reports", "streams", "dashboard", etc.
    report_id?: number;         // If viewing a specific report
    stream_id?: number;         // If viewing a specific stream
    current_article?: {...};    // If viewing an article detail
    active_tab?: string;        // Which tab is active on the page

    // NEW: All dynamic UI state that affects what user sees
    search_form?: {...};        // All search form fields
    pagination?: {...};         // Current page, rows per page
    sort?: {...};               // Current sort column/direction
    results?: {...};            // Counts: total, loaded, filtered, visible
    viewer?: {...};             // What detail modal is open
    item_summaries?: [...];     // Brief info for loaded items
}
```

### How Context is Used

Each page can register:
1. **Context Builder** - A function that generates page-specific LLM instructions
2. **Tabs** - Tab-specific tools and payloads
3. **Page-wide Payloads/Tools** - Available on all tabs
4. **Client Actions** - What actions the UI can handle from this page

```python
# backend/services/chat_page_config/edit_stream.py

def build_context(context: Dict[str, Any]) -> str:
    active_tab = context.get("active_tab", "semantic")
    current_schema = context.get("current_schema", {})
    # ... build page-specific context for the LLM

register_page(
    page="edit_research_stream",
    context_builder=build_context,
    tabs={
        "semantic": TabConfig(
            payloads=["schema_proposal", "validation_results"],
        ),
        "retrieval": TabConfig(
            payloads=["retrieval_proposal"],
        ),
        "execute": TabConfig(
            payloads=["query_suggestion", "filter_suggestion"],
        ),
    },
    client_actions=CLIENT_ACTIONS
)
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/services/chat_page_config/registry.py` | Page registration framework |
| `backend/services/chat_page_config/<page>.py` | Per-page context and config |
| `backend/services/chat_stream_service.py` | Assembles full system prompt with context |

---

## 2. Tool System

The LLM can call tools to perform actions and retrieve information. Tools can be **global** (available on all pages) or **page/tab-specific**.

### Tool Scope

| Scope | `is_global` | Example |
|-------|-------------|---------|
| Global | `True` (default) | `search_pubmed` - useful anywhere |
| Page-specific | `False` | `compare_reports` - only when added to page config |

### Tool Registration

```python
# backend/tools/builtin/pubmed.py

register_tool(ToolConfig(
    name="search_pubmed",
    description="Search PubMed for research articles",
    input_schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query"},
            "max_results": {"type": "integer", "default": 10}
        },
        "required": ["query"]
    },
    executor=execute_search_pubmed,
    category="research",
    payload_type="pubmed_search_results",  # What structured data this tool returns
    is_global=True  # Available on all pages (default)
))

# Non-global tool (must be explicitly added to page config)
register_tool(ToolConfig(
    name="compare_reports",
    description="Compare two reports to see changes",
    input_schema={...},
    executor=execute_compare_reports,
    is_global=False  # Must be added to page/tab config
))
```

### Tool Resolution

Tools are resolved as: **global tools + page tools + tab tools**

```python
# In page config, add non-global tools to specific pages/tabs
register_page(
    page="reports",
    context_builder=build_context,
    tools=["compare_reports"],  # Page-wide tools
    tabs={
        "analysis": TabConfig(
            tools=["run_analysis"],  # Tab-specific tools
        ),
    }
)
```

### Tool Execution Flow

```
User message → LLM decides to use tool → Agent loop executes tool
    ↓
Tool returns ToolResult(text=..., payload=...)
    ↓
LLM sees text result, formulates response
    ↓
Frontend receives payload, renders rich UI
```

### Streaming Tools

Tools can stream progress updates for long-running operations:

```python
def execute_long_search(params, db, user_id, context):
    yield ToolProgress(stage="searching", message="Searching...", progress=0.2)
    results = search(...)
    yield ToolProgress(stage="processing", message="Processing...", progress=0.8)
    return ToolResult(text="Found results", payload={...})
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/tools/registry.py` | ToolConfig, ToolResult, ToolProgress definitions |
| `backend/tools/builtin/*.py` | Tool implementations |
| `backend/agents/agent_loop.py` | Executes tools, handles streaming, collects results |

---

## 3. Rich Payloads

Beyond plain text, the chat can display structured data as interactive UI components. Payloads can come from either tools or the LLM itself, and can be **global** or **page/tab-specific**.

### Payload Sources and Scope

| Source | `is_global` | Example |
|--------|-------------|---------|
| Tool | `True` | `pubmed_search_results` (global tool payload) |
| LLM | `True` | A help card that could appear on any page |
| LLM | `False` | `schema_proposal` (only on stream editing pages) |

### Central Payload Registry (Single Source of Truth)

All payloads are defined in `schemas/payloads.py`. This is the **single source of truth** for:
- Type name and description
- JSON schema for validation
- Source: "tool" or "llm"
- Scope: `is_global=True` for global, `is_global=False` for page-specific
- For LLM payloads: parse_marker, parser, and llm_instructions

```python
# backend/schemas/payloads.py

# Global tool payload
register_payload_type(PayloadType(
    name="pubmed_search_results",
    description="Results from a PubMed search query",
    source="tool",
    is_global=True,  # Available on all pages
    schema={...}
))

# Page-specific LLM payload (complete definition in one place)
register_payload_type(PayloadType(
    name="schema_proposal",
    description="Proposed changes to a research stream schema",
    source="llm",
    is_global=False,  # Must be added to page/tab config
    parse_marker="SCHEMA_PROPOSAL:",
    parser=make_json_parser("schema_proposal"),
    llm_instructions="""
SCHEMA_PROPOSAL - Use when user asks for recommendations:

SCHEMA_PROPOSAL: {
  "proposed_changes": {...},
  "confidence": "high",
  "reasoning": "..."
}
""",
    schema={...}
))
```

### Payload Resolution

Payloads are resolved as: **global payloads + page payloads + tab payloads**

```python
# In page config, reference payloads by name
register_page(
    page="edit_research_stream",
    context_builder=build_context,
    tabs={
        "semantic": TabConfig(
            payloads=["schema_proposal", "validation_results"],
        ),
    }
)
```

### Tool Payloads vs LLM Payloads

**Tool Payloads**: Tools return structured data alongside text
```python
return ToolResult(
    text="Found 15 articles matching your query...",
    payload={
        "type": "pubmed_search_results",
        "data": {"query": "...", "articles": [...]}
    }
)
```

**LLM Payloads**: The LLM outputs a marker that gets parsed
```
LLM output: "Here's my proposed schema:
SCHEMA_PROPOSAL: {"stream_name": "...", "topics": [...]}"

→ Parsed into: custom_payload = {type: "schema_proposal", data: {...}}
```

### Frontend Rendering

The frontend has a payload handler registry that maps type names to React components:

```typescript
// frontend/src/lib/chat/payloads.ts

registerPayloadHandler('pubmed_search_results', {
    render: (data) => <PubMedSearchResultsCard data={data} />
});

registerPayloadHandler('schema_proposal', {
    render: (data, callbacks) => (
        <SchemaProposalCard
            proposal={data}
            onAccept={callbacks.onAccept}
            onReject={callbacks.onReject}
        />
    )
});
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/schemas/payloads.py` | Central payload type registry (SINGLE SOURCE OF TRUTH) |
| `backend/services/chat_page_config/<page>.py` | Page configs that reference payloads by name |
| `frontend/src/lib/chat/payloadRegistry.ts` | Frontend handler registry |
| `frontend/src/lib/chat/payloads.ts` | Handler registrations |

---

## 4. Suggested Values and Actions

The LLM can provide interactive elements that guide the user through a conversation.

### Suggested Values

Clickable chips that send a pre-filled message when clicked:

```typescript
suggested_values: [
    { label: "Yes", value: "Yes, please proceed with that" },
    { label: "No", value: "No, let me reconsider" },
    { label: "Show more", value: "Show me more results" }
]
```

The frontend renders these as chips below the assistant's message. Clicking one sends the `value` as the user's next message.

### Suggested Actions

Buttons that trigger specific handlers:

```typescript
suggested_actions: [
    { label: "View Report", action: "navigate_to_report", handler: "client" },
    { label: "Run Analysis", action: "run_analysis", handler: "server" }
]
```

- **Client handlers**: Execute in the frontend (navigation, UI changes)
- **Server handlers**: Send an action request back to the server

### How the LLM Provides Suggestions

The LLM is instructed to output suggestions in a parseable format. The backend extracts these and includes them in the response payload.

---

## 5. Streaming Protocol

The backend uses Server-Sent Events (SSE) to stream responses in real-time.

### Event Types

```
status          → { type: "status", message: "Thinking..." }
text_delta      → { type: "text_delta", text: "..." }
tool_start      → { type: "tool_start", tool: "search_pubmed", input: {...} }
tool_progress   → { type: "tool_progress", tool: "...", stage: "...", progress: 0.5 }
tool_complete   → { type: "tool_complete", tool: "...", index: 0 }
complete        → { type: "complete", payload: ChatResponsePayload }
error           → { type: "error", message: "..." }
```

### Complete Response Payload

```typescript
interface ChatResponsePayload {
    message: string;                    // The assistant's text response
    custom_payload?: {                  // Rich structured data
        type: string;
        data: any;
    };
    suggested_values?: Array<{          // Clickable chips
        label: string;
        value: string;
    }>;
    suggested_actions?: Array<{         // Action buttons
        label: string;
        action: string;
        handler: 'client' | 'server';
    }>;
    tool_history?: Array<{              // What tools were called
        tool_name: string;
        input: any;
        output: string;
    }>;
    conversation_id?: number;           // For persistence
}
```

---

## 6. Conversation Persistence

Conversations are saved to the database for continuity across sessions.

### What Gets Saved

- User messages and assistant responses
- Tool calls and their results
- Payloads (for potential replay)
- Timestamps

### Key Service

`ChatService` (in `services/chat.py`) handles conversation CRUD operations.

---

## Key Files Summary

| Category | File | Purpose |
|----------|------|---------|
| **Core Service** | `services/chat_stream_service.py` | Main streaming chat endpoint, loads stream instructions |
| **Persistence** | `services/chat.py` | Conversation storage |
| **Agent** | `agents/agent_loop.py` | Tool execution loop |
| **Tools** | `tools/registry.py` | Tool registration |
| **Tools** | `tools/builtin/*.py` | Tool implementations |
| **Payloads** | `schemas/payloads.py` | Central payload type registry (single source of truth) |
| **Page Config** | `services/chat_page_config/registry.py` | Page registration framework |
| **Page Config** | `services/chat_page_config/<page>.py` | Per-page configs |
| **Stream Instructions** | `models.ResearchStream.chat_instructions` | Per-stream LLM customization |
| **Frontend** | `lib/chat/payloadRegistry.ts` | Payload handler registry |
| **Frontend** | `lib/chat/payloads.ts` | Payload handler registrations |
| **Frontend** | `components/chat/ChatTray.tsx` | Main chat UI |

---

## Adding Chat Support to a New Page

See [adding-chat-to-page.md](adding-chat-to-page.md) for a step-by-step guide.
