import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { RetrievalConfig, BroadQuery } from '../../types';
import { SparklesIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useResearchStream } from '../../context/ResearchStreamContext';

interface RetrievalConfigFormProps {
    retrievalConfig: RetrievalConfig;
    onChange: (updated: RetrievalConfig) => void;
}

const PUBMED_SOURCE_ID = 1; // Default source

export default function RetrievalConfigForm({
    retrievalConfig,
    onChange
}: RetrievalConfigFormProps) {
    const navigate = useNavigate();
    const { id } = useParams();
    const { availableSources, loadAvailableSources } = useResearchStream();

    // Load available sources on mount
    useEffect(() => {
        if (availableSources.length === 0) {
            loadAvailableSources();
        }
    }, [availableSources.length, loadAvailableSources]);

    // Ensure broad_search strategy is initialized
    const ensureBroadSearch = () => {
        if (!retrievalConfig.broad_search) {
            onChange({
                ...retrievalConfig,
                concepts: null,
                broad_search: {
                    queries: [],
                    strategy_rationale: '',
                    coverage_analysis: {}
                }
            });
        }
    };

    // Broad Query handlers
    const addBroadQuery = () => {
        ensureBroadSearch();
        const queries = retrievalConfig.broad_search?.queries || [];
        const newQuery: BroadQuery = {
            query_id: `query_${Date.now()}`,
            source_id: PUBMED_SOURCE_ID,
            search_terms: [],
            query_expression: '',
            rationale: '',
            covered_topics: [],
            estimated_weekly_volume: null,
            semantic_filter: {
                enabled: true,
                criteria: '',
                threshold: 0.7
            }
        };
        onChange({
            ...retrievalConfig,
            concepts: null,
            broad_search: {
                ...retrievalConfig.broad_search,
                queries: [...queries, newQuery],
                strategy_rationale: retrievalConfig.broad_search?.strategy_rationale || '',
                coverage_analysis: retrievalConfig.broad_search?.coverage_analysis || {}
            }
        });
    };

    const removeBroadQuery = (index: number) => {
        if (!retrievalConfig.broad_search) return;
        onChange({
            ...retrievalConfig,
            broad_search: {
                ...retrievalConfig.broad_search,
                queries: retrievalConfig.broad_search.queries.filter((_, i) => i !== index)
            }
        });
    };

    const updateBroadQuery = (index: number, field: keyof BroadQuery, value: any) => {
        if (!retrievalConfig.broad_search) return;
        const updated = [...retrievalConfig.broad_search.queries];
        updated[index] = { ...updated[index], [field]: value };
        onChange({
            ...retrievalConfig,
            broad_search: {
                ...retrievalConfig.broad_search,
                queries: updated
            }
        });
    };

    const queries = retrievalConfig.broad_search?.queries || [];
    const hasNoQueries = !retrievalConfig.broad_search || queries.length === 0;

    return (
        <div className="h-full flex flex-col">
            {/* Header with Wizard button - fixed */}
            <div className="flex items-center justify-between flex-shrink-0 mb-4">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Search Queries
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={addBroadQuery}
                        className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                    >
                        <PlusIcon className="h-4 w-4" />
                        Add Query
                    </button>
                    <button
                        type="button"
                        onClick={() => navigate(`/streams/${id}/retrieval-wizard`)}
                        className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                    >
                        <SparklesIcon className="h-4 w-4" />
                        Launch Wizard
                    </button>
                </div>
            </div>

            {/* Queries Section - fills all remaining space */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                {hasNoQueries ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-500 dark:text-gray-400 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg">
                        <p className="mb-4">No queries defined yet.</p>
                        <button
                            type="button"
                            onClick={addBroadQuery}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-md transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Query
                        </button>
                        <p className="text-sm mt-4">
                            Or use the <span className="font-medium">Launch Wizard</span> button to generate queries automatically
                        </p>
                    </div>
                ) : (
                    <div className="h-full flex flex-col gap-4">
                        {queries.map((query, index) => (
                            <div
                                key={query.query_id}
                                className={`border border-gray-300 dark:border-gray-600 rounded-lg p-4 flex flex-col ${queries.length === 1 ? 'flex-1' : ''}`}
                            >
                                <div className="flex items-center justify-between mb-3 flex-shrink-0">
                                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                                        Query {index + 1}
                                    </h4>
                                    <button
                                        type="button"
                                        onClick={() => removeBroadQuery(index)}
                                        className="text-red-600 dark:text-red-400 hover:text-red-700"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </div>

                                {/* Source Selection */}
                                <div className="flex-shrink-0 mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Source
                                    </label>
                                    <select
                                        value={query.source_id}
                                        onChange={(e) => updateBroadQuery(index, 'source_id', parseInt(e.target.value))}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    >
                                        {availableSources.map((source) => (
                                            <option key={source.source_id} value={source.source_id}>
                                                {source.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>

                                {/* Query Expression */}
                                <div className="flex-shrink-0 mb-4">
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Query Expression
                                    </label>
                                    <textarea
                                        placeholder="e.g., (asbestos[Title/Abstract] OR mesothelioma[Title/Abstract]) AND humans[MeSH]"
                                        value={query.query_expression}
                                        onChange={(e) => updateBroadQuery(index, 'query_expression', e.target.value)}
                                        className="w-full min-h-[80px] px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm font-mono resize-y"
                                    />
                                </div>

                                {/* Semantic Filter - takes remaining space */}
                                <div className="flex-1 min-h-0 flex flex-col border-t border-gray-200 dark:border-gray-700 pt-3">
                                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                                        <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Semantic Filter
                                        </h5>
                                        <label className="flex items-center space-x-2">
                                            <input
                                                type="checkbox"
                                                checked={query.semantic_filter.enabled}
                                                onChange={(e) => updateBroadQuery(index, 'semantic_filter', {
                                                    ...query.semantic_filter,
                                                    enabled: e.target.checked
                                                })}
                                                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                            />
                                            <span className="text-sm text-gray-700 dark:text-gray-300">Enabled</span>
                                        </label>
                                    </div>

                                    {query.semantic_filter.enabled && (
                                        <div className="flex-1 min-h-0 flex flex-col">
                                            {/* Filter Criteria - 4 parts, expands to fill */}
                                            <div className="flex-1 min-h-0 flex flex-col mb-3">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1 flex-shrink-0">
                                                    Filter Criteria
                                                </label>
                                                <textarea
                                                    placeholder="Describe what makes an article relevant. Be specific about what to include and exclude."
                                                    value={query.semantic_filter.criteria}
                                                    onChange={(e) => updateBroadQuery(index, 'semantic_filter', {
                                                        ...query.semantic_filter,
                                                        criteria: e.target.value
                                                    })}
                                                    className="flex-1 min-h-[120px] w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm resize-none"
                                                />
                                            </div>

                                            {/* Confidence Threshold - fixed height */}
                                            <div className="flex-shrink-0">
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Confidence Threshold
                                                </label>
                                                <div className="flex items-center gap-3">
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="1"
                                                        step="0.05"
                                                        value={query.semantic_filter.threshold}
                                                        onChange={(e) => updateBroadQuery(index, 'semantic_filter', {
                                                            ...query.semantic_filter,
                                                            threshold: parseFloat(e.target.value)
                                                        })}
                                                        className="flex-1"
                                                    />
                                                    <span className="text-sm font-medium text-gray-900 dark:text-white w-12 text-right">
                                                        {query.semantic_filter.threshold.toFixed(2)}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
