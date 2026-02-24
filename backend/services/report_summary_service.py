"""
Report Summary Service - Generates summaries for reports using LLM

This service generates:
1. Article summaries for individual articles
2. Category summaries for each presentation category
3. Executive summary synthesizing the entire report

Uses the unified call_llm interface for all LLM calls.
Supports custom prompts via enrichment_config with slug replacement.
"""

from typing import List, Dict, Optional, Any, Union, TYPE_CHECKING

if TYPE_CHECKING:
    from models import ReportArticleAssociation, ResearchStream
    from schemas.research_stream import EnrichmentConfig, Category

from agents.prompts.llm import call_llm, ModelConfig, LLMOptions, LLMResult
from utils.date_utils import format_pub_date
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# Default Prompts - Single source of truth for all prompt defaults
# =============================================================================

DEFAULT_PROMPTS = {
    "executive_summary": {
        "system_prompt": """You are an expert research analyst who specializes in synthesizing scientific literature.

Your task is to write a concise executive summary of a research report.

The summary should:
- Be 3-5 paragraphs (200-400 words total)
- Highlight the most important findings and trends
- Identify key themes across the literature
- Note any significant developments or breakthroughs
- Be written for an executive audience (technical but accessible)
- Focus on insights and implications, not just listing papers

Write in a professional, analytical tone. Include only the summary with no heading or other text.""",
        "user_prompt_template": """Generate an executive summary for this research report.

# Research Stream Purpose
{stream_purpose}

# Report Statistics
- Total articles: {articles_count}
- Categories covered: {categories_count}

# Category Summaries
{categories_summaries}

# AI-Generated Article Summaries
{articles_summaries}

# Sample Articles (representative of the full report)
{articles_formatted}

Generate a comprehensive executive summary that synthesizes the key findings and themes across all articles."""
    },
    "category_summary": {
        "system_prompt": """You are an expert research analyst synthesizing scientific literature.

Your task is to write a concise summary of articles in the "{category_name}" category.

The summary should:
- Be 2-3 paragraphs (150-250 words total)
- Identify the main themes and findings in this category
- Highlight the most significant or impactful articles
- Note any emerging trends or patterns
- Be written for a technical audience familiar with the field

Write in a professional, analytical tone.""",
        "user_prompt_template": """Generate a summary for the "{category_name}" category.

# Category Description
{category_description}

# Research Stream Purpose
{stream_purpose}

# Articles in This Category ({articles_count} total)
{articles_formatted}

# AI-Generated Article Summaries
{articles_summaries}

Generate a focused summary that captures the key insights from articles in this category."""
    },
    "article_summary": {
        "system_prompt": """You are an expert research analyst who synthesizes scientific literature.

Your task is to write a concise summary of a research article that highlights its key contributions.

The summary should:
- Be 2-4 sentences (50-100 words)
- Capture the main research question or objective
- Highlight key findings or contributions
- Note any significant methodology or implications
- Be written for a technical audience familiar with the field

Write in a professional, analytical tone. Include only the summary with no heading or other text.""",
        "user_prompt_template": """Summarize this research article:

# Article Information
Title: {title}
Authors: {authors}
Journal: {journal} ({publication_date})

# Abstract
{abstract}

Generate a concise summary that captures the key contributions and findings of this article."""
    }
}

# =============================================================================
# Single Source of Truth for Prompt Slugs
# =============================================================================
# Each entry: (frontend_slug, flat_key, description)
# - frontend_slug: What users see in UI, e.g., "{stream.name}"
# - flat_key: The key used in pipeline item dicts, e.g., "stream_name"
# - description: Help text for UI

