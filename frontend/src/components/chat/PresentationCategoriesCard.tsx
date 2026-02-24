import { useState } from 'react';
import { CheckIcon, XMarkIcon, SparklesIcon } from '@heroicons/react/24/solid';
import { Category } from '../../types';

interface PresentationCategoriesProposal {
    categories: Array<{
        id: string;
        name: string;
        topics: string[];
        specific_inclusions: string[];
    }>;
    reasoning: string;
}

interface PresentationCategoriesCardProps {
    proposal: PresentationCategoriesProposal;
    onAccept?: (proposal: PresentationCategoriesProposal) => void;
    onReject?: () => void;
    isProcessing?: boolean;
}

export default function PresentationCategoriesCard({
    proposal,
    onAccept,
    onReject,
    isProcessing = false
}: PresentationCategoriesCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);

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

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Categories accepted! Changes have been applied to the form.</span>
                </div>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Proposal rejected</span>
                </div>
            </div>
        );
    }

    return (
        <div>
            {/* Header */}
            <div className="mb-4 flex items-center gap-2">
                <SparklesIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                    Presentation Category Proposal
                </span>
            </div>

            {/* Reasoning */}
            {proposal.reasoning && (
                <div className="mb-6 pb-4 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-2">
                        Reasoning
                    </p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 italic">
                        {proposal.reasoning}
                    </p>
                </div>
            )}

            {/* Proposed Categories */}
            <div className="space-y-3 mb-6">
                <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Proposed Categories ({proposal.categories.length})
                </p>
                <div className="space-y-4">
                    {proposal.categories.map((category, idx) => (
                        <div
                            key={category.id || idx}
                            className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
                        >
                            {/* Category Name */}
                            <div className="mb-3">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {category.name}
                                </span>
                                <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                    (ID: {category.id})
                                </span>
                            </div>

                            {/* Topics */}
                            <div className="mb-3">
                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Topics:
                                </p>
                                <div className="flex flex-wrap gap-1.5">
                                    {category.topics.map((topicId, tIdx) => (
                                        <span
                                            key={tIdx}
                                            className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded text-xs"
                                        >
                                            {topicId}
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Specific Inclusions */}
                            {category.specific_inclusions && category.specific_inclusions.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Specific Inclusions:
                                    </p>
                                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-600 dark:text-gray-400">
                                        {category.specific_inclusions.map((inclusion, iIdx) => (
                                            <li key={iIdx}>{inclusion}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={handleAccept}
                    disabled={isProcessing}
                    className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                    <CheckIcon className="h-5 w-5" />
                    Accept Categories
                </button>
                <button
                    onClick={handleReject}
                    disabled={isProcessing}
                    className="flex-1 px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                    <XMarkIcon className="h-5 w-5" />
                    Reject
                </button>
            </div>
        </div>
    );
}
