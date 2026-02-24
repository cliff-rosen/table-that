/**
 * Diagnostics panel for viewing agent execution traces in the chat tray
 */
import { useState } from 'react';
import { BugAntIcon, ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid';
import { AgentTrace } from '../../types/chat';
import {
    FullscreenContent,
    FullscreenViewer,
    CollapsibleSection,
    IterationCard,
    AgentResponseCard,
    ConfigCard,
} from './diagnostics';

interface DiagnosticsPanelProps {
    diagnostics: AgentTrace;
    onClose: () => void;
}

type TabType = 'messages' | 'config' | 'metrics';

export function DiagnosticsPanel({ diagnostics, onClose }: DiagnosticsPanelProps) {
    const [activeTab, setActiveTab] = useState<TabType>('messages');
    const [expandedIterations, setExpandedIterations] = useState<Set<number>>(new Set([1]));
    const [expandedToolCalls, setExpandedToolCalls] = useState<Set<string>>(new Set());
    const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['messages']));
    const [fullscreenContent, setFullscreenContent] = useState<FullscreenContent | null>(null);

    const toggleIteration = (iter: number) => {
        const next = new Set(expandedIterations);
        if (next.has(iter)) {
            next.delete(iter);
        } else {
            next.add(iter);
        }
        setExpandedIterations(next);
    };

    const toggleToolCall = (id: string) => {
        const next = new Set(expandedToolCalls);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setExpandedToolCalls(next);
    };

    const toggleSection = (id: string) => {
        const next = new Set(expandedSections);
        if (next.has(id)) {
            next.delete(id);
        } else {
            next.add(id);
        }
        setExpandedSections(next);
    };

    const tabs: { id: TabType; label: string }[] = [
        { id: 'messages', label: `Messages (${diagnostics.iterations?.length || 0} iterations)` },
        { id: 'config', label: 'Config' },
        { id: 'metrics', label: 'Metrics' },
    ];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-4 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-lg">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20 flex-shrink-0 rounded-t-lg">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <BugAntIcon className="h-5 w-5 text-orange-500" />
                        Agent Trace
                        <span className="text-sm font-normal text-gray-500">
                            {diagnostics.trace_id?.slice(0, 8)}
                        </span>
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-200 dark:border-gray-700 px-6 flex-shrink-0">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${
                                activeTab === tab.id
                                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
                    {activeTab === 'messages' && (
                        <MessagesTab
                            diagnostics={diagnostics}
                            expandedIterations={expandedIterations}
                            expandedToolCalls={expandedToolCalls}
                            expandedSections={expandedSections}
                            toggleIteration={toggleIteration}
                            toggleToolCall={toggleToolCall}
                            toggleSection={toggleSection}
                            onFullscreen={setFullscreenContent}
                        />
                    )}

                    {activeTab === 'config' && (
                        <ConfigTab
                            diagnostics={diagnostics}
                            expandedSections={expandedSections}
                            toggleSection={toggleSection}
                            onFullscreen={setFullscreenContent}
                        />
                    )}

                    {activeTab === 'metrics' && (
                        <MetricsTab diagnostics={diagnostics} onFullscreen={setFullscreenContent} />
                    )}
                </div>
            </div>

            {/* Fullscreen content viewer */}
            {fullscreenContent && (
                <FullscreenViewer
                    content={fullscreenContent}
                    onClose={() => setFullscreenContent(null)}
                />
            )}
        </div>
    );
}

// ============================================================================
// Messages Tab - Shows the full message flow per iteration
// ============================================================================

interface MessagesTabProps {
    diagnostics: AgentTrace;
    expandedIterations: Set<number>;
    expandedToolCalls: Set<string>;
    expandedSections: Set<string>;
    toggleIteration: (iter: number) => void;
    toggleToolCall: (id: string) => void;
    toggleSection: (id: string) => void;
    onFullscreen: (content: FullscreenContent) => void;
}

