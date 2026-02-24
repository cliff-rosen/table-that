/**
 * LLM types for AI model configuration and pipeline stages.
 *
 * Organized to mirror backend schemas/llm.py for easy cross-reference.
 * Note: Backend has additional Message Types section for LLM infrastructure.
 *
 * Type hierarchy:
 * - ModelConfig: Base configuration for model selection
 * - StageConfig: Extends ModelConfig with concurrency settings for pipeline stages
 * - ModelInfo: Metadata about available models
 * - PipelineLLMConfig: Configuration for all pipeline stages
 */

// =============================================================================
// Model Configuration Hierarchy
// =============================================================================

/**
 * Reasoning effort levels for reasoning models (o3, o3-mini, o4-mini)
 */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

/**
 * Base configuration for model selection and parameters.
 * Note: Accepts both 'model_id' and legacy 'model' field for backwards compatibility.
 * At least one of model_id or model must be present.
 */
export interface ModelConfig {
    model_id?: string;  // Model identifier (e.g., 'gpt-4.1', 'o4-mini')
    model?: string;  // Legacy field name - use model_id instead
    temperature?: number;  // Temperature (0.0-2.0) for chat models
    reasoning_effort?: ReasoningEffort;  // Reasoning effort for reasoning models
    max_tokens?: number;  // Maximum tokens for the response
}

/**
 * Configuration for a pipeline stage. Extends ModelConfig with concurrency settings.
 */
export interface StageConfig extends ModelConfig {
    max_concurrent?: number;  // Maximum concurrent LLM calls for batch processing
}

/**
 * Information about an available model. Returned from /api/llm/models endpoint.
 */
export interface ModelInfo {
    model_id: string;
    display_name: string;
    supports_reasoning_effort: boolean;
    reasoning_effort_levels: string[] | null;
    supports_temperature: boolean;
    max_tokens: number | null;
    supports_vision?: boolean;
}

/**
 * LLM configuration for all pipeline stages.
 */
export interface PipelineLLMConfig {
    semantic_filter?: StageConfig;
    categorization?: StageConfig;
    article_summary?: StageConfig;
    stance_analysis?: StageConfig;
    category_summary?: StageConfig;
    executive_summary?: StageConfig;
}

/**
 * Type for pipeline stage names.
 */
export type PipelineStage = keyof PipelineLLMConfig;

// =============================================================================
// Defaults
// =============================================================================

export const DEFAULT_MODEL_CONFIG: ModelConfig = {
    model_id: 'gpt-4.1',
    temperature: 0.0,
    max_tokens: 2000
};

export const DEFAULT_STAGE_CONFIG: StageConfig = {
    model_id: 'gpt-4.1',
    temperature: 0.0,
    max_tokens: 2000,
    max_concurrent: 10
};

export const DEFAULT_PIPELINE_CONFIG: Required<PipelineLLMConfig> = {
    semantic_filter: { model_id: 'gpt-4.1', temperature: 0.0, max_tokens: 2000, max_concurrent: 10 },
    categorization: { model_id: 'gpt-4.1', temperature: 0.0, max_tokens: 2000, max_concurrent: 10 },
    article_summary: { model_id: 'gpt-4.1', temperature: 0.0, max_tokens: 2000, max_concurrent: 5 },
    stance_analysis: { model_id: 'gpt-4.1', temperature: 0.0, max_tokens: 2000, max_concurrent: 5 },
    category_summary: { model_id: 'gpt-4.1', temperature: 0.0, max_tokens: 2000, max_concurrent: 5 },
    executive_summary: { model_id: 'gpt-4.1', temperature: 0.0, max_tokens: 2000, max_concurrent: 1 },
};

// =============================================================================
// Utilities
// =============================================================================

/**
 * Get the configuration for a pipeline stage, merging with defaults to ensure all fields are present.
 * Handles legacy 'model' field by normalizing to 'model_id'.
 */
export function getStageConfig(config: PipelineLLMConfig | null | undefined, stage: PipelineStage): StageConfig {
    const defaultStage = DEFAULT_PIPELINE_CONFIG[stage];

    if (!config) {
        return defaultStage;
    }

    const stageConfig = config[stage];
    if (!stageConfig) {
        return defaultStage;
    }

    // Normalize: use model_id if present, fall back to legacy 'model' field, then default
    const modelId = stageConfig.model_id || stageConfig.model || defaultStage.model_id;

    // Merge provided config with defaults to ensure max_concurrent is always present
    return {
        model_id: modelId,
        temperature: stageConfig.temperature,
        reasoning_effort: stageConfig.reasoning_effort,
        max_tokens: stageConfig.max_tokens ?? defaultStage.max_tokens,
        max_concurrent: stageConfig.max_concurrent ?? defaultStage.max_concurrent,
    };
}
