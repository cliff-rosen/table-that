/**
 * API client for Prompt Testing endpoints
 *
 * Tests LLM prompts in isolation:
 * - Get default prompts and available slugs
 * - Test summary prompts (executive, category, article)
 * - Test categorization prompts
 * - Test categorization on articles
 */

import { api } from './index';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import type { ModelConfig, PromptTemplate } from '../../types';

const API_BASE = '/api/prompt-testing';

// ============================================================================
// Types
// ============================================================================

// PromptTemplate imported from types/research-stream.ts
export type { PromptTemplate };  // Re-export for consumers of this API

export interface SlugInfo {
    slug: string;
    description: string;
}

export interface DefaultPromptsResponse {
    prompts: Record<string, PromptTemplate>;
    available_slugs: Record<string, SlugInfo[]>;
}

export interface CategorizationDefaultsResponse {
    prompt: PromptTemplate;
    available_slugs: SlugInfo[];
}

export interface TestSummaryPromptRequest {
    prompt_type: string;  // 'executive_summary', 'category_summary', or 'article_summary'
    prompt: PromptTemplate;
    sample_data?: Record<string, any>;
    report_id?: number;
    category_id?: string;  // For category_summary test
    article_index?: number;  // For article_summary test (0-based)
    llm_config?: ModelConfig;
}

export interface TestSummaryPromptResponse {
    rendered_system_prompt: string;
    rendered_user_prompt: string;
    llm_response?: string;
    error?: string;
}

export interface TestCategorizationPromptRequest {
    prompt: PromptTemplate;
    sample_data?: Record<string, any>;
    report_id?: number;
    article_index?: number;
    llm_config?: ModelConfig;
}

export interface TestCategorizationPromptResponse {
    rendered_system_prompt: string;
    rendered_user_prompt: string;
    llm_response?: string;
    parsed_category_id?: string;
    error?: string;
}

export interface TestCategorizationRequest {
    stream_id: number;
    articles: CanonicalResearchArticle[];
    llm_config?: ModelConfig;
}

export interface TestStanceAnalysisPromptRequest {
    prompt: PromptTemplate;
    sample_data?: Record<string, unknown>;
    report_id?: number;
    article_index?: number;
    llm_config?: ModelConfig;
}

export interface TestStanceAnalysisPromptResponse {
    rendered_system_prompt: string;
    rendered_user_prompt: string;
    llm_response?: string;
    parsed_stance?: string;
    error?: string;
}

export interface CategoryAssignment {
    article: CanonicalResearchArticle;
    assigned_categories: string[];
}

export interface TestCategorizationResponse {
    results: CategoryAssignment[];
    count: number;
    category_distribution: Record<string, number>;
}

// ============================================================================
// API Client
// ============================================================================

export const promptTestingApi = {
    /**
     * Get default prompts and available slugs for each prompt type
     */
    async getDefaults(): Promise<DefaultPromptsResponse> {
        const response = await api.get(`${API_BASE}/defaults`);
        return response.data;
    },

    /**
     * Get default categorization prompt and available slugs
     */
    async getCategorizationDefaults(): Promise<CategorizationDefaultsResponse> {
        const response = await api.get(`${API_BASE}/defaults/categorization`);
        return response.data;
    },

    /**
     * Test a summary prompt (executive, category, or article) with sample data or report data
     */
    async testSummaryPrompt(request: TestSummaryPromptRequest): Promise<TestSummaryPromptResponse> {
        const response = await api.post(`${API_BASE}/test-summary`, request);
        return response.data;
    },

    /**
     * Test a categorization prompt by rendering it with sample data and running through LLM
     */
    async testCategorizationPrompt(
        request: TestCategorizationPromptRequest
    ): Promise<TestCategorizationPromptResponse> {
        const response = await api.post(`${API_BASE}/test-categorization-prompt`, request);
        return response.data;
    },

    /**
     * Test categorization on articles using stream's categories
     *
     * This tests how articles would be categorized using the stream's configured
     * categorization prompt and categories.
     */
    async testCategorization(request: TestCategorizationRequest): Promise<TestCategorizationResponse> {
        const response = await api.post(`${API_BASE}/test-categorization`, request);
        return response.data;
    },

    /**
     * Test a stance analysis prompt by rendering it with sample data and running through LLM
     */
    async testStanceAnalysisPrompt(
        request: TestStanceAnalysisPromptRequest
    ): Promise<TestStanceAnalysisPromptResponse> {
        const response = await api.post(`${API_BASE}/test-stance-analysis-prompt`, request);
        return response.data;
    }
};
