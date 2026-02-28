# Chat Integration for Tablizer and TrialScout

This document specifies how the chat system integrates with Tablizer (PubMed article analysis) and TrialScout (clinical trials analysis).

## Philosophy

Chat serves as an **expert colleague** who can see what the user is doing. It has two roles:

### 1. Guide & Facilitate

Make it easier for users to navigate and use the app. This includes:
- Constructing queries the user doesn't know the syntax for
- Filling in search forms based on natural language ("find Phase 3 NSCLC trials")
- Setting up AI columns with well-crafted criteria
- Explaining features and walking through workflows

This is about **helping users drive the application**. Chat does the work, user approves—suggestions come as cards with Accept/Dismiss buttons.

### 2. Enhance

Add an intelligence layer over the data in the app. This includes:
- Analyzing loaded results and answering questions about them
- Synthesizing patterns across many items
- Cross-referencing and identifying relationships
- Providing insights the user would have to manually compute

This is about **capabilities beyond what the UI offers**—the LLM can see all the data and reason about it.

---

## Payloads

Following the existing pattern (see `QuerySuggestionCard.tsx`), we need these payload types:

### 1. `pubmed_query_suggestion` (Tablizer)

For suggesting PubMed search queries. Can reuse existing `query_suggestion` payload or create Tablizer-specific version.

**Backend** (`schemas/payloads.py`):
```python
register_payload_type(PayloadType(
    name="pubmed_query_suggestion",
    description="Suggested PubMed query for Tablizer",
    source="llm",
    is_global=False,
    parse_marker="PUBMED_QUERY:",
    parser=make_json_parser("pubmed_query_suggestion"),
    llm_instructions="""
PUBMED_QUERY - Use when user asks to search for articles or build a query:

PUBMED_QUERY: {
  "query": "The PubMed query string",
  "explanation": "What this query searches for"
}

Example:
User: "Find EGFR resistance articles in lung cancer"
PUBMED_QUERY: {
  "query": "(EGFR[MeSH] OR \"epidermal growth factor receptor\") AND (drug resistance[MeSH] OR resistant) AND (lung neoplasms[MeSH] OR NSCLC)",
  "explanation": "Searches for EGFR-related resistance in lung cancer using MeSH terms for better coverage"
}
""",
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "explanation": {"type": "string"}
        },
        "required": ["query"]
    }
))
```

**Frontend Card** (`components/chat/PubMedQueryCard.tsx`):
- Shows the query in a code block
- Shows the explanation
- Accept button → calls `onAccept(payload)` which populates the search field
- Dismiss button

**Page Integration** (in Tablizer page):
```tsx
payloadHandlers={{
    pubmed_query_suggestion: {
        render: (payload, callbacks) => (
            <PubMedQueryCard
                query={payload.query}
                explanation={payload.explanation}
                onAccept={() => {
                    setSearchQuery(payload.query);
                    callbacks.onAccept?.(payload);
                }}
                onReject={callbacks.onReject}
            />
        )
    }
}}
```

---

### 2. `trial_search_suggestion` (TrialScout)

For suggesting ClinicalTrials.gov search parameters.

**Backend** (`schemas/payloads.py`):
```python
register_payload_type(PayloadType(
    name="trial_search_suggestion",
    description="Suggested trial search parameters for TrialScout",
    source="llm",
    is_global=False,
    parse_marker="TRIAL_SEARCH:",
    parser=make_json_parser("trial_search_suggestion"),
    llm_instructions="""
TRIAL_SEARCH - Use when user asks to search for clinical trials:

TRIAL_SEARCH: {
  "condition": "condition to search",
  "intervention": "intervention/drug to search",
  "phase": ["PHASE2", "PHASE3"],
  "status": ["RECRUITING", "ACTIVE_NOT_RECRUITING"],
  "explanation": "What this search will find"
}

All fields except explanation are optional. Only include fields the user specified or that are clearly implied.

Phase values: EARLY_PHASE1, PHASE1, PHASE2, PHASE3, PHASE4, NA
Status values: RECRUITING, ACTIVE_NOT_RECRUITING, COMPLETED, NOT_YET_RECRUITING, TERMINATED, WITHDRAWN, SUSPENDED

Example:
User: "Find Phase 3 immunotherapy trials for NSCLC"
TRIAL_SEARCH: {
  "condition": "non-small cell lung cancer",
  "intervention": "immunotherapy OR checkpoint inhibitor OR PD-1 OR PD-L1",
  "phase": ["PHASE3"],
  "status": ["RECRUITING", "ACTIVE_NOT_RECRUITING"],
  "explanation": "Phase 3 immunotherapy trials for NSCLC that are currently active"
}
""",
    schema={
        "type": "object",
        "properties": {
            "condition": {"type": "string"},
            "intervention": {"type": "string"},
            "sponsor": {"type": "string"},
            "phase": {"type": "array", "items": {"type": "string"}},
            "status": {"type": "array", "items": {"type": "string"}},
            "explanation": {"type": "string"}
        }
    }
))
```

