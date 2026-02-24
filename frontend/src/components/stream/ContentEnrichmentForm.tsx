/**
 * Content Enrichment Form - Prompt Workbench UI
 *
 * Allows users to customize prompts for report summaries:
 * - Executive Summary prompt
 * - Category Summary prompt
 *
 * Features:
 * - Collapsible slug reference panel (left)
 * - Prompt editors (center)
 * - Three-mode results pane: collapsed, side panel, full modal
 * - Test with sample data or existing reports
 */

import { useState, useEffect, useCallback } from 'react';
import {
    DocumentTextIcon,
    BeakerIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    ClipboardDocumentIcon,
    SparklesIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    XMarkIcon,
    TrashIcon
} from '@heroicons/react/24/outline';
import {
    promptTestingApi,
    PromptTemplate,
    SlugInfo,
    TestSummaryPromptResponse
} from '../../lib/api/promptTestingApi';
import { reportApi } from '../../lib/api/reportApi';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { llmApi } from '../../lib/api/llmApi';
import { RegenerateSummariesLLMConfig } from '../../lib/api/curationApi';
import { Report, Category, ResearchStream, ModelConfig, ModelInfo, DEFAULT_MODEL_CONFIG, EnrichmentConfig } from '../../types';
import { copyToClipboard } from '../../lib/utils/clipboard';
import ApplyToReportModal from './ApplyToReportModal';

interface PromptSuggestion {
    target: 'system_prompt' | 'user_prompt_template';
    current_issue: string;
    suggested_text: string;
    reasoning: string;
}

interface AppliedPromptSuggestions {
    prompt_type: 'executive_summary' | 'category_summary' | 'article_summary';
    suggestions: PromptSuggestion[];
}

interface ContentEnrichmentFormProps {
    streamId: number;
    stream?: ResearchStream;  // Stream object to access llm_config for default model
    onSave?: () => void;
    appliedSuggestions?: AppliedPromptSuggestions | null;
    onSuggestionsApplied?: () => void;
}

type PromptType = 'executive_summary' | 'category_summary' | 'article_summary';
type ResultsPaneMode = 'collapsed' | 'side' | 'full';

interface HistoryEntry {
    id: number;
    timestamp: Date;
    promptType: PromptType;
    prompts: PromptTemplate;
    dataSource: { type: 'report'; reportId: number; categoryId?: string } | { type: 'paste' };
    result: TestSummaryPromptResponse;
}

