/**
 * Detail pane for a single tool call — tabs for Input, Output, Steps, Payload.
 * Used in the right side of the list-detail layout (ToolCallList)
 * and as embedded expanded content in ToolCallCard.
 */
import { useState } from 'react';
import { ToolCall } from '../../../types/chat';
import { ExpandableStepRow } from './ToolCallShared';
import { ResearchLog } from '../../table/ProposalWidgets';
import type { DataProposalData } from '../../../types/dataProposal';

type DetailTab = 'input' | 'output' | 'steps' | 'payload';

interface ToolCallDetailProps {
    toolCall: ToolCall;
    assistantText?: string;
    iterationNumber?: number;
    /** Hide the header (used when embedded in ToolCallCard which has its own header) */
    hideHeader?: boolean;
}

export function ToolCallDetail({ toolCall, assistantText, iterationNumber, hideHeader }: ToolCallDetailProps) {
    const hasProgress = toolCall.progress_events && toolCall.progress_events.length > 0;
    const hasPayload = !!toolCall.payload;

    const [activeTab, setActiveTab] = useState<DetailTab>(
        hasProgress ? 'steps' : 'output'
    );
    const [payloadRaw, setPayloadRaw] = useState(false);

    const tabs: { id: DetailTab; label: string; show: boolean }[] = [
        { id: 'input', label: 'Input', show: true },
        { id: 'output', label: 'Output', show: true },
        { id: 'steps', label: `Steps (${toolCall.progress_events?.length || 0})`, show: !!hasProgress },
        { id: 'payload', label: 'Payload', show: hasPayload },
    ];
    const visibleTabs = tabs.filter(t => t.show);

    const statusColor = toolCall.output_type === 'error'
        ? 'text-red-500 dark:text-red-400'
        : 'text-green-600 dark:text-green-400';

    return (
        <div className="flex-1 min-h-0 flex flex-col">
            {/* Header */}
            {!hideHeader && (
                <div className="flex-shrink-0 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        {iterationNumber != null && (
                            <span className="text-xs text-gray-400 font-mono">#{iterationNumber}</span>
                        )}
                        <span className="font-mono text-sm text-gray-900 dark:text-white">{toolCall.tool_name}</span>
                        <span className={`text-xs font-medium ${statusColor}`}>{toolCall.output_type}</span>
                        <span className="text-xs text-gray-400 font-mono">{toolCall.execution_ms}ms</span>
                    </div>
                    {assistantText && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 italic line-clamp-2">
                            {assistantText}
                        </p>
                    )}
                </div>
            )}

            {/* Tab bar */}
            <div className="flex-shrink-0 flex border-b border-gray-200 dark:border-gray-700 px-2">
                {visibleTabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-2 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
                            activeTab === tab.id
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 overflow-auto p-2">
                {activeTab === 'input' && (
                    <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                        {JSON.stringify(toolCall.tool_input, null, 2)}
                    </pre>
                )}

                {activeTab === 'output' && (
                    <div className="space-y-2">
                        {toolCall.output_from_executor &&
                         typeof toolCall.output_from_executor === 'string' &&
                         toolCall.output_from_executor !== toolCall.output_to_model ? (
                            <>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Output to model</div>
                                    <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                        {toolCall.output_to_model}
                                    </pre>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">Raw from executor</div>
                                    <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                        {typeof toolCall.output_from_executor === 'string'
                                            ? toolCall.output_from_executor
                                            : JSON.stringify(toolCall.output_from_executor, null, 2)}
                                    </pre>
                                </div>
                            </>
                        ) : (
                            <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {toolCall.output_to_model}
                            </pre>
                        )}
                    </div>
                )}

                {activeTab === 'steps' && toolCall.progress_events && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                            <thead>
                                <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                    <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-16">Time</th>
                                    <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-8"></th>
                                    <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-28">Stage</th>
                                    <th className="text-left px-3 py-2 font-medium text-gray-500 dark:text-gray-400">Message</th>
                                    <th className="text-right px-3 py-2 font-medium text-gray-500 dark:text-gray-400 w-16">Progress</th>
                                </tr>
                            </thead>
                            <tbody>
                                {toolCall.progress_events.map((evt, i) => (
                                    <ExpandableStepRow key={i} evt={evt} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {activeTab === 'payload' && toolCall.payload && (() => {
                    const hasRendered = toolCall.payload!.type === 'data_proposal' && (toolCall.payload!.data as DataProposalData)?.research_log;
                    return (
                        <div>
                            {hasRendered && (
                                <div className="flex justify-end mb-1.5">
                                    <button
                                        onClick={() => setPayloadRaw(!payloadRaw)}
                                        className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        {payloadRaw ? 'Rendered' : 'JSON'}
                                    </button>
                                </div>
                            )}
                            {hasRendered && !payloadRaw ? (
                                <ResearchLog log={(toolCall.payload!.data as DataProposalData).research_log!} defaultExpanded large />
                            ) : (
                                <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                    {JSON.stringify(toolCall.payload, null, 2)}
                                </pre>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
