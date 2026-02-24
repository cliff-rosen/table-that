import { useState } from 'react';
import { MagnifyingGlassIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { toolsApi, PubMedQueryTestResponse } from '../../lib/api/toolsApi';
import { formatArticleDate } from '../../utils/dateUtils';

export default function PubMedSearch() {
    const [query, setQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateType, setDateType] = useState('publication');
    const [maxResults, setMaxResults] = useState(100);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<PubMedQueryTestResponse | null>(null);

    const handleSearch = async () => {
        if (!query.trim()) {
            setError('Please enter a search query');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const response = await toolsApi.testPubMedQuery({
                query_expression: query,
                max_results: maxResults,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                date_type: dateType
            });

            setResults(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to search PubMed');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setQuery('');
        setStartDate('');
        setEndDate('');
        setDateType('publication');
        setMaxResults(100);
        setResults(null);
        setError(null);
    };

    return (
        <div className="space-y-6">
            {/* Input Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                {/* Query Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Search Query *
                    </label>
                    <textarea
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="e.g., asbestos AND mesothelioma"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                        rows={3}
                    />
                </div>

                {/* Date Range */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Start Date <span className="text-xs text-gray-500 dark:text-gray-400">(optional)</span>
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            End Date <span className="text-xs text-gray-500 dark:text-gray-400">(optional)</span>
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Date Type
                        </label>
                        <select
                            value={dateType}
                            onChange={(e) => setDateType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
                        >
                            <option value="publication">Publication Date (DP)</option>
                            <option value="completion">Completion Date (DCOM)</option>
                            <option value="entry">Entry Date (EDAT)</option>
                            <option value="pubmed">PubMed Date (PDAT)</option>
                        </select>
                    </div>
                </div>

                {/* Max Results */}
                <div className="max-w-xs">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Max Results
                    </label>
                    <input
                        type="number"
                        value={maxResults}
                        onChange={(e) => setMaxResults(Math.min(1000, Math.max(1, parseInt(e.target.value) || 100)))}
                        min={1}
                        max={1000}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-green-500 focus:border-green-500 dark:bg-gray-700 dark:text-white"
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">1-1000</p>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        {loading ? (
                            <>
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                Searching...
                            </>
                        ) : (
                            <>
                                <MagnifyingGlassIcon className="h-5 w-5" />
                                Search
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleReset}
                        disabled={loading}
                        className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        Reset
                    </button>
                </div>

                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                    </div>
                )}
            </div>

            {/* Results */}
            {results && (
                <div className="space-y-4">
                    {/* Summary with Total Results prominently displayed */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Total Matches</div>
                                <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                                    {results.total_results.toLocaleString()}
                                </div>
                                <div className="text-xs text-green-700 dark:text-green-300 mt-1">
                                    articles match your query
                                </div>
                            </div>
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Showing</div>
                                <div className="text-3xl font-bold text-blue-900 dark:text-blue-100">
                                    {results.returned_count.toLocaleString()}
                                </div>
                                <div className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                                    articles returned (max {maxResults})
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Results Table */}
                    {results.articles.length > 0 && (
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                    <thead className="bg-gray-50 dark:bg-gray-900">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                PMID
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Title
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Authors
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Journal
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Date
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {results.articles.map((article, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <a
                                                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-green-600 dark:text-green-400 hover:underline font-mono text-sm"
                                                    >
                                                        {article.pmid}
                                                    </a>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-900 dark:text-white max-w-md">
                                                        {article.title}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs">
                                                        {article.authors?.slice(0, 3).join(', ') || '-'}
                                                        {article.authors && article.authors.length > 3 && ', et al.'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs">
                                                        {article.journal || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                                        {formatArticleDate(article.pub_year, article.pub_month, article.pub_day) || '-'}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
