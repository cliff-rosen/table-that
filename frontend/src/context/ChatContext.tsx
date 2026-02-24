import React, { createContext, useContext, useState, useCallback, useRef } from 'react';
import { chatApi } from '../lib/api/chatApi';
import {
    ChatMessage,
    InteractionType,
    ActionMetadata,
    ToolProgressEvent,
} from '../types/chat';

export interface ActiveToolProgress {
    toolName: string;
    updates: ToolProgressEvent[];
}

interface ChatContextType {
    // Chat state
    messages: ChatMessage[];
    context: Record<string, unknown>;
    isLoading: boolean;
    error: string | null;
    streamingText: string;
    statusText: string | null;
    activeToolProgress: ActiveToolProgress | null;
    chatId: number | null;
    // Chat actions
    sendMessage: (content: string, interactionType?: InteractionType, actionMetadata?: ActionMetadata) => Promise<void>;
    cancelRequest: () => void;
    updateContext: (updates: Record<string, unknown>) => void;
    setContext: (newContext: Record<string, unknown>) => void;
    reset: () => void;
    loadChat: (id: number) => Promise<boolean>;
    loadMostRecent: () => Promise<boolean>;
}

const ChatContext = createContext<ChatContextType | null>(null);

interface ChatProviderProps {
    children: React.ReactNode;
    /** App identifier for scoping conversations (default: 'kh') */
    app?: 'kh' | 'tablizer' | 'trialscout';
}

