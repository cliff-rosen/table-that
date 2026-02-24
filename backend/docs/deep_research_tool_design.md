# Deep Research Tool Design

## Overview

A tool that handles complex research questions by orchestrating multiple search sources (PubMed, Web) through an iterative refinement loop. Instead of relying on the LLM to manually orchestrate low-level search tools, this tool encapsulates the entire research workflow.

## Tool Interface

### Name
`deep_research`

### Description (for LLM)
```
Conducts in-depth research on a question using PubMed and web search. Use this when:
- The question requires synthesizing information from multiple sources
- A simple search won't suffice
- The user needs a well-researched, cited answer

Before calling this tool, inform the user that deep research typically takes 1-3 minutes and ask if they'd like to proceed.

Do NOT use this for:
- Simple factual lookups
- Questions about the current report/stream content
- Questions that can be answered from context
```

### Input Schema
```json
{
  "type": "object",
  "properties": {
    "question": {
      "type": "string",
      "description": "The research question to investigate"
    },
    "context": {
      "type": "string",
      "description": "Optional context about the user's needs, domain, or constraints"
    },
    "max_iterations": {
      "type": "integer",
      "default": 10,
      "description": "Maximum research iterations (default 10)"
    }
  },
  "required": ["question"]
}
```

### Output Schema
```json
{
  "trace_id": "uuid",
  "answer": "string - the synthesized answer with inline citations",
  "sources": [
    {
      "id": "src_1",
      "type": "pubmed | web",
      "title": "string",
      "url": "string",
      "snippet": "string"
    }
  ],
  "checklist_coverage": {
    "satisfied": ["item1", "item2"],
    "gaps": ["item3 - partial coverage"]
  },
  "iterations_used": 3,
  "status": "completed | max_iterations_reached | error"
}
```

## Database Schema

### Table: `research_traces`

```sql
CREATE TABLE research_traces (
    id VARCHAR(36) PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id),
    org_id INTEGER REFERENCES organizations(org_id),

    -- Input
    question TEXT NOT NULL,
    context TEXT,
    max_iterations INTEGER DEFAULT 10,

    -- Refined question & plan
    refined_question TEXT,
    checklist JSONB,  -- [{id, description, satisfied, evidence}]

    -- Research state
    knowledge_base JSONB,  -- {facts: [], sources: [], gaps: []}
    iterations JSONB,  -- [{iteration, queries, results_summary, checklist_status}]

    -- Output
    final_answer TEXT,
    sources JSONB,
    status VARCHAR(50) DEFAULT 'pending',  -- pending, in_progress, completed, failed, max_iterations
    error_message TEXT,

    -- Timing
    created_at TIMESTAMP DEFAULT NOW(),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,

    -- Metrics
    total_pubmed_queries INTEGER DEFAULT 0,
    total_web_queries INTEGER DEFAULT 0,
    total_articles_processed INTEGER DEFAULT 0,
    total_pages_processed INTEGER DEFAULT 0
);

CREATE INDEX idx_research_traces_user ON research_traces(user_id);
CREATE INDEX idx_research_traces_status ON research_traces(status);
```

## Workflow Implementation

### Step 1: Refine Question

**Input:** Raw question + context
**Output:** Refined question, scope boundaries

```
Prompt: Given this research question and context, produce:
1. A refined, unambiguous version of the question
2. Explicit scope boundaries (what's in/out of scope)
3. Key terms and concepts to search for

Question: {question}
Context: {context}
```

### Step 2: Generate Checklist

**Input:** Refined question
**Output:** List of checklist items

```
Prompt: What information would constitute a complete answer to this question?
Generate a checklist of 3-7 specific items that a good answer must address.

Question: {refined_question}

Output format:
- [ ] Item 1: specific thing to find/verify
- [ ] Item 2: ...
```

### Step 3: Research Loop

For each iteration:

#### 3a. Generate Queries

**Input:** Refined question, current knowledge base, unsatisfied checklist items
**Output:** PubMed queries, Web search queries

```
Prompt: Based on the research question and what we still need to find,
generate search queries.

Question: {refined_question}
Already known: {knowledge_base_summary}
Still need: {unsatisfied_items}

Generate:
- 1-2 PubMed queries (use proper PubMed syntax)
- 1-2 Web search queries
```

#### 3b. Execute Searches

