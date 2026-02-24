import { useState, useEffect } from 'react';
import { XMarkIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { reportApi } from '../../lib/api/reportApi';
import { getPipelineAnalytics } from '../../lib/api/curationApi';

interface PipelineAnalytics {
    report_id: number;
    run_type: string | null;
    report_date: string;
    pipeline_metrics: Record<string, any>;
    summary: {
        total_retrieved: number;
        duplicates: number;
        filtered_out: number;
        passed_filter: number;
        included_in_report: number;
        // Curation stats
        curator_added: number;
        curator_removed: number;
    };
    by_group: Array<{
        group_id: string;
        total: number;
        duplicates: number;
        filtered_out: number;
        passed_filter: number;
        included: number;
    }>;
    filter_reasons: Record<string, number>;
    category_counts: Record<string, number>;
    wip_articles: Array<{
        id: number;
        title: string;
        retrieval_group_id: string;
        is_duplicate: boolean;
        duplicate_of_id: number | null;
        passed_semantic_filter: boolean | null;
        filter_score: number | null;
        filter_score_reason: string | null;
        included_in_report: boolean;
        presentation_categories: string[];
        authors: string[];
        journal: string | null;
        pub_year: number | null;
        pub_month: number | null;
        pub_day: number | null;
        pmid: string | null;
        doi: string | null;
        abstract: string | null;
    }>;
}

interface PipelineAnalyticsModalProps {
    reportId: number;
    onClose: () => void;
}

export default function PipelineAnalyticsModal({ reportId, onClose }: PipelineAnalyticsModalProps) {
    const [analytics, setAnalytics] = useState<PipelineAnalytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [selectedTab, setSelectedTab] = useState<'overview' | 'groups' | 'rejections' | 'articles' | 'comparison'>('overview');

    // Comparison tab state
    const [comparisonInput, setComparisonInput] = useState('');
    const [comparisonResult, setComparisonResult] = useState<any>(null);
    const [comparisonLoading, setComparisonLoading] = useState(false);
    const [comparisonError, setComparisonError] = useState<string | null>(null);
    const [comparisonInputExpanded, setComparisonInputExpanded] = useState(true);
    const [comparisonSubTab, setComparisonSubTab] = useState<'not_found' | 'filtered_out' | 'included' | 'report_only'>('not_found');

    useEffect(() => {
        loadAnalytics();
    }, [reportId]);

    const loadAnalytics = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await getPipelineAnalytics(reportId);
            setAnalytics(data);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Failed to load analytics');
        } finally {
            setLoading(false);
        }
    };

    const handleCompareReport = async () => {
        setComparisonLoading(true);
        setComparisonError(null);
        try {
            // Parse PubMed IDs from input (comma or newline separated)
            const pmids = comparisonInput
                .split(/[\n,\s]+/)
                .map(id => id.trim())
                .filter(id => id.length > 0);

            if (pmids.length === 0) {
                setComparisonError('Please enter at least one PubMed ID');
                return;
            }

            const result = await reportApi.compareReport(reportId, pmids);
            setComparisonResult(result);
            setComparisonInputExpanded(false); // Collapse input after successful comparison
        } catch (err: any) {
            setComparisonError(err.response?.data?.detail || 'Failed to compare report');
        } finally {
            setComparisonLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                    <p className="text-gray-600 dark:text-gray-400 mt-4">Loading analytics...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                <div className="bg-white dark:bg-gray-800 rounded-lg p-8 max-w-md">
                    <h3 className="text-lg font-semibold text-red-600 dark:text-red-400 mb-2">Error</h3>
                    <p className="text-gray-700 dark:text-gray-300">{error}</p>
                    <button
                        onClick={onClose}
                        className="mt-4 px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md"
                    >
                        Close
                    </button>
                </div>
            </div>
        );
    }

    if (!analytics) return null;

    const passRate = analytics.summary.total_retrieved > 0
        ? ((analytics.summary.passed_filter / analytics.summary.total_retrieved) * 100).toFixed(1)
        : '0';

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[95vw] h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
                    <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                            Pipeline Analytics
                        </h2>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Report #{reportId} • {analytics.run_type?.toUpperCase()} • {new Date(analytics.report_date).toLocaleDateString()}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 px-6 pt-4 border-b border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setSelectedTab('overview')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            selectedTab === 'overview'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Overview
                    </button>
                    <button
                        onClick={() => setSelectedTab('groups')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            selectedTab === 'groups'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        By Group ({analytics.by_group.length})
                    </button>
                    <button
                        onClick={() => setSelectedTab('rejections')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            selectedTab === 'rejections'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Rejections ({analytics.summary.filtered_out})
                    </button>
                    <button
                        onClick={() => setSelectedTab('articles')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            selectedTab === 'articles'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        All Articles ({analytics.wip_articles.length})
                    </button>
                    <button
                        onClick={() => setSelectedTab('comparison')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            selectedTab === 'comparison'
                                ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Comparison
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 min-h-0">
                    {selectedTab === 'overview' && (
                        <div className="space-y-6">
                            {/* Summary Cards */}
                            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                                    <p className="text-sm text-blue-600 dark:text-blue-400 font-medium">Retrieved</p>
                                    <p className="text-3xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                                        {analytics.summary.total_retrieved}
                                    </p>
                                </div>
                                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                                    <p className="text-sm text-yellow-600 dark:text-yellow-400 font-medium">Duplicates</p>
                                    <p className="text-3xl font-bold text-yellow-900 dark:text-yellow-100 mt-1">
                                        {analytics.summary.duplicates}
                                    </p>
                                </div>
                                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                    <p className="text-sm text-red-600 dark:text-red-400 font-medium">Filtered Out</p>
                                    <p className="text-3xl font-bold text-red-900 dark:text-red-100 mt-1">
                                        {analytics.summary.filtered_out}
                                    </p>
                                </div>
                                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                    <p className="text-sm text-green-600 dark:text-green-400 font-medium">Passed Filter</p>
                                    <p className="text-3xl font-bold text-green-900 dark:text-green-100 mt-1">
                                        {analytics.summary.passed_filter}
                                    </p>
                                </div>
                                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                                    <p className="text-sm text-purple-600 dark:text-purple-400 font-medium">In Report</p>
                                    <p className="text-3xl font-bold text-purple-900 dark:text-purple-100 mt-1">
                                        {analytics.summary.included_in_report}
                                    </p>
                                </div>
                            </div>

                            {/* Pass Rate */}
                            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Pass Rate: {passRate}%
                                </p>
                                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-green-600"
                                        style={{ width: `${passRate}%` }}
                                    ></div>
                                </div>
                            </div>

                            {/* Curation Stats - show if there are any manual changes */}
                            {(analytics.summary.curator_added > 0 || analytics.summary.curator_removed > 0) && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                        Manual Curation
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                                            <p className="text-sm text-green-600 dark:text-green-400 font-medium">Curator Added</p>
                                            <p className="text-3xl font-bold text-green-900 dark:text-green-100 mt-1">
                                                +{analytics.summary.curator_added}
                                            </p>
                                            <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                                Filtered articles manually included
                                            </p>
                                        </div>
                                        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                                            <p className="text-sm text-red-600 dark:text-red-400 font-medium">Curator Removed</p>
                                            <p className="text-3xl font-bold text-red-900 dark:text-red-100 mt-1">
                                                -{analytics.summary.curator_removed}
                                            </p>
                                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                                Pipeline articles manually excluded
                                            </p>
                                        </div>
                                    </div>
                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
                                        Final report: {analytics.summary.passed_filter} passed filter
                                        {analytics.summary.curator_added > 0 && ` + ${analytics.summary.curator_added} added`}
                                        {analytics.summary.curator_removed > 0 && ` - ${analytics.summary.curator_removed} removed`}
                                        {' '}= {analytics.summary.included_in_report} articles
                                    </p>
                                </div>
                            )}

                            {/* Category Distribution */}
                            {Object.keys(analytics.category_counts || {}).length > 0 && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                        Category Distribution
                                    </h3>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                        {Object.entries(analytics.category_counts || {}).map(([category, count]) => (
                                            <div key={category} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                                                <p className="text-sm text-gray-600 dark:text-gray-400">{category}</p>
                                                <p className="text-2xl font-bold text-gray-900 dark:text-white">{count}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {selectedTab === 'groups' && (
                        <div className="space-y-4">
                            {analytics.by_group.map((group) => (
                                <div key={group.group_id} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => setExpandedGroup(expandedGroup === group.group_id ? null : group.group_id)}
                                        className="w-full bg-gray-50 dark:bg-gray-800 px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors"
                                    >
                                        <div className="flex items-center gap-3">
                                            {expandedGroup === group.group_id ? (
                                                <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                            ) : (
                                                <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                                            )}
                                            <span className="font-semibold text-gray-900 dark:text-white">{group.group_id}</span>
                                        </div>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">{group.total} articles</span>
                                    </button>
                                    {expandedGroup === group.group_id && (
                                        <div className="p-4 bg-white dark:bg-gray-900 grid grid-cols-2 md:grid-cols-4 gap-4">
                                            <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Duplicates</p>
                                                <p className="text-xl font-bold text-gray-900 dark:text-white">{group.duplicates}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Filtered Out</p>
                                                <p className="text-xl font-bold text-gray-900 dark:text-white">{group.filtered_out}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Passed</p>
                                                <p className="text-xl font-bold text-gray-900 dark:text-white">{group.passed_filter}</p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-gray-500 dark:text-gray-400">Included</p>
                                                <p className="text-xl font-bold text-gray-900 dark:text-white">{group.included}</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {selectedTab === 'rejections' && (
                        <div className="space-y-3">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                Why Articles Were Filtered Out
                            </h3>
                            {Object.keys(analytics.filter_reasons || {}).length === 0 ? (
                                <p className="text-gray-500 dark:text-gray-400">No rejections (all articles passed filters)</p>
                            ) : (
                                Object.entries(analytics.filter_reasons || {})
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([reason, count]) => (
                                        <div key={reason} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                            <div className="flex items-start justify-between gap-4">
                                                <p className="flex-1 text-sm text-gray-700 dark:text-gray-300">{reason}</p>
                                                <span className="flex-shrink-0 px-3 py-1 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 rounded-full text-sm font-medium">
                                                    {count}
                                                </span>
                                            </div>
                                        </div>
                                    ))
                            )}
                        </div>
                    )}

                    {selectedTab === 'articles' && (
                        <div className="space-y-3">
                            {analytics.wip_articles.map((article) => (
                                <div key={article.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                                    <div className="flex items-start gap-3">
                                        <div className="flex-1">
                                            {article.pmid && (
                                                <a
                                                    href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-xs font-mono text-blue-600 dark:text-blue-400 hover:underline mb-1 inline-block"
                                                >
                                                    PMID: {article.pmid}
                                                </a>
                                            )}
                                            <h4 className="font-medium text-gray-900 dark:text-white mb-1">{article.title}</h4>
                                            <div className="flex flex-wrap gap-2 text-xs mb-2">
                                                <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-300 rounded">
                                                    {article.retrieval_group_id}
                                                </span>
                                                {article.is_duplicate && (
                                                    <span className="px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 text-yellow-800 dark:text-yellow-300 rounded">
                                                        Duplicate
                                                    </span>
                                                )}
                                                {article.passed_semantic_filter === false && (
                                                    <span className="px-2 py-0.5 bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 rounded">
                                                        Filtered Out
                                                    </span>
                                                )}
                                                {article.passed_semantic_filter === true && (
                                                    <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/40 text-green-800 dark:text-green-300 rounded">
                                                        Passed Filter
                                                    </span>
                                                )}
                                                {article.included_in_report && (
                                                    <span className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 rounded">
                                                        In Report
                                                    </span>
                                                )}
                                            </div>
                                            {article.filter_score_reason && (
                                                <p className="text-sm text-red-600 dark:text-red-400 italic mt-2">
                                                    Rejection: {article.filter_score_reason}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {selectedTab === 'comparison' && (
                        <div className="h-full flex flex-col space-y-4">
                            {/* Collapsible Input Section */}
                            <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden flex-shrink-0">
                                <button
                                    onClick={() => setComparisonInputExpanded(!comparisonInputExpanded)}
                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                                >
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                        Compare Report to PubMed IDs
                                    </h3>
                                    {comparisonInputExpanded ? (
                                        <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                                    ) : (
                                        <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                                    )}
                                </button>
                                {comparisonInputExpanded && (
                                    <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                                            Enter a list of PubMed IDs (one per line or comma-separated) to compare against this report.
                                        </p>

                                        <textarea
                                            value={comparisonInput}
                                            onChange={(e) => setComparisonInput(e.target.value)}
                                            placeholder="Enter PubMed IDs (e.g., 12345678, 87654321)..."
                                            rows={6}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-purple-500 focus:border-purple-500 dark:bg-gray-700 dark:text-white text-sm font-mono"
                                        />

                                        <button
                                            onClick={handleCompareReport}
                                            disabled={comparisonLoading || !comparisonInput.trim()}
                                            className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {comparisonLoading ? 'Comparing...' : 'Compare'}
                                        </button>

                                        {comparisonError && (
                                            <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                                                <p className="text-red-800 dark:text-red-200 text-sm">{comparisonError}</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            {comparisonResult && (
                                <div className="flex-1 flex flex-col min-h-0 space-y-4">
                                    {/* Statistics */}
                                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 flex-shrink-0">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                                            <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Supplied</p>
                                            <p className="text-2xl font-bold text-blue-900 dark:text-blue-100 mt-1">
                                                {comparisonResult.statistics.total_supplied}
                                            </p>
                                        </div>
                                        <div
                                            className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                                            onClick={() => setComparisonSubTab('not_found')}
                                        >
                                            <p className="text-xs text-red-600 dark:text-red-400 font-medium">Not Found</p>
                                            <p className="text-2xl font-bold text-red-900 dark:text-red-100 mt-1">
                                                {comparisonResult.statistics.not_found}
                                            </p>
                                        </div>
                                        <div
                                            className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
                                            onClick={() => setComparisonSubTab('filtered_out')}
                                        >
                                            <p className="text-xs text-orange-600 dark:text-orange-400 font-medium">Filtered Out</p>
                                            <p className="text-2xl font-bold text-orange-900 dark:text-orange-100 mt-1">
                                                {comparisonResult.statistics.filtered_out}
                                            </p>
                                        </div>
                                        <div
                                            className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3 cursor-pointer hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                                            onClick={() => setComparisonSubTab('included')}
                                        >
                                            <p className="text-xs text-green-600 dark:text-green-400 font-medium">Included</p>
                                            <p className="text-2xl font-bold text-green-900 dark:text-green-100 mt-1">
                                                {comparisonResult.statistics.included}
                                            </p>
                                        </div>
                                        <div
                                            className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 cursor-pointer hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                                            onClick={() => setComparisonSubTab('report_only')}
                                        >
                                            <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Report Only</p>
                                            <p className="text-2xl font-bold text-purple-900 dark:text-purple-100 mt-1">
                                                {comparisonResult.statistics.report_only}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Sub-tabs */}
                                    <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                                        <button
                                            onClick={() => setComparisonSubTab('not_found')}
                                            className={`pb-2 px-3 font-medium transition-colors border-b-2 ${
                                                comparisonSubTab === 'not_found'
                                                    ? 'border-red-600 text-red-600 dark:text-red-400'
                                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            Not Found ({comparisonResult.statistics.not_found})
                                        </button>
                                        <button
                                            onClick={() => setComparisonSubTab('filtered_out')}
                                            className={`pb-2 px-3 font-medium transition-colors border-b-2 ${
                                                comparisonSubTab === 'filtered_out'
                                                    ? 'border-orange-600 text-orange-600 dark:text-orange-400'
                                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            Filtered Out ({comparisonResult.statistics.filtered_out})
                                        </button>
                                        <button
                                            onClick={() => setComparisonSubTab('included')}
                                            className={`pb-2 px-3 font-medium transition-colors border-b-2 ${
                                                comparisonSubTab === 'included'
                                                    ? 'border-green-600 text-green-600 dark:text-green-400'
                                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            Included ({comparisonResult.statistics.included})
                                        </button>
                                        <button
                                            onClick={() => setComparisonSubTab('report_only')}
                                            className={`pb-2 px-3 font-medium transition-colors border-b-2 ${
                                                comparisonSubTab === 'report_only'
                                                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                                                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                                            }`}
                                        >
                                            Report Only ({comparisonResult.statistics.report_only})
                                        </button>
                                    </div>

                                    {/* Sub-tab Content */}
                                    <div className="flex-1 overflow-y-auto min-h-0">
                                        {comparisonSubTab === 'not_found' && (
                                            <div className="space-y-2">
                                                {comparisonResult.supplied_articles
                                                    .filter((article: any) => article.status === 'not_found')
                                                    .map((article: any, idx: number) => (
                                                        <div key={idx} className="bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg p-3">
                                                            <a
                                                                href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline"
                                                            >
                                                                PMID: {article.pmid}
                                                            </a>
                                                            <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                                                                This article did not appear in any search results.
                                                            </p>
                                                        </div>
                                                    ))}
                                                {comparisonResult.supplied_articles.filter((a: any) => a.status === 'not_found').length === 0 && (
                                                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                                        All supplied articles were found in the search results.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {comparisonSubTab === 'filtered_out' && (
                                            <div className="space-y-2">
                                                {comparisonResult.supplied_articles
                                                    .filter((article: any) => article.status === 'filtered_out')
                                                    .map((article: any, idx: number) => (
                                                        <div key={idx} className="bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-800 rounded-lg p-3">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <a
                                                                    href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline"
                                                                >
                                                                    PMID: {article.pmid}
                                                                </a>
                                                            </div>
                                                            {article.article_title && (
                                                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                                                    {article.article_title}
                                                                </p>
                                                            )}
                                                            {article.retrieval_unit_id && (
                                                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                                                                    Retrieved by: {article.retrieval_unit_id}
                                                                </p>
                                                            )}
                                                            {article.filter_score_reason && (
                                                                <p className="text-xs text-orange-600 dark:text-orange-400 italic">
                                                                    Rejection: {article.filter_score_reason}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                {comparisonResult.supplied_articles.filter((a: any) => a.status === 'filtered_out').length === 0 && (
                                                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                                        No supplied articles were filtered out.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {comparisonSubTab === 'included' && (
                                            <div className="space-y-2">
                                                {comparisonResult.supplied_articles
                                                    .filter((article: any) => article.status === 'included')
                                                    .map((article: any, idx: number) => (
                                                        <div key={idx} className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-800 rounded-lg p-3">
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <a
                                                                    href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline"
                                                                >
                                                                    PMID: {article.pmid}
                                                                </a>
                                                            </div>
                                                            {article.article_title && (
                                                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                                                    {article.article_title}
                                                                </p>
                                                            )}
                                                            {article.retrieval_unit_id && (
                                                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                                                    Retrieved by: {article.retrieval_unit_id}
                                                                </p>
                                                            )}
                                                        </div>
                                                    ))}
                                                {comparisonResult.supplied_articles.filter((a: any) => a.status === 'included').length === 0 && (
                                                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                                        None of the supplied articles were included in the report.
                                                    </p>
                                                )}
                                            </div>
                                        )}

                                        {comparisonSubTab === 'report_only' && (
                                            <div className="space-y-2">
                                                {comparisonResult.report_only_articles.map((article: any, idx: number) => (
                                                    <div key={idx} className="bg-white dark:bg-gray-800 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                                                        <a
                                                            href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-sm font-mono text-blue-600 dark:text-blue-400 hover:underline"
                                                        >
                                                            PMID: {article.pmid}
                                                        </a>
                                                        <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                                                            {article.title}
                                                        </p>
                                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                            Retrieved by: {article.retrieval_unit_id}
                                                        </p>
                                                    </div>
                                                ))}
                                                {comparisonResult.report_only_articles.length === 0 && (
                                                    <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                                                        All articles in the report were in the supplied list.
                                                    </p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex justify-end p-6 border-t border-gray-200 dark:border-gray-700">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
