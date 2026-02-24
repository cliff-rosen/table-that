import { useState } from 'react';
import { SparklesIcon, ArrowPathIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { BroadQuery, SemanticFilter } from '../../types';

interface BroadFilterPhaseProps {
    streamId: number;
    queries: BroadQuery[];
    onQueriesChange: (queries: BroadQuery[]) => void;
    onComplete: (completed: boolean) => void;
}

export default function BroadFilterPhase({
    streamId,
    queries,
    onQueriesChange,
    onComplete
}: BroadFilterPhaseProps) {
    const [expandedQueries, setExpandedQueries] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    const toggleQuery = (queryId: string) => {
        const newExpanded = new Set(expandedQueries);
        if (newExpanded.has(queryId)) {
            newExpanded.delete(queryId);
        } else {
            newExpanded.add(queryId);
        }
        setExpandedQueries(newExpanded);
    };

    const handleGenerateFilter = async (queryId: string) => {
        try {
            setLoading(prev => ({ ...prev, [queryId]: true }));
            setError(null);

            // Find the query
            const query = queries.find(q => q.query_id === queryId);
            if (!query) {
                throw new Error('Query not found');
            }

            const result = await researchStreamApi.generateBroadFilter(streamId, query);

            // Update query with new filter
            const updatedQueries = queries.map(q => {
                if (q.query_id === queryId) {
                    const newFilter: SemanticFilter = {
                        enabled: false, // User can enable manually
                        criteria: result.criteria,
                        threshold: result.threshold
                    };

                    return {
                        ...q,
                        semantic_filter: newFilter
                    };
                }
                return q;
            });

            onQueriesChange(updatedQueries);
            onComplete(true); // Filter phase is optional, always mark complete

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate filter');
        } finally {
            setLoading(prev => ({ ...prev, [queryId]: false }));
        }
    };

    const handleToggleFilter = (queryId: string) => {
        const updatedQueries = queries.map(q => {
            if (q.query_id === queryId) {
                return {
                    ...q,
                    semantic_filter: {
                        ...q.semantic_filter,
                        enabled: !q.semantic_filter.enabled
                    }
                };
            }
            return q;
        });

        onQueriesChange(updatedQueries);
    };

    const handleUpdateThreshold = (queryId: string, threshold: number) => {
        const updatedQueries = queries.map(q => {
            if (q.query_id === queryId) {
                return {
                    ...q,
                    semantic_filter: {
                        ...q.semantic_filter,
                        threshold
                    }
                };
            }
            return q;
        });

        onQueriesChange(updatedQueries);
    };

    const handleUpdateCriteria = (queryId: string, criteria: string) => {
        const updatedQueries = queries.map(q => {
            if (q.query_id === queryId) {
                return {
                    ...q,
                    semantic_filter: {
                        ...q.semantic_filter,
                        criteria
                    }
                };
            }
            return q;
        });

        onQueriesChange(updatedQueries);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                        <SparklesIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Configure Semantic Filters (Optional)
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Semantic filters use AI to filter retrieved articles based on relevance criteria.
                            Since broad searches cast a wide net, filters can help improve precision.
                        </p>
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <strong>Note:</strong> Semantic filtering is optional. Broad searches are designed to
                                accept false positives, but you can enable filters to refine results further.
                            </p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}
            </div>

            {/* Queries List */}
            {queries.map(query => {
                const isExpanded = expandedQueries.has(query.query_id);
                const hasFilter = query.semantic_filter?.criteria;
                const isLoading = loading[query.query_id];

                return (
                    <div
                        key={query.query_id}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
                    >
                        {/* Query Header */}
                        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <code className="px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded text-sm font-mono text-gray-900 dark:text-white">
                                            {query.query_expression}
                                        </code>
                                        {hasFilter && (
                                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                                                query.semantic_filter.enabled
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                            }`}>
                                                {query.semantic_filter.enabled ? 'Filter Active' : 'Filter Configured'}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                        {query.rationale}
                                    </p>
                                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-500">
                                        Covers {query.covered_topics.length} topic{query.covered_topics.length !== 1 ? 's' : ''}
                                    </div>
                                </div>
                                <button
                                    onClick={() => toggleQuery(query.query_id)}
                                    className="ml-4 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                                >
                                    {isExpanded ? (
                                        <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                    ) : (
                                        <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Query Details (Expanded) */}
                        {isExpanded && (
                            <div className="p-6 space-y-4">
                                {/* Generate Filter Button */}
                                {!hasFilter && (
                                    <div>
                                        <button
                                            onClick={() => handleGenerateFilter(query.query_id)}
                                            disabled={isLoading}
                                            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                    Generating Filter...
                                                </>
                                            ) : (
                                                <>
                                                    <SparklesIcon className="h-4 w-4" />
                                                    Generate Semantic Filter
                                                </>
                                            )}
                                        </button>
                                    </div>
                                )}

                                {/* Filter Configuration */}
                                {hasFilter && (
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                                Semantic Filter
                                            </h4>
                                            <label className="flex items-center gap-2 cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={query.semantic_filter.enabled}
                                                    onChange={() => handleToggleFilter(query.query_id)}
                                                    className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300">
                                                    Enable Filter
                                                </span>
                                            </label>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Filter Criteria
                                            </label>
                                            <textarea
                                                value={query.semantic_filter.criteria}
                                                onChange={(e) => handleUpdateCriteria(query.query_id, e.target.value)}
                                                rows={3}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white text-sm"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                Threshold: {query.semantic_filter.threshold.toFixed(2)}
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="1"
                                                step="0.05"
                                                value={query.semantic_filter.threshold}
                                                onChange={(e) => handleUpdateThreshold(query.query_id, parseFloat(e.target.value))}
                                                className="w-full"
                                            />
                                            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                <span>Permissive (0.5)</span>
                                                <span>Balanced (0.7)</span>
                                                <span>Strict (0.9)</span>
                                            </div>
                                        </div>

                                        <div className="flex items-center justify-between pt-4">
                                            <button
                                                onClick={() => handleGenerateFilter(query.query_id)}
                                                disabled={isLoading}
                                                className="text-sm text-purple-600 dark:text-purple-400 hover:underline disabled:opacity-50"
                                            >
                                                Regenerate Filter
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
