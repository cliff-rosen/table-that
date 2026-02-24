# Concept Generation Process - Redesign

## Core Principle

**The semantic space is food for thought, not a constraint.**

The LLM's job is to answer:
> "What entity-relationship patterns would retrieve articles about these topics?"

This involves:
1. Defining the entities that papers actually discuss
2. Defining the relationships between those entities
3. Creating searchable patterns that cover the topic domain

## Information Flow

```
Topics (what we care about)
    ↓
Semantic Space (optional hints/context)
    ↓
Phase 1: LLM Independent Analysis
    - What entities do papers about these topics actually discuss?
    - What relationships exist between these entities?
    - What patterns would cast the right net?
    ↓
Entities + Relationships Defined by LLM
    ↓
Phase 2: Concept Creation
    - Use LLM-defined entities
    - Create patterns that cover topics
    - Each pattern = one concept
    ↓
Concepts with complete entity definitions
```

## Phase 1: Independent Analysis

### Input to LLM

```
TOPICS:
- t1: Early cancer detection methods
  Description: Techniques and biomarkers for detecting cancer at early stages
  Importance: Critical

- t2: Treatment response monitoring
  Description: Methods to assess how well cancer treatment is working
  Importance: Important

SEMANTIC SPACE REFERENCE (for context, not constraint):
Entities that might be relevant:
- Liquid Biopsy (methodology): liquid biopsy, blood test
- ctDNA (biomarker): ctDNA, circulating tumor DNA
- Cancer (disease): cancer, malignancy

Relationships that might exist:
- Liquid biopsy measures ctDNA
- ctDNA indicates cancer presence

DOMAIN:
Name: Clinical Oncology Research
Description: Cancer detection and treatment monitoring

YOUR TASK:
For each topic, think through:
1. What entities do research papers about this topic actually discuss?
2. What relationships between those entities are papers exploring?
3. What entity-relationship patterns would retrieve the right papers?

Define the entities and relationships needed to cover these topics.
```

### Expected LLM Output (Phase 1)

```json
{
  "phase1_analysis": {
    "entities": [
      {
        "entity_id": "c_e1",
        "name": "Liquid Biopsy",
        "entity_type": "methodology",
        "canonical_forms": ["liquid biopsy", "blood biopsy", "plasma testing", "non-invasive biopsy"],
        "rationale": "Core detection methodology discussed in early detection papers",
        "semantic_space_ref": "e4"
      },
      {
        "entity_id": "c_e2",
        "name": "Circulating Tumor DNA",
        "entity_type": "biomarker",
        "canonical_forms": ["ctDNA", "circulating tumor DNA", "cell-free DNA", "cf-DNA"],
        "rationale": "Primary biomarker for both detection and monitoring",
        "semantic_space_ref": "e5"
      },
      {
        "entity_id": "c_e3",
        "name": "Cancer",
        "entity_type": "disease",
        "canonical_forms": ["cancer", "malignancy", "tumor", "neoplasm"],
        "rationale": "Disease being detected and monitored",
        "semantic_space_ref": "e1"
      },
      {
        "entity_id": "c_e4",
        "name": "Chemotherapy",
        "entity_type": "treatment",
        "canonical_forms": ["chemotherapy", "chemo", "systemic therapy", "cytotoxic therapy"],
        "rationale": "Treatment being monitored for effectiveness",
        "semantic_space_ref": null
      },
      {
        "entity_id": "c_e5",
        "name": "Treatment Response",
        "entity_type": "outcome",
        "canonical_forms": ["treatment response", "therapeutic response", "treatment efficacy"],
        "rationale": "Outcome being assessed in monitoring papers",
        "semantic_space_ref": null
      }
    ],
    "relationship_patterns": [
      "Methodology measures biomarker to detect disease",
      "Biomarker monitors treatment response",
      "Treatment affects biomarker levels"
    ],
    "coverage_strategy": "Created 5 entities covering methodologies (liquid biopsy), biomarkers (ctDNA), disease (cancer), treatment (chemotherapy), and outcomes (treatment response). These form the vocabulary that papers in this domain use. Will create concepts combining these into searchable patterns."
  }
}
```

