/**
 * Document Analysis Types
 *
 * Organized to mirror backend schemas/document_analysis.py for easy cross-reference.
 * Note: Backend has additional LLM Response Schemas section.
 */

// ============================================================================
// Enums
// ============================================================================

export type EntityCategory =
    | 'person'
    | 'organization'
    | 'concept'
    | 'location'
    | 'date'
    | 'technical_term'
    | 'other';

export type ClaimType =
    | 'factual'
    | 'causal'
    | 'evaluative'
    | 'recommendation'
    | 'prediction';

export type EvidenceStrength = 'strong' | 'moderate' | 'weak';

// ============================================================================
// Hierarchical Summary Types
// ============================================================================

export interface KeyPoint {
    id: string;
    text: string;
    source_span?: string;
    importance: number;
}

export interface SectionSummary {
    id: string;
    title: string;
    summary: string;
    key_points: KeyPoint[];
    source_spans: string[];
}

export interface ExecutiveSummary {
    summary: string;
    main_themes: string[];
    key_conclusions: string[];
}

export interface HierarchicalSummary {
    executive: ExecutiveSummary;
    sections: SectionSummary[];
    total_key_points: number;
}

// ============================================================================
// Entity Types
// ============================================================================

export interface ExtractedEntity {
    id: string;
    name: string;
    category: EntityCategory;
    description?: string;
    mentions: string[];
    mention_count: number;
    importance: number;
    related_entities: string[];
}

// ============================================================================
// Claim Types
// ============================================================================

export interface Evidence {
    text: string;
    source_span?: string;
    strength: EvidenceStrength;
}

export interface ExtractedClaim {
    id: string;
    claim: string;
    claim_type: ClaimType;
    confidence: number;
    evidence: Evidence[];
    supporting_entities: string[];
    counter_arguments: string[];
}

// ============================================================================
// Graph Types (for React Flow)
// ============================================================================

export interface GraphNodeData {
    label: string;
    details: Record<string, any>;
    nodeType: string;
}

export interface GraphNode {
    id: string;
    type: string;
    data: GraphNodeData;
    position: { x: number; y: number };
}

export interface GraphEdge {
    id: string;
    source: string;
    target: string;
    label?: string;
    type?: string;
}

// ============================================================================
// Request/Response Types
// ============================================================================

export interface AnalysisOptions {
    hierarchical_summary?: boolean;
    entity_extraction?: boolean;
    claim_extraction?: boolean;
}

export interface DocumentAnalysisRequest {
    document_text: string;
    document_title?: string;
    analysis_options?: AnalysisOptions;
}

export interface DocumentAnalysisResult {
    document_id: string;
    title?: string;
    hierarchical_summary: HierarchicalSummary;
    entities: ExtractedEntity[];
    claims: ExtractedClaim[];
    graph_nodes: GraphNode[];
    graph_edges: GraphEdge[];
    analysis_metadata: Record<string, any>;
}

// ============================================================================
// View Types
// ============================================================================

export type ViewMode = 'tree' | 'graph' | 'split';

export interface SelectedNode {
    id: string;
    type: 'executive' | 'section' | 'keypoint' | 'entity' | 'claim';
    data: any;
}

// ============================================================================
// Streaming Types
// ============================================================================

export type AnalysisStreamMessageType =
    | 'status'
    | 'progress'
    | 'summary'
    | 'entities'
    | 'claims'
    | 'result'
    | 'error';

export interface AnalysisStreamMessage {
    type: AnalysisStreamMessageType;
    message: string;
    data?: Record<string, any>;
    timestamp: string;
}

export interface AnalysisProgress {
    phase: 'hierarchical_summary' | 'entity_extraction' | 'claim_extraction' | null;
    message: string;
    isComplete: boolean;
}

// ============================================================================
// Article Stance Analysis Types
// ============================================================================

export type StanceType = 'pro-defense' | 'pro-plaintiff' | 'neutral' | 'mixed' | 'unclear';

export interface ArticleInfo {
    title: string;
    abstract?: string;
    authors?: string[];
    journal?: string;
    pub_year?: number;
    pub_month?: number;
    pub_day?: number;
    pmid?: string;
    doi?: string;
}

export interface StanceAnalysisRequest {
    article: ArticleInfo;
    stream_id: number;
}

export interface StanceAnalysisResult {
    stance: StanceType;
    confidence: number;
    analysis: string;
    key_factors: string[];
    relevant_quotes: string[];
}
