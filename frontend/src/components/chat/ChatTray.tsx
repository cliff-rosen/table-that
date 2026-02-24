import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { XMarkIcon, ChatBubbleLeftRightIcon, PaperAirplaneIcon, PlusIcon, BugAntIcon } from '@heroicons/react/24/solid';

import { useChatContext } from '../../context/ChatContext';
import { trackEvent } from '../../lib/api/trackingApi';
import { getPayloadHandler } from '../../lib/chat'; // Import from index to trigger payload registration

import { InteractionType, PayloadHandler, ToolHistoryEntry, AgentTrace } from '../../types/chat';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import ToolResultCard, { ToolHistoryPanel } from './ToolResultCard';
import { DiagnosticsPanel } from './DiagnosticsPanel';

const STORAGE_KEY = 'chatTrayWidth';
const CHAT_ID_KEY = 'chatCurrentConversationId';

interface ChatTrayProps {
    initialContext?: Record<string, any>;
    payloadHandlers?: Record<string, PayloadHandler>;
    /** Hide the chat tray completely (used when modal takes over) */
    hidden?: boolean;
    /** Whether the chat tray is open */
    isOpen: boolean;
    /** Callback when user closes the chat (via X button) */
    onOpenChange: (open: boolean) => void;
    /** Default width in pixels (default: 420) */
    defaultWidth?: number;
    /** Minimum width in pixels (default: 320) */
    minWidth?: number;
    /** Maximum width in pixels (default: 600) */
    maxWidth?: number;
    /** Whether to allow resizing (default: true) */
    resizable?: boolean;
}

function getDefaultHeaderTitle(payloadType: string): string {
    const titles: Record<string, string> = {
        'schema_proposal': 'Schema Proposal',
        'presentation_categories': 'Presentation Categories',
        'stream_suggestions': 'Stream Suggestions',
        'portfolio_insights': 'Portfolio Insights',
        'quick_setup': 'Quick Setup',
        'validation_results': 'Validation Results',
        'import_suggestions': 'Import Suggestions'
    };
    return titles[payloadType] || 'Details';
}

function getDefaultHeaderIcon(payloadType: string): string {
    const icons: Record<string, string> = {
        'schema_proposal': '📋',
        'presentation_categories': '📊',
        'stream_suggestions': '💡',
        'portfolio_insights': '📊',
        'quick_setup': '🚀',
        'validation_results': '✅',
        'import_suggestions': '📥'
    };
    return icons[payloadType] || '✨';
}

/**
 * Button to view a payload from a message. Shows the payload's icon and title.
 */
function PayloadButton({
    payloadType,
    payloadData,
    messageIndex,
    payloadHandlers,
    onOpen
}: {
    payloadType: string;
    payloadData: unknown;
    messageIndex: number;
    payloadHandlers?: Record<string, PayloadHandler>;
    onOpen: (payload: { type: string; data: unknown; messageIndex: number }) => void;
}): React.ReactElement | null {
    const handler = payloadHandlers?.[payloadType] || getPayloadHandler(payloadType);
    if (!handler) return null;

    const opts = handler.renderOptions || {};
    return (
        <button
            type="button"
            onClick={() => onOpen({ type: payloadType, data: payloadData, messageIndex })}
            className="text-xs text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1"
        >
            {opts.headerIcon && <span>{opts.headerIcon}</span>}
            <span>View {opts.headerTitle || 'Result'}</span>
        </button>
    );
}

/**
 * Component that renders message content with tool markers replaced by ToolResultCard.
 * Handles mixed content: markdown text + inline tool cards.
 */
