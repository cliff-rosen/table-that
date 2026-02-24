"""
Schemas for Document Analysis Tool - hierarchical summarization,
entity extraction, and claim/argument extraction.

Organized to mirror frontend types/document_analysis.ts for easy cross-reference.
Note: This file has additional LLM Response Schemas section.
"""

from typing import List, Dict, Any, Optional, Literal
from datetime import datetime
from pydantic import BaseModel, Field
from enum import Enum


class EntityCategory(str, Enum):
    """Categories of entities to extract"""
    PERSON = "person"
    ORGANIZATION = "organization"
    CONCEPT = "concept"
    LOCATION = "location"
    DATE = "date"
    TECHNICAL_TERM = "technical_term"
    OTHER = "other"


class ClaimType(str, Enum):
    """Types of claims/arguments"""
    FACTUAL = "factual"
    CAUSAL = "causal"
    EVALUATIVE = "evaluative"
    RECOMMENDATION = "recommendation"
    PREDICTION = "prediction"


# ============================================================================
# Hierarchical Summary Models
# ============================================================================

class KeyPoint(BaseModel):
    """Individual key point within a section"""
    id: str = Field(..., description="Unique identifier")
    text: str = Field(..., description="Key point text")
    source_span: Optional[str] = Field(None, description="Relevant source text span")
    importance: float = Field(0.5, ge=0, le=1, description="Importance score 0-1")


class SectionSummary(BaseModel):
    """Section-level summary"""
    id: str = Field(..., description="Unique identifier")
    title: str = Field(..., description="Section title/topic")
    summary: str = Field(..., description="Section summary text")
    key_points: List[KeyPoint] = Field(default_factory=list)
    source_spans: List[str] = Field(default_factory=list, description="Source text spans")


class ExecutiveSummary(BaseModel):
    """Top-level executive summary"""
    summary: str = Field(..., description="Executive summary (2-3 paragraphs)")
    main_themes: List[str] = Field(default_factory=list, description="Main themes identified")
    key_conclusions: List[str] = Field(default_factory=list, description="Key conclusions")


class HierarchicalSummary(BaseModel):
    """Complete hierarchical summary structure"""
    executive: ExecutiveSummary
    sections: List[SectionSummary] = Field(default_factory=list)
    total_key_points: int = Field(0, description="Total key points across sections")


# ============================================================================
# Entity Extraction Models
# ============================================================================

class ExtractedEntity(BaseModel):
    """Entity extracted from document"""
    id: str = Field(..., description="Unique identifier")
    name: str = Field(..., description="Entity name")
    category: EntityCategory = Field(..., description="Entity category")
    description: Optional[str] = Field(None, description="Brief description")
    mentions: List[str] = Field(default_factory=list, description="Context mentions from source")
    mention_count: int = Field(1, description="Number of mentions in document")
    importance: float = Field(0.5, ge=0, le=1, description="Importance score 0-1")
    related_entities: List[str] = Field(default_factory=list, description="Related entity IDs")


# ============================================================================
# Claim/Argument Extraction Models
# ============================================================================

class Evidence(BaseModel):
    """Evidence supporting a claim"""
    text: str = Field(..., description="Evidence text")
    source_span: Optional[str] = Field(None, description="Source location in document")
    strength: Literal["strong", "moderate", "weak"] = Field("moderate")


class ExtractedClaim(BaseModel):
    """Claim or argument extracted from document"""
    id: str = Field(..., description="Unique identifier")
    claim: str = Field(..., description="The claim statement")
    claim_type: ClaimType = Field(..., description="Type of claim")
    confidence: float = Field(0.5, ge=0, le=1, description="Confidence score 0-1")
    evidence: List[Evidence] = Field(default_factory=list)
    supporting_entities: List[str] = Field(default_factory=list, description="Related entity IDs")
    counter_arguments: List[str] = Field(default_factory=list, description="Potential counter-arguments")


# ============================================================================
# Graph Data Models (for React Flow visualization)
# ============================================================================

class GraphNode(BaseModel):
    """Node for React Flow graph visualization"""
    id: str = Field(..., description="Unique node identifier")
    type: str = Field(..., description="Node type: document, executive, section, keypoint, entity, claim")
    data: Dict[str, Any] = Field(..., description="Node data including label and details")
    position: Dict[str, float] = Field(..., description="x, y coordinates")


