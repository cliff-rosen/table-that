/**
 * Agent response card with tabbed interface for message, payload, and tools
 */
import { useState } from 'react';
import { ArrowsPointingOutIcon } from '@heroicons/react/24/solid';
import { AgentTrace } from '../../../types/chat';
import { FullscreenContent } from './types';

type AgentResponseTab = 'message' | 'payload' | 'tools';

interface AgentResponseCardProps {
    response: NonNullable<AgentTrace['final_response']>;
    onFullscreen: (content: FullscreenContent) => void;
}

export function AgentResponseCard({ response, onFullscreen }: AgentResponseCardProps) {
    const hasPayload = !!response.custom_payload;
    const hasTools = !!(response.tool_history && response.tool_history.length > 0);

    // Default to first available tab
    const [activeTab, setActiveTab] = useState<AgentResponseTab>('message');

    const tabs: { id: AgentResponseTab; label: string; show: boolean }[] = [
        { id: 'message', label: 'Message', show: true },
        { id: 'payload', label: `Payload${hasPayload ? ` (${response.custom_payload?.type})` : ''}`, show: hasPayload },
        { id: 'tools', label: `Tools${hasTools ? ` (${response.tool_history?.length})` : ''}`, show: hasTools },
    ];

    const visibleTabs = tabs.filter(t => t.show);

    return (
        <div className="border-2 border-indigo-300 dark:border-indigo-700 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-50 dark:bg-indigo-900/30 px-4 py-3 border-b border-indigo-200 dark:border-indigo-700 flex items-center justify-between">
                <h4 className="font-semibold text-indigo-900 dark:text-indigo-100">
                    Agent Response
                </h4>
                {response.conversation_id && (
                    <span className="text-xs text-indigo-600 dark:text-indigo-400 font-mono">
                        conv: {response.conversation_id}
                    </span>
                )}
            </div>

            {/* Tabs */}
            {visibleTabs.length > 1 && (
                <div className="flex border-b border-indigo-200 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-900/10">
                    {visibleTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 text-xs font-medium border-b-2 -mb-px transition-colors ${
                                activeTab === tab.id
                                    ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Tab Content */}
            <div className="p-4">
                {activeTab === 'message' && (
                    <div className="space-y-4">
                        {/* Message Text */}
                        <div>
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Message</div>
                            <pre className="bg-white dark:bg-gray-900 rounded p-3 text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                                {response.message}
                            </pre>
                        </div>

                        {/* Suggested Values */}
                        {response.suggested_values && response.suggested_values.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                    Suggested Values ({response.suggested_values.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {response.suggested_values.map((sv, i) => (
                                        <div key={i} className="px-3 py-2 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded">
                                            <div className="text-xs font-medium text-blue-800 dark:text-blue-200">{sv.label}</div>
                                            <div className="text-xs text-blue-600 dark:text-blue-400 font-mono">{sv.value}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggested Actions */}
                        {response.suggested_actions && response.suggested_actions.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                    Suggested Actions ({response.suggested_actions.length})
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {response.suggested_actions.map((sa, i) => (
                                        <div key={i} className="px-3 py-2 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded">
                                            <div className="text-xs font-medium text-green-800 dark:text-green-200">{sa.label}</div>
                                            <div className="text-xs text-green-600 dark:text-green-400 font-mono">
                                                {sa.action} ({sa.handler})
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'payload' && response.custom_payload && (
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                Type: <span className="font-mono">{response.custom_payload.type}</span>
                            </div>
                            <button
                                onClick={() => onFullscreen({
                                    type: 'raw',
                                    title: 'Custom Payload',
                                    content: JSON.stringify(response.custom_payload, null, 2)
                                })}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <ArrowsPointingOutIcon className="h-4 w-4" />
                            </button>
                        </div>
                        <pre className="bg-purple-50 dark:bg-purple-900/20 rounded p-3 text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-purple-200 dark:border-purple-800">
                            {JSON.stringify(response.custom_payload.data, null, 2)}
                        </pre>
                    </div>
                )}

                {activeTab === 'tools' && response.tool_history && response.tool_history.length > 0 && (
                    <div className="space-y-3">
                        {response.tool_history.map((th, i) => (
                            <div key={i} className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-3">
                                <div className="text-xs font-medium text-orange-800 dark:text-orange-200 font-mono mb-2">
                                    {th.tool_name}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400 mb-1">Input</div>
                                        <pre className="bg-white dark:bg-gray-900 rounded p-2 font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                            {JSON.stringify(th.input, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400 mb-1">Output</div>
                                        <pre className="bg-white dark:bg-gray-900 rounded p-2 font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
                                            {typeof th.output === 'string' ? th.output : JSON.stringify(th.output, null, 2)}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
