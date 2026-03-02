/**
 * Tool call card with expandable details and fullscreen viewer
 */
import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { MagnifyingGlassIcon, GlobeAltIcon, CalculatorIcon, CheckCircleIcon, ExclamationTriangleIcon, BoltIcon } from '@heroicons/react/24/outline';
import { ToolCall, ToolProgressRecord } from '../../../types/chat';

interface ToolCallCardProps {
    toolCall: ToolCall;
    isExpanded: boolean;
    onToggle: () => void;
    /** Optional assistant reasoning text that accompanied this tool call */
    assistantText?: string;
}

/** Icon for a progress event stage */
function StageIcon({ stage }: { stage: string }) {
    const cls = 'h-3.5 w-3.5';
    if (stage.includes('search') || stage.includes('lookup')) return <MagnifyingGlassIcon className={`${cls} text-blue-500`} />;
    if (stage.includes('fetch')) return <GlobeAltIcon className={`${cls} text-teal-500`} />;
    if (stage.includes('compute') || stage.includes('formula')) return <CalculatorIcon className={`${cls} text-amber-500`} />;
    if (stage.includes('complete') || stage.includes('done') || stage.includes('answer')) return <CheckCircleIcon className={`${cls} text-green-500`} />;
    if (stage.includes('error') || stage.includes('fail')) return <ExclamationTriangleIcon className={`${cls} text-red-500`} />;
    return <BoltIcon className={`${cls} text-gray-400`} />;
}

/** Compact progress timeline for inline view */
function ProgressTimeline({ events }: { events: ToolProgressRecord[] }) {
    if (!events || events.length === 0) return null;
    // Show at most 8 events inline, with a "more" indicator
    const shown = events.slice(0, 8);
    const remaining = events.length - shown.length;
    return (
        <div className="mt-3">
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                Progress ({events.length} events)
            </div>
            <div className="space-y-1">
                {shown.map((evt, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                        <span className="text-gray-400 font-mono w-12 text-right shrink-0">{evt.elapsed_ms}ms</span>
                        <StageIcon stage={evt.stage} />
                        <span className="text-gray-500 dark:text-gray-400 font-medium shrink-0">{evt.stage}</span>
                        <span className="text-gray-600 dark:text-gray-300 truncate">{evt.message}</span>
                    </div>
                ))}
                {remaining > 0 && (
                    <div className="text-xs text-gray-400 ml-14">+{remaining} more (open fullscreen to see all)</div>
                )}
            </div>
        </div>
    );
}

