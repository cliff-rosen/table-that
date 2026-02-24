"""
Search Providers Module

This module provides a unified interface for searching across multiple
academic databases and search engines.
"""

from services.search_providers.base import (
    SearchProvider,
    UnifiedSearchParams,
    SearchResponse,
    SearchMetadata,
    ProviderInfo
)

from services.search_providers.registry import (
    get_provider,
    list_providers,
    get_available_providers,
    register_provider
)

from services.search_providers.pubmed_adapter import PubMedAdapter
from services.search_providers.scholar_adapter import GoogleScholarAdapter

__all__ = [
    # Base classes and types
    "SearchProvider",
    "UnifiedSearchParams",
    "SearchResponse",
    "SearchMetadata",
    "ProviderInfo",
    
    # Registry functions
    "get_provider",
    "list_providers",
    "get_available_providers",
    "register_provider",
    
    # Provider implementations
    "PubMedAdapter",
    "GoogleScholarAdapter"
]