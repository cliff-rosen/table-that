/**
 * Iteration card showing input to model, response, and tool calls
 */
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';
import { AgentIteration } from '../../../types/chat';
import { FullscreenContent, ContentBlock } from './types';
import { CollapsibleSection } from './CollapsibleSection';
import { ContentBlockRenderer } from './ContentBlockRenderer';
import { MessagesList } from './MessagesList';
import { ToolCallCard } from './ToolCallCard';

/** Truncate JSON object to a short preview string */
function truncateJson(obj: Record<string, unknown>, maxLen = 30): string {
    const str = JSON.stringify(obj);
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen) + '…';
}

/** Truncate output string to a short preview */
function truncateOutput(output: string, maxLen = 25): string {
    if (!output) return '—';
    // Remove newlines and collapse whitespace
    const clean = output.replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen) + '…';
}

export interface IterationCardProps {
    iteration: AgentIteration;
    prevIteration: AgentIteration | null;
    isExpanded: boolean;
    expandedToolCalls: Set<string>;
    expandedSections: Set<string>;
    onToggle: () => void;
    onToggleToolCall: (id: string) => void;
    onToggleSection: (id: string) => void;
    onFullscreen: (content: FullscreenContent) => void;
}

export function IterationCard({
    iteration,
    prevIteration,
    isExpanded,
    expandedToolCalls,
    expandedSections,
    onToggle,
    onToggleToolCall,
    onToggleSection,
    onFullscreen,
}: IterationCardProps) {
    const currentMsgCount = iteration.messages_to_model?.length || 0;
    const prevMsgCount = prevIteration?.messages_to_model?.length || 0;
    const newMsgCount = prevIteration ? currentMsgCount - prevMsgCount : 0;

    const inputSectionId = `iter-${iteration.iteration}-input`;
    const responseSectionId = `iter-${iteration.iteration}-response`;

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            {/* Header */}
            <button
                onClick={onToggle}
                className="w-full flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
                <div className="flex items-center gap-4">
                    {isExpanded ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                    <span className="font-semibold text-gray-900 dark:text-white">
                        Iteration {iteration.iteration}
                    </span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        iteration.stop_reason === 'end_turn'
                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            : iteration.stop_reason === 'tool_use'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                    }`}>
                        {iteration.stop_reason}
                    </span>
                    {iteration.tool_calls?.length > 0 && !isExpanded && (
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400 overflow-hidden">
                            {iteration.tool_calls.map((tc, idx) => (
                                <span key={tc.tool_use_id} className="flex items-center gap-1 truncate max-w-xs">
                                    <span className="font-medium text-blue-600 dark:text-blue-400">{tc.tool_name}</span>
                                    <span className="text-gray-400 truncate">
                                        ({truncateJson(tc.tool_input)} → {truncateOutput(tc.output_to_model)})
                                    </span>
                                    {idx < iteration.tool_calls.length - 1 && <span className="text-gray-300">|</span>}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                    <span>{iteration.usage?.input_tokens || 0} in / {iteration.usage?.output_tokens || 0} out</span>
                    <span>{iteration.api_call_ms}ms</span>
                </div>
            </button>

            {/* Expanded Content */}
            {isExpanded && (
                <div className="p-4 space-y-4 border-t border-gray-200 dark:border-gray-700">
                    {/* Input to Model */}
                    <CollapsibleSection
                        id={inputSectionId}
                        title="Input to Model"
                        subtitle={
                            newMsgCount > 0
                                ? `${currentMsgCount} messages (+${newMsgCount} from tool exchange)`
                                : `${currentMsgCount} messages`
                        }
                        subtitleColor={newMsgCount > 0 ? 'orange' : undefined}
                        isExpanded={expandedSections.has(inputSectionId)}
                        onToggle={() => onToggleSection(inputSectionId)}
                        onFullscreen={() => onFullscreen({
                            type: 'messages',
                            title: `Iteration ${iteration.iteration} - Input to Model`,
                            messages: iteration.messages_to_model || []
                        })}
                    >
                        <MessagesList messages={iteration.messages_to_model || []} onFullscreen={onFullscreen} />
                    </CollapsibleSection>

                    {/* Model Response */}
                    <CollapsibleSection
                        id={responseSectionId}
                        title="Model Response"
                        isExpanded={expandedSections.has(responseSectionId)}
                        onToggle={() => onToggleSection(responseSectionId)}
                        onFullscreen={() => onFullscreen({
                            type: 'blocks',
                            title: `Iteration ${iteration.iteration} - Model Response`,
                            blocks: iteration.response_content || []
                        })}
                    >
                        <div className="space-y-2">
                            {(iteration.response_content || []).map((block, idx) => (
                                <ContentBlockRenderer key={idx} block={block as ContentBlock} />
                            ))}
                        </div>
                    </CollapsibleSection>

                    {/* Tool Calls */}
                    {iteration.tool_calls && iteration.tool_calls.length > 0 && (
                        <div>
                            <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Tool Calls
                            </h5>
                            <div className="space-y-2">
                                {iteration.tool_calls.map((toolCall) => (
                                    <ToolCallCard
                                        key={toolCall.tool_use_id}
                                        toolCall={toolCall}
                                        isExpanded={expandedToolCalls.has(toolCall.tool_use_id)}
                                        onToggle={() => onToggleToolCall(toolCall.tool_use_id)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
