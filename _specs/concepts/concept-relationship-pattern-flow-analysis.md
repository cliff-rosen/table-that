# Complete Information Flow Analysis: Relationship Patterns

## The Question
How should relationship patterns be represented when moving from semantic space → concepts → queries → display?

## Current State Analysis

### STEP 1: Semantic Space Input (Layer 1)

**Schema**: `backend/schemas/semantic_space.py`

```python
# Entities in the semantic space
class Entity(BaseModel):
    entity_id: str  # e.g., "e1", "e2", "e3"
    entity_type: EntityType  # disease, biomarker, methodology, etc.
    name: str  # e.g., "Mesothelioma", "Asbestos"
    canonical_forms: List[str]  # ["mesothelioma", "pleural mesothelioma"]
    context: str  # Why this entity matters

# OPTIONAL: Explicit relationships between entities
class Relationship(BaseModel):
    relationship_id: str  # e.g., "r1"
    type: RelationshipType  # CAUSAL, METHODOLOGICAL, THERAPEUTIC, etc.
    subject: str  # entity_id (e.g., "e1")
    object: str  # entity_id (e.g., "e2")
    description: str  # "Asbestos exposure causes mesothelioma"
    strength: "strong" | "moderate" | "weak"
```

**Example Data**:
```python
entities: [
    {entity_id: "e1", name: "Asbestos", canonical_forms: ["asbestos", "asbestos fiber"]},
    {entity_id: "e2", name: "Inflammation", canonical_forms: ["inflammation", "inflammatory response"]},
    {entity_id: "e3", name: "Mesothelioma", canonical_forms: ["mesothelioma", "pleural mesothelioma"]}
]

relationships: [  # OPTIONAL - may be empty!
    {relationship_id: "r1", type: "causal", subject: "e1", object: "e2", description: "...", strength: "strong"},
    {relationship_id: "r2", type: "causal", subject: "e2", object: "e3", description: "...", strength: "strong"}
]
```

**Key Issue**: Relationships in semantic space are OPTIONAL and may not exist!

---

### STEP 2: LLM Concept Proposal

**Service**: `backend/services/concept_proposal_service.py`

**Input to LLM**:
```
Semantic space with:
- Topics: [t1: "Disease mechanisms", t2: "Early detection"]
- Entities: [e1: Asbestos, e2: Inflammation, e3: Mesothelioma]
- Relationships: [r1: e1 causes e2, r2: e2 causes e3]  # MAY BE EMPTY
```

**What LLM sees in prompt (current)**:
```
## Entities:
- e1: Asbestos (substance)
  Forms: asbestos, asbestos fiber
- e2: Inflammation (biomarker)
  Forms: inflammation, inflammatory response
- e3: Mesothelioma (disease)
  Forms: mesothelioma, pleural mesothelioma

## Relationships:
- e1 -> causal -> e2 (strength: strong)
- e2 -> causal -> e3 (strength: strong)
```

**What LLM is asked to generate**:
```json
{
  "concepts": [
    {
      "concept_id": "c1",
      "name": "...",
      "entity_pattern": ["???"],
      "relationship_pattern": "???",
      "covered_topics": ["t1"],
      "rationale": "..."
    }
  ]
}
```

**AMBIGUITY 1**: What should be in `entity_pattern`?
- Option A: Just entity IDs: `["e1", "e2", "e3"]`
- Option B: Ordered list showing graph path: `["e1", "e2", "e3"]` (asbestos → inflammation → mesothelioma)

**AMBIGUITY 2**: What should be in `relationship_pattern`?
- Option A: Simple verb: `"causes"`
- Option B: Graph description with entity refs: `"e1 causes e2, e2 causes e3"`
- Option C: Natural language: `"asbestos causes inflammation which causes mesothelioma"`
- Option D: Just the relationship types: `"causal, causal"`
- Option E: Structured edges:
  ```json
  {
    "edges": [
      {"source": "e1", "target": "e2", "type": "causes"},
      {"source": "e2", "target": "e3", "type": "causes"}
    ]
  }
  ```

**CURRENT IMPLEMENTATION**: Inconsistent!
- Spec shows: `"e1 measures e2, which detects e3"`
- Schema description says: `"How entities relate (e.g., 'causes', 'treats', 'indicates')"`
- These are contradictory!

---

### STEP 3: Concept Storage

**Schema**: `backend/schemas/research_stream.py`

```python
class Concept(BaseModel):
    concept_id: str
    name: str

    # THESE ARE THE CRITICAL FIELDS
    entity_pattern: List[str] = Field(
        description="List of entity_ids that form this pattern",
        default_factory=list
    )
    relationship_pattern: Optional[str] = Field(
        None,
        description="How entities relate (e.g., 'causes', 'treats', 'indicates')"
    )

    covered_topics: List[str]
    vocabulary_terms: Dict[str, List[str]]  # entity_id -> [synonyms]
    rationale: str
```

**What gets stored in DB**:
```json
{
  "concept_id": "c1",
  "entity_pattern": ["e1", "e2", "e3"],  // Actual entity IDs from semantic space
  "relationship_pattern": "???",  // WHAT GOES HERE?
  "vocabulary_terms": {
    "e1": ["asbestos", "asbestos fiber"],
    "e2": ["inflammation", "inflammatory response"],
    "e3": ["mesothelioma", "pleural mesothelioma"]
  }
}
```

**PROBLEM**: The schema field description says "e.g., 'causes', 'treats', 'indicates'" but this can't describe a 3-entity graph!

---

### STEP 4: Query Generation

**Service**: `backend/services/retrieval_query_service.py`

