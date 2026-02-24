import { useState, useEffect } from 'react';
import { XMarkIcon, CalendarIcon, DocumentTextIcon, FunnelIcon, ClockIcon, ArrowPathIcon, SparklesIcon, CpuChipIcon, ChatBubbleLeftIcon, ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { getCurationHistory, CurationEvent } from '../../lib/api/curationApi';

interface BroadQueryConfig {
    query_expression: string;
    semantic_filter?: {
        enabled: boolean;
        criteria: string;
        threshold?: number;
    };
}

interface ConceptConfig {
    concept_id: string;
    name: string;
    source_queries?: Record<string, { query_expression: string; enabled: boolean }>;
    semantic_filter?: {
        enabled: boolean;
        criteria: string;
        threshold?: number;
    };
}

/** Article with curation notes for display */
export interface ArticleCurationNote {
    article_id: number;
    pmid: string | null;
    title: string;
    curation_notes: string | null;
    curator_added?: boolean;
}

export interface RetrievalConfigModalProps {
    /** Optional subtitle shown below the title */
    subtitle?: string;
    /** The retrieval configuration object */
    config: Record<string, unknown>;
    /** Start date of the retrieval period */
    startDate?: string | null;
    /** End date of the retrieval period */
    endDate?: string | null;
    /** Report ID for fetching curation history */
    reportId?: number;
    /** Enrichment configuration (custom prompts) */
    enrichmentConfig?: Record<string, unknown> | null;
    /** LLM configuration (model selection per stage) */
    llmConfig?: Record<string, unknown> | null;
    /** Articles with curation notes */
    articleCurationNotes?: ArticleCurationNote[];
    /** Whether the config data is still loading */
    loading?: boolean;
    /** Called when the modal should close */
    onClose: () => void;
}

/**
 * Modal for displaying retrieval/execution configuration and curation history.
 * Two tabs: Run Configuration and Curation History.
 * Used on both Reports page and Report Curation page.
 */
export default function RetrievalConfigModal({
    subtitle,
    config,
    startDate,
    endDate,
    reportId,
    enrichmentConfig,
    llmConfig,
    articleCurationNotes,
    loading = false,
    onClose,
}: RetrievalConfigModalProps) {
    const [activeTab, setActiveTab] = useState<'config' | 'enrichment' | 'models' | 'history'>('config');
    const [showRaw, setShowRaw] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyError, setHistoryError] = useState<string | null>(null);
    const [curationEvents, setCurationEvents] = useState<CurationEvent[]>([]);

    // Load curation history when tab is selected
    useEffect(() => {
        if (activeTab === 'history' && reportId && curationEvents.length === 0) {
            loadCurationHistory();
        }
    }, [activeTab, reportId]);

    const loadCurationHistory = async () => {
        if (!reportId) return;
        setHistoryLoading(true);
        setHistoryError(null);
        try {
            const response = await getCurationHistory(reportId);
            setCurationEvents(response.events);
        } catch (err) {
            console.error('Failed to load curation history:', err);
            setHistoryError('Failed to load curation history');
        } finally {
            setHistoryLoading(false);
        }
    };

    // Extract from broad_search (one retrieval method)
    const broadSearch = config.broad_search as { queries: BroadQueryConfig[] } | undefined;
    const broadQueries = broadSearch?.queries || [];

    // Extract from concepts (alternative retrieval method)
    const concepts = config.concepts as ConceptConfig[] | undefined;

    // Get query expressions from broad_search
    let pubmedQuery = broadQueries.map(q => q.query_expression).filter(Boolean).join('\n\nOR\n\n');

    // If no broad_search, try to get queries from concepts
    if (!pubmedQuery && concepts && concepts.length > 0) {
        const conceptQueries = concepts
            .filter(c => c.source_queries?.pubmed?.enabled && c.source_queries?.pubmed?.query_expression)
            .map(c => `# ${c.name}\n${c.source_queries!.pubmed.query_expression}`)
            .filter(Boolean);
        pubmedQuery = conceptQueries.join('\n\n---\n\n');
    }

    // Get semantic filters from broad_search
    let semanticFilter = broadQueries
        .filter(q => q.semantic_filter?.enabled && q.semantic_filter?.criteria)
        .map(q => q.semantic_filter!.criteria)
        .join('\n\n---\n\n');

    // If no broad_search filters, try to get filters from concepts
    if (!semanticFilter && concepts && concepts.length > 0) {
        const conceptFilters = concepts
            .filter(c => c.semantic_filter?.enabled && c.semantic_filter?.criteria)
            .map(c => `# ${c.name}\n${c.semantic_filter!.criteria}`)
            .filter(Boolean);
        semanticFilter = conceptFilters.join('\n\n---\n\n');
    }

    const hasDateRange = startDate || endDate;

    // Format event type for display
    const formatEventType = (eventType: string): string => {
        const typeMap: Record<string, string> = {
            'edit_report': 'Edited Report',
            'exclude_article': 'Excluded Article',
            'include_article': 'Included Article',
            'edit_article': 'Edited Article',
        };
        return typeMap[eventType] || eventType;
    };

    // Format field name for display
    const formatFieldName = (fieldName: string | null): string => {
        if (!fieldName) return '';
        const fieldMap: Record<string, string> = {
            'report_name': 'Title',
            'executive_summary': 'Executive Summary',
            'category_summaries': 'Category Summaries',
            'ranking': 'Ranking',
            'presentation_categories': 'Category',
            'ai_summary': 'AI Summary',
            'curation_notes': 'Curation Notes',
        };
        return fieldMap[fieldName] || fieldName;
    };

    // Format date for display
    const formatDate = (dateStr: string): string => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleString();
    };

    // Truncate long values
    const truncateValue = (value: string | null, maxLength: number = 100): string => {
        if (!value) return '(empty)';
        if (value.length <= maxLength) return value;
        return value.substring(0, maxLength) + '...';
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            {/* Fixed size modal - almost maximized for long content */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1200px] h-[calc(100vh-4rem)] flex flex-col">
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Report Details
                        </h2>
                        {subtitle && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                                {subtitle}
                            </p>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                    >
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex-shrink-0 flex gap-4 px-6 pt-4 border-b border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab('config')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            activeTab === 'config'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Run Configuration
                    </button>
                    <button
                        onClick={() => setActiveTab('enrichment')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            activeTab === 'enrichment'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Enhancement Config
                    </button>
                    <button
                        onClick={() => setActiveTab('models')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            activeTab === 'models'
                                ? 'border-orange-600 text-orange-600 dark:text-orange-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Model Config
                    </button>
                    {reportId && (
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                                activeTab === 'history'
                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                            }`}
                        >
                            Curation History
                            {curationEvents.length > 0 && (
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300">
                                    {curationEvents.length}
                                </span>
                            )}
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Loading State */}
                    {loading && (
                        <div className="flex items-center justify-center h-64">
                            <div className="text-center">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
                                <p className="text-gray-500 dark:text-gray-400">Loading configuration...</p>
                            </div>
                        </div>
                    )}

                    {/* Run Configuration Tab */}
                    {!loading && activeTab === 'config' && (
                        <div className="space-y-6">
                            {/* Date Range Section */}
                            {hasDateRange && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                        <CalendarIcon className="h-4 w-4 text-green-600" />
                                        Date Range
                                    </h3>
                                    <div className="flex gap-6 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                        <div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">Start Date</span>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                                                {startDate || 'Not specified'}
                                            </p>
                                        </div>
                                        <div>
                                            <span className="text-xs text-gray-500 dark:text-gray-400">End Date</span>
                                            <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                                                {endDate || 'Not specified'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* PubMed Query Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                    <DocumentTextIcon className="h-4 w-4 text-purple-600" />
                                    PubMed Query
                                </h3>
                                {pubmedQuery ? (
                                    <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                        {pubmedQuery}
                                    </pre>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">No PubMed query configured</p>
                                )}
                            </div>

                            {/* Semantic Filter Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                    <FunnelIcon className="h-4 w-4 text-blue-600" />
                                    Semantic Filter
                                </h3>
                                {semanticFilter ? (
                                    <div className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                        {semanticFilter}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 italic">No semantic filter configured</p>
                                )}
                            </div>

                            {/* Raw Config Toggle */}
                            <div>
                                <button
                                    type="button"
                                    onClick={() => setShowRaw(!showRaw)}
                                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                >
                                    {showRaw ? '− Hide' : '+ Show'} raw configuration
                                </button>
                                {showRaw && (
                                    <pre className="mt-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 overflow-auto max-h-60">
                                        {JSON.stringify(config, null, 2)}
                                    </pre>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Enhancement Config Tab */}
                    {!loading && activeTab === 'enrichment' && (
                        <div className="space-y-6">
                            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-2 flex items-center gap-2">
                                    <SparklesIcon className="h-4 w-4" />
                                    Content Enhancement Configuration
                                </h3>
                                <p className="text-sm text-purple-800 dark:text-purple-300">
                                    Custom prompts used to generate AI summaries for this report.
                                </p>
                            </div>

                            {enrichmentConfig ? (
                                <div className="space-y-4">
                                    {/* Prompts */}
                                    {(enrichmentConfig as any).prompts && Object.entries((enrichmentConfig as any).prompts).map(([promptType, promptConfig]: [string, any]) => (
                                        <div key={promptType} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3 capitalize">
                                                {promptType.replace(/_/g, ' ')}
                                            </h4>

                                            {promptConfig.system_prompt && (
                                                <div className="mb-3">
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">System Prompt</p>
                                                    <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-3 whitespace-pre-wrap max-h-40 overflow-y-auto">
                                                        {promptConfig.system_prompt}
                                                    </div>
                                                </div>
                                            )}

                                            {promptConfig.user_prompt_template && (
                                                <div>
                                                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">User Prompt Template</p>
                                                    <div className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 rounded p-3 whitespace-pre-wrap max-h-40 overflow-y-auto font-mono text-xs">
                                                        {promptConfig.user_prompt_template}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <SparklesIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Using default prompts</p>
                                    <p className="text-sm mt-1">No custom enhancement configuration was set for this execution</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Model Config Tab */}
                    {!loading && activeTab === 'models' && (
                        <div className="space-y-6">
                            <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                                <h3 className="text-sm font-semibold text-orange-900 dark:text-orange-200 mb-2 flex items-center gap-2">
                                    <CpuChipIcon className="h-4 w-4" />
                                    Model Configuration
                                </h3>
                                <p className="text-sm text-orange-800 dark:text-orange-300">
                                    AI models used for each pipeline stage in this report.
                                </p>
                            </div>

                            {llmConfig ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {Object.entries(llmConfig).map(([stage, stageConfig]: [string, any]) => (
                                        <div key={stage} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                            <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2 capitalize">
                                                {stage.replace(/_/g, ' ')}
                                            </h4>
                                            <div className="space-y-1 text-sm">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500 dark:text-gray-400">Model:</span>
                                                    <span className="font-medium text-gray-900 dark:text-white">{stageConfig.model_id || 'Default'}</span>
                                                </div>
                                                {stageConfig.temperature !== undefined && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500 dark:text-gray-400">Temperature:</span>
                                                        <span className="font-medium text-gray-900 dark:text-white">{stageConfig.temperature}</span>
                                                    </div>
                                                )}
                                                {stageConfig.reasoning_effort && (
                                                    <div className="flex justify-between">
                                                        <span className="text-gray-500 dark:text-gray-400">Reasoning Effort:</span>
                                                        <span className="font-medium text-gray-900 dark:text-white capitalize">{stageConfig.reasoning_effort}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <CpuChipIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>Using default models</p>
                                    <p className="text-sm mt-1">No custom model configuration was set for this execution</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Curation History Tab */}
                    {!loading && activeTab === 'history' && (
                        <div className="space-y-6">
                            {/* Article Curation Notes Section */}
                            {articleCurationNotes && articleCurationNotes.filter(a => a.curation_notes).length > 0 && (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                        <ChatBubbleLeftIcon className="h-4 w-4 text-blue-600" />
                                        Curator Notes on Articles ({articleCurationNotes.filter(a => a.curation_notes).length})
                                    </h3>
                                    <div className="space-y-2">
                                        {articleCurationNotes.filter(a => a.curation_notes).map((article) => (
                                            <div
                                                key={article.article_id}
                                                className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3"
                                            >
                                                <div className="flex items-start gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                                {article.title}
                                                            </p>
                                                            {article.pmid && (
                                                                <a
                                                                    href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="flex-shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                                                                >
                                                                    {article.pmid}
                                                                    <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                                                </a>
                                                            )}
                                                            {article.curator_added && (
                                                                <span className="flex-shrink-0 text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                                                    Curator added
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                                                            {article.curation_notes}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Curation Events History */}
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-12">
                                    <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                                </div>
                            ) : historyError ? (
                                <div className="text-center py-12">
                                    <p className="text-red-600 dark:text-red-400">{historyError}</p>
                                    <button
                                        onClick={loadCurationHistory}
                                        className="mt-4 px-4 py-2 text-sm text-blue-600 hover:underline"
                                    >
                                        Try again
                                    </button>
                                </div>
                            ) : curationEvents.length === 0 && (!articleCurationNotes || articleCurationNotes.filter(a => a.curation_notes).length === 0) ? (
                                <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                                    <ClockIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No curation changes recorded</p>
                                    <p className="text-sm mt-1">Changes will appear here when articles are included, excluded, or edited</p>
                                </div>
                            ) : curationEvents.length > 0 ? (
                                <div>
                                    <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                        <ClockIcon className="h-4 w-4 text-gray-600" />
                                        Change History ({curationEvents.length})
                                    </h3>
                                    <div className="space-y-3">
                                    {curationEvents.map((event) => (
                                        <div
                                            key={event.id}
                                            className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                                        >
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                                            event.event_type === 'include_article'
                                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                                : event.event_type === 'exclude_article'
                                                                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                                : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                                        }`}>
                                                            {formatEventType(event.event_type)}
                                                        </span>
                                                        {event.field_name && (
                                                            <span className="text-xs text-gray-500 dark:text-gray-400">
                                                                {formatFieldName(event.field_name)}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {event.article_title && (
                                                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                            {event.article_title}
                                                        </p>
                                                    )}

                                                    {(event.old_value || event.new_value) && (
                                                        <div className="mt-2 text-xs space-y-1">
                                                            {event.old_value && (
                                                                <div className="flex gap-2">
                                                                    <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">From:</span>
                                                                    <span className="text-gray-600 dark:text-gray-300 line-through">
                                                                        {truncateValue(event.old_value)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                            {event.new_value && (
                                                                <div className="flex gap-2">
                                                                    <span className="text-gray-500 dark:text-gray-400 flex-shrink-0">To:</span>
                                                                    <span className="text-gray-700 dark:text-gray-200">
                                                                        {truncateValue(event.new_value)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}

                                                    {event.notes && (
                                                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400 italic">
                                                            Note: {event.notes}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex-shrink-0 text-right">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {event.curator_name}
                                                    </p>
                                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                                        {formatDate(event.created_at)}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