**Frontend Card** (`components/chat/TrialSearchCard.tsx`):
- Shows each search field that has a value
- Shows explanation
- Accept button → populates the search form fields
- Dismiss button

---

### 3. `ai_column_suggestion` (Both)

For suggesting AI columns to add.

**Backend** (`schemas/payloads.py`):
```python
register_payload_type(PayloadType(
    name="ai_column_suggestion",
    description="Suggested AI column for filtering/analysis",
    source="llm",
    is_global=False,
    parse_marker="AI_COLUMN:",
    parser=make_json_parser("ai_column_suggestion"),
    llm_instructions="""
AI_COLUMN - Use when user wants to filter or categorize results:

AI_COLUMN: {
  "name": "Column display name",
  "criteria": "The criteria prompt for the AI to evaluate",
  "type": "boolean",
  "explanation": "What this column will help identify"
}

Type should be "boolean" for yes/no filtering, "text" for open-ended extraction.

Example:
User: "I only want trials that allow brain metastases"
AI_COLUMN: {
  "name": "Allows Brain Mets",
  "criteria": "Based on the eligibility criteria, does this trial allow patients with brain metastases? Consider both inclusion and exclusion criteria.",
  "type": "boolean",
  "explanation": "Will identify trials that accept patients with brain metastases, which you can then filter to show only 'Yes' results"
}

Example:
User: "Add a column for the primary endpoint"
AI_COLUMN: {
  "name": "Primary Endpoint",
  "criteria": "What is the primary endpoint of this trial? Summarize in a few words (e.g., 'Overall Survival', 'Progression-Free Survival', 'ORR').",
  "type": "text",
  "explanation": "Extracts the primary endpoint for each trial so you can quickly compare them"
}
""",
    schema={
        "type": "object",
        "properties": {
            "name": {"type": "string"},
            "criteria": {"type": "string"},
            "type": {"type": "string", "enum": ["boolean", "text"]},
            "explanation": {"type": "string"}
        },
        "required": ["name", "criteria", "type"]
    }
))
```

**Frontend Card** (`components/chat/AIColumnCard.tsx`):
- Shows column name
- Shows criteria in a text block
- Shows type (Yes/No vs Text)
- Shows explanation
- Accept button → calls the addAIColumn function
- Dismiss button

---

## Context

### Design Principle

**If the user sees it on screen, it's dynamic, and it's small → include it directly.**

If it's large, we have options:
1. **Send a reference** - include IDs/summaries, provide a tool to fetch full data
2. **Holding pen pattern** - send to orchestration layer (not model), expose via tool

The holding pen is interesting: context can be sent to the backend but held in a staging area rather than immediately sent to the model. The LLM can then pull from this staging area via a tool. This keeps the model context small while making data available on-demand.

### Tablizer Context

```typescript
{
  current_page: "tablizer",

  // Search state
  query: "EGFR lung cancer",
  date_start: "2022-01-01",  // or null
  date_end: null,

  // Results
  total_matched: 1234,
  loaded_count: 100,

  // Snapshots (search history)
  snapshots: [
    { id: "1", label: "Original search", query: "EGFR lung cancer", count: 100 },
    { id: "2", label: "Broader search", query: "EGFR NSCLC therapy", count: 250 }
  ],
  selected_snapshot_id: "1",

  // Compare mode
  compare_mode: false,
  compare_snapshots: null,  // or ["1", "2"] when comparing

  // AI columns
  ai_columns: [
    { name: "Mentions resistance", type: "boolean", filter_active: true }
  ],

  // Article summaries (for analysis) - or just IDs if too large
  articles: [
    { pmid: "12345", title: "EGFR mutations...", year: 2023, journal: "Nature" }
    // ...
  ]
}
```

### TrialScout Context

```typescript
{
  current_page: "trialscout",

  // Search state (all form fields)
  condition: "non-small cell lung cancer",
  intervention: "pembrolizumab",
  phase: ["PHASE3"],
  status: ["RECRUITING"],
  sponsor: "",

  // Results
  total_matched: 892,
  loaded_count: 50,

  // AI columns
  ai_columns: [
    { name: "Allows brain mets", type: "boolean", filter_active: false }
  ],

  // Trial summaries (for analysis) - or just IDs if too large
  trials: [
    { nct_id: "NCT04613596", title: "Study of...", phase: "Phase 3", status: "Recruiting", enrollment: 450 }
    // ...
  ]
}
```

