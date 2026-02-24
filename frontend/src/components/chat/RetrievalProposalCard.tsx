import { useState } from 'react';
import { CheckIcon, XMarkIcon, MagnifyingGlassIcon, FunnelIcon, ClipboardDocumentIcon } from '@heroicons/react/24/solid';
import { ChevronDownIcon } from '@heroicons/react/24/outline';
import { copyToClipboard } from '../../lib/utils/clipboard';

interface QueryProposal {
    query_id: string;
    name: string;
    query_string: string;
    covered_topics: string[];
    rationale?: string;
}

interface FilterProposal {
    target_id: string;
    semantic_filter: {
        enabled: boolean;
        criteria: string;
        threshold: number;
    };
}

interface RetrievalProposalPayload {
    update_type: 'queries_only' | 'filters_only' | 'both';
    target_ids?: string[];
    queries?: QueryProposal[];
    filters?: FilterProposal[];
    changes_summary?: string;
    reasoning?: string;
}

interface RetrievalProposalCardProps {
    proposal: RetrievalProposalPayload;
    onAccept?: (data: RetrievalProposalPayload) => void;
    onReject?: () => void;
    isProcessing?: boolean;
}

export default function RetrievalProposalCard({
    proposal,
    onAccept,
    onReject,
    isProcessing = false
}: RetrievalProposalCardProps) {
    const [isAccepted, setIsAccepted] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
    const [copiedId, setCopiedId] = useState<string | null>(null);

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

    const toggleItem = (id: string) => {
        setExpandedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    const handleCopy = async (text: string, id: string) => {
        const result = await copyToClipboard(text);
        if (result.success) {
            setCopiedId(id);
            setTimeout(() => setCopiedId(null), 2000);
        }
    };

    const getUpdateTypeLabel = () => {
        switch (proposal.update_type) {
            case 'queries_only': return 'Query Updates';
            case 'filters_only': return 'Filter Updates';
            case 'both': return 'Query & Filter Updates';
            default: return 'Updates';
        }
    };

    const getUpdateTypeIcon = () => {
        switch (proposal.update_type) {
            case 'queries_only': return <MagnifyingGlassIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
            case 'filters_only': return <FunnelIcon className="h-5 w-5 text-purple-600 dark:text-purple-400" />;
            case 'both': return <MagnifyingGlassIcon className="h-5 w-5 text-green-600 dark:text-green-400" />;
            default: return <MagnifyingGlassIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />;
        }
    };

    if (isAccepted) {
        return (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 text-green-800 dark:text-green-200">
                    <CheckIcon className="h-5 w-5" />
                    <span className="font-medium">Proposal accepted! Changes have been applied to the form.</span>
                </div>
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Proposal dismissed</span>
                </div>
            </div>
        );
    }

    const hasQueries = proposal.queries && proposal.queries.length > 0;
    const hasFilters = proposal.filters && proposal.filters.length > 0;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-2 pb-3 border-b border-gray-200 dark:border-gray-700">
                {getUpdateTypeIcon()}
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {getUpdateTypeLabel()}
                </span>
                <div className="flex gap-1">
                    {hasQueries && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded">
                            {proposal.queries!.length} {proposal.queries!.length === 1 ? 'query' : 'queries'}
                        </span>
                    )}
                    {hasFilters && (
                        <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded">
                            {proposal.filters!.length} {proposal.filters!.length === 1 ? 'filter' : 'filters'}
                        </span>
                    )}
                </div>
            </div>

            {/* Changes Summary */}
            {proposal.changes_summary && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                    <p className="text-sm text-yellow-800 dark:text-yellow-200">
                        <strong>Changes:</strong> {proposal.changes_summary}
                    </p>
                </div>
            )}

            {/* Reasoning */}
            {proposal.reasoning && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <p className="text-sm text-blue-800 dark:text-blue-200">
                        {proposal.reasoning}
                    </p>
                </div>
            )}

            {/* Query Proposals */}
            {hasQueries && (
                <div className="space-y-2">
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <MagnifyingGlassIcon className="h-3.5 w-3.5" />
                        Search Queries
                    </h5>

                    {proposal.queries!.map((query) => (
                        <div
                            key={query.query_id}
                            className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                        >
                            <button
                                type="button"
                                onClick={() => toggleItem(`q-${query.query_id}`)}
                                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-800 flex items-center justify-between text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-mono">
                                            {query.query_id}
                                        </span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {query.name}
                                        </span>
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
                                        Covers: {query.covered_topics.join(', ')}
                                    </div>
                                </div>
                                <ChevronDownIcon
                                    className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ml-2 ${expandedItems.has(`q-${query.query_id}`) ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {expandedItems.has(`q-${query.query_id}`) && (
                                <div className="p-4 space-y-3 border-t border-gray-200 dark:border-gray-700">
                                    <div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Query String</span>
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(query.query_string, query.query_id)}
                                                className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded transition-colors"
                                            >
                                                <ClipboardDocumentIcon className="h-3 w-3" />
                                                {copiedId === query.query_id ? 'Copied!' : 'Copy'}
                                            </button>
                                        </div>
                                        <div className="bg-gray-100 dark:bg-gray-900 rounded p-2 font-mono text-xs text-gray-800 dark:text-gray-200 break-all">
                                            {query.query_string}
                                        </div>
                                    </div>
                                    {query.rationale && (
                                        <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                            {query.rationale}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Filter Proposals */}
            {hasFilters && (
                <div className="space-y-2">
                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide flex items-center gap-1">
                        <FunnelIcon className="h-3.5 w-3.5" />
                        Semantic Filters
                    </h5>

                    {proposal.filters!.map((filter) => (
                        <div
                            key={filter.target_id}
                            className="border border-purple-200 dark:border-purple-800 rounded-lg overflow-hidden"
                        >
                            <button
                                type="button"
                                onClick={() => toggleItem(`f-${filter.target_id}`)}
                                className="w-full px-4 py-3 bg-purple-50 dark:bg-purple-900/20 flex items-center justify-between text-left hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                            >
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 rounded font-mono">
                                            {filter.target_id}
                                        </span>
                                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                                            {filter.semantic_filter.enabled ? 'Filter Enabled' : 'Filter Disabled'}
                                        </span>
                                        <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded">
                                            threshold: {filter.semantic_filter.threshold}
                                        </span>
                                    </div>
                                </div>
                                <ChevronDownIcon
                                    className={`h-4 w-4 text-gray-500 transition-transform flex-shrink-0 ml-2 ${expandedItems.has(`f-${filter.target_id}`) ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {expandedItems.has(`f-${filter.target_id}`) && (
                                <div className="p-4 space-y-3 border-t border-purple-200 dark:border-purple-800">
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1">
                                            Filter Criteria
                                        </span>
                                        <div className="bg-purple-50 dark:bg-purple-900/30 rounded p-3 text-sm text-gray-800 dark:text-gray-200">
                                            {filter.semantic_filter.criteria}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={handleAccept}
                    disabled={isProcessing}
                    className="flex-1 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    <CheckIcon className="h-4 w-4" />
                    Apply Changes
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
