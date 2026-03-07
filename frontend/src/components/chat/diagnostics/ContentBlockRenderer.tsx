/**
 * Renders API content blocks (text, tool_use, tool_result)
 */
import { ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock, UnknownBlock } from './types';

interface ContentBlockRendererProps {
    block: ContentBlock;
}

export function ContentBlockRenderer({ block }: ContentBlockRendererProps) {
    if (block.type === 'text' && 'text' in block) {
        const textBlock = block as TextBlock;
        return (
            <div className="border-l-2 border-l-gray-300 dark:border-l-gray-600 pl-2 py-1">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-0.5">text</div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                    {textBlock.text}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_use' && 'name' in block) {
        const toolUse = block as ToolUseBlock;
        return (
            <div className="border-l-2 border-l-blue-400 dark:border-l-blue-500 pl-2 py-1">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">tool_use</span>
                    <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">{toolUse.name}</span>
                    <span className="text-xs text-gray-400 font-mono">{toolUse.id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded p-1.5 max-h-48 overflow-y-auto">
                    {JSON.stringify(toolUse.input, null, 2)}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_result' && 'tool_use_id' in block) {
        const toolResult = block as ToolResultBlock;
        const isError = toolResult.is_error === true;
        return (
            <div className={`border-l-2 pl-2 py-1 ${
                isError
                    ? 'border-l-red-400 dark:border-l-red-500'
                    : 'border-l-green-400 dark:border-l-green-500'
            }`}>
                <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-xs font-medium ${
                        isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                        tool_result{isError && ' (error)'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">for {toolResult.tool_use_id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded p-1.5 max-h-48 overflow-y-auto">
                    {toolResult.content}
                </pre>
            </div>
        );
    }

    // Unknown block type
    const unknownBlock = block as UnknownBlock;
    return (
        <div className="border-l-2 border-l-gray-300 dark:border-l-gray-600 pl-2 py-1">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{unknownBlock.type || 'unknown'}</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-48 overflow-y-auto">
                {JSON.stringify(block, null, 2)}
            </pre>
        </div>
    );
}
