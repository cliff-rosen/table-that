"""
Semantic Space schemas for Knowledge Horizon

Based on three-layer architecture: Layer 1 (Semantic Space) is the canonical,
source-agnostic representation of the information space the user cares about.

Organized to mirror frontend types/semantic-space.ts for easy cross-reference.
Section order:
  1. Enums
  2. Core Semantic Elements
  3. Signal Types and Coverage
  4. Boundaries
  5. Context and Metadata
  6. Main Semantic Space (main type)
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Literal
from datetime import datetime
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================


class EntityType(str, Enum):
    """Types of entities in the semantic space"""
    DISEASE = "disease"
    SUBSTANCE = "substance"
    CHEMICAL = "chemical"
    ORGANIZATION = "organization"
    REGULATION = "regulation"
    STANDARD = "standard"
    METHODOLOGY = "methodology"
    BIOMARKER = "biomarker"
    GEOGRAPHIC = "geographic"
    POPULATION = "population"
    DRUG = "drug"
    GENE = "gene"
    PROTEIN = "protein"
    PATHWAY = "pathway"
    THERAPY = "therapy"
    DEVICE = "device"


class RelationshipType(str, Enum):
    """Types of relationships between semantic elements"""
    CAUSAL = "causal"  # X causes Y
    CORRELATIONAL = "correlational"  # X correlates with Y
    REGULATORY = "regulatory"  # X regulates/governs Y
    METHODOLOGICAL = "methodological"  # X measures/assesses Y
    TEMPORAL = "temporal"  # X precedes/follows Y
    HIERARCHICAL = "hierarchical"  # X is a type of Y
    THERAPEUTIC = "therapeutic"  # Treatment X improves condition Y
    INHIBITORY = "inhibitory"  # X inhibits/blocks Y
    INTERACTIVE = "interactive"  # X and Y interact


class ImportanceLevel(str, Enum):
    """Relative importance of topics/entities"""
    CRITICAL = "critical"
    IMPORTANT = "important"
    RELEVANT = "relevant"


class PriorityLevel(str, Enum):
    """Priority levels for signals and requirements"""
    MUST_HAVE = "must_have"
    SHOULD_HAVE = "should_have"
    NICE_TO_HAVE = "nice_to_have"


# ============================================================================
# CORE SEMANTIC ELEMENTS
# ============================================================================


class Topic(BaseModel):
    """A topic within the semantic space"""
    topic_id: str = Field(description="Unique identifier for this topic")
    name: str = Field(description="Topic name")
    description: str = Field(description="What this topic encompasses")
    parent_topic: Optional[str] = Field(None, description="Parent topic ID for hierarchy")
    importance: ImportanceLevel = Field(description="Relative importance")
    rationale: str = Field(description="Why this topic matters to the user")


class Entity(BaseModel):
    """A named entity in the semantic space"""
    entity_id: str = Field(description="Unique identifier for this entity")
    entity_type: EntityType = Field(description="Type classification")
    name: str = Field(description="Entity name")
    canonical_forms: List[str] = Field(description="Canonical name forms and variations")
    context: str = Field(description="Why this entity matters")


class Relationship(BaseModel):
    """A relationship between topics or entities"""
    relationship_id: str = Field(description="Unique identifier for this relationship")
    type: RelationshipType = Field(description="Type of relationship")
    subject: str = Field(description="Subject topic_id or entity_id")
    object: str = Field(description="Object topic_id or entity_id")
    description: str = Field(description="Description of the relationship")
    strength: Literal["strong", "moderate", "weak"] = Field(description="Strength of relationship")


# ============================================================================
# SIGNAL TYPES AND COVERAGE
# ============================================================================


class SignalType(BaseModel):
    """Types of information signals that matter"""
    signal_id: str = Field(description="Unique identifier for this signal type")
    name: str = Field(description="Signal type name (e.g., 'Peer-reviewed research')")
    description: str = Field(description="What constitutes this signal type")
    priority: PriorityLevel = Field(description="Priority level")
    examples: List[str] = Field(default_factory=list, description="Example publications/sources")


class TemporalScope(BaseModel):
    """Temporal scope and recency weighting"""
    start_date: Optional[str] = Field(None, description="Start date (YYYY-MM-DD) or null for no limit")
    end_date: Optional[str] = Field(None, description="End date (usually 'present')")
    focus_periods: List[str] = Field(default_factory=list, description="Specific periods of interest")
    recency_weight: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Weight for recent vs. historical (0-1)"
    )
    rationale: str = Field(description="Why this temporal scope")


class QualityCriteria(BaseModel):
    """Quality requirements for information sources"""
    peer_review_required: bool = Field(default=True, description="Require peer review")
    minimum_citation_count: Optional[int] = Field(None, description="Minimum citations")
    journal_quality: List[str] = Field(
        default_factory=list,
        description="Specific journals or quality tiers"
    )
    study_types: List[str] = Field(
        default_factory=list,
        description="Accepted study types (RCT, cohort, etc.)"
    )
    exclude_predatory: bool = Field(default=True, description="Exclude predatory journals")
    language_restrictions: List[str] = Field(
        default_factory=list,
        description="Language requirements (e.g., ['English'])"
    )
    other_criteria: List[str] = Field(
        default_factory=list,
        description="Additional quality requirements"
    )


# ============================================================================
# BOUNDARIES
# ============================================================================


class InclusionCriterion(BaseModel):
    """Criterion for what's in scope"""
    criterion_id: str = Field(description="Unique identifier")
    description: str = Field(description="What to include")
    rationale: str = Field(description="Why this is in scope")
    mandatory: bool = Field(description="Must-have vs. nice-to-have")
    related_topics: List[str] = Field(
        default_factory=list,
        description="Topic IDs this criterion covers"
    )
    related_entities: List[str] = Field(
        default_factory=list,
        description="Entity IDs this criterion covers"
    )


