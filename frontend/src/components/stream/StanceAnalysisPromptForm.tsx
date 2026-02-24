/**
 * Stance Analysis Prompt Form
 *
 * Allows users to customize the prompt used for article stance analysis.
 * Similar to CategorizationPromptForm with full testing capabilities.
 *
 * Features:
 * - Collapsible slug reference panel (left)
 * - Prompt editors (center)
 * - Three-mode results pane: collapsed, side panel, full modal
 * - Test with sample data or existing reports
 * - Maximize mode for focused editing
 */

import { useState, useEffect } from 'react';
import {
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    ArrowPathIcon,
    ClipboardDocumentIcon,
    BeakerIcon,
    DocumentTextIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    XMarkIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    TrashIcon,
    DocumentMagnifyingGlassIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline';
import {
    promptTestingApi,
    PromptTemplate,
    SlugInfo,
    TestStanceAnalysisPromptResponse,
} from '../../lib/api/promptTestingApi';
import { RegenerateSummariesLLMConfig } from '../../lib/api/curationApi';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { reportApi } from '../../lib/api/reportApi';
import { llmApi } from '../../lib/api/llmApi';
import { Report, ResearchStream, ModelInfo, ModelConfig, DEFAULT_MODEL_CONFIG } from '../../types';
import { StanceAnalysisResult } from '../../types/document_analysis';
import { copyToClipboard } from '../../lib/utils/clipboard';
import { showErrorToast, showSuccessToast } from '../../lib/errorToast';
import StanceAnalysisDisplay from '../ui/StanceAnalysisDisplay';
import ApplyToReportModal from './ApplyToReportModal';

interface StanceAnalysisPromptFormProps {
    streamId: number;
    stream?: ResearchStream;
}

type ResultsPaneMode = 'collapsed' | 'side' | 'full';

interface HistoryEntry {
    id: number;
    timestamp: Date;
    prompts: PromptTemplate;
    dataSource: { type: 'report'; reportId: number; articleIndex: number } | { type: 'paste' };
    result: TestStanceAnalysisPromptResponse;
}

export default function StanceAnalysisPromptForm({ streamId, stream }: StanceAnalysisPromptFormProps) {
    // State for prompts
    const [prompt, setPrompt] = useState<PromptTemplate | null>(null);
    const [savedPrompt, setSavedPrompt] = useState<PromptTemplate | null>(null);
    const [defaults, setDefaults] = useState<PromptTemplate | null>(null);
    const [availableSlugs, setAvailableSlugs] = useState<SlugInfo[]>([]);
    const [isUsingDefaults, setIsUsingDefaults] = useState(true);
    const [savedIsUsingDefaults, setSavedIsUsingDefaults] = useState(true);
    const [hasChanges, setHasChanges] = useState(false);

    // State for testing
    const [testMode, setTestMode] = useState<'report' | 'paste'>('report');
    const [reports, setReports] = useState<Report[]>([]);
    const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
    const [selectedArticleIndex, setSelectedArticleIndex] = useState<number>(0);
    const [pastedData, setPastedData] = useState('');
    const [isTesting, setIsTesting] = useState(false);
    const [useStreamModel, setUseStreamModel] = useState(true);
    const [customModelConfig, setCustomModelConfig] = useState<ModelConfig>({ ...DEFAULT_MODEL_CONFIG });
    const [availableModels, setAvailableModels] = useState<ModelInfo[]>([]);

    // History state for time travel
    const [history, setHistory] = useState<HistoryEntry[]>([]);
    const [historyIndex, setHistoryIndex] = useState<number>(-1);
    const [nextHistoryId, setNextHistoryId] = useState(1);

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
    const [showApplyToReportModal, setShowApplyToReportModal] = useState(false);
    const [applyModalReportId, setApplyModalReportId] = useState<number | null>(null);
    const [applyModalPrompt, setApplyModalPrompt] = useState<PromptTemplate | null>(null);
    const [applyModalLLMConfig, setApplyModalLLMConfig] = useState<RegenerateSummariesLLMConfig | undefined>(undefined);

    // Load data on mount
    useEffect(() => {
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

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            // Load config and reports in parallel
            const [configRes, streamReports] = await Promise.all([
                researchStreamApi.getArticleAnalysisConfig(streamId),
                reportApi.getReportsForStream(streamId),
            ]);

            setDefaults(configRes.defaults.stance_analysis_prompt);
            setAvailableSlugs(configRes.available_slugs);

            // Track saved state
            const config = configRes.article_analysis_config;
            const usingDefaults = !config?.stance_analysis_prompt;
            const currentPrompt = config?.stance_analysis_prompt || configRes.defaults.stance_analysis_prompt;

            setPrompt(currentPrompt);
            setSavedPrompt(currentPrompt);
            setIsUsingDefaults(usingDefaults);
            setSavedIsUsingDefaults(usingDefaults);

            setReports(streamReports);
            if (streamReports.length > 0) {
                setSelectedReportId(streamReports[0].report_id);
            }
        } catch (err) {
            console.error('Failed to load stance analysis config:', err);
            setError('Failed to load stance analysis configuration');
        } finally {
            setLoading(false);
        }
    };

    const updatePrompt = (field: keyof PromptTemplate, value: string) => {
        if (!prompt) return;
        setPrompt({ ...prompt, [field]: value });
        setHasChanges(true);
        setIsUsingDefaults(false);
    };

    // Check if current prompt matches defaults
    const isUsingDefaultPrompt = () => {
        if (!prompt || !defaults) return true;
        return prompt.system_prompt === defaults.system_prompt &&
               prompt.user_prompt_template === defaults.user_prompt_template;
    };

    const handleSave = async () => {
        if (!prompt) return;
        setSaving(true);
        try {
            // Save null if using defaults, otherwise save the custom prompt
            const usingDefault = isUsingDefaultPrompt();

            // Build config - only contains stance_analysis_prompt
            // (chat_instructions are stored in chat_config table, editable via admin)
            const config = usingDefault ? null : {
                stance_analysis_prompt: prompt,
            };

            await researchStreamApi.updateArticleAnalysisConfig(streamId, config);

            // Update saved state
            setSavedPrompt(prompt);
            setSavedIsUsingDefaults(usingDefault);
            setHasChanges(false);
            setIsUsingDefaults(usingDefault);
            showSuccessToast(usingDefault ? 'Reset to default prompt' : 'Stance analysis prompt saved');
        } catch (err) {
            showErrorToast(err, 'Failed to save stance analysis prompt');
        } finally {
            setSaving(false);
        }
    };

    // Reset to defaults (with confirmation)
    const handleResetToDefaults = () => {
        setShowResetConfirm(true);
    };

    const confirmResetToDefaults = () => {
        if (!defaults) return;
        setShowResetConfirm(false);
        setPrompt(defaults);
        setHasChanges(true);
        setIsUsingDefaults(true);
    };

    // Reset to last saved version
    const resetToSaved = () => {
        if (savedPrompt) {
            setPrompt(savedPrompt);
            setIsUsingDefaults(savedIsUsingDefaults);
            setHasChanges(false);
        }
    };

    const handleCopySlug = async (slug: string) => {
        await copyToClipboard(slug);
        setCopiedSlug(slug);
        setTimeout(() => setCopiedSlug(null), 2000);
    };

    const handleTest = async () => {
        if (!prompt) return;

        setIsTesting(true);
        setError(null);

        try {
            const request: {
                prompt: PromptTemplate;
                report_id?: number;
                article_index?: number;
                sample_data?: Record<string, unknown>;
                llm_config?: ModelConfig;
            } = {
                prompt: prompt,
            };

            let dataSource: HistoryEntry['dataSource'];

            if (testMode === 'report' && selectedReportId) {
                request.report_id = selectedReportId;
                request.article_index = selectedArticleIndex;
                dataSource = { type: 'report', reportId: selectedReportId, articleIndex: selectedArticleIndex };
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
            if (useStreamModel && stream?.llm_config?.stance_analysis) {
                request.llm_config = stream.llm_config.stance_analysis;
            } else if (!useStreamModel) {
                request.llm_config = customModelConfig;
            }

            const result = await promptTestingApi.testStanceAnalysisPrompt(request);

            // Add to history
            const newEntry: HistoryEntry = {
                id: nextHistoryId,
                timestamp: new Date(),
                prompts: { ...prompt },
                dataSource,
                result,
            };

            setHistory(prev => [...prev, newEntry]);
            setHistoryIndex(history.length);
            setNextHistoryId(prev => prev + 1);

            // Auto-expand to side panel when results arrive
            setResultsPaneMode('side');
            setShowRenderedPrompts(false);
        } catch (err: unknown) {
            console.error('Error testing stance analysis prompt:', err);
            const message = err instanceof Error ? err.message : 'Failed to test prompt';
            setError(message);
        } finally {
            setIsTesting(false);
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
            setHistoryIndex(prev => prev - 1);
        }
    };

    const navigateNext = () => {
        if (canNavigateNext) {
            setHistoryIndex(prev => prev + 1);
        }
    };

    const clearHistory = () => {
        setHistory([]);
        setHistoryIndex(-1);
    };

    const isViewingLatest = historyIndex === history.length - 1;

    // Apply the current prompt to regenerate stance analysis in a report
    const handleApplyToReport = (entry: HistoryEntry) => {
        if (entry.dataSource.type !== 'report') return;

        // Capture the LLM config
        const llmConfig: RegenerateSummariesLLMConfig | undefined = useStreamModel && stream?.llm_config?.stance_analysis
            ? {
                model_id: stream.llm_config.stance_analysis.model_id,
                temperature: stream.llm_config.stance_analysis.temperature,
                max_tokens: stream.llm_config.stance_analysis.max_tokens,
                reasoning_effort: stream.llm_config.stance_analysis.reasoning_effort,
            }
            : !useStreamModel
            ? {
                model_id: customModelConfig.model_id,
                temperature: customModelConfig.temperature,
                max_tokens: customModelConfig.max_tokens,
                reasoning_effort: customModelConfig.reasoning_effort,
            }
            : undefined;

        // Capture the tested prompt from the history entry
        setApplyModalReportId(entry.dataSource.reportId);
        setApplyModalPrompt({
            system_prompt: entry.prompts.system_prompt,
            user_prompt_template: entry.prompts.user_prompt_template,
        });
        setApplyModalLLMConfig(llmConfig);
        setShowApplyToReportModal(true);
    };

    const restorePromptsFromHistory = (entry: HistoryEntry) => {
        setPrompt({ ...entry.prompts });
        setHasChanges(true);
        setIsUsingDefaults(false);
    };

    const formatTimestamp = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    if (loading) {
        return (
            <div className="h-full flex items-center justify-center">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error && !prompt) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center">
                    <p className="text-red-500 mb-4">{error}</p>
                    <button
                        onClick={loadData}
                        className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // Results panel content (shared between side and full modes)
    const renderResultsContent = (isFullMode = false) => {
        const entry = currentHistoryEntry;
        const testResult = entry?.result;

        return (
            <div className={`flex-1 min-h-0 flex flex-col gap-4 ${isFullMode ? 'max-w-6xl mx-auto' : ''}`}>
                {!entry ? (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                        <BeakerIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p className="text-sm">Run a test to see results</p>
                    </div>
                ) : (
                    <div className="flex-1 min-h-0 flex flex-col gap-4">
                        {/* Entry metadata */}
                        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 pb-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="font-medium">{formatTimestamp(entry.timestamp)}</span>
                                {entry.dataSource.type === 'report' && (
                                    <span className="text-gray-400">
                                        Report #{entry.dataSource.reportId} (Article {entry.dataSource.articleIndex + 1})
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
                        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex-shrink-0">
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

                        {/* Stance Analysis Result */}
                        {testResult?.llm_response && (() => {
                            // Try to parse the LLM response as a StanceAnalysisResult
                            let stanceResult: StanceAnalysisResult | null = null;
                            try {
                                stanceResult = JSON.parse(testResult.llm_response);
                            } catch {
                                // If parsing fails, show raw response
                            }

                            if (stanceResult && stanceResult.stance) {
                                return (
                                    <div className="flex-1 min-h-0 flex flex-col">
                                        <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wide flex-shrink-0">
                                            Stance Analysis Result
                                        </h5>
                                        <div className="flex-1 min-h-0 bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 overflow-y-auto">
                                            <StanceAnalysisDisplay result={stanceResult} compact={!isFullMode} />
                                        </div>
                                    </div>
                                );
                            }

                            // Fallback to raw JSON if parsing failed
                            return (
                                <div className="flex flex-col">
                                    <h5 className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                        LLM Response
                                    </h5>
                                    <div className={`bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-4 border border-indigo-200 dark:border-indigo-800 overflow-y-auto resize-y ${isFullMode ? 'min-h-[150px] flex-1' : 'min-h-[100px]'}`}>
                                        <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                            {testResult.llm_response}
                                        </pre>
                                    </div>
                                    {testResult.parsed_stance && (
                                        <div className="mt-2 flex items-center gap-2">
                                            <span className="text-xs text-gray-500">Parsed Stance:</span>
                                            <span className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded text-xs font-medium">
                                                {testResult.parsed_stance}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Error */}
                        {testResult?.error && (
                            <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                                <p className="text-sm text-red-800 dark:text-red-200">
                                    Error: {testResult.error}
                                </p>
                            </div>
                        )}

                        {/* Apply to Report - only show if test was successful and from a report */}
                        {testResult?.llm_response && !testResult?.error && entry.dataSource.type === 'report' && (
                            <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
                                <div className="flex items-center justify-between">
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                        <p className="font-medium">Apply to Report</p>
                                        <p className="text-xs mt-0.5">
                                            Regenerate stance analysis for all articles in Report #{entry.dataSource.reportId} using this prompt
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => handleApplyToReport(entry)}
                                        className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 flex items-center gap-2"
                                    >
                                        <SparklesIcon className="h-4 w-4" />
                                        Apply to Report
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // Main content JSX
    const mainContent = (
        <div className="h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0 mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <DocumentMagnifyingGlassIcon className="h-5 w-5 text-indigo-500" />
                        Stance Analysis Prompt
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Configure the prompt used to analyze article stance
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isUsingDefaults && (
                        <span className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                            <CheckIcon className="h-4 w-4" />
                            Using defaults
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
                            className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                        >
                            Discard Changes
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={handleResetToDefaults}
                        disabled={saving || isUsingDefaultPrompt()}
                        className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Reset to Default
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                        className="px-4 py-2 text-sm bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-md transition-colors"
                    >
                        {saving ? 'Saving...' : 'Save Prompt'}
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

            {/* Status badge */}
            {isUsingDefaults && (
                <div className="mb-4 px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md flex-shrink-0">
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                        Using default prompt. Make changes to create a custom prompt.
                    </p>
                </div>
            )}

            {error && (
                <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-800 dark:text-red-200 text-sm flex-shrink-0">
                    {error}
                </div>
            )}

            {/* Main content - three panel layout */}
            <div className="flex-1 min-h-0 flex gap-4">
                {/* Slugs Panel */}
                {slugsPaneCollapsed ? (
                    <div className="flex items-start flex-shrink-0">
                        <button
                            type="button"
                            onClick={() => setSlugsPaneCollapsed(false)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                            title="Show available slugs"
                        >
                            <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                ) : (
                    <div className="w-64 flex-shrink-0 flex flex-col min-h-0">
                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 flex-1 flex flex-col min-h-0">
                            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Available Slugs
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setSlugsPaneCollapsed(true)}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                >
                                    <ChevronLeftIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>
                            <div className="p-3 space-y-2 flex-1 overflow-y-auto">
                                {availableSlugs.map((slug) => (
                                    <div
                                        key={slug.slug}
                                        className="group flex flex-col gap-1 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                        onClick={() => handleCopySlug(slug.slug)}
                                    >
                                        <div className="flex items-center justify-between">
                                            <code className="text-xs font-mono text-indigo-600 dark:text-indigo-400">
                                                {slug.slug}
                                            </code>
                                            <ClipboardDocumentIcon
                                                className={`h-3.5 w-3.5 transition-opacity ${
                                                    copiedSlug === slug.slug
                                                        ? 'text-green-500 opacity-100'
                                                        : 'text-gray-400 opacity-0 group-hover:opacity-100'
                                                }`}
                                            />
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

                {/* Prompt Editors */}
                <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto">
                    {/* System Prompt */}
                    <div className="flex flex-col flex-shrink-0 mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            System Prompt
                        </label>
                        <textarea
                            value={prompt?.system_prompt || ''}
                            onChange={(e) => updatePrompt('system_prompt', e.target.value)}
                            className="w-full h-[400px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Define the LLM's role for stance analysis..."
                        />
                    </div>

                    {/* User Prompt Template */}
                    <div className="flex flex-col flex-1 min-h-0 mb-4">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex-shrink-0">
                            User Prompt Template
                            <span className="text-gray-400 font-normal ml-2">(Use slugs like {'{title}'}, {'{abstract}'})</span>
                        </label>
                        <textarea
                            value={prompt?.user_prompt_template || ''}
                            onChange={(e) => updatePrompt('user_prompt_template', e.target.value)}
                            className="flex-1 min-h-[200px] w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                            placeholder="Write the stance analysis prompt template with slugs..."
                        />
                    </div>

                    {/* Testing Section */}
                    <div className="border-t border-gray-200 dark:border-gray-700 pt-4 flex-shrink-0 space-y-4">
                        {/* Header */}
                        <h4 className="text-md font-medium text-gray-900 dark:text-white flex items-center gap-2">
                            <BeakerIcon className="h-5 w-5 text-blue-500" />
                            Test Prompt
                        </h4>

                        {/* Row 1: Data Source Radio + Report Selection */}
                        <div className="flex items-center gap-6">
                            {/* Radio buttons for data source */}
                            <div className="flex items-center gap-4">
                                <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                        type="radio"
                                        name="testMode"
                                        value="report"
                                        checked={testMode === 'report'}
                                        onChange={() => setTestMode('report')}
                                        className="text-indigo-600 focus:ring-indigo-500"
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
                                        className="text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">From JSON</span>
                                </label>
                            </div>

                            {/* Report/Article selection (only when From Report) */}
                            {testMode === 'report' && (
                                <div className="flex items-center gap-3">
                                    <select
                                        value={selectedReportId || ''}
                                        onChange={(e) => setSelectedReportId(Number(e.target.value))}
                                        className="px-3 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 min-w-48"
                                    >
                                        {reports.length === 0 ? (
                                            <option value="">No reports available</option>
                                        ) : (
                                            reports.map(report => (
                                                <option key={report.report_id} value={report.report_id}>
                                                    {report.report_name}
                                                </option>
                                            ))
                                        )}
                                    </select>
                                    <div className="flex items-center gap-2">
                                        <label className="text-sm text-gray-500 dark:text-gray-400">Article #</label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={selectedArticleIndex}
                                            onChange={(e) => setSelectedArticleIndex(Number(e.target.value))}
                                            className="px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 w-20"
                                        />
                                    </div>
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
                                    placeholder='{"title": "...", "abstract": "...", "journal": "...", "article_publication_date": "Jan 2024"}'
                                    className="w-full px-3 py-2 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 font-mono placeholder-gray-400 dark:placeholder-gray-500"
                                />
                            </div>
                        )}

                        {/* Row 3: Model Options (left) + Run Test Button (right) */}
                        <div className="flex items-center justify-between">
                            {/* Model Selection */}
                            <div className="flex items-center gap-3">
                                <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                                    <input
                                        type="checkbox"
                                        checked={useStreamModel}
                                        onChange={(e) => setUseStreamModel(e.target.checked)}
                                        className="rounded border-gray-300 dark:border-gray-600 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    Use stream model
                                    {useStreamModel && stream?.llm_config?.stance_analysis && (
                                        <span className="text-gray-400">
                                            ({stream.llm_config.stance_analysis.model_id})
                                        </span>
                                    )}
                                </label>
                                {!useStreamModel && (
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={customModelConfig.model_id}
                                            onChange={(e) => setCustomModelConfig(prev => ({ ...prev, model_id: e.target.value }))}
                                            className="px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
                                        >
                                            {availableModels.map(m => (
                                                <option key={m.model_id} value={m.model_id}>{m.display_name}</option>
                                            ))}
                                        </select>
                                        {/* Temperature or Reasoning Effort based on model */}
                                        {availableModels.find(m => m.model_id === customModelConfig.model_id)?.supports_reasoning_effort ? (
                                            <select
                                                value={customModelConfig.reasoning_effort || 'medium'}
                                                onChange={(e) => setCustomModelConfig(prev => ({ ...prev, reasoning_effort: e.target.value as 'minimal' | 'low' | 'medium' | 'high', temperature: undefined }))}
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
                                                className="w-16 px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800"
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
                                            className="w-24 px-2 py-1.5 text-sm text-gray-900 dark:text-white border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 placeholder:text-gray-400"
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
                                className="px-4 py-2 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
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

                {/* Results Panel */}
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
                                    <DocumentTextIcon className="h-4 w-4 text-indigo-500" />
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
                            <div className={`p-3 flex-1 min-h-0 flex flex-col transition-opacity ${isTesting ? 'opacity-40 pointer-events-none' : ''}`}>
                                {renderResultsContent()}
                            </div>
                        </div>
                    </div>
                ) : null}
            </div>
        </div>
    );

    // Full screen results modal
    const fullScreenResultsModal = resultsPaneMode === 'full' && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-7xl h-[90vh] flex flex-col">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            <DocumentTextIcon className="h-5 w-5 text-indigo-500" />
                            Test Results
                        </h3>
                        {history.length > 0 && (
                            <div className="flex items-center gap-1 ml-2 pl-3 border-l border-gray-300 dark:border-gray-600">
                                <button
                                    type="button"
                                    onClick={navigatePrev}
                                    disabled={!canNavigatePrev}
                                    className="p-1.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
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
                        >
                            <ArrowsPointingInIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                        <button
                            type="button"
                            onClick={() => setResultsPaneMode('collapsed')}
                            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
                        >
                            <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>
                <div className={`p-6 flex-1 min-h-0 flex flex-col transition-opacity ${isTesting ? 'opacity-40 pointer-events-none' : ''}`}>
                    {renderResultsContent(true)}
                </div>
            </div>
        </div>
    );

    // Maximized mode - full screen overlay
    if (isMaximized) {
        return (
            <div className="fixed inset-0 z-50 bg-white dark:bg-gray-900">
                <div className="h-full p-6">
                    {mainContent}
                </div>
                {fullScreenResultsModal}
            </div>
        );
    }

    // Normal mode
    return (
        <>
            {mainContent}
            {fullScreenResultsModal}

            {/* Reset to Default Confirmation Dialog */}
            {showResetConfirm && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Reset to Default?
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
                            This will replace your custom stance analysis prompt with the default. You will need to save to apply this change.
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

            {/* Apply to Report Modal */}
            {applyModalReportId !== null && applyModalPrompt && (
                <ApplyToReportModal
                    isOpen={showApplyToReportModal}
                    onClose={() => setShowApplyToReportModal(false)}
                    reportId={applyModalReportId}
                    promptType="stance_analysis"
                    prompt={applyModalPrompt}
                    llmConfig={applyModalLLMConfig}
                />
            )}
        </>
    );
}