- Call PubMed API with generated queries
- Call Web Search API with generated queries
- Collect results (limit: ~10 results per query)

#### 3c. Process Results

**Input:** Search results, current knowledge base
**Output:** Extracted facts, updated knowledge base

```
Prompt: Extract relevant information from these search results.

Question: {refined_question}
Checklist items still needed: {unsatisfied_items}

Search results:
{results}

For each relevant finding:
- Extract the key fact/information
- Note which checklist item(s) it addresses
- Include source citation
```

#### 3d. Check Completeness

**Input:** Updated knowledge base, checklist
**Output:** Satisfied/unsatisfied items, whether to continue

```
Prompt: Review the checklist against accumulated knowledge.

Checklist:
{checklist}

Knowledge base:
{knowledge_base}

For each item, determine:
- Satisfied: We have sufficient information
- Partial: Some info but gaps remain
- Unsatisfied: No relevant information found

If all items are satisfied or partial with good coverage, research is complete.
```

### Step 4: Synthesize Answer

**Input:** Knowledge base, checklist, sources
**Output:** Final answer with citations

```
Prompt: Synthesize a comprehensive answer to the research question.

Question: {refined_question}
Knowledge base: {knowledge_base}

Requirements:
- Address each checklist item
- Use inline citations [1], [2], etc.
- Note any limitations or gaps
- Be comprehensive but concise
```

## Progress Streaming

During execution, stream progress updates to the chat:

```
🔍 Starting deep research...
📝 Refining question and generating research plan...
✓ Generated checklist with 5 items to investigate

🔄 Iteration 1/10
  → Searching PubMed: "mesothelioma treatment 2024"
  → Searching Web: "latest mesothelioma clinical trials"
  → Processing 8 results...
  → Checklist: 2/5 items satisfied

🔄 Iteration 2/10
  → Searching PubMed: "immunotherapy mesothelioma outcomes"
  → Processing 6 results...
  → Checklist: 4/5 items satisfied

🔄 Iteration 3/10
  → Searching Web: "mesothelioma prognosis factors"
  → Processing 4 results...
  → Checklist: 5/5 items satisfied

✓ Research complete. Synthesizing answer...
```

## File Structure

```
backend/
├── models.py                    # Add ResearchTrace model
├── tools/
│   └── builtin/
│       └── deep_research.py     # Tool registration + executor
├── services/
│   └── deep_research_service.py # Core orchestration logic
└── migrations/
    └── add_research_traces.py   # Database migration
```

## Implementation Phases

### Phase 1: Core Functionality
- [ ] Database model and migration
- [ ] Basic tool executor
- [ ] Question refinement step
- [ ] Checklist generation step
- [ ] Research loop (PubMed + Web)
- [ ] Answer synthesis
- [ ] Trace storage

### Phase 2: Streaming & UX
- [ ] Progress streaming to chat
- [ ] Better error handling
- [ ] Timeout handling

### Phase 3: Enhancements
- [ ] Trace viewer UI (like chat trace)
- [ ] Resume interrupted research
- [ ] Cache similar questions
- [ ] Source quality scoring

## Resolved Design Decisions

1. **LLM Selection**: Same model as chat (claude-sonnet-4-20250514)

2. **Parallel searches**: Yes - run PubMed and Web searches in parallel within each iteration

3. **Result limits**: 10 results per query

4. **Timeout**: 10 minutes max runtime

## Technical Implementation

### Streaming Mechanism

The chat system supports tool progress streaming via:

```python
from tools.registry import ToolConfig, ToolResult, ToolProgress

# Streaming tool executor (sync generator)
def execute_deep_research(params, db, user_id, context):
    # Yield progress updates
    yield ToolProgress(
        stage="refining",
        message="Refining question and generating research plan...",
        progress=0.1
    )

    # ... do work ...

    yield ToolProgress(
        stage="iteration_1",
        message="Searching PubMed: 'mesothelioma treatment'",
        progress=0.3,
        data={"iteration": 1, "queries": ["mesothelioma treatment"]}
    )

    # Return final result (captured via StopIteration)
    return ToolResult(
        text="Research complete. [answer text]",
        payload={"type": "deep_research_result", "data": {...}}
    )

# Register with streaming=True
register_tool(ToolConfig(
    name="deep_research",
    streaming=True,
    executor=execute_deep_research,
    ...
))
```

**Async generator support added to agent_loop.py** - progress events are streamed in real-time as the tool yields them.

