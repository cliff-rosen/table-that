import { api } from './index';
import { ResearchStream, InformationSource, Concept, RetrievalConfig, SemanticSpace, PresentationConfig, BroadQuery, ScheduleConfig, PipelineLLMConfig, EnrichmentConfig, PromptTemplate, ArticleAnalysisConfig } from '../../types';

// ============================================================================
// Enrichment & Categorization Config Response Types (API-specific)
// ============================================================================

// EnrichmentConfig and PromptTemplate imported from types/research-stream.ts

export interface EnrichmentConfigResponse {
    enrichment_config: EnrichmentConfig | null;
    is_using_defaults: boolean;
    defaults: Record<string, PromptTemplate>;
}

export interface CategorizationPromptResponse {
    categorization_prompt: PromptTemplate | null;
    is_using_defaults: boolean;
    defaults: PromptTemplate;
}

// SlugInfo is imported from promptTestingApi to avoid duplicate export
import type { SlugInfo } from './promptTestingApi';
export type { SlugInfo };

export interface ArticleAnalysisConfigResponse {
    article_analysis_config: ArticleAnalysisConfig | null;
    is_using_defaults: boolean;
    defaults: {
        stance_analysis_prompt: PromptTemplate;
    };
    available_slugs: SlugInfo[];
}

/**
 * Research Stream CRUD API Types
 */

export interface ResearchStreamCreateRequest {
    stream_name: string;
    purpose: string;
    schedule_config?: ScheduleConfig;
    semantic_space: SemanticSpace;
    retrieval_config: RetrievalConfig;
    presentation_config: PresentationConfig;
}

export interface ResearchStreamUpdateRequest {
    stream_name?: string;
    purpose?: string;
    schedule_config?: ScheduleConfig;
    is_active?: boolean;
    semantic_space?: SemanticSpace;
    retrieval_config?: RetrievalConfig;
    presentation_config?: PresentationConfig;
    llm_config?: PipelineLLMConfig;
}

// ============================================================================
// Shared Retrieval API Types
// ============================================================================

export interface QueryGenerationResponse {
    query_expression: string;
    reasoning: string;
}

