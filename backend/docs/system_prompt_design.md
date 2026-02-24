# System Prompt Design

Analysis and recommendations for the chat system prompt structure.

---

## Current State

### Three Customization Levers

| Lever | Scope | Purpose | Storage |
|-------|-------|---------|---------|
| **Identity** | Page | Who the assistant is | `chat_config` (scope='page') |
| **Guidelines** | Page | How to behave (style, constraints) | `chat_config` (scope='page') |
| **Custom Instructions** | Stream | Domain-specific guidance | `chat_config` (scope='stream') |

### Current Prompt Structure

```
1. IDENTITY              ← Page-level (who)
2. CONTEXT               ← Auto-generated (what's loaded)
3. PAYLOAD MANIFEST      ← Auto-generated (conversation data)
4. CAPABILITIES          ← Auto-generated (tools, actions)
5. HELP TOC              ← Auto-generated (help sections)
6. CUSTOM INSTRUCTIONS   ← Stream-level (domain guidance)
7. GUIDELINES            ← Page-level (how)
```

### Problems

1. **Scattered customization**: Identity (#1) and Guidelines (#7) are both page-level "who/how" but separated by 5 sections

2. **Naming confusion**: "Custom Instructions" vs "Guidelines" - both sound like behavioral guidance

3. **Unclear hierarchy**: What takes precedence when page guidelines conflict with stream instructions?

4. **Mental model mismatch**: Admins manage identity + guidelines together for pages, but they appear far apart in the prompt

---

## Proposed Redesign

### Simplified Mental Model

Think of it as two layers:

| Layer | What It Controls | Who Sets It |
|-------|------------------|-------------|
| **Page Persona** | Who the assistant is and how it behaves on this page | Admin (global) |
| **Stream Context** | Domain-specific knowledge and priorities for this stream | User (per stream) |

### Renamed Levers

| Old Name | New Name | Rationale |
|----------|----------|-----------|
| Identity | **Persona** | Clearer that it's about character/role |
| Guidelines | *(merged into Persona)* | Both are page-level "who/how" |
| Custom Instructions | **Stream Instructions** | Clearer scope |

### Single Page-Level Field: Persona

Merge Identity + Guidelines into one field called **Persona**:

```markdown
## Persona

You are a research assistant specializing in biomedical literature.

### Style
- Be concise and factual
- Use scientific terminology appropriately
- Cite sources when referencing specific findings

### Priorities
- Accuracy over speed
- Ask clarifying questions when query is ambiguous
```

**Why merge?**
- They're both about "who the assistant is on this page"
- They're managed together by the same admin
- Keeps related information together for the LLM
- Simpler mental model: one field per scope level

### Recommended Prompt Order

```
1. PERSONA              ← Page-level (who + how)
2. STREAM INSTRUCTIONS  ← Stream-level (domain context)
3. CONTEXT              ← Auto-generated (current state)
4. CAPABILITIES         ← Auto-generated (tools)
5. HELP TOC             ← Auto-generated (help sections)
6. FORMAT RULES         ← Fixed (suggestion syntax, etc.)
```

**Rationale for order:**

1. **Persona first**: Establishes identity before any other context
2. **Stream instructions second**: Narrows focus to this specific domain
3. **Context third**: Current state of the page/data
4. **Capabilities fourth**: What tools are available
5. **Help TOC fifth**: Reference material
6. **Format rules last**: Technical formatting (doesn't need prominence)

### Why This Order Works

The LLM reads the prompt like a briefing:

1. "You are X" (persona)
2. "In this context, pay attention to Y" (stream instructions)
3. "Here's what's currently loaded" (context)
4. "Here's what you can do" (capabilities)
5. "Here's reference material" (help)
6. "Here's how to format special outputs" (format rules)

---

## Implementation Changes

### Database Schema

Current `chat_config` table:
```sql
scope        -- 'page' or 'stream'
scope_key    -- page name or stream_id
identity     -- Page-level: who
instructions -- Stream-level: domain guidance
guidelines   -- Page-level: how (NEW - was added later)
```

Proposed:
```sql
scope        -- 'page' or 'stream'
scope_key    -- page name or stream_id
persona      -- Page-level: who + how (replaces identity + guidelines)
instructions -- Stream-level: domain guidance (unchanged)
```

### Migration Path

1. For existing pages with both identity and guidelines:
   - Merge into single persona field: `{identity}\n\n{guidelines}`

2. For pages with only identity:
   - Rename field to persona, keep content

3. Remove separate guidelines field

### Code Changes

1. **`_build_system_prompt`**: Reorder sections, merge identity/guidelines

2. **`_get_identity`** → **`_get_persona`**: Return merged persona

3. **Remove `_get_guidelines`**: No longer separate

4. **Admin UI**: Single "Persona" textarea instead of Identity + Guidelines

---

## Configuration Examples

### Page Persona (Admin-configured)

```markdown
You are a research intelligence assistant for Knowledge Horizon.

## Capabilities
You help users navigate the platform, understand their data, and analyze research findings.

## Style
- Be concise and professional
- Use scientific terminology when discussing research
- When uncertain, acknowledge limitations

## Priorities
- Accuracy over speed
- Help users understand, not just get answers
- Suggest next steps when helpful
```

### Stream Instructions (User-configured)

```markdown
This stream monitors CAR-T cell therapy research.

## Key Topics
- Manufacturing improvements
- Persistence and exhaustion
- Solid tumor applications
- Safety profiles (CRS, neurotoxicity)

## Interpretation Notes
- "Response" in this context usually means clinical response, not immune response
- Watch for industry vs academic perspective differences
```

---

## Ambiguity Handling Integration

The persona should include guidance on ambiguity handling (from our critical success factors):

```markdown
## Handling Ambiguity
- For marginally ambiguous queries: State your interpretation, then answer
- For highly ambiguous queries: Ask for clarification with 2-3 specific options
- When uncertain if user wants navigation help vs data analysis: Default to navigation, offer alternative
```

---

## Summary

| Aspect | Current | Proposed |
|--------|---------|----------|
| Page-level fields | 2 (identity, guidelines) | 1 (persona) |
| Stream-level fields | 1 (instructions) | 1 (instructions) |
| Prompt section count | 7 | 6 |
| Customizable section positions | 1, 6, 7 (scattered) | 1, 2 (together at top) |
| Mental model | 3 concepts | 2 concepts (persona + stream instructions) |

**Benefits:**
- Simpler to understand and manage
- Related content grouped together
- Clearer hierarchy (page → stream → auto-generated)
- LLM sees customization upfront, then facts
