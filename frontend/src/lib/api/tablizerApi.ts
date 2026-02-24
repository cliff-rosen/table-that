import { api } from './index';
import { CanonicalResearchArticle, CanonicalClinicalTrial } from '../../types/canonical_types';

// ============================================================================
// PubMed Search Types
// ============================================================================

export interface PubMedSearchRequest {
    query_expression: string;
    max_pmids?: number;         // Maximum PMIDs to retrieve (default 500)
    articles_to_fetch?: number; // Number of articles with full data (default 20)
    start_date?: string;        // YYYY/MM/DD
    end_date?: string;          // YYYY/MM/DD
    date_type?: string;         // 'publication', 'entry', etc.
    sort_by?: string;           // 'relevance', 'date'
}

export interface PubMedSearchResponse {
    all_pmids: string[];
    articles: CanonicalResearchArticle[];
    total_results: number;
    pmids_retrieved: number;
    articles_retrieved: number;
}

// ============================================================================
// Clinical Trials Search Types
// ============================================================================

export interface TrialSearchRequest {
    condition?: string;
    intervention?: string;
    sponsor?: string;
    status?: string[];
    phase?: string[];
    study_type?: string;
    location?: string;
    start_date?: string;    // YYYY-MM-DD
    end_date?: string;      // YYYY-MM-DD
    max_results?: number;
}

export interface TrialSearchResponse {
    trials: CanonicalClinicalTrial[];
    total_results: number;
    returned_count: number;
}

// ============================================================================
// AI Column: Filter Types (boolean/number output)
// ============================================================================

export interface FilterRequest {
    items: Record<string, unknown>[];
    item_type: 'article' | 'trial';
    criteria: string;
    threshold?: number;
    output_type: 'boolean' | 'number';
    // Score-specific options (only used when output_type="number")
    min_value?: number;
    max_value?: number;
    interval?: number;
}

export interface FilterResultItem {
    id: string;
    passed: boolean;
    value: number;
    confidence: number;
    reasoning: string;
}

export interface FilterResponse {
    results: FilterResultItem[];
    count: number;
    passed: number;
    failed: number;
}

// ============================================================================
// AI Column: Extract Types (text output)
// ============================================================================

export interface ExtractRequest {
    items: Record<string, unknown>[];
    item_type: 'article' | 'trial';
    prompt: string;
}

export interface ExtractResultItem {
    id: string;
    text_value: string;
    confidence: number;
    reasoning: string;
}

export interface ExtractResponse {
    results: ExtractResultItem[];
    count: number;
    succeeded: number;
    failed: number;
}

// ============================================================================
// Combined AI Column Result (unified for Tablizer component)
// ============================================================================

export interface AIColumnResult {
    id: string;
    passed: boolean;
    value: number;
    confidence: number;
    reasoning: string;
    text_value?: string;  // Only present for text output type
}

// ============================================================================
// API Functions
// ============================================================================

export const tablizerApi = {
    // ==========================================================================
    // Search Operations
    // ==========================================================================

    /**
     * Search PubMed articles
     */
    async searchPubMed(params: {
        query: string;
        startDate?: string;    // YYYY-MM-DD
        endDate?: string;      // YYYY-MM-DD
        dateType?: 'publication' | 'entry';
        maxPmids?: number;
        articlesToFetch?: number;
        sortBy?: 'relevance' | 'date';
    }): Promise<PubMedSearchResponse> {
        // Convert YYYY-MM-DD to YYYY/MM/DD for the API
        const formatDate = (date?: string) => date ? date.replace(/-/g, '/') : undefined;

        const request: PubMedSearchRequest = {
            query_expression: params.query,
            start_date: formatDate(params.startDate),
            end_date: formatDate(params.endDate),
            date_type: params.dateType,
            max_pmids: params.maxPmids || 500,
            articles_to_fetch: params.articlesToFetch || 20,
            sort_by: params.sortBy || 'relevance'
        };

        const response = await api.post('/api/tablizer/search/pubmed', request);
        return response.data;
    },

    /**
     * Search clinical trials
     */
    async searchTrials(params: TrialSearchRequest): Promise<TrialSearchResponse> {
        const response = await api.post('/api/tablizer/search/trials', params);
        return response.data;
    },

    /**
     * Get trial details by NCT ID
     */
    async getTrialDetail(nctId: string): Promise<CanonicalClinicalTrial> {
        const response = await api.post('/api/tablizer/trials/detail', { nct_id: nctId });
        return response.data;
    },

    // ==========================================================================
    // AI Column Operations
    // ==========================================================================

    /**
     * Filter items for boolean/number AI columns
     */
    async filterItems(request: FilterRequest): Promise<FilterResponse> {
        const response = await api.post('/api/tablizer/filter', request);
        return response.data;
    },

    /**
     * Extract text from items for text AI columns
     */
    async extractFromItems(request: ExtractRequest): Promise<ExtractResponse> {
        const response = await api.post('/api/tablizer/extract', request);
        return response.data;
    },

    /**
     * Process AI column - routes to filter or extract based on output type
     *
     * This is the main entry point for Tablizer AI columns.
     * Returns a unified AIColumnResult format regardless of output type.
     *
     * - boolean: Uses filter endpoint (returns Yes/No based on criteria match)
     * - number: Uses filter endpoint (returns score within min/max range)
     * - text: Uses extract endpoint (returns text answer/classification)
     */
    async processAIColumn(params: {
        items: Record<string, unknown>[];
        itemType: 'article' | 'trial';
        criteria: string;
        outputType: 'boolean' | 'number' | 'text';
        threshold?: number;
        // Score-specific options (only used when outputType="number")
        scoreConfig?: {
            minValue: number;
            maxValue: number;
            interval?: number;
        };
    }): Promise<AIColumnResult[]> {
        if (params.outputType === 'text') {
            // Use extract endpoint for text output
            const response = await this.extractFromItems({
                items: params.items,
                item_type: params.itemType,
                prompt: params.criteria
            });

            // Convert to unified format
            return response.results.map(r => ({
                id: r.id,
                passed: r.confidence >= (params.threshold || 0.5),
                value: 0, // Text outputs don't have a numeric value
                confidence: r.confidence,
                reasoning: r.reasoning,
                text_value: r.text_value
            }));
        } else {
            // Use filter endpoint for boolean/number output
            const response = await this.filterItems({
                items: params.items,
                item_type: params.itemType,
                criteria: params.criteria,
                threshold: params.threshold,
                output_type: params.outputType,
                // Pass score config if provided (for number/score type)
                ...(params.scoreConfig && {
                    min_value: params.scoreConfig.minValue,
                    max_value: params.scoreConfig.maxValue,
                    interval: params.scoreConfig.interval
                })
            });

            // Convert to unified format
            return response.results.map(r => ({
                id: r.id,
                passed: r.passed,
                value: r.value,
                confidence: r.confidence,
                reasoning: r.reasoning
            }));
        }
    }
};
