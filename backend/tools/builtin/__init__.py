"""
Built-in Tools

Auto-imports all tool modules to register them with the global registry.
"""

# Import all tool modules to trigger their register_tool() calls
from tools.builtin import pubmed
from tools.builtin import reports
from tools.builtin import conversation
from tools.builtin import web
from tools.builtin import help
from tools.builtin import deep_research

from tools.builtin import streams
from tools.builtin import artifacts

# Add more tool modules here as they are created:
# from tools.builtin import research
# from tools.builtin import analysis
