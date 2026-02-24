import { useState } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { BroadQuery, SemanticSpace } from '../../types';

interface BroadSearchPhaseProps {
    streamId: number;
    semanticSpace: SemanticSpace;
    queries: BroadQuery[];
    onQueriesChange: (queries: BroadQuery[]) => void;
    onComplete: (completed: boolean) => void;
}

export default function BroadSearchPhase({
    streamId,
    semanticSpace,
    queries,
    onQueriesChange,
    onComplete
}: BroadSearchPhaseProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [strategyRationale, setStrategyRationale] = useState<string>('');
    const [coverageAnalysis, setCoverageAnalysis] = useState<any>(null);

    const handleProposeBroadSearch = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await researchStreamApi.proposeBroadSearch(streamId);

            onQueriesChange(response.queries);
            setStrategyRationale(response.strategy_rationale);
            setCoverageAnalysis(response.coverage_analysis);
            onComplete(response.queries.length > 0);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to propose broad search');
            onComplete(false);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                        <MagnifyingGlassIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Propose Broad Search Strategy
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 mb-4">
                            Generate 1-3 simple, broad search queries that cast a wide net to capture
                            all relevant literature. Optimized for weekly monitoring.
                        </p>
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3">
                            <p className="text-sm text-blue-900 dark:text-blue-100">
                                <strong>Philosophy:</strong> Instead of many narrow concepts, find the most
                                general terms that cover everything. Accept some false positives – better
                                to review extra papers than miss relevant ones.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Semantic Space Summary */}
                <div className="mt-6 grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Topics to Cover</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {semanticSpace.topics.length}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Target Queries</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            1-3
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Approach</div>
                        <div className="text-lg font-bold text-gray-900 dark:text-white">
                            Wide Net
                        </div>
                    </div>
                </div>

                {/* Generate Button */}
                <div className="mt-6">
                    <button
                        onClick={handleProposeBroadSearch}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        {loading ? (
                            <>
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                Analyzing domain...
                            </>
                        ) : (
                            <>
                                <MagnifyingGlassIcon className="h-5 w-5" />
                                Generate Broad Search
                            </>
                        )}
                    </button>
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}
            </div>

            {/* Strategy Rationale */}
            {strategyRationale && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                    <div className="flex items-start gap-3">
                        <InformationCircleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                Strategy
                            </h3>
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                                {strategyRationale}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Proposed Queries */}
            {queries.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Proposed Queries ({queries.length})
                    </h3>
                    <div className="space-y-4">
                        {queries.map((query, idx) => (
                            <div
                                key={query.query_id}
                                className="border border-gray-200 dark:border-gray-700 rounded-lg p-5"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center">
                                        <span className="text-blue-700 dark:text-blue-300 font-bold">
                                            {idx + 1}
                                        </span>
                                    </div>
                                    <div className="flex-1">
                                        {/* Query Expression */}
                                        <div className="mb-3">
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                                Search Expression
                                            </div>
                                            <code className="block px-3 py-2 bg-gray-50 dark:bg-gray-900 rounded font-mono text-sm text-gray-900 dark:text-gray-100">
                                                {query.query_expression}
                                            </code>
                                        </div>

                                        {/* Search Terms */}
                                        <div className="mb-3">
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                                Core Terms
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                                {query.search_terms.map((term, i) => (
                                                    <span
                                                        key={i}
                                                        className="px-3 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-900 dark:text-blue-100 rounded-md font-medium text-sm"
                                                    >
                                                        {term}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        {/* Rationale */}
                                        <div className="mb-3">
                                            <div className="text-sm text-gray-500 dark:text-gray-400 mb-1">
                                                Rationale
                                            </div>
                                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                                {query.rationale}
                                            </p>
                                        </div>

                                        {/* Metadata */}
                                        <div className="flex items-center gap-4 text-sm text-gray-500 dark:text-gray-400">
                                            <div>
                                                <span className="font-medium">Covers:</span>{' '}
                                                {query.covered_topics.length} topic{query.covered_topics.length !== 1 ? 's' : ''}
                                            </div>
                                            {query.estimated_weekly_volume && (
                                                <div>
                                                    <span className="font-medium">Est. Volume:</span>{' '}
                                                    ~{query.estimated_weekly_volume} articles/week
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Coverage Analysis */}
            {coverageAnalysis && (
                <div className={`border rounded-lg p-6 ${
                    coverageAnalysis.uncovered_topics?.length === 0
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                }`}>
                    <div className="flex items-start gap-3">
                        <CheckCircleIcon className={`h-6 w-6 flex-shrink-0 mt-0.5 ${
                            coverageAnalysis.uncovered_topics?.length === 0 ? 'text-green-600' : 'text-yellow-600'
                        }`} />
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                Coverage Analysis
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Total Topics:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {coverageAnalysis.total_topics}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Covered:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {coverageAnalysis.covered_topics?.length || 0}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Uncovered:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {coverageAnalysis.uncovered_topics?.length || 0}
                                    </span>
                                </div>
                            </div>
                            {coverageAnalysis.expected_false_positive_rate && (
                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">Expected False Positive Rate:</span>{' '}
                                    {coverageAnalysis.expected_false_positive_rate}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
