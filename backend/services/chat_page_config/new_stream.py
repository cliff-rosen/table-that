"""
Chat page config for the new_stream page.

Defines context builder and tab-specific configuration for creating new research streams.
Payload definitions (including parsers and LLM instructions) are in schemas/payloads.py.
"""

from typing import Dict, Any
from .registry import register_page


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """Build context section for new_stream page."""
    current_form = context.get("current_form", {})
    active_tab = context.get("active_tab", "semantic")

    stream_name = current_form.get("stream_name", "")
    domain_name = current_form.get("semantic_space", {}).get("domain", {}).get("name", "")
    domain_desc = current_form.get("semantic_space", {}).get("domain", {}).get("description", "")
    topics = current_form.get("semantic_space", {}).get("topics", [])
    entities = current_form.get("semantic_space", {}).get("entities", [])
    business_context = current_form.get("semantic_space", {}).get("context", {}).get("business_context", "")

    # Build context summary
    context_parts = []

    context_parts.append("The user is creating a new research stream.")
    context_parts.append(f"Currently viewing: {active_tab} layer")

    if stream_name:
        context_parts.append(f"\nCurrent Stream Name: {stream_name}")
    else:
        context_parts.append("\nStream name not yet set.")

    if domain_name or domain_desc:
        context_parts.append(f"\nDomain:")
        if domain_name:
            context_parts.append(f"  - Name: {domain_name}")
        if domain_desc:
            context_parts.append(f"  - Description: {domain_desc}")
    else:
        context_parts.append("\nDomain not yet defined.")

    if topics:
        context_parts.append(f"\nTopics ({len(topics)}):")
        for topic in topics[:5]:  # Show first 5
            name = topic.get("name", "Unnamed")
            desc = topic.get("description", "No description")
            context_parts.append(f"  - {name}: {desc}")
        if len(topics) > 5:
            context_parts.append(f"  ... and {len(topics) - 5} more")
    else:
        context_parts.append("\nNo topics defined yet.")

    if entities:
        context_parts.append(f"\nEntities ({len(entities)}):")
        for entity in entities[:5]:  # Show first 5
            name = entity.get("name", "Unnamed")
            entity_type = entity.get("type", "unknown")
            context_parts.append(f"  - {name} ({entity_type})")
        if len(entities) > 5:
            context_parts.append(f"  ... and {len(entities) - 5} more")
    else:
        context_parts.append("\nNo entities defined yet.")

    if business_context:
        context_parts.append(f"\nBusiness Context: {business_context}")

    context_parts.append("""
CONTEXT:
You are helping the user create a new research stream. A research stream monitors specific topics,
competitors, or therapeutic areas and generates regular reports. The stream has three layers:

1. Semantic Space (Layer 1): What information matters - domain, topics, entities, business context
2. Retrieval Config (Layer 2): How to find and filter - sources, search strategies, quality criteria
3. Presentation (Layer 3): How to organize results - categories for grouping findings

You can:
- Suggest complete stream templates based on the user's description
- Recommend topics relevant to their domain or business context
- Suggest entities (companies, products, people, etc.) to monitor
- Provide validation feedback on their current configuration
- Help improve domain descriptions and business context
- Answer questions about best practices for stream creation

Be proactive in offering suggestions but let the user guide the conversation. Ask clarifying
questions when needed to provide better recommendations.
""")

    return "\n".join(context_parts)


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="new_stream",
    context_builder=build_context,
    payloads=["stream_template", "topic_suggestions", "validation_feedback"]
    # Note: Global actions (close_chat) are automatically included
)
