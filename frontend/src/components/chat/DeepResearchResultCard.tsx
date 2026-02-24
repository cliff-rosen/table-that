import { useState, useRef } from 'react';
import {
    BeakerIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ArrowTopRightOnSquareIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    MinusCircleIcon,
    DocumentTextIcon,
    GlobeAltIcon,
    ClipboardDocumentIcon,
    QuestionMarkCircleIcon,
    DocumentDuplicateIcon
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import ExportMenu from '../ui/ExportMenu';
import { formatDeepResearchForClipboard, generatePDF, copyWithToast } from '../../lib/utils/export';

export interface DeepResearchSource {
    id: string;
    type: 'pubmed' | 'web';
    title: string;
    url: string;
    snippet: string;
    metadata?: Record<string, unknown>;
}

export interface DeepResearchChecklistCoverage {
    satisfied: string[];
    partial: string[];
    gaps: string[];
}

export interface DeepResearchEvaluation {
    final_confidence: number;
    used_second_opinion: boolean;
}

export interface DeepResearchResultData {
    trace_id: string;
    question: string;
    refined_question?: string;
    answer: string;
    sources: DeepResearchSource[];
    checklist_coverage: DeepResearchChecklistCoverage;
    iterations_used: number;
    status: 'completed' | 'max_iterations_reached' | 'error';
    limitations: string[];
    evaluation?: DeepResearchEvaluation;
}

interface DeepResearchResultCardProps {
    data: DeepResearchResultData;
}

export default function DeepResearchResultCard({ data }: DeepResearchResultCardProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [showSources, setShowSources] = useState(false);
    const [showLimitations, setShowLimitations] = useState(false);
    const [copied, setCopied] = useState(false);

    const pubmedSources = data.sources.filter(s => s.type === 'pubmed');
    const webSources = data.sources.filter(s => s.type === 'web');

    const statusConfig = {
        completed: {
            label: 'Completed',
            className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
        },
        max_iterations_reached: {
            label: 'Max Iterations',
            className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200'
        },
        error: {
            label: 'Error',
            className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200'
        }
    };

    const status = statusConfig[data.status] || statusConfig.error;

    const copyAnswer = async () => {
        try {
            await navigator.clipboard.writeText(data.answer);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    const satisfiedCount = data.checklist_coverage.satisfied.length;
    const partialCount = data.checklist_coverage.partial.length;
    const gapsCount = data.checklist_coverage.gaps.length;
    const totalItems = satisfiedCount + partialCount + gapsCount;

    const exportOptions = [
        {
            label: 'Copy All',
            icon: DocumentDuplicateIcon,
            onClick: () => copyWithToast(formatDeepResearchForClipboard(data), 'Research results'),
        },
        {
            label: 'Download PDF',
            icon: DocumentTextIcon,
            onClick: () => {
                if (contentRef.current) {
                    generatePDF(contentRef.current, `deep-research-${data.trace_id.slice(0, 8)}.pdf`);
                }
            },
        },
    ];

    return (
        <div className="h-full flex flex-col min-h-0" ref={contentRef}>
            {/* Header - fixed */}
            <div className="flex-shrink-0 flex items-center justify-between flex-wrap gap-2 mb-3">
                <div className="flex items-center gap-2">
                    <BeakerIcon className="h-5 w-5 text-purple-500" />
                    <span className="font-medium text-gray-900 dark:text-white">
                        Deep Research
                    </span>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${status.className}`}>
                        {status.label}
                    </span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                    <span>{data.iterations_used} iterations</span>
                    <span>{data.sources.length} sources</span>
                    {data.evaluation && (
                        <span className="flex items-center gap-1">
                            {Math.round(data.evaluation.final_confidence * 100)}% confidence
                            {data.evaluation.used_second_opinion && (
                                <span className="text-xs text-purple-500">(verified)</span>
                            )}
                        </span>
                    )}
                    <ExportMenu options={exportOptions} />
                </div>
            </div>

            {/* Question - fixed */}
            <div className="flex-shrink-0 mb-3 p-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                <div className="flex items-start gap-2">
                    <QuestionMarkCircleIcon className="h-5 w-5 text-purple-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {data.question}
                        </p>
                        {data.refined_question && data.refined_question !== data.question && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                <span className="font-medium">Refined:</span> {data.refined_question}
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Checklist Coverage Summary - fixed */}
            {totalItems > 0 && (
                <div className="flex-shrink-0 flex items-center gap-4 p-3 mb-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Coverage:</span>
                    <div className="flex items-center gap-3">
                        {satisfiedCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                                <CheckCircleSolidIcon className="h-4 w-4" />
                                {satisfiedCount} satisfied
                            </span>
                        )}
                        {partialCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-yellow-600 dark:text-yellow-400">
                                <MinusCircleIcon className="h-4 w-4" />
                                {partialCount} partial
                            </span>
                        )}
                        {gapsCount > 0 && (
                            <span className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
                                <ExclamationCircleIcon className="h-4 w-4" />
                                {gapsCount} gaps
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Answer - grows to fill available space */}
            <div className="flex-1 min-h-0 flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-3">
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Answer
                    </span>
                    <button
                        onClick={copyAnswer}
                        className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                        {copied ? (
                            <>
                                <CheckCircleIcon className="h-4 w-4 text-green-500" />
                                Copied!
                            </>
                        ) : (
                            <>
                                <ClipboardDocumentIcon className="h-4 w-4" />
                                Copy
                            </>
                        )}
                    </button>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto p-4">
                    <MarkdownRenderer content={data.answer} compact />
                </div>
            </div>

            {/* Sources - fixed, collapsible */}
            <div className="flex-shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-3">
                <button
                    onClick={() => setShowSources(!showSources)}
                    className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Sources ({data.sources.length})
                        </span>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                            {pubmedSources.length > 0 && (
                                <span className="flex items-center gap-1">
                                    <DocumentTextIcon className="h-3 w-3" />
                                    {pubmedSources.length} PubMed
                                </span>
                            )}
                            {webSources.length > 0 && (
                                <span className="flex items-center gap-1">
                                    <GlobeAltIcon className="h-3 w-3" />
                                    {webSources.length} Web
                                </span>
                            )}
                        </div>
                    </div>
                    {showSources ? (
                        <ChevronUpIcon className="h-4 w-4 text-gray-500" />
                    ) : (
                        <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                    )}
                </button>

                {showSources && (
                    <div className="p-4 space-y-4 max-h-[250px] overflow-y-auto">
                        {/* PubMed Sources */}
                        {pubmedSources.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                    PubMed Sources
                                </h4>
                                <div className="space-y-2">
                                    {pubmedSources.map((source, idx) => (
                                        <div key={source.id} className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-xs text-gray-400 mr-2">[{idx + 1}]</span>
                                                    <a
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        {source.title}
                                                    </a>
                                                </div>
                                                <a
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                >
                                                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                                </a>
                                            </div>
                                            {source.snippet && (
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                                    {source.snippet}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Web Sources */}
                        {webSources.length > 0 && (
                            <div>
                                <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                    Web Sources
                                </h4>
                                <div className="space-y-2">
                                    {webSources.map((source, idx) => (
                                        <div key={source.id} className="p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <span className="text-xs text-gray-400 mr-2">[{pubmedSources.length + idx + 1}]</span>
                                                    <a
                                                        href={source.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        {source.title}
                                                    </a>
                                                </div>
                                                <a
                                                    href={source.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                                >
                                                    <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                                                </a>
                                            </div>
                                            {source.snippet && (
                                                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                                    {source.snippet}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Limitations - fixed, collapsible */}
            {data.limitations && data.limitations.length > 0 && (
                <div className="flex-shrink-0 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden mb-3">
                    <button
                        onClick={() => setShowLimitations(!showLimitations)}
                        className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                    >
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Limitations ({data.limitations.length})
                        </span>
                        {showLimitations ? (
                            <ChevronUpIcon className="h-4 w-4 text-gray-500" />
                        ) : (
                            <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                        )}
                    </button>

                    {showLimitations && (
                        <div className="p-4">
                            <ul className="space-y-1">
                                {data.limitations.map((limitation, idx) => (
                                    <li key={idx} className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-300">
                                        <ExclamationCircleIcon className="h-4 w-4 flex-shrink-0 mt-0.5 text-yellow-500" />
                                        {limitation}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            )}

            {/* Footer - fixed */}
            <p className="flex-shrink-0 text-xs text-gray-500 dark:text-gray-400 text-center">
                Trace ID: {data.trace_id.slice(0, 8)}...
            </p>
        </div>
    );
}
