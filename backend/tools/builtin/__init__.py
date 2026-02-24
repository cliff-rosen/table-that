"""
Built-in Tools

Auto-imports all tool modules to register them with the global registry.
"""

# Import all tool modules to trigger their register_tool() calls
from tools.builtin import conversation
from tools.builtin import help
from tools.builtin import table_data
