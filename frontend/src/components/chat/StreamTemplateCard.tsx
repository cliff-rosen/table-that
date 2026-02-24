import { CheckIcon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/solid';

interface Topic {
    name: string;
    description: string;
    importance: 'high' | 'medium' | 'low';
}

interface Entity {
    name: string;
    type: 'company' | 'person' | 'product' | 'location' | 'other';
    description: string;
    importance: 'high' | 'medium' | 'low';
}

interface StreamTemplate {
    stream_name: string;
    domain: {
        name: string;
        description: string;
    };
    topics: Topic[];
    entities: Entity[];
    business_context: string;
    confidence: 'high' | 'medium' | 'low';
    reasoning: string;
}

interface StreamTemplateCardProps {
    payload: StreamTemplate;
    onAccept?: (data: StreamTemplate) => void;
    onReject?: () => void;
}

export default function StreamTemplateCard({ payload, onAccept, onReject }: StreamTemplateCardProps) {
    const handleAccept = () => {
        if (onAccept) {
            onAccept(payload);
        }
    };

    const confidenceColor =
        payload.confidence === 'high' ? 'text-green-600 dark:text-green-400' :
        payload.confidence === 'medium' ? 'text-yellow-600 dark:text-yellow-400' :
        'text-orange-600 dark:text-orange-400';

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
                    <SparklesIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    <h4 className="font-semibold text-gray-900 dark:text-white">
                        Complete Stream Template
                    </h4>
                    <span className={`text-sm font-semibold ${confidenceColor}`}>
                        ({payload.confidence} confidence)
                    </span>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    AI-generated research stream based on your description
                </p>
            </div>

            {/* Reasoning */}
            {payload.reasoning && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 uppercase tracking-wide mb-1">
                        Reasoning
                    </p>
                    <p className="text-sm text-blue-900 dark:text-blue-100 italic">
                        {payload.reasoning}
                    </p>
                </div>
            )}

            {/* Stream Name */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                    Stream Name
                </p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">
                    {payload.stream_name}
                </p>
            </div>

            {/* Domain */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                    Domain
                </p>
                <p className="font-semibold text-gray-900 dark:text-white mb-1">
                    {payload.domain.name}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {payload.domain.description}
                </p>
            </div>

            {/* Topics */}
            {payload.topics && payload.topics.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                        Topics ({payload.topics.length})
                    </p>
                    <div className="space-y-3">
                        {payload.topics.map((topic, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                                <div className="flex items-start justify-between mb-1">
                                    <p className="font-medium text-gray-900 dark:text-white">
                                        {topic.name}
                                    </p>
                                    <span className={`text-xs px-2 py-0.5 rounded ${importanceBadge(topic.importance)}`}>
                                        {topic.importance}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {topic.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Entities */}
            {payload.entities && payload.entities.length > 0 && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
                        Entities ({payload.entities.length})
                    </p>
                    <div className="space-y-3">
                        {payload.entities.map((entity, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-3">
                                <div className="flex items-start justify-between mb-1">
                                    <div>
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            {entity.name}
                                        </p>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                                            {entity.type}
                                        </p>
                                    </div>
                                    <span className={`text-xs px-2 py-0.5 rounded ${importanceBadge(entity.importance)}`}>
                                        {entity.importance}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    {entity.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Business Context */}
            {payload.business_context && (
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                        Business Context
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                        {payload.business_context}
                    </p>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                {onAccept && (
                    <button
                        onClick={handleAccept}
                        className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm"
                    >
                        <CheckIcon className="h-5 w-5" />
                        Apply Template
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
