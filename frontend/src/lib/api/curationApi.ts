/**
 * Curation API - Human review and approval workflow for pipeline outputs
 *
 * Matches backend router: /api/operations/reports/{report_id}/...
 */

import { api } from './index';
import { PromptTemplate } from '../../types/research-stream';

// ==================== Types ====================

export interface CurationStats {
    pipeline_included: number;
    pipeline_filtered: number;
    pipeline_duplicates: number;
    current_included: number;
    curator_added: number;
    curator_removed: number;
}

export interface CurationReportData {
    report_id: number;
    report_name: string;
    original_report_name: string | null;
    report_date: string | null;
    approval_status: string | null;
    executive_summary: string;
    original_executive_summary: string;
    category_summaries: Record<string, string>;
    original_category_summaries: Record<string, string>;
    has_curation_edits: boolean;
    last_curated_by: number | null;
    last_curated_at: string | null;
}

export interface CurationCategory {
    id: string;
    name: string;
    color?: string;
    description?: string;
}

export interface CurationIncludedArticle {
    article_id: number;
    pmid: string | null;
    doi: string | null;
    title: string;
    authors: string[];
    journal: string | null;
    // Honest date fields
    pub_year?: number | null;
    pub_month?: number | null;
    pub_day?: number | null;
    abstract: string | null;
    url: string | null;
    // Association data (how article appears in this report)
    ranking: number | null;
    original_ranking: number | null;
    presentation_categories: string[];
    original_presentation_categories: string[];
    ai_summary: string | null;
    original_ai_summary: string | null;
    relevance_score: number | null;
    // Curation data (from WipArticle - audit trail)
    curation_notes: string | null;
    curated_by: number | null;
    curated_at: string | null;
    // Source indicator
    curator_added: boolean;
    wip_article_id: number | null;
    // Filter data (from WipArticle)
    filter_score: number | null;
    filter_score_reason: string | null;
}

export interface CurationFilteredArticle {
    wip_article_id: number;
    pmid: string | null;
    doi: string | null;
    title: string;
    authors: string[];
    journal: string | null;
    // Honest date fields
    pub_year?: number | null;
    pub_month?: number | null;
    pub_day?: number | null;
    abstract: string | null;
    url: string | null;
    filter_score: number | null;
    filter_score_reason: string | null;
    passed_semantic_filter: boolean | null;
    is_duplicate: boolean;
    duplicate_of_pmid: string | null;
    included_in_report: boolean;
    curator_included: boolean;
    curator_excluded: boolean;
    curation_notes: string | null;
}

export interface CurationViewResponse {
    report: CurationReportData;
    included_articles: CurationIncludedArticle[];
    filtered_articles: CurationFilteredArticle[];
    duplicate_articles: CurationFilteredArticle[];
    curated_articles: CurationFilteredArticle[];
    categories: CurationCategory[];
    stream_name: string | null;
    stats: CurationStats;
    execution_id: string | null;
    retrieval_config: Record<string, unknown> | null;
    start_date: string | null;
    end_date: string | null;
    // Configuration snapshots from execution
    enrichment_config: Record<string, unknown> | null;
    llm_config: Record<string, unknown> | null;
}

export interface CurationEvent {
    id: number;
    event_type: string;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    notes: string | null;
    article_id: number | null;
    article_title: string | null;
    curator_name: string;
    created_at: string;
}

export interface CurationHistoryResponse {
    events: CurationEvent[];
    total_count: number;
}

export interface PipelineAnalyticsResponse {
    report_id: number;
    execution_id: string | null;
    retrieval_config: Record<string, unknown> | null;
    stats: CurationStats;
    [key: string]: unknown;
}

// Request/Response types
export interface ReportContentUpdate {
    report_name?: string;
    executive_summary?: string;
    category_summaries?: Record<string, string>;
}

export interface ReportContentUpdateResponse {
    report_name: string;
    executive_summary: string;
    category_summaries: Record<string, string>;
    has_curation_edits: boolean;
}

export interface ExcludeArticleResponse {
    article_id: number;
    excluded: boolean;
    wip_article_updated: boolean;
}

export interface IncludeArticleResponse {
    article_id: number;
    wip_article_id: number;
    included: boolean;
    ranking: number;
    category: string | null;
}

export interface ResetCurationResponse {
    wip_article_id: number;
    reset: boolean;
    was_curator_included?: boolean;
    was_curator_excluded?: boolean;
    pipeline_decision?: boolean;
    now_in_report?: boolean;
    message?: string;
}