class ExclusionCriterion(BaseModel):
    """Criterion for what's out of scope"""
    criterion_id: str = Field(description="Unique identifier")
    description: str = Field(description="What to exclude")
    rationale: str = Field(description="Why this is out of scope")
    strict: bool = Field(description="Hard boundary vs. soft preference")
    exceptions: List[str] = Field(
        default_factory=list,
        description="When this exclusion might not apply"
    )


class EdgeCase(BaseModel):
    """Ambiguous boundary cases"""
    case_id: str = Field(description="Unique identifier")
    description: str = Field(description="Description of the ambiguous case")
    resolution: Literal["include", "exclude", "conditional"] = Field(
        description="How to handle this case"
    )
    conditions: Optional[str] = Field(None, description="Conditions for conditional resolution")
    rationale: str = Field(description="Reasoning for this resolution")


# ============================================================================
# CONTEXT AND METADATA
# ============================================================================


class SemanticContext(BaseModel):
    """Context and purpose of the information space"""
    business_context: str = Field(description="Business context (e.g., 'Defense litigation support')")
    decision_types: List[str] = Field(
        description="Types of decisions this informs"
    )
    stakeholders: List[str] = Field(
        description="Who uses this information"
    )
    time_sensitivity: str = Field(
        description="How frequently information needs to be reviewed"
    )


class CoverageRequirements(BaseModel):
    """Coverage requirements for the semantic space"""
    signal_types: List[SignalType] = Field(description="Types of information that matter")
    temporal_scope: TemporalScope = Field(description="Time boundaries")
    quality_criteria: QualityCriteria = Field(description="Quality thresholds")
    completeness_requirement: str = Field(
        description="Comprehensive vs. selective coverage approach"
    )


