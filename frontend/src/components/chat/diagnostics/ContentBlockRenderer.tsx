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
            <div className="bg-white dark:bg-gray-800 rounded p-2 border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">text</div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-64 overflow-y-auto">
                    {textBlock.text}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_use' && 'name' in block) {
        const toolUse = block as ToolUseBlock;
        return (
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded p-2 border border-blue-200 dark:border-blue-800">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">tool_use</span>
                    <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">{toolUse.name}</span>
                    <span className="text-xs text-gray-400 font-mono">{toolUse.id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 max-h-48 overflow-y-auto">
                    {JSON.stringify(toolUse.input, null, 2)}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_result' && 'tool_use_id' in block) {
        const toolResult = block as ToolResultBlock;
        const isError = toolResult.is_error === true;
        return (
            <div className={`rounded p-2 border ${
                isError
                    ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
            }`}>
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium ${
                        isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                    }`}>
                        tool_result{isError && ' (error)'}
                    </span>
                    <span className="text-xs text-gray-400 font-mono">for {toolResult.tool_use_id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 max-h-48 overflow-y-auto">
                    {toolResult.content}
                </pre>
            </div>
        );
    }

    // Unknown block type
    const unknownBlock = block as UnknownBlock;
    return (
        <div className="bg-gray-100 dark:bg-gray-700 rounded p-2 border border-gray-200 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">{unknownBlock.type || 'unknown'}</div>
            <pre className="text-xs font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 max-h-48 overflow-y-auto">
                {JSON.stringify(block, null, 2)}
            </pre>
        </div>
    );
}
