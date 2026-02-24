import { useState } from 'react';
import { CheckCircleIcon, XCircleIcon, MagnifyingGlassIcon, ArrowPathIcon, ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import { CheckIcon } from '@heroicons/react/24/solid';
import { toolsApi, PubMedIdCheckResponse } from '../../lib/api/toolsApi';
import { copyToClipboard } from '../../lib/utils/clipboard';
import { getYearString } from '../../utils/dateUtils';

// Canned queries for quick selection
const CANNED_QUERIES = [
    {
        id: 'asbestos-talc',
        name: 'Asbestos & Talc Literature',
        query: `(cancer causation AND (genetic predisposition OR genetic susceptibility OR BAP1 OR NF2 OR CDKN2A OR TP53 OR BRCA1 OR BRCA2)) OR ((lung cancer OR ovarian cancer) AND (genetic predisposition OR genetic susceptibility OR BAP1 OR NF2 OR CDKN2A OR TP53 OR BRCA1 OR BRCA2)) OR (mesothelioma OR asbestosis OR "pleural plaque" OR "pleural plaques" OR "pleural disease" OR "pleural thickening") OR (asbestos OR talc)`
    }
];

export default function PubMedIdChecker() {
    const [query, setQuery] = useState('');
    const [pubmedIds, setPubmedIds] = useState('');
    const [selectedCannedQuery, setSelectedCannedQuery] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [dateType, setDateType] = useState('publication'); // Default to 'publication' to match pipeline
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<PubMedIdCheckResponse | null>(null);
    const [copiedType, setCopiedType] = useState<string | null>(null);

    const handleCheck = async () => {
        if (!query.trim()) {
            setError('Please enter a query');
            return;
        }

        if (!pubmedIds.trim()) {
            setError('Please enter at least one PubMed ID');
            return;
        }

        try {
            setLoading(true);
            setError(null);

            // Parse PubMed IDs - split by newlines, commas, or spaces
            const idList = pubmedIds
                .split(/[\n,\s]+/)
                .map(id => id.trim())
                .filter(id => id.length > 0);

            if (idList.length === 0) {
                setError('No valid PubMed IDs found');
                return;
            }

            const response = await toolsApi.checkPubMedIds({
                query_expression: query,
                pubmed_ids: idList,
                start_date: startDate || undefined,
                end_date: endDate || undefined,
                date_type: dateType
            });

            setResults(response);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to check PubMed IDs');
        } finally {
            setLoading(false);
        }
    };

    const handleReset = () => {
        setQuery('');
        setPubmedIds('');
        setStartDate('');
        setEndDate('');
        setDateType('publication');
        setSelectedCannedQuery('');
        setResults(null);
        setError(null);
    };

    const handleCannedQuerySelect = (queryId: string) => {
        setSelectedCannedQuery(queryId);
        if (queryId) {
            const selected = CANNED_QUERIES.find(q => q.id === queryId);
            if (selected) {
                setQuery(selected.query);
            }
        }
    };

    const handleCopyToClipboard = async (type: 'captured' | 'missed' | 'all') => {
        if (!results) {
            alert('No results available to copy');
            return;
        }

        let idsToCopy: string[] = [];

        if (type === 'captured') {
            // IDs found in both the query and the provided list (intersection)
            idsToCopy = results.results
                .filter(r => r.captured)
                .map(r => r.pubmed_id);
        } else if (type === 'missed') {
            // IDs in the list but not captured by the query
            idsToCopy = results.results
                .filter(r => !r.captured)
                .map(r => r.pubmed_id);
        } else {
            // All IDs from the original list
            idsToCopy = results.results.map(r => r.pubmed_id);
        }

        if (idsToCopy.length === 0) {
            alert(`No ${type} IDs to copy`);
            return;
        }

        // Create newline-separated list for pasting into workbench
        const text = idsToCopy.join('\n');
        const result = await copyToClipboard(text);

        if (result.success) {
            setCopiedType(type);
            setTimeout(() => setCopiedType(null), 2000);
        } else {
            alert(`Failed to copy to clipboard: ${result.error}`);
        }
    };

    return (
        <div className="space-y-6">
            {/* Tool Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-start gap-4">
                    <MagnifyingGlassIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                    <div className="flex-1">
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
                            PubMed ID Checker
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400 text-sm">
                            Test which PubMed IDs from your list are captured by a search query.
                            Paste a list of PubMed IDs, enter your query, and we'll show you which ones match.
                        </p>
                    </div>
                </div>
            </div>

            {/* Input Form */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-4">
                {/* Canned Query Selector */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Quick Select Query
                    </label>
                    <select
                        value={selectedCannedQuery}
                        onChange={(e) => handleCannedQuerySelect(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                    >
                        <option value="">-- Select a saved query or enter your own below --</option>
                        {CANNED_QUERIES.map(q => (
                            <option key={q.id} value={q.id}>{q.name}</option>
                        ))}
                    </select>
                </div>

                {/* Query Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        PubMed Query *
                    </label>
                    <textarea
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            // Clear canned selection if user edits manually
                            if (selectedCannedQuery) {
                                const selected = CANNED_QUERIES.find(q => q.id === selectedCannedQuery);
                                if (selected && e.target.value !== selected.query) {
                                    setSelectedCannedQuery('');
                                }
                            }
                        }}
                        placeholder="e.g., asbestos AND mesothelioma"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                        rows={3}
                    />
                </div>

                {/* PubMed IDs Input */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        PubMed IDs * <span className="text-xs text-gray-500 dark:text-gray-400">(one per line, or comma/space separated)</span>
                    </label>
                    <textarea
                        value={pubmedIds}
                        onChange={(e) => setPubmedIds(e.target.value)}
                        placeholder="12345678&#10;23456789&#10;34567890"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                        rows={8}
                    />
                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {pubmedIds.split(/[\n,\s]+/).filter(id => id.trim().length > 0).length} ID{pubmedIds.split(/[\n,\s]+/).filter(id => id.trim().length > 0).length !== 1 ? 's' : ''}
                    </p>
                </div>

                {/* Date Range (Optional) */}
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Start Date <span className="text-xs text-gray-500 dark:text-gray-400">(optional)</span>
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
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
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Date Type <span className="text-xs text-gray-500 dark:text-gray-400">(Publication Date matches pipeline reports)</span>
                        </label>
                        <select
                            value={dateType}
                            onChange={(e) => setDateType(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                        >
                            <option value="publication">Publication Date (DP) - default, matches reports</option>
                            <option value="entry">Entry Date (EDAT)</option>
                            <option value="pubmed">PubMed Date (PDAT)</option>
                            <option value="completion">Completion Date (DCOM)</option>
                        </select>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-3 pt-2">
                    <button
                        onClick={handleCheck}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        {loading ? (
                            <>
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                Checking...
                            </>
                        ) : (
                            <>
                                <MagnifyingGlassIcon className="h-5 w-5" />
                                Check IDs
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
                    {/* Summary */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Results Summary
                        </h3>
                        <div className="grid grid-cols-4 gap-4">
                            <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                                <div className="text-sm text-blue-600 dark:text-blue-400 mb-1">Total IDs</div>
                                <div className="text-2xl font-bold text-blue-900 dark:text-blue-100 mb-2">
                                    {results.total_ids}
                                </div>
                                <button
                                    onClick={() => handleCopyToClipboard('all')}
                                    className="flex items-center gap-1 text-xs text-blue-700 dark:text-blue-300 hover:underline"
                                    title="Copy all IDs (newline-separated)"
                                >
                                    {copiedType === 'all' ? (
                                        <>
                                            <CheckIcon className="h-4 w-4" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <ClipboardDocumentIcon className="h-4 w-4" />
                                            Copy IDs
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
                                <div className="text-sm text-green-600 dark:text-green-400 mb-1">Captured</div>
                                <div className="text-2xl font-bold text-green-900 dark:text-green-100 mb-2">
                                    {results.captured_count}
                                </div>
                                <button
                                    onClick={() => handleCopyToClipboard('captured')}
                                    className="flex items-center gap-1 text-xs text-green-700 dark:text-green-300 hover:underline"
                                    title="Copy captured IDs (newline-separated) - perfect for pasting into workbench"
                                >
                                    {copiedType === 'captured' ? (
                                        <>
                                            <CheckIcon className="h-4 w-4" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <ClipboardDocumentIcon className="h-4 w-4" />
                                            Copy IDs
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
                                <div className="text-sm text-red-600 dark:text-red-400 mb-1">Missed</div>
                                <div className="text-2xl font-bold text-red-900 dark:text-red-100 mb-2">
                                    {results.missed_count}
                                </div>
                                <button
                                    onClick={() => handleCopyToClipboard('missed')}
                                    className="flex items-center gap-1 text-xs text-red-700 dark:text-red-300 hover:underline"
                                    title="Copy missed IDs (newline-separated)"
                                >
                                    {copiedType === 'missed' ? (
                                        <>
                                            <CheckIcon className="h-4 w-4" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <ClipboardDocumentIcon className="h-4 w-4" />
                                            Copy IDs
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Query Results</div>
                                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                                    {results.query_total_results}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                    Total from query
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Results Table */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Detailed Results
                            </h3>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                <thead className="bg-gray-50 dark:bg-gray-900">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            PubMed ID
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Title
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Authors
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                            Year
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                    {results.results.map((result, idx) => (
                                        <tr
                                            key={idx}
                                            className={
                                                result.captured
                                                    ? 'bg-green-50 dark:bg-green-900/10'
                                                    : 'bg-red-50 dark:bg-red-900/10'
                                            }
                                        >
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                {result.captured ? (
                                                    <div className="flex items-center gap-2 text-green-700 dark:text-green-400">
                                                        <CheckCircleIcon className="h-5 w-5" />
                                                        <span className="text-sm font-medium">Captured</span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                                                        <XCircleIcon className="h-5 w-5" />
                                                        <span className="text-sm font-medium">Missed</span>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <a
                                                    href={`https://pubmed.ncbi.nlm.nih.gov/${result.pubmed_id}/`}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="text-blue-600 dark:text-blue-400 hover:underline font-mono text-sm"
                                                >
                                                    {result.pubmed_id}
                                                </a>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-900 dark:text-white max-w-md">
                                                    {result.article?.title || '-'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-600 dark:text-gray-400 max-w-xs">
                                                    {result.article?.authors?.slice(0, 3).join(', ') || '-'}
                                                    {result.article?.authors && result.article.authors.length > 3 && ', et al.'}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="text-sm text-gray-600 dark:text-gray-400">
                                                    {getYearString(result.article?.pub_year) || '-'}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
