/**
 * Research Stream types for Knowledge Horizon
 *
 * Organized to mirror backend schemas/research_stream.py for easy cross-reference.
 * Section order:
 *   1. Enums
 *   2. Scheduling
 *   3. Layer 2: Retrieval Config
 *   4. Layer 3: Presentation Config
 *   5. Layer 4: Enrichment Config
 *   6. Pipeline Execution
 *   7. Research Stream (main type)
 *   8. Derived Types (views, summaries, queue items)
 *   9. Information Sources
 */

import { SemanticSpace } from './semantic-space';
import type { ReportArticle } from './report';
import type { PipelineLLMConfig } from './llm';

// ============================================================================
// ENUMS
// ============================================================================

export enum StreamType {
    COMPETITIVE = 'competitive',
    REGULATORY = 'regulatory',
    CLINICAL = 'clinical',
    MARKET = 'market',
    SCIENTIFIC = 'scientific',
    MIXED = 'mixed'
}

export enum ReportFrequency {
    DAILY = 'daily',
    WEEKLY = 'weekly',
    BIWEEKLY = 'biweekly',
    MONTHLY = 'monthly'
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed';

export type RunType = 'scheduled' | 'manual' | 'test';

export enum VolumeStatus {
    TOO_BROAD = 'too_broad',      // > 1000 results/week
    APPROPRIATE = 'appropriate',  // 10-1000 results/week
    TOO_NARROW = 'too_narrow',    // < 10 results/week
    UNKNOWN = 'unknown'           // Not yet tested
}

// ============================================================================
// SCHEDULING
// ============================================================================

export interface ScheduleConfig {
    enabled: boolean;
    frequency: ReportFrequency;
    anchor_day?: string | null;  // 'monday'-'sunday' for weekly, or '1'-'31' for monthly — when to RUN the pipeline
    preferred_time: string;  // HH:MM in user's timezone — when to RUN the pipeline
    timezone: string;  // e.g., 'America/New_York'
    send_day?: string | null;  // 'monday'-'sunday' for weekly, or '1'-'31' for monthly — earliest day to SEND
    send_time?: string | null;  // HH:MM — earliest time to SEND (in timezone)
}

// ============================================================================
// LAYER 2: RETRIEVAL CONFIG
// ============================================================================

export interface SourceQuery {
    query_expression: string;
    enabled: boolean;
}

export interface SemanticFilter {
    enabled: boolean;
    criteria: string;
    threshold: number;  // 0.0 to 1.0
}

export interface ConceptEntity {
    entity_id: string;
    name: string;
    entity_type: string;
    canonical_forms: string[];
    rationale: string;
    semantic_space_ref: string | null;
}

export interface RelationshipEdge {
    from_entity_id: string;
    to_entity_id: string;
    relation_type: string;
}

export interface Concept {
    concept_id: string;
    name: string;
    entity_pattern: string[];
    relationship_edges: RelationshipEdge[];
    relationship_description: string;
    relationship_pattern?: string | null;  // DEPRECATED
    covered_topics: string[];
    vocabulary_terms: Record<string, string[]>;
    expected_volume: number | null;
    volume_status: VolumeStatus;
    last_volume_check: string | null;
    source_queries: Record<string, SourceQuery>;
    semantic_filter: SemanticFilter;
    exclusions: string[];
    exclusion_rationale: string | null;
    rationale: string;
    human_edited: boolean;
}

export interface BroadQuery {
    query_id: string;
    source_id: number;
    search_terms: string[];
    query_expression: string;
    rationale: string;
    covered_topics: string[];
    estimated_weekly_volume: number | null;
    semantic_filter: SemanticFilter;
}

export interface BroadSearchStrategy {
    queries: BroadQuery[];
    strategy_rationale: string;
    coverage_analysis: Record<string, any>;
}

export interface RetrievalConfig {
    concepts?: Concept[] | null;
    broad_search?: BroadSearchStrategy | null;
    article_limit_per_week?: number;
}

// ============================================================================
// LAYER 3: PRESENTATION CONFIG
// ============================================================================

export interface Category {
    id: string;
    name: string;
    topics: string[];
    specific_inclusions: string[];
}

/**
 * A customizable prompt template with slug support.
 */
export interface PromptTemplate {
    system_prompt: string;
    user_prompt_template: string;
}

export type CategorizationPrompt = PromptTemplate;

export interface PresentationConfig {
    categories: Category[];
    categorization_prompt?: CategorizationPrompt | null;
}

// ============================================================================
// LAYER 4: ENRICHMENT CONFIG
// ============================================================================

export interface EnrichmentConfig {
    prompts: Record<string, PromptTemplate>;  // 'article_summary', 'category_summary', 'executive_summary'
}

// ============================================================================
// ARTICLE ANALYSIS CONFIG
// ============================================================================

/**
 * Configuration for article-level analysis features.
 * Contains stance analysis prompt.
 * Note: chat_instructions are stored in the chat_config table (admin only).
 */
export interface ArticleAnalysisConfig {
    stance_analysis_prompt?: PromptTemplate | null;
}

// ============================================================================
// PIPELINE EXECUTION
// ============================================================================

export interface PipelineExecution {
    id: string;
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    created_at: string;
}

export interface WipArticle {
    id: number;
    title: string;
    authors: string[];
    journal: string | null;
    // Honest date fields - only populated with actual precision available
    pub_year?: number | null;   // Publication year
    pub_month?: number | null;  // Publication month (1-12, when available)
    pub_day?: number | null;    // Publication day (1-31, when available)
    pmid: string | null;
    abstract: string | null;
    is_duplicate: boolean;
    duplicate_of_id: number | null;
    passed_semantic_filter: boolean | null;
    filter_score: number | null;
    filter_score_reason: string | null;
    included_in_report: boolean;
    curator_included: boolean;
    curator_excluded: boolean;
    curation_notes: string | null;
}

// ============================================================================
// RESEARCH STREAM (Main Type)
// ============================================================================

/**
 * Research stream configuration.
 *
 * Organized into sections that mirror the backend Pydantic schema
 * for easy cross-reference between frontend and backend code.
 */
export interface ResearchStream {
    // === CORE IDENTITY ===
    stream_id: number;
    stream_name: string;
    purpose: string;

