"""
Chat page config for the streams_list page.

Defines context builder and tab-specific configuration.
Payload definitions (including parsers and LLM instructions) are in schemas/payloads.py.
"""

from typing import Dict, Any
from .registry import register_page


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """Build context section for streams_list page."""
    streams = context.get("streams", [])
    stream_count = len(streams)

    if stream_count == 0:
        return """The user is viewing their Research Streams list page.

Current status: No research streams created yet

WHAT ARE RESEARCH STREAMS:
Research streams are focused monitoring channels that track specific topics, competitors, or therapeutic areas.
Each stream defines what information matters, how to find it, and how to organize the results."""

    # Build summary of existing streams
    stream_summaries = []
    for stream in streams[:5]:  # Limit to first 5 for context
        name = stream.get("stream_name", "Unnamed")
        purpose = stream.get("purpose", "No purpose defined")
        is_active = stream.get("is_active", False)
        status = "Active" if is_active else "Inactive"
        stream_summaries.append(f"  - {name} ({status}): {purpose}")

    summary_text = "\n".join(stream_summaries)
    more_text = f"\n  ... and {stream_count - 5} more" if stream_count > 5 else ""

    return f"""The user is viewing their Research Streams list page.

Current portfolio: {stream_count} research stream{'s' if stream_count != 1 else ''}

{summary_text}{more_text}

CONTEXT:
The user can create new streams, edit existing ones, or get help understanding their current portfolio.
Help them understand gaps, overlaps, or suggest new streams that would be valuable."""


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="streams_list",
    context_builder=build_context,
    payloads=["stream_suggestions", "portfolio_insights", "quick_setup"]
    # Note: Global actions (close_chat) are automatically included
)
