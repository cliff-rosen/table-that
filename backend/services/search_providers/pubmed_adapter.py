"""
PubMed Search Provider Adapter

Implements the SearchProvider interface for PubMed searches.
"""

import logging
from typing import List, Dict, Any, Optional
from datetime import datetime
import httpx

from services.search_providers.base import (
    SearchProvider, UnifiedSearchParams, SearchResponse, 
    SearchMetadata, ProviderInfo
)

logger = logging.getLogger(__name__)


class PubMedAdapter(SearchProvider):
    """PubMed search provider implementation."""
    
    def __init__(self):
        self._base_url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/"
        self._last_availability_check = None
        self._is_available_cache = None
        self._cache_duration = 300  # 5 minutes
    
    @property
    def provider_id(self) -> str:
        return "pubmed"
    
    @property
    def provider_info(self) -> ProviderInfo:
        return ProviderInfo(
            id="pubmed",
            name="PubMed",
            description="National Library of Medicine's database of biomedical literature",
            supported_features=[
                "abstract_search",
                "date_filtering",
                "mesh_terms",
                "full_abstracts",
                "doi_lookup",
                "completion_date_filter",
                "publication_date_filter"
            ],
            rate_limits={
                "requests_per_second": 3,
                "note": "NCBI recommends no more than 3 requests per second"
            }
        )
    
    async def search(self, params: UnifiedSearchParams) -> SearchResponse:
        """
        Perform a PubMed search.
        
        Args:
            params: Unified search parameters
            
        Returns:
            SearchResponse with articles and metadata
        """
        start_time = datetime.utcnow()
        
        try:
            # Validate parameters
            params = await self.validate_params(params)
            
            # Calculate offset for pagination
            offset = params.offset or ((params.page - 1) * params.num_results if params.page else 0)
            
            # Convert date parameters
            start_date = None
            end_date = None
            if params.date_from or params.date_to:
                # Convert YYYY-MM-DD to YYYY/MM/DD for PubMed API
                if params.date_from:
                    start_date = params.date_from.replace('-', '/')
                if params.date_to:
                    end_date = params.date_to.replace('-', '/')
            elif params.year_low or params.year_high:
                # Convert years to full dates
                start_date = f"{params.year_low or 1900}/01/01"
                end_date = f"{params.year_high or datetime.now().year}/12/31"
            
            # Call the unified PubMed service
            from services.pubmed_service import search_articles
            articles, service_metadata = await search_articles(
                query=params.query,
                max_results=params.num_results,
                offset=offset,
                sort_by=params.sort_by,
                start_date=start_date,
                end_date=end_date,
                date_type=params.date_type
            )
            
            # Add search position and relevance scores
            for i, article in enumerate(articles):
                article.search_position = offset + i + 1
                article.relevance_score = self._estimate_relevance_score(i + 1, len(articles))
            
            # Calculate search time
            search_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Calculate pagination metadata
            total_results = service_metadata["total_results"]
            page_size = params.num_results
            current_page = params.page or ((offset // page_size) + 1)
            total_pages = (total_results + page_size - 1) // page_size if total_results > 0 else 0
            
            # Build metadata
            metadata = SearchMetadata(
                total_results=total_results,
                returned_results=len(articles),
                search_time=search_time,
                provider=self.provider_id,
                query_translation=params.query,
                provider_metadata={
                    "date_type": params.date_type,
                    "database": "pubmed"
                },
                current_page=current_page,
                page_size=page_size,
                total_pages=total_pages,
                has_next_page=current_page < total_pages,
                has_prev_page=current_page > 1
            )
            
            return SearchResponse(
                articles=articles,
                metadata=metadata,
                success=True
            )
            
        except Exception as e:
            logger.error(f"PubMed search failed: {e}", exc_info=True)
            
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
        Check if PubMed API is available.

        Returns:
            True if PubMed is accessible, False otherwise
        """
        # Use cached result if recent
        if self._last_availability_check:
            time_since_check = (datetime.utcnow() - self._last_availability_check).total_seconds()
            if time_since_check < self._cache_duration and self._is_available_cache is not None:
                return self._is_available_cache

        try:
            # Simple health check - search for a known PMID
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(
                    f"{self._base_url}esummary.fcgi",
                    params={"db": "pubmed", "id": "1"}
                )

            is_available = response.status_code == 200

            # Cache the result
            self._is_available_cache = is_available
            self._last_availability_check = datetime.utcnow()

            return is_available

        except Exception as e:
            logger.warning(f"PubMed availability check failed: {e}")
            self._is_available_cache = False
            self._last_availability_check = datetime.utcnow()
            return False
    
    async def validate_params(self, params: UnifiedSearchParams) -> UnifiedSearchParams:
        """
        Validate and adjust parameters for PubMed.
        
        Args:
            params: Parameters to validate
            
        Returns:
            Validated parameters
        """
        # PubMed has a maximum of 10,000 results per query
        if params.num_results > 10000:
            logger.warning(f"Reducing num_results from {params.num_results} to 10000 (PubMed limit)")
            params.num_results = 10000
        
        # Default date type if using date filtering
        if (params.year_low or params.year_high or params.date_from or params.date_to) and not params.date_type:
            params.date_type = "publication"
        
        return params
    