    // === SCOPE & OWNERSHIP ===
    scope?: 'personal' | 'organization' | 'global';
    org_id?: number | null;
    user_id?: number | null;
    created_by?: number | null;

    // === FOUR-LAYER ARCHITECTURE ===
    // Layer 1: SEMANTIC SPACE (imported from semantic-space.ts)
    semantic_space: SemanticSpace;
    // Layer 2: RETRIEVAL CONFIG
    retrieval_config: RetrievalConfig;
    // Layer 3: PRESENTATION CONFIG
    presentation_config: PresentationConfig;
    // Layer 4: ENRICHMENT CONFIG
    enrichment_config?: EnrichmentConfig | null;
    // Article Analysis Config (stance prompt)
    article_analysis_config?: ArticleAnalysisConfig | null;

    // === CONTROL PANEL ===
    llm_config?: PipelineLLMConfig | null;

    // === SCHEDULING ===
    schedule_config?: ScheduleConfig | null;
    next_scheduled_run?: string | null;
    last_execution_id?: string | null;
    last_execution?: PipelineExecution | null;

    // === METADATA ===
    is_active: boolean;
    created_at: string;
    updated_at: string;

    // === AGGREGATED DATA ===
    report_count?: number;
    latest_report_date?: string | null;
}

// ============================================================================
// DERIVED TYPES (Views, Summaries, Queue Items)
// ============================================================================

export interface StreamOption {
    stream_id: number;
    stream_name: string;
}

export interface CategoryCount {
    id: string;
    name: string;
    article_count: number;
}

export interface LastExecution {
    id: string;
    stream_id: number;
    status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    report_id: number | null;
    report_approval_status: string | null;
    article_count: number | null;
}

export interface ExecutionQueueItem {
    execution_id: string;
    stream_id: number;
    stream_name: string;
    execution_status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    created_at: string;
    report_id: number | null;
    report_name: string | null;
    approval_status: string | null;
    article_count: number | null;
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
    filtered_out_count: number | null;
    has_curation_edits: boolean | null;
    last_curated_by: string | null;
}

export interface ExecutionDetail {
    execution_id: string;
    stream_id: number;
    stream_name: string;
    execution_status: ExecutionStatus;
    run_type: RunType;
    started_at: string | null;
    completed_at: string | null;
    error: string | null;
    created_at: string;
    wip_articles: WipArticle[];
    start_date: string | null;
    end_date: string | null;
    retrieval_config: Record<string, unknown> | null;
    report_id: number | null;
    report_name: string | null;
    approval_status: string | null;
    article_count: number;
    executive_summary: string | null;
    category_summaries: Record<string, string> | null;
    categories: CategoryCount[];
    articles: ReportArticle[];
    approved_by: string | null;
    approved_at: string | null;
    rejection_reason: string | null;
}

export interface ScheduledStream {
    stream_id: number;
    stream_name: string;
    schedule_config: ScheduleConfig;
    next_scheduled_run: string | null;
    last_execution: LastExecution | null;
}

// ============================================================================
// INFORMATION SOURCES
// ============================================================================

export enum SourceType {
    ACADEMIC_DATABASE = 'academic_database',
    SEARCH_ENGINE = 'search_engine',
    PREPRINT_SERVER = 'preprint_server',
    CLINICAL_TRIALS = 'clinical_trials',
    PATENT_DATABASE = 'patent_database',
    REGULATORY_DATABASE = 'regulatory_database'
}

export interface InformationSource {
    source_id: number;
    name: string;
    description?: string;
}
