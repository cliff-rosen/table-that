import { useState, useEffect } from 'react';
import {
    ResearchStream,
    PipelineLLMConfig,
    PipelineStage,
    StageConfig,
    ReasoningEffort,
    ModelInfo,
    DEFAULT_PIPELINE_CONFIG,
    getStageConfig
} from '../../types';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { llmApi } from '../../lib/api/llmApi';
import { showErrorToast, showSuccessToast } from '../../lib/errorToast';

const REASONING_EFFORT_OPTIONS: { value: ReasoningEffort; label: string }[] = [
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
];

// Pipeline stages (part of report generation pipeline)
const PIPELINE_STAGE_LABELS: Record<string, { name: string; description: string }> = {
    semantic_filter: { name: 'Semantic Filter', description: 'Evaluates article relevance during retrieval' },
    categorization: { name: 'Article Categorization', description: 'Assigns articles to presentation categories' },
    article_summary: { name: 'Article Summaries', description: 'Generates per-article AI summaries' },
    category_summary: { name: 'Category Summaries', description: 'Generates category-level summaries' },
    executive_summary: { name: 'Executive Summary', description: 'Generates overall report summary' },
};

// Non-pipeline stages (on-demand features)
const OTHER_STAGE_LABELS: Record<string, { name: string; description: string }> = {
    stance_analysis: { name: 'Stance Analysis', description: 'Analyzes article stance (pro-defense vs pro-plaintiff)' },
};

// Combined for type compatibility
const STAGE_LABELS: Record<PipelineStage, { name: string; description: string }> = {
    ...PIPELINE_STAGE_LABELS,
    ...OTHER_STAGE_LABELS,
} as Record<PipelineStage, { name: string; description: string }>;

interface PhaseConfigFormProps {
    stream: ResearchStream;
    onConfigUpdate?: () => void;
    canModify?: boolean;
}

