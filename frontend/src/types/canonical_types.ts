/**
 * Canonical Types for Frontend
 *
 * This file contains canonical type definitions used across the frontend.
 * Only types that are actively imported and used are included.
 *
 * Organized to mirror backend schemas/canonical_types.py for easy cross-reference.
 * Section order:
 *   1. Feature Definitions
 *   2. Research Article (Universal Interface)
 *   3. Clinical Trial Types
 *
 * Note: Source-specific types (CanonicalPubMedArticle, CanonicalScholarArticle, etc.)
 * are backend-only transient types and are NOT needed on the frontend.
 * All article data reaches the frontend as CanonicalResearchArticle.
 */

import { ArticleEnrichments } from './report';

// ============================================================================
// FEATURE DEFINITIONS
// ============================================================================

export interface CanonicalFeatureDefinition {
    id: string;
    name: string;
    description: string;
    type: 'boolean' | 'text' | 'score' | 'number';
    options?: Record<string, any>;
}

// Type for extracted feature values - aligned with CanonicalFeatureDefinition.type
export type CanonicalFeatureValue = boolean | string | number;
// - boolean: for 'boolean' type features
// - string: for 'text' type features
// - number: for 'score' and 'number' type features

// ============================================================================
// RESEARCH ARTICLE (Universal Interface)
// ============================================================================

/**
 * Universal article interface for all sources (PubMed, Google Scholar, etc.)
 *
 * This is the ONLY article type used on the frontend. Source-specific types
 * (CanonicalPubMedArticle, CanonicalScholarArticle) exist on the backend
 * as transient intermediates but are converted to this type before reaching
 * the frontend.
 */
export interface CanonicalResearchArticle {
    // Core identification
    id: string;
    source: 'pubmed' | 'scholar';
    pmid?: string; // PubMed ID (for PubMed articles)

    // Core metadata
    title: string;
    authors: string[];
    abstract?: string;
    snippet?: string;
    full_text?: string;  // Full article text (if available from PMC)

    // Publication details
    journal?: string;

    // Honest date fields - only populated with actual precision available
    pub_year?: number;   // Publication year (always present from source)
    pub_month?: number;  // Publication month (1-12, when available)
    pub_day?: number;    // Publication day (1-31, when available)

    // PubMed-specific date fields (always populated for PubMed articles)
    date_completed?: string;     // Date record was completed (YYYY-MM-DD)
    date_revised?: string;       // Date record was last revised (YYYY-MM-DD)
    date_entered?: string;       // Date entered into PubMed (YYYY-MM-DD)

    // Identifiers and links
    doi?: string;
    url?: string;
    pdf_url?: string;

    // Classification and keywords
    keywords: string[];
    mesh_terms: string[];
    categories: string[];

    // Citation and related content
    citation_count?: number;
    cited_by_url?: string;
    related_articles_url?: string;
    versions_url?: string;

    // Search context
    search_position?: number;
    relevance_score?: number;

    // Research analysis results
    extracted_features?: Record<string, CanonicalFeatureValue>;
    quality_scores?: Record<string, number>;

    // Source preservation
    source_metadata?: Record<string, any>;

    // Enrichment metadata (e.g., abstract source tracking)
    metadata?: Record<string, any>;

    // System metadata
    indexed_at?: string;
    retrieved_at?: string;

    // Report-specific metadata (when article is from a report)
    notes?: string;
    ai_enrichments?: ArticleEnrichments | null;
}

// ============================================================================
// CLINICAL TRIAL TYPES
// ============================================================================

export interface CanonicalTrialIntervention {
    type: string;           // DRUG, BIOLOGICAL, DEVICE, PROCEDURE, etc.
    name: string;
    description?: string;
}

export interface CanonicalTrialOutcome {
    measure: string;
    time_frame?: string;
}

export interface CanonicalTrialSponsor {
    name: string;
    type?: string;          // INDUSTRY, NIH, ACADEMIC, etc.
}

export interface CanonicalTrialLocation {
    facility?: string;
    city?: string;
    state?: string;
    country: string;
}

export interface CanonicalClinicalTrial {
    // Identifiers
    nct_id: string;
    org_study_id?: string;

    // Basic Info
    title: string;
    brief_title?: string;
    brief_summary?: string;
    detailed_description?: string;

    // Status
    status: string;         // RECRUITING, COMPLETED, TERMINATED, etc.
    status_verified_date?: string;
    start_date?: string;
    completion_date?: string;
    last_update_date?: string;

    // Study Design
    study_type: string;     // INTERVENTIONAL, OBSERVATIONAL
    phase?: string;         // PHASE1, PHASE2, PHASE3, PHASE4, NA
    allocation?: string;    // RANDOMIZED, NON_RANDOMIZED
    intervention_model?: string; // PARALLEL, CROSSOVER, SINGLE_GROUP
    masking?: string;       // NONE, SINGLE, DOUBLE, TRIPLE, QUADRUPLE
    primary_purpose?: string; // TREATMENT, PREVENTION, DIAGNOSTIC

    // Interventions
    interventions: CanonicalTrialIntervention[];

    // Conditions
    conditions: string[];

    // Eligibility
    eligibility_criteria?: string;
    sex?: string;           // ALL, MALE, FEMALE
    min_age?: string;
    max_age?: string;
    healthy_volunteers?: boolean;
    enrollment_count?: number;
    enrollment_type?: string; // ESTIMATED, ACTUAL

    // Outcomes
    primary_outcomes: CanonicalTrialOutcome[];
    secondary_outcomes?: CanonicalTrialOutcome[];

    // Sponsors
    lead_sponsor?: CanonicalTrialSponsor;
    collaborators?: CanonicalTrialSponsor[];

    // Locations
    locations: CanonicalTrialLocation[];
    location_countries: string[];

    // Links
    url: string;

    // Keywords
    keywords: string[];

    // Source metadata
    source_metadata?: Record<string, any>;

    // Extraction and analysis results (for AI columns)
    extracted_features?: Record<string, any>;

    // Timestamps
    retrieved_at?: string;
}