export interface UpdateArticleResponse {
    article_id: number;
    ranking: number | null;
    presentation_categories: string[];
    ai_summary: string | null;
}

export interface UpdateWipArticleNotesResponse {
    wip_article_id: number;
    curation_notes: string | null;
}

export interface ApproveReportResponse {
    report_id: number;
    approval_status: string;
    approved_by: number;
    approved_at: string;
}

export interface RejectReportResponse {
    report_id: number;
    approval_status: string;
    rejection_reason: string;
    rejected_by: number;
    rejected_at: string;
}

// ==================== API Functions ====================

const BASE_PATH = '/api/operations/reports';

/**
 * Get curation view for a report.
 * Returns report content, included articles, filtered articles, and duplicates.
 */
export async function getCurationView(reportId: number): Promise<CurationViewResponse> {
    const response = await api.get<CurationViewResponse>(`${BASE_PATH}/${reportId}/curation`);
    return response.data;
}

/**
 * Get curation history (audit trail) for a report.
 */
export async function getCurationHistory(reportId: number): Promise<CurationHistoryResponse> {
    const response = await api.get<CurationHistoryResponse>(`${BASE_PATH}/${reportId}/curation/history`);
    return response.data;
}

/**
 * Response for getReportConfig - lightweight config for settings modal.
 */
export interface ReportConfigResponse {
    retrieval_config: Record<string, unknown> | null;
    enrichment_config: Record<string, unknown> | null;
    llm_config: Record<string, unknown> | null;
    start_date: string | null;
    end_date: string | null;
    stream_name: string | null;
}

/**
 * Get lightweight configuration for a report (for settings modal).
 * Returns just the config data without all the article data.
 */
export async function getReportConfig(reportId: number): Promise<ReportConfigResponse> {
    const response = await api.get<ReportConfigResponse>(`${BASE_PATH}/${reportId}/config`);
    return response.data;
}

/**
 * Get pipeline analytics for a report.
 */
export async function getPipelineAnalytics(reportId: number): Promise<PipelineAnalyticsResponse> {
    const response = await api.get<PipelineAnalyticsResponse>(`${BASE_PATH}/${reportId}/pipeline-analytics`);
    return response.data;
}

/**
 * Update report content (name, summaries).
 */
export async function updateReportContent(
    reportId: number,
    updates: ReportContentUpdate
): Promise<ReportContentUpdateResponse> {
    const response = await api.patch<ReportContentUpdateResponse>(
        `${BASE_PATH}/${reportId}/content`,
        updates
    );
    return response.data;
}

/**
 * Exclude an article from the report.
 * @param articleId - The Article ID
 */
export async function excludeArticle(
    reportId: number,
    articleId: number,
    notes?: string
): Promise<ExcludeArticleResponse> {
    const response = await api.post<ExcludeArticleResponse>(
        `${BASE_PATH}/${reportId}/articles/${articleId}/exclude`,
        { notes }
    );
    return response.data;
}

/**
 * Include a filtered article into the report.
 * @param wipArticleId - The WipArticle ID
 */
export async function includeArticle(
    reportId: number,
    wipArticleId: number,
    category?: string
): Promise<IncludeArticleResponse> {
    const response = await api.post<IncludeArticleResponse>(
        `${BASE_PATH}/${reportId}/articles/include`,
        { wip_article_id: wipArticleId, category }
    );
    return response.data;
}

/**
 * Reset curation for an article, restoring it to the pipeline's original decision.
 * @param wipArticleId - The WipArticle ID
 */
export async function resetCuration(
    reportId: number,
    wipArticleId: number
): Promise<ResetCurationResponse> {
    const response = await api.post<ResetCurationResponse>(
        `${BASE_PATH}/${reportId}/articles/${wipArticleId}/reset-curation`
    );
    return response.data;
}

/**
 * Update an article within a report (ranking, category, AI summary).
 * @param articleId - The Article ID
 */
export async function updateArticleInReport(
    reportId: number,
    articleId: number,
    updates: {
        ranking?: number;
        category?: string;
        ai_summary?: string;
    }
): Promise<UpdateArticleResponse> {
    const response = await api.patch<UpdateArticleResponse>(
        `${BASE_PATH}/${reportId}/articles/${articleId}`,
        updates
    );
    return response.data;
}

/**
 * Update curation notes for a WipArticle.
 * @param wipArticleId - The WipArticle ID
 */
export async function updateWipArticleCurationNotes(
    reportId: number,
    wipArticleId: number,
    curationNotes: string
): Promise<UpdateWipArticleNotesResponse> {
    const response = await api.patch<UpdateWipArticleNotesResponse>(
        `${BASE_PATH}/${reportId}/wip-articles/${wipArticleId}/notes`,
        { curation_notes: curationNotes }
    );
    return response.data;
}

