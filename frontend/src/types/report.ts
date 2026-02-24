/**
 * Report types for Knowledge Horizon
 *
 * Organized to mirror backend schemas/report.py for easy cross-reference.
 * Section order:
 *   1. Enums
 *   2. Article Types
 *   3. Report (main type)
 */

import { StanceAnalysisResult } from './document_analysis';

// ============================================================================
// ENUMS
// ============================================================================

export type ApprovalStatus = 'awaiting_approval' | 'approved' | 'rejected';

// ============================================================================
// ARTICLE TYPES
// ============================================================================

export interface ArticleEnrichments {
    stance_analysis?: StanceAnalysisResult;
    summary?: string;  // AI-generated summary of the article
    // Add other enrichment types here as needed
}

export interface ReportArticle {
    article_id: number;
    title: string;
    authors: string[];
    journal?: string;
    pmid?: string;
    doi?: string;
    abstract?: string;
    url?: string;
    // Honest date fields - only populated with actual precision available
    pub_year?: number;   // Publication year (always present from source)
    pub_month?: number;  // Publication month (1-12, when available)
    pub_day?: number;    // Publication day (1-31, when available)
    // Association metadata
    relevance_score?: number;
    relevance_rationale?: string;
    ranking?: number;
    is_starred?: boolean;
    is_read?: boolean;
    notes?: string;
    presentation_categories?: string[];  // List of category IDs
    ai_summary?: string | null;  // AI-generated summary from pipeline
    ai_enrichments?: ArticleEnrichments | null;
    // Context fields - populated when viewing favorites across multiple reports
    report_id?: number;
    report_name?: string;
    stream_id?: number;
    stream_name?: string;
    starred_at?: string;  // ISO datetime string
}

// ============================================================================
// REPORT (Main Type)
// ============================================================================

export interface Report {
    report_id: number;
    user_id: number;
    research_stream_id: number | null;
    report_name: string;  // Human-readable report name (defaults to YYYY.MM.DD)
    report_date: string;
    key_highlights: string[];
    thematic_analysis?: string | null;  // Generated separately by LLM
    coverage_stats: Record<string, any>;
    is_read: boolean;
    read_at: string | null;
    created_at: string;
    article_count?: number;
    // Pipeline execution metadata
    run_type?: string | null;  // 'test', 'scheduled', or 'manual'
    retrieval_params?: Record<string, any>;  // Input parameters: start_date, end_date, etc.
    enrichments?: Record<string, any>;  // LLM-generated content: executive_summary, category_summaries
    pipeline_metrics?: Record<string, any>;  // Execution metadata: counts, timing, etc.
    pipeline_execution_id?: string | null;  // UUID linking to WIP data
    // Coverage period (from pipeline_execution)
    coverage_start_date?: string | null;  // YYYY-MM-DD
    coverage_end_date?: string | null;  // YYYY-MM-DD
    // Approval workflow
    approval_status: ApprovalStatus;
    approved_by?: number | null;
    approved_at?: string | null;
    rejection_reason?: string | null;
}

export interface ReportWithArticles extends Report {
    articles: ReportArticle[];
}