PROMPT_SLUGS = {
    "article_summary": [
        ("{stream.name}", "stream_name", "Name of the research stream"),
        ("{stream.purpose}", "stream_purpose", "Purpose/description of the stream"),
        ("{article.title}", "title", "Title of the article"),
        ("{article.authors}", "authors", "Authors of the article"),
        ("{article.journal}", "journal", "Journal where published"),
        ("{article.publication_date}", "publication_date", "Publication date"),
        ("{article.abstract}", "abstract", "Article abstract"),
        ("{article.filter_reason}", "filter_reason", "AI reasoning for semantic filter"),
    ],
    "category_summary": [
        ("{stream.name}", "stream_name", "Name of the research stream"),
        ("{stream.purpose}", "stream_purpose", "Purpose/description of the stream"),
        ("{category.name}", "category_name", "Name of the current category"),
        ("{category.description}", "category_description", "Description of what this category covers"),
        ("{category.topics}", "category_topics", "List of topics in this category"),
        ("{articles.count}", "articles_count", "Number of articles in this category"),
        ("{articles.formatted}", "articles_formatted", "Formatted list of articles in this category"),
        ("{articles.summaries}", "articles_summaries", "AI-generated summaries for articles"),
    ],
    "executive_summary": [
        ("{stream.name}", "stream_name", "Name of the research stream"),
        ("{stream.purpose}", "stream_purpose", "Purpose/description of the stream"),
        ("{articles.count}", "articles_count", "Total number of articles in the report"),
        ("{articles.formatted}", "articles_formatted", "Formatted list of articles"),
        ("{articles.summaries}", "articles_summaries", "AI-generated summaries for articles"),
        ("{categories.count}", "categories_count", "Number of categories in the report"),
        ("{categories.summaries}", "categories_summaries", "Formatted category summaries"),
    ],
}


def get_slug_mappings(prompt_type: str) -> Dict[str, str]:
    """Get slug mappings for a prompt type: {frontend_slug} -> {flat_key}"""
    slugs = PROMPT_SLUGS.get(prompt_type, [])
    return {slug: f"{{{flat_key}}}" for slug, flat_key, _ in slugs}


def get_available_slugs(prompt_type: str) -> List[Dict[str, str]]:
    """Get available slugs for UI/help for a prompt type (excludes legacy aliases)."""
    slugs = PROMPT_SLUGS.get(prompt_type, [])
    return [{"slug": slug, "description": desc} for slug, _, desc in slugs if "legacy" not in desc]


def get_required_keys(prompt_type: str) -> List[str]:
    """Get list of flat keys that must be supplied in pipeline items."""
    slugs = PROMPT_SLUGS.get(prompt_type, [])
    return [flat_key for _, flat_key, _ in slugs]


# Derived constants for backward compatibility
# SLUG_MAPPINGS: Used by _get_prompts() to convert custom prompt slugs to flat placeholders
#   Structure: {"article_summary": {"{stream.name}": "{stream_name}", ...}, ...}
SLUG_MAPPINGS = {pt: get_slug_mappings(pt) for pt in PROMPT_SLUGS}

# AVAILABLE_SLUGS: Returned by API for frontend UI to show available placeholders
#   Structure: {"article_summary": [{"slug": "{stream.name}", "description": "..."}, ...], ...}
AVAILABLE_SLUGS = {pt: get_available_slugs(pt) for pt in PROMPT_SLUGS}


