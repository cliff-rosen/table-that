/**
 * Article types for Knowledge Horizon
 *
 * Organized to mirror backend schemas/article.py for easy cross-reference.
 */

export interface Article {
    article_id: number;
    source_id?: number;
    title: string;
    url?: string;
    authors: string[];
    summary?: string;
    ai_summary?: string;
    full_text?: string;
    article_metadata: Record<string, any>;
    theme_tags: string[];
    first_seen: string;
    last_updated: string;
    fetch_count: number;

    // Honest date fields - only populated with actual precision available
    pub_year?: number;   // Publication year (always present from source)
    pub_month?: number;  // Publication month (1-12, when available)
    pub_day?: number;    // Publication day (1-31, when available)

    // PubMed-specific fields
    pmid?: string;
    abstract?: string;
    comp_date?: string;
    journal?: string;
    volume?: string;
    issue?: string;
    medium?: string;
    pages?: string;
    poi?: string;
    doi?: string;
    is_systematic: boolean;
}
