# Broad Query Generator Tool

## Problem Statement

Given a natural language description of target articles and a monthly hit budget, generate a PubMed query that:

1. **Maximizes recall** - captures all relevant articles (minimizes false negatives)
2. **Stays within budget** - doesn't exceed the maximum monthly hit count

False positives are acceptable because downstream LLM semantic filtering can clean them up cheaply. False negatives are expensive because we never know what we missed.

## Why This Is Hard

### The Recall Problem

We cannot directly measure recall because we don't know the universe of relevant articles. A query returning 500 hits (within budget) tells us nothing about whether we're missing 50 or 500 relevant articles.

### The Satisficing Trap

It's tempting to stop when we find a query within budget:

```
Query A: 1500 hits (over budget of 1000)
    ↓ narrow
Query B: 700 hits (under budget)
    ↓
"Done!" ← But did we narrow too aggressively?
```

Query B might have excellent precision but terrible recall. We have no feedback signal.

### The Vocabulary Coverage Problem

Relevant articles can only be missed if they use terminology our query doesn't cover. But PubMed vocabulary is vast:
- Synonyms (cancer, carcinoma, neoplasm, tumor, malignancy)
- Abbreviations (NSCLC, HCC, AML)
- MeSH terms vs free text
- Historical terminology changes
- Spelling variants

## Proposed Solution

### Core Insight

While we can't measure recall directly, we CAN:
1. **Measure vocabulary coverage** - have we included all reasonable term variants?
2. **Create synthetic ground truth** - use broad query results as a validation set

### Algorithm Overview

```
Phase 1: EXPAND - Build maximally broad query
Phase 2: VALIDATE - Create synthetic ground truth from broad results
Phase 3: NARROW - Carefully reduce volume while preserving recall
Phase 4: VERIFY - Confirm narrowed query still captures validation set
```

## Detailed Algorithm

### Phase 1: Concept Extraction & Expansion

```python
def phase1_expand(description: str) -> Query:
    # 1. Extract distinct concepts from description
    concepts = llm_extract_concepts(description)
    # Example: "genetic predisposition to mesothelioma"
    # → [genetics/heredity, predisposition/susceptibility, mesothelioma]

    # 2. For each concept, generate exhaustive term list
    for concept in concepts:
        concept.terms = llm_exhaustive_synonyms(concept)
        # genetics → genetic*, germline, hereditary, familial, inherited,
        #            polymorphism*, SNP, variant*, mutation*, allele*,
        #            susceptibility gene, penetrance, BRCA, BAP1...

    # 3. Build maximal OR-expanded query
    # (term1 OR term2 OR ...) AND (term1 OR term2 OR ...) AND ...
    return build_boolean_query(concepts)
```

**Key Question**: How do we know when vocabulary expansion is "exhaustive"?

Options:
- LLM confidence signal ("I can't think of more terms")
- PubMed MeSH tree traversal
- Iterative: add terms until no new articles appear
- Human review of term list

### Phase 2: Synthetic Ground Truth

```python
def phase2_validate(broad_query: Query, description: str) -> ValidationSet:
    hits = test_query(broad_query)  # e.g., 1500 hits

    # Sample from broad results
    sample = fetch_random_sample(broad_query, n=50)

    # LLM evaluates each: relevant to description?
    validation_set = []
    for article in sample:
        if llm_is_relevant(article, description):
            validation_set.append(article.pmid)

    # e.g., 35 of 50 are relevant → these are our "must-find" PMIDs
    return validation_set
```

**Key Insight**: The broad query, even though over budget, gives us a sample of ground truth. Any narrowing that loses these articles is too aggressive.

**Open Question**: Is 50 samples enough? What's the statistical confidence?

### Phase 3: Narrowing Strategies

When over budget, try these strategies in order of "recall safety":

| Strategy | Description | Recall Risk | Volume Impact |
|----------|-------------|-------------|---------------|
| Field restriction | Add `[Title/Abstract]` | Low | Moderate |
| Drop rare synonyms | Remove low-frequency terms | Low | Small |
| Proximity operators | Terms must be near each other | Medium | Large |
| Concept tightening | Require more specific relationships | Medium | Large |
| Drop concept branch | Remove entire OR group | High | Very large |

