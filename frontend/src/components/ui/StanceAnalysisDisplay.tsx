/**
 * Reusable component for displaying stance analysis results.
 * Used in ArticleViewerModal and StanceAnalysisPromptForm.
 */

import {
    ShieldCheckIcon,
    ExclamationTriangleIcon,
    ScaleIcon,
    CheckBadgeIcon,
} from '@heroicons/react/24/outline';
import { StanceAnalysisResult, StanceType } from '../../types/document_analysis';

interface StanceAnalysisDisplayProps {
    result: StanceAnalysisResult;
    /** Compact mode for smaller containers like test results panel */
    compact?: boolean;
}

/** Get display info for a stance type */
export function getStanceInfo(stance: StanceType) {
    switch (stance) {
        case 'pro-defense':
            return {
                label: 'Pro-Defense',
                color: 'text-blue-600 dark:text-blue-400',
                bgColor: 'bg-blue-100 dark:bg-blue-900/30',
                icon: ShieldCheckIcon,
            };
        case 'pro-plaintiff':
            return {
                label: 'Pro-Plaintiff',
                color: 'text-red-600 dark:text-red-400',
                bgColor: 'bg-red-100 dark:bg-red-900/30',
                icon: ExclamationTriangleIcon,
            };
        case 'neutral':
            return {
                label: 'Neutral',
                color: 'text-gray-600 dark:text-gray-400',
                bgColor: 'bg-gray-100 dark:bg-gray-700',
                icon: ScaleIcon,
            };
        case 'mixed':
            return {
                label: 'Mixed',
                color: 'text-amber-600 dark:text-amber-400',
                bgColor: 'bg-amber-100 dark:bg-amber-900/30',
                icon: ScaleIcon,
            };
        default:
            return {
                label: 'Unclear',
                color: 'text-gray-500 dark:text-gray-500',
                bgColor: 'bg-gray-100 dark:bg-gray-700',
                icon: ScaleIcon,
            };
    }
}

export default function StanceAnalysisDisplay({ result, compact = false }: StanceAnalysisDisplayProps) {
    const stanceInfo = getStanceInfo(result.stance);
    const StanceIcon = stanceInfo.icon;

    if (compact) {
        return (
            <div className="space-y-4">
                {/* Stance header - compact */}
                <div className={`p-4 rounded-lg ${stanceInfo.bgColor}`}>
                    <div className="flex items-center gap-3">
                        <StanceIcon className={`h-8 w-8 ${stanceInfo.color}`} />
                        <div>
                            <h3 className={`text-lg font-bold ${stanceInfo.color}`}>
                                {stanceInfo.label}
                            </h3>
                            <p className="text-xs text-gray-600 dark:text-gray-400">
                                Confidence: {Math.round(result.confidence * 100)}%
                            </p>
                        </div>
                    </div>
                </div>

                {/* Analysis explanation */}
                <div>
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                        Analysis
                    </h4>
                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                        {result.analysis}
                    </p>
                </div>

                {/* Key factors */}
                {result.key_factors.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                            Key Factors
                        </h4>
                        <ul className="space-y-1.5">
                            {result.key_factors.map((factor, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                    <CheckBadgeIcon className="h-4 w-4 text-green-500 flex-shrink-0 mt-0.5" />
                                    <span className="text-sm text-gray-700 dark:text-gray-300">{factor}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Relevant quotes */}
                {result.relevant_quotes.length > 0 && (
                    <div>
                        <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                            Relevant Quotes
                        </h4>
                        <div className="space-y-2">
                            {result.relevant_quotes.map((quote, idx) => (
                                <blockquote
                                    key={idx}
                                    className="border-l-3 border-gray-300 dark:border-gray-600 pl-3 italic text-sm text-gray-600 dark:text-gray-400"
                                >
                                    "{quote}"
                                </blockquote>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // Full size display (for ArticleViewerModal)
    return (
        <div className="space-y-6">
            {/* Stance header */}
            <div className={`p-6 rounded-lg ${stanceInfo.bgColor}`}>
                <div className="flex items-center gap-4">
                    <StanceIcon className={`h-12 w-12 ${stanceInfo.color}`} />
                    <div>
                        <h3 className={`text-2xl font-bold ${stanceInfo.color}`}>
                            {stanceInfo.label}
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                            Confidence: {Math.round(result.confidence * 100)}%
                        </p>
                    </div>
                </div>
            </div>

            {/* Analysis explanation */}
            <div>
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Analysis
                </h4>
                <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
                    {result.analysis}
                </p>
            </div>

            {/* Key factors */}
            {result.key_factors.length > 0 && (
                <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        Key Factors
                    </h4>
                    <ul className="space-y-2">
                        {result.key_factors.map((factor, idx) => (
                            <li key={idx} className="flex items-start gap-2">
                                <CheckBadgeIcon className="h-5 w-5 text-green-500 flex-shrink-0 mt-0.5" />
                                <span className="text-gray-700 dark:text-gray-300">{factor}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Relevant quotes */}
            {result.relevant_quotes.length > 0 && (
                <div>
                    <h4 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        Relevant Quotes
                    </h4>
                    <div className="space-y-3">
                        {result.relevant_quotes.map((quote, idx) => (
                            <blockquote
                                key={idx}
                                className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400"
                            >
                                "{quote}"
                            </blockquote>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
