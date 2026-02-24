import { useNavigate } from 'react-router-dom';
import { RocketLaunchIcon, CheckIcon } from '@heroicons/react/24/outline';

interface SuggestedTopic {
    topic_id: string;
    name: string;
    description: string;
    importance: string;
}

interface Domain {
    name: string;
    description: string;
}

interface QuickSetupPayload {
    stream_name: string;
    purpose: string;
    domain: Domain;
    suggested_topics: SuggestedTopic[];
    reasoning: string;
}

interface QuickSetupCardProps {
    payload: QuickSetupPayload;
    onAccept?: (setup: QuickSetupPayload) => void;
    onReject?: () => void;
}

export default function QuickSetupCard({ payload, onAccept, onReject }: QuickSetupCardProps) {
    const navigate = useNavigate();

    const handleUseSetup = () => {
        // Navigate to new stream page with pre-filled configuration
        navigate('/new-stream', {
            state: {
                quickSetup: payload
            }
        });
        if (onAccept) {
            onAccept(payload);
        }
    };

    const getImportanceBadge = (importance: string) => {
        switch (importance) {
            case 'critical':
                return 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200';
            case 'important':
                return 'bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200';
            case 'relevant':
                return 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';
            default:
                return 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200';
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-start gap-3">
                <RocketLaunchIcon className="h-6 w-6 text-purple-500 flex-shrink-0 mt-1" />
                <div>
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Quick Setup Ready
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {payload.reasoning}
                    </p>
                </div>
            </div>

            {/* Configuration Preview */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 space-y-4">
                {/* Stream Name */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        Stream Name
                    </label>
                    <p className="text-lg font-semibold text-gray-900 dark:text-white mt-1">
                        {payload.stream_name}
                    </p>
                </div>

                {/* Purpose */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        Purpose
                    </label>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
                        {payload.purpose}
                    </p>
                </div>

                {/* Domain */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide">
                        Domain
                    </label>
                    <p className="text-sm font-medium text-gray-900 dark:text-white mt-1">
                        {payload.domain.name}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                        {payload.domain.description}
                    </p>
                </div>

                {/* Topics */}
                <div>
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400 uppercase tracking-wide mb-2 block">
                        Suggested Topics ({payload.suggested_topics.length})
                    </label>
                    <div className="space-y-2">
                        {payload.suggested_topics.map((topic, idx) => (
                            <div
                                key={idx}
                                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3"
                            >
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2">
                                        <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                                            {topic.name}
                                        </span>
                                    </div>
                                    <span className={`px-2 py-0.5 text-xs rounded-full flex-shrink-0 ${getImportanceBadge(topic.importance)}`}>
                                        {topic.importance}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-600 dark:text-gray-400 ml-6">
                                    {topic.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
                <button
                    onClick={handleUseSetup}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium"
                >
                    <RocketLaunchIcon className="h-5 w-5" />
                    Use This Setup
                </button>
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
