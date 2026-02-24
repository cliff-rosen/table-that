import { useState } from 'react';
import { CheckIcon, XMarkIcon, MagnifyingGlassIcon, ClipboardDocumentIcon, ChevronDownIcon, CalendarIcon } from '@heroicons/react/24/solid';
import { LightBulbIcon } from '@heroicons/react/24/outline';
import { copyToClipboard } from '../../lib/utils/clipboard';

interface QueryAlternative {
    query_expression: string;
    trade_off: string;
}

interface QuerySuggestionPayload {
    query_expression: string;
    explanation: string;
    syntax_notes?: string[];
    expected_results?: string;
    alternatives?: QueryAlternative[];
    // Date filtering (separate from query_expression)
    start_date?: string | null;
    end_date?: string | null;
    date_type?: 'publication' | 'entry';
}

interface QuerySuggestionCardProps {
    proposal: QuerySuggestionPayload;
    onAccept?: (data: QuerySuggestionPayload) => void;
    onReject?: () => void;
    isProcessing?: boolean;
}

export default function QuerySuggestionCard({
    proposal,
    onAccept,
    onReject,
    isProcessing = false
}: QuerySuggestionCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [copiedMain, setCopiedMain] = useState(false);
    const [copiedAlt, setCopiedAlt] = useState<number | null>(null);
    const [showAlternatives, setShowAlternatives] = useState(false);

    const handleAccept = () => {
        setIsAccepted(true);
        if (onAccept) {
            onAccept(proposal);
        }
    };

    const handleReject = () => {
        setIsRejected(true);
        if (onReject) {
            onReject();
        }
    };

    const handleCopy = async (text: string, isAlt: boolean = false, altIndex?: number) => {
        const result = await copyToClipboard(text);
        if (result.success) {
            if (isAlt && altIndex !== undefined) {
                setCopiedAlt(altIndex);
                setTimeout(() => setCopiedAlt(null), 2000);
            } else {
                setCopiedMain(true);
                setTimeout(() => setCopiedMain(false), 2000);
            }
        }
    };

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Query applied to the workbench!</span>
                </div>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Suggestion dismissed</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
                <MagnifyingGlassIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                    PubMed Query Suggestion
                </span>
            </div>

            {/* Main Query */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="text-xs font-medium text-blue-800 dark:text-blue-200 uppercase tracking-wide">
                        Suggested Query
                    </h5>
                    <button
                        type="button"
                        onClick={() => handleCopy(proposal.query_expression)}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-800 hover:bg-blue-200 dark:hover:bg-blue-700 text-blue-700 dark:text-blue-200 rounded transition-colors"
                    >
                        <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                        {copiedMain ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded p-3 border border-blue-200 dark:border-blue-700">
                    <code className="text-sm text-blue-900 dark:text-blue-100 break-all">
                        {proposal.query_expression}
                    </code>
                </div>
            </div>

            {/* Date Filters (if specified) */}
            {(proposal.start_date || proposal.end_date) && (
                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <CalendarIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                        <h5 className="text-xs font-medium text-purple-800 dark:text-purple-200 uppercase tracking-wide">
                            Date Filter
                        </h5>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm text-purple-900 dark:text-purple-100">
                        {proposal.start_date && (
                            <span>From: <strong>{proposal.start_date}</strong></span>
                        )}
                        {proposal.end_date && (
                            <span>To: <strong>{proposal.end_date}</strong></span>
                        )}
                        {proposal.date_type && (
                            <span className="text-purple-600 dark:text-purple-400">
                                ({proposal.date_type === 'publication' ? 'Publication date' : 'Entry date'})
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Explanation */}
            <div>
                <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    What This Query Does
                </h5>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    {proposal.explanation}
                </p>
            </div>

            {/* Syntax Notes */}
            {proposal.syntax_notes && proposal.syntax_notes.length > 0 && (
                <div>
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        Syntax Notes
                    </h5>
                    <ul className="space-y-1">
                        {proposal.syntax_notes.map((note, index) => (
                            <li key={index} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400">
                                <LightBulbIcon className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                                {note}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Expected Results */}
            {proposal.expected_results && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Expected Results
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        {proposal.expected_results}
                    </p>
                </div>
            )}

            {/* Alternatives */}
            {proposal.alternatives && proposal.alternatives.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                    <button
                        type="button"
                        onClick={() => setShowAlternatives(!showAlternatives)}
                        className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Alternative Queries ({proposal.alternatives.length})
                        </span>
                        <ChevronDownIcon
                            className={`h-4 w-4 text-gray-500 transition-transform ${showAlternatives ? 'rotate-180' : ''}`}
                        />
                    </button>

                    {showAlternatives && (
                        <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                            {proposal.alternatives.map((alt, index) => (
                                <div key={index} className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Alternative {index + 1}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(alt.query_expression, true, index)}
                                            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                        >
                                            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                            {copiedAlt === index ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                                        <code className="text-xs text-gray-800 dark:text-gray-200 break-all">
                                            {alt.query_expression}
                                        </code>
                                    </div>
                                    <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                        Trade-off: {alt.trade_off}
                                    </p>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <CheckIcon className="h-4 w-4" />
                    Use This Query
                </button>
                <button
                    type="button"
                    onClick={handleReject}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <XMarkIcon className="h-4 w-4" />
                    Dismiss
                </button>
            </div>
        </div>
    );
}