**How relationship_pattern is used** (line 148):
```python
relationship = concept.relationship_pattern or "related to"

user_prompt = f"""
ENTITY PATTERN (with vocabulary expansion):
- Asbestos (e1): asbestos, asbestos fiber
- Inflammation (e2): inflammation, inflammatory response
- Mesothelioma (e3): mesothelioma, pleural mesothelioma

RELATIONSHIP PATTERN: {relationship}  # <-- Just passed as text context!

COVERED TOPICS: Disease mechanisms

Create a PubMed query that captures this entity-relationship pattern.
"""
```

**LLM generates query**:
```
(asbestos OR "asbestos fiber") AND (inflammation OR "inflammatory response") AND (mesothelioma OR "pleural mesothelioma")
```

**KEY INSIGHT**: relationship_pattern is used as **descriptive context** for the query generation LLM, not as structured data to build the query directly.

**IMPLICATION**: relationship_pattern needs to be human-readable and informative, but doesn't need to be machine-parseable.

---

### STEP 5: Frontend Display

**Component**: `frontend/src/components/RetrievalWizard/ConceptProposalPhase.tsx`

**What frontend shows**:
```tsx
<div>Relationship Pattern: {concept.relationship_pattern}</div>

// Displays entity names with arrows
Asbestos → Inflammation → Mesothelioma
```

**PROBLEM**:
- Frontend assumes it can resolve entity names from entity_pattern order
- But it doesn't actually parse relationship_pattern to understand the graph structure
- It just shows arrows assuming linear chain

---

## Identified Inconsistencies

### Inconsistency 1: Schema vs Spec
- **Schema description**: "How entities relate (e.g., 'causes', 'treats', 'indicates')"
- **Spec examples**: "e1 measures e2, which detects e3"
- These describe different formats!

### Inconsistency 2: 2-entity vs 3-entity patterns
- 2-entity example in spec: `relationship_pattern: "detects"` (just verb)
- 3-entity example in spec: `relationship_pattern: "e1 measures e2, which detects e3"` (full sentence)
- Format changes based on entity count!

### Inconsistency 3: Frontend assumptions
- Frontend assumes linear chain (e1 → e2 → e3)
- But spec shows convergent patterns (e1 → e3 ← e2) are also valid
- No way to distinguish graph topology

### Inconsistency 4: Entity references
- Spec uses "e1", "e2", "e3" as placeholders in examples
- But actual entity_ids might be "entity_asbestos_123", "entity_inflammation_456"
- Should relationship_pattern use actual IDs or generic placeholders?

---

## Critical Questions to Resolve

### Q1: What is the PRIMARY PURPOSE of relationship_pattern?
a) Descriptive text for humans to understand the concept
b) Machine-readable structure for query generation
c) Both

**Current answer**: Primarily (a) - it's descriptive context for LLM query generation

### Q2: For 3-entity patterns, MUST we describe the complete graph?
a) Yes - need all edges (e.g., "e1→e2, e2→e3")
b) No - just the general relationship (e.g., "causes")

**Spec says**: Yes, need complete graph
**Usage shows**: It's just descriptive context

### Q3: Should relationship_pattern reference entities?
a) Yes, use entity_ids: "entity_123 causes entity_456"
b) Yes, use array indices: "[0] causes [1]"
c) Yes, use generic placeholders: "e1 causes e2"
d) No, just describe relationships: "causal pathway"

### Q4: How do we handle non-linear graphs?
```
Convergent: e1 → e3 ← e2
Divergent: e1 → e2, e1 → e3
Complex: e1 → e2 → e3, e1 → e3
```

Current linear arrow display can't show these!

### Q5: What if semantic space has NO relationships?
Then the LLM must infer relationships from entities and topics alone.
Should relationship_pattern be optional (nullable)?

---

## Proposed Resolution Options

### Option A: Keep as Natural Language Description
```json
{
  "entity_pattern": ["e1", "e2", "e3"],
  "relationship_pattern": "asbestos exposure induces inflammatory responses that lead to mesothelioma development"
}
```
**Pros**: Flexible, human-readable, works for any graph structure
**Cons**: Not machine-parseable, frontend can't visualize graph accurately

### Option B: Use Generic Placeholders with Pattern
```json
{
  "entity_pattern": ["e1", "e2", "e3"],
  "relationship_pattern": "e1 induces e2, e2 causes e3"
}
```
**Pros**: Shows graph structure, can be parsed, consistent format
**Cons**: Need to define "e1 = entity_pattern[0]" mapping rule

### Option C: Structured Edges (New Schema)
```json
{
  "entity_pattern": ["e1", "e2", "e3"],
  "relationship_edges": [
    {"from_index": 0, "to_index": 1, "type": "induces"},
    {"from_index": 1, "to_index": 2, "type": "causes"}
  ],
  "relationship_description": "inflammatory pathway from exposure to disease"
}
```
**Pros**: Machine-parseable, can visualize any graph
**Cons**: More complex schema, more complex LLM output format

### Option D: Hybrid Approach
```json
{
  "entity_pattern": ["e1", "e2", "e3"],
  "relationship_pattern": "e1 induces e2, which causes e3",
  "graph_topology": "linear_chain"  // or "convergent", "divergent"
}
```
**Pros**: Descriptive text + hint about structure
**Cons**: Still need to parse text to understand edges

---

## Recommendation Needed

We need to decide:
1. **Schema format** for relationship_pattern
2. **LLM output format** (what we ask LLM to generate)
3. **Storage format** (what goes in database)
4. **Display format** (how frontend shows it)

These should all be CONSISTENT and aligned with how the data is actually USED.
