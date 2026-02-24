import { CheckIcon, XMarkIcon, LightBulbIcon } from '@heroicons/react/24/solid';

interface TopicSuggestion {
    name: string;
    description: string;
    importance: 'high' | 'medium' | 'low';
    rationale: string;
}

interface TopicSuggestionsPayload {
    suggestions: TopicSuggestion[];
    based_on: string;
}

interface TopicSuggestionsCardProps {
    payload: TopicSuggestionsPayload;
    onAccept?: (data: TopicSuggestionsPayload) => void;
    onReject?: () => void;
}

export default function TopicSuggestionsCard({ payload, onAccept, onReject }: TopicSuggestionsCardProps) {
    const handleAccept = () => {
        if (onAccept) {
            onAccept(payload);
        }
    };

    const importanceBadge = (importance: string) => {
        const colors = {
            high: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
            medium: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
            low: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
        };
        return colors[importance as keyof typeof colors] || colors.low;
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <LightBulbIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Topic Suggestions
                    </h4>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Recommended topics for your research stream
                </p>
            </div>

            {/* Based On */}
            {payload.based_on && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
                        Based On
                    </p>
                    <p className="text-sm text-blue-900 dark:text-blue-100">
                        {payload.based_on}
                    </p>
                </div>
            )}

            {/* Suggestions */}
            <div className="space-y-3">
                {payload.suggestions.map((suggestion, idx) => (
                    <div key={idx} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                            <p className="font-semibold text-gray-900 dark:text-white">
                                {suggestion.name}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded whitespace-nowrap ${importanceBadge(suggestion.importance)}`}>
                                {suggestion.importance}
                            </span>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                            {suggestion.description}
                        </p>
                        <div className="bg-gray-50 dark:bg-gray-900/50 rounded p-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                <span className="font-medium">Why: </span>
                                {suggestion.rationale}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                {onAccept && (
                    <button
                        onClick={handleAccept}
                        className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <CheckIcon className="h-5 w-5" />
                        Add Topics
                    </button>
                )}
                {onReject && (
                    <button
                        onClick={onReject}
                        className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <XMarkIcon className="h-5 w-5" />
                        Dismiss
                    </button>
                )}
            </div>
        </div>
    );
}