**Key Points**:
- LLM defines 5 entities (semantic space only had 3)
- Added "Chemotherapy" and "Treatment Response" - not in semantic space
- Each entity has canonical_forms optimized for search
- semantic_space_ref links to semantic space when applicable (optional)
- LLM explains rationale for each entity

## Phase 2: Concept Creation

Using entities from Phase 1, create concepts:

```json
{
  "concepts": [
    {
      "concept_id": "c1",
      "name": "Liquid biopsy ctDNA cancer detection",
      "entity_pattern": ["c_e1", "c_e2", "c_e3"],
      "relationship_edges": [
        {"from_entity_id": "c_e1", "to_entity_id": "c_e2", "relation_type": "measures"},
        {"from_entity_id": "c_e2", "to_entity_id": "c_e3", "relation_type": "detects"}
      ],
      "relationship_description": "Liquid biopsy measures circulating tumor DNA levels to detect cancer presence",
      "covered_topics": ["t1"],
      "rationale": "This pattern captures the complete early detection workflow: methodology → biomarker → disease. Papers about early detection discuss this methodological chain."
    },
    {
      "concept_id": "c2",
      "name": "ctDNA monitoring of chemotherapy response",
      "entity_pattern": ["c_e2", "c_e4", "c_e5"],
      "relationship_edges": [
        {"from_entity_id": "c_e4", "to_entity_id": "c_e2", "relation_type": "affects"},
        {"from_entity_id": "c_e2", "to_entity_id": "c_e5", "relation_type": "indicates"}
      ],
      "relationship_description": "Chemotherapy affects ctDNA levels, which indicate treatment response",
      "covered_topics": ["t2"],
      "rationale": "Monitoring papers discuss how treatment changes biomarker levels, and how those changes indicate response. This captures the monitoring relationship pattern."
    }
  ]
}
```

**Key Points**:
- entity_pattern uses entity_ids from Phase 1 (c_e1, c_e2, etc.)
- Concepts can use entities not in original semantic space
- Each concept targets specific topics
- Patterns reflect how papers actually discuss these relationships

## Schema Changes Needed

### New: ConceptEntity Schema

```python
class ConceptEntity(BaseModel):
    """An entity defined during concept generation"""
    entity_id: str = Field(description="Unique identifier (e.g., 'c_e1')")
    name: str = Field(description="Entity name")
    entity_type: str = Field(description="Type: methodology, biomarker, disease, treatment, outcome, etc.")
    canonical_forms: List[str] = Field(description="Search terms for this entity")
    rationale: str = Field(description="Why this entity is needed for topic coverage")
    semantic_space_ref: Optional[str] = Field(
        None,
        description="Reference to semantic space entity_id if applicable"
    )
```

### Updated: Concept Schema

```python
class Concept(BaseModel):
    concept_id: str
    name: str

    # Core pattern - references entities from Phase 1 analysis
    entity_pattern: List[str] = Field(
        description="List of entity_ids from phase1_analysis.entities"
    )

    # Relationship graph
    relationship_edges: List[RelationshipEdge]
    relationship_description: str

    # Coverage
    covered_topics: List[str]

    # Rationale
    rationale: str = Field(
        description="Why this pattern retrieves papers about covered topics"
    )

    # The rest stays the same...
```

### Updated: Phase 1 Analysis Schema

```python
class Phase1Analysis(BaseModel):
    """Results of independent entity-relationship analysis"""
    entities: List[ConceptEntity] = Field(
        description="Entities defined by LLM for covering topics"
    )
    relationship_patterns: List[str] = Field(
        description="High-level relationship patterns observed"
    )
    coverage_strategy: str = Field(
        description="Overall strategy for how these entities will cover topics"
    )
```

### Updated: Full Response Schema

```python
{
  "phase1_analysis": {
    "entities": [...],  # List of ConceptEntity
    "relationship_patterns": [...],  # List of strings
    "coverage_strategy": "..."  # String
  },
  "concepts": [...],  # List of Concept (using entity_ids from phase1)
  "overall_reasoning": "..."  # String
}
```

## Updated Prompt Structure

### System Prompt

