import { useState } from 'react';
import { CheckIcon, XMarkIcon, TableCellsIcon } from '@heroicons/react/24/solid';
import { SparklesIcon } from '@heroicons/react/24/outline';

interface AIColumnSuggestionPayload {
    name: string;
    criteria: string;
    type: 'boolean' | 'text';
    explanation?: string;
}

interface AIColumnCardProps {
    suggestion: AIColumnSuggestionPayload;
    onAccept?: (data: AIColumnSuggestionPayload) => void;
    onReject?: () => void;
    isProcessing?: boolean;
}

export default function AIColumnCard({
    suggestion,
    onAccept,
    onReject,
    isProcessing = false
}: AIColumnCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);

    const handleAccept = () => {
        setIsAccepted(true);
        if (onAccept) {
            onAccept(suggestion);
        }
    };

    const handleReject = () => {
        setIsRejected(true);
        if (onReject) {
            onReject();
        }
    };

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">AI column "{suggestion.name}" is being created!</span>
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
                <TableCellsIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                    AI Column Suggestion
                </span>
            </div>

            {/* Column Details */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                    <SparklesIcon className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <h5 className="text-sm font-medium text-purple-800 dark:text-purple-200">
                        {suggestion.name}
                    </h5>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                        suggestion.type === 'boolean'
                            ? 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                            : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                    }`}>
                        {suggestion.type === 'boolean' ? 'Yes/No' : 'Text'}
                    </span>
                </div>

                {/* Criteria */}
                <div className="mb-3">
                    <h6 className="text-xs font-medium text-purple-700 dark:text-purple-300 uppercase tracking-wide mb-1">
                        Criteria
                    </h6>
                    <div className="bg-white dark:bg-gray-900 rounded p-3 border border-purple-200 dark:border-purple-700">
                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                            {suggestion.criteria}
                        </p>
                    </div>
                </div>
            </div>

            {/* Explanation */}
            {suggestion.explanation && (
                <div>
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                        How to Use
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                        {suggestion.explanation}
                    </p>
                </div>
            )}

            {/* Type info */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                <p className="text-xs text-gray-600 dark:text-gray-400">
                    {suggestion.type === 'boolean'
                        ? 'This column will show Yes/No values. You can use the filter button to quickly show only matching results.'
                        : 'This column will extract text for each item. Useful for summarizing or categorizing.'}
                </p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <CheckIcon className="h-4 w-4" />
                    Add Column
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