export default function PhaseConfigForm({ stream, onConfigUpdate, canModify = true }: PhaseConfigFormProps) {
    const [config, setConfig] = useState<PipelineLLMConfig>(stream.llm_config || DEFAULT_PIPELINE_CONFIG);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    const [models, setModels] = useState<ModelInfo[]>([]);
    const [isLoadingModels, setIsLoadingModels] = useState(true);

    // Fetch available models from backend
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await llmApi.getModels();
                setModels(response.models);
            } catch (error) {
                console.error('Failed to fetch models:', error);
                showErrorToast(error, 'Failed to load model options');
            } finally {
                setIsLoadingModels(false);
            }
        };
        fetchModels();
    }, []);

    // Reset when stream changes
    useEffect(() => {
        setConfig(stream.llm_config || DEFAULT_PIPELINE_CONFIG);
        setHasChanges(false);
    }, [stream.stream_id, stream.llm_config]);

    const isReasoningModel = (modelId: string | undefined) => {
        if (!modelId) return false;
        const model = models.find(m => m.model_id === modelId);
        return model?.supports_reasoning_effort ?? false;
    };

    const updateStageConfig = (
        stage: PipelineStage,
        updates: Partial<StageConfig>
    ) => {
        setConfig(prev => {
            const currentStage = getStageConfig(prev, stage);
            const newStageConfig = { ...currentStage, ...updates };

            // If changing to a reasoning model, set default reasoning_effort and remove temperature
            if (updates.model_id && isReasoningModel(updates.model_id)) {
                newStageConfig.reasoning_effort = newStageConfig.reasoning_effort || 'medium';
                delete newStageConfig.temperature;
            }
            // If changing to a non-reasoning model, set default temperature and remove reasoning_effort
            else if (updates.model_id && !isReasoningModel(updates.model_id)) {
                newStageConfig.temperature = newStageConfig.temperature ?? 0.0;
                delete newStageConfig.reasoning_effort;
            }

            return { ...prev, [stage]: newStageConfig };
        });
        setHasChanges(true);
    };

    const handleSave = async () => {
        setIsSaving(true);
        try {
            await researchStreamApi.updateResearchStream(stream.stream_id, {
                llm_config: config
            });
            showSuccessToast('Phase configuration saved');
            setHasChanges(false);
            if (onConfigUpdate) {
                onConfigUpdate();
            }
        } catch (error) {
            showErrorToast(error, 'Failed to save phase configuration');
        } finally {
            setIsSaving(false);
        }
    };

    const handleResetToDefaults = () => {
        setConfig(DEFAULT_PIPELINE_CONFIG);
        setHasChanges(true);
    };

    // Separate models by type
    const chatModels = models.filter(m => m.supports_temperature && !m.supports_reasoning_effort);
    const reasoningModels = models.filter(m => m.supports_reasoning_effort);

    const renderStageConfig = (stage: PipelineStage) => {
        const stageConfig = getStageConfig(config, stage);
        const { name, description } = STAGE_LABELS[stage];
        const isReasoning = isReasoningModel(stageConfig.model_id);

        return (
            <div key={stage} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="mb-3">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">{name}</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
                </div>
                <div className="grid grid-cols-4 gap-4">
                    {/* Model Selection */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Model
                        </label>
                        <select
                            value={stageConfig.model_id}
                            onChange={(e) => updateStageConfig(stage, { model_id: e.target.value })}
                            disabled={!canModify || isLoadingModels}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                       focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoadingModels ? (
                                <option>Loading models...</option>
                            ) : (
                                <>
                                    {chatModels.length > 0 && (
                                        <optgroup label="Chat Models (Temperature)">
                                            {chatModels.map(m => (
                                                <option key={m.model_id} value={m.model_id}>{m.display_name}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                    {reasoningModels.length > 0 && (
                                        <optgroup label="Reasoning Models (Reasoning Effort)">
                                            {reasoningModels.map(m => (
                                                <option key={m.model_id} value={m.model_id}>{m.display_name}</option>
                                            ))}
                                        </optgroup>
                                    )}
                                </>
                            )}
                        </select>
                    </div>

                    {/* Temperature or Reasoning Effort */}
                    <div>
                        {isReasoning ? (
                            <>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Reasoning Effort
                                </label>
                                <select
                                    value={stageConfig.reasoning_effort || 'medium'}
                                    onChange={(e) => updateStageConfig(stage, { reasoning_effort: e.target.value as ReasoningEffort })}
                                    disabled={!canModify}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
                                               bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                               focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                               disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {REASONING_EFFORT_OPTIONS.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </>
                        ) : (
                            <>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Temperature ({stageConfig.temperature?.toFixed(1) || '0.0'})
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.1"
                                    value={stageConfig.temperature ?? 0.0}
                                    onChange={(e) => updateStageConfig(stage, { temperature: parseFloat(e.target.value) })}
                                    disabled={!canModify}
                                    className="w-full h-2 mt-3 bg-gray-200 dark:bg-gray-600 rounded-lg appearance-none cursor-pointer
                                               disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                            </>
                        )}
                    </div>

                    {/* Max Tokens */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Max Tokens
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="16000"
                            placeholder="Default"
                            value={stageConfig.max_tokens || ''}
                            onChange={(e) => updateStageConfig(stage, {
                                max_tokens: e.target.value ? parseInt(e.target.value, 10) : undefined
                            })}
                            disabled={!canModify}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                       focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                       disabled:opacity-50 disabled:cursor-not-allowed
                                       placeholder:text-gray-400"
                        />
                    </div>

                    {/* Max Concurrent */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Concurrency
                        </label>
                        <input
                            type="number"
                            min="1"
                            max="50"
                            value={stageConfig.max_concurrent || 10}
                            onChange={(e) => updateStageConfig(stage, {
                                max_concurrent: e.target.value ? parseInt(e.target.value, 10) : undefined
                            })}
                            disabled={!canModify}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md
                                       bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100
                                       focus:ring-2 focus:ring-blue-500 focus:border-transparent
                                       disabled:opacity-50 disabled:cursor-not-allowed"
                        />
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-200 mb-2">
                    Pipeline Phase Configuration
                </h3>
                <p className="text-sm text-orange-800 dark:text-orange-300">
                    Configure AI model and concurrency settings for each pipeline phase.
                </p>
            </div>

            {/* Pipeline Stage Configurations */}
            <div className="space-y-4">
                {(Object.keys(PIPELINE_STAGE_LABELS) as PipelineStage[]).map(stage => renderStageConfig(stage))}
            </div>

            {/* Other Features Section */}
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg p-4 mt-6">
                <h3 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200 mb-2">
                    Other AI Features
                </h3>
                <p className="text-sm text-indigo-800 dark:text-indigo-300">
                    Configure AI settings for on-demand features (not part of the pipeline).
                </p>
            </div>

            {/* Other Stage Configurations */}
            <div className="space-y-4">
                {(Object.keys(OTHER_STAGE_LABELS) as PipelineStage[]).map(stage => renderStageConfig(stage))}
            </div>

            {/* Actions */}
            <div className="flex justify-between items-center pt-4 border-t border-gray-200 dark:border-gray-700">
                <button
                    type="button"
                    onClick={handleResetToDefaults}
                    disabled={!canModify || isSaving}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200
                               disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Reset to Defaults
                </button>
                <button
                    type="button"
                    onClick={handleSave}
                    disabled={!canModify || isSaving || !hasChanges}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700
                               rounded-md disabled:opacity-50 disabled:cursor-not-allowed
                               flex items-center gap-2"
                >
                    {isSaving ? (
                        <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                            </svg>
                            Saving...
                        </>
                    ) : hasChanges ? 'Save Changes' : 'Saved'}
                </button>
            </div>
        </div>
    );
}
