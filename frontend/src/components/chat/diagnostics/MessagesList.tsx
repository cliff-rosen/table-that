/**
 * Message list with expandable items showing content blocks
 */
import { useState } from 'react';
import { ChevronDownIcon, ChevronRightIcon, ArrowsPointingOutIcon } from '@heroicons/react/24/solid';
import { FullscreenContent, ContentBlock, ROLE_STYLES, normalizeContent, getContentSummary } from './types';
import { ContentBlockRenderer } from './ContentBlockRenderer';

interface MessagesListProps {
    messages: Array<Record<string, unknown>>;
    onFullscreen: (content: FullscreenContent) => void;
}

export function MessagesList({ messages, onFullscreen }: MessagesListProps) {
    return (
        <div className="space-y-2">
            {messages.map((msg, idx) => (
                <MessageItem key={idx} index={idx} message={msg} onFullscreen={onFullscreen} />
            ))}
        </div>
    );
}

interface MessageItemProps {
    index: number;
    message: Record<string, unknown>;
    onFullscreen: (content: FullscreenContent) => void;
}

function MessageItem({ index, message, onFullscreen }: MessageItemProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    const role = (message.role as string) || 'unknown';
    const blocks = normalizeContent(message.content);
    const summary = getContentSummary(blocks);
    const roleStyle = ROLE_STYLES[role] || { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-800 dark:text-gray-400' };

    return (
        <div className="border border-gray-200 dark:border-gray-600 rounded overflow-hidden">
            {/* Header - always visible */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="w-full flex items-center gap-2 p-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
                {isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                ) : (
                    <ChevronRightIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                )}
                <span className="text-xs text-gray-400 w-5 flex-shrink-0">{index}</span>
                <span className={`px-2 py-0.5 rounded text-xs font-medium flex-shrink-0 ${roleStyle.bg} ${roleStyle.text}`}>
                    {role}
                </span>
                {summary.badges.map((badge, i) => (
                    <span key={i} className="px-1.5 py-0.5 rounded text-xs bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 flex-shrink-0">
                        {badge}
                    </span>
                ))}
                <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                    {summary.text}
                </span>
            </button>

            {/* Expanded content */}
            {isExpanded && (
                <div className="border-t border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 p-2 relative">
                    <button
                        onClick={() => onFullscreen({
                            type: 'blocks',
                            title: `Message ${index} (${role})`,
                            blocks: blocks as Array<Record<string, unknown>>
                        })}
                        className="absolute top-2 right-2 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 z-10"
                        title="View fullscreen"
                    >
                        <ArrowsPointingOutIcon className="h-4 w-4" />
                    </button>
                    <div className="space-y-2">
                        {blocks.map((block, blockIdx) => (
                            <ContentBlockRenderer key={blockIdx} block={block} />
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
