"""
Unified Search Router

Provides a single endpoint for searching across multiple academic databases
using the unified search provider system.
"""

from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Optional, Literal
import logging

from models import User

from services.search_providers import (
    UnifiedSearchParams, 
    SearchResponse,
    get_provider,
    list_providers,
    get_available_providers
)
from services.auth_service import validate_token

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/unified-search",
    tags=["unified-search"]
)


@router.get("/providers", response_model=List[str])
async def get_search_providers(
    current_user: User = Depends(validate_token)
):
    """
    Get list of all registered search providers.
    
    Returns:
        List of provider IDs (e.g., ['pubmed', 'scholar'])
    """
    return list_providers()


@router.get("/providers/available", response_model=List[str])
async def get_available_search_providers(
    current_user: User = Depends(validate_token)
):
    """
    Get list of currently available search providers.
    
    This checks each provider's availability status.
    
    Returns:
        List of available provider IDs
    """
    try:
        return await get_available_providers()
    except Exception as e:
        logger.error(f"Error checking provider availability: {e}")
        raise HTTPException(status_code=500, detail="Failed to check provider availability")


@router.get("/search", response_model=SearchResponse)
async def unified_search(
    provider: Literal["pubmed", "scholar"] = Query(..., description="Search provider to use"),
    query: str = Query(..., description="Search query"),
    num_results: int = Query(20, ge=1, le=200, description="Number of results per page"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=200, description="Results per page (overrides num_results)"),
    offset: Optional[int] = Query(None, ge=0, description="Number of results to skip"),
    sort_by: Literal["relevance", "date"] = Query("relevance", description="Sort order"),
    year_low: Optional[int] = Query(None, description="Minimum publication year (Scholar compatibility)"),
    year_high: Optional[int] = Query(None, description="Maximum publication year (Scholar compatibility)"),
    date_from: Optional[str] = Query(None, description="Start date in YYYY-MM-DD format (PubMed full precision)"),
    date_to: Optional[str] = Query(None, description="End date in YYYY-MM-DD format (PubMed full precision)"),
    date_type: Optional[Literal["completion", "publication", "entry", "revised"]] = Query(None, description="Date type for filtering (PubMed-specific)"),
    include_citations: bool = Query(True, description="Include citation information"),
    include_pdf_links: bool = Query(True, description="Include PDF links where available"),
    current_user: User = Depends(validate_token)
):
    """
    Perform a unified search across academic databases.
    
    This endpoint provides a consistent interface for searching different
    academic databases. The response format is the same regardless of
    the provider used.
    
    Args:
        provider: Which search provider to use ('pubmed' or 'scholar')
        query: Search query string
        num_results: Number of results to return (max varies by provider)
        sort_by: Sort results by relevance or date
        year_low: Filter by minimum publication year
        year_high: Filter by maximum publication year
        
    Returns:
        SearchResponse with unified article format and metadata
    """
    # Get the provider
    search_provider = get_provider(provider)
    if not search_provider:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    
    # Check if provider is available
    try:
        if not await search_provider.is_available():
            raise HTTPException(
                status_code=503, 
                detail=f"Provider '{provider}' is currently unavailable"
            )
    except Exception as e:
        logger.error(f"Error checking {provider} availability: {e}")
        raise HTTPException(
            status_code=503, 
            detail=f"Could not verify provider availability: {str(e)}"
        )
    
    # Calculate pagination parameters
    actual_page_size = page_size or num_results
    actual_offset = offset if offset is not None else (page - 1) * actual_page_size
    
    # Build search parameters
    search_params = UnifiedSearchParams(
        query=query,
        num_results=actual_page_size,
        sort_by=sort_by,
        year_low=year_low,
        year_high=year_high,
        date_from=date_from,
        date_to=date_to,
        date_type=date_type,
        include_citations=include_citations,
        include_pdf_links=include_pdf_links,
        offset=actual_offset,
        page=page
    )
    
    # Perform the search
    try:
        logger.info(f"Performing {provider} search: query='{query}', num_results={num_results}")
        response = await search_provider.search(search_params)
        
        if not response.success:
            logger.error(f"Search failed: {response.error}")
            raise HTTPException(
                status_code=500,
                detail=f"Search failed: {response.error or 'Unknown error'}"
            )
        
        logger.info(f"Search completed: {response.metadata.returned_results} results")
        return response
        
    except HTTPException:
        raise  # Re-raise HTTP exceptions
    except Exception as e:
        logger.error(f"Unexpected error during {provider} search: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Search failed: {str(e)}"
        )


