"""
Article Categorization Service - AI-powered article categorization

This service provides article categorization capabilities using LLMs to assign
articles to presentation categories. Used by pipeline execution and can be used
standalone for ad-hoc categorization tasks.

Uses the unified call_llm interface for all LLM calls.
"""

from typing import List, Dict, Any, Optional, Union
import json
import logging

from agents.prompts.llm import call_llm, ModelConfig, LLMOptions, LLMResult
from schemas.research_stream import Category, CategorizationPrompt

logger = logging.getLogger(__name__)


# =============================================================================
# Default Prompts
# =============================================================================

SYSTEM_PROMPT = """You are categorizing research articles into presentation categories for user reports.

Your task is to analyze an article and determine which ONE category it belongs to.
Each article should be placed in exactly one category - choose the category that best fits the article's primary focus.

If the article clearly doesn't fit any category, return null for the category_id."""

USER_PROMPT_TEMPLATE = """Categorize this research article into one of the available categories.

## Article
Title: {title}
Abstract: {abstract}
Journal: {journal}
Published: {publication_date}

## Available Categories
{categories_json}

Analyze the article and select the single best-matching category ID, or null if no good fit."""

# Response schema for structured output
RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "category_id": {
            "type": ["string", "null"],
            "description": "The single category ID that best fits this article, or null if no good fit",
        }
    },
    "required": ["category_id"],
}


class ArticleCategorizationService:
    """Service for categorizing articles into presentation categories using LLM.

    Uses the unified call_llm interface for all LLM calls.
    Model selection is the responsibility of the caller.
    """

    # Default model configuration
    DEFAULT_MODEL = "gpt-4.1"
    DEFAULT_TEMPERATURE = 0.0

    def _get_default_model_config(self) -> ModelConfig:
        """Get default model configuration."""
        return ModelConfig(
            model=self.DEFAULT_MODEL,
            temperature=self.DEFAULT_TEMPERATURE,
        )

    async def categorize(
        self,
        items: Union[Dict[str, Any], List[Dict[str, Any]]],
        model_config: Optional[ModelConfig] = None,
        options: Optional[LLMOptions] = None,
        custom_prompt: Optional[CategorizationPrompt] = None,
    ) -> Union[LLMResult, List[LLMResult]]:
        """
        Categorize article(s) into presentation categories.

        Args:
            items: Single item dict or list of item dicts. Each dict should contain:
                - title: Article title
                - abstract: Article abstract
                - journal: Journal name (optional)
                - publication_date: Publication date (optional)
                - categories_json: JSON string of available categories
            model_config: Model configuration (model, temperature)
            options: Call options (max_concurrent, on_progress)
            custom_prompt: Optional custom prompt (uses defaults if None)

        Returns:
            Single item: LLMResult with .data containing {"category_id": "..."}
            List of items: List[LLMResult] in same order as input
        """
        # Determine if single or batch
        is_single = isinstance(items, dict)
        items_list = [items] if is_single else items

        if not items_list:
            return (
                LLMResult(input={}, data=None, error="No items provided")
                if is_single
                else []
            )

        # Apply default model config if not provided
        if model_config is None:
            model_config = self._get_default_model_config()

        # Apply default options if not provided
        if options is None:
            options = LLMOptions(max_concurrent=10)

        # Use custom prompt or defaults
        system_prompt = custom_prompt.system_prompt if custom_prompt else SYSTEM_PROMPT
        user_prompt = custom_prompt.user_prompt_template if custom_prompt else USER_PROMPT_TEMPLATE

        logger.info(f"categorize - items={len(items_list)}, model={model_config.model_id}, custom_prompt={custom_prompt is not None}")

        # Call LLM with structured response
        results = await call_llm(
            system_message=system_prompt,
            user_message=user_prompt,
            values=items_list[0] if is_single else items_list,
            model_config=model_config,
            response_schema=RESPONSE_SCHEMA,
            options=options,
        )

        return results

    # =========================================================================
    # Helper Methods
    # =========================================================================

    @staticmethod
    def get_default_prompts() -> Dict[str, str]:
        """Get the default system and user prompts."""
        return {
            "system_prompt": SYSTEM_PROMPT,
            "user_prompt_template": USER_PROMPT_TEMPLATE,
        }

    @staticmethod
    def get_available_slugs() -> List[Dict[str, str]]:
        """Get available slugs for categorization prompts."""
        return [
            {"slug": "{title}", "description": "Article title"},
            {"slug": "{abstract}", "description": "Article abstract"},
            {"slug": "{ai_summary}", "description": "AI-generated summary of the article (if available)"},
            {"slug": "{journal}", "description": "Journal name"},
            {"slug": "{publication_date}", "description": "Publication date"},
            {"slug": "{categories_json}", "description": "JSON array of available categories with id, name, topics, and specific_inclusions"},
        ]

    @staticmethod
    def prepare_category_definitions(categories: List[Category]) -> List[Dict]:
        """
        Convert Category schema objects to dictionary format for LLM.

        Args:
            categories: List of Category schema objects

        Returns:
            List of category dictionaries with id, name, topics, specific_inclusions
        """
        categories_desc = []
        for cat in categories:
            cat_info = {
                "id": cat.id,
                "name": cat.name,
                "topics": cat.topics,
                "specific_inclusions": cat.specific_inclusions,
            }
            categories_desc.append(cat_info)
        return categories_desc

    @staticmethod
    def format_categories_json(categories: List[Dict]) -> str:
        """
        Format category definitions as JSON string for prompt.

        Args:
            categories: List of category dictionaries

        Returns:
            JSON string representation
        """
        return json.dumps(categories, indent=2)
