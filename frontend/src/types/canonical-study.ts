/**
 * Canonical Study Representation Types
 *
 * Unified representation combining archetype and entity-relationship analysis.
 *
 * Organized to mirror backend schemas/canonical_study.py for easy cross-reference.
 */

import { EntityRelationshipAnalysis } from './entity-extraction';

/**
 * Complete canonical representation of a research study
 * Combines archetype description with entity-relationship graph
 */
export interface CanonicalStudyRepresentation {
  /** Natural language archetype sentence describing the study structure */
  archetype_text?: string | null;
  
  /** High-level study type classification (e.g., "Intervention", "Observational") */
  study_type?: string | null;
  
  /** Pattern ID identifying the specific archetype template used (e.g., "1a", "2b") */
  pattern_id?: string | null;
  
  /** Complete entity-relationship graph analysis */
  entity_analysis?: EntityRelationshipAnalysis | null;
  
  /** Timestamp of last update */
  last_updated?: string | null;
  
  /** Schema version for backwards compatibility */
  version?: string | null;
}

/**
 * Request payload for saving canonical study representation - supports partial updates
 */
export interface SaveCanonicalStudyRequest {
  archetype_text?: string;  // If provided, updates archetype
  study_type?: string;
  pattern_id?: string;
  entity_analysis?: EntityRelationshipAnalysis;  // If provided, updates entity analysis
  update_entity_analysis?: boolean;  // If true, updates entity_analysis even if null (to clear it)
}

/**
 * Response from saving canonical study representation
 */
export interface SaveCanonicalStudyResponse {
  success: boolean;
  last_updated: string;
}