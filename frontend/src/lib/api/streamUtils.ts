import settings from '../../config/settings';
import type { TokenPayload } from './index';
import {
    getAuthToken,
    setAuthToken,
    clearAuthData,
} from './index';

export interface StreamUpdate {
    data: string;
    timestamp?: number;
    chunkIndex?: number;
}

export interface StreamError {
    error: string;
    timestamp: number;
    endpoint: string;
}

// Callback for session expiration
let sessionExpiredHandler: (() => void) | null = null;

export const setStreamSessionExpiredHandler = (handler: () => void) => {
    sessionExpiredHandler = handler;
};

// Callback for token refresh
let tokenRefreshedHandler: ((payload: TokenPayload) => void) | null = null;

export const setStreamTokenRefreshedHandler = (handler: (payload: TokenPayload) => void) => {
    tokenRefreshedHandler = handler;
};

/**
 * Decode a JWT token payload (without verification - that's done server-side)
 */
function decodeTokenPayload(token: string): TokenPayload | null {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const payload = JSON.parse(atob(parts[1]));
        return payload as TokenPayload;
    } catch {
        return null;
    }
}

export async function* makeStreamRequest(
    endpoint: string,
    params: Record<string, any>,
    method: 'GET' | 'POST' = 'GET',
    signal?: AbortSignal
): AsyncGenerator<StreamUpdate> {

    const queryString = Object.entries(params)
        .map(([key, value]) => {
            if (Array.isArray(value) || method === 'POST' || typeof value !== 'string') {
                // For arrays, objects, or POST requests, use POST with JSON body
                return null;
            }
            return `${key}=${encodeURI(value)}`;
        })
        .filter(Boolean)
        .join('&');

    const token = getAuthToken();
    const hasComplexParams = Object.values(params).some(value => Array.isArray(value) || typeof value !== 'string');
    const usePost = method === 'POST' || hasComplexParams;

    let response: Response;
    try {
        response = await fetch(
            `${settings.apiUrl}${endpoint}${!usePost && queryString ? `?${queryString}` : ''}`,
            {
                method: usePost ? 'POST' : 'GET',
                headers: {
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                    ...(usePost ? { 'Content-Type': 'application/json' } : {}),
                    'Accept': 'text/event-stream'
                },
                ...(usePost ? { body: JSON.stringify(params) } : {}),
                // Important for some proxies (HTTP/2) to keep stream open
                cache: 'no-cache',
                redirect: 'follow',
                ...(signal ? { signal } : {})
            }
        );
    } catch (err: any) {
        if (err?.name === 'AbortError') {
            // Gracefully end generator on abort
            return;
        }
        throw err;
    }

    if (!response.ok) {
        // Handle authentication/authorization errors
        if (response.status === 401 || response.status === 403) {
            clearAuthData();
            if (sessionExpiredHandler) {
                sessionExpiredHandler();
            }
            throw new Error('Authentication required');
        }
        throw new Error(`Stream request failed: ${response.statusText}`);
    }

    // Check for refreshed token in response header
    const newToken = response.headers.get('x-new-token');
    if (newToken) {
        setAuthToken(newToken);
        console.debug('Token refreshed silently (stream)');

        // Notify AuthContext of the refreshed token so it can update user state
        if (tokenRefreshedHandler) {
            const payload = decodeTokenPayload(newToken);
            if (payload) {
                tokenRefreshedHandler(payload);
            }
        }
    }

    const reader = response.body?.getReader();
    if (!reader) {
        throw new Error('Stream not available');
    }

    const decoder = new TextDecoder();

    try {
        while (true) {
            let done: boolean, value: Uint8Array | undefined;
            try {
                ({ done, value } = await reader.read());
            } catch (err: any) {
                if (err?.name === 'AbortError') {
                    // Abort during read; stop quietly
                    break;
                }
                throw err;
            }
            if (done) {
                const final = decoder.decode(); // Flush any remaining bytes
                if (final) yield { data: final };
                break;
            }

            const decoded = decoder.decode(value, { stream: true });
            if (decoded) yield { data: decoded };
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * Subscribe to Server-Sent Events (SSE) from an endpoint.
 * Handles SSE protocol parsing, auth, and cleanup.
 *
 * @param endpoint - API endpoint path (e.g., '/api/operations/runs/123/stream')
 * @param onMessage - Callback for each parsed SSE data event
 * @param onError - Callback for errors
 * @param onComplete - Callback when stream ends
 * @returns Cleanup function to close the connection
 */
export function subscribeToSSE<T>(
    endpoint: string,
    onMessage: (data: T) => void,
    onError?: (error: Error) => void,
    onComplete?: () => void
): () => void {
    const token = getAuthToken();
    const url = `${settings.apiUrl}${endpoint}`;
    const controller = new AbortController();

    (async () => {
        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'text/event-stream',
                    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
                },
                signal: controller.signal,
                cache: 'no-cache',
            });

            if (!response.ok) {
                // Handle authentication/authorization errors
                if (response.status === 401 || response.status === 403) {
                    clearAuthData();
                    if (sessionExpiredHandler) {
                        sessionExpiredHandler();
                    }
                    throw new Error('Authentication required');
                }
                throw new Error(`HTTP ${response.status}`);
            }

            // Check for refreshed token in response header
            const newToken = response.headers.get('x-new-token');
            if (newToken) {
                setAuthToken(newToken);
                console.debug('Token refreshed silently (SSE)');
                if (tokenRefreshedHandler) {
                    const payload = decodeTokenPayload(newToken);
                    if (payload) {
                        tokenRefreshedHandler(payload);
                    }
                }
            }

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('No response body');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    onComplete?.();
                    break;
                }

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE messages
                const lines = buffer.split('\n');
                buffer = lines.pop() || ''; // Keep incomplete line in buffer

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        try {
                            const parsed = JSON.parse(data) as T;
                            onMessage(parsed);
                        } catch {
                            // Ignore parse errors (might be keepalive or malformed)
                        }
                    }
                }
            }
        } catch (error) {
            if ((error as Error).name !== 'AbortError') {
                onError?.(error as Error);
            }
        }
    })();

    // Return cleanup function
    return () => {
        controller.abort();
    };
} 