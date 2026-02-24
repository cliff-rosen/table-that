import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon, InformationCircleIcon } from '@heroicons/react/24/solid';

interface ValidationIssue {
    field: string;
    severity: 'error' | 'warning' | 'suggestion';
    message: string;
    suggestion: string;
}

interface ValidationFeedbackPayload {
    issues: ValidationIssue[];
    strengths: string[];
    overall_assessment: string;
}

interface ValidationFeedbackCardProps {
    payload: ValidationFeedbackPayload;
    onReject?: () => void;
}

export default function ValidationFeedbackCard({ payload, onReject }: ValidationFeedbackCardProps) {
    const severityConfig = {
        error: {
            icon: ExclamationTriangleIcon,
            color: 'text-red-600 dark:text-red-400',
            bgColor: 'bg-red-50 dark:bg-red-900/20',
            borderColor: 'border-red-200 dark:border-red-800',
            label: 'Error'
        },
        warning: {
            icon: ExclamationTriangleIcon,
            color: 'text-yellow-600 dark:text-yellow-400',
            bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
            borderColor: 'border-yellow-200 dark:border-yellow-800',
            label: 'Warning'
        },
        suggestion: {
            icon: InformationCircleIcon,
            color: 'text-blue-600 dark:text-blue-400',
            bgColor: 'bg-blue-50 dark:bg-blue-900/20',
            borderColor: 'border-blue-200 dark:border-blue-800',
            label: 'Suggestion'
        }
    };

    const formatFieldName = (fieldPath: string): string => {
        const parts = fieldPath.split('.');
        const lastPart = parts[parts.length - 1];
        return lastPart
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h4 className="font-semibold text-gray-900 dark:text-white mb-2">
                    Validation Feedback
                </h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Review of your current stream configuration
                </p>
            </div>

            {/* Overall Assessment */}
            {payload.overall_assessment && (
                <div className="bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                        Overall Assessment
                    </p>
                    <p className="text-sm text-gray-900 dark:text-white">
                        {payload.overall_assessment}
                    </p>
                </div>
            )}

            {/* Strengths */}
            {payload.strengths && payload.strengths.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-3">
                        <CheckCircleIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                        <p className="text-xs font-semibold text-green-700 dark:text-green-300 uppercase tracking-wide">
                            Strengths
                        </p>
                    </div>
                    <ul className="space-y-2">
                        {payload.strengths.map((strength, idx) => (
                            <li key={idx} className="text-sm text-green-900 dark:text-green-100 flex items-start gap-2">
                                <span className="text-green-600 dark:text-green-400 mt-0.5">✓</span>
                                <span>{strength}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Issues */}
            {payload.issues && payload.issues.length > 0 && (
                <div className="space-y-3">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Issues & Suggestions
                    </p>
                    {payload.issues.map((issue, idx) => {
                        const config = severityConfig[issue.severity];
                        const Icon = config.icon;

                        return (
                            <div key={idx} className={`${config.bgColor} border ${config.borderColor} rounded-lg p-4`}>
                                <div className="flex items-start gap-3">
                                    <Icon className={`h-5 w-5 ${config.color} flex-shrink-0 mt-0.5`} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className={`text-xs font-semibold ${config.color} uppercase tracking-wide`}>
                                                {config.label}
                                            </span>
                                            <span className="text-xs text-gray-600 dark:text-gray-400">
                                                • {formatFieldName(issue.field)}
                                            </span>
                                        </div>
                                        <p className={`text-sm ${config.color} font-medium mb-2`}>
                                            {issue.message}
                                        </p>
                                        <div className="bg-white dark:bg-gray-800 rounded p-3">
                                            <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                                Recommendation:
                                            </p>
                                            <p className="text-sm text-gray-900 dark:text-white">
                                                {issue.suggestion}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
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