```python
def phase3_narrow(query: Query, budget: int, validation_set: List[str]) -> Query:
    strategies = [
        add_field_restriction,      # [tiab] - safest
        drop_rare_synonyms,         # remove terms with <1% contribution
        add_proximity_requirement,  # terms within N words
        require_mesh_heading,       # limit to MeSH-indexed
    ]

    for strategy in strategies:
        candidate = strategy(query)
        hits = test_query(candidate)

        if hits > budget:
            continue  # Still over, try next strategy

        # Under budget - but did we lose relevant articles?
        captured = count_pmids_found(candidate, validation_set)

        if captured == len(validation_set):
            return candidate  # Safe narrowing!
        else:
            lost = len(validation_set) - captured
            log(f"Strategy {strategy} lost {lost} validation articles - rejecting")
            continue

    # No safe narrowing found
    raise NoSafeNarrowingError(
        "Cannot fit within budget without losing relevant articles. "
        "Consider increasing budget or accepting some recall loss."
    )
```

### Phase 4: Verification & Reporting

```python
def phase4_verify(final_query: Query, validation_set: List[str]) -> Report:
    # Final check
    captured = get_pmids_found(final_query, validation_set)
    missed = set(validation_set) - set(captured)

    if missed:
        # Analyze why validation articles were lost
        for pmid in missed:
            article = fetch_article(pmid)
            reason = llm_explain_miss(final_query, article)
            # "Article uses term 'mesothelial neoplasm' which is not in query"

    return Report(
        query=final_query,
        estimated_monthly_hits=test_query(final_query),
        validation_recall=len(captured) / len(validation_set),
        vocabulary_coverage=analyze_term_coverage(final_query),
        narrowing_history=get_iteration_log()
    )
```

## Open Questions for Discussion

### 1. Vocabulary Exhaustion Signal
How do we know when we've captured all reasonable term variants? Options:
- LLM self-assessment ("I can't think of more")
- Diminishing returns (new terms add <1% new articles)
- MeSH hierarchy traversal
- Require human sign-off on term list

### 2. Validation Set Size
Is 50 samples statistically sufficient? If only 70% are relevant (35 articles), and we need 95% confidence that narrowing preserves recall, what's the required sample size?

### 3. Handling Tradeoffs
What if NO narrowing strategy preserves all validation articles? Options:
- Refuse to generate query, ask user to increase budget
- Show user the tradeoff: "To fit budget, we'd lose ~15% of relevant articles"
- Let user choose which narrowing strategy, informed by what it loses

### 4. Expansion When Under Budget
If initial query is already under budget, should we:
- Stop immediately (we're broad enough)
- Try to expand further (we have headroom)
- Sample and validate anyway (confirm quality)

### 5. Iterative Expansion Strategy
Alternative approach: start narrow, expand until hitting budget ceiling
- Pro: Guaranteed to stay within budget
- Con: Might miss the "shape" of optimal query; local maxima risk

### 6. Multi-Query Strategy
Instead of one query, generate multiple complementary queries:
- Query A: Core terms, high precision
- Query B: Synonym expansion, catches edge cases
- Query C: MeSH-based, catches indexed articles
- Union of results stays within budget

## Proposed API

```python
class BroadQueryRequest(BaseModel):
    description: str          # Natural language description of target articles
    lower_limit: int          # Minimum acceptable monthly hits (use the budget!)
    upper_limit: int          # Maximum acceptable monthly hits
    must_find_pmids: Optional[List[str]] = None  # Known relevant PMIDs to validate

class QueryAttempt(BaseModel):
    query: str
    hits: int
    strategy: str             # "initial", "field_restriction", "drop_rare", etc.
    validation_recall: float  # What % of validation set was captured
    accepted: bool

class BroadQueryResponse(BaseModel):
    final_query: str
    estimated_monthly_hits: int
    validation_set_size: int
    validation_recall: float  # Should be 1.0 if successful
    concepts_extracted: List[ConceptExpansion]
    attempts: List[QueryAttempt]
    warnings: List[str]       # e.g., "Had to drop rare synonyms"
```

## Success Criteria

A query is "optimal" when:
1. **Volume**: `lower_limit <= hits <= upper_limit`
2. **Recall**: 100% of validation set captured (or explicit user acceptance of loss)
3. **Coverage**: All extracted concepts have term representation
4. **Stability**: Query structure is robust (not overfitted to validation set)

## Next Steps

1. Agree on algorithm structure
2. Define vocabulary exhaustion criteria
3. Determine validation set size requirements
4. Build prototype and test on real examples
5. Iterate based on observed failure modes