```
You are an expert at designing retrieval configurations for research monitoring.

Your task: Analyze topics and define entity-relationship patterns that would retrieve relevant papers.

# PROCESS

## Phase 1: Independent Analysis

For the given topics, think through:

1. **What entities do research papers about these topics actually discuss?**
   - What are the key "things" (diseases, methods, biomarkers, treatments, etc.)?
   - What terms do papers use to refer to these entities?
   - Don't limit yourself to the semantic space - define what's actually needed.

2. **What relationships exist between these entities?**
   - How do papers connect these entities?
   - What relationship patterns appear frequently?

3. **What would cast the right net?**
   - What entity combinations would retrieve the right papers?
   - What patterns substantially cover each topic's domain?

Define entities with:
- entity_id: Unique ID (use "c_e1", "c_e2", etc.)
- name: Clear name
- entity_type: methodology, biomarker, disease, treatment, outcome, etc.
- canonical_forms: All search terms (synonyms, abbreviations, variants)
- rationale: Why this entity is needed
- semantic_space_ref: Reference to semantic space entity if applicable (optional)

## Phase 2: Concept Creation

Using the entities from Phase 1, create concepts:
- entity_pattern: List of entity_ids from Phase 1
- relationship_edges: How entities connect (directed edges)
- relationship_description: Human-readable explanation
- covered_topics: Which topics this pattern retrieves
- rationale: Why this pattern works

# FRAMEWORK PRINCIPLES

1. **Let the data guide you**: Define entities based on what papers actually discuss
2. **Semantic space is reference**: Use it for inspiration, not constraint
3. **Optimize for search**: Choose entities and terms that will cast the right net
4. **Cover the domain**: Patterns should substantially cover each topic
5. **Be specific**: Each concept = one focused pattern (not multiple OR'd patterns)

# VALIDATION

- Every topic must be covered by at least one concept
- Concepts with 3 entities need at least 2 edges
- All edges must reference entity_ids from Phase 1
- Graph must be connected

Respond in JSON with "phase1_analysis", "concepts", and "overall_reasoning".
```

### User Prompt

```
Analyze these topics and design retrieval patterns:

# TOPICS

{topics_list}

# SEMANTIC SPACE REFERENCE (for context)

Domain: {domain.name}
{domain.description}

Entities you might consider (not exhaustive):
{entities_from_semantic_space}

Relationships that might exist:
{relationships_from_semantic_space}

# YOUR TASK

Phase 1: Define the entities and relationships needed to cover these topics
Phase 2: Create concepts using those entities

Think independently - what entity-relationship patterns would actually retrieve the right papers?
```

## Key Benefits

1. **LLM does real analysis** - Not just template filling
2. **Flexible entity definition** - Can add entities as needed
3. **Search-optimized** - Entities designed for retrieval effectiveness
4. **Semantic space provides context** - Without constraining
5. **Traceable reasoning** - Each entity has rationale
6. **Links when applicable** - semantic_space_ref shows connections

## Migration Path

1. Update schemas to support phase1_analysis.entities
2. Update prompt with new process
3. Update parsing to handle ConceptEntity definitions
4. Update Concept.entity_pattern to reference phase1 entities
5. Update vocabulary_terms to build from phase1 entities
6. Update frontend to display entity definitions

## Example: Gap in Semantic Space

**Scenario**: Topic needs "Clinical Trial" entity, but semantic space doesn't have it

**Old approach**: Can't create concept (stuck)

**New approach**:
```json
{
  "phase1_analysis": {
    "entities": [
      {
        "entity_id": "c_e1",
        "name": "Clinical Trial",
        "canonical_forms": ["clinical trial", "RCT", "randomized trial"],
        "rationale": "Papers about treatment efficacy discuss clinical trials extensively",
        "semantic_space_ref": null  // Not in semantic space, but needed!
      }
    ]
  }
}
```

LLM creates the entity it needs, flags it as not in semantic space, continues with concept creation.

## Summary

**Core change**:
- Old: "Use these entities" → LLM template fills
- New: "Define what's needed" → LLM thinks, then creates

**Semantic space role**:
- Old: Constraint/requirement
- New: Reference/inspiration

**Result**:
- More intelligent analysis
- Search-optimized patterns
- Flexibility to adapt
- Clear reasoning trail
