/**
 * API client for Retrieval Testing endpoints
 *
 * Tests retrieval mechanics in isolation:
 * - Test query expressions
 * - Test filter criteria
 * - Fetch articles by PMID
 * - Compare PMID lists (recall/precision)
 */

import { api } from './index';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import type { ModelConfig } from '../../types';

const API_BASE = '/api/retrieval-testing';

// ============================================================================
// Request/Response Types
// ============================================================================

export interface TestQueryRequest {
    query_expression: string;
    start_date: string;  // YYYY-MM-DD
    end_date: string;    // YYYY-MM-DD
    stream_id?: number;  // Optional: if testing a saved query
    query_index?: number; // Optional: index of saved query (0-based)
}

export interface QueryResponse {
    articles: CanonicalResearchArticle[];
    count: number;
    total_count: number;
    all_matched_pmids: string[];
    metadata?: Record<string, any>;
}

export interface TestFilterRequest {
    articles: CanonicalResearchArticle[];
    filter_criteria: string;
    threshold?: number;  // 0.0-1.0, default 0.7
    output_type?: 'boolean' | 'number' | 'text';
    llm_config?: ModelConfig;
}

export interface FilterResultItem {
    article: CanonicalResearchArticle;
    passed: boolean;
    score: number;
    reasoning: string;
}

export interface FilterResponse {
    results: FilterResultItem[];
    count: number;
    passed: number;
    failed: number;
}

export interface FetchPmidsRequest {
    pmids: string[];
}

export interface ComparePmidsRequest {
    retrieved_pmids: string[];
    expected_pmids: string[];
}

export interface CompareResponse {
    matched: string[];
    missed: string[];
    extra: string[];
    matched_count: number;
    missed_count: number;
    extra_count: number;
    recall: number;
    precision: number;
    f1_score: number;
}

// ============================================================================
// API Client
// ============================================================================

export const retrievalTestingApi = {
    /**
     * Test a query expression against PubMed
     *
     * Can test either:
     * - A custom query expression (provide query_expression)
     * - A saved query from stream config (provide stream_id and query_index)
     */
    async testQuery(request: TestQueryRequest): Promise<QueryResponse> {
        const response = await api.post(`${API_BASE}/query`, request);
        return response.data;
    },

    /**
     * Test filter criteria on a set of articles
     */
    async testFilter(request: TestFilterRequest): Promise<FilterResponse> {
        const response = await api.post(`${API_BASE}/filter`, request);
        return response.data;
    },

    /**
     * Fetch articles by PMID list
     */
    async fetchByPmids(request: FetchPmidsRequest): Promise<QueryResponse> {
        const response = await api.post(`${API_BASE}/fetch-pmids`, request);
        return response.data;
    },

    /**
     * Compare retrieved vs expected PMID lists
     *
     * Returns recall, precision, and F1 score
     */
    async comparePmids(request: ComparePmidsRequest): Promise<CompareResponse> {
        const response = await api.post(`${API_BASE}/compare`, request);
        return response.data;
    }
};
