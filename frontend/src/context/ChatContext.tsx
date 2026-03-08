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

/** A proposal that the AI has sent and the user hasn't yet accepted or dismissed. */
export interface PendingProposal {
    /** 'data' for DATA_PROPOSAL, 'schema' for SCHEMA_PROPOSAL update, 'schema_create' for SCHEMA_PROPOSAL create */
    kind: 'data' | 'schema' | 'schema_create';
    /** The payload type string from custom_payload.type */
    payloadType: string;
    /** The proposal data from custom_payload.data */
    data: unknown;
    /** Index of the message in the messages array that carries this proposal */
    messageIndex: number;
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
    guestLimitReached: boolean;
    pendingProposal: PendingProposal | null;
    /** Message content restored to input after cancel before backend confirmed. */
    restoredInput: string | null;
    // Chat actions
    sendMessage: (content: string, interactionType?: InteractionType, actionMetadata?: ActionMetadata, options?: { newConversation?: boolean }) => Promise<void>;
    resetGuestLimit: () => void;
    cancelRequest: () => void;
    resolveProposal: () => void;
    clearRestoredInput: () => void;
    updateContext: (updates: Record<string, unknown>) => void;
    setContext: (newContext: Record<string, unknown>) => void;
    reset: () => void;
    /** Load (or create) the conversation for the current page context. */
    loadForContext: (currentPage: string, tableId?: number) => Promise<boolean>;
}

const ChatContext = createContext<ChatContextType | null>(null);

interface ChatProviderProps {
    children: React.ReactNode;
    /** App identifier for scoping conversations (default: 'table_that') */
    app?: 'table_that';
}