/**
 * Approve a report for distribution.
 */
export async function approveReport(reportId: number): Promise<ApproveReportResponse> {
    const response = await api.post<ApproveReportResponse>(`${BASE_PATH}/${reportId}/approve`);
    return response.data;
}

/**
 * Reject a report with a reason.
 */
export async function rejectReport(reportId: number, reason: string): Promise<RejectReportResponse> {
    const response = await api.post<RejectReportResponse>(`${BASE_PATH}/${reportId}/reject`, { reason });
    return response.data;
}

/**
 * Send an approval request email to an admin.
 */
export async function sendApprovalRequest(
    reportId: number,
    adminUserId: number
): Promise<{ success: boolean; message: string }> {
    const response = await api.post<{ success: boolean; message: string }>(
        `${BASE_PATH}/${reportId}/request-approval`,
        { admin_user_id: adminUserId }
    );
    return response.data;
}

// ==================== Regeneration ====================

export interface RegenerateExecutiveSummaryResponse {
    executive_summary: string;
}

export interface RegenerateCategorySummaryResponse {
    category_id: string;
    category_summary: string;
}

export interface RegenerateArticleSummaryResponse {
    article_id: number;
    ai_summary: string;
}

/**
 * Regenerate the executive summary for a report using AI.
 */
export async function regenerateExecutiveSummary(
    reportId: number
): Promise<RegenerateExecutiveSummaryResponse> {
    const response = await api.post<RegenerateExecutiveSummaryResponse>(
        `${BASE_PATH}/${reportId}/regenerate/executive-summary`
    );
    return response.data;
}

/**
 * Regenerate a category summary for a report using AI.
 */
export async function regenerateCategorySummary(
    reportId: number,
    categoryId: string
): Promise<RegenerateCategorySummaryResponse> {
    const response = await api.post<RegenerateCategorySummaryResponse>(
        `${BASE_PATH}/${reportId}/regenerate/category-summary/${categoryId}`
    );
    return response.data;
}

/**
 * Regenerate the AI summary for a specific article in the report.
 */
export async function regenerateArticleSummary(
    reportId: number,
    articleId: number
): Promise<RegenerateArticleSummaryResponse> {
    const response = await api.post<RegenerateArticleSummaryResponse>(
        `${BASE_PATH}/${reportId}/articles/${articleId}/regenerate-summary`
    );
    return response.data;
}

// ==================== Regenerate with Custom Prompt ====================

// PromptTemplate imported from types/research-stream.ts

export interface RegenerateSummariesLLMConfig {
    model_id?: string;  // Optional - backend uses stream default if not provided
    temperature?: number;
    max_tokens?: number;
    reasoning_effort?: string;
}

export interface RegenerateSummariesRequest {
    prompt_type: 'article_summary' | 'category_summary' | 'executive_summary';
    prompt: PromptTemplate;
    llm_config?: RegenerateSummariesLLMConfig;
}

export interface RegenerateSummariesResponse {
    updated_count: number;
    message: string;
    prompt_type: string;
}

/**
 * Regenerate summaries for a report using a custom prompt.
 * Used to apply a tested prompt from Layer 4 to a report's summaries.
 *
 * @param reportId - The report to update
 * @param request - The prompt type, custom prompt, and optional LLM config
 */
export async function regenerateSummariesWithPrompt(
    reportId: number,
    request: RegenerateSummariesRequest
): Promise<RegenerateSummariesResponse> {
    const response = await api.post<RegenerateSummariesResponse>(
        `${BASE_PATH}/${reportId}/regenerate-summaries`,
        request
    );
    return response.data;
}

// ==================== Current Article Summaries ====================

export interface CurrentArticleSummaryItem {
    article_id: number;
    association_id: number;
    title: string;
    pmid: string | null;
    journal: string | null;
    // Honest date fields
    pub_year?: number | null;
    pub_month?: number | null;
    pub_day?: number | null;
    current_summary: string | null;
}

export interface CurrentArticleSummariesResponse {
    report_id: number;
    report_name: string;
    total_articles: number;
    articles: CurrentArticleSummaryItem[];
}

/**
 * Get current article summaries for a report (no generation).
 * Fetches all current article summaries for display before regeneration.
 *
 * @param reportId - The report to fetch summaries for
 */
export async function getCurrentArticleSummaries(
    reportId: number
): Promise<CurrentArticleSummariesResponse> {
    const response = await api.get<CurrentArticleSummariesResponse>(
        `${BASE_PATH}/${reportId}/summaries/current`
    );
    return response.data;
}

