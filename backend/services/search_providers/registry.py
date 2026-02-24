"""
Search Provider Registry

Manages registration and retrieval of search providers.
"""

import logging
from typing import Dict, List, Optional, Type
from threading import Lock

from services.search_providers.base import SearchProvider
from services.search_providers.pubmed_adapter import PubMedAdapter
from services.search_providers.scholar_adapter import GoogleScholarAdapter

logger = logging.getLogger(__name__)


class SearchProviderRegistry:
    """
    Registry for managing search providers.
    
    This class provides a centralized way to register, retrieve, and
    manage search providers.
    """
    
    def __init__(self):
        self._providers: Dict[str, SearchProvider] = {}
        self._provider_classes: Dict[str, Type[SearchProvider]] = {}
        self._lock = Lock()
        
        # Register default providers
        self._register_defaults()
    
    def _register_defaults(self):
        """Register the default search providers."""
        self.register_provider_class("pubmed", PubMedAdapter)
        self.register_provider_class("scholar", GoogleScholarAdapter)
    
    def register_provider_class(self, provider_id: str, provider_class: Type[SearchProvider]):
        """
        Register a provider class.
        
        Args:
            provider_id: Unique identifier for the provider
            provider_class: The provider class (not instance)
        """
        with self._lock:
            self._provider_classes[provider_id] = provider_class
            logger.info(f"Registered provider class: {provider_id}")
    
    def get_provider(self, provider_id: str) -> Optional[SearchProvider]:
        """
        Get a provider instance by ID.
        
        Provider instances are created lazily and cached.
        
        Args:
            provider_id: The provider identifier
            
        Returns:
            Provider instance or None if not found
        """
        with self._lock:
            # Return cached instance if available
            if provider_id in self._providers:
                return self._providers[provider_id]
            
            # Create new instance if class is registered
            if provider_id in self._provider_classes:
                try:
                    provider = self._provider_classes[provider_id]()
                    self._providers[provider_id] = provider
                    logger.info(f"Created provider instance: {provider_id}")
                    return provider
                except Exception as e:
                    logger.error(f"Failed to create provider {provider_id}: {e}")
                    return None
            
            logger.warning(f"Provider not found: {provider_id}")
            return None
    
    def list_providers(self) -> List[str]:
        """
        Get list of all registered provider IDs.
        
        Returns:
            List of provider identifiers
        """
        with self._lock:
            return list(self._provider_classes.keys())
    
    async def get_available_providers(self) -> List[str]:
        """
        Get list of currently available providers.
        
        This checks each provider's availability.
        
        Returns:
            List of available provider identifiers
        """
        available = []
        
        for provider_id in self.list_providers():
            provider = self.get_provider(provider_id)
            if provider:
                try:
                    if await provider.is_available():
                        available.append(provider_id)
                except Exception as e:
                    logger.warning(f"Error checking availability for {provider_id}: {e}")
        
        return available
    
    def clear_cache(self):
        """Clear all cached provider instances."""
        with self._lock:
            self._providers.clear()
            logger.info("Cleared provider cache")


# Global registry instance
_registry = SearchProviderRegistry()


# Convenience functions
def get_provider(provider_id: str) -> Optional[SearchProvider]:
    """Get a search provider by ID."""
    return _registry.get_provider(provider_id)


def list_providers() -> List[str]:
    """Get list of all registered providers."""
    return _registry.list_providers()


async def get_available_providers() -> List[str]:
    """Get list of currently available providers."""
    return await _registry.get_available_providers()


def register_provider(provider_id: str, provider_class: Type[SearchProvider]):
    """Register a new provider class."""
    _registry.register_provider_class(provider_id, provider_class)