import { useState } from 'react';
import { CheckIcon, XMarkIcon, FunnelIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { copyToClipboard } from '../../lib/utils/clipboard';

interface FilterSuggestionPayload {
    criteria: string;
    threshold: number;
    explanation: string;
    examples?: {
        would_pass?: string[];
        would_fail?: string[];
    };
    threshold_guidance?: string;
}

interface FilterSuggestionCardProps {
    proposal: FilterSuggestionPayload;
    onAccept?: (data: FilterSuggestionPayload) => void;
    onReject?: () => void;
    isProcessing?: boolean;
}

export default function FilterSuggestionCard({
    proposal,
    onAccept,
    onReject,
    isProcessing = false
}: FilterSuggestionCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [copied, setCopied] = useState(false);

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

    const handleCopy = async () => {
        const result = await copyToClipboard(proposal.criteria);
        if (result.success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const getThresholdLabel = (threshold: number): { label: string; color: string } => {
        if (threshold >= 0.9) {
            return { label: 'Strict', color: 'text-red-600 dark:text-red-400' };
        } else if (threshold >= 0.7) {
            return { label: 'Balanced', color: 'text-green-600 dark:text-green-400' };
        } else {
            return { label: 'Lenient', color: 'text-yellow-600 dark:text-yellow-400' };
        }
    };

    const thresholdInfo = getThresholdLabel(proposal.threshold);

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Filter criteria copied! Paste it into the filter step in the workbench.</span>
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
                <FunnelIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Semantic Filter Suggestion
                </span>
            </div>

            {/* Filter Criteria */}
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                    <h5 className="text-xs font-medium text-purple-800 dark:text-purple-200 uppercase tracking-wide">
                        Filter Criteria
                    </h5>
                    <button
                        type="button"
                        onClick={handleCopy}
                        className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-100 dark:bg-purple-800 hover:bg-purple-200 dark:hover:bg-purple-700 text-purple-700 dark:text-purple-200 rounded transition-colors"
                    >
                        <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                        {copied ? 'Copied!' : 'Copy'}
                    </button>
                </div>
                <div className="bg-white dark:bg-gray-900 rounded p-3 border border-purple-200 dark:border-purple-700">
                    <p className="text-sm text-purple-900 dark:text-purple-100">
                        {proposal.criteria}
                    </p>
                </div>
            </div>

            {/* Threshold */}
            <div className="flex items-center gap-4">
                <div className="flex-1">
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Recommended Threshold
                    </h5>
                    <div className="flex items-center gap-2">
                        <span className="text-2xl font-bold text-gray-900 dark:text-white">
                            {proposal.threshold}
                        </span>
                        <span className={`text-sm font-medium ${thresholdInfo.color}`}>
                            ({thresholdInfo.label})
                        </span>
                    </div>
                </div>
                <div className="flex-1">
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-gradient-to-r from-yellow-400 via-green-500 to-red-500"
                            style={{ width: `${proposal.threshold * 100}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                        <span>Lenient</span>
                        <span>Strict</span>
                    </div>
                </div>
            </div>

            {/* Explanation */}
            <div>
                <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
                    What This Filter Does
                </h5>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                    {proposal.explanation}
                </p>
            </div>

            {/* Examples */}
            {proposal.examples && (proposal.examples.would_pass?.length || proposal.examples.would_fail?.length) && (
                <div className="grid grid-cols-2 gap-4">
                    {/* Would Pass */}
                    {proposal.examples.would_pass && proposal.examples.would_pass.length > 0 && (
                        <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
                            <div className="flex items-center gap-1 mb-2">
                                <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                <h5 className="text-xs font-medium text-green-800 dark:text-green-200 uppercase tracking-wide">
                                    Would Pass
                                </h5>
                            </div>
                            <ul className="space-y-1">
                                {proposal.examples.would_pass.map((example, index) => (
                                    <li key={index} className="text-xs text-green-700 dark:text-green-300">
                                        {example}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Would Fail */}
                    {proposal.examples.would_fail && proposal.examples.would_fail.length > 0 && (
                        <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 border border-red-200 dark:border-red-800">
                            <div className="flex items-center gap-1 mb-2">
                                <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <h5 className="text-xs font-medium text-red-800 dark:text-red-200 uppercase tracking-wide">
                                    Would Fail
                                </h5>
                            </div>
                            <ul className="space-y-1">
                                {proposal.examples.would_fail.map((example, index) => (
                                    <li key={index} className="text-xs text-red-700 dark:text-red-300">
                                        {example}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Threshold Guidance */}
            {proposal.threshold_guidance && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                        Why This Threshold
                    </h5>
                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                        {proposal.threshold_guidance}
                    </p>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <ClipboardDocumentIcon className="h-4 w-4" />
                    Copy & Use Filter
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
