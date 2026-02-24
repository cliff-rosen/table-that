"""
Help Registry Service

Provides help documentation for the chat system, filtered by user role.
Help content is loaded from YAML files in /backend/help/.

Each help section has:
- id: Unique identifier (e.g., "reports/viewing")
- title: Short title for TOC
- summary: Brief description for TOC (shown in system prompt)
- roles: List of roles that can see this section (member, org_admin, platform_admin)
- content: Full markdown content (retrieved via tool)

TOC Configuration:
- Preamble text can be customized via ChatConfig (scope='help', scope_key='toc-preamble')
- Category labels can be customized via ChatConfig (scope='help', scope_key='category-label:{category}')
"""

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional
import yaml

logger = logging.getLogger(__name__)

# Default TOC preamble
DEFAULT_TOC_PREAMBLE = "Use get_help(category, topic) to retrieve help content."

# Default help narrative (explains when/why to use the help tool)
DEFAULT_HELP_NARRATIVE = """When users ask "how do I..." or need guidance on using the app, use the get_help tool to retrieve relevant documentation. The help system contains detailed guides for all features.

**When to use help:**
- User asks how to do something
- User seems confused about a feature
- User asks what options are available
- You need to explain a workflow

**How to use:**
- First scan the TOC below to find the relevant category and topic
- Call get_help(category, topic) to retrieve the full content
- Synthesize the help content with your response - don't just paste it"""

# Default category labels (category -> display label)
DEFAULT_CATEGORY_LABELS = {
    'general': 'General',
    'getting-started': 'Getting Started',
    'reports': 'Reports',
    'article-viewer': 'Article Viewer',
    'tablizer': 'Tablizer',
    'streams': 'Streams',
    'tools': 'Tools',
    'operations': 'Operations',
    'field-reference': 'Field Reference',
    'glossary': 'Terms and Concepts',
}

# Path to help content directory
HELP_DIR = Path(__file__).parent.parent / "help"


@dataclass
class HelpSection:
    """A help documentation section."""
    category: str     # Feature area: reports, streams, tools, etc.
    topic: str        # Topic within category: overview, viewing, etc.
    title: str
    summary: str
    roles: List[str]  # Which roles can see this: member, org_admin, platform_admin
    content: str      # Full markdown content
    order: int = 0    # Display order in TOC

    @property
    def id(self) -> str:
        """Composite ID: category/topic"""
        return f"{self.category}/{self.topic}"


# Global registry of help sections
_help_sections: Dict[str, HelpSection] = {}


def _load_help_content() -> None:
    """Load all help content from YAML files in the help directory."""
    global _help_sections

    if not HELP_DIR.exists():
        logger.warning(f"Help directory not found: {HELP_DIR}")
        return

    logger.info(f"Loading help content from {HELP_DIR}")

    # Load each .yaml file in the help directory
    for yaml_file in sorted(HELP_DIR.glob("**/*.yaml")):
        try:
            with open(yaml_file, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)

            if not data or "sections" not in data:
                logger.debug(f"Skipping {yaml_file}: no sections found")
                continue

            for idx, section_data in enumerate(data["sections"]):
                # Support both new format (category + topic) and legacy format (id: "category/topic")
                if "category" in section_data and "topic" in section_data:
                    category = section_data["category"]
                    topic = section_data["topic"]
                elif "id" in section_data:
                    # Legacy format: parse from compound ID
                    parts = section_data["id"].split("/", 1)
                    category = parts[0]
                    topic = parts[1] if len(parts) > 1 else parts[0]
                else:
                    logger.warning(f"Section in {yaml_file} missing category/topic or id, skipping")
                    continue

                section = HelpSection(
                    category=category,
                    topic=topic,
                    title=section_data["title"],
                    summary=section_data["summary"],
                    roles=section_data.get("roles", ["member", "org_admin", "platform_admin"]),
                    content=section_data.get("content", ""),
                    order=section_data.get("order", idx)
                )
                _help_sections[section.id] = section
                logger.debug(f"Loaded help section: {section.id}")

            logger.info(f"Loaded {len(data['sections'])} sections from {yaml_file.name}")

        except Exception as e:
            logger.error(f"Error loading help file {yaml_file}: {e}", exc_info=True)

    logger.info(f"Help registry loaded {len(_help_sections)} total sections")


def get_help_toc_for_role(
    role: str,
    preamble: Optional[str] = None,
    summary_overrides: Optional[Dict[str, str]] = None
) -> str:
    """
    Get the help table of contents formatted for the system prompt.
    Filters sections by user role, grouped by category.

    Args:
        role: User role (member, org_admin, platform_admin)
        preamble: Optional custom preamble text (uses default if None)
        summary_overrides: Optional dict of 'category/topic' -> summary overrides

    Returns:
        Formatted TOC string for inclusion in system prompt
    """
    if not _help_sections:
        _load_help_content()

    # Filter sections for this role
    visible_sections = [
        s for s in _help_sections.values()
        if role in s.roles or role == "platform_admin"  # Platform admins see all
    ]

    if not visible_sections:
        return ""

    # Group by category
    by_category: Dict[str, List[HelpSection]] = {}
    for section in visible_sections:
        if section.category not in by_category:
            by_category[section.category] = []
        by_category[section.category].append(section)

    # Sort sections within each category
    for cat in by_category:
        by_category[cat].sort(key=lambda s: (s.order, s.topic))

    # Category order
    category_order = {'general': 0, 'getting-started': 1, 'field-reference': 2, 'glossary': 3, 'reports': 4, 'article-viewer': 5, 'tablizer': 6, 'streams': 7, 'tools': 8, 'operations': 9}

    # Use provided preamble or default
    toc_preamble = preamble if preamble is not None else DEFAULT_TOC_PREAMBLE

    # Summary overrides dict (or empty)
    summaries = summary_overrides or {}

    # Format as grouped TOC - use category IDs (not display labels) for clarity in API calls
    lines = [toc_preamble, ""]

    for category in sorted(by_category.keys(), key=lambda c: (category_order.get(c, 99), c)):
        sections = by_category[category]
        lines.append(f"{category}:")
        for section in sections:
            # Use overridden summary if available, otherwise default
            summary = summaries.get(section.id, section.summary)
            lines.append(f"  - {section.topic}: {summary}")

    return "\n".join(lines)


def get_all_topic_ids() -> List[str]:
    """Get all topic IDs as 'category/topic' (for validation/testing)."""
    if not _help_sections:
        _load_help_content()
    return list(_help_sections.keys())


def get_all_categories() -> List[str]:
    """Get all unique category names, sorted by display order."""
    if not _help_sections:
        _load_help_content()

    categories = set(s.category for s in _help_sections.values())

    # Sort by defined order
    order = {
        'general': 0,
        'getting-started': 1,
        'field-reference': 2,
        'glossary': 3,
        'reports': 4,
        'article-viewer': 5,
        'tablizer': 6,
        'streams': 7,
        'tools': 8,
        'operations': 9,
    }
    return sorted(categories, key=lambda c: (order.get(c, 99), c))


def get_toc_config() -> Dict[str, Any]:
    """Get the current TOC configuration (defaults).

    Returns dict with:
    - preamble: The TOC intro text
    - narrative: The help narrative text
    """
    return {
        'preamble': DEFAULT_TOC_PREAMBLE,
        'narrative': DEFAULT_HELP_NARRATIVE,
    }


def get_help_section_for_role(
    role: str,
    narrative: Optional[str] = None,
    preamble: Optional[str] = None,
    summary_overrides: Optional[Dict[str, str]] = None
) -> str:
    """
    Build the complete HELP section for the system prompt.

    Combines:
    - Narrative (explains when/why to use help)
    - Table of contents (with category IDs and topic summaries)

    Args:
        role: User role for filtering sections
        narrative: Optional custom narrative (uses default if None)
        preamble: Optional custom TOC preamble (uses default if None)
        summary_overrides: Optional topic summary overrides

    Returns:
        Complete help section string for system prompt
    """
    parts = []

    # 1. Narrative (why/when to use help)
    help_narrative = narrative if narrative is not None else DEFAULT_HELP_NARRATIVE
    parts.append(help_narrative)

    # 2. TOC (tool usage comes from the tool definition in CAPABILITIES)
    toc = get_help_toc_for_role(role, preamble, summary_overrides)
    if toc:
        parts.append("**Available Help Topics:**\n" + toc)

    return "\n\n".join(parts)


def get_topics_by_category(category: str) -> List[HelpSection]:
    """Get all topics in a category, sorted by order."""
    if not _help_sections:
        _load_help_content()

    topics = [s for s in _help_sections.values() if s.category == category]
    topics.sort(key=lambda t: (t.order, t.topic))
    return topics


def get_topic(category: str, topic: str) -> Optional[HelpSection]:
    """Get a specific topic by category and topic name."""
    if not _help_sections:
        _load_help_content()

    topic_id = f"{category}/{topic}"
    return _help_sections.get(topic_id)


def get_topic_by_id(topic_id: str, role: str) -> Optional[HelpSection]:
    """
    Get a help topic by composite ID if the user's role has access.

    Args:
        topic_id: The topic ID (category/topic) to retrieve
        role: User role for access check

    Returns:
        HelpSection if found and accessible, None otherwise
    """
    if not _help_sections:
        _load_help_content()

    topic_data = _help_sections.get(topic_id)
    if not topic_data:
        return None

    # Check role access (platform_admin sees all)
    if role not in topic_data.roles and role != "platform_admin":
        return None

    return topic_data


def reload_help_content() -> None:
    """Force reload of help content from YAML files (clears cache)."""
    global _help_sections
    _help_sections = {}
    _load_help_content()


def get_default_topic(category: str, topic: str) -> Optional[HelpSection]:
    """
    Get the default (YAML-based) help topic without any database overrides.

    Args:
        category: The category name
        topic: The topic name

    Returns:
        HelpSection from YAML files, or None if not found
    """
    if not _help_sections:
        _load_help_content()
    topic_id = f"{category}/{topic}"
    return _help_sections.get(topic_id)
