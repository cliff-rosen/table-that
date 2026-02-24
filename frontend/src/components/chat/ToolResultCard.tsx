import { useState } from 'react';
import { ChevronRightIcon, WrenchScrewdriverIcon } from '@heroicons/react/24/outline';
import { ToolHistoryEntry, AgentTrace, ToolCall } from '../../types/chat';
import { ToolCallCard } from './diagnostics/ToolCallCard';

interface ToolResultCardProps {
    tool: ToolHistoryEntry;
    onClick?: () => void;
}

function formatToolName(name: string): string {
    return name
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
}

function formatOutput(output: string | Record<string, any>): string {
    if (typeof output === 'string') {
        return output;
    }
    return JSON.stringify(output, null, 2);
}

/** Inline clickable chip that opens tool details */
export default function ToolResultCard({ tool, onClick }: ToolResultCardProps) {
    return (
        <button
            onClick={onClick}
            className="inline-flex items-center gap-1.5 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 hover:bg-blue-200 dark:hover:bg-blue-800/60 border border-blue-300 dark:border-blue-700 rounded text-xs text-blue-700 dark:text-blue-300 transition-colors cursor-pointer"
        >
            <WrenchScrewdriverIcon className="h-3.5 w-3.5" />
            <span className="font-medium">{formatToolName(tool.tool_name)}</span>
            <ChevronRightIcon className="h-3 w-3" />
        </button>
    );
}

/** Expanded view of a tool call - two-column input/output layout */
export function ToolResultExpanded({ tool }: { tool: ToolHistoryEntry }) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 dark:bg-gray-800">
                <WrenchScrewdriverIcon className="h-5 w-5 text-gray-500" />
                <span className="font-medium text-gray-700 dark:text-gray-300">
                    {formatToolName(tool.tool_name)}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-4 p-4 text-sm">
                <div>
                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-1">Input</div>
                    <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-auto max-h-[60vh]">
                        {JSON.stringify(tool.input, null, 2)}
                    </pre>
                </div>
                <div>
                    <div className="text-xs font-medium text-green-600 dark:text-green-400 mb-1">Output</div>
                    <pre className="bg-gray-100 dark:bg-gray-900 p-3 rounded text-xs font-mono text-gray-700 dark:text-gray-300 whitespace-pre-wrap overflow-auto max-h-[60vh]">
                        {formatOutput(tool.output)}
                    </pre>
                </div>
            </div>
        </div>
    );
}

interface ToolHistoryPanelProps {
    tools: ToolHistoryEntry[];
    trace?: AgentTrace;
    onClose: () => void;
}

export function ToolHistoryPanel({ tools, onClose, trace }: ToolHistoryPanelProps) {
    // Extract rich tool calls with assistant text from trace when available
    const traceToolCalls = trace?.iterations?.flatMap(iter => {
        const textBlocks = (iter.response_content || [])
            .filter((block: Record<string, unknown>) => block.type === 'text')
            .map((block: Record<string, unknown>) => block.text as string)
            .join('\n');
        return (iter.tool_calls || []).map(tc => ({
            toolCall: tc as ToolCall,
            assistantText: textBlocks || undefined,
        }));
    }) || [];

    const useRichView = traceToolCalls.length > 0;
    const count = useRichView ? traceToolCalls.length : tools.length;

    const title = count === 1
        ? formatToolName(useRichView ? traceToolCalls[0].toolCall.tool_name : tools[0].tool_name)
        : `Tool Calls (${count})`;

    const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
            <div className="absolute inset-4 bg-white dark:bg-gray-800 shadow-xl flex flex-col rounded-lg">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        {title}
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-2xl leading-none"
                    >
                        &times;
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {useRichView ? (
                        traceToolCalls.map(({ toolCall: tc, assistantText }, idx) => (
                            <ToolCallCard
                                key={tc.tool_use_id || idx}
                                toolCall={tc}
                                assistantText={assistantText}
                                isExpanded={expandedTools.has(idx)}
                                onToggle={() => setExpandedTools(prev => {
                                    const next = new Set(prev);
                                    if (next.has(idx)) next.delete(idx);
                                    else next.add(idx);
                                    return next;
                                })}
                            />
                        ))
                    ) : (
                        tools.map((tool, idx) => (
                            <ToolResultExpanded key={idx} tool={tool} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
