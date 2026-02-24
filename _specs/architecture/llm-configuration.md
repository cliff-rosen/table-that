# LLM Configuration Architecture

## Overview

This document describes how LLM model configuration is structured, stored, and propagated through the system.

## Type Hierarchy

```
ModelInfo          - Available models (from /api/llm/models)
ModelConfig        - Base configuration for a single model
StageConfig        - ModelConfig + concurrency settings (for pipeline stages)
PipelineLLMConfig  - Container of StageConfigs for all pipeline stages
```

### ModelInfo

Single source of truth for what models are available. Returned by the `/api/llm/models` endpoint.

```python
class ModelInfo:
    model_id: str                    # "gpt-4.1", "o4-mini"
    display_name: str                # "GPT-4.1", "O4 Mini"
    supports_reasoning_effort: bool  # True for reasoning models
    reasoning_effort_levels: list    # ["minimal", "low", "medium", "high"]
    supports_temperature: bool       # True for chat models
    max_tokens: int | None
    supports_vision: bool
```

### ModelConfig

Base configuration for model selection and parameters. Used when you need to specify which model to use and how.

```python
class ModelConfig:
    model_id: str                        # Required: which model
    temperature: float | None            # For chat models (0.0-2.0)
    reasoning_effort: ReasoningEffort    # For reasoning models
    max_tokens: int | None               # Response limit
```

**Note:** Accepts legacy `model` field via validation alias for backwards compatibility with existing database records.

### StageConfig

Extends ModelConfig with concurrency control for batch processing in pipeline stages.

```python
class StageConfig(ModelConfig):
    max_concurrent: int = 10  # Max parallel LLM calls
```

### PipelineLLMConfig

Container holding configuration for all five pipeline stages.

```python
class PipelineLLMConfig:
    semantic_filter: StageConfig | None
    categorization: StageConfig | None
    article_summary: StageConfig | None
    category_summary: StageConfig | None
    executive_summary: StageConfig | None
```

## Configuration Flow

```
Stream (user preferences)
    │
    │  llm_config: PipelineLLMConfig
    │
    ▼
PipelineExecution (snapshot at run time)
    │
    │  llm_config: dict (JSON snapshot)
    │
    ▼
PipelineContext (runtime)
    │
    │  llm_config: PipelineLLMConfig (parsed from snapshot)
    │
    ▼
get_stage_config(config, stage) → StageConfig
    │
    │  Merges with defaults, ensures max_concurrent is present
    │
    ▼
Individual pipeline stage execution
```

### Stream Level

Users configure LLM preferences per research stream via the UI (ModelConfigForm). Stored as `llm_config` JSON column on the `research_streams` table.

### Execution Level

When a pipeline runs, the stream's `llm_config` is snapshotted into `pipeline_executions.llm_config`. This ensures the report reflects the configuration at execution time, not current stream settings.

### Runtime Access

The `get_stage_config()` function retrieves configuration for a specific stage:

```python
def get_stage_config(config: PipelineLLMConfig | None, stage: PipelineStage) -> StageConfig:
    """Returns StageConfig with all fields populated (merges with defaults)."""
```

This ensures:
- Missing stages fall back to defaults
- `max_concurrent` is always present
- Legacy `model` fields are normalized to `model_id`

## Defaults

```python
DEFAULT_PIPELINE_CONFIG = {
    semantic_filter:    { model_id: "gpt-4.1", temperature: 0.0, max_tokens: 2000, max_concurrent: 10 },
    categorization:     { model_id: "gpt-4.1", temperature: 0.0, max_tokens: 2000, max_concurrent: 10 },
    article_summary:    { model_id: "gpt-4.1", temperature: 0.0, max_tokens: 2000, max_concurrent: 5 },
    category_summary:   { model_id: "gpt-4.1", temperature: 0.0, max_tokens: 2000, max_concurrent: 5 },
    executive_summary:  { model_id: "gpt-4.1", temperature: 0.0, max_tokens: 2000, max_concurrent: 1 },
}
```

## Source Files

| Component | Backend | Frontend |
|-----------|---------|----------|
| Type definitions | `schemas/llm.py` | `types/llm.ts` |
| Model list endpoint | `routers/llm.py` | `lib/api/llmApi.ts` |
| Configuration UI | - | `components/stream/PhaseConfigForm.tsx` |
| Pipeline usage | `services/pipeline_service.py` | - |

Note: Import LLM types directly from `schemas/llm` (backend) or `types/llm` (frontend). Avoid re-exports.

## Backwards Compatibility

Existing database records may have `model` instead of `model_id`. Handled via:
- Backend: Pydantic `validation_alias="model"` with `populate_by_name=True`
- Frontend: `getStageConfig()` checks both fields and normalizes
