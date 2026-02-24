"""
Schemas for entity relationship extraction from research articles

Organized to mirror frontend types/entity-extraction.ts for easy cross-reference.
Note: This file has additional types (StudyType, ArticleArchetype, ArticleArchetypeRequest)
"""

from typing import List, Dict, Any, Optional, Literal
from pydantic import BaseModel, Field
from enum import Enum


class EntityType(str, Enum):
    """Types of entities that can be extracted"""
    MEDICAL_CONDITION = "medical_condition"
    BIOLOGICAL_FACTOR = "biological_factor"
    INTERVENTION = "intervention"
    PATIENT_CHARACTERISTIC = "patient_characteristic"
    PSYCHOLOGICAL_FACTOR = "psychological_factor"
    OUTCOME = "outcome"
    GENE = "gene"
    PROTEIN = "protein"
    PATHWAY = "pathway"
    DRUG = "drug"
    ENVIRONMENTAL_FACTOR = "environmental_factor"
    ANIMAL_MODEL = "animal_model"
    EXPOSURE = "exposure"
    PHYSIOLOGICAL_PARAMETER = "physiological_parameter"  # For mechanistic outcomes like heart rate, blood pressure, etc.
    ADMINISTRATION_ROUTE = "administration_route"  # IV, oral, ICV, etc.
    HEALTHY_POPULATION = "healthy_population"  # Explicitly for mechanistic studies
    OTHER = "other"


class RelationshipType(str, Enum):
    """Types of relationships between entities"""
    CAUSAL = "causal"  # A causes B
    THERAPEUTIC = "therapeutic"  # Treatment X improves condition Y
    ASSOCIATIVE = "associative"  # A correlates with B
    TEMPORAL = "temporal"  # A occurs before/after B
    INHIBITORY = "inhibitory"  # A inhibits/blocks B
    REGULATORY = "regulatory"  # A regulates B
    INTERACTIVE = "interactive"  # A and B interact
    PARADOXICAL = "paradoxical"  # Contradictory relationship
    CORRELATIVE = "correlative"  # Statistical correlation
    PREDICTIVE = "predictive"  # Predictive relationship
    DOSE_RESPONSE = "dose_response"  # Dose-dependent relationship
    MECHANISTIC = "mechanistic"  # Explains underlying mechanism


class PatternComplexity(str, Enum):
    """Classification of pattern complexity"""
    SIMPLE = "SIMPLE"
    COMPLEX = "COMPLEX"


class Entity(BaseModel):
    """Represents an entity extracted from the article"""
    id: str = Field(..., description="Unique identifier for the entity")
    name: str = Field(..., description="Name of the entity")
    type: EntityType = Field(..., description="Type classification of the entity")
    role: Optional[str] = Field(None, description="Archetype role (e.g., population, condition, intervention, comparator, exposure, outcome, test, time, factor)")
    description: Optional[str] = Field(None, description="Brief description of the entity")
    mentions: List[str] = Field(default_factory=list, description="Text snippets where entity is mentioned")
    relevance_score: Optional[float] = Field(None, description="Relevance score for focus entities (0-1)")
    connection_to_focus: Optional[str] = Field(None, description="How this entity connects to focus entities")


class Relationship(BaseModel):
    """Represents a relationship between entities"""
    source_entity_id: str = Field(..., description="ID of the source entity")
    target_entity_id: str = Field(..., description="ID of the target entity")
    type: RelationshipType = Field(..., description="Type of relationship")
    description: str = Field(..., description="Description of the relationship")
    evidence: Optional[str] = Field(None, description="Text evidence supporting this relationship")
    strength: Optional[Literal["strong", "moderate", "weak"]] = Field(None, description="Strength of the relationship")
    involves_focus_entity: Optional[bool] = Field(None, description="Whether this relationship involves a focus entity")


class EntityRelationshipAnalysis(BaseModel):
    """Complete entity relationship analysis result"""
    pattern_complexity: PatternComplexity = Field(..., description="Overall pattern complexity")
    entities: List[Entity] = Field(..., description="All entities identified")
    relationships: List[Relationship] = Field(..., description="All relationships identified")
    complexity_justification: Optional[str] = Field(None, description="Explanation of complexity classification")
    clinical_significance: Optional[str] = Field(None, description="Clinical importance of the findings")
    key_findings: List[str] = Field(default_factory=list, description="Key findings from the analysis")
    
    # Computed properties
    entity_count: Optional[int] = Field(None, description="Total number of entities")
    relationship_count: Optional[int] = Field(None, description="Total number of relationships")
    
    def __init__(self, **data):
        super().__init__(**data)
        # Auto-compute counts if not provided
        if self.entity_count is None:
            self.entity_count = len(self.entities)
        if self.relationship_count is None:
            self.relationship_count = len(self.relationships)


class EntityExtractionResponse(BaseModel):
    """Response from entity relationship extraction"""
    article_id: str
    analysis: EntityRelationshipAnalysis
    extraction_metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadata about the extraction")


class StudyType(str, Enum):
    """Valid study types for archetype classification"""
    INTERVENTION = "Intervention"
    OBSERVATIONAL = "Observational"
    DIAGNOSTIC_SCREENING = "Diagnostic/Screening"
    PROGNOSTIC = "Prognostic"
    CROSS_SECTIONAL = "Cross-sectional"
    SYSTEMATIC_REVIEW_META_ANALYSIS = "Systematic Review/Meta-analysis"


class ArticleArchetype(BaseModel):
    """Result of archetype extraction from article"""
    archetype: str = Field(..., description="Natural language archetype sentence capturing study structure")
    study_type: Optional[StudyType] = Field(None, description="High-level study category")
    pattern_id: str = Field(..., description="ID of the specific archetype pattern used (e.g., '1a', '2b')")
    
    class Config:
        use_enum_values = True  # Serialize enums as their values


class ArticleArchetypeRequest(BaseModel):
    """Request for archetype extraction"""
    article_id: str = Field(..., description="Unique article identifier")
    title: str = Field(..., description="Article title")
    abstract: str = Field(..., description="Article abstract")
    full_text: Optional[str] = Field(None, description="Full text if available")


class ArticleArchetypeResponse(BaseModel):
    """Response from archetype extraction"""
    article_id: str = Field(..., description="Article identifier")
    archetype: str = Field(..., description="Extracted archetype sentence")
    study_type: Optional[StudyType] = Field(None, description="Study type classification")
    pattern_id: str = Field(..., description="ID of the specific archetype pattern used")