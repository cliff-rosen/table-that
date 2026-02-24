/**
 * Types for entity relationship extraction
 *
 * Organized to mirror backend schemas/entity_extraction.py for easy cross-reference.
 * Note: Backend has additional types (StudyType, ArticleArchetype, ArticleArchetypeRequest)
 */

// ============================================================================
// ENUMS
// ============================================================================

export type EntityType =
  | 'medical_condition'
  | 'biological_factor'
  | 'intervention'
  | 'patient_characteristic'
  | 'psychological_factor'
  | 'outcome'
  | 'gene'
  | 'protein'
  | 'pathway'
  | 'drug'
  | 'environmental_factor'
  | 'animal_model'
  | 'exposure'
  | 'other';

export type RelationshipType =
  | 'causal'
  | 'therapeutic'
  | 'associative'
  | 'temporal'
  | 'inhibitory'
  | 'regulatory'
  | 'interactive'
  | 'paradoxical'
  | 'correlative'
  | 'predictive';

export type PatternComplexity = 'SIMPLE' | 'COMPLEX';

export type RelationshipStrength = 'strong' | 'moderate' | 'weak';

// ============================================================================
// ENTITY TYPES
// ============================================================================

export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  role?: string;
  description?: string;
  mentions?: string[];
}

export interface Relationship {
  source_entity_id: string;
  target_entity_id: string;
  type: RelationshipType;
  description: string;
  evidence?: string;
  strength?: RelationshipStrength;
}

export interface EntityRelationshipAnalysis {
  pattern_complexity: PatternComplexity;
  entities: Entity[];
  relationships: Relationship[];
  complexity_justification?: string;
  clinical_significance?: string;
  key_findings?: string[];
  entity_count?: number;
  relationship_count?: number;
}

// ============================================================================
// RESPONSE TYPES
// ============================================================================

export interface EntityExtractionResponse {
  article_id: string;
  analysis: EntityRelationshipAnalysis;
  extraction_metadata?: {
    extraction_timestamp?: string;
    confidence_score?: number;
    include_gene_data?: boolean;
    include_drug_data?: boolean;
    focus_areas?: string[];
  };
}

export interface ArticleArchetypeResponse {
  article_id: string;
  archetype: string;
  study_type?: string;
  pattern_id?: string;
}