function MessagesTab({
    diagnostics,
    expandedIterations,
    expandedToolCalls,
    expandedSections,
    toggleIteration,
    toggleToolCall,
    toggleSection,
    onFullscreen,
}: MessagesTabProps) {
    if (!diagnostics.iterations || diagnostics.iterations.length === 0) {
        return <p className="text-gray-500 dark:text-gray-400">No iterations recorded</p>;
    }

    return (
        <div className="space-y-4">
            {/* System Message - shown once at top */}
            {diagnostics.system_prompt && (
                <CollapsibleSection
                    id="system-message"
                    title="System Message"
                    subtitle={`${diagnostics.system_prompt.length} chars`}
                    isExpanded={expandedSections.has('system-message')}
                    onToggle={() => toggleSection('system-message')}
                    onFullscreen={() => onFullscreen({ type: 'raw', title: 'System Message', content: diagnostics.system_prompt })}
                >
                    <div className="bg-purple-50 dark:bg-purple-900/20 rounded p-3 border border-purple-200 dark:border-purple-800">
                        <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-2">system</div>
                        <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                            {diagnostics.system_prompt}
                        </pre>
                    </div>
                </CollapsibleSection>
            )}

            {/* Iterations */}
            {diagnostics.iterations.map((iteration, index) => (
                <IterationCard
                    key={iteration.iteration}
                    iteration={iteration}
                    prevIteration={index > 0 ? diagnostics.iterations[index - 1] : null}
                    isExpanded={expandedIterations.has(iteration.iteration)}
                    expandedToolCalls={expandedToolCalls}
                    expandedSections={expandedSections}
                    onToggle={() => toggleIteration(iteration.iteration)}
                    onToggleToolCall={toggleToolCall}
                    onToggleSection={toggleSection}
                    onFullscreen={onFullscreen}
                />
            ))}

            {/* Final Agent Response - what was sent to frontend */}
            {diagnostics.final_response && (
                <AgentResponseCard
                    response={diagnostics.final_response}
                    onFullscreen={onFullscreen}
                />
            )}
        </div>
    );
}

// ============================================================================
// Config Tab - Model settings, system prompt, and tools
// ============================================================================

interface ConfigTabProps {
    diagnostics: AgentTrace;
    expandedSections: Set<string>;
    toggleSection: (id: string) => void;
    onFullscreen: (content: FullscreenContent) => void;
}

