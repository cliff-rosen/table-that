"""
Tool Registry

Provides tool configuration and registration for the chat system.

Tools can be:
- Global (is_global=True): Automatically available on all pages (default)
- Non-global (is_global=False): Must be explicitly added to a page config

Pages declare which additional tools they use via their TabConfig.
The resolution is: global tools + page-declared tools + tab-declared tools.

Supports streaming tools that yield ToolProgress updates before returning ToolResult.

Payload types are defined in schemas/payloads.py - tools reference them by name.
"""

from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Awaitable, Callable, Dict, Generator, List, Optional, Union
from sqlalchemy.ext.asyncio import AsyncSession


@dataclass
class ToolProgress:
    """Progress update from a streaming tool."""
    stage: str                          # Current stage name (e.g., "searching", "processing")
    message: str                        # Human-readable status message
    progress: float = 0.0               # 0.0 to 1.0 progress indicator
    data: Optional[Dict[str, Any]] = None  # Optional structured data for UI


@dataclass
class ToolResult:
    """Result from a tool execution."""
    text: str                           # Text result for LLM
    payload: Optional[Dict[str, Any]] = None  # Structured data for frontend (type, data)


# Type for sync tool executor
SyncToolExecutor = Callable[
    [Dict[str, Any], AsyncSession, int, Dict[str, Any]],
    Union[str, ToolResult, Generator[ToolProgress, None, ToolResult]]
]

# Type for async tool executor
AsyncToolExecutor = Callable[
    [Dict[str, Any], AsyncSession, int, Dict[str, Any]],
    Awaitable[Union[str, ToolResult]]
]

# Type for async streaming tool executor
AsyncStreamingToolExecutor = Callable[
    [Dict[str, Any], AsyncSession, int, Dict[str, Any]],
    AsyncGenerator[ToolProgress, None]
]


@dataclass
class ToolConfig:
    """Configuration for a tool the agent can use.

    Tools can be sync or async:
    - Sync: def executor(params, db, user_id, context) -> str | ToolResult
    - Async: async def executor(params, db, user_id, context) -> str | ToolResult

    The agent loop automatically detects async executors and awaits them.
    """
    name: str                           # Tool name (e.g., "search_pubmed")
    description: str                    # Description for LLM
    input_schema: Dict[str, Any]        # JSON schema for parameters
    executor: Union[SyncToolExecutor, AsyncToolExecutor, AsyncStreamingToolExecutor]
    streaming: bool = False             # If True, executor yields ToolProgress before returning ToolResult
    category: str = "general"           # Tool category for organization
    payload_type: Optional[str] = None  # Payload type from schemas/payloads.py (e.g., "pubmed_search_results")
    is_global: bool = True              # If True, available on all pages by default
    required_role: Optional[str] = None # If set, only users with this role can see the tool (e.g., "platform_admin")


# =============================================================================
# Global Registry
# =============================================================================

_tool_registry: Dict[str, ToolConfig] = {}


def register_tool(tool: ToolConfig) -> None:
    """Register a tool in the global registry."""
    _tool_registry[tool.name] = tool


def get_tool(name: str) -> Optional[ToolConfig]:
    """Get a tool by name."""
    return _tool_registry.get(name)


def get_all_tools() -> List[ToolConfig]:
    """Get all registered tools."""
    return list(_tool_registry.values())


def get_global_tools() -> List[ToolConfig]:
    """Get all global tools (is_global=True)."""
    return [t for t in _tool_registry.values() if t.is_global]


def get_tools_by_names(names: List[str]) -> List[ToolConfig]:
    """Get tools by a list of names."""
    return [_tool_registry[name] for name in names if name in _tool_registry]


def get_tools_by_category(category: str) -> List[ToolConfig]:
    """Get all tools in a specific category."""
    return [t for t in _tool_registry.values() if t.category == category]


def get_tools_dict() -> Dict[str, ToolConfig]:
    """Get all tools as a dict mapping name to config."""
    return dict(_tool_registry)


# =============================================================================
# Anthropic API Format Helpers
# =============================================================================

def tools_to_anthropic_format(tools: List[ToolConfig]) -> List[Dict[str, Any]]:
    """Convert a list of tools to Anthropic API format."""
    return [
        {
            "name": tool.name,
            "description": tool.description,
            "input_schema": tool.input_schema
        }
        for tool in tools
    ]


def tools_to_dict(tools: List[ToolConfig]) -> Dict[str, ToolConfig]:
    """Convert a list of tools to a dict mapping name to config."""
    return {t.name: t for t in tools}


# =============================================================================
# Page-Aware Resolution Functions
# =============================================================================

def get_tools_for_page(
    page: str,
    tab: Optional[str] = None,
    subtab: Optional[str] = None,
    user_role: Optional[str] = None
) -> List[ToolConfig]:
    """
    Get all tools for a page, optional tab, and optional subtab.

    Returns: global tools + page tools + tab tools + subtab tools (via page config registry)
    Filters out tools that require a role the user doesn't have.
    """
    from services.chat_page_config import get_tool_names_for_page_tab

    # Start with global tools
    tools = get_global_tools()

    # Get page/tab/subtab-specific tool names from page config
    page_tool_names = get_tool_names_for_page_tab(page, tab, subtab)

    # Add those tools (avoid duplicates)
    global_names = {t.name for t in tools}
    for name in page_tool_names:
        if name not in global_names and name in _tool_registry:
            tools.append(_tool_registry[name])

    # Filter by required_role
    if user_role:
        tools = [t for t in tools if t.required_role is None or t.required_role == user_role]
    else:
        tools = [t for t in tools if t.required_role is None]

    return tools


def get_tools_for_page_dict(
    page: str,
    tab: Optional[str] = None,
    subtab: Optional[str] = None,
    user_role: Optional[str] = None
) -> Dict[str, ToolConfig]:
    """
    Get all tools for a page as a dict mapping name to config.

    Returns: global tools + page tools + tab tools + subtab tools
    """
    return tools_to_dict(get_tools_for_page(page, tab, subtab, user_role=user_role))


def get_tools_for_anthropic(
    page: str,
    tab: Optional[str] = None,
    subtab: Optional[str] = None,
    user_role: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get tools in Anthropic API format for a page.

    Returns: global tools + page tools + tab tools + subtab tools in Anthropic format
    """
    return tools_to_anthropic_format(get_tools_for_page(page, tab, subtab, user_role=user_role))