export function ToolCallCard({ toolCall, isExpanded, onToggle, assistantText }: ToolCallCardProps) {
    const [showFullscreen, setShowFullscreen] = useState(false);
    const inputPreview = JSON.stringify(toolCall.tool_input);
    const truncatedInput = inputPreview.length > 120 ? inputPreview.slice(0, 120) + '...' : inputPreview;
    const hasProgress = toolCall.progress_events && toolCall.progress_events.length > 0;

    return (
        <>
            <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                <div className="flex items-center bg-blue-50 dark:bg-blue-900/20">
                    <button
                        onClick={onToggle}
                        className="flex-1 min-w-0 p-3 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                    >
                        <div className="flex items-center gap-3">
                            {isExpanded ? (
                                <ChevronDownIcon className="h-4 w-4 text-gray-400 shrink-0" />
                            ) : (
                                <ChevronRightIcon className="h-4 w-4 text-gray-400 shrink-0" />
                            )}
                            <span className="font-mono text-sm text-blue-700 dark:text-blue-300 shrink-0">
                                {toolCall.tool_name}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-xs shrink-0 ${
                                toolCall.output_type === 'error'
                                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                            }`}>
                                {toolCall.output_type}
                            </span>
                            {toolCall.payload && (
                                <span className="px-2 py-0.5 rounded text-xs shrink-0 bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                    payload
                                </span>
                            )}
                            {hasProgress && (
                                <span className="px-2 py-0.5 rounded text-xs shrink-0 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400">
                                    {toolCall.progress_events!.length} steps
                                </span>
                            )}
                            <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0">{toolCall.execution_ms}ms</span>
                        </div>
                        {!isExpanded && (
                            <div className="mt-1 ml-7 text-xs font-mono text-gray-500 dark:text-gray-400 truncate text-left">
                                {truncatedInput}
                            </div>
                        )}
                    </button>
                    <button
                        onClick={() => setShowFullscreen(true)}
                        className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 self-start"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                </div>

                {isExpanded && (
                    <div className="p-3 border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800">
                        {assistantText && (
                            <div className="mb-3">
                                <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-1">Assistant</div>
                                <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-2 text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-32 overflow-auto">
                                    {assistantText}
                                </div>
                            </div>
                        )}
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                            Input → Output • Click expand icon for full view
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Input</div>
                                <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-24 overflow-hidden">
                                    {JSON.stringify(toolCall.tool_input, null, 2).slice(0, 300)}
                                    {JSON.stringify(toolCall.tool_input, null, 2).length > 300 && '...'}
                                </pre>
                            </div>
                            <div>
                                <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Output</div>
                                <pre className="bg-gray-50 dark:bg-gray-900 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap max-h-24 overflow-hidden">
                                    {toolCall.output_to_model.slice(0, 300)}
                                    {toolCall.output_to_model.length > 300 && '...'}
                                </pre>
                            </div>
                        </div>
                        {hasProgress && (
                            <ProgressTimeline events={toolCall.progress_events!} />
                        )}
                    </div>
                )}
            </div>

            {/* Fullscreen Tool Call Viewer */}
            {showFullscreen && (
                <ToolCallFullscreen
                    toolCall={toolCall}
                    onClose={() => setShowFullscreen(false)}
                />
            )}
        </>
    );
}

// Fullscreen viewer for a single tool call with tabs
type ToolCallTab = 'input' | 'output' | 'progress' | 'payload';

function ToolCallFullscreen({ toolCall, onClose }: { toolCall: ToolCall; onClose: () => void }) {
    const hasProgress = toolCall.progress_events && toolCall.progress_events.length > 0;
    const hasPayload = !!toolCall.payload;
    const [activeTab, setActiveTab] = useState<ToolCallTab>(hasProgress ? 'progress' : 'input');

    const tabs: { id: ToolCallTab; label: string; show: boolean }[] = [
        { id: 'progress', label: `Progress (${toolCall.progress_events?.length || 0})`, show: !!hasProgress },
        { id: 'input', label: 'Input', show: true },
        { id: 'output', label: 'Output', show: true },
        { id: 'payload', label: 'Payload', show: hasPayload },
    ];

    const visibleTabs = tabs.filter(t => t.show);

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-5xl h-[calc(100vh-4rem)] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">{toolCall.tool_name}</h3>
                        <span className={`px-2 py-0.5 rounded text-xs ${
                            toolCall.output_type === 'error'
                                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                        }`}>
                            {toolCall.output_type}
                        </span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">{toolCall.execution_ms}ms</span>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-2">
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-6 flex-shrink-0">
                    {visibleTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                                activeTab === tab.id
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-auto p-6">
                    {activeTab === 'progress' && toolCall.progress_events && (
                        <div className="max-w-4xl mx-auto">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                All progress events emitted during tool execution
                            </div>
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
                                            <tr key={i} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                                                <td className="px-3 py-1.5 font-mono text-gray-400">{evt.elapsed_ms}ms</td>
                                                <td className="px-1 py-1.5"><StageIcon stage={evt.stage} /></td>
                                                <td className="px-3 py-1.5 font-medium text-gray-700 dark:text-gray-300">{evt.stage}</td>
                                                <td className="px-3 py-1.5 text-gray-600 dark:text-gray-400">{evt.message}</td>
                                                <td className="px-3 py-1.5 text-right font-mono text-gray-400">
                                                    {evt.progress > 0 ? `${Math.round(evt.progress * 100)}%` : ''}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {/* Data dump for events with structured data */}
                            {toolCall.progress_events.some(e => e.data) && (
                                <div className="mt-4">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Events with structured data</div>
                                    {toolCall.progress_events.filter(e => e.data).map((evt, i) => (
                                        <div key={i} className="mb-2">
                                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                {evt.stage} @ {evt.elapsed_ms}ms
                                            </div>
                                            <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded p-2 text-xs font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                                {JSON.stringify(evt.data, null, 2)}
                                            </pre>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'input' && (
                        <div className="max-w-4xl mx-auto">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">What the model requested</div>
                            <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {JSON.stringify(toolCall.tool_input, null, 2)}
                            </pre>
                        </div>
                    )}

                    {activeTab === 'output' && (
                        <div className="max-w-4xl mx-auto space-y-6">
                            <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Raw output from executor</div>
                                <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                    {typeof toolCall.output_from_executor === 'string'
                                        ? toolCall.output_from_executor
                                        : JSON.stringify(toolCall.output_from_executor, null, 2)}
                                </pre>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Formatted output sent to model</div>
                                <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                    {toolCall.output_to_model}
                                </pre>
                            </div>
                        </div>
                    )}

                    {activeTab === 'payload' && toolCall.payload && (
                        <div className="max-w-4xl mx-auto">
                            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Data sent to frontend</div>
                            <pre className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-4 text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                {JSON.stringify(toolCall.payload, null, 2)}
                            </pre>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