---

## Backend Tech Spec

### Existing Services (Already Have)

| Service | Location | What It Does |
|---------|----------|--------------|
| **Chat Infrastructure** | | |
| `ChatService` | `services/chat_service.py` | Conversation/message CRUD - `create_chat()`, `add_message()`, `get_messages()` |
| `ChatStreamService` | `services/chat_stream_service.py` | Orchestrates chat flow - builds prompts, runs agent loop, streams events, persists automatically |
| `Conversation`, `Message` | `models.py` | DB models - messages have `context` and `extras` fields for page state and payloads |
| **Page Config** | | |
| `chat_page_config/` | `services/chat_page_config/` | Page registration framework - `register_page()`, context builders, payload/tool resolution |
| **Data Services** | | |
| `ClinicalTrialsService` | `services/clinical_trials_service.py` | `search_trials()`, `get_trial_by_nct_id()`, `get_trials_by_nct_ids()` |
| `PubMedService` | `services/pubmed_service.py` | Article search and retrieval |
| **Tools** | | |
| PubMed tools | `tools/builtin/pubmed.py` | `search_pubmed`, `get_pubmed_article`, `get_full_text` |

### Chat Flow (How It Works)

```
Frontend                    Backend
   │                           │
   │ POST /chat/stream         │
   │ { message, context,       │
   │   conversation_id }       │
   ├──────────────────────────>│
   │                           │ ChatStreamService.stream_chat_message()
   │                           │   ├─ _setup_chat() - create/get conversation
   │                           │   ├─ _build_system_prompt() - calls page context_builder
   │                           │   ├─ _build_messages() - load history + new message
   │                           │   ├─ get_tools_for_page_dict() - resolve tools
   │                           │   └─ run_agent_loop() - LLM + tools
   │                           │
   │ SSE: text_delta, tool_*,  │
   │      complete             │
   │<──────────────────────────│
   │                           │ auto-persist messages
```

**Key points:**
- Conversations are auto-created/retrieved via `conversation_id`
- Context from frontend is passed to `context_builder` which formats it for LLM
- Tools/payloads are resolved based on `current_page` + `active_tab`
- Messages are auto-persisted with context and extras (payloads, tool history)

### Database Changes

#### Add `app` column to Conversations table

Tablizer and TrialScout share the same users but have separate sessions. Conversations must be scoped to their app.

**Model change** (`models.py`):
```python
class Conversation(Base):
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False, index=True)
    app = Column(String(50), nullable=False, default="kh", index=True)  # NEW: "kh", "tablizer", "trialscout"
    title = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
```

**Migration**:
```sql
ALTER TABLE conversations ADD COLUMN app VARCHAR(50) NOT NULL DEFAULT 'kh';
CREATE INDEX ix_conversations_app ON conversations(app);
CREATE INDEX ix_conversations_user_app ON conversations(user_id, app);
```

**ChatService changes** (`services/chat_service.py`):
```python
def create_chat(self, user_id: int, app: str = "kh", title: str = None) -> Conversation:
    chat = Conversation(user_id=user_id, app=app, title=title)
    ...

def get_user_chats(self, user_id: int, app: str = "kh", limit: int = 50) -> List[Conversation]:
    return self.db.query(Conversation).filter(
        Conversation.user_id == user_id,
        Conversation.app == app  # Filter by app
    ).order_by(desc(Conversation.updated_at)).limit(limit).all()
```

**Schema change** (`schemas/chat.py`):
```python
class Conversation(BaseModel):
    id: int
    user_id: int
    app: str = "kh"  # NEW
    title: Optional[str] = None
    created_at: datetime
    updated_at: datetime
```

**Frontend**: Pass `app` in chat requests (or derive from `current_page`).

---

### New Backend Components Needed

#### 1. Page Configs