class GraphEdge(BaseModel):
    """Edge for React Flow graph visualization"""
    id: str = Field(..., description="Unique edge identifier")
    source: str = Field(..., description="Source node ID")
    target: str = Field(..., description="Target node ID")
    label: Optional[str] = Field(None, description="Edge label")
    type: Optional[str] = Field("default", description="Edge type for styling")


# ============================================================================
# Request/Response Models
# ============================================================================

class AnalysisOptions(BaseModel):
    """Options for which analyses to perform"""
    hierarchical_summary: bool = Field(True, description="Extract hierarchical summary")
    entity_extraction: bool = Field(True, description="Extract entities")
    claim_extraction: bool = Field(True, description="Extract claims/arguments")


class DocumentAnalysisRequest(BaseModel):
    """Request for document analysis"""
    document_text: str = Field(..., min_length=50, description="Document text to analyze")
    document_title: Optional[str] = Field(None, description="Optional document title")
    analysis_options: Optional[AnalysisOptions] = Field(
        default_factory=AnalysisOptions,
        description="Which analyses to perform"
    )


class DocumentAnalysisResult(BaseModel):
    """Complete document analysis result"""
    document_id: str = Field(..., description="Unique document identifier")
    title: Optional[str] = Field(None, description="Document title if detected")

    # Analysis results
    hierarchical_summary: HierarchicalSummary
    entities: List[ExtractedEntity] = Field(default_factory=list)
    claims: List[ExtractedClaim] = Field(default_factory=list)

    # Graph data for React Flow
    graph_nodes: List[GraphNode] = Field(default_factory=list)
    graph_edges: List[GraphEdge] = Field(default_factory=list)

    # Metadata
    analysis_metadata: Dict[str, Any] = Field(default_factory=dict)


# ============================================================================
# LLM Response Schemas (for structured output)
# ============================================================================

class HierarchicalSummaryLLMResponse(BaseModel):
    """Schema for LLM hierarchical summary extraction"""
    executive_summary: str = Field(..., description="2-3 paragraph executive summary")
    main_themes: List[str] = Field(..., description="3-5 main themes")
    key_conclusions: List[str] = Field(..., description="3-5 key conclusions")
    sections: List[Dict[str, Any]] = Field(..., description="Section summaries with key points")


class EntityExtractionLLMResponse(BaseModel):
    """Schema for LLM entity extraction"""
    entities: List[Dict[str, Any]] = Field(..., description="Extracted entities with metadata")


class ClaimExtractionLLMResponse(BaseModel):
    """Schema for LLM claim extraction"""
    claims: List[Dict[str, Any]] = Field(..., description="Extracted claims with evidence")


# ============================================================================
# Streaming Models
# ============================================================================

class AnalysisStreamMessage(BaseModel):
    """Streaming status message for document analysis"""
    type: Literal["status", "progress", "summary", "entities", "claims", "result", "error"] = Field(
        ..., description="Message type"
    )
    message: str = Field(..., description="Human-readable message")
    data: Optional[Dict[str, Any]] = Field(default=None, description="Additional data payload")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ============================================================================
# Article Stance Analysis Models
# ============================================================================

class ArticleInfo(BaseModel):
    """Article information for stance analysis"""
    title: str = Field(..., description="Article title")
    abstract: Optional[str] = Field(None, description="Article abstract")
    authors: Optional[List[str]] = Field(default_factory=list, description="Article authors")
    journal: Optional[str] = Field(None, description="Journal name")
    pub_year: Optional[int] = Field(None, description="Publication year")
    pub_month: Optional[int] = Field(None, description="Publication month (1-12)")
    pub_day: Optional[int] = Field(None, description="Publication day (1-31)")
    pmid: Optional[str] = Field(None, description="PubMed ID")
    doi: Optional[str] = Field(None, description="DOI")


class StanceAnalysisRequest(BaseModel):
    """Request for article stance analysis"""
    article: ArticleInfo = Field(..., description="Article to analyze")
    stream_id: int = Field(..., description="Research stream ID for context and instructions")


class StanceAnalysisResult(BaseModel):
    """Result of article stance analysis"""
    stance: Literal["pro-defense", "pro-plaintiff", "neutral", "mixed", "unclear"] = Field(
        ..., description="Overall stance classification"
    )
    confidence: float = Field(..., ge=0, le=1, description="Confidence in the classification (0-1)")
    analysis: str = Field(..., description="Detailed analysis explanation")
    key_factors: List[str] = Field(default_factory=list, description="Key factors influencing the stance")
    relevant_quotes: List[str] = Field(default_factory=list, description="Relevant quotes from the abstract")