@router.post("/search/batch", response_model=List[SearchResponse])
async def batch_unified_search(
    providers: List[Literal["pubmed", "scholar"]] = Query(..., description="Search providers to use"),
    query: str = Query(..., description="Search query"),
    num_results: int = Query(20, ge=1, le=100, description="Number of results per provider"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="Results per page per provider"),
    sort_by: Literal["relevance", "date"] = Query("relevance", description="Sort order"),
    year_low: Optional[int] = Query(None, description="Minimum publication year (Scholar compatibility)"),
    year_high: Optional[int] = Query(None, description="Maximum publication year (Scholar compatibility)"),
    date_from: Optional[str] = Query(None, description="Start date in YYYY-MM-DD format (PubMed full precision)"),
    date_to: Optional[str] = Query(None, description="End date in YYYY-MM-DD format (PubMed full precision)"),
    date_type: Optional[Literal["completion", "publication", "entry", "revised"]] = Query(None, description="Date type for filtering (PubMed-specific)"),
    include_citations: bool = Query(True, description="Include citation information"),
    include_pdf_links: bool = Query(True, description="Include PDF links where available"),
    current_user: User = Depends(validate_token)
):
    """
    Perform searches across multiple providers simultaneously.
    
    This endpoint allows searching multiple providers with the same query
    and returns results from all providers.
    
    Args:
        providers: List of providers to search
        query: Search query string
        num_results: Number of results per provider
        sort_by: Sort results by relevance or date
        year_low: Filter by minimum publication year
        year_high: Filter by maximum publication year
        
    Returns:
        List of SearchResponse objects, one per provider
    """
    # Calculate pagination parameters
    actual_page_size = page_size or num_results
    actual_offset = (page - 1) * actual_page_size
    
    # Build search parameters
    search_params = UnifiedSearchParams(
        query=query,
        num_results=actual_page_size,
        sort_by=sort_by,
        year_low=year_low,
        year_high=year_high,
        date_from=date_from,
        date_to=date_to,
        date_type=date_type,
        include_citations=include_citations,
        include_pdf_links=include_pdf_links,
        offset=actual_offset,
        page=page
    )
    
    results = []
    
    for provider_id in providers:
        # Get the provider
        search_provider = get_provider(provider_id)
        if not search_provider:
            logger.warning(f"Skipping unknown provider: {provider_id}")
            continue
        
        try:
            # Check availability
            if not await search_provider.is_available():
                logger.warning(f"Provider {provider_id} is unavailable")
                # Add error response for this provider
                results.append(SearchResponse(
                    articles=[],
                    metadata={
                        "total_results": 0,
                        "returned_results": 0,
                        "search_time": 0.0,
                        "provider": provider_id
                    },
                    success=False,
                    error=f"Provider {provider_id} is currently unavailable"
                ))
                continue
            
            # Perform search
            response = await search_provider.search(search_params)
            results.append(response)
            
        except Exception as e:
            logger.error(f"Error searching {provider_id}: {e}")
            # Add error response for this provider
            results.append(SearchResponse(
                articles=[],
                metadata={
                    "total_results": 0,
                    "returned_results": 0,
                    "search_time": 0.0,
                    "provider": provider_id
                },
                success=False,
                error=str(e)
            ))
    
    return results