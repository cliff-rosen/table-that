import { api, handleApiError } from './index';
import { CanonicalResearchArticle } from '@/types/canonical_types';
import { makeStreamRequest } from './streamUtils';

export interface GoogleScholarSearchRequest {
    query: string;
    num_results?: number;
    year_low?: number;
    year_high?: number;
    sort_by?: 'relevance' | 'date';
    enrich_summaries?: boolean;
}

export interface GoogleScholarSearchResponse {
    articles: CanonicalResearchArticle[];
    metadata: Record<string, any>;
    success: boolean;
}

export const googleScholarApi = {
    /**
     * Search Google Scholar for academic articles
     */
    async search(params: GoogleScholarSearchRequest): Promise<GoogleScholarSearchResponse> {
        try {
            const response = await api.post<GoogleScholarSearchResponse>(
                '/api/google-scholar/search',
                params
            );
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    },

    /**
     * Stream Google Scholar search via SSE
     */
    async *stream(params: GoogleScholarSearchRequest, options?: { signal?: AbortSignal }): AsyncGenerator<{
        status: string | null;
        articles?: CanonicalResearchArticle[];
        metadata?: Record<string, any>;
        error?: string | null;
        payload?: any;
    }> {
        const rawStream = makeStreamRequest('/api/google-scholar/stream', params, 'POST', options?.signal);
        for await (const update of rawStream) {
            const lines = update.data.split('\n');
            for (const line of lines) {
                if (!line.trim().startsWith('data: ')) continue;
                try {
                    const json = JSON.parse(line.replace(/^data:\s*/, ''));
                    if (json.status === 'articles') {
                        yield { status: json.status, articles: json.payload?.articles || [], metadata: json.payload?.metadata };
                    } else if (json.status === 'progress' || json.status === 'starting' || json.status === 'complete') {
                        yield { status: json.status, payload: json.payload };
                    } else if (json.status === 'error') {
                        yield { status: 'error', error: json.error || 'Unknown error' };
                    }
                } catch (e) {
                    // Ignore malformed lines
                }
            }
        }
    },

    /**
     * Test Google Scholar/SerpAPI connection
     */
    async testConnection(): Promise<{
        status: 'success' | 'error';
        message: string;
        api_configured: boolean;
        test_results?: number;
    }> {
        try {
            const response = await api.get('/api/google-scholar/test-connection');
            return response.data;
        } catch (error) {
            throw new Error(handleApiError(error));
        }
    }
}; 