export const researchStreamApi = {
    /**
     * Get all research streams for current user
     */
    async getResearchStreams(): Promise<ResearchStream[]> {
        const response = await api.get('/api/research-streams');
        return response.data;
    },

    /**
     * Get a specific research stream by ID
     */
    async getResearchStream(streamId: number): Promise<ResearchStream> {
        const response = await api.get(`/api/research-streams/${streamId}`);
        return response.data;
    },

    /**
     * Create a new research stream
     */
    async createResearchStream(stream: ResearchStreamCreateRequest): Promise<ResearchStream> {
        const response = await api.post('/api/research-streams', stream);
        return response.data;
    },

    /**
     * Update an existing research stream
     */
    async updateResearchStream(streamId: number, updates: ResearchStreamUpdateRequest): Promise<ResearchStream> {
        const response = await api.put(`/api/research-streams/${streamId}`, updates);
        return response.data;
    },

    /**
     * Delete a research stream
     */
    async deleteResearchStream(streamId: number): Promise<void> {
        await api.delete(`/api/research-streams/${streamId}`);
    },

    /**
     * Toggle research stream active status
     */
    async toggleResearchStreamStatus(streamId: number, isActive: boolean): Promise<ResearchStream> {
        const response = await api.patch(`/api/research-streams/${streamId}/status`, { is_active: isActive });
        return response.data;
    },

    /**
     * Get the authoritative list of information sources
     */
    async getInformationSources(): Promise<InformationSource[]> {
        const response = await api.get('/api/research-streams/metadata/sources');
        return response.data;
    },

    // ========================================================================
    // Retrieval Concept Workflow (Layer 2: Concept-Based Configuration)
    // ========================================================================

    /**
     * Propose broad search strategy (alternative to concepts)
     *
     * Generates 1-3 broad, simple search queries that cast a wide net
     * to capture all relevant literature. Optimized for weekly monitoring
     * where accepting false positives is better than missing papers.
     */
    async proposeBroadSearch(streamId: number): Promise<{
        queries: BroadQuery[];
        strategy_rationale: string;
        coverage_analysis: any;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/propose-broad-search`
        );
        return response.data;
    },

    /**
     * Generate semantic filter for a broad query
     */
    async generateBroadFilter(streamId: number, broadQuery: BroadQuery): Promise<{
        criteria: string;
        threshold: number;
        reasoning: string;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/generate-broad-filter`,
            { broad_query: broadQuery }
        );
        return response.data;
    },

    /**
     * Propose retrieval concepts based on semantic space analysis
     */
    async proposeRetrievalConcepts(streamId: number): Promise<{
        proposed_concepts: Concept[];
        analysis: any;
        reasoning: string;
        coverage_check: any;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/propose-concepts`
        );
        return response.data;
    },

    /**
     * Generate query for a concept
     */
    async generateConceptQuery(streamId: number, concept: Concept, sourceId: string): Promise<{
        query_expression: string;
        reasoning: string;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/generate-concept-query`,
            { concept, source_id: sourceId }
        );
        return response.data;
    },

    /**
     * Generate semantic filter for a concept
     */
    async generateConceptFilter(streamId: number, concept: Concept): Promise<{
        criteria: string;
        threshold: number;
        reasoning: string;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/generate-concept-filter`,
            { concept }
        );
        return response.data;
    },

    /**
     * Validate concepts configuration
     */
    async validateConcepts(streamId: number, concepts: Concept[]): Promise<{
        is_complete: boolean;
        coverage: any;
        configuration_status: any;
        warnings: string[];
        ready_to_activate: boolean;
    }> {
        const response = await api.post(
            `/api/research-streams/${streamId}/retrieval/validate-concepts`,
            { concepts }
        );
        return response.data;
    },

    // ========================================================================
    // Stream Configuration Updates (for Refinement Workbench)
    // ========================================================================

    /**
     * Update a specific broad query's expression
     * Used by refinement workbench to apply tested queries back to stream config
     */
    async updateBroadQuery(
        streamId: number,
        queryIndex: number,
        queryExpression: string
    ): Promise<ResearchStream> {
        const response = await api.patch(
            `/api/research-streams/${streamId}/retrieval-config/queries/${queryIndex}`,
            { query_expression: queryExpression }
        );
        return response.data;
    },

    /**
     * Update semantic filter configuration for a specific broad query
     * Used by refinement workbench to apply tested filters back to stream config
     */
    async updateSemanticFilter(
        streamId: number,
        queryIndex: number,
        filter: { enabled: boolean; criteria: string; threshold: number }
    ): Promise<ResearchStream> {
        const response = await api.patch(
            `/api/research-streams/${streamId}/retrieval-config/queries/${queryIndex}/semantic-filter`,
            filter
        );
        return response.data;
    },

    // ========================================================================
    // Enrichment & Categorization Configuration
    // ========================================================================

    /**
     * Get enrichment config for a stream (or defaults if not set)
     */
    async getEnrichmentConfig(streamId: number): Promise<EnrichmentConfigResponse> {
        const response = await api.get(`/api/research-streams/${streamId}/enrichment-config`);
        return response.data;
    },

    /**
     * Update enrichment config for a stream (set to null to reset to defaults)
     */
    async updateEnrichmentConfig(
        streamId: number,
        enrichmentConfig: EnrichmentConfig | null
    ): Promise<void> {
        await api.put(
            `/api/research-streams/${streamId}/enrichment-config`,
            { enrichment_config: enrichmentConfig }
        );
    },

    /**
     * Get categorization prompt for a stream (or defaults if not set)
     */
    async getCategorizationPrompt(streamId: number): Promise<CategorizationPromptResponse> {
        const response = await api.get(`/api/research-streams/${streamId}/categorization-prompt`);
        return response.data;
    },

    /**
     * Update categorization prompt for a stream (set to null to reset to defaults)
     */
    async updateCategorizationPrompt(
        streamId: number,
        categorizationPrompt: PromptTemplate | null
    ): Promise<void> {
        await api.put(
            `/api/research-streams/${streamId}/categorization-prompt`,
            { categorization_prompt: categorizationPrompt }
        );
    },

    /**
     * Get article analysis config for a stream (or defaults if not set)
     */
    async getArticleAnalysisConfig(streamId: number): Promise<ArticleAnalysisConfigResponse> {
        const response = await api.get(`/api/research-streams/${streamId}/article-analysis-config`);
        return response.data;
    },

    /**
     * Update article analysis config for a stream (set to null to reset to defaults)
     */
    async updateArticleAnalysisConfig(
        streamId: number,
        articleAnalysisConfig: ArticleAnalysisConfig | null
    ): Promise<void> {
        await api.put(
            `/api/research-streams/${streamId}/article-analysis-config`,
            { article_analysis_config: articleAnalysisConfig }
        );
    },

    /**
     * Get all curation notes for a stream
     */
    async getCurationNotes(streamId: number): Promise<StreamCurationNotesResponse> {
        const response = await api.get(`/api/research-streams/${streamId}/curation-notes`);
        return response.data;
    }

};

// ============================================================================
// Curation Notes Types
// ============================================================================

export interface CurationNoteItem {
    wip_article_id: number;
    pmid: string | null;
    title: string;
    curation_notes: string;
    curator_included: boolean;
    curator_excluded: boolean;
    curated_by: number | null;
    curator_name: string | null;
    curated_at: string | null;
    pipeline_execution_id: string;
    report_id: number | null;
}

export interface StreamCurationNotesResponse {
    stream_id: number;
    stream_name: string;
    notes: CurationNoteItem[];
    total_count: number;
}