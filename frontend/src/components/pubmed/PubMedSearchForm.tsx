import { useRef, useEffect } from 'react';
import {
    PlayIcon,
    TrashIcon,
    QuestionMarkCircleIcon
} from '@heroicons/react/24/outline';
import { trackEvent } from '../../lib/api/trackingApi';

export interface PubMedSearchFormProps {
    // Form values
    query: string;
    startDate: string;
    endDate: string;
    dateType: 'publication' | 'entry';

    // Change handlers
    onQueryChange: (query: string) => void;
    onStartDateChange: (date: string) => void;
    onEndDateChange: (date: string) => void;
    onDateTypeChange: (type: 'publication' | 'entry') => void;

    // Actions
    onSearch: () => void;
    onClear: () => void;
    onHelpClick: () => void;

    // State
    loading: boolean;
    showClearButton: boolean;
    error?: string | null;
}

export default function PubMedSearchForm({
    query,
    startDate,
    endDate,
    dateType,
    onQueryChange,
    onStartDateChange,
    onEndDateChange,
    onDateTypeChange,
    onSearch,
    onClear,
    onHelpClick,
    loading,
    showClearButton,
    error
}: PubMedSearchFormProps) {
    const queryTextareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea when query changes (including programmatic changes)
    useEffect(() => {
        if (queryTextareaRef.current) {
            queryTextareaRef.current.style.height = 'auto';
            queryTextareaRef.current.style.height = queryTextareaRef.current.scrollHeight + 'px';
        }
    }, [query]);

    const handleQueryChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        onQueryChange(e.target.value);
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSearch();
        }
    };

    const setDatePreset = (preset: 'week' | 'month') => {
        const today = new Date();
        const pastDate = new Date(today);

        if (preset === 'week') {
            pastDate.setDate(today.getDate() - 7);
        } else {
            pastDate.setMonth(today.getMonth() - 1);
        }

        onStartDateChange(pastDate.toISOString().split('T')[0]);
        onEndDateChange(today.toISOString().split('T')[0]);
        trackEvent('pubmed_date_preset', { preset: preset === 'week' ? 'last_week' : 'last_month' });
    };

    const clearDates = () => {
        onStartDateChange('');
        onEndDateChange('');
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                    Search PubMed
                </h3>
                <button
                    onClick={onHelpClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                >
                    <QuestionMarkCircleIcon className="h-5 w-5" />
                    Help
                </button>
            </div>

            <div className="space-y-4">
                {/* Query - full width, auto-expanding */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Query
                    </label>
                    <textarea
                        ref={queryTextareaRef}
                        value={query}
                        onChange={handleQueryChange}
                        onKeyDown={handleKeyDown}
                        placeholder="e.g., diabetes treatment"
                        rows={1}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 resize-none overflow-hidden"
                    />
                </div>

                {/* Date filters and search button row */}
                <div className="flex items-end gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => onStartDateChange(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => onEndDateChange(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Date Type
                        </label>
                        <select
                            value={dateType}
                            onChange={(e) => onDateTypeChange(e.target.value as 'publication' | 'entry')}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="publication">Publication</option>
                            <option value="entry">Entry</option>
                        </select>
                    </div>

                    {/* Date preset buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setDatePreset('week')}
                            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Last Week
                        </button>
                        <button
                            type="button"
                            onClick={() => setDatePreset('month')}
                            className="px-2 py-1 text-xs text-gray-600 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Last Month
                        </button>
                        {(startDate || endDate) && (
                            <button
                                type="button"
                                onClick={clearDates}
                                className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                            >
                                Clear dates
                            </button>
                        )}
                    </div>

                    {/* Spacer to push buttons right */}
                    <div className="flex-1 min-w-[20px]" />

                    {/* Search + Clear buttons grouped together */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                        <button
                            onClick={onSearch}
                            disabled={loading || !query.trim()}
                            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <PlayIcon className="h-4 w-4" />
                                    Search
                                </>
                            )}
                        </button>
                        {showClearButton && (
                            <button
                                onClick={onClear}
                                disabled={loading}
                                className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 rounded-md hover:border-red-300 dark:hover:border-red-600 flex items-center gap-1.5"
                                title="Clear search, results, and history"
                            >
                                <TrashIcon className="h-4 w-4" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}
