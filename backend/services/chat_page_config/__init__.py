"""
Chat Page Config Package

Page-specific configurations for the chat system. Each page registers:
- Context builder: Generates page-specific LLM instructions
- Tabs: Tab-specific tools and payloads (with optional subtabs)
- Page-wide tools/payloads: Available on all tabs
- Client actions: What UI actions are available

Tools and payloads are defined in their respective registries and referenced
by name in page configs. The system resolves:
- Tools = global tools + page tools + tab tools + subtab tools
- Payloads = global payloads + page payloads + tab payloads + subtab payloads

Import this package to automatically register all page configurations.
"""

from typing import List, Optional

from .registry import (
    SubTabConfig,
    TabConfig,
    ClientAction,
    PageConfig,
    register_page,
    get_page_config,
    has_page,
    get_tool_names_for_page_tab,
    get_payload_names_for_page_tab,
    get_context_builder,
    get_persona,
    get_client_actions,
)

# Import all page configurations to register them
from . import edit_stream
from . import streams_list
from . import new_stream
from . import reports
from . import tablizer
from . import article_viewer
from . import artifacts


# =============================================================================
# Payload Resolution Helper Functions
# =============================================================================

def has_page_payloads(
    page: str,
    tab: Optional[str] = None,
    subtab: Optional[str] = None
) -> bool:
    """Check if a page (and optional tab/subtab) has any payloads available."""
    from schemas.payloads import get_global_payload_types

    # Check for global payloads
    if get_global_payload_types():
        return True

    # Check for page/tab/subtab payloads
    payload_names = get_payload_names_for_page_tab(page, tab, subtab)
    return len(payload_names) > 0


def get_all_payloads_for_page(
    page: str,
    tab: Optional[str] = None,
    subtab: Optional[str] = None
):
    """
    Get all PayloadType objects for a page and optional tab/subtab.

    Returns: global payloads + page payloads + tab payloads + subtab payloads
    """
    from schemas.payloads import get_global_payload_types, get_payload_types_by_names

    # Start with global payloads
    payloads = list(get_global_payload_types())

    # Get page/tab/subtab-specific payload names
    payload_names = get_payload_names_for_page_tab(page, tab, subtab)

    # Add those payloads (avoid duplicates)
    global_names = {p.name for p in payloads}
    for payload in get_payload_types_by_names(payload_names):
        if payload.name not in global_names:
            payloads.append(payload)

    return payloads


# Legacy aliases for backwards compatibility
get_page_context_builder = get_context_builder
get_page_client_actions = get_client_actions


__all__ = [
    'SubTabConfig',
    'TabConfig',
    'ClientAction',
    'PageConfig',
    'register_page',
    'get_page_config',
    'has_page',
    'get_tool_names_for_page_tab',
    'get_payload_names_for_page_tab',
    'get_context_builder',
    'get_persona',
    'get_client_actions',
    # Payload resolution helpers
    'has_page_payloads',
    'get_all_payloads_for_page',
    # Legacy aliases
    'get_page_context_builder',
    'get_page_client_actions',
]
