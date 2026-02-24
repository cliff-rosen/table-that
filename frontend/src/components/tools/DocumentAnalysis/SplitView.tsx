import { useState, useRef, useEffect } from 'react';
import { ChevronRightIcon, DocumentTextIcon, UserGroupIcon, ChatBubbleBottomCenterTextIcon } from '@heroicons/react/24/outline';
import { DocumentAnalysisResult } from '../../../types/document_analysis';

interface SplitViewProps {
    results: DocumentAnalysisResult;
    originalText: string;
    onNodeSelect: (nodeId: string) => void;
    selectedNodeId: string | null;
}

export function SplitView({ results, originalText, onNodeSelect, selectedNodeId }: SplitViewProps) {
    const [highlightedSpan, setHighlightedSpan] = useState<string | null>(null);
    const textRef = useRef<HTMLDivElement>(null);
    const { hierarchical_summary, entities, claims } = results;

    // Scroll to and highlight text in original document
    const highlightText = (span: string | undefined) => {
        if (!span || !textRef.current) return;
        setHighlightedSpan(span);
    };

    // Clear highlight
    useEffect(() => {
        const timer = setTimeout(() => setHighlightedSpan(null), 5000);
        return () => clearTimeout(timer);
    }, [highlightedSpan]);

    // Render original text with optional highlighting
    const renderOriginalText = () => {
        if (!highlightedSpan) {
            return (
                <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {originalText}
                </div>
            );
        }

        // Try to find and highlight the span
        const lowerText = originalText.toLowerCase();
        const lowerSpan = highlightedSpan.toLowerCase();
        const index = lowerText.indexOf(lowerSpan);

        if (index === -1) {
            return (
                <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                    {originalText}
                </div>
            );
        }

        const before = originalText.slice(0, index);
        const match = originalText.slice(index, index + highlightedSpan.length);
        const after = originalText.slice(index + highlightedSpan.length);

        return (
            <div className="whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-300">
                {before}
                <mark className="bg-yellow-200 dark:bg-yellow-800 px-1 rounded animate-pulse">
                    {match}
                </mark>
                {after}
            </div>
        );
    };

    return (
        <div className="flex h-full" style={{ minHeight: '500px' }}>
            {/* Left Panel - Original Document */}
            <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 flex flex-col">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm flex items-center gap-2">
                        <DocumentTextIcon className="h-4 w-4" />
                        Original Document
                    </h3>
                    {highlightedSpan && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                            Highlighting source text...
                        </p>
                    )}
                </div>
                <div ref={textRef} className="flex-1 overflow-y-auto p-4">
                    {renderOriginalText()}
                </div>
            </div>

            {/* Right Panel - Analysis */}
            <div className="w-1/2 flex flex-col">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <h3 className="font-medium text-gray-900 dark:text-white text-sm">
                        Analysis Results
                    </h3>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {/* Executive Summary */}
                    <div className="border-b border-gray-200 dark:border-gray-700">
                        <button
                            onClick={() => onNodeSelect('executive')}
                            className={`w-full p-4 text-left transition-colors ${
                                selectedNodeId === 'executive'
                                    ? 'bg-blue-50 dark:bg-blue-900/30'
                                    : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                            }`}
                        >
                            <h4 className="font-medium text-blue-700 dark:text-blue-300 text-sm mb-2">
                                Executive Summary
                            </h4>
                            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-3">
                                {hierarchical_summary.executive.summary.slice(0, 200)}...
                            </p>
                            <div className="flex gap-2 mt-2">
                                {hierarchical_summary.executive.main_themes.slice(0, 3).map((theme, idx) => (
                                    <span key={idx} className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                                        {theme.length > 20 ? theme.slice(0, 20) + '...' : theme}
                                    </span>
                                ))}
                            </div>
                        </button>
                    </div>

                    {/* Sections */}
                    {hierarchical_summary.sections.map((section) => (
                        <div key={section.id} className="border-b border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => onNodeSelect(section.id)}
                                className={`w-full p-4 text-left transition-colors ${
                                    selectedNodeId === section.id
                                        ? 'bg-indigo-50 dark:bg-indigo-900/30'
                                        : 'hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                            >
                                <h4 className="font-medium text-indigo-700 dark:text-indigo-300 text-sm mb-1">
                                    {section.title}
                                </h4>
                                <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2 mb-2">
                                    {section.summary}
                                </p>

                                {/* Key Points */}
                                <div className="space-y-1">
                                    {section.key_points.slice(0, 3).map((kp) => (
                                        <button
                                            key={kp.id}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onNodeSelect(kp.id);
                                                if (kp.source_span) highlightText(kp.source_span);
                                            }}
                                            className={`w-full text-left flex items-start gap-2 p-2 rounded text-xs ${
                                                selectedNodeId === kp.id
                                                    ? 'bg-gray-200 dark:bg-gray-700'
                                                    : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <ChevronRightIcon className="h-3 w-3 mt-0.5 flex-shrink-0 text-gray-400" />
                                            <span className="text-gray-700 dark:text-gray-300 line-clamp-2">{kp.text}</span>
                                        </button>
                                    ))}
                                    {section.key_points.length > 3 && (
                                        <p className="text-xs text-gray-500 pl-5">
                                            +{section.key_points.length - 3} more points
                                        </p>
                                    )}
                                </div>
                            </button>
                        </div>
                    ))}

                    {/* Entities Section */}
                    {entities.length > 0 && (
                        <div className="border-b border-gray-200 dark:border-gray-700 p-4">
                            <h4 className="font-medium text-green-700 dark:text-green-300 text-sm mb-3 flex items-center gap-2">
                                <UserGroupIcon className="h-4 w-4" />
                                Entities ({entities.length})
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {entities.slice(0, 10).map((entity) => (
                                    <button
                                        key={entity.id}
                                        onClick={() => {
                                            onNodeSelect(entity.id);
                                            if (entity.mentions[0]) highlightText(entity.mentions[0]);
                                        }}
                                        className={`text-xs px-2 py-1 rounded-full transition-colors ${
                                            selectedNodeId === entity.id
                                                ? 'bg-green-500 text-white'
                                                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/50'
                                        }`}
                                    >
                                        {entity.name}
                                    </button>
                                ))}
                                {entities.length > 10 && (
                                    <span className="text-xs text-gray-500 py-1">
                                        +{entities.length - 10} more
                                    </span>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Claims Section */}
                    {claims.length > 0 && (
                        <div className="p-4">
                            <h4 className="font-medium text-purple-700 dark:text-purple-300 text-sm mb-3 flex items-center gap-2">
                                <ChatBubbleBottomCenterTextIcon className="h-4 w-4" />
                                Claims ({claims.length})
                            </h4>
                            <div className="space-y-2">
                                {claims.slice(0, 5).map((claim) => (
                                    <button
                                        key={claim.id}
                                        onClick={() => {
                                            onNodeSelect(claim.id);
                                            if (claim.evidence[0]?.source_span) {
                                                highlightText(claim.evidence[0].source_span);
                                            }
                                        }}
                                        className={`w-full text-left p-3 rounded-lg transition-colors ${
                                            selectedNodeId === claim.id
                                                ? 'bg-purple-100 dark:bg-purple-900/30 border-l-4 border-purple-500'
                                                : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
                                        }`}
                                    >
                                        <p className="text-xs text-gray-700 dark:text-gray-300 line-clamp-2">
                                            {claim.claim}
                                        </p>
                                        <div className="flex gap-2 mt-1">
                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                claim.claim_type === 'factual' ? 'bg-blue-100 text-blue-700' :
                                                claim.claim_type === 'causal' ? 'bg-amber-100 text-amber-700' :
                                                claim.claim_type === 'evaluative' ? 'bg-rose-100 text-rose-700' :
                                                claim.claim_type === 'recommendation' ? 'bg-teal-100 text-teal-700' :
                                                'bg-violet-100 text-violet-700'
                                            }`}>
                                                {claim.claim_type}
                                            </span>
                                            <span className="text-xs text-gray-500">
                                                {Math.round(claim.confidence * 100)}% confidence
                                            </span>
                                        </div>
                                    </button>
                                ))}
                                {claims.length > 5 && (
                                    <p className="text-xs text-gray-500 text-center">
                                        +{claims.length - 5} more claims
                                    </p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