// ==================== Current Category Summaries ====================

export interface CurrentCategorySummaryItem {
    category_id: string;
    category_name: string;
    current_summary: string | null;
}

export interface CurrentCategorySummariesResponse {
    report_id: number;
    report_name: string;
    total_categories: number;
    categories: CurrentCategorySummaryItem[];
}

/**
 * Get current category summaries for a report (no generation).
 * Fetches all current category summaries for display before regeneration.
 *
 * @param reportId - The report to fetch summaries for
 */
export async function getCurrentCategorySummaries(
    reportId: number
): Promise<CurrentCategorySummariesResponse> {
    const response = await api.get<CurrentCategorySummariesResponse>(
        `${BASE_PATH}/${reportId}/category-summaries/current`
    );
    return response.data;
}

// ==================== Current Executive Summary ====================

export interface CurrentExecutiveSummaryResponse {
    report_id: number;
    report_name: string;
    current_summary: string | null;
}

/**
 * Get current executive summary for a report (no generation).
 * Fetches the current executive summary for display before regeneration.
 *
 * @param reportId - The report to fetch summary for
 */
export async function getCurrentExecutiveSummary(
    reportId: number
): Promise<CurrentExecutiveSummaryResponse> {
    const response = await api.get<CurrentExecutiveSummaryResponse>(
        `${BASE_PATH}/${reportId}/executive-summary/current`
    );
    return response.data;
}

// ==================== Article Summary Preview & Batch Update ====================

export interface ArticleSummaryPreviewItem {
    article_id: number;
    association_id: number;
    title: string;
    pmid: string | null;
    current_summary: string | null;
    new_summary: string | null;
    error: string | null;
}

export interface PreviewArticleSummariesRequest {
    prompt: PromptTemplate;
    llm_config?: RegenerateSummariesLLMConfig;
}

export interface PreviewArticleSummariesResponse {
    report_id: number;
    total_articles: number;
    previews: ArticleSummaryPreviewItem[];
}

export interface BatchUpdateSummaryItem {
    article_id: number;
    ai_summary: string;
}

export interface BatchUpdateSummariesRequest {
    updates: BatchUpdateSummaryItem[];
}

export interface BatchUpdateSummariesResponse {
    report_id: number;
    updated_count: number;
    message: string;
    statistics: {
        provided: number;
        updated: number;
        not_found: number;
    };
}

/**
 * Preview article summary regeneration without saving.
 * Generates new summaries and returns both current and new for comparison.
 *
 * @param reportId - The report to preview summaries for
 * @param request - The prompt and optional LLM config
 */
export async function previewArticleSummaries(
    reportId: number,
    request: PreviewArticleSummariesRequest
): Promise<PreviewArticleSummariesResponse> {
    const response = await api.post<PreviewArticleSummariesResponse>(
        `${BASE_PATH}/${reportId}/summaries/preview`,
        request
    );
    return response.data;
}

/**
 * Batch update selected article summaries.
 * Only updates the articles specified in the request.
 *
 * @param reportId - The report to update
 * @param request - List of article_id and ai_summary pairs to update
 */
export async function batchUpdateArticleSummaries(
    reportId: number,
    request: BatchUpdateSummariesRequest
): Promise<BatchUpdateSummariesResponse> {
    const response = await api.post<BatchUpdateSummariesResponse>(
        `${BASE_PATH}/${reportId}/summaries/batch-update`,
        request
    );
    return response.data;
}

// ==================== Executive Summary Preview & Save ====================

export interface ExecutiveSummaryPreviewResponse {
    report_id: number;
    report_name: string;
    current_summary: string | null;
    new_summary: string | null;
    error: string | null;
}

export interface SaveExecutiveSummaryRequest {
    summary: string;
}

export interface SaveExecutiveSummaryResponse {
    report_id: number;
    updated: boolean;
    message: string;
}

/**
 * Preview executive summary regeneration without saving.
 */
export async function previewExecutiveSummary(
    reportId: number,
    request: PreviewArticleSummariesRequest
): Promise<ExecutiveSummaryPreviewResponse> {
    const response = await api.post<ExecutiveSummaryPreviewResponse>(
        `${BASE_PATH}/${reportId}/executive-summary/preview`,
        request
    );
    return response.data;
}

/**
 * Save a new executive summary to the report.
 */
