/**
 * List-detail (master-detail) layout for tool calls.
 * Left column: compact list of calls. Right pane: full detail with tabs.
 * Used by ToolHistoryPanel and DiagnosticsPanel Tools tab.
 */
import { useState, useMemo } from 'react';
import { AgentTrace, ToolCall } from '../../../types/chat';
import { ToolCallDetail } from './ToolCallDetail';

export interface ToolCallListItem {
    toolCall: ToolCall;
    iterationNumber: number;
    assistantText?: string;
}

interface ToolCallListProps {
    /** Extract tool calls from trace */
    trace?: AgentTrace;
    /** Or provide pre-extracted items */
    items?: ToolCallListItem[];
    /** Message shown when no tool calls exist */
    emptyMessage?: string;
}

/** Extract tool call items from an AgentTrace */
function extractItems(trace: AgentTrace): ToolCallListItem[] {
    if (!trace.iterations) return [];
    return trace.iterations.flatMap(iter => {
        const textBlocks = (iter.response_content || [])
            .filter((block: Record<string, unknown>) => block.type === 'text')
            .map((block: Record<string, unknown>) => block.text as string)
            .join('\n');
        return (iter.tool_calls || []).map(tc => ({
            toolCall: tc,
            iterationNumber: iter.iteration,
            assistantText: textBlocks || undefined,
        }));
    });
}

/** Truncated input preview for list items */
function inputPreview(input: Record<string, unknown>): string {
    const str = JSON.stringify(input);
    return str.length > 60 ? str.slice(0, 60) + '…' : str;
}

/** Format execution time */
function formatTime(ms: number): string {
    if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
    return `${ms}ms`;
}

export function ToolCallList({
    trace,
    items: itemsProp,
    emptyMessage = 'No tool calls',
}: ToolCallListProps) {
    const items = useMemo(
        () => itemsProp ?? (trace ? extractItems(trace) : []),
        [itemsProp, trace],
    );

    const [selectedId, setSelectedId] = useState<string | null>(
        () => items.length > 0 ? items[0].toolCall.tool_use_id : null,
    );

    const selectedItem = items.find(it => it.toolCall.tool_use_id === selectedId);

    if (items.length === 0) {
        return <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>;
    }

    return (
        <div className="flex h-full">
            {/* Left list */}
            <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
                {items.map(({ toolCall, iterationNumber }) => {
                    const isSelected = toolCall.tool_use_id === selectedId;
                    const isError = toolCall.output_type === 'error';
                    const hasProgress = toolCall.progress_events && toolCall.progress_events.length > 0;

                    return (
                        <button
                            key={toolCall.tool_use_id}
                            onClick={() => setSelectedId(toolCall.tool_use_id)}
                            className={`w-full text-left px-3 py-2 border-l-2 transition-colors ${
                                isSelected
                                    ? 'border-l-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                    : isError
                                    ? 'border-l-transparent bg-red-50/50 dark:bg-red-900/10 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    : 'border-l-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            {/* Line 1: #N + name + time */}
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-gray-400 font-mono shrink-0">#{iterationNumber}</span>
                                <span className="font-mono text-xs text-gray-900 dark:text-gray-100 truncate">
                                    {toolCall.tool_name}
                                </span>
                                {hasProgress && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                                )}
                                <span className="text-[11px] text-gray-400 font-mono ml-auto shrink-0">
                                    {formatTime(toolCall.execution_ms)}
                                </span>
                            </div>
                            {/* Line 2: truncated input preview */}
                            <div className="text-[11px] font-mono text-gray-400 dark:text-gray-500 truncate mt-0.5">
                                {inputPreview(toolCall.tool_input)}
                            </div>
                        </button>
                    );
                })}
            </div>

            {/* Right detail */}
            <div className="flex-1 min-h-0 flex flex-col">
                {selectedItem ? (
                    <ToolCallDetail
                        key={selectedItem.toolCall.tool_use_id}
                        toolCall={selectedItem.toolCall}
                        assistantText={selectedItem.assistantText}
                        iterationNumber={selectedItem.iterationNumber}
                    />
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm">
                        Select a tool call
                    </div>
                )}
            </div>
        </div>
    );
}
