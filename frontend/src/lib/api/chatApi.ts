/**
 * Chat API - Unified chat endpoints
 *
 * Handles chat persistence and streaming chat functionality.
 */

import { api } from './index';
import { makeStreamRequest } from './streamUtils';
import {
    ConversationWithMessages,
    InteractionType,
    ActionMetadata,
    StreamEvent,
} from '../../types/chat';


// ============================================================================
// Request Types
// ============================================================================

export interface ChatRequest {
    message: string;
    context: Record<string, unknown>;
    interaction_type: InteractionType;
    action_metadata?: ActionMetadata;
    /** Optional chat ID for persistence. If not provided, creates new chat. */
    conversation_id?: number | null;
}


// ============================================================================
// API Client
// ============================================================================

export const chatApi = {
    // === Chat Persistence ===

    /**
     * Get or create a conversation for the given page context.
     * Backend derives scope from current_page + table_id.
     */
    async getChatByContext(currentPage: string, tableId?: number | null, app = 'table_that'): Promise<ConversationWithMessages> {
        const params: Record<string, unknown> = { current_page: currentPage, app };
        if (tableId != null) params.table_id = tableId;
        const response = await api.get('/api/chats/by-context', { params });
        return response.data;
    },



    /**
     * Migrate a conversation's scope to a specific table.
     * Called after creating a table from tables_list so the conversation
     * follows the user to the table_view page.
     */
    async migrateScope(chatId: number, tableId: number): Promise<void> {
        await api.post(`/api/chats/${chatId}/migrate-scope`, { table_id: tableId });
    },

    /**
     * Mark a proposal in a message as resolved (accepted or dismissed).
     */
    async resolveProposal(messageId: number): Promise<void> {
        await api.patch(`/api/chats/messages/${messageId}/resolve-proposal`);
    },

    // === Streaming Chat ===

    /**
     * Stream chat messages from the backend
     * @param request - Chat request with message, context, and interaction type
     * @param signal - Optional AbortSignal for cancellation
     * @returns AsyncGenerator that yields typed stream events
     */
    async* streamMessage(
        request: ChatRequest,
        signal?: AbortSignal
    ): AsyncGenerator<StreamEvent> {
        try {
            const rawStream = makeStreamRequest('/api/chat/stream', request, 'POST', signal);

            // Buffer for accumulating partial SSE data lines across chunks
            let buffer = '';

            for await (const update of rawStream) {
                // Append new data to buffer
                buffer += update.data;

                // Process complete lines from the buffer
                let newlineIndex: number;
                while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
                    const line = buffer.slice(0, newlineIndex);
                    buffer = buffer.slice(newlineIndex + 1);

                    // Skip empty lines and non-data lines
                    if (!line.trim() || !line.startsWith('data: ')) {
                        continue;
                    }

                    const jsonStr = line.slice(6); // Remove "data: " prefix

                    // Skip ping/keepalive messages
                    if (jsonStr === '' || jsonStr === 'ping') {
                        continue;
                    }

                    try {
                        const data = JSON.parse(jsonStr) as StreamEvent;
                        if (data.type !== 'text_delta') {
                            console.log('[SSE] Event:', data.type);
                        }
                        yield data;
                    } catch {
                        // JSON parse failed - put it back and wait for more data
                        buffer = line + '\n' + buffer;
                        break;
                    }
                }
            }

            // Process any remaining buffered data
            if (buffer.trim() && buffer.startsWith('data: ')) {
                const jsonStr = buffer.slice(6);
                try {
                    const data = JSON.parse(jsonStr) as StreamEvent;
                    if (data.type !== 'text_delta') {
                        console.log('[SSE] Event (final):', data.type);
                    }
                    yield data;
                } catch (e) {
                    console.error('Failed to parse final stream data:', jsonStr.slice(0, 200) + '...', e);
                }
            }
        } catch (error) {
            // Re-throw AbortError so callers can detect cancellation
            if (error instanceof Error && error.name === 'AbortError') {
                throw error;
            }
            yield {
                type: 'error',
                message: `Stream error: ${error instanceof Error ? error.message : String(error)}`
            };
        }
    }
};
