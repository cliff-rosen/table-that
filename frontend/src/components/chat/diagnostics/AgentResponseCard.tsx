/**
 * Agent response card — single tab layer: Parsed | Raw | Tools
 */
import { useState } from 'react';
import { ArrowsPointingOutIcon } from '@heroicons/react/24/solid';
import { AgentTrace, CustomPayload } from '../../../types/chat';
import { FullscreenContent } from './types';

type Tab = 'parsed' | 'raw' | 'tools';

interface AgentResponseCardProps {
    response: NonNullable<AgentTrace['final_response']>;
    onFullscreen: (content: FullscreenContent) => void;
}

// ── Payload renderers ────────────────────────────────────────────────────────

function SchemaPayloadView({ data }: { data: Record<string, unknown> }) {
    const ops = (data.operations || []) as Array<Record<string, unknown>>;
    const tableName = data.table_name as string | undefined;
    const tableDesc = data.table_description as string | undefined;
    const mode = data.mode as string | undefined;

    const actionColors: Record<string, string> = {
        add: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
        remove: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
        modify: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        reorder: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    };

    return (
        <div className="space-y-2">{<>
            {(tableName || mode) ? (
                <div className="flex items-center gap-2 flex-wrap">
                    {mode && (
                        <span className="px-2 py-0.5 text-[10px] font-semibold uppercase rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            {mode}
                        </span>
                    )}
                    {tableName && <span className="text-xs font-medium text-gray-800 dark:text-gray-200">{tableName}</span>}
                    {tableDesc && <span className="text-xs text-gray-500 dark:text-gray-400">— {tableDesc}</span>}
                </div>
            ) : null}
            <div className="space-y-1">
                {ops.map((op, i) => {
                    const action = op.action as string;
                    const col = op.column as Record<string, unknown> | undefined;
                    const colId = op.column_id as string | undefined;
                    const name = col?.name as string || colId || '?';
                    const type = col?.type as string | undefined;
                    const changes = op.changes as Record<string, unknown> | undefined;

                    return (
                        <div key={i} className="flex items-center gap-2 text-xs">{<>
                            <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] uppercase ${actionColors[action] || 'bg-gray-100 text-gray-700'}`}>
                                {action}
                            </span>
                            <span className="font-medium text-gray-800 dark:text-gray-200">{name}</span>
                            {type && <span className="text-gray-500 dark:text-gray-400 font-mono">{type}</span>}
                            {changes && (
                                <span className="text-gray-500 dark:text-gray-400">
                                    → {Object.entries(changes).map(([k, v]) => `${k}: ${v}`).join(', ')}
                                </span>
                            )}
                            {op.after_column_id && (
                                <span className="text-gray-400 dark:text-gray-500">after {op.after_column_id as string}</span>
                            )}
                        </>}</div>
                    );
                })}
            </div>
            {data.sample_rows && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                    + {(data.sample_rows as unknown[]).length} sample rows
                </div>
            )}
        </>}</div>
    );
}

function DataPayloadView({ data }: { data: Record<string, unknown> }) {
    const ops = (data.operations || []) as Array<Record<string, unknown>>;

    const counts: Record<string, number> = {};
    for (const op of ops) {
        const action = op.action as string;
        counts[action] = (counts[action] || 0) + 1;
    }

    const actionColors: Record<string, string> = {
        insert: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
        update: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
        delete: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
                {Object.entries(counts).map(([action, count]) => (
                    <span key={action} className={`px-2 py-0.5 text-[10px] font-semibold uppercase rounded ${actionColors[action] || 'bg-gray-100 text-gray-700'}`}>
                        {count} {action}{count > 1 ? 's' : ''}
                    </span>
                ))}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    ({ops.length} total operations)
                </span>
            </div>
            {ops.length <= 20 && (
                <div className="space-y-1">
                    {ops.map((op, i) => {
                        const action = op.action as string;
                        const rowData = (op.data || op.values || op.row) as Record<string, unknown> | undefined;
                        const preview = rowData
                            ? Object.entries(rowData).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'string' && v.length > 40 ? v.slice(0, 40) + '…' : v}`).join(', ')
                            : '';
                        return (
                            <div key={i} className="flex items-baseline gap-2 text-xs">
                                <span className={`px-1.5 py-0.5 rounded font-medium text-[10px] uppercase flex-shrink-0 ${actionColors[action] || 'bg-gray-100 text-gray-700'}`}>
                                    {action}
                                </span>
                                {op.row_id != null && <span className="text-gray-500 dark:text-gray-400 font-mono flex-shrink-0">row {op.row_id as number}</span>}
                                {preview && <span className="text-gray-600 dark:text-gray-300 truncate">{preview}</span>}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function PayloadView({ payload, onFullscreen }: { payload: CustomPayload; onFullscreen: (c: FullscreenContent) => void }) {
    const data = payload.data as Record<string, unknown> | undefined;

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Payload — <span className="font-mono">{payload.type}</span>
                </div>
                <button
                    onClick={() => onFullscreen({
                        type: 'raw',
                        title: `Payload: ${payload.type}`,
                        content: JSON.stringify(payload, null, 2)
                    })}
                    className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                    <ArrowsPointingOutIcon className="h-4 w-4" />
                </button>
            </div>
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded p-2 border border-purple-200 dark:border-purple-800">
                {data && payload.type === 'schema_proposal' ? (
                    <SchemaPayloadView data={data} />
                ) : data && payload.type === 'data_proposal' ? (
                    <DataPayloadView data={data} />
                ) : (
                    <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                        {JSON.stringify(data, null, 2)}
                    </pre>
                )}
            </div>
        </div>
    );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AgentResponseCard({ response, onFullscreen }: AgentResponseCardProps) {
    const hasTools = !!(response.tool_history && response.tool_history.length > 0);
    const hasRaw = !!response.raw_response;

    const [activeTab, setActiveTab] = useState<Tab>('parsed');

    const tabs: { id: Tab; label: string; show: boolean }[] = [
        { id: 'parsed', label: 'Parsed', show: true },
        { id: 'raw', label: 'Raw', show: hasRaw },
        { id: 'tools', label: `Tools (${response.tool_history?.length || 0})`, show: hasTools },
    ];

    const visibleTabs = tabs.filter(t => t.show);

    return (
        <div className="border border-indigo-200 dark:border-indigo-700 rounded-lg overflow-hidden">
            {/* Header */}
            <div className="bg-indigo-50 dark:bg-indigo-900/30 px-3 py-2 border-b border-indigo-200 dark:border-indigo-700 flex items-center justify-between">
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
                            className={`px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors ${
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

            {/* Content */}
            <div className="p-3">
                {activeTab === 'parsed' && (
                    <div className="space-y-3">
                        {/* Message */}
                        <div>
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Message</div>
                            <pre className="bg-white dark:bg-gray-900 rounded p-2 text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                                {response.message}
                            </pre>
                        </div>

                        {/* Suggested Values */}
                        {response.suggested_values && response.suggested_values.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Suggested Values ({response.suggested_values.length})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {response.suggested_values.map((sv, i) => (
                                        <div key={i} className="px-2 py-1 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded">
                                            <div className="text-xs font-medium text-blue-800 dark:text-blue-200">{sv.text}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Suggested Actions */}
                        {response.suggested_actions && response.suggested_actions.length > 0 && (
                            <div>
                                <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                    Suggested Actions ({response.suggested_actions.length})
                                </div>
                                <div className="flex flex-wrap gap-1.5">
                                    {response.suggested_actions.map((sa, i) => (
                                        <div key={i} className="px-2 py-1 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded">
                                            <div className="text-xs font-medium text-green-800 dark:text-green-200">{sa.label}</div>
                                            <div className="text-xs text-green-600 dark:text-green-400 font-mono">
                                                {sa.action} ({sa.handler})
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Payload */}
                        {response.custom_payload && (
                            <PayloadView payload={response.custom_payload} onFullscreen={onFullscreen} />
                        )}
                    </div>
                )}

                {activeTab === 'raw' && (
                    <div>
                        <div className="flex items-center justify-between mb-1">
                            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                Raw LLM Response ({response.raw_response?.length || 0} chars)
                            </div>
                            <button
                                onClick={() => onFullscreen({
                                    type: 'raw',
                                    title: 'Raw LLM Response',
                                    content: response.raw_response || ''
                                })}
                                className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <ArrowsPointingOutIcon className="h-4 w-4" />
                            </button>
                        </div>
                        <pre className="bg-white dark:bg-gray-900 rounded p-2 text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700">
                            {response.raw_response}
                        </pre>
                    </div>
                )}

                {activeTab === 'tools' && response.tool_history && response.tool_history.length > 0 && (
                    <div className="space-y-3">
                        {response.tool_history.map((th, i) => (
                            <div key={i} className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-2">
                                <div className="text-xs font-medium text-orange-800 dark:text-orange-200 font-mono mb-1">
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
