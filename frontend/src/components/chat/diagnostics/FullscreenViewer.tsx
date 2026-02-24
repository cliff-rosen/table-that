/**
 * Fullscreen viewer for diagnostics content with rendered/raw toggle
 */
import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/solid';
import { FullscreenContent, ContentBlock, TextBlock, ToolUseBlock, ToolResultBlock, UnknownBlock, ROLE_STYLES, normalizeContent } from './types';

interface FullscreenViewerProps {
    content: FullscreenContent;
    onClose: () => void;
}

export function FullscreenViewer({ content, onClose }: FullscreenViewerProps) {
    const [viewMode, setViewMode] = useState<'rendered' | 'raw'>('rendered');

    const hasRenderedView = content.type === 'messages' || content.type === 'blocks';
    const rawContent = content.type === 'raw'
        ? content.content
        : content.type === 'messages'
        ? JSON.stringify(content.messages, null, 2)
        : JSON.stringify(content.blocks, null, 2);

    return (
        <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-5xl h-[calc(100vh-4rem)] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{content.title}</h3>
                    <div className="flex items-center gap-4">
                        {hasRenderedView && (
                            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                <button
                                    onClick={() => setViewMode('rendered')}
                                    className={`px-3 py-1 text-sm rounded ${
                                        viewMode === 'rendered'
                                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    Rendered
                                </button>
                                <button
                                    onClick={() => setViewMode('raw')}
                                    className={`px-3 py-1 text-sm rounded ${
                                        viewMode === 'raw'
                                            ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                    }`}
                                >
                                    Raw JSON
                                </button>
                            </div>
                        )}
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 dark:hover:text-white p-2"
                        >
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>
                </div>
                {/* Content */}
                <div className="flex-1 min-h-0 overflow-auto p-6">
                    {viewMode === 'raw' || !hasRenderedView ? (
                        <div className="max-w-4xl mx-auto">
                            <pre className="text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                                {rawContent}
                            </pre>
                        </div>
                    ) : content.type === 'messages' ? (
                        <FullscreenMessagesList messages={content.messages} />
                    ) : (
                        <FullscreenBlocksList blocks={content.blocks} />
                    )}
                </div>
            </div>
        </div>
    );
}

// Rendered messages list for fullscreen view
function FullscreenMessagesList({ messages }: { messages: Array<Record<string, unknown>> }) {
    return (
        <div className="space-y-3 max-w-4xl mx-auto">
            {messages.map((msg, idx) => (
                <FullscreenMessageItem key={idx} index={idx} message={msg} />
            ))}
        </div>
    );
}

function FullscreenMessageItem({ index, message }: { index: number; message: Record<string, unknown> }) {
    const role = (message.role as string) || 'unknown';
    const blocks = normalizeContent(message.content);
    const roleStyle = ROLE_STYLES[role] || { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-300' };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-600">
                <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{index}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleStyle.bg} ${roleStyle.text}`}>
                    {role}
                </span>
            </div>
            <div className="p-4 space-y-3">
                {blocks.map((block, blockIdx) => (
                    <FullscreenContentBlock key={blockIdx} block={block} />
                ))}
            </div>
        </div>
    );
}

function FullscreenContentBlock({ block }: { block: ContentBlock }) {
    if (block.type === 'text' && 'text' in block) {
        const textBlock = block as TextBlock;
        return (
            <div className="bg-gray-50 dark:bg-gray-900 rounded p-3 border border-gray-200 dark:border-gray-700">
                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">text</div>
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                    {textBlock.text}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_use' && 'name' in block) {
        const toolUse = block as ToolUseBlock;
        return (
            <div className="bg-blue-50 dark:bg-blue-900/30 rounded p-3 border border-blue-200 dark:border-blue-700">
                <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">tool_use</span>
                    <span className="text-sm font-mono font-semibold text-blue-700 dark:text-blue-300">{toolUse.name}</span>
                    <span className="text-xs text-gray-500 font-mono">{toolUse.id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                    {JSON.stringify(toolUse.input, null, 2)}
                </pre>
            </div>
        );
    }

    if (block.type === 'tool_result' && 'tool_use_id' in block) {
        const toolResult = block as ToolResultBlock;
        const isError = toolResult.is_error === true;
        return (
            <div className={`rounded p-3 border ${
                isError
                    ? 'bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-700'
                    : 'bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-700'
            }`}>
                <div className="flex items-center gap-2 mb-2">
                    <span className={`text-xs font-medium ${isError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        tool_result{isError && ' (error)'}
                    </span>
                    <span className="text-xs text-gray-500 font-mono">for {toolResult.tool_use_id?.slice(0, 12)}...</span>
                </div>
                <pre className="text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200 bg-white dark:bg-gray-900 rounded p-2 border border-gray-200 dark:border-gray-700">
                    {toolResult.content}
                </pre>
            </div>
        );
    }

    // Unknown block type
    const unknownBlock = block as UnknownBlock;
    return (
        <div className="bg-gray-100 dark:bg-gray-700 rounded p-3 border border-gray-200 dark:border-gray-600">
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">{unknownBlock.type || 'unknown'}</div>
            <pre className="text-sm font-mono whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                {JSON.stringify(block, null, 2)}
            </pre>
        </div>
    );
}

// Rendered content blocks for fullscreen view
function FullscreenBlocksList({ blocks }: { blocks: Array<Record<string, unknown>> }) {
    return (
        <div className="space-y-3 max-w-4xl mx-auto">
            {blocks.map((block, idx) => (
                <FullscreenContentBlock key={idx} block={block as ContentBlock} />
            ))}
        </div>
    );
}