class Boundaries(BaseModel):
    """Explicit boundaries of what's in/out of scope"""
    inclusions: List[InclusionCriterion] = Field(description="Positive criteria")
    exclusions: List[ExclusionCriterion] = Field(description="Negative criteria")
    edge_cases: List[EdgeCase] = Field(default_factory=list, description="Ambiguous cases")


class ExtractionMetadata(BaseModel):
    """Metadata about how the semantic space was created"""
    extracted_from: str = Field(description="Source (e.g., chat_session_id, manual_entry)")
    extracted_at: datetime = Field(description="When extraction occurred")
    confidence_score: Optional[float] = Field(
        None,
        ge=0.0,
        le=1.0,
        description="AI confidence in extraction"
    )
    human_reviewed: bool = Field(default=False, description="Has a human reviewed this")
    review_notes: Optional[str] = Field(None, description="Notes from human review")
    derivation_method: Literal["ai_generated", "manual", "hybrid"] = Field(
        default="ai_generated",
        description="How this was created"
    )


class Domain(BaseModel):
    """High-level domain definition"""
    name: str = Field(description="Domain name")
    description: str = Field(description="High-level description of the domain")


# ============================================================================
# MAIN SEMANTIC SPACE
# ============================================================================


class SemanticSpace(BaseModel):
    """
    Complete semantic space definition - Layer 1 of the three-layer architecture.
    This is the canonical, source-agnostic representation of what information matters.
    """
    # Core identification
    domain: Domain = Field(description="Domain definition")

    # What: Topics, Entities, Concepts
    topics: List[Topic] = Field(description="Core topics in this space")
    entities: List[Entity] = Field(default_factory=list, description="Named entities")
    relationships: List[Relationship] = Field(
        default_factory=list,
        description="Semantic relationships"
    )

    # Why: Context and Purpose
    context: SemanticContext = Field(description="Context and purpose")

    # How: Coverage Requirements
    coverage: CoverageRequirements = Field(description="Coverage requirements")

    # Boundaries: What's In/Out
    boundaries: Boundaries = Field(description="Scope boundaries")

    # Metadata
    extraction_metadata: ExtractionMetadata = Field(description="Extraction metadata")

    class Config:
        json_schema_extra = {
            "example": {
                "domain": {
                    "name": "Asbestos Litigation Science",
                    "description": "Scientific evidence relevant to asbestos-related litigation"
                },
                "topics": [
                    {
                        "topic_id": "asbestos_disease_mechanisms",
                        "name": "Asbestos-Related Disease Mechanisms",
                        "description": "Biological mechanisms of asbestos-induced disease",
                        "synonyms": ["asbestos pathophysiology", "asbestos toxicity"],
                        "importance": "critical",
                        "rationale": "Core to causation arguments"
                    }
                ],
                "entities": [],
                "relationships": [],
                "context": {
                    "business_context": "Defense litigation support",
                    "decision_types": ["Case strategy", "Expert witness prep"],
                    "stakeholders": ["Inside counsel", "Litigation support staff"],
                    "time_sensitivity": "Weekly review cadence"
                },
                "coverage": {
                    "signal_types": [],
                    "temporal_scope": {
                        "start_date": None,
                        "end_date": "present",
                        "focus_periods": [],
                        "recency_weight": 0.7,
                        "rationale": "Recent research most relevant"
                    },
                    "quality_criteria": {
                        "peer_review_required": True,
                        "study_types": ["RCT", "cohort", "meta-analysis"],
                        "exclude_predatory": True,
                        "language_restrictions": ["English"],
                        "other_criteria": []
                    },
                    "completeness_requirement": "Comprehensive coverage required"
                },
                "boundaries": {
                    "inclusions": [],
                    "exclusions": [],
                    "edge_cases": []
                },
                "extraction_metadata": {
                    "extracted_from": "onboarding_chat_123",
                    "extracted_at": "2025-01-15T10:00:00Z",
                    "human_reviewed": False,
                    "derivation_method": "ai_generated"
                }
            }
        }