**`services/chat_page_config/tablizer.py`**
```python
from .registry import register_page, TabConfig

def build_tablizer_context(context: Dict[str, Any]) -> str:
    """Build context from Tablizer page state."""
    query = context.get("query", "")
    total_matched = context.get("total_matched", 0)
    loaded_count = context.get("loaded_count", 0)
    snapshots = context.get("snapshots", [])
    compare_mode = context.get("compare_mode", False)
    ai_columns = context.get("ai_columns", [])

    # Format article summaries if provided
    articles = context.get("articles", [])
    article_list = ""
    if articles:
        article_list = "\n".join([
            f"- [{a['pmid']}] {a['title'][:50]}... ({a['year']})"
            for a in articles[:20]
        ])

    return f"""User is on Tablizer (PubMed article analysis).

SEARCH STATE:
- Query: {query or "No search yet"}
- Results: {loaded_count} loaded of {total_matched} total
- Snapshots: {len(snapshots)} saved searches
- Compare mode: {"ACTIVE" if compare_mode else "inactive"}

AI COLUMNS: {len(ai_columns)} columns
{chr(10).join([f"- {c['name']} ({c['type']})" for c in ai_columns]) if ai_columns else "None"}

LOADED ARTICLES:
{article_list or "None loaded"}
"""

register_page(
    page="tablizer",
    context_builder=build_tablizer_context,
    payloads=["pubmed_query_suggestion", "ai_column_suggestion"],
    tools=["get_pubmed_article"]  # For fetching full article details
)
```

**`services/chat_page_config/trialscout.py`**
```python
def build_trialscout_context(context: Dict[str, Any]) -> str:
    """Build context from TrialScout page state."""
    condition = context.get("condition", "")
    intervention = context.get("intervention", "")
    phase = context.get("phase", [])
    status = context.get("status", [])
    total_matched = context.get("total_matched", 0)
    loaded_count = context.get("loaded_count", 0)
    ai_columns = context.get("ai_columns", [])

    trials = context.get("trials", [])
    trial_list = ""
    if trials:
        trial_list = "\n".join([
            f"- [{t['nct_id']}] {t['title'][:40]}... ({t['phase']}, {t['status']})"
            for t in trials[:20]
        ])

    return f"""User is on TrialScout (clinical trials analysis).

SEARCH STATE:
- Condition: {condition or "not set"}
- Intervention: {intervention or "not set"}
- Phase: {', '.join(phase) if phase else "any"}
- Status: {', '.join(status) if status else "any"}
- Results: {loaded_count} loaded of {total_matched} total

AI COLUMNS: {len(ai_columns)} columns
{chr(10).join([f"- {c['name']} ({c['type']})" for c in ai_columns]) if ai_columns else "None"}

LOADED TRIALS:
{trial_list or "None loaded"}
"""

register_page(
    page="trialscout",
    context_builder=build_trialscout_context,
    payloads=["trial_search_suggestion", "ai_column_suggestion"],
    tools=["get_trial"]  # For fetching full trial details
)
```

#### 2. Trial Tools

**`tools/builtin/trials.py`** (NEW - mirrors pubmed.py pattern)
```python
from tools.registry import ToolConfig, ToolResult, register_tool
from services.clinical_trials_service import get_clinical_trials_service

def execute_get_trial(params, db, user_id, context):
    """Fetch full details for a clinical trial by NCT ID."""
    nct_id = params.get("nct_id", "")
    if not nct_id:
        return "Error: No NCT ID provided."

    service = get_clinical_trials_service()
    trial = service.get_trial_by_nct_id(nct_id)

    if not trial:
        return f"No trial found with NCT ID: {nct_id}"

    # Format for LLM
    text_result = f"""
    === Clinical Trial {trial.nct_id} ===
    Title: {trial.title}
    Phase: {trial.phase}
    Status: {trial.status}
    Sponsor: {trial.lead_sponsor.name if trial.lead_sponsor else 'Unknown'}
    Enrollment: {trial.enrollment_count}

    === Eligibility ===
    {trial.eligibility_criteria or 'Not specified'}

    === Primary Outcomes ===
    {chr(10).join([f"- {o.measure}" for o in trial.primary_outcomes]) if trial.primary_outcomes else 'Not specified'}
    """

    # Payload for frontend
    payload = {
        "type": "trial_details",
        "data": trial.model_dump()
    }

    return ToolResult(text=text_result, payload=payload)

register_tool(ToolConfig(
    name="get_trial",
    description="Get full details of a clinical trial by NCT ID",
    input_schema={
        "type": "object",
        "properties": {
            "nct_id": {"type": "string", "description": "The NCT ID (e.g., NCT04613596)"}
        },
        "required": ["nct_id"]
    },
    executor=execute_get_trial,
    is_global=False,
    payload_type="trial_details"
))
```

#### 3. Payloads

Add to `schemas/payloads.py`:
- `pubmed_query_suggestion` - for Tablizer query suggestions
- `trial_search_suggestion` - for TrialScout search form suggestions
- `ai_column_suggestion` - for both apps (AI column setup)
- `trial_details` - for displaying trial data (tool payload)