export async function saveExecutiveSummary(
    reportId: number,
    request: SaveExecutiveSummaryRequest
): Promise<SaveExecutiveSummaryResponse> {
    const response = await api.post<SaveExecutiveSummaryResponse>(
        `${BASE_PATH}/${reportId}/executive-summary/save`,
        request
    );
    return response.data;
}

// ==================== Category Summaries Preview & Save ====================

export interface CategorySummaryPreviewItem {
    category_id: string;
    category_name: string;
    current_summary: string | null;
    new_summary: string | null;
    error: string | null;
}

export interface CategorySummariesPreviewResponse {
    report_id: number;
    report_name: string;
    total_categories: number;
    previews: CategorySummaryPreviewItem[];
}

export interface SaveCategorySummaryItem {
    category_id: string;
    summary: string;
}

export interface SaveCategorySummariesRequest {
    updates: SaveCategorySummaryItem[];
}

export interface SaveCategorySummariesResponse {
    report_id: number;
    updated_count: number;
    message: string;
}

/**
 * Preview category summaries regeneration without saving.
 */
export async function previewCategorySummaries(
    reportId: number,
    request: PreviewArticleSummariesRequest
): Promise<CategorySummariesPreviewResponse> {
    const response = await api.post<CategorySummariesPreviewResponse>(
        `${BASE_PATH}/${reportId}/category-summaries/preview`,
        request
    );
    return response.data;
}

/**
 * Save selected category summaries to the report.
 */
export async function saveCategorySummaries(
    reportId: number,
    request: SaveCategorySummariesRequest
): Promise<SaveCategorySummariesResponse> {
    const response = await api.post<SaveCategorySummariesResponse>(
        `${BASE_PATH}/${reportId}/category-summaries/save`,
        request
    );
    return response.data;
}

// ==================== Stance Analysis Preview & Batch Update ====================

export interface CurrentStanceAnalysisItem {
    article_id: number;
    association_id: number;
    title: string;
    pmid: string | null;
    journal: string | null;
    // Honest date fields
    pub_year?: number | null;
    pub_month?: number | null;
    pub_day?: number | null;
    current_stance: Record<string, unknown> | null;
}

export interface CurrentStanceAnalysisResponse {
    report_id: number;
    report_name: string;
    total_articles: number;
    articles: CurrentStanceAnalysisItem[];
}

export interface StanceAnalysisPreviewItem {
    article_id: number;
    association_id: number;
    title: string;
    pmid: string | null;
    current_stance: Record<string, unknown> | null;
    new_stance: Record<string, unknown> | null;
    error: string | null;
}

export interface PreviewStanceAnalysisResponse {
    report_id: number;
    total_articles: number;
    previews: StanceAnalysisPreviewItem[];
}

export interface BatchUpdateStanceItem {
    article_id: number;
    stance_analysis: Record<string, unknown>;
}

export interface BatchUpdateStanceRequest {
    updates: BatchUpdateStanceItem[];
}

export interface BatchUpdateStanceResponse {
    report_id: number;
    updated_count: number;
    message: string;
    statistics: {
        provided: number;
        updated: number;
        not_found: number;
    };
}

/**
 * Get current stance analysis for all articles in a report.
 * Fetches current stance analysis for display before regeneration.
 *
 * @param reportId - The report to fetch stance analysis for
 */
export async function getCurrentStanceAnalysis(
    reportId: number
): Promise<CurrentStanceAnalysisResponse> {
    const response = await api.get<CurrentStanceAnalysisResponse>(
        `${BASE_PATH}/${reportId}/stance-analysis/current`
    );
    return response.data;
}

/**
 * Preview stance analysis regeneration without saving.
 * Generates new stance analysis and returns both current and new for comparison.
 *
 * @param reportId - The report to preview stance analysis for
 * @param request - The prompt and optional LLM config
 */
export async function previewStanceAnalysis(
    reportId: number,
    request: PreviewArticleSummariesRequest
): Promise<PreviewStanceAnalysisResponse> {
    const response = await api.post<PreviewStanceAnalysisResponse>(
        `${BASE_PATH}/${reportId}/stance-analysis/preview`,
        request
    );
    return response.data;
}

/**
 * Batch update selected stance analyses.
 * Only updates the articles specified in the request.
 *
 * @param reportId - The report to update
 * @param request - List of article_id and stance_analysis pairs to update
 */
export async function batchUpdateStanceAnalysis(
    reportId: number,
    request: BatchUpdateStanceRequest
): Promise<BatchUpdateStanceResponse> {
    const response = await api.post<BatchUpdateStanceResponse>(
        `${BASE_PATH}/${reportId}/stance-analysis/batch-update`,
        request
    );
    return response.data;
}
