"""
Search Provider Base Classes and Interfaces

This module defines the base classes and interfaces for implementing
search providers in a unified way.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional, Literal
from pydantic import BaseModel, Field
from datetime import datetime

from schemas.canonical_types import CanonicalResearchArticle


class UnifiedSearchParams(BaseModel):
    """Unified search parameters that work across all providers."""
    query: str = Field(..., description="Search query string")
    num_results: int = Field(default=20, ge=1, le=200, description="Number of results to return")
    sort_by: Literal["relevance", "date"] = Field(default="relevance", description="Sort order")
    
    # Date filtering - dual support for precision levels
    year_low: Optional[int] = Field(default=None, description="Minimum publication year (Scholar compatibility)")
    year_high: Optional[int] = Field(default=None, description="Maximum publication year (Scholar compatibility)")
    date_from: Optional[str] = Field(default=None, description="Start date in YYYY-MM-DD format (PubMed full precision)")
    date_to: Optional[str] = Field(default=None, description="End date in YYYY-MM-DD format (PubMed full precision)")
    
    # Pagination parameters
    page: Optional[int] = Field(default=1, ge=1, description="Page number (1-based)")
    offset: Optional[int] = Field(default=None, ge=0, description="Number of results to skip")
    
    # Provider-specific parameters (ignored by providers that don't support them)
    date_type: Optional[Literal["completion", "publication", "entry", "revised"]] = Field(
        default=None, 
        description="Date type for filtering (PubMed-specific)"
    )
    include_citations: bool = Field(default=True, description="Include citation information")
    include_pdf_links: bool = Field(default=True, description="Include PDF links where available")


class SearchMetadata(BaseModel):
    """Metadata about a search operation."""
    total_results: Optional[int] = Field(default=None, description="Total number of results available")
    returned_results: int = Field(..., description="Number of results actually returned")
    search_time: float = Field(..., description="Time taken to perform search (seconds)")
    provider: str = Field(..., description="Provider that performed the search")
    query_translation: Optional[str] = Field(default=None, description="How the query was interpreted")
    provider_metadata: Dict[str, Any] = Field(default_factory=dict, description="Provider-specific metadata")
    
    # Pagination metadata
    current_page: Optional[int] = Field(default=None, description="Current page number")
    page_size: Optional[int] = Field(default=None, description="Number of results per page")
    total_pages: Optional[int] = Field(default=None, description="Total number of pages")
    has_next_page: Optional[bool] = Field(default=None, description="Whether there are more pages")
    has_prev_page: Optional[bool] = Field(default=None, description="Whether there are previous pages")


class SearchResponse(BaseModel):
    """Unified search response structure."""
    articles: List[CanonicalResearchArticle] = Field(..., description="List of articles found")
    metadata: SearchMetadata = Field(..., description="Search operation metadata")
    success: bool = Field(default=True, description="Whether the search was successful")
    error: Optional[str] = Field(default=None, description="Error message if search failed")


class ProviderInfo(BaseModel):
    """Information about a search provider."""
    id: str = Field(..., description="Unique provider identifier")
    name: str = Field(..., description="Human-readable provider name")
    description: str = Field(..., description="Brief description of the provider")
    supported_features: List[str] = Field(..., description="List of supported features")
    rate_limits: Optional[Dict[str, Any]] = Field(default=None, description="Rate limiting information")


class SearchProvider(ABC):
    """
    Abstract base class for search providers.
    
    All search providers must implement this interface to ensure
    compatibility with the unified search system.
    """
    
    @property
    @abstractmethod
    def provider_id(self) -> str:
        """Unique identifier for this provider (e.g., 'pubmed', 'scholar')."""
        pass
    
    @property
    @abstractmethod
    def provider_info(self) -> ProviderInfo:
        """Get information about this provider."""
        pass
    
    @abstractmethod
    async def search(self, params: UnifiedSearchParams) -> SearchResponse:
        """
        Perform a search using the unified parameters.
        
        Args:
            params: Unified search parameters
            
        Returns:
            SearchResponse with articles and metadata
            
        Raises:
            Exception: If search fails
        """
        pass
    
    @abstractmethod
    async def is_available(self) -> bool:
        """
        Check if the provider is currently available.
        
        Returns:
            True if provider is accessible, False otherwise
        """
        pass
    
    async def validate_params(self, params: UnifiedSearchParams) -> UnifiedSearchParams:
        """
        Validate and adjust parameters for this provider.
        
        Override this method to implement provider-specific validation.
        
        Args:
            params: Parameters to validate
            
        Returns:
            Validated/adjusted parameters
            
        Raises:
            ValueError: If parameters are invalid for this provider
        """
        return params
    
    def _generate_article_id(self, article_data: Dict[str, Any], position: int) -> str:
        """
        Generate a unique article ID.
        
        Args:
            article_data: Raw article data from provider
            position: Position in search results
            
        Returns:
            Unique article identifier
        """
        # Default implementation
        return f"{self.provider_id}_{position}"
    
    def _estimate_relevance_score(self, position: int, total_results: int) -> float:
        """
        Estimate relevance score based on position.
        
        Args:
            position: Position in search results (1-based)
            total_results: Total number of results
            
        Returns:
            Relevance score between 0 and 10
        """
        if total_results <= 0:
            return 5.0
        
        # Simple linear decay based on position
        score = 10.0 * (1.0 - (position - 1) / min(total_results, 100))
        return max(0.0, min(10.0, score))