export function ChatProvider({ children, app = 'table_that' }: ChatProviderProps) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [context, setContextState] = useState<Record<string, unknown>>({});
    const contextRef = useRef<Record<string, unknown>>({});
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [streamingText, setStreamingText] = useState('');
    const [statusText, setStatusText] = useState<string | null>(null);
    const [chatId, setChatIdState] = useState<number | null>(null);
    const chatIdRef = useRef<number | null>(null);
    const [activeToolProgress, setActiveToolProgress] = useState<ActiveToolProgress | null>(null);
    const [guestLimitReached, setGuestLimitReached] = useState(false);
    const [pendingProposal, setPendingProposal] = useState<PendingProposal | null>(null);
    const pendingProposalRef = useRef<PendingProposal | null>(null);
    const [restoredInput, setRestoredInput] = useState<string | null>(null);

    // Track what context we last loaded for, to avoid redundant loads
    const lastLoadedPageRef = useRef<string | null>(null);
    const lastLoadedTableIdRef = useRef<number | undefined>(undefined);

    const setChatId = useCallback((id: number | null) => {
        chatIdRef.current = id;
        setChatIdState(id);
    }, []);

    const abortControllerRef = useRef<AbortController | null>(null);

    /** Classify a custom_payload into a PendingProposal kind, or null if not a proposal. */
    const classifyProposal = useCallback((payload: { type: string; data: any }): PendingProposal['kind'] | null => {
        if (payload.type === 'data_proposal') return 'data';
        if (payload.type === 'schema_proposal') {
            return payload.data?.mode === 'create' ? 'schema_create' : 'schema';
        }
        return null;
    }, []);

    const setProposal = useCallback((p: PendingProposal | null) => {
        pendingProposalRef.current = p;
        setPendingProposal(p);
    }, []);

    const resolveProposal = useCallback(() => {
        setProposal(null);
    }, [setProposal]);

    const sendMessage = useCallback(async (
        content: string,
        interactionType: InteractionType = InteractionType.TEXT_INPUT,
        actionMetadata?: ActionMetadata,
        options?: { newConversation?: boolean }
    ) => {
        // Atomically start a fresh conversation: clear chatId and replace messages
        if (options?.newConversation) {
            chatIdRef.current = null;
            setChatIdState(null);
        }

        const userMessage: ChatMessage = {
            role: 'user',
            content,
            timestamp: new Date().toISOString()
        };

        if (options?.newConversation) {
            setMessages([userMessage]);
        } else {
            setMessages(prev => [...prev, userMessage]);
        }

        setIsLoading(true);
        setError(null);
        setStreamingText('');
        setStatusText(null);
        setActiveToolProgress(null);

        const abortController = new AbortController();
        abortControllerRef.current = abortController;

        let collectedText = '';
        // Tracks whether the backend confirmed it persisted the message
        // (by sending a chat_id event). If false on cancel, the backend
        // may not have written anything — revert the user message.
        let backendConfirmed = false;

        try {
            for await (const event of chatApi.streamMessage({
                message: content,
                context: contextRef.current,
                interaction_type: interactionType,
                action_metadata: actionMetadata,
                conversation_id: chatIdRef.current
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
                        setMessages(prev => {
                            const next = [...prev, assistantMessage];
                            // Detect proposal payloads — only set if no proposal is already pending
                            if (responsePayload.custom_payload?.type && responsePayload.custom_payload.data) {
                                const kind = classifyProposal(responsePayload.custom_payload);
                                if (kind && !pendingProposalRef.current) {
                                    setProposal({
                                        kind,
                                        payloadType: responsePayload.custom_payload.type,
                                        data: responsePayload.custom_payload.data,
                                        messageIndex: next.length - 1,
                                    });
                                }
                            }
                            return next;
                        });
                        setStreamingText('');
                        setStatusText(null);
                        setIsLoading(false);

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

                    case 'chat_id':
                        if (event.conversation_id) {
                            setChatId(event.conversation_id);
                            backendConfirmed = true;
                        }
                        break;

                    case 'guest_limit':
                        setGuestLimitReached(true);
                        setIsLoading(false);
                        setStreamingText('');
                        setStatusText(null);
                        break;

                    case 'cancelled':
                        setStatusText('Cancelled');
                        break;
                }
            }

        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                setStreamingText('');
                setStatusText(null);
                setActiveToolProgress(null);

                if (!backendConfirmed) {
                    // Backend never confirmed it persisted — _setup_chat may
                    // have been interrupted. Remove the optimistic user message
                    // and restore it to the input field.
                    setMessages(prev => prev.slice(0, -1));
                    setRestoredInput(content);
                    return;
                }

                // Backend confirmed — it has the user message and will persist
                // an assistant message. Sync from backend to get that state.
                lastLoadedPageRef.current = null;
                lastLoadedTableIdRef.current = undefined;

                const page = contextRef.current.current_page as string | undefined;
                const tblId = contextRef.current.table_id as number | undefined;
                if (page) {
                    const syncFromBackend = async () => {
                        // Give the backend's finally block time to persist
                        await new Promise(r => setTimeout(r, 500));
                        await loadForContext(page, tblId);

                        // If conversation is unbalanced (backend still persisting),
                        // retry once after a longer delay.
                        const chat = await chatApi.getChatByContext(page, tblId, app);
                        const msgs = chat.messages.filter(
                            (m: any) => m.role === 'user' || m.role === 'assistant'
                        );
                        if (msgs.length > 0 && msgs[msgs.length - 1].role === 'user') {
                            await new Promise(r => setTimeout(r, 1000));
                            lastLoadedPageRef.current = null;
                            lastLoadedTableIdRef.current = undefined;
                            await loadForContext(page, tblId);
                        }
                    };
                    syncFromBackend().catch(console.error);
                }
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
    }, []);

    const cancelRequest = useCallback(() => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
            abortControllerRef.current = null;
        }
    }, []);

    const resetGuestLimit = useCallback(() => {
        setGuestLimitReached(false);
    }, []);

    const clearRestoredInput = useCallback(() => {
        setRestoredInput(null);
    }, []);

    const updateContext = useCallback((updates: Record<string, unknown>) => {
        const merged = { ...contextRef.current, ...updates };
        contextRef.current = merged;
        setContextState(merged);
    }, []);

    const replaceContext = useCallback((newContext: Record<string, unknown>) => {
        contextRef.current = newContext;
        setContextState(newContext);
    }, []);

    const reset = useCallback(() => {
        setMessages([]);
        setError(null);
        setChatId(null);
        setProposal(null);
        lastLoadedPageRef.current = null;
        lastLoadedTableIdRef.current = undefined;
    }, [setProposal]);

    const loadForContext = useCallback(async (currentPage: string, tableId?: number) => {
        // Skip if we've already queried for this context (even if no conversation was found)
        if (lastLoadedPageRef.current === currentPage
            && lastLoadedTableIdRef.current === tableId) {
            return true;
        }
        try {
            const chat = await chatApi.getChatByContext(currentPage, tableId, app);

            // A send started while we were awaiting — don't overwrite its state
            if (abortControllerRef.current) {
                return true;
            }

            const loadedMessages: ChatMessage[] = chat.messages
                .filter(msg => msg.role === 'user' || msg.role === 'assistant')
                .map(msg => ({
                    role: msg.role as 'user' | 'assistant',
                    content: msg.content,
                    timestamp: msg.created_at,
                    ...(msg.extras?.suggested_values && { suggested_values: msg.extras.suggested_values }),
                    ...(msg.extras?.suggested_actions && { suggested_actions: msg.extras.suggested_actions }),
                    ...(msg.extras?.tool_history && { tool_history: msg.extras.tool_history }),
                    ...(msg.extras?.custom_payload && { custom_payload: msg.extras.custom_payload }),
                    ...((msg.extras?.trace || msg.extras?.diagnostics) && {
                        diagnostics: msg.extras.trace || msg.extras.diagnostics
                    }),
                }));
            setMessages(loadedMessages);
            setChatId(chat.id);
            lastLoadedPageRef.current = currentPage;
            lastLoadedTableIdRef.current = tableId;
            setError(null);
            // Clear any pending proposal — loaded history may contain resolved proposals
            // that we can't distinguish from pending ones. Proposals are ephemeral UI
            // state; only live streaming responses should set them.
            setProposal(null);

            return true;
        } catch (err) {
            console.error('Failed to load chat for context:', currentPage, tableId, err);
            // A send started while we were awaiting — don't overwrite its state
            if (abortControllerRef.current) {
                return false;
            }
            // Start fresh
            setMessages([]);
            setChatId(null);
            setProposal(null);
            lastLoadedPageRef.current = currentPage;
            lastLoadedTableIdRef.current = tableId;
            return false;
        }
    }, [app, setChatId, setProposal]);

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
            guestLimitReached,
            pendingProposal,
            restoredInput,
            sendMessage,
            resetGuestLimit,
            cancelRequest,
            resolveProposal,
            clearRestoredInput,
            updateContext,
            setContext: replaceContext,
            reset,
            loadForContext
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
