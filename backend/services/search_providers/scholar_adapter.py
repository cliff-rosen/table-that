"""
Google Scholar Search Provider Adapter

Implements the SearchProvider interface for Google Scholar searches.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime

# Converter no longer needed - GoogleScholarService returns CanonicalResearchArticle directly

from services.search_providers.base import (
    SearchProvider, UnifiedSearchParams, SearchResponse, 
    SearchMetadata, ProviderInfo
)

logger = logging.getLogger(__name__)


class GoogleScholarAdapter(SearchProvider):
    """Google Scholar search provider implementation."""
    
    def __init__(self):
        self._last_availability_check = None
        self._is_available_cache = None
        self._cache_duration = 300  # 5 minutes
    
    @property
    def provider_id(self) -> str:
        return "scholar"
    
    @property
    def provider_info(self) -> ProviderInfo:
        return ProviderInfo(
            id="scholar",
            name="Google Scholar",
            description="Google's academic search engine covering scholarly literature",
            supported_features=[
                "snippet_search",
                "year_filtering",
                "citation_counts",
                "pdf_links",
                "related_articles",
                "version_tracking",
                "relevance_sorting",
                "date_sorting"
            ],
            rate_limits={
                "note": "Google Scholar has anti-scraping measures. Use responsibly."
            }
        )
    
    async def search(self, params: UnifiedSearchParams) -> SearchResponse:
        """
        Perform a Google Scholar search.
        
        Args:
            params: Unified search parameters
            
        Returns:
            SearchResponse with articles and metadata
        """
        start_time = datetime.utcnow()
        
        try:
            # Validate parameters
            params = await self.validate_params(params)
            
            # Import here to avoid circular dependencies
            from services.google_scholar_service import GoogleScholarService
            
            # Get the service instance
            service = GoogleScholarService()
            
            # Calculate start index for Scholar pagination
            start_index = params.offset or 0
            
            # Perform the search using the service directly
            articles, search_metadata = service.search_articles(
                query=params.query,
                num_results=params.num_results,
                year_low=params.year_low,
                year_high=params.year_high,
                sort_by=params.sort_by,
                start_index=start_index
            )
            
            # articles are already CanonicalResearchArticle objects
            canonical_articles = articles
            
            # Update relevance scores for each article
            for i, canonical in enumerate(canonical_articles):
                absolute_position = start_index + i + 1
                canonical.relevance_score = self._estimate_relevance_score(
                    absolute_position, 
                    len(articles) * 10  # Estimate total results
                )
            
            # Calculate search time
            search_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Calculate pagination metadata
            current_page = params.page or 1
            page_size = params.num_results
            # Scholar doesn't provide exact total, estimate based on returned results
            estimated_total = search_metadata.get("total_results", len(canonical_articles) * 10)
            total_pages = (estimated_total + page_size - 1) // page_size if estimated_total > 0 else 1
            
            # Debug pagination calculation
            logger.debug(f"Scholar pagination: page={current_page}, page_size={page_size}, offset={start_index}")
            logger.debug(f"Returned {len(canonical_articles)} articles, estimated_total={estimated_total}")
            if canonical_articles:
                logger.debug(f"First article ID: {canonical_articles[0].id}, title: {canonical_articles[0].title[:50]}...")
            
            # Build metadata
            metadata = SearchMetadata(
                total_results=estimated_total,  # Scholar estimate
                returned_results=len(canonical_articles),
                search_time=search_time,
                provider=self.provider_id,
                query_translation=params.query,
                provider_metadata={
                    "sort_by": params.sort_by,
                    "year_range": f"{params.year_low or 'any'}-{params.year_high or 'any'}",
                    "start_index": start_index
                },
                # Pagination metadata
                current_page=current_page,
                page_size=page_size,
                total_pages=total_pages,
                has_next_page=len(canonical_articles) == page_size,  # Assume more if we got full page
                has_prev_page=current_page > 1
            )
            
            return SearchResponse(
                articles=canonical_articles,
                metadata=metadata,
                success=True
            )
            
        except Exception as e:
            logger.error(f"Google Scholar search failed: {e}", exc_info=True)
            
            search_time = (datetime.utcnow() - start_time).total_seconds()
            
            return SearchResponse(
                articles=[],
                metadata=SearchMetadata(
                    total_results=0,
                    returned_results=0,
                    search_time=search_time,
                    provider=self.provider_id
                ),
                success=False,
                error=str(e)
            )
    
    async def is_available(self) -> bool:
        """
        Check if Google Scholar is available.
        
        Note: This is a basic check. Scholar may still block requests
        due to rate limiting or anti-scraping measures.
        
        Returns:
            True if Scholar appears accessible, False otherwise
        """
        # Use cached result if recent
        if self._last_availability_check:
            time_since_check = (datetime.utcnow() - self._last_availability_check).total_seconds()
            if time_since_check < self._cache_duration and self._is_available_cache is not None:
                return self._is_available_cache
        
        try:
            # For now, we'll assume Scholar is available
            # In production, you might want to do a test query
            is_available = True
            
            # Cache the result
            self._is_available_cache = is_available
            self._last_availability_check = datetime.utcnow()
            
            return is_available
            
        except Exception as e:
            logger.warning(f"Scholar availability check failed: {e}")
            self._is_available_cache = False
            self._last_availability_check = datetime.utcnow()
            return False
    
    async def validate_params(self, params: UnifiedSearchParams) -> UnifiedSearchParams:
        """
        Validate and adjust parameters for Google Scholar.
        
        Args:
            params: Parameters to validate
            
        Returns:
            Validated parameters
        """
        # Scholar has a hard limit of 20 results per request
        # This is a SerpAPI/Google Scholar constraint
        if params.num_results > 20:
            logger.warning(f"Google Scholar limited to 20 results per page, requested {params.num_results}")
            params.num_results = 20
        
        # Scholar doesn't support completion date filtering
        if params.date_type == "completion":
            logger.warning("Google Scholar doesn't support completion date filtering, using publication date")
            params.date_type = "publication"
        
        return params
    
    def _build_scholar_params(self, params: UnifiedSearchParams) -> Dict[str, Any]:
        """
        Convert unified parameters to Scholar-specific format.
        
        Args:
            params: Unified search parameters
            
        Returns:
            Dictionary of Scholar-specific parameters
        """
        scholar_params = {
            "query": params.query,
            "num_results": params.num_results
        }
        
        # Add year filtering if specified
        if params.year_low:
            scholar_params["year_low"] = params.year_low
        if params.year_high:
            scholar_params["year_high"] = params.year_high
        
        # Map sort order
        if params.sort_by == "date":
            scholar_params["sort_by"] = "date"
        else:
            scholar_params["sort_by"] = "relevance"
        
        return scholar_params