/**
 * Tool call card with expandable details.
 * Used inline in IterationCard (Messages tab) and admin ConversationList.
 * For list-detail views, see ToolCallList + ToolCallDetail instead.
 */
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { ToolCall } from '../../../types/chat';
import { ToolCallDetail } from './ToolCallDetail';

interface ToolCallCardProps {
    toolCall: ToolCall;
    isExpanded: boolean;
    onToggle: () => void;
    /** Optional assistant reasoning text that accompanied this tool call */
    assistantText?: string;
    /** Optional iteration number badge shown before tool name */
    iterationNumber?: number;
}

export function ToolCallCard({ toolCall, isExpanded, onToggle, assistantText, iterationNumber }: ToolCallCardProps) {
    const inputPreview = JSON.stringify(toolCall.tool_input);
    const truncatedInput = inputPreview.length > 120 ? inputPreview.slice(0, 120) + '...' : inputPreview;
    const hasProgress = toolCall.progress_events && toolCall.progress_events.length > 0;

    return (
        <div className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
            <button
                onClick={onToggle}
                className="w-full p-3 hover:bg-blue-50 dark:hover:bg-blue-900/20 bg-white dark:bg-gray-800"
            >
                <div className="flex items-center gap-3">
                    {isExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-400 shrink-0" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400 shrink-0" />
                    )}
                    {iterationNumber != null && (
                        <span className="text-xs text-gray-400 shrink-0">#{iterationNumber}</span>
                    )}
                    <span className="font-mono text-sm text-blue-700 dark:text-blue-300 shrink-0">
                        {toolCall.tool_name}
                    </span>
                    <span className={`text-xs font-medium shrink-0 ${
                        toolCall.output_type === 'error'
                            ? 'text-red-500 dark:text-red-400'
                            : 'text-gray-500 dark:text-gray-400'
                    }`}>
                        {toolCall.output_type}
                    </span>
                    {hasProgress && (
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />
                    )}
                    <span className="text-xs text-gray-500 dark:text-gray-400 shrink-0 ml-auto">{toolCall.execution_ms}ms</span>
                </div>
                {!isExpanded && (
                    <div className="mt-1 ml-7 text-xs font-mono text-gray-500 dark:text-gray-400 truncate text-left">
                        {truncatedInput}
                    </div>
                )}
            </button>

            {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 max-h-80 overflow-hidden flex flex-col">
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
