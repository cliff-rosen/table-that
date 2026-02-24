"""
Global Tool System

Provides tool registration and execution for the chat system.
"""

from tools.registry import (
    ToolProgress,
    ToolResult,
    ToolConfig,
    register_tool,
    get_tool,
    get_all_tools,
    get_global_tools,
    get_tools_by_names,
    get_tools_by_category,
    get_tools_dict,
    tools_to_anthropic_format,
    tools_to_dict,
    get_tools_for_page,
    get_tools_for_page_dict,
    get_tools_for_anthropic,
)

# Import builtin tools to auto-register them
from tools import builtin

__all__ = [
    "ToolProgress",
    "ToolResult",
    "ToolConfig",
    "register_tool",
    "get_tool",
    "get_all_tools",
    "get_global_tools",
    "get_tools_by_names",
    "get_tools_by_category",
    "get_tools_dict",
    "tools_to_anthropic_format",
    "tools_to_dict",
    "get_tools_for_page",
    "get_tools_for_page_dict",
    "get_tools_for_anthropic",
]