### Parallel Execution

Use asyncio.gather for parallel searches within each iteration:

```python
async def search_sources(pubmed_queries: List[str], web_queries: List[str]):
    tasks = []
    for q in pubmed_queries:
        tasks.append(search_pubmed(q, max_results=10))
    for q in web_queries:
        tasks.append(search_web(q, max_results=10))

    results = await asyncio.gather(*tasks, return_exceptions=True)
    return results
```

### Database Model - Generic Tool Trace

A single `tool_traces` table for all long-running tools that need execution traces.

```python
class ToolTrace(Base):
    """
    Generic trace storage for long-running tools.

    Each tool stores its specific data in the JSON fields (input_params, state, result, metrics).
    This provides a unified trace infrastructure while allowing tool-specific flexibility.
    """
    __tablename__ = "tool_traces"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(Integer, ForeignKey("users.user_id"), nullable=False)
    org_id = Column(Integer, ForeignKey("organizations.org_id"))

    # What tool created this trace
    tool_name = Column(String(100), nullable=False, index=True)  # e.g., "deep_research"

    # Input (tool-specific)
    input_params = Column(JSON)  # Parameters passed to the tool

    # Execution state
    status = Column(String(50), default='pending', index=True)  # pending, in_progress, completed, failed, cancelled
    progress = Column(Float, default=0.0)  # 0.0 to 1.0
    current_stage = Column(String(100))  # Human-readable current stage

    # Tool-specific state (updated during execution)
    state = Column(JSON, default=dict)  # Tool's internal state

    # Output
    result = Column(JSON)  # Final result (tool-specific structure)
    error_message = Column(Text)

    # Timing
    created_at = Column(DateTime, default=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    # Metrics (tool-specific)
    metrics = Column(JSON, default=dict)

# Indexes
Index('idx_tool_traces_user_tool', ToolTrace.user_id, ToolTrace.tool_name)
Index('idx_tool_traces_status', ToolTrace.status)
```

**For deep_research, the JSON fields would contain:**

```python
# input_params
{
    "question": "What are the latest treatments for mesothelioma?",
    "context": "Focus on immunotherapy approaches",
    "max_iterations": 10
}

# state (updated during execution)
{
    "refined_question": "What are the current immunotherapy...",
    "checklist": [
        {"id": "1", "description": "Current approved treatments", "satisfied": True, "evidence": "..."},
        {"id": "2", "description": "Clinical trial results", "satisfied": False}
    ],
    "knowledge_base": {
        "facts": ["Pembrolizumab approved 2020...", ...],
        "sources": [{"id": "src_1", "type": "pubmed", "pmid": "12345", ...}],
        "gaps": ["Long-term survival data"]
    },
    "iterations": [
        {"iteration": 1, "queries": [...], "results_count": 15, "checklist_progress": "2/5"}
    ]
}

# result
{
    "answer": "Based on current research...",
    "sources": [...],
    "checklist_coverage": {"satisfied": 4, "partial": 1, "unsatisfied": 0}
}

# metrics
{
    "total_iterations": 3,
    "pubmed_queries": 5,
    "web_queries": 4,
    "sources_processed": 42,
    "llm_calls": 12
}
```

### Service Structure

```
backend/
├── models.py                          # Add ToolTrace model
├── services/
│   ├── tool_trace_service.py          # Generic trace CRUD:
│   │                                   #   - create_trace(tool_name, user_id, input_params)
│   │                                   #   - update_progress(trace_id, stage, progress, state)
│   │                                   #   - complete_trace(trace_id, result, metrics)
│   │                                   #   - fail_trace(trace_id, error_message)
│   │                                   #   - get_trace(trace_id)
│   │                                   #   - list_traces(user_id, tool_name)
│   │
│   └── deep_research_service.py       # Research-specific orchestration:
│                                       #   - refine_question()
│                                       #   - generate_checklist()
│                                       #   - generate_queries()
│                                       #   - execute_searches()
│                                       #   - process_results()
│                                       #   - check_completeness()
│                                       #   - synthesize_answer()
├── tools/
│   └── builtin/
│       └── deep_research.py           # Tool registration + async generator executor
└── migrations/
    └── add_tool_traces.py
```

## Open Questions

1. **Rate limiting**: Do we need to throttle API calls to avoid limits?

2. **Caching**: Should we cache similar questions or partial results?
