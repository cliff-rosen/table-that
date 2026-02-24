# Pipeline Services Architecture

## Overview

The research stream pipeline transforms raw literature searches into curated, categorized reports. This document describes the core AI services, how they're orchestrated, and the separation between production execution and development/testing.

## Core AI Services

Three services encapsulate the AI-powered operations:

| Service | Purpose | Input | Output |
|---------|---------|-------|--------|
| **AI Evaluation Service** | Semantic filtering | Article + criteria | Score + reasoning |
| **Article Categorization Service** | Category assignment | Article + categories | Assigned category IDs |
| **Report Summary Service** | Text generation | Articles + prompts | Executive/category/article summaries |

### AI Evaluation Service

Scores articles against natural language criteria. Used for semantic filtering in the pipeline.

```python
# services/ai_evaluation_service.py
class AIEvaluationService:
    async def evaluate_article(
        article: CanonicalResearchArticle,
        criteria: str,
        threshold: float,
        llm_config: ModelConfig
    ) -> FilterResult  # { passed, score, reasoning }
```

### Article Categorization Service

Assigns articles to presentation categories using LLM-based classification.

```python
# services/article_categorization_service.py
class ArticleCategorizationService:
    async def categorize_article(
        article: CanonicalResearchArticle,
        categories: List[Category],
        prompt: CategorizationPrompt,
        llm_config: ModelConfig
    ) -> List[str]  # category IDs
```

### Report Summary Service

Generates summaries at three levels: executive (whole report), category, and individual article.

```python
# services/report_summary_service.py
class ReportSummaryService:
    async def generate_executive_summary(articles, prompt, llm_config) -> str
    async def generate_category_summary(articles, category, prompt, llm_config) -> str
    async def generate_article_summary(article, prompt, llm_config) -> str
```

## Service Orchestration

```
┌─────────────────────────────────────────────────────────────────┐
│                      CORE AI SERVICES                           │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐   │
│  │  AI Evaluation  │ │    Article      │ │  Report Summary │   │
│  │    Service      │ │ Categorization  │ │    Service      │   │
│  │                 │ │    Service      │ │                 │   │
│  │  (filtering)    │ │  (assignment)   │ │  (generation)   │   │
│  └────────┬────────┘ └────────┬────────┘ └────────┬────────┘   │
└───────────┼───────────────────┼───────────────────┼─────────────┘
            │                   │                   │
            ▼                   ▼                   ▼
┌───────────────────────────────────────────────────────────────┐
│                     ORCHESTRATION LAYER                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Pipeline Service (Production)               │   │
│  │                                                          │   │
│  │  Full end-to-end execution:                              │   │
│  │  1. Load config (snapshotted at trigger time)           │   │
│  │  2. Execute retrieval queries (PubMed)                  │   │
│  │  3. Deduplicate within groups                           │   │
│  │  4. Apply semantic filters ────► AI Evaluation          │   │
│  │  5. Deduplicate globally                                │   │
│  │  6. Categorize articles ───────► Article Categorization │   │
│  │  7. Generate summaries ────────► Report Summary         │   │
│  │  8. Persist report                                      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌──────────────────────┐  ┌───────────────────────────────┐   │
│  │  Retrieval Testing   │  │      Prompt Testing           │   │
│  │      Service         │  │        Service                │   │
│  │                      │  │                               │   │
│  │  Test in isolation:  │  │  Test in isolation:           │   │
│  │  • Query expressions │  │  • Summary prompts            │   │
│  │  • Filter criteria   │  │  • Categorization prompts     │   │
│  │  • PMID comparison   │  │  • With real report data      │   │
│  │         │            │  │           │                   │   │
│  │         ▼            │  │           ▼                   │   │
│  │   AI Evaluation      │  │  Article Categorization       │   │
│  │                      │  │  Report Summary               │   │
│  └──────────────────────┘  └───────────────────────────────┘   │
└───────────────────────────────────────────────────────────────┘
```

## Production vs Development/Testing

| Aspect | Pipeline Service | Testing Services |
|--------|------------------|------------------|
| **Purpose** | Execute full pipeline, produce reports | Test individual components |
| **Execution** | End-to-end, all stages | Single operation |
| **Configuration** | Snapshotted at trigger time | Live/experimental |
| **Output** | Persisted Report | Immediate feedback |
| **API** | `/api/operations/runs/direct` | `/api/retrieval-testing/*`, `/api/prompt-testing/*` |

### Why Separate Testing Services?

1. **Fast iteration** - Test a filter without running the whole pipeline
2. **Prompt tuning** - Try different prompts on real data before committing
3. **Query refinement** - Compare PMID recall/precision across query variants
4. **No side effects** - Testing doesn't create reports or modify data

## API Organization

```
/api/research-streams     - CRUD, configuration
/api/operations           - Execution queue, scheduler, direct runs
/api/retrieval-testing    - Query testing, filter testing, PMID comparison
/api/prompt-testing       - Summary prompt testing, categorization testing
```

See [api-reorganization.md](../backend/_specs/api-reorganization.md) for detailed endpoint mapping.

## Configuration Flow

Pipeline configuration is snapshotted at trigger time to ensure reproducibility:

```
Stream Configuration                 Execution Record
──────────────────                   ────────────────
retrieval_config ──────────────────► retrieval_config (snapshot)
presentation_config ───────────────► presentation_config (snapshot)
enrichment_config ─────────────────► enrichment_config (snapshot)
llm_config ────────────────────────► llm_config (snapshot)
                                            │
                                            ▼
                                     Pipeline Service
                                     (reads ONLY from snapshot)
```

See [llm-configuration.md](./llm-configuration.md) for LLM model configuration details.

## Source Files

### Core AI Services
| Service | File |
|---------|------|
| AI Evaluation | `services/ai_evaluation_service.py` |
| Article Categorization | `services/article_categorization_service.py` |
| Report Summary | `services/report_summary_service.py` |

### Orchestration
| Service | File |
|---------|------|
| Pipeline Service | `services/pipeline_service.py` |
| Retrieval Testing | `services/retrieval_testing_service.py` |
| Prompt Testing | `services/prompt_testing_service.py` |

### Routers
| Router | File | Prefix |
|--------|------|--------|
| Operations | `routers/operations.py` | `/api/operations` |
| Retrieval Testing | `routers/retrieval_testing.py` | `/api/retrieval-testing` |
| Prompt Testing | `routers/prompt_testing.py` | `/api/prompt-testing` |