export function ChatProvider({ children, app = 'kh' }: ChatProviderProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [context, setContext] = useState<Record<string, unknown>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [statusText, setStatusText] = useState<string | null>(null);
    const [chatId, setChatId] = useState<number | null>(null);
    const [activeToolProgress, setActiveToolProgress] = useState<ActiveToolProgress | null>(null);

    const abortControllerRef = useRef<AbortController | null>(null);

    const sendMessage = useCallback(async (
        content: string,
        interactionType: InteractionType = InteractionType.TEXT_INPUT,
        actionMetadata?: ActionMetadata
    ) => {
        const userMessage: ChatMessage = {
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        };
        setMessages(prev => [...prev, userMessage]);

        setIsLoading(true);
        setError(null);
        setStreamingText('');
        setStatusText(null);
        setActiveToolProgress(null);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        let collectedText = '';

        try {
            for await (const event of chatApi.streamMessage({
                message: content,
                context,
                interaction_type: interactionType,
                action_metadata: actionMetadata,
                conversation_id: chatId
            }, abortController.signal)) {
                switch (event.type) {
                    case 'text_delta':
                        setStatusText(null);
                        collectedText += event.text;
                        setStreamingText(collectedText);
                        break;

                    case 'status':
                        setStatusText(event.message);
                        break;

                    case 'tool_start':
                        setStatusText(`Running ${event.tool.replace(/_/g, ' ')}...`);
                        setActiveToolProgress({ toolName: event.tool, updates: [] });
                        break;

                    case 'tool_progress':
                        setActiveToolProgress(prev => {
                            if (prev && prev.toolName === event.tool) {
                                return { ...prev, updates: [...prev.updates, event] };
                            }
                            return { toolName: event.tool, updates: [event] };
                        });
                        break;

                    case 'tool_complete':
                        setActiveToolProgress(null);
                        setStatusText(null);
                        break;

                    case 'complete': {
                        const responsePayload = event.payload;

                        const assistantMessage: ChatMessage = {
                            role: 'assistant',
                            content: responsePayload.message,
                            timestamp: new Date().toISOString(),
                            suggested_values: responsePayload.suggested_values,
                            suggested_actions: responsePayload.suggested_actions,
                            custom_payload: responsePayload.custom_payload,
                            tool_history: responsePayload.tool_history,
                            warning: responsePayload.warning,
                            diagnostics: responsePayload.diagnostics
                        };
                        setMessages(prev => [...prev, assistantMessage]);
                        setStreamingText('');
                        setStatusText(null);

                        if (responsePayload.conversation_id) {
                            setChatId(responsePayload.conversation_id);
                        }
                        break;
                    }

                    case 'error':
                        setError(event.message);
                        const errorMessage: ChatMessage = {
                            role: 'assistant',
                            content: `**Error:** ${event.message}\n\nPlease try again or check your API configuration.`,
                            timestamp: new Date().toISOString()
                        };
                        setMessages(prev => [...prev, errorMessage]);
                        setStreamingText('');
                        setStatusText(null);
                        setActiveToolProgress(null);
                        break;

                    case 'cancelled':
                        setStatusText('Cancelled');
                        break;
                }
            }

        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                if (collectedText) {
                    const cancelledMessage: ChatMessage = {
                        role: 'assistant',
                        content: collectedText + '\n\n*[Response cancelled]*',
                        timestamp: new Date().toISOString()
                    };
                    setMessages(prev => [...prev, cancelledMessage]);
                }
                setStreamingText('');
                setStatusText(null);
                setActiveToolProgress(null);
                return;
            }

            const errorMessage = err instanceof Error ? err.message : 'An error occurred';
            setError(errorMessage);

            const errorMsg: ChatMessage = {
                role: 'assistant',
                content: 'Sorry, something went wrong. Please try again.',
                timestamp: new Date().toISOString()
            };
            setMessages(prev => [...prev, errorMsg]);
            setStreamingText('');
        } finally {
            setIsLoading(false);
            abortControllerRef.current = null;
        }
    }, [context, chatId]);

    const cancelRequest = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    const updateContext = useCallback((updates: Record<string, unknown>) => {
        setContext(prev => ({ ...prev, ...updates }));
    }, []);

    const replaceContext = useCallback((newContext: Record<string, unknown>) => {
        setContext(newContext);
    }, []);

    const reset = useCallback(() => {
        setMessages([]);
        setError(null);
        setChatId(null);
    }, []);

    const loadChat = useCallback(async (id: number) => {
        try {
            const chat = await chatApi.getChat(id);
            const loadedMessages: ChatMessage[] = chat.messages
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(msg => ({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    timestamp: msg.created_at,
                    // Include extras if present
                    ...(msg.extras?.suggested_values && { suggested_values: msg.extras.suggested_values }),
                    ...(msg.extras?.suggested_actions && { suggested_actions: msg.extras.suggested_actions }),
                    ...(msg.extras?.tool_history && { tool_history: msg.extras.tool_history }),
                    ...(msg.extras?.custom_payload && { custom_payload: msg.extras.custom_payload }),
                    // Check both trace (stored name) and diagnostics (legacy/stream name)
                    ...((msg.extras?.trace || msg.extras?.diagnostics) && {
                        diagnostics: msg.extras.trace || msg.extras.diagnostics
                    }),
                }));
            setMessages(loadedMessages);
            setChatId(id);
            setError(null);
            return true;
        } catch (err) {
            console.error('Failed to load chat:', err);
            return false;
        }
    }, []);

    const loadMostRecent = useCallback(async () => {
        try {
            const { chats } = await chatApi.listChats(1, 0, app);
            if (chats.length > 0) {
                return await loadChat(chats[0].id);
            }
            return false;
        } catch (err) {
            console.error('Failed to load most recent chat:', err);
            return false;
        }
    }, [loadChat, app]);

    return (
        <ChatContext.Provider value={{
            messages,
            context,
            isLoading,
            error,
            streamingText,
            statusText,
            activeToolProgress,
            chatId,
            sendMessage,
            cancelRequest,
            updateContext,
            setContext: replaceContext,
            reset,
            loadChat,
            loadMostRecent
        }}>
            {children}
        </ChatContext.Provider>
    );
}

export function useChatContext() {
    const context = useContext(ChatContext);
    if (!context) {
        throw new Error('useChatContext must be used within a ChatProvider');
    }
    return context;
}
