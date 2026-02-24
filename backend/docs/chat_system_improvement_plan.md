# Chat System Improvement Plan

Analysis and action plan based on review of the implementation against [Chat System Critical Success Factors](./chat_system_critical_success_factors.md).

**Review Date:** 2026-02-02

---

## Current State Assessment

### What's Working Well

| Component | Status | Notes |
|-----------|--------|-------|
| Prompt Structure | ✅ Solid | PERSONA → STREAM INSTRUCTIONS → CONTEXT → CAPABILITIES → HELP → FORMAT |
| Ambiguity Handling | ✅ Good | Default persona teaches marginal vs high ambiguity patterns |
| Tool Design | ✅ Good | Well-scoped tools with clear purposes |
| Help Architecture | ✅ Good | Category/topic structure, role filtering, admin editing |
| Tool Coverage | ✅ Good | Includes `compare_reports` (previously identified as potential gap) |

### Critical Gaps

| Gap | Severity | Impact |
|-----|----------|--------|
| No Field Reference docs | **CRITICAL** | LLM can't answer "are dates inclusive?", "what does filter_score mean?" |
| No Glossary | HIGH | Domain terms undefined, inconsistent usage |
| No Query Classification | HIGH | LLM doesn't know Navigation vs Analysis distinction |
| No Tool Adequacy guidance | MEDIUM | LLM may attempt fragile multi-tool workarounds |
| No Anti-Pattern guidance | MEDIUM | Tools don't document when NOT to use them |

---

## Gap Analysis Details

### 1. Missing Field Reference Documentation (CRITICAL)

**Requirement:** Section 4.1B states field semantics are CRITICAL. Every user-visible field must have documented semantics.

**Current State:** Help categories exist for features (reports, streams, tablizer) but NOT for field semantics.

**Missing Documentation:**

| Field Group | Examples | User Questions We Can't Answer |
|-------------|----------|-------------------------------|
| Date Fields | `start_date`, `end_date`, `publication_date` | "Are dates inclusive or exclusive?" |
| Filter Fields | `filter_score`, `filter_threshold`, `passed_semantic_filter` | "What does a filter score of 0.7 mean?" |
| Inclusion Fields | `included_in_report`, `curator_included`, `curator_excluded` | "Why is this article in the report?" |
| Status Fields | Pipeline status, report status | "What does 'pending' mean?" |

**Source Material:** Developer knowledge exists in `backend/docs/article_date_field_analysis.md` but is not exposed to the chat system.

### 2. Missing Glossary

**Requirement:** Section 4.2D requires a glossary of domain terms.

**Current State:** No glossary category in help system.

**Impact:** Terms like "semantic filter", "retrieval group", "curation" are used but undefined.

### 3. No Query Classification Guidance

**Requirement:** Section 1 defines two primary modes the LLM must distinguish:

| Mode | Description | Example |
|------|-------------|---------|
| Navigation/Steering | Help user understand or use the app | "How do I create a stream?" |
| Data Analysis | Help user analyze their data | "Which articles mention CRISPR?" |

**Current State:** The help narrative hints at when to use help, but doesn't frame the explicit Navigation vs Analysis mental model.

**Impact:** LLM may use data tools when it should check documentation, or vice versa.

### 4. No Tool Adequacy Guidance

**Requirement:** Section 3.4 emphasizes recognizing tool-task mismatch and deferring gracefully.

**Signs to defer:**
- Task requires >3-4 chained tool calls
- Each step depends on parsing previous results
- Plan feels like a "Rube Goldberg machine"

**Current State:** No guidance tells the LLM when to say "I don't have the right tools."

**Impact:** LLM may attempt fragile workarounds that fail partway through.

### 5. Tool Anti-Patterns Not Documented

**Requirement:** Section 3.2 requires each tool to document "when NOT to use this tool."

**Current State:** Tool descriptions only cover positive use cases.

---

## Action Plan

### Phase 1: Critical Content Gaps (Immediate)

#### 1.1 Create Field Reference Help Content

Create `backend/help/field-reference.yaml` with:

- **Date Fields** - Semantics for report date ranges, publication dates, inclusive/exclusive behavior
- **Filter Fields** - What filter_score means, thresholds, passed_semantic_filter logic
- **Inclusion Fields** - included_in_report as source of truth, curator override behavior
- **Status Fields** - Pipeline and report status meanings

#### 1.2 Create Glossary Help Content

Create `backend/help/glossary.yaml` with definitions for:

- Research Stream
- Report
- Semantic Filter / Filter Score
- Curation / Curator
- Retrieval Group
- Pipeline
- Article categories

### Phase 2: LLM Guidance Improvements

#### 2.1 Add Query Classification to Persona

Update default persona to teach the Navigation vs Analysis distinction with classification signals.

#### 2.2 Add Tool Adequacy Guidance

Add guidance on recognizing when tools aren't adequate and how to defer gracefully.

### Phase 3: Documentation Maintenance

#### 3.1 Update Critical Success Factors Doc

- Update tool inventory (Section 3.5) to reflect current tools
- Mark completed items

---

## Implementation Checklist

- [x] Create `backend/help/field-reference.yaml` *(completed 2026-02-02)*
- [x] Create `backend/help/glossary.yaml` *(completed 2026-02-02)*
- [x] Update default persona with query classification *(completed 2026-02-02)*
- [x] Add tool adequacy guidance to persona *(completed 2026-02-02)*
- [x] Update help_registry.py category order to include new categories *(completed 2026-02-02)*
- [x] Test help content loads correctly *(verified 2026-02-02)*
- [x] Update critical success factors doc tool inventory *(completed 2026-02-02)*

---

## Success Criteria

After implementation, the LLM should be able to:

1. **Answer semantic questions without querying data:**
   - "Are report dates inclusive?" → Uses help, answers correctly
   - "What does filter_score mean?" → Uses help, explains 0-1 scale

2. **Correctly classify queries:**
   - "How do I add an article?" → Recognizes as navigation, checks help
   - "Which articles discuss gene therapy?" → Recognizes as analysis, uses search tool

3. **Defer appropriately:**
   - "Compare article counts across all streams for Q1 vs Q2" → Recognizes tool gap, offers alternatives

4. **Use consistent terminology:**
   - References glossary definitions when explaining concepts
