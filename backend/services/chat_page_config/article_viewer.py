"""
Chat page config for the article viewer.

Defines context builder and identity for when a user is viewing a specific article.
This page config is used when the ArticleViewerModal is open.

ARCHITECTURE:
- Context builder: Provides detailed article context (what the user is viewing)
- Identity: Specialized for article-focused interactions
- Tools: Uses global tools (reports tools with is_global=True)
"""

from typing import Dict, Any
from .registry import register_page, ClientAction


# =============================================================================
# Persona
# =============================================================================

ARTICLE_VIEWER_PERSONA = """## Article Viewer

The user is viewing a specific article in detail.

**Your focus should be on:**
- Explaining the article's findings, methods, and significance
- Helping interpret the stance/position analysis if available
- Answering questions about the article's content
- Connecting this article to the broader research context

**Page-specific guidance:**
- Focus on the specific article being viewed unless asked about others
- Be precise about findings and avoid overstating significance
- The article's abstract, AI summary, and stance analysis are in your context - use them
"""


# =============================================================================
# Context Builder
# =============================================================================


def build_context(context: Dict[str, Any]) -> str:
    """
    Build context for the article viewer.

    Provides rich context about the currently viewed article.
    """
    parts = ["Page: Article Viewer", ""]

    # Stream/report context (if available)
    stream_name = context.get("stream_name")
    report_name = context.get("report_name")
    if stream_name:
        parts.append(f"Stream: {stream_name}")
    if report_name:
        parts.append(f"Report: {report_name}")

    # Article details
    current_article = context.get("current_article")
    if current_article:
        parts.append("")
        parts.append("=== Current Article ===")

        # Basic info
        title = current_article.get("title", "Unknown")
        pmid = current_article.get("pmid")
        doi = current_article.get("doi")
        authors = current_article.get("authors")
        journal = current_article.get("journal")
        publication_date = current_article.get("publication_date")

        parts.append(f"Title: {title}")
        if pmid:
            parts.append(f"PMID: {pmid}")
        if doi:
            parts.append(f"DOI: {doi}")
        if authors:
            # Truncate long author lists
            if len(authors) > 100:
                authors = authors[:100] + "..."
            parts.append(f"Authors: {authors}")
        if journal:
            parts.append(f"Journal: {journal}")
        if publication_date:
            parts.append(f"Published: {publication_date}")

        # AI Summary - this is the most useful condensed info, show it prominently
        ai_summary = current_article.get("ai_summary")
        if ai_summary:
            parts.append("")
            parts.append("=== AI Summary ===")
            parts.append(ai_summary)

        # Relevance info
        relevance_score = current_article.get("relevance_score")
        relevance_rationale = current_article.get("relevance_rationale")
        if relevance_score is not None or relevance_rationale:
            parts.append("")
            parts.append("=== Relevance ===")
            if relevance_score is not None:
                parts.append(f"Score: {relevance_score}")
            if relevance_rationale:
                parts.append(f"Rationale: {relevance_rationale}")

        # Stance analysis
        stance = current_article.get("stance_analysis")
        if stance and isinstance(stance, dict):
            parts.append("")
            parts.append("=== Stance Analysis ===")
            parts.append(f"Stance: {stance.get('stance', 'Unknown')}")
            parts.append(f"Confidence: {stance.get('confidence', 'N/A')}")
            if stance.get("analysis"):
                parts.append(f"Analysis: {stance.get('analysis')}")
            if stance.get("key_factors"):
                factors = stance.get("key_factors", [])
                if factors:
                    parts.append(f"Key Factors: {', '.join(factors)}")

        # Abstract
        abstract = current_article.get("abstract")
        if abstract:
            parts.append("")
            parts.append("=== Abstract ===")
            parts.append(abstract)
    else:
        parts.append("No article currently selected.")

    return "\n".join(parts)


# =============================================================================
# Client Actions
# =============================================================================

ARTICLE_VIEWER_CLIENT_ACTIONS = []


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="article_viewer",
    context_builder=build_context,
    persona=ARTICLE_VIEWER_PERSONA,
    client_actions=ARTICLE_VIEWER_CLIENT_ACTIONS,
    # Payloads relevant to article viewer
    payloads=[],
    # Note: Tools are global (is_global=True) so not listed here
)
