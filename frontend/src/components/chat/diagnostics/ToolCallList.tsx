/**
 * Shared tool call list component used by both ToolHistoryPanel and DiagnosticsPanel.
 * Extracts tool calls from an AgentTrace and renders them as ToolCallCards.
 */
import { useState, useMemo } from 'react';
import { AgentTrace, ToolCall } from '../../../types/chat';
import { ToolCallCard } from './ToolCallCard';

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
    /** Auto-expand cards that have progress events (default: false) */
    autoExpandWithProgress?: boolean;
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

export function ToolCallList({
    trace,
    items: itemsProp,
    autoExpandWithProgress = false,
    emptyMessage = 'No tool calls',
}: ToolCallListProps) {
    const items = useMemo(
        () => itemsProp ?? (trace ? extractItems(trace) : []),
        [itemsProp, trace],
    );

    const [expandedTools, setExpandedTools] = useState<Set<string>>(() => {
        if (!autoExpandWithProgress) return new Set();
        // Auto-expand tools with progress events
        return new Set(
            items
                .filter(({ toolCall }) => toolCall.progress_events?.length)
                .map(({ toolCall }) => toolCall.tool_use_id),
        );
    });

    const toggleTool = (id: string) => {
        setExpandedTools(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    if (items.length === 0) {
        return <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>;
    }

    return (
        <div className="space-y-3">
            {items.map(({ toolCall, iterationNumber, assistantText }) => (
                <ToolCallCard
                    key={toolCall.tool_use_id}
                    toolCall={toolCall}
                    iterationNumber={iterationNumber}
                    assistantText={assistantText}
                    isExpanded={expandedTools.has(toolCall.tool_use_id)}
                    onToggle={() => toggleTool(toolCall.tool_use_id)}
                />
            ))}
        </div>
    );
}