function MessageContent({
    content,
    toolHistory,
    compact = true,
    onToolClick
}: {
    content: string;
    toolHistory?: ToolHistoryEntry[];
    compact?: boolean;
    onToolClick?: (tool: ToolHistoryEntry) => void;
}) {
    type ParsedPart = { type: 'text'; content: string } | { type: 'tool'; toolIndex: number };

    const parsedParts = useMemo((): ParsedPart[] => {
        if (!toolHistory || toolHistory.length === 0) {
            return [{ type: 'text', content }];
        }

        const markerPattern = /\[\[tool:(\d+)\]\]/g;
        const parts: ParsedPart[] = [];
        let lastIndex = 0;
        let match;

        while ((match = markerPattern.exec(content)) !== null) {
            if (match.index > lastIndex) {
                parts.push({ type: 'text', content: content.slice(lastIndex, match.index) });
            }
            const toolIndex = parseInt(match[1], 10);
            if (toolHistory[toolIndex]) {
                parts.push({ type: 'tool', toolIndex });
            } else {
                parts.push({ type: 'text', content: match[0] });
            }
            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < content.length) {
            parts.push({ type: 'text', content: content.slice(lastIndex) });
        }

        return parts;
    }, [content, toolHistory]);

    // If no tool markers, just render markdown normally
    if (parsedParts.length === 1 && parsedParts[0].type === 'text') {
        return <MarkdownRenderer content={content} compact={compact} />;
    }

    // Render mixed content: markdown sections + tool cards
    return (
        <>
            {parsedParts.map((part, index) => {
                if (part.type === 'text') {
                    return part.content.trim() ? (
                        <MarkdownRenderer key={index} content={part.content} compact={compact} />
                    ) : null;
                }
                // It's a tool marker
                const tool = toolHistory![part.toolIndex];
                return (
                    <span key={index} className="inline-block my-1">
                        <ToolResultCard
                            tool={tool}
                            onClick={() => onToolClick?.(tool)}
                        />
                    </span>
                );
            })}
        </>
    );
}

