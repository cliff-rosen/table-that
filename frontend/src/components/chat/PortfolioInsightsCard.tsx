import { ExclamationTriangleIcon, InformationCircleIcon, CheckCircleIcon } from '@heroicons/react/24/outline';

interface Insight {
    type: 'gap' | 'overlap' | 'optimization';
    title: string;
    description: string;
    severity: 'high' | 'medium' | 'low';
    recommendation?: string;
}

interface PortfolioSummary {
    total_streams: number;
    active_streams: number;
    coverage_areas: string[];
}

interface PortfolioInsightsPayload {
    summary: PortfolioSummary;
    insights: Insight[];
}

interface PortfolioInsightsCardProps {
    payload: PortfolioInsightsPayload;
    onReject?: () => void;
}

export default function PortfolioInsightsCard({ payload, onReject }: PortfolioInsightsCardProps) {
    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case 'high':
                return 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20';
            case 'medium':
                return 'border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20';
            case 'low':
                return 'border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20';
            default:
                return 'border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-gray-800';
        }
    };

    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'high':
                return <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400" />;
            case 'medium':
                return <InformationCircleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
            case 'low':
                return <CheckCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
            default:
                return null;
        }
    };

    const getTypeLabel = (type: string) => {
        switch (type) {
            case 'gap':
                return '🔍 Coverage Gap';
            case 'overlap':
                return '🔄 Overlap';
            case 'optimization':
                return '⚡ Optimization';
            default:
                return type;
        }
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div>
                <h4 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2 mb-2">
                    <span>📊</span>
                    Portfolio Analysis
                </h4>
            </div>

            {/* Summary Stats */}
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">
                            {payload.summary.total_streams}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Total Streams</p>
                    </div>
                    <div>
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                            {payload.summary.active_streams}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Active</p>
                    </div>
                </div>
                {payload.summary.coverage_areas && payload.summary.coverage_areas.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-800">
                        <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Coverage Areas:
                        </p>
                        <div className="flex flex-wrap gap-1">
                            {payload.summary.coverage_areas.map((area, idx) => (
                                <span
                                    key={idx}
                                    className="px-2 py-1 bg-white dark:bg-gray-800 text-blue-800 dark:text-blue-200 rounded text-xs border border-blue-200 dark:border-blue-700"
                                >
                                    {area}
                                </span>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Insights */}
            <div className="space-y-3">
                <h5 className="font-medium text-gray-900 dark:text-white text-sm">
                    Insights & Recommendations
                </h5>

                {payload.insights.map((insight, idx) => (
                    <div
                        key={idx}
                        className={`border rounded-lg p-4 ${getSeverityColor(insight.severity)}`}
                    >
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                                {getSeverityIcon(insight.severity)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                        {getTypeLabel(insight.type)}
                                    </span>
                                </div>
                                <h6 className="font-semibold text-gray-900 dark:text-white text-sm mb-1">
                                    {insight.title}
                                </h6>
                                <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                                    {insight.description}
                                </p>
                                {insight.recommendation && (
                                    <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                                        <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                            💡 Recommendation:
                                        </p>
                                        <p className="text-sm text-gray-700 dark:text-gray-300">
                                            {insight.recommendation}
                                        </p>
                                    </div>
                                )}
                            </div>
                        </div>
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
