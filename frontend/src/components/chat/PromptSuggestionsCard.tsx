import { useState } from 'react';
import { CheckIcon, XMarkIcon, SparklesIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { copyToClipboard } from '../../lib/utils/clipboard';

interface PromptSuggestion {
    target: 'system_prompt' | 'user_prompt_template';
    current_issue: string;
    suggested_text: string;
    reasoning: string;
}

interface PromptSuggestionsPayload {
    prompt_type: 'executive_summary' | 'category_summary';
    suggestions: PromptSuggestion[];
    general_advice?: string;
}

interface PromptSuggestionsCardProps {
    proposal: PromptSuggestionsPayload;
    onAccept?: (data: PromptSuggestionsPayload) => void;
    onReject?: () => void;
    isProcessing?: boolean;
}

export default function PromptSuggestionsCard({
    proposal,
    onAccept,
    onReject,
    isProcessing = false
}: PromptSuggestionsCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [expandedSuggestions, setExpandedSuggestions] = useState<Set<number>>(new Set([0])); // First one expanded by default
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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

    const toggleSuggestion = (index: number) => {
        setExpandedSuggestions(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const handleCopy = async (text: string, index: number) => {
        const result = await copyToClipboard(text);
        if (result.success) {
            setCopiedIndex(index);
            setTimeout(() => setCopiedIndex(null), 2000);
        }
    };

    const formatTargetName = (target: string): string => {
        return target === 'system_prompt' ? 'System Prompt' : 'User Prompt Template';
    };

    const formatPromptType = (type: string): string => {
        return type === 'executive_summary' ? 'Executive Summary' : 'Category Summary';
    };

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Suggestions accepted! You can now copy the suggested text to your prompts.</span>
                </div>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Suggestions dismissed</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
                <SparklesIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Suggestions for {formatPromptType(proposal.prompt_type)}
                </span>
            </div>

            {/* General Advice */}
            {proposal.general_advice && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        {proposal.general_advice}
                    </p>
                </div>
            )}

            {/* Suggestions */}
            <div className="space-y-3">
                {proposal.suggestions.map((suggestion, index) => (
                    <div
                        key={index}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                    >
                        {/* Suggestion Header */}
                        <button
                            type="button"
                            onClick={() => toggleSuggestion(index)}
                            className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-medium px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                                    {formatTargetName(suggestion.target)}
                                </span>
                                <span className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                                    {suggestion.current_issue}
                                </span>
                            </div>
                            <ChevronDownIcon
                                className={`h-4 w-4 text-gray-500 transition-transform ${expandedSuggestions.has(index) ? 'rotate-180' : ''}`}
                            />
                        </button>

                        {/* Expanded Content */}
                        {expandedSuggestions.has(index) && (
                            <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                                {/* Issue */}
                                <div>
                                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                        Current Issue
                                    </h5>
                                    <p className="text-sm text-gray-900 dark:text-gray-100">
                                        {suggestion.current_issue}
                                    </p>
                                </div>

                                {/* Reasoning */}
                                <div>
                                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                        Why This Change Helps
                                    </h5>
                                    <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                                        {suggestion.reasoning}
                                    </p>
                                </div>

                                {/* Suggested Text */}
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Suggested Text
                                        </h5>
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(suggestion.suggested_text, index)}
                                            className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                        >
                                            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                            {copiedIndex === index ? 'Copied!' : 'Copy'}
                                        </button>
                                    </div>
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 border border-gray-200 dark:border-gray-700 max-h-[300px] overflow-y-auto">
                                        <pre className="text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-mono">
                                            {suggestion.suggested_text}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
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
                    Use These Suggestions
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