class ReportSummaryService:
    """Service for generating report summaries using LLM.

    Uses the unified call_llm interface for all LLM calls.
    Model selection is the responsibility of the caller.
    """

    # Default model configuration
    DEFAULT_MODEL = "gpt-4.1"
    DEFAULT_TEMPERATURE = 0.3

    def _get_default_model_config(self) -> ModelConfig:
        """Get default model configuration."""
        return ModelConfig(
            model=self.DEFAULT_MODEL,
            temperature=self.DEFAULT_TEMPERATURE,
        )

    def _get_prompts(
        self,
        prompt_type: str,
        enrichment_config: Optional["EnrichmentConfig"] = None,
    ) -> tuple[str, str]:
        """
        Get system and user prompts, using custom prompts from enrichment_config if available.

        Args:
            prompt_type: One of "article_summary", "category_summary", "executive_summary"
            enrichment_config: Optional EnrichmentConfig with custom prompts

        Returns:
            Tuple of (system_message, user_message)
        """
        # Check for custom prompts
        custom_prompt = None
        if enrichment_config and enrichment_config.prompts:
            custom_prompt = enrichment_config.prompts.get(prompt_type)

        if custom_prompt:
            system_message = custom_prompt.system_prompt
            user_message = custom_prompt.user_prompt_template
            # Convert nested slugs to flat placeholders for custom prompts
            mappings = SLUG_MAPPINGS.get(prompt_type, {})
            for old_slug, new_placeholder in mappings.items():
                system_message = system_message.replace(old_slug, new_placeholder)
                user_message = user_message.replace(old_slug, new_placeholder)
        else:
            # Default prompts already use flat placeholders
            system_message = DEFAULT_PROMPTS[prompt_type]["system_prompt"]
            user_message = DEFAULT_PROMPTS[prompt_type]["user_prompt_template"]

        return system_message, user_message

    # =========================================================================
    # Article Summary
    # =========================================================================

    async def generate_article_summary(
        self,
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        enrichment_config: Optional["EnrichmentConfig"] = None,
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Generate AI summary for article(s).

        Args:
            items: Single item dict or list of item dicts. Each dict should contain:
                - title: Article title
                - authors: Formatted authors string
                - journal: Journal name
                - publication_date: Publication date
                - abstract: Article abstract
                - filter_reason: (optional) AI reasoning from semantic filter
                - stream_name: (optional) Research stream name
                - stream_purpose: (optional) Research stream purpose
            enrichment_config: Optional EnrichmentConfig with custom prompts
            model_config: Model configuration (model, temperature)
            options: Call options (max_concurrent, on_progress)

        Returns:
            Single item: LLMResult with .data containing summary text
            List of items: List[LLMResult] in same order as input
        """
        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return LLMResult(input={}, data=None, error="No items provided") if is_single else []

        # Get prompts (custom or default)
        system_message, user_message = self._get_prompts("article_summary", enrichment_config)

        # Apply default model config if not provided
        if model_config is None:
            model_config = self._get_default_model_config()

        # Apply default options if not provided
        if options is None:
            options = LLMOptions(max_concurrent=5)

        logger.info(f"generate_article_summary - items={len(items_list)}, model={model_config.model_id}")

        # Call LLM (text mode - no response_schema)
        results = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values=items_list[0] if is_single else items_list,
            model_config=model_config,
            response_schema=None,
            options=options,
        )

        return results

    # =========================================================================
    # Category Summary
    # =========================================================================

    async def generate_category_summary(
        self,
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        enrichment_config: Optional["EnrichmentConfig"] = None,
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Generate summary for category(ies).

        Args:
            items: Single item dict or list of item dicts. Each dict should contain:
                - category_name: Name of the category
                - category_description: Description of what this category covers
                - category_topics: (optional) Comma-separated topics
                - articles_count: Number of articles in category
                - articles_formatted: Formatted article list for prompt
                - articles_summaries: (optional) AI summaries for articles
                - stream_name: (optional) Research stream name
                - stream_purpose: (optional) Research stream purpose
            enrichment_config: Optional EnrichmentConfig with custom prompts
            model_config: Model configuration (model, temperature)
            options: Call options (max_concurrent, on_progress)

        Returns:
            Single item: LLMResult with .data containing summary text
            List of items: List[LLMResult] in same order as input
        """
        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return LLMResult(input={}, data=None, error="No items provided") if is_single else []

        # Get prompts (custom or default)
        system_message, user_message = self._get_prompts("category_summary", enrichment_config)

        # Apply default model config if not provided
        if model_config is None:
            model_config = self._get_default_model_config()

        # Apply default options if not provided
        if options is None:
            options = LLMOptions(max_concurrent=5)

        logger.info(f"generate_category_summary - items={len(items_list)}, model={model_config.model_id}")

        # Call LLM (text mode - no response_schema)
        results = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values=items_list[0] if is_single else items_list,
            model_config=model_config,
            response_schema=None,
            options=options,
        )

        return results

    # =========================================================================
    # Executive Summary
    # =========================================================================

    async def generate_executive_summary(
        self,
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        enrichment_config: Optional["EnrichmentConfig"] = None,
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Generate executive summary for report(s).

        Args:
            items: Single item dict or list of item dicts. Each dict should contain:
                - articles_count: Total number of articles
                - articles_formatted: Formatted article list for prompt
                - categories_count: Number of categories
                - categories_summaries: Formatted category summaries
                - stream_name: (optional) Research stream name
                - stream_purpose: (optional) Research stream purpose
            enrichment_config: Optional EnrichmentConfig with custom prompts
            model_config: Model configuration (model, temperature)
            options: Call options (max_concurrent, on_progress)

        Returns:
            Single item: LLMResult with .data containing summary text
            List of items: List[LLMResult] in same order as input
        """
        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return LLMResult(input={}, data=None, error="No items provided") if is_single else []

        # Get prompts (custom or default)
        system_message, user_message = self._get_prompts("executive_summary", enrichment_config)

        # Apply default model config if not provided
        if model_config is None:
            model_config = self._get_default_model_config()

        logger.info(f"generate_executive_summary - items={len(items_list)}, model={model_config.model_id}")

        # Call LLM (text mode - no response_schema)
        results = await call_llm(
            system_message=system_message,
            user_message=user_message,
            values=items_list[0] if is_single else items_list,
            model_config=model_config,
            response_schema=None,
            options=options,
        )

        return results

    # =========================================================================
    # Item Building Helpers - Build items dicts from associations
    # Used by both pipeline (first generation) and curation (regeneration)
    # =========================================================================

    def build_article_summary_items(
        self,
        associations: List["ReportArticleAssociation"],
        stream: "ResearchStream",
    ) -> List[Dict[str, Any]]:
        """
        Build items list for article summary generation from associations.

        Args:
            associations: List of ReportArticleAssociation with loaded article relationship
            stream: ResearchStream for context

        Returns:
            List of item dicts ready for generate_article_summary()
        """
        items = []
        for assoc in associations:
            article = assoc.article
            if not article or not article.abstract:
                continue

            wip_article = assoc.wip_article
            items.append({
                "id": article.article_id,
                "title": article.title or "Untitled",
                "authors": self.format_authors(article.authors),
                "journal": article.journal or "Unknown",
                "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day) or "Unknown",
                "abstract": article.abstract or "",
                "filter_reason": wip_article.filter_score_reason if wip_article else "",
                "stream_name": stream.stream_name or "" if stream else "",
                "stream_purpose": stream.purpose or "" if stream else "",
            })
        return items

    def build_category_summary_items(
        self,
        associations: List["ReportArticleAssociation"],
        categories: List["Category"],
        stream: "ResearchStream",
    ) -> List[Dict[str, Any]]:
        """
        Build items list for category summary generation from associations.

        Args:
            associations: List of ReportArticleAssociation with loaded article relationship
            categories: List of Category objects (with id, name, topics, specific_inclusions)
            stream: ResearchStream for context

        Returns:
            List of item dicts ready for generate_category_summary(), one per non-empty category
        """
        # Group associations by category
        category_to_associations: Dict[str, List["ReportArticleAssociation"]] = {}
        for assoc in associations:
            for cat_id in (assoc.presentation_categories or []):
                if cat_id not in category_to_associations:
                    category_to_associations[cat_id] = []
                category_to_associations[cat_id].append(assoc)

        items = []
        for category in categories:
            # Handle both object and dict categories
            cat_id = category.id if hasattr(category, 'id') else category.get('id')
            cat_name = category.name if hasattr(category, 'name') else category.get('name', '')
            cat_topics = category.topics if hasattr(category, 'topics') else category.get('topics', [])
            cat_inclusions = category.specific_inclusions if hasattr(category, 'specific_inclusions') else category.get('specific_inclusions', [])

            category_assocs = category_to_associations.get(cat_id, [])

            # Skip categories with no articles
            if not category_assocs:
                continue

            # Prepare article info from associations
            article_info = []
            for assoc in category_assocs[:15]:
                article = assoc.article
                if article:
                    article_info.append({
                        "title": article.title,
                        "authors": (article.authors or [])[:3],
                        "journal": article.journal,
                        "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
                        "abstract": (article.abstract or "")[:400],
                    })

            # Gather article summaries for this category
            article_summaries = [assoc.ai_summary for assoc in category_assocs if assoc.ai_summary]
            summaries_text = "\n\n".join([f"- {s}" for s in article_summaries])

            # Build category description
            category_description = f"{cat_name}. "
            if cat_inclusions:
                category_description += "Includes: " + ", ".join(cat_inclusions)

            items.append({
                "category_id": cat_id,
                "category_name": cat_name,
                "category_description": category_description,
                "category_topics": ", ".join(cat_topics) if cat_topics else "",
                "articles_count": str(len(category_assocs)),
                "articles_formatted": self.format_articles_for_prompt(article_info),
                "articles_summaries": summaries_text,
                "stream_name": stream.stream_name or "" if stream else "",
                "stream_purpose": stream.purpose or "" if stream else "",
            })

        return items

    def build_executive_summary_item(
        self,
        associations: List["ReportArticleAssociation"],
        category_summaries: Dict[str, str],
        stream: "ResearchStream",
        categories: Optional[List["Category"]] = None,
    ) -> Dict[str, Any]:
        """
        Build item dict for executive summary generation.

        Args:
            associations: List of ReportArticleAssociation with loaded article relationship
            category_summaries: Dict mapping category IDs to their summary text
            stream: ResearchStream for context
            categories: Optional list of Category objects for ID-to-name mapping

        Returns:
            Single item dict ready for generate_executive_summary()
        """
        # Prepare article info for prompt (limit to first 20 for context)
        article_info = []
        for assoc in associations[:20]:
            article = assoc.article
            if article:
                article_info.append({
                    "title": article.title,
                    "authors": (article.authors or [])[:3],
                    "journal": article.journal,
                    "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
                    "abstract": (article.abstract or "")[:500],
                })

        # Gather AI-generated article summaries
        article_summaries = [assoc.ai_summary for assoc in associations if assoc.ai_summary]
        article_summaries_text = "\n\n".join([f"- {s}" for s in article_summaries[:30]])

        # Build category ID to name mapping and get ordered category IDs
        category_id_to_name: Dict[str, str] = {}
        ordered_category_ids: List[str] = []
        if categories:
            for cat in categories:
                cat_id = cat.id if hasattr(cat, 'id') else cat.get('id')
                cat_name = cat.name if hasattr(cat, 'name') else cat.get('name', cat_id)
                if cat_id:
                    category_id_to_name[cat_id] = cat_name
                    ordered_category_ids.append(cat_id)

        # Format category summaries in presentation config order (same as category config screen)
        category_summaries_parts = []
        # First, add summaries for categories in config order
        for cat_id in ordered_category_ids:
            if cat_id in category_summaries:
                cat_name = category_id_to_name.get(cat_id, cat_id)
                category_summaries_parts.append(f"**{cat_name}**: {category_summaries[cat_id]}")
        # Then, add any remaining summaries not in config (e.g., uncategorized)
        for cat_id, summary in category_summaries.items():
            if cat_id not in ordered_category_ids:
                cat_name = category_id_to_name.get(cat_id, cat_id)
                category_summaries_parts.append(f"**{cat_name}**: {summary}")
        category_summaries_text = "\n\n".join(category_summaries_parts)

        return {
            "articles_count": str(len(associations)),
            "articles_formatted": self.format_articles_for_prompt(article_info, max_articles=20),
            "articles_summaries": article_summaries_text,
            "categories_count": str(len(category_summaries)),
            "categories_summaries": category_summaries_text,
            "stream_name": stream.stream_name or "" if stream else "",
            "stream_purpose": stream.purpose or "" if stream else "",
        }

    # =========================================================================
    # Formatting Helper Methods
    # =========================================================================

    @staticmethod
    def format_articles_for_prompt(articles: List[Dict[str, Any]], max_articles: int = 15) -> str:
        """
        Format articles for inclusion in LLM prompt.

        Args:
            articles: List of article dicts with title, authors, journal, publication_date, abstract
            max_articles: Maximum number of articles to include

        Returns:
            Formatted string for prompt
        """
        formatted = []
        for i, article in enumerate(articles[:max_articles], 1):
            authors = article.get("authors", [])
            if isinstance(authors, list):
                authors_str = ", ".join(authors) if authors else "Unknown"
                if len(authors) > 3:
                    authors_str = ", ".join(authors[:3]) + " et al."
            else:
                authors_str = str(authors) if authors else "Unknown"

            journal_year = []
            if article.get("journal"):
                journal_year.append(article["journal"])
            if article.get("publication_date"):
                journal_year.append(f"({article['publication_date']})")

            location = " ".join(journal_year) if journal_year else "Unknown source"

            formatted.append(f"{i}. {article.get('title', 'Untitled')}\n   {authors_str} - {location}")

            if article.get("abstract"):
                # Truncate abstract if too long
                abstract = article["abstract"]
                if len(abstract) > 400:
                    abstract = abstract[:400] + "..."
                formatted.append(f"   Abstract: {abstract}")

        return "\n\n".join(formatted)

    @staticmethod
    def format_authors(authors: Optional[Union[List[str], str]]) -> str:
        """
        Format authors list for display.

        Args:
            authors: List of author names or string

        Returns:
            Formatted authors string
        """
        if not authors:
            return "Unknown"
        if isinstance(authors, list):
            if len(authors) > 3:
                return ", ".join(authors[:3]) + " et al."
            return ", ".join(authors)
        return str(authors)
