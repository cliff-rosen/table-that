"""
Schemas for canonical study representation combining archetype and entity-relationship graph.

Organized to mirror frontend types/canonical-study.ts for easy cross-reference.
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

from schemas.entity_extraction import EntityRelationshipAnalysis


class CanonicalStudyRepresentation(BaseModel):
    """Complete canonical representation of a study including archetype and ER graph."""
    # Archetype information
    archetype_text: str = Field(..., description="Natural language archetype sentence")
    study_type: Optional[str] = Field(None, description="Study type classification")
    pattern_id: Optional[str] = Field(None, description="Pattern ID used (e.g., '1a', '2b')")
    
    # Entity-relationship graph
    entity_analysis: Optional[EntityRelationshipAnalysis] = Field(None, description="Entity-relationship graph analysis")
    
    # Metadata
    last_updated: datetime = Field(default_factory=datetime.utcnow, description="Last update timestamp")
    version: str = Field(default="2.0", description="Schema version")


class CanonicalStudyRequest(BaseModel):
    """Request to save canonical study representation - supports partial updates."""
    archetype_text: Optional[str] = Field(None, description="Natural language archetype sentence (if provided, updates archetype)")
    study_type: Optional[str] = Field(None, description="Study type classification") 
    pattern_id: Optional[str] = Field(None, description="Pattern ID used")
    entity_analysis: Optional[Dict[str, Any]] = Field(None, description="Entity-relationship analysis data (if provided, updates entity analysis)")
    update_entity_analysis: Optional[bool] = Field(None, description="If True, updates entity_analysis even if None (to clear it)")


class CanonicalStudyResponse(BaseModel):
    """Response containing canonical study representation."""
    archetype_text: Optional[str] = Field(None, description="Natural language archetype sentence")
    study_type: Optional[str] = Field(None, description="Study type classification")
    pattern_id: Optional[str] = Field(None, description="Pattern ID used") 
    entity_analysis: Optional[Dict[str, Any]] = Field(None, description="Entity-relationship analysis data")
    last_updated: Optional[str] = Field(None, description="Last update timestamp")
    version: Optional[str] = Field(None, description="Schema version")