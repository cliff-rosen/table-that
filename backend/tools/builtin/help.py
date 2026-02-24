"""
Help Tool

Provides access to app documentation for the chat system.
Retrieves help content filtered by user role.

Usage:
- get_help() - List all help categories
- get_help(category="...") - List topics in a category with summaries
- get_help(category="...", topic="...") - Get full content for a specific topic
"""

import logging
from typing import Any, Dict

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, register_tool
from services.help_registry import (
    get_topic,
    get_topics_by_category,
    get_all_categories,
)

logger = logging.getLogger(__name__)


async def execute_get_help(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> str:
    """
    Retrieve help documentation by category and optionally topic.

    - If only category is provided: Returns list of topics with summaries
    - If both category and topic: Returns full content for that topic
    """
    category = params.get("category", "").strip()
    topic = params.get("topic", "").strip() if params.get("topic") else None

    # Get user role from context (default to member for safety)
    user_role = context.get("user_role", "member")

    # If no category provided, list available categories
    if not category:
        categories = get_all_categories()
        if not categories:
            return "No help categories available."

        lines = ["# Available Help Categories", ""]
        for cat in categories:
            sections = get_topics_by_category(cat)
            # Filter by role
            visible = [s for s in sections if user_role in s.roles or user_role == "platform_admin"]
            if visible:
                lines.append(f"- **{cat}** ({len(visible)} topics)")

        lines.append("")
        lines.append("Use `get_help(category=\"...\")` to see topics in a category.")
        return "\n".join(lines)

    # Get topics in the category
    sections = get_topics_by_category(category)

    # Filter by role
    visible_sections = [
        s for s in sections
        if user_role in s.roles or user_role == "platform_admin"
    ]

    if not visible_sections:
        categories = get_all_categories()
        return f"Help category '{category}' not found or not accessible. Available categories: {', '.join(categories)}"

    # If topic specified, return full content
    if topic:
        section = get_topic(category, topic)

        if not section:
            topic_list = ", ".join(s.topic for s in visible_sections)
            return f"Topic '{topic}' not found in category '{category}'. Available topics: {topic_list}"

        # Check role access
        if user_role not in section.roles and user_role != "platform_admin":
            return f"Topic '{category}/{topic}' is not accessible with your current role."

        return f"""# {section.title}

{section.content}"""

    # No topic specified - return category overview with topic summaries
    lines = [f"# Help: {category.title()}", ""]

    for section in visible_sections:
        lines.append(f"## {section.title}")
        lines.append(f"*Topic: `{section.topic}`*")
        lines.append("")
        lines.append(section.summary)
        lines.append("")

    lines.append("---")
    lines.append(f"Use `get_help(category=\"{category}\", topic=\"...\")` to get full content for a specific topic.")

    return "\n".join(lines)


# =============================================================================
# Register Tool
# =============================================================================

register_tool(ToolConfig(
    name="get_help",
    description="""Retrieve help documentation about how to use the app. See the HELP section of the system prompt for available topics and when to use this tool.""",
    input_schema={
        "type": "object",
        "properties": {
            "category": {
                "type": "string",
                "description": "Help category (e.g., general, reports, article-viewer, tablizer). Omit to list categories."
            },
            "topic": {
                "type": "string",
                "description": "Specific topic within the category. Omit to see all topics in category."
            }
        },
        "required": []
    },
    executor=execute_get_help,
    category="help",
    is_global=True  # Available on all pages
))