---

## Holding Pen Pattern (Future)

For large data (many articles/trials), instead of sending all summaries to the model:

1. Frontend sends context including article/trial data to backend
2. Backend **holds data in staging area** (not sent to model)
3. Model receives only a reference: "50 trials available, use get_staged_trials tool to retrieve"
4. Model calls tool when needed → pulls from staging (no API call)

Benefits:
- Model context stays small
- Data is pre-loaded (fast retrieval)
- Model pulls only what it needs

Implementation would require:
- Staging storage in chat service (per-request cache)
- `get_staged_items` tool that reads from staging
- Context builder that puts data in staging and returns reference

---

## Frontend Integration

### Pattern (from ReportsPage.tsx)

```tsx
// 1. Build chat context with all dynamic state
const chatContext = useMemo(() => ({
    current_page: 'tablizer',
    query: searchQuery,
    total_matched: totalResults,
    loaded_count: articles.length,
    snapshots: snapshots,
    compare_mode: isCompareMode,
    ai_columns: aiColumns.map(c => ({ name: c.name, type: c.type })),
    articles: articles.slice(0, 20).map(a => ({
        pmid: a.pmid,
        title: a.title,
        year: a.year,
        journal: a.journal
    }))
}), [searchQuery, totalResults, articles, snapshots, isCompareMode, aiColumns]);

// 2. Define payload handlers with callbacks
const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
    pubmed_query_suggestion: {
        render: (payload, callbacks) => (
            <PubMedQueryCard
                query={payload.query}
                explanation={payload.explanation}
                onAccept={() => {
                    setSearchQuery(payload.query);
                    callbacks.onAccept?.(payload);
                }}
                onReject={callbacks.onReject}
            />
        )
    },
    ai_column_suggestion: {
        render: (payload, callbacks) => (
            <AIColumnCard
                name={payload.name}
                criteria={payload.criteria}
                type={payload.type}
                onAccept={() => {
                    addAIColumn(payload.name, payload.criteria, payload.type);
                    callbacks.onAccept?.(payload);
                }}
                onReject={callbacks.onReject}
            />
        )
    }
}), [setSearchQuery, addAIColumn]);

// 3. Render ChatTray
<ChatTray
    initialContext={chatContext}
    payloadHandlers={payloadHandlers}
/>
```

### What Frontend Needs to Provide

| Data | Source | Notes |
|------|--------|-------|
| `current_page` | Static | `"tablizer"` or `"trialscout"` |
| Search state | Component state | Query, filters, dates |
| Results counts | API response | total_matched, loaded_count |
| Snapshots | Component state | Tablizer only |
| AI columns | Component state | Name, type, filter status |
| Item summaries | Component state | First 20-50 items with key fields |

### Payload Handler Callbacks

When user clicks Accept:
1. Apply the change (set query, create AI column, etc.)
2. Call `callbacks.onAccept(payload)` to notify chat system

---

## Implementation Checklist

### Database
- [ ] Add `app` column to Conversation model (`models.py`)
- [ ] Create Alembic migration for `app` column + indexes
- [ ] Run migration

### Backend - ChatService Updates
- [ ] Update `ChatService.create_chat()` to accept `app` parameter
- [ ] Update `ChatService.get_user_chats()` to filter by `app`
- [ ] Update `ChatStreamService` to pass `app` from context
- [ ] Update `schemas/chat.py` Conversation schema to include `app`

### Backend - Page Configs & Tools
- [ ] Create `services/chat_page_config/tablizer.py`
- [ ] Create `services/chat_page_config/trialscout.py`
- [ ] Create `tools/builtin/trials.py` with `get_trial` tool
- [ ] Import new page configs in `chat_page_config/__init__.py`

### Backend - Payloads
- [ ] Add `pubmed_query_suggestion` payload to `schemas/payloads.py`
- [ ] Add `trial_search_suggestion` payload to `schemas/payloads.py`
- [ ] Add `ai_column_suggestion` payload to `schemas/payloads.py`
- [ ] Add `trial_details` payload to `schemas/payloads.py`

### Frontend - Cards
- [ ] Create `PubMedQueryCard.tsx` (or adapt QuerySuggestionCard)
- [ ] Create `TrialSearchCard.tsx`
- [ ] Create `AIColumnCard.tsx`

### Frontend - Integration
- [ ] Add ChatTray to Tablizer with context + payloadHandlers
- [ ] Add ChatTray to TrialScout with context + payloadHandlers
- [ ] Pass `app` identifier in chat context (or derive from `current_page`)
