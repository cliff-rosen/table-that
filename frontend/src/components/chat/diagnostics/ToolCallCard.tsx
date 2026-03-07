/**
 * Tool call card with expandable details.
 * Used inline in IterationCard (Messages tab) and admin ConversationList.
 * For list-detail views, see ToolCallList + ToolCallDetail instead.
 */
import { ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid';
import { ToolCall } from '../../../types/chat';
import { ToolCallDetail } from './ToolCallDetail';
import { FullscreenContent } from './types';

interface ToolCallCardProps {
    toolCall: ToolCall;
    isExpanded: boolean;
    onToggle: () => void;
    /** Optional assistant reasoning text that accompanied this tool call */
    assistantText?: string;
    /** Optional iteration number badge shown before tool name */
    iterationNumber?: number;
    /** Fullscreen handler for maximize button */
    onFullscreen?: (content: FullscreenContent) => void;
}

export function ToolCallCard({ toolCall, isExpanded, onToggle, assistantText, iterationNumber, onFullscreen }: ToolCallCardProps) {
    const inputPreview = JSON.stringify(toolCall.tool_input);
    const truncatedInput = inputPreview.length > 120 ? inputPreview.slice(0, 120) + '...' : inputPreview;
    const hasProgress = toolCall.progress_events && toolCall.progress_events.length > 0;

    return (
        <div className="border border-gray-100 dark:border-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full px-2 py-1.5 hover:bg-blue-50/50 dark:hover:bg-blue-900/10"
            >
                <div className="flex items-center gap-2">
                    {isExpanded ? (
                        <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    ) : (
                        <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                    )}
                    {iterationNumber != null && (
                        <span className="text-xs text-gray-400 shrink-0">#{iterationNumber}</span>
                    )}
                    <span className="font-mono text-xs text-blue-700 dark:text-blue-300 shrink-0">
                        {toolCall.tool_name}
                    </span>
                    <span className={`text-[11px] font-medium shrink-0 ${
                        toolCall.output_type === 'error'
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-gray-500 dark:text-gray-400'
                    }`}>
                        {toolCall.output_type}
                    </span>
                    {hasProgress && (
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                    )}
                    <span className="text-[11px] text-gray-400 shrink-0 ml-auto">{toolCall.execution_ms}ms</span>
                </div>
                {!isExpanded && (
                    <div className="mt-0.5 ml-5 text-[11px] font-mono text-gray-400 truncate text-left">
                        {truncatedInput}
                    </div>
                )}
            </button>

            {isExpanded && (
                <div className="border-t border-gray-100 dark:border-gray-700 max-h-72 overflow-hidden flex flex-col relative">
                    {onFullscreen && (
                        <button
                            onClick={() => onFullscreen({
                                type: 'raw',
                                title: `Tool: ${toolCall.tool_name}`,
                                content: JSON.stringify({
                                    tool_name: toolCall.tool_name,
                                    tool_input: toolCall.tool_input,
                                    output_type: toolCall.output_type,
                                    output_to_model: toolCall.output_to_model,
                                    output_from_executor: toolCall.output_from_executor,
                                    execution_ms: toolCall.execution_ms,
                                    progress_events: toolCall.progress_events,
                                }, null, 2)
                            })}
                            className="absolute top-1 right-1 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 z-10"
                            title="View fullscreen"
                        >
                            <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
                        </button>
                    )}
                    <ToolCallDetail
                        toolCall={toolCall}
                        assistantText={assistantText}
                        hideHeader
                    />
                </div>
            )}
        </div>
    );
}
