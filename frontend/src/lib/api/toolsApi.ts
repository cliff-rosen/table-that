import { api } from './index';
import { CanonicalResearchArticle } from '../../types/canonical_types';

// ============================================================================
// PubMed Query Tester API Types (Tools Page)
// ============================================================================

export interface PubMedQueryTestRequest {
    query_expression: string;
    max_results?: number;
    start_date?: string;  // YYYY/MM/DD
    end_date?: string;    // YYYY/MM/DD
    date_type?: string;   // 'entry', 'publication', etc.
    sort_by?: string;     // 'relevance', 'date'
}

export interface PubMedQueryTestResponse {
    articles: CanonicalResearchArticle[];
    total_results: number;
    returned_count: number;
}

export interface PubMedIdCheckRequest {
    query_expression: string;
    pubmed_ids: string[];
    start_date?: string;  // YYYY/MM/DD
    end_date?: string;    // YYYY/MM/DD
    date_type?: string;   // 'publication' (DP - default), 'entry' (EDAT), etc.
}

export interface PubMedIdCheckResult {
    pubmed_id: string;
    captured: boolean;
    article: CanonicalResearchArticle | null;
}

export interface PubMedIdCheckResponse {
    total_ids: number;
    captured_count: number;
    missed_count: number;
    results: PubMedIdCheckResult[];
    query_total_results: number;
}

export interface PubMedSearchParams {
    query: string;
    startDate?: string;  // YYYY-MM-DD
    endDate?: string;    // YYYY-MM-DD
    dateType?: 'publication' | 'entry';
    maxResults?: number;
}

// ============================================================================
// Tools Page API Functions
//
// Only contains endpoints used by the Tools page (/tools).
// Tablizer-specific endpoints (search, filter, extract) are in tablizerApi.ts
// ============================================================================

export const toolsApi = {
    /**
     * Test a PubMed query and return articles with total count
     */
    async testPubMedQuery(request: PubMedQueryTestRequest): Promise<PubMedQueryTestResponse> {
        const response = await api.post('/api/tools/pubmed/test-query', request);
        return response.data;
    },

    /**
     * Check which PubMed IDs from a list are captured by a query
     */
    async checkPubMedIds(request: PubMedIdCheckRequest): Promise<PubMedIdCheckResponse> {
        const response = await api.post('/api/tools/pubmed/check-ids', request);
        return response.data;
    },

    /**
     * Search PubMed with a simplified interface
     */
    async searchPubMed(params: PubMedSearchParams): Promise<PubMedQueryTestResponse> {
        // Convert YYYY-MM-DD to YYYY/MM/DD for the API
        const formatDate = (date?: string) => date ? date.replace(/-/g, '/') : undefined;

        const request: PubMedQueryTestRequest = {
            query_expression: params.query,
            start_date: formatDate(params.startDate),
            end_date: formatDate(params.endDate),
            date_type: params.dateType,
            max_results: params.maxResults || 100
        };

        return this.testPubMedQuery(request);
    }
};