export default function ContentEnrichmentForm({
    streamId,
    stream,
    onSave,
    appliedSuggestions,
    onSuggestionsApplied
}: ContentEnrichmentFormProps) {
    // State for prompts
    const [activePromptType, setActivePromptType] = useState<PromptType>('executive_summary');
    const [prompts, setPrompts] = useState<Record<string, PromptTemplate>>({});
    const [savedPrompts, setSavedPrompts] = useState<Record<string, PromptTemplate>>({}); // Last saved version
    const [defaults, setDefaults] = useState<Record<string, PromptTemplate>>({});
    const [availableSlugs, setAvailableSlugs] = useState<Record<string, SlugInfo[]>>({});
    const [hasChanges, setHasChanges] = useState(false);

    // State for testing
    const [testMode, setTestMode] = useState<'report' | 'paste'>('report');
    const [reports, setReports] = useState<Report[]>([]);
    const [categories, setCategories] = useState<Category[]>([]); // Stream categories for dropdown
    const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
    const [selectedArticleIndex, setSelectedArticleIndex] = useState<number>(0);
    const [pastedData, setPastedData] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [useStreamModel, setUseStreamModel] = useState(true);  // Use stream's configured model
    const [customModelConfig, setCustomModelConfig] = useState<ModelConfig>({ ...DEFAULT_MODEL_CONFIG });
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);

    // History state for time travel - separate history per prompt type
    const [historyByType, setHistoryByType] = useState<Record<PromptType, HistoryEntry[]>>({
        executive_summary: [],
        category_summary: [],
        article_summary: []
    });
    const [historyIndexByType, setHistoryIndexByType] = useState<Record<PromptType, number>>({
        executive_summary: -1,
        category_summary: -1,
        article_summary: -1
    });
    const [nextHistoryId, setNextHistoryId] = useState(1);

    // Get history for current prompt type
    const history = historyByType[activePromptType];
    const historyIndex = historyIndexByType[activePromptType];

    // UI state
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [slugsPaneCollapsed, setSlugsPaneCollapsed] = useState(false);
    const [copiedSlug, setCopiedSlug] = useState<string | null>(null);
    const [resultsPaneMode, setResultsPaneMode] = useState<ResultsPaneMode>('collapsed');
    const [showRenderedPrompts, setShowRenderedPrompts] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    // Apply to Report modal state
    const [showApplyModal, setShowApplyModal] = useState(false);
    const [applyModalReportId, setApplyModalReportId] = useState<number | null>(null);
    const [applyModalPrompt, setApplyModalPrompt] = useState<PromptTemplate | null>(null);
    const [applyModalLLMConfig, setApplyModalLLMConfig] = useState<RegenerateSummariesLLMConfig | undefined>(undefined);
    const [applyModalPromptType, setApplyModalPromptType] = useState<PromptType>('article_summary');

    // Load initial data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                // Load all data in parallel
                const [defaultsResponse, configResponse, streamReports, stream] = await Promise.all([
                    promptTestingApi.getDefaults(),
                    researchStreamApi.getEnrichmentConfig(streamId),
                    reportApi.getReportsForStream(streamId),
                    researchStreamApi.getResearchStream(streamId)
                ]);

                // Apply defaults and slugs
                setDefaults(defaultsResponse.prompts);
                setAvailableSlugs(defaultsResponse.available_slugs);

                let currentPrompts: Record<string, PromptTemplate>;
                if (configResponse.enrichment_config?.prompts) {
                    // Merge with defaults for any missing prompt types
                    currentPrompts = {
                        ...defaultsResponse.prompts,
                        ...configResponse.enrichment_config.prompts
                    };
                } else {
                    currentPrompts = defaultsResponse.prompts;
                }
                setPrompts(currentPrompts);
                setSavedPrompts(currentPrompts);

                // Apply reports
                setReports(streamReports);
                if (streamReports.length > 0) {
                    setSelectedReportId(streamReports[0].report_id);
                }

                // Apply stream categories for category summary testing
                if (stream.presentation_config?.categories) {
                    setCategories(stream.presentation_config.categories);
                    // Auto-select first category if available
                    if (stream.presentation_config.categories.length > 0) {
                        setSelectedCategoryId(stream.presentation_config.categories[0].id);
                    }
                }
            } catch (err: any) {
                console.error('Error loading enrichment config:', err);
                setError(err.message || 'Failed to load configuration');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [streamId]);

    // Fetch available models from backend
    useEffect(() => {
        const fetchModels = async () => {
            try {
                const response = await llmApi.getModels();
                setAvailableModels(response.models);
            } catch (error) {
                console.error('Failed to fetch models:', error);
            }
        };
        fetchModels();
    }, []);

    // Apply suggestions from chat when received
    useEffect(() => {
        if (appliedSuggestions && appliedSuggestions.suggestions.length > 0) {
            const promptType = appliedSuggestions.prompt_type;

            // Switch to the relevant prompt type tab
            setActivePromptType(promptType);

            // Apply each suggestion
            setPrompts(prev => {
                const updated = { ...prev };
                const currentPrompt = { ...prev[promptType] };

                for (const suggestion of appliedSuggestions.suggestions) {
                    if (suggestion.target === 'system_prompt') {
                        currentPrompt.system_prompt = suggestion.suggested_text;
                    } else if (suggestion.target === 'user_prompt_template') {
                        currentPrompt.user_prompt_template = suggestion.suggested_text;
                    }
                }

                updated[promptType] = currentPrompt;
                return updated;
            });

            setHasChanges(true);

            // Notify parent that suggestions have been applied
            if (onSuggestionsApplied) {
                onSuggestionsApplied();
            }
        }
    }, [appliedSuggestions, onSuggestionsApplied]);

    // Track changes
    const updatePrompt = useCallback((type: PromptType, field: 'system_prompt' | 'user_prompt_template', value: string) => {
        setPrompts(prev => ({
            ...prev,
            [type]: {
                ...prev[type],
                [field]: value
            }
        }));
        setHasChanges(true);
    }, []);

    // Check if a specific prompt matches its default
    const isPromptUsingDefault = useCallback((promptType: PromptType) => {
        const current = prompts[promptType];
        const defaultPrompt = defaults[promptType];
        if (!current || !defaultPrompt) return true;
        return current.system_prompt === defaultPrompt.system_prompt &&
               current.user_prompt_template === defaultPrompt.user_prompt_template;
    }, [prompts, defaults]);

    // Check if all prompts are using defaults
    const allPromptsUsingDefaults = useCallback(() => {
        return (['executive_summary', 'category_summary', 'article_summary'] as PromptType[])
            .every(pt => isPromptUsingDefault(pt));
    }, [isPromptUsingDefault]);

    // Reset current prompt to defaults (with confirmation)
    const handleResetToDefaults = useCallback(() => {
        setShowResetConfirm(true);
    }, []);

    const confirmResetToDefaults = useCallback(() => {
        // Only reset the active prompt type, not all prompts
        setPrompts(prev => ({
            ...prev,
            [activePromptType]: defaults[activePromptType]
        }));
        setHasChanges(true);
        setShowResetConfirm(false);
    }, [defaults, activePromptType]);

    // Reset to last saved version
    const resetToSaved = useCallback(() => {
        setPrompts(savedPrompts);
        setHasChanges(false);
    }, [savedPrompts]);

    // Save changes
    const handleSave = async () => {
        setSaving(true);
        setError(null);
        try {
            // If all prompts match defaults, save null to use defaults
            const allDefaults = allPromptsUsingDefaults();
            const config: EnrichmentConfig | null = allDefaults ? null : { prompts };
            console.log('Saving enrichment config:', { allDefaults, config, prompts });
            await researchStreamApi.updateEnrichmentConfig(streamId, config);
            console.log('Save successful');
            // Update saved state
            setSavedPrompts(prompts);
            setHasChanges(false);
            onSave?.();
        } catch (err: any) {
            console.error('Error saving enrichment config:', err);
            setError(err.message || 'Failed to save');
        } finally {
            setSaving(false);
        }
    };

    // Test prompt
    const handleTest = async () => {
        if (!prompts[activePromptType]) return;

        setIsTesting(true);
        setError(null);

        try {
            const request: any = {
                prompt_type: activePromptType,
                prompt: prompts[activePromptType]
            };

            let dataSource: HistoryEntry['dataSource'];

            if (testMode === 'report' && selectedReportId) {
                request.report_id = selectedReportId;
                dataSource = { type: 'report', reportId: selectedReportId };
                if (activePromptType === 'category_summary' && selectedCategoryId) {
                    request.category_id = selectedCategoryId;
                    dataSource.categoryId = selectedCategoryId;
                }
                if (activePromptType === 'article_summary') {
                    request.article_index = selectedArticleIndex;
                }
            } else if (testMode === 'paste' && pastedData) {
                try {
                    request.sample_data = JSON.parse(pastedData);
                    dataSource = { type: 'paste' };
                } catch {
                    setError('Invalid JSON in sample data');
                    setIsTesting(false);
                    return;
                }
            } else {
                setError('Please select a report or paste sample data');
                setIsTesting(false);
                return;
            }

            // Add LLM config
            if (useStreamModel && stream?.llm_config) {
                // Use stream's configured model for this prompt type
                const stageConfig = stream.llm_config[activePromptType as keyof typeof stream.llm_config];
                if (stageConfig) {
                    request.llm_config = stageConfig;
                }
            } else if (!useStreamModel) {
                // Use custom model config
                request.llm_config = customModelConfig;
            }

            const result = await promptTestingApi.testSummaryPrompt(request);

            // Add to history for this prompt type
            const newEntry: HistoryEntry = {
                id: nextHistoryId,
                timestamp: new Date(),
                promptType: activePromptType,
                prompts: { ...prompts[activePromptType] },
                dataSource,
                result
            };

            const currentHistory = historyByType[activePromptType];
            setHistoryByType(prev => ({
                ...prev,
                [activePromptType]: [...prev[activePromptType], newEntry]
            }));
            // Point to the new entry (which will be at the end of the updated array)
            setHistoryIndexByType(prev => ({
                ...prev,
                [activePromptType]: currentHistory.length // This will be the index of the new entry after it's added
            }));
            setNextHistoryId(prev => prev + 1);

            // Auto-expand to side panel when results arrive
            setResultsPaneMode('side');
            // Default to hiding rendered prompts so user sees LLM response first
            setShowRenderedPrompts(false);
        } catch (err: any) {
            console.error('Error testing prompt:', err);
            setError(err.message || 'Failed to test prompt');
        } finally {
            setIsTesting(false);
        }
    };

    // Copy to clipboard
    const handleCopySlug = async (slug: string) => {
        const result = await copyToClipboard(slug);
        if (result.success) {
            setCopiedSlug(slug);
            setTimeout(() => setCopiedSlug(null), 2000);
        }
    };

    // History navigation
    const currentHistoryEntry = historyIndex >= 0 && historyIndex < history.length
        ? history[historyIndex]
        : null;

    const canNavigatePrev = historyIndex > 0;
    const canNavigateNext = historyIndex < history.length - 1;

    const navigatePrev = () => {
        if (canNavigatePrev) {
            setHistoryIndexByType(prev => ({
                ...prev,
                [activePromptType]: prev[activePromptType] - 1
            }));
        }
    };

    const navigateNext = () => {
        if (canNavigateNext) {
            setHistoryIndexByType(prev => ({
                ...prev,
                [activePromptType]: prev[activePromptType] + 1
            }));
        }
    };

    const clearHistory = () => {
        setHistoryByType(prev => ({
            ...prev,
            [activePromptType]: []
        }));
        setHistoryIndexByType(prev => ({
            ...prev,
            [activePromptType]: -1
        }));
    };

    // Apply the current prompt to regenerate summaries in a report
    const handleApplyToReport = (reportId: number) => {
        const entry = currentHistoryEntry;
        if (!entry || entry.dataSource.type !== 'report') return;

        // Open the preview/comparison modal for all prompt types
        const llmConfig: RegenerateSummariesLLMConfig | undefined = !useStreamModel && customModelConfig
            ? {
                model_id: customModelConfig.model_id,
                temperature: customModelConfig.temperature,
                max_tokens: customModelConfig.max_tokens,
                reasoning_effort: customModelConfig.reasoning_effort,
            }
            : undefined;

        setApplyModalReportId(reportId);
        setApplyModalPrompt({
            system_prompt: entry.prompts.system_prompt,
            user_prompt_template: entry.prompts.user_prompt_template,
        });
        setApplyModalLLMConfig(llmConfig);
        setApplyModalPromptType(entry.promptType);
        setShowApplyModal(true);
    };

    const isViewingLatest = historyIndex === history.length - 1;

    // Restore prompts from a history entry
    const restorePromptsFromHistory = (entry: HistoryEntry) => {
        setPrompts(prev => ({
            ...prev,
            [entry.promptType]: { ...entry.prompts }
        }));
        setActivePromptType(entry.promptType);
        setHasChanges(true);
    };

    // Format timestamp for display
    const formatTimestamp = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const currentPrompt = prompts[activePromptType];
    const currentSlugs = availableSlugs[activePromptType] || [];

    // Results panel content (shared between side and full modes)
    // Using a render function instead of inline component to prevent focus loss on re-render
    const renderResultsContent = (isFullMode = false) => {
        const entry = currentHistoryEntry;
        const testResult = entry?.result;

        return (
            <div className={`relative space-y-4 ${isFullMode ? 'max-w-6xl mx-auto' : ''}`}>
                {/* Loading overlay when testing */}
                {isTesting && entry && (
                    <div className="absolute inset-0 bg-white/70 dark:bg-gray-900/70 z-10 flex items-center justify-center rounded-lg">
                        <div className="flex flex-col items-center gap-2">
                            <ArrowPathIcon className="h-8 w-8 text-blue-600 animate-spin" />
                            <span className="text-sm text-gray-600 dark:text-gray-400">Generating...</span>
                        </div>
                    </div>
                )}
                {!entry ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        <BeakerIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Run a test to see results</p>
                    </div>
                ) : (
                    <>
                        {/* Entry metadata */}
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{formatTimestamp(entry.timestamp)}</span>
                                <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                    {entry.promptType === 'executive_summary' ? 'Executive' : entry.promptType === 'category_summary' ? 'Category' : 'Article'}
                                </span>
                                {entry.dataSource.type === 'report' && (
                                    <span className="text-gray-400">
                                        Report #{entry.dataSource.reportId}
                                        {entry.dataSource.categoryId && ` → ${entry.dataSource.categoryId}`}
                                    </span>
                                )}
                            </div>
                            {!isViewingLatest && (
                                <button
                                    type="button"
                                    onClick={() => restorePromptsFromHistory(entry)}
                                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                                >
                                    Restore Prompts
                                </button>
                            )}
                        </div>

                        {/* Rendered Prompts (collapsible) */}
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setShowRenderedPrompts(!showRenderedPrompts)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Rendered Prompts
                                </span>
                                <ChevronDownIcon className={`h-4 w-4 text-gray-500 transition-transform ${showRenderedPrompts ? 'rotate-180' : ''}`} />
                            </button>
                            {showRenderedPrompts && testResult && (
                                <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                                    {/* System Prompt */}
                                    <div>
                                        <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                            System Prompt
                                        </h5>
                                        <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 overflow-y-auto resize-y ${isFullMode ? 'min-h-[200px] max-h-[50vh]' : 'min-h-[120px] max-h-[300px]'}`}>
                                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                                {testResult.rendered_system_prompt}
                                            </pre>
                                        </div>
                                    </div>

                                    {/* User Prompt */}
                                    <div>
                                        <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                            User Prompt
                                        </h5>
                                        <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 overflow-y-auto resize-y ${isFullMode ? 'min-h-[200px] max-h-[50vh]' : 'min-h-[120px] max-h-[300px]'}`}>
                                            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-mono">
                                                {testResult.rendered_user_prompt}
                                            </pre>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* LLM Response */}
                        {testResult?.llm_response && (
                            <div className="flex flex-col">
                                <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                    LLM Response
                                </h5>
                                <div className={`bg-green-50 dark:bg-green-900/20 rounded-lg p-4 border border-green-200 dark:border-green-800 overflow-y-auto resize-y ${isFullMode ? 'min-h-[300px] flex-1' : 'min-h-[200px]'}`}>
                                    <p className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                        {testResult.llm_response}
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* Apply to Report - only show if test was successful and from a report */}
                        {testResult?.llm_response && !testResult?.error && entry.dataSource.type === 'report' && (
                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                        <p className="font-medium">Apply to Report</p>
                                        <p className="text-xs mt-0.5">
                                            Regenerate all {entry.promptType.replace('_', ' ')}s in Report #{entry.dataSource.reportId} using this prompt
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleApplyToReport(entry.dataSource.type === 'report' ? entry.dataSource.reportId : 0)}
                                        className="px-4 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 flex items-center gap-2"
                                    >
                                        <SparklesIcon className="h-4 w-4" />
                                        Apply to Report
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Error */}
                        {testResult?.error && (
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-800 dark:text-red-200">
                                    Error: {testResult.error}
                                </p>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    };

    // Wrapper class for normal vs maximized mode
    const wrapperClass = isMaximized
        ? "fixed inset-0 z-50 bg-white dark:bg-gray-900 p-6"
        : "h-full";

    return (
        <>
            <div className={`${wrapperClass} flex flex-col`}>
                {/* Header */}
                <div className="flex items-center justify-between flex-shrink-0">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <SparklesIcon className="h-5 w-5 text-purple-500" />
                            Content Enrichment
                        </h3>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            Customize prompts for report summaries
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        {isPromptUsingDefault(activePromptType) && (
                            <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                <CheckIcon className="h-4 w-4" />
                                Using default
                            </span>
                        )}
                        {hasChanges && (
                            <span className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                <ExclamationTriangleIcon className="h-4 w-4" />
                                Unsaved changes
                            </span>
                        )}
                        {hasChanges && (
                            <button
                                type="button"
                                onClick={resetToSaved}
                                className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Discard Changes
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={handleResetToDefaults}
                            disabled={isPromptUsingDefault(activePromptType)}
                            className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Reset to Default
                        </button>
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!hasChanges || saving}
                            className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {saving ? (
                                <>
                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                            title={isMaximized ? 'Exit maximize' : 'Maximize'}
                        >
                            {isMaximized ? (
                                <ArrowsPointingInIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            ) : (
                                <ArrowsPointingOutIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            )}
                        </button>
                    </div>
                </div>

                {error && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm flex-shrink-0 mt-4">
                        {error}
                    </div>
                )}

                {/* Prompt Type Tabs */}
                <div className="border-b border-gray-200 dark:border-gray-700 mt-4 flex-shrink-0">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            type="button"
                            onClick={() => setActivePromptType('executive_summary')}
                            className={`py-3 px-1 border-b-2 text-sm font-medium ${
                                activePromptType === 'executive_summary'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            Executive Summary
                        </button>
                        <button
                            type="button"
                            onClick={() => setActivePromptType('category_summary')}
                            className={`py-3 px-1 border-b-2 text-sm font-medium ${
                                activePromptType === 'category_summary'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            Category Summary
                        </button>
                        <button
                            type="button"
                            onClick={() => setActivePromptType('article_summary')}
                            className={`py-3 px-1 border-b-2 text-sm font-medium ${
                                activePromptType === 'article_summary'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
                            }`}
                        >
                            Article Summary
                        </button>
                    </nav>
                </div>

                {/* Three-Panel Layout */}
                <div className="flex gap-4 flex-1 min-h-0 mt-4">
                    {/* Left: Slugs Panel (collapsible) */}
                    {slugsPaneCollapsed ? (
                        <div className="flex items-start">
                            <button
                                type="button"
                                onClick={() => setSlugsPaneCollapsed(false)}
                                className="flex items-center justify-center w-8 h-12 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-r-lg border border-gray-300 dark:border-gray-600 transition-colors"
                                title="Expand slugs pane"
                            >
                                <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    ) : (
                        <div className="w-64 flex-shrink-0 flex flex-col min-h-0">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-1 flex flex-col min-h-0">
                                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Available Slugs
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => setSlugsPaneCollapsed(true)}
                                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                        title="Collapse slugs pane"
                                    >
                                        <ChevronLeftIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                    </button>
                                </div>
                                <div className="p-3 space-y-2 flex-1 overflow-y-auto">
                                    {currentSlugs.map((slug) => (
                                        <div
                                            key={slug.slug}
                                            className="group flex flex-col gap-1 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                            onClick={() => handleCopySlug(slug.slug)}
                                        >
                                            <div className="flex items-center justify-between">
                                                <code className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 px-1.5 py-0.5 rounded font-mono">
                                                    {slug.slug}
                                                </code>
                                                {copiedSlug === slug.slug ? (
                                                    <span className="text-xs text-green-600 dark:text-green-400 font-medium">Copied!</span>
                                                ) : (
                                                    <ClipboardDocumentIcon className="h-4 w-4 text-gray-400 opacity-0 group-hover:opacity-100" />
                                                )}
                                            </div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                {slug.description}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Center: Prompt Editors */}
                    <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto">
                        {/* System Prompt - fixed height */}
                        <div className="flex flex-col flex-shrink-0 mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                System Prompt
                            </label>
                            <textarea
                                value={currentPrompt?.system_prompt || ''}
                                onChange={(e) => updatePrompt(activePromptType, 'system_prompt', e.target.value)}
                                className="w-full h-32 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                placeholder="Define the LLM's role and guidelines..."
                            />
                        </div>

                        {/* User Prompt Template - expands to fill */}
                        <div className="flex flex-col flex-1 min-h-0 mb-4">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex-shrink-0">
                                User Prompt Template
                                <span className="text-gray-400 font-normal ml-2">(Use slugs like {'{stream.purpose}'})</span>
                            </label>
                            <textarea
                                value={currentPrompt?.user_prompt_template || ''}
                                onChange={(e) => updatePrompt(activePromptType, 'user_prompt_template', e.target.value)}
                                className="flex-1 min-h-[200px] w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                placeholder="Write the prompt template with slugs..."
                            />
                        </div>

                        {/* Testing Section */}
                        <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex-shrink-0 space-y-4">
                            {/* Header */}
                            <h4 className="text-md font-medium text-gray-900 dark:text-white flex items-center gap-2">
                                <BeakerIcon className="h-5 w-5 text-blue-500" />
                                Test Prompt
                            </h4>

                            {/* Row 1: Data Source + Report Selection */}
                            <div className="flex items-center gap-6">
                                {/* Data Source Radio Buttons */}
                                <div className="flex items-center gap-4">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="testMode"
                                            value="report"
                                            checked={testMode === 'report'}
                                            onChange={() => setTestMode('report')}
                                            className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">From Report</span>
                                    </label>
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="testMode"
                                            value="paste"
                                            checked={testMode === 'paste'}
                                            onChange={() => setTestMode('paste')}
                                            className="text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">From JSON</span>
                                    </label>
                                </div>

                                {/* Report/Category/Article Dropdowns (only when From Report) */}
                                {testMode === 'report' && (
                                    <div className="flex items-center gap-3 pl-4 border-l border-gray-300 dark:border-gray-600">
                                        <select
                                            value={selectedReportId || ''}
                                            onChange={(e) => setSelectedReportId(Number(e.target.value))}
                                            className="px-3 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-48"
                                        >
                                            {reports.map(report => (
                                                <option key={report.report_id} value={report.report_id}>
                                                    {report.report_name}
                                                </option>
                                            ))}
                                        </select>
                                        {activePromptType === 'category_summary' && (
                                            <select
                                                value={selectedCategoryId}
                                                onChange={(e) => setSelectedCategoryId(e.target.value)}
                                                className="px-3 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-48"
                                            >
                                                {categories.length === 0 ? (
                                                    <option value="">No categories configured</option>
                                                ) : (
                                                    categories.map(category => (
                                                        <option key={category.id} value={category.id}>
                                                            {category.name}
                                                        </option>
                                                    ))
                                                )}
                                            </select>
                                        )}
                                        {activePromptType === 'article_summary' && selectedReportId && (
                                            <select
                                                value={selectedArticleIndex}
                                                onChange={(e) => setSelectedArticleIndex(Number(e.target.value))}
                                                className="px-3 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-32"
                                            >
                                                {(() => {
                                                    const selectedReport = reports.find(r => r.report_id === selectedReportId);
                                                    const articleCount = selectedReport?.article_count || 10;
                                                    return Array.from({ length: Math.min(articleCount, 50) }, (_, i) => (
                                                        <option key={i} value={i}>
                                                            Article {i + 1}
                                                        </option>
                                                    ));
                                                })()}
                                            </select>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Row 2: JSON Textarea (only when From JSON) */}
                            {testMode === 'paste' && (
                                <div>
                                    <textarea
                                        value={pastedData}
                                        onChange={(e) => setPastedData(e.target.value)}
                                        rows={4}
                                        placeholder='{"stream": {"name": "...", "purpose": "..."}, "articles": {"count": "10", "formatted": "..."}}'
                                        className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 font-mono placeholder-gray-400 dark:placeholder-gray-500"
                                    />
                                </div>
                            )}

                            {/* Row 3: Model Options (left) + Run Test Button (right) */}
                            <div className="flex items-center justify-between">
                                {/* Model Selection */}
                                <div className="flex items-center gap-3">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={useStreamModel}
                                            onChange={(e) => setUseStreamModel(e.target.checked)}
                                            className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-sm text-gray-700 dark:text-gray-300">
                                            Use stream model
                                            {useStreamModel && stream?.llm_config && (
                                                <span className="text-gray-400 ml-1">
                                                    ({stream.llm_config[activePromptType as keyof typeof stream.llm_config]?.model_id || 'default'})
                                                </span>
                                            )}
                                        </span>
                                    </label>
                                    {!useStreamModel && (
                                        <div className="flex items-center gap-2 pl-3 border-l border-gray-300 dark:border-gray-600">
                                            <select
                                                value={customModelConfig.model_id}
                                                onChange={(e) => setCustomModelConfig(prev => ({ ...prev, model_id: e.target.value }))}
                                                className="px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                            >
                                                {availableModels.map(m => (
                                                    <option key={m.model_id} value={m.model_id}>{m.display_name}</option>
                                                ))}
                                            </select>
                                            {availableModels.find(m => m.model_id === customModelConfig.model_id)?.supports_reasoning_effort ? (
                                                <select
                                                    value={customModelConfig.reasoning_effort || 'medium'}
                                                    onChange={(e) => setCustomModelConfig(prev => ({ ...prev, reasoning_effort: e.target.value as any, temperature: undefined }))}
                                                    className="px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                                    title="Reasoning Effort"
                                                >
                                                    <option value="minimal">Minimal</option>
                                                    <option value="low">Low</option>
                                                    <option value="medium">Medium</option>
                                                    <option value="high">High</option>
                                                </select>
                                            ) : (
                                                <input
                                                    type="number"
                                                    min="0"
                                                    max="2"
                                                    step="0.1"
                                                    value={customModelConfig.temperature ?? 0}
                                                    onChange={(e) => setCustomModelConfig(prev => ({ ...prev, temperature: parseFloat(e.target.value), reasoning_effort: undefined }))}
                                                    className="w-20 px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                                    title="Temperature"
                                                />
                                            )}
                                            <input
                                                type="number"
                                                min="1"
                                                max="16000"
                                                placeholder="Max tokens"
                                                value={customModelConfig.max_tokens || ''}
                                                onChange={(e) => setCustomModelConfig(prev => ({ ...prev, max_tokens: e.target.value ? parseInt(e.target.value, 10) : undefined }))}
                                                className="w-28 px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 placeholder:text-gray-400"
                                                title="Max Tokens"
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Run Test Button */}
                                <button
                                    type="button"
                                    onClick={handleTest}
                                    disabled={isTesting}
                                    className="px-5 py-2 text-sm bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {isTesting ? (
                                        <>
                                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                            Testing...
                                        </>
                                    ) : (
                                        <>
                                            <BeakerIcon className="h-4 w-4" />
                                            Run Test
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Right: Results Panel (three modes) */}
                    {resultsPaneMode === 'collapsed' ? (
                        <div className="flex items-start">
                            <button
                                type="button"
                                onClick={() => setResultsPaneMode('side')}
                                className="flex items-center justify-center w-8 h-12 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-l-lg border border-gray-300 dark:border-gray-600 transition-colors"
                                title="Expand results pane"
                            >
                                <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    ) : resultsPaneMode === 'side' ? (
                        <div className={`${isMaximized ? 'w-[700px]' : 'w-96'} flex-shrink-0 flex flex-col min-h-0`}>
                            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 flex-1 flex flex-col min-h-0">
                                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <DocumentTextIcon className="h-4 w-4 text-green-500" />
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Test Results
                                        </span>
                                        {/* History navigation */}
                                        {history.length > 0 && (
                                            <div className="flex items-center gap-1 ml-2 pl-2 border-l border-gray-300 dark:border-gray-600">
                                                <button
                                                    type="button"
                                                    onClick={navigatePrev}
                                                    disabled={!canNavigatePrev}
                                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title="Previous run"
                                                >
                                                    <ChevronLeftIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                                </button>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 min-w-[3rem] text-center">
                                                    {historyIndex + 1} / {history.length}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={navigateNext}
                                                    disabled={!canNavigateNext}
                                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                                    title="Next run"
                                                >
                                                    <ChevronRightIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {history.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={clearHistory}
                                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                                title="Clear results"
                                            >
                                                <TrashIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setResultsPaneMode('full')}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                            title="Expand to full screen"
                                        >
                                            <ArrowsPointingOutIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setResultsPaneMode('collapsed')}
                                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                            title="Collapse results pane"
                                        >
                                            <ChevronRightIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                        </button>
                                    </div>
                                </div>
                                <div className="p-3 flex-1 overflow-y-auto">
                                    {renderResultsContent()}
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </div>

            {/* Full Screen Modal */}
            {resultsPaneMode === 'full' && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <DocumentTextIcon className="h-5 w-5 text-green-500" />
                                    Test Results
                                    <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                                        ({activePromptType === 'executive_summary' ? 'Executive Summary' :
                                          activePromptType === 'category_summary' ? 'Category Summary' : 'Article Summary'})
                                    </span>
                                </h3>
                                {/* History navigation */}
                                {history.length > 0 && (
                                    <div className="flex items-center gap-1 ml-2 pl-3 border-l border-gray-300 dark:border-gray-600">
                                        <button
                                            type="button"
                                            onClick={navigatePrev}
                                            disabled={!canNavigatePrev}
                                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Previous run"
                                        >
                                            <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                        </button>
                                        <span className="text-sm text-gray-500 dark:text-gray-400 min-w-[4rem] text-center">
                                            {historyIndex + 1} / {history.length}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={navigateNext}
                                            disabled={!canNavigateNext}
                                            className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                            title="Next run"
                                        >
                                            <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                        </button>
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-2">
                                {history.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearHistory}
                                        className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        title="Clear results"
                                    >
                                        <TrashIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={() => setResultsPaneMode('side')}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title="Minimize to side panel"
                                >
                                    <ArrowsPointingInIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setResultsPaneMode('collapsed')}
                                    className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                    title="Close"
                                >
                                    <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>
                        </div>
                        {/* Modal Content */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {renderResultsContent(true)}
                        </div>
                    </div>
                </div>
            )}

            {/* Reset to Defaults Confirmation Dialog */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Reset {activePromptType === 'executive_summary' ? 'Executive Summary' :
                                   activePromptType === 'category_summary' ? 'Category Summary' :
                                   'Article Summary'} to Default?
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            This will replace the current prompt with the default. Other prompts will not be affected.
                        </p>
                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setShowResetConfirm(false)}
                                className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={confirmResetToDefaults}
                                className="px-4 py-2 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                            >
                                Reset to Default
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Apply to Report Modal (for all prompt types) */}
            {applyModalReportId && applyModalPrompt && (
                <ApplyToReportModal
                    isOpen={showApplyModal}
                    onClose={() => setShowApplyModal(false)}
                    reportId={applyModalReportId}
                    prompt={applyModalPrompt}
                    llmConfig={applyModalLLMConfig}
                    promptType={applyModalPromptType}
                />
            )}
        </>
    );
}