function ConfigTab({ diagnostics, expandedSections, toggleSection, onFullscreen }: ConfigTabProps) {
    const [expandedTool, setExpandedTool] = useState<string | null>(null);

    return (
        <div className="space-y-6">
            {/* Model Settings */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Model Settings</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <ConfigCard label="Model" value={diagnostics.model} />
                    <ConfigCard label="Max Tokens" value={diagnostics.max_tokens} />
                    <ConfigCard label="Temperature" value={diagnostics.temperature} />
                    <ConfigCard label="Max Iterations" value={diagnostics.max_iterations} />
                </div>
            </div>

            {/* System Prompt */}
            <CollapsibleSection
                id="system-prompt"
                title="System Prompt"
                subtitle={`${diagnostics.system_prompt?.length || 0} chars`}
                isExpanded={expandedSections.has('system-prompt')}
                onToggle={() => toggleSection('system-prompt')}
                onFullscreen={() => onFullscreen({ type: 'raw', title: 'System Prompt', content: diagnostics.system_prompt || '' })}
            >
                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-96 overflow-y-auto resize-y min-h-[3rem]">
                    {diagnostics.system_prompt}
                </pre>
            </CollapsibleSection>

            {/* Tools */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                    Tools Available ({diagnostics.tools?.length || 0})
                </h4>
                <div className="space-y-2">
                    {diagnostics.tools?.map((tool) => (
                        <div key={tool.name} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                            <div className="flex items-center">
                                <button
                                    onClick={() => setExpandedTool(expandedTool === tool.name ? null : tool.name)}
                                    className="flex-1 flex items-center justify-between p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <div>
                                        <span className="font-mono text-sm text-blue-600 dark:text-blue-400">{tool.name}</span>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{tool.description}</p>
                                    </div>
                                    {expandedTool === tool.name ? (
                                        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                                    ) : (
                                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                                    )}
                                </button>
                                <button
                                    onClick={() => onFullscreen({
                                        type: 'raw',
                                        title: `Tool: ${tool.name}`,
                                        content: JSON.stringify(tool, null, 2)
                                    })}
                                    className="p-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    title="View fullscreen"
                                >
                                    <ArrowsPointingOutIcon className="h-4 w-4" />
                                </button>
                            </div>
                            {expandedTool === tool.name && (
                                <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                                    <pre className="text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 resize-y min-h-[3rem] max-h-64 overflow-y-auto">
                                        {JSON.stringify(tool.input_schema, null, 2)}
                                    </pre>
                                </div>
                            )}
                        </div>
                    ))}
                    {(!diagnostics.tools || diagnostics.tools.length === 0) && (
                        <span className="text-gray-500 dark:text-gray-400 text-sm">No tools available</span>
                    )}
                </div>
            </div>

            {/* Context */}
            {diagnostics.context && Object.keys(diagnostics.context).length > 0 && (
                <CollapsibleSection
                    id="context"
                    title="Context"
                    isExpanded={expandedSections.has('context')}
                    onToggle={() => toggleSection('context')}
                    onFullscreen={() => onFullscreen({ type: 'raw', title: 'Context', content: JSON.stringify(diagnostics.context, null, 2) })}
                >
                    <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto text-gray-800 dark:text-gray-200 resize-y min-h-[3rem] max-h-64 overflow-y-auto">
                        {JSON.stringify(diagnostics.context, null, 2)}
                    </pre>
                </CollapsibleSection>
            )}
        </div>
    );
}

// ============================================================================
// Metrics Tab - Token usage, timing, and outcome
// ============================================================================

function MetricsTab({ diagnostics, onFullscreen }: {
    diagnostics: AgentTrace;
    onFullscreen: (content: FullscreenContent) => void;
}) {
    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Outcome</div>
                    <div className={`font-semibold text-sm ${
                        diagnostics.outcome === 'complete'
                            ? 'text-green-600 dark:text-green-400'
                            : diagnostics.outcome === 'error'
                            ? 'text-red-600 dark:text-red-400'
                            : 'text-yellow-600 dark:text-yellow-400'
                    }`}>
                        {diagnostics.outcome}
                    </div>
                </div>
                <ConfigCard label="Total Iterations" value={diagnostics.total_iterations || 0} />
                <ConfigCard label="Total Duration" value={`${diagnostics.total_duration_ms || 0}ms`} />
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Trace ID</div>
                    <div className="font-mono text-xs text-gray-900 dark:text-white truncate">
                        {diagnostics.trace_id}
                    </div>
                </div>
            </div>

            {/* Token Usage */}
            <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Token Usage</h4>
                <div className="grid grid-cols-3 gap-4 mb-4">
                    <ConfigCard label="Cumulative Input" value={diagnostics.total_input_tokens || 0} />
                    <ConfigCard label="Cumulative Output" value={diagnostics.total_output_tokens || 0} />
                    <ConfigCard label="Peak Context" value={diagnostics.peak_input_tokens || diagnostics.total_input_tokens || 0} />
                </div>

                {/* Per-iteration breakdown */}
                {diagnostics.iterations && diagnostics.iterations.length > 1 && (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                            <thead className="bg-gray-50 dark:bg-gray-700">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Iteration</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Input</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">Output</th>
                                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 dark:text-gray-400">API Time</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {diagnostics.iterations.map((iter) => (
                                    <tr key={iter.iteration} className="text-gray-900 dark:text-gray-100">
                                        <td className="px-4 py-2">{iter.iteration}</td>
                                        <td className="px-4 py-2 text-right font-mono">{iter.usage?.input_tokens || 0}</td>
                                        <td className="px-4 py-2 text-right font-mono">{iter.usage?.output_tokens || 0}</td>
                                        <td className="px-4 py-2 text-right font-mono">{iter.api_call_ms}ms</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Error Message */}
            {diagnostics.error_message && (
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">Error Message</h4>
                        <button
                            onClick={() => onFullscreen({ type: 'raw', title: 'Error Message', content: diagnostics.error_message || '' })}
                            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="View fullscreen"
                        >
                            <ArrowsPointingOutIcon className="h-4 w-4" />
                        </button>
                    </div>
                    <pre className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-xs font-mono text-red-800 dark:text-red-200 resize-y min-h-[3rem] max-h-64 overflow-y-auto">
                        {diagnostics.error_message}
                    </pre>
                </div>
            )}

            {/* Final Text */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                        Final Text ({diagnostics.final_text?.length || 0} chars)
                    </h4>
                    <button
                        onClick={() => onFullscreen({ type: 'raw', title: 'Final Text', content: diagnostics.final_text || '' })}
                        className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                </div>
                <pre className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto resize-y min-h-[3rem]">
                    {diagnostics.final_text}
                </pre>
            </div>
        </div>
    );
}