export default function ChatTray({
    initialContext,
    payloadHandlers,
    hidden = false,
    isOpen,
    onOpenChange,
    defaultWidth = 420,
    minWidth = 320,
    maxWidth = 600,
    resizable = true
}: ChatTrayProps) {

    // Width state with localStorage persistence
    const [width, setWidth] = useState(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = parseInt(stored, 10);
                if (!isNaN(parsed) && parsed >= minWidth && parsed <= maxWidth) {
                    return parsed;
                }
            }
        }
        return defaultWidth;
    });

    // Resize handling
    const isResizing = useRef(false);
    const resizeHandleRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        isResizing.current = true;
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
    }, []);

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isResizing.current) return;
            const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
            setWidth(newWidth);
        };

        const handleMouseUp = () => {
            if (isResizing.current) {
                isResizing.current = false;
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
                // Save to localStorage
                localStorage.setItem(STORAGE_KEY, width.toString());
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
    }, [width, minWidth, maxWidth]);

    const { messages, sendMessage, isLoading, streamingText, statusText, activeToolProgress, cancelRequest, setContext, reset, loadMostRecent, loadChat, chatId, context } = useChatContext();
    const [input, setInput] = useState('');
    const [showDebug, setShowDebug] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    // Payload that's available but not yet opened by user
    const [pendingPayload, setPendingPayload] = useState<{ type: string; data: any; messageIndex: number } | null>(null);
    // Payload currently being displayed in the panel (user has clicked to view)
    const [activePayload, setActivePayload] = useState<{ type: string; data: any; messageIndex: number } | null>(null);
    // Track which message indices have had their payloads dismissed
    // Initialize with all existing payloads to prevent auto-opening old payloads on remount
    const [dismissedPayloads, setDismissedPayloads] = useState<Set<number>>(() => {
        const initialDismissed = new Set<number>();
        messages.forEach((msg, idx) => {
            if (msg.custom_payload?.type && msg.custom_payload.data) {
                initialDismissed.add(idx);
            }
        });
        return initialDismissed;
    });
    const [toolsToShow, setToolsToShow] = useState<ToolHistoryEntry[] | null>(null);
    const [toolsTrace, setToolsTrace] = useState<AgentTrace | undefined>(undefined);
    const [diagnosticsToShow, setDiagnosticsToShow] = useState<AgentTrace | null>(null);

    // Track previous values to detect changes (start with undefined to trigger initial set)
    const prevHiddenRef = useRef<boolean | undefined>(undefined);
    const prevInitialContextRef = useRef<Record<string, any> | undefined>(undefined);

    // Replace context when initialContext changes OR when tray becomes visible again
    useEffect(() => {
        const wasHidden = prevHiddenRef.current;
        const prevContext = prevInitialContextRef.current;

        // Update refs for next comparison
        prevHiddenRef.current = hidden;
        prevInitialContextRef.current = initialContext;

        if (!initialContext) return;

        // Update context when:
        // 1. First render (prevContext is undefined)
        // 2. Becoming visible after being hidden (e.g., modal closed)
        // 3. initialContext actually changed (deep compare by JSON)
        const isFirstRender = prevContext === undefined;
        const becameVisible = !hidden && wasHidden === true;
        const contextChanged = JSON.stringify(initialContext) !== JSON.stringify(prevContext);

        if (isFirstRender || becameVisible || contextChanged) {
            setContext(initialContext);
        }
    }, [hidden, initialContext, setContext]);

    // Track if we've loaded the initial conversation
    const hasLoadedInitial = useRef(false);

    // Load conversation when tray opens for the first time
    // Check sessionStorage to restore previous state (including "new chat" state)
    useEffect(() => {
        if (isOpen && !hasLoadedInitial.current) {
            hasLoadedInitial.current = true;
            const storedChatId = sessionStorage.getItem(CHAT_ID_KEY);

            if (storedChatId === 'new') {
                // User explicitly started a new chat - stay empty
                return;
            } else if (storedChatId) {
                // Load the specific conversation they were viewing
                const chatId = parseInt(storedChatId, 10);
                if (!isNaN(chatId)) {
                    loadChat(chatId);
                    return;
                }
            }
            // No stored state - load most recent
            loadMostRecent();
        }
    }, [isOpen, loadMostRecent, loadChat]);

    // Sync chatId to sessionStorage when a conversation is created or loaded
    // This ensures refresh loads the correct conversation
    useEffect(() => {
        // Only sync after initial load is complete
        if (!hasLoadedInitial.current) return;

        if (chatId !== null) {
            // A conversation exists - save its ID
            sessionStorage.setItem(CHAT_ID_KEY, chatId.toString());
        }
        // Note: We don't clear on chatId === null here because reset() handles that
        // by explicitly setting 'new' in sessionStorage
    }, [chatId]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingText]);

    // Detect new payloads and auto-open the panel
    // Payloads come through custom_payload regardless of source (tool or LLM)
    useEffect(() => {
        const messageIndex = messages.length - 1;
        const latestMessage = messages[messageIndex];
        if (!latestMessage) return;

        // Check custom_payload - this is where all payloads arrive (from tools or LLM)
        if (latestMessage.custom_payload?.type && latestMessage.custom_payload.data) {
            const payloadType = latestMessage.custom_payload.type;

            // Check if we have a handler for this payload type (local or global)
            const hasLocalHandler = payloadHandlers && payloadHandlers[payloadType];
            const hasGlobalHandler = getPayloadHandler(payloadType);

            // Auto-open if we have a handler and haven't dismissed this payload
            if ((hasLocalHandler || hasGlobalHandler) && !dismissedPayloads.has(messageIndex)) {
                setPendingPayload({
                    type: payloadType,
                    data: latestMessage.custom_payload.data,
                    messageIndex
                });
                // Auto-open the payload panel
                setActivePayload({
                    type: payloadType,
                    data: latestMessage.custom_payload.data,
                    messageIndex
                });
            }
        }
    }, [messages, payloadHandlers, dismissedPayloads]);

    // Handle opening the payload panel
    const handleOpenPayload = useCallback(() => {
        if (pendingPayload) {
            setActivePayload({
                type: pendingPayload.type,
                data: pendingPayload.data,
                messageIndex: pendingPayload.messageIndex
            });
        }
    }, [pendingPayload]);

    // Handle closing/dismissing the payload panel
    const handleClosePayload = useCallback(() => {
        // Mark this payload as dismissed so it won't re-appear
        // Use messageIndex from either pendingPayload or activePayload
        const messageIndex = pendingPayload?.messageIndex ?? activePayload?.messageIndex;
        if (messageIndex !== undefined) {
            setDismissedPayloads(prev => new Set(prev).add(messageIndex));
        }
        setActivePayload(null);
        setPendingPayload(null);
    }, [pendingPayload, activePayload]);

    // Handle full chat reset - clears messages and all payload state
    const handleReset = useCallback(() => {
        reset();
        setPendingPayload(null);
        setActivePayload(null);
        setDismissedPayloads(new Set());
        // Persist "new chat" state so refresh doesn't reload old conversation
        sessionStorage.setItem(CHAT_ID_KEY, 'new');
        // Focus the input after reset
        setTimeout(() => inputRef.current?.focus(), 0);
    }, [reset]);

    // Auto-focus input when tray opens, close payload panel when tray closes
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        } else if (!isOpen) {
            // Close payload panel when tray closes to prevent stale state
            setActivePayload(null);
        }
    }, [isOpen]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (input.trim() && !isLoading) {
            trackEvent('chat_message_send', { page: initialContext?.current_page });
            sendMessage(input.trim(), InteractionType.TEXT_INPUT);
            setInput('');
        }
    };

    const handleValueSelect = (value: string) => {
        sendMessage(value, InteractionType.VALUE_SELECTED);
    };

    const handleActionClick = async (action: any) => {
        if (action.handler === 'client') {
            // Handle client-side actions
            console.log('Client action:', action);

            // Execute the client action
            switch (action.action) {
                case 'close_chat':
                    onOpenChange(false);
                    break;
                // Add more client action handlers as needed
                default:
                    console.warn('Unknown client action:', action.action);
            }
        } else {
            // Send server action
            await sendMessage(
                action.label,
                InteractionType.ACTION_EXECUTED,
                {
                    action_identifier: action.action,
                    action_data: action.data
                }
            );
        }
    };

    // Don't render anything if hidden
    if (hidden) {
        return null;
    }

    // Inline-only mode: always renders as a flex child in a flex container
    // Width collapses to 0 when closed, expands when open
    const trayClasses = `h-full bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden transition-[width] duration-300 ease-in-out relative ${isOpen ? 'shadow-lg' : ''}`;
    const trayStyle = { width: isOpen ? `${width}px` : '0px', minWidth: isOpen ? `${minWidth}px` : '0px' };

    return (
        <>
            {/* Chat Tray - inline mode only */}
            <div className={trayClasses} style={trayStyle}>
                {/* Inner container with fixed width to prevent content collapse during transition */}
                <div className="flex flex-col h-full" style={{ width: `${width}px` }}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                        <div className="flex items-center gap-2">
                            <ChatBubbleLeftRightIcon className="h-5 w-5 text-blue-600" />
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Chat Assistant
                            </h3>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                onClick={() => setShowDebug(!showDebug)}
                                className={`p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors ${showDebug ? 'bg-gray-200 dark:bg-gray-700' : ''}`}
                                aria-label="Toggle debug info"
                                title="Toggle debug info"
                            >
                                <BugAntIcon className={`h-5 w-5 ${showDebug ? 'text-orange-500' : 'text-gray-500 dark:text-gray-400'}`} />
                            </button>
                            <button
                                type="button"
                                onClick={handleReset}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                aria-label="New conversation"
                                title="New conversation"
                            >
                                <PlusIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                            </button>
                            <button
                                type="button"
                                onClick={() => onOpenChange(false)}
                                className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                aria-label="Close chat"
                            >
                                <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                            </button>
                        </div>
                    </div>

                    {/* Debug Context Panel */}
                    {showDebug && (
                        <div className="border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20 p-3 max-h-48 overflow-y-auto">
                            <div className="text-xs font-mono">
                                <div className="font-semibold text-orange-800 dark:text-orange-200 mb-1">Current Context:</div>
                                <pre className="text-orange-700 dark:text-orange-300 whitespace-pre-wrap break-all">
                                    {JSON.stringify(context, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                        {messages.length === 0 && (
                            <div className="text-center text-gray-500 dark:text-gray-400 mt-8">
                                <ChatBubbleLeftRightIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">Start a new conversation</p>
                                <p className="text-xs mt-1 opacity-75">Ask me anything about the application</p>
                            </div>
                        )}

                        {messages.map((message, idx) => (
                            <div key={idx}>
                                <div
                                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'
                                        }`}
                                >
                                    <div
                                        className={`max-w-[85%] rounded-lg px-4 py-2 ${message.role === 'user'
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow'
                                            }`}
                                    >
                                        <div className="text-sm">
                                            <MessageContent
                                                content={message.content}
                                                toolHistory={message.tool_history}
                                                compact
                                                onToolClick={(tool) => { setToolsToShow([tool]); setToolsTrace(message.diagnostics); }}
                                            />
                                        </div>
                                        <p className="text-xs opacity-70 mt-1">
                                            {new Date(message.timestamp).toLocaleTimeString()}
                                        </p>
                                        {/* Tool history, diagnostics, and payload buttons */}
                                        <div className="flex items-center gap-3 mt-2">
                                            <>
                                                {message.tool_history && message.tool_history.length > 0 && (
                                                    <button
                                                        type="button"
                                                        onClick={() => { setToolsToShow(message.tool_history!); setToolsTrace(message.diagnostics); }}
                                                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                                    >
                                                        View {message.tool_history.length} tool{message.tool_history.length > 1 ? 's' : ''}
                                                    </button>
                                                )}
                                                {message.diagnostics && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setDiagnosticsToShow(message.diagnostics!)}
                                                        className="text-xs text-orange-600 dark:text-orange-400 hover:underline flex items-center gap-1"
                                                    >
                                                        <BugAntIcon className="h-3 w-3" />
                                                        <span>Diagnostics</span>
                                                    </button>
                                                )}
                                                {message.custom_payload?.type && message.custom_payload.data && (
                                                    <PayloadButton
                                                        payloadType={message.custom_payload.type}
                                                        payloadData={message.custom_payload.data}
                                                        messageIndex={idx}
                                                        payloadHandlers={payloadHandlers}
                                                        onOpen={setActivePayload}
                                                    />
                                                )}
                                            </>
                                        </div>
                                    </div>
                                </div>

                                {/* Context length warning */}
                                {message.warning && (
                                    <div className="mt-2 ml-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 rounded-md text-xs text-amber-800 dark:text-amber-200">
                                        {message.warning}
                                    </div>
                                )}

                                {/* Suggested Values */}
                                {message.suggested_values && message.suggested_values.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3 ml-2">
                                        {message.suggested_values.map((suggestion, sIdx) => (
                                            <button
                                                type="button"
                                                key={sIdx}
                                                onClick={() => handleValueSelect(suggestion.value)}
                                                disabled={isLoading}
                                                className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full text-sm hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                            >
                                                {suggestion.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* Suggested Actions */}
                                {message.suggested_actions && message.suggested_actions.length > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-3 ml-2">
                                        {message.suggested_actions.map((action, aIdx) => (
                                            <button
                                                type="button"
                                                key={aIdx}
                                                onClick={() => handleActionClick(action)}
                                                disabled={isLoading}
                                                className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${action.style === 'primary'
                                                    ? 'bg-green-600 hover:bg-green-700 text-white'
                                                    : action.style === 'warning'
                                                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                                                        : 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white'
                                                    }`}
                                            >
                                                {action.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                            </div>
                        ))}

                        {/* Streaming message */}
                        {streamingText && (
                            <div className="flex justify-start">
                                <div className="max-w-[85%] rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white shadow">
                                    <div className="text-sm">
                                        <MarkdownRenderer content={streamingText} compact />
                                    </div>
                                    <div className="flex items-center gap-1 mt-1">
                                        <div className="animate-pulse flex gap-1">
                                            <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                                            <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                                            <div className="w-1 h-1 bg-blue-600 rounded-full"></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Tool progress indicator - shown during tool execution even with streaming text */}
                        {isLoading && activeToolProgress && (
                            <div className="flex justify-start">
                                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-2">
                                    <div className="flex items-center gap-2">
                                        <div className="animate-spin h-4 w-4 border-2 border-amber-500 border-t-transparent rounded-full"></div>
                                        <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                                            {activeToolProgress.toolName.replace(/_/g, ' ')}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={cancelRequest}
                                            className="ml-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                            title="Cancel"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                    {activeToolProgress.updates.length > 0 && (
                                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                            {activeToolProgress.updates[activeToolProgress.updates.length - 1]?.message}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Thinking indicator - only when no streaming text and no active tool */}
                        {isLoading && !streamingText && !activeToolProgress && (
                            <div className="flex justify-start">
                                <div className="bg-white dark:bg-gray-800 rounded-lg px-4 py-2 shadow">
                                    <div className="flex items-center gap-2">
                                        <div className="animate-pulse flex gap-1">
                                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                                        </div>
                                        <span className="text-sm text-gray-600 dark:text-gray-400">
                                            {statusText || 'Thinking...'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={cancelRequest}
                                            className="ml-2 text-xs text-gray-400 hover:text-red-500 transition-colors"
                                            title="Cancel"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Pending Payload Notification - shows when there's a payload ready to view */}
                        {pendingPayload && !activePayload && (() => {
                            const handler = payloadHandlers?.[pendingPayload.type] || getPayloadHandler(pendingPayload.type);
                            const renderOptions = handler?.renderOptions || {};
                            const headerTitle = renderOptions.headerTitle || getDefaultHeaderTitle(pendingPayload.type);
                            const headerIcon = renderOptions.headerIcon || getDefaultHeaderIcon(pendingPayload.type);

                            return (
                                <div className="mx-2 mb-2">
                                    <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <span className="text-lg flex-shrink-0">{headerIcon}</span>
                                                <span className="text-sm font-medium text-blue-900 dark:text-blue-100 truncate">
                                                    {headerTitle} ready
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <button
                                                    type="button"
                                                    onClick={handleOpenPayload}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={handleClosePayload}
                                                    className="p-1 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors"
                                                    title="Dismiss"
                                                >
                                                    <XMarkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })()}

                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input */}
                    <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <input
                                ref={inputRef}
                                type="text"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                                placeholder="Type your message..."
                                className={`flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLoading ? 'opacity-50' : ''}`}
                            />
                            <button
                                type="submit"
                                disabled={!input.trim() || isLoading}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <PaperAirplaneIcon className="h-4 w-4" />
                            </button>
                        </form>
                    </div>
                </div>

                {/* Resize Handle */}
                {resizable && isOpen && (
                    <div
                        ref={resizeHandleRef}
                        onMouseDown={handleMouseDown}
                        className="absolute top-0 right-0 w-1 h-full cursor-ew-resize hover:bg-blue-500 transition-colors group"
                        title="Drag to resize"
                    >
                        <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-4 h-8 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <div className="w-1 h-6 bg-blue-500 rounded-full" />
                        </div>
                    </div>
                )}
            </div>

            {/* Floating Payload Panel - positioned next to chat tray */}
            {activePayload && (() => {
                // Check local handlers first, then fall back to global registry
                const handler = payloadHandlers?.[activePayload.type] || getPayloadHandler(activePayload.type);
                const renderOptions = handler?.renderOptions || {};
                const panelWidth = renderOptions.panelWidth || '500px';
                const headerTitle = renderOptions.headerTitle || getDefaultHeaderTitle(activePayload.type);
                const headerIcon = renderOptions.headerIcon || getDefaultHeaderIcon(activePayload.type);

                return (
                    <div
                        className="h-full bg-white dark:bg-gray-800 shadow-xl border-r border-gray-200 dark:border-gray-700 flex-shrink-0 overflow-hidden"
                        style={{ width: panelWidth }}
                    >
                        <div className="flex flex-col h-full">
                            {/* Header */}
                            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                    <span>{headerIcon}</span>
                                    {headerTitle}
                                </h3>
                                <button
                                    type="button"
                                    onClick={handleClosePayload}
                                    className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                                    aria-label="Close panel"
                                >
                                    <XMarkIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                                </button>
                            </div>

                            {/* Payload Content - scrollable area for card content */}
                            <div className="flex-1 min-h-0 p-4 overflow-y-auto">
                                {handler ? (
                                    handler.render(activePayload.data, {
                                        onAccept: (data) => {
                                            if (handler.onAccept) {
                                                handler.onAccept(data);
                                            }
                                            handleClosePayload();
                                        },
                                        onReject: () => {
                                            if (handler.onReject) {
                                                handler.onReject(activePayload.data);
                                            }
                                            handleClosePayload();
                                        }
                                    })
                                ) : (
                                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                                        <p>No handler configured for payload type: {activePayload.type}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Tool History Panel */}
            {toolsToShow && (
                <ToolHistoryPanel
                    tools={toolsToShow}
                    trace={toolsTrace}
                    onClose={() => { setToolsToShow(null); setToolsTrace(undefined); }}
                />
            )}

            {/* Diagnostics Panel */}
            {diagnosticsToShow && (
                <DiagnosticsPanel
                    diagnostics={diagnosticsToShow}
                    onClose={() => setDiagnosticsToShow(null)}
                />
            )}
        </>
    );
}
