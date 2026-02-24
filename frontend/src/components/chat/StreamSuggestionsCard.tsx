import { useNavigate } from 'react-router-dom';
import { LightBulbIcon, ArrowRightIcon } from '@heroicons/react/24/outline';

interface StreamSuggestion {
    suggested_name: string;
    rationale: string;
    domain: string;
    key_topics: string[];
    business_value: string;
    confidence: string;
}

interface StreamSuggestionsPayload {
    suggestions: StreamSuggestion[];
    reasoning: string;
}

interface StreamSuggestionsCardProps {
    payload: StreamSuggestionsPayload;
    onAccept?: (suggestion: StreamSuggestion) => void;
    onReject?: () => void;
}

export default function StreamSuggestionsCard({ payload, onAccept, onReject }: StreamSuggestionsCardProps) {
    const navigate = useNavigate();

    const handleCreateStream = (suggestion: StreamSuggestion) => {
        // Navigate to new stream page with pre-filled data
        navigate('/new-stream', {
            state: {
                suggestedName: suggestion.suggested_name,
                suggestedDomain: suggestion.domain,
                suggestedTopics: suggestion.key_topics,
                rationale: suggestion.rationale
            }
        });
        if (onAccept) {
            onAccept(suggestion);
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
                <LightBulbIcon className="h-6 w-6 text-yellow-500 flex-shrink-0 mt-1" />
                <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Suggested Research Streams
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {payload.reasoning}
                    </p>
                </div>
            </div>

            {/* Suggestions */}
            <div className="space-y-3">
                {payload.suggestions.map((suggestion, idx) => (
                    <div
                        key={idx}
                        className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1">
                                <h5 className="font-semibold text-gray-900 dark:text-white mb-1">
                                    {suggestion.suggested_name}
                                </h5>
                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                    {suggestion.rationale}
                                </p>
                            </div>
                            <span
                                className={`px-2 py-1 text-xs rounded-full flex-shrink-0 ${
                                    suggestion.confidence === 'high'
                                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                                        : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                                }`}
                            >
                                {suggestion.confidence} confidence
                            </span>
                        </div>

                        <div className="space-y-2 mb-3">
                            <div className="flex items-start gap-2 text-sm">
                                <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
                                    Domain:
                                </span>
                                <span className="text-gray-600 dark:text-gray-400">
                                    {suggestion.domain}
                                </span>
                            </div>
                            <div className="flex items-start gap-2 text-sm">
                                <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
                                    Key Topics:
                                </span>
                                <div className="flex flex-wrap gap-1">
                                    {suggestion.key_topics.map((topic, topicIdx) => (
                                        <span
                                            key={topicIdx}
                                            className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-xs"
                                        >
                                            {topic}
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="flex items-start gap-2 text-sm">
                                <span className="font-medium text-gray-700 dark:text-gray-300 min-w-[100px]">
                                    Business Value:
                                </span>
                                <span className="text-gray-600 dark:text-gray-400">
                                    {suggestion.business_value}
                                </span>
                            </div>
                        </div>

                        <button
                            onClick={() => handleCreateStream(suggestion)}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                            Create This Stream
                            <ArrowRightIcon className="h-4 w-4" />
                        </button>
                    </div>
                ))}
            </div>

            {/* Dismiss button */}
            {onReject && (
                <button
                    onClick={onReject}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-sm"
                >
                    Dismiss
                </button>
            )}
        </div>
    );
}
