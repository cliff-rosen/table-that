/**
 * Tool call card with expandable details and fullscreen viewer
 */
import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon, XMarkIcon } from '@heroicons/react/24/solid';
import { ToolCall } from '../../../types/chat';

interface ToolCallCardProps {
    toolCall: ToolCall;
    isExpanded: boolean;
    onToggle: () => void;
    /** Optional assistant reasoning text that accompanied this tool call */
    assistantText?: string;
}

export function ToolCallCard({ toolCall, isExpanded, onToggle, assistantText }: ToolCallCardProps) {
    const [showFullscreen, setShowFullscreen] = useState(false);
    const inputPreview = JSON.stringify(toolCall.tool_input);
    const truncatedInput = inputPreview.length > 120 ? inputPreview.slice(0, 120) + '...' : inputPreview;

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
type ToolCallTab = 'input' | 'output' | 'payload';

function ToolCallFullscreen({ toolCall, onClose }: { toolCall: ToolCall; onClose: () => void }) {
    const [activeTab, setActiveTab] = useState<ToolCallTab>('input');
    const hasPayload = !!toolCall.payload;

    const tabs: { id: ToolCallTab; label: string; show: boolean }[] = [
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
