"""
Prompt Testing Service

Handles business logic for:
- Prompt testing with sample data or reports
- Categorization testing

Default prompts are sourced from ReportSummaryService (single source of truth).
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional

from utils.date_utils import format_pub_date

from schemas.research_stream import EnrichmentConfig, PromptTemplate, CategorizationPrompt
from schemas.llm import ModelConfig, DEFAULT_MODEL_CONFIG
from services.report_summary_service import ReportSummaryService, DEFAULT_PROMPTS, AVAILABLE_SLUGS
from services.research_stream_service import ResearchStreamService
from services.report_service import ReportService
from services.report_article_association_service import ReportArticleAssociationService
from services.article_categorization_service import ArticleCategorizationService
from services.article_analysis_service import (
    get_stance_prompts,
    analyze_article_stance,
    build_stance_item,
    STANCE_SLUG_MAPPINGS,
)

logger = logging.getLogger(__name__)


class PromptTestingService:
    """Service for prompt workbench operations."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._summary_service = None  # Lazy-loaded - only needed for testing prompts
        self.stream_service = ResearchStreamService(db)
        self.report_service = ReportService(db)
        self.association_service = ReportArticleAssociationService(db)

    @property
    def summary_service(self) -> ReportSummaryService:
        """Lazy-load summary service only when needed (for LLM calls)"""
        if self._summary_service is None:
            self._summary_service = ReportSummaryService()
        return self._summary_service

    def _convert_to_prompt_templates(self, prompts_dict: Dict[str, Dict]) -> Dict[str, PromptTemplate]:
        """Convert dict-based prompts to PromptTemplate objects"""
        return {
            key: PromptTemplate(
                system_prompt=value["system_prompt"],
                user_prompt_template=value["user_prompt_template"]
            )
            for key, value in prompts_dict.items()
        }

    def get_defaults(self) -> Dict[str, Any]:
        """Get default prompts and available slugs"""
        return {
            "prompts": self._convert_to_prompt_templates(DEFAULT_PROMPTS),
            "available_slugs": AVAILABLE_SLUGS
        }

    async def get_enrichment_config(self, stream_id: int) -> Dict[str, Any]:
        """Get enrichment config for a stream"""
        raw_config = await self.stream_service.get_enrichment_config(stream_id)

        enrichment_config = None
        if raw_config:
            enrichment_config = EnrichmentConfig(**raw_config)

        return {
            "enrichment_config": enrichment_config,
            "is_using_defaults": enrichment_config is None,
            "defaults": self._convert_to_prompt_templates(DEFAULT_PROMPTS)
        }

    async def update_enrichment_config(
        self,
        stream_id: int,
        enrichment_config: Optional[EnrichmentConfig]
    ) -> None:
        """Update enrichment config for a stream"""
        config_dict = enrichment_config.dict() if enrichment_config else None
        logger.info(f"PromptTestingService.update_enrichment_config: stream_id={stream_id}, config_dict={config_dict}")
        await self.stream_service.update_enrichment_config(stream_id, config_dict)

    async def test_summary_prompt(
        self,
        prompt_type: str,
        prompt: PromptTemplate,
        user_id: int,
        sample_data: Optional[Dict[str, Any]] = None,
        report_id: Optional[int] = None,
        category_id: Optional[str] = None,
        article_index: Optional[int] = 0,
        llm_config: Optional[ModelConfig] = None
    ) -> Dict[str, Any]:
        """Test a summary prompt (executive, category, or article) with sample data or report data.

        Uses the same code path as the actual pipeline by calling the summary service methods.
        """
        # Build flat item dict (same format as pipeline)
        if report_id:
            item = await self._get_flat_item_from_report(
                report_id, user_id, prompt_type, category_id, article_index
            )
        elif sample_data:
            # sample_data should already be flat format
            item = sample_data
        else:
            raise ValueError("Either sample_data or report_id must be provided")

        # Build enrichment_config with custom prompt
        enrichment_config = EnrichmentConfig(
            prompts={
                prompt_type: PromptTemplate(
                    system_prompt=prompt.system_prompt,
                    user_prompt_template=prompt.user_prompt_template
                )
            }
        )

        # Call appropriate summary service method (same path as pipeline)
        if prompt_type == "article_summary":
            result = await self.summary_service.generate_article_summary(
                items=item,
                enrichment_config=enrichment_config,
                model_config=llm_config,
            )
        elif prompt_type == "category_summary":
            result = await self.summary_service.generate_category_summary(
                items=item,
                enrichment_config=enrichment_config,
                model_config=llm_config,
            )
        elif prompt_type == "executive_summary":
            result = await self.summary_service.generate_executive_summary(
                items=item,
                enrichment_config=enrichment_config,
                model_config=llm_config,
            )
        else:
            raise ValueError(f"Unknown prompt type: {prompt_type}")

        # For display, render prompts with nested slugs for user readability
        nested_context = self._flat_to_nested_context(item, prompt_type)
        rendered_system = self._render_prompt(prompt.system_prompt, nested_context)
        rendered_user = self._render_prompt(prompt.user_prompt_template, nested_context)

        return {
            "rendered_system_prompt": rendered_system,
            "rendered_user_prompt": rendered_user,
            "llm_response": result.data if result.ok else None,
            "error": result.error if not result.ok else None
        }

    async def _get_flat_item_from_report(
        self,
        report_id: int,
        user_id: int,
        prompt_type: str,
        category_id: Optional[str] = None,
        article_index: Optional[int] = 0
    ) -> Dict[str, Any]:
        """Get flat item dict from report (same format as pipeline passes to summary service).

        Delegates to ReportSummaryService.build_*_items methods (single source of truth).
        """
        # Get the report with articles (includes access check)
        result = await self.report_service.get_report_with_articles(user_id, report_id)
        if not result:
            raise PermissionError("Report not found or you don't have access")

        report = result.report
        articles = result.articles  # List[ReportArticleInfo]

        # Get stream for config access
        stream = await self.stream_service.get_stream_by_id(report.research_stream_id)

        # Extract associations from ReportArticleInfo - this is what ReportSummaryService expects
        associations = [info.association for info in articles]

        # Get categories from stream for ID-to-name mapping
        categories = stream.presentation_config.get('categories', []) if stream.presentation_config else []

        if prompt_type == "executive_summary":
            # Get category summaries from report enrichments
            category_summaries = report.enrichments.get('category_summaries', {}) if report.enrichments else {}
            return self.summary_service.build_executive_summary_item(
                associations=associations,
                category_summaries=category_summaries,
                stream=stream,
                categories=categories,
            )
        elif prompt_type == "category_summary":
            if not category_id:
                raise ValueError("category_id is required for category_summary prompt type")
            # Build all category items and find the one we need
            items = self.summary_service.build_category_summary_items(
                associations=associations,
                categories=categories,
                stream=stream,
            )
            # Find the item for the requested category
            item = next((i for i in items if i.get("category_id") == category_id), None)
            if not item:
                raise ValueError(f"Category {category_id} not found or has no articles")
            return item
        elif prompt_type == "article_summary":
            # Build all article items and find the one at the requested index
            items = self.summary_service.build_article_summary_items(
                associations=associations,
                stream=stream,
            )
            if not items:
                raise ValueError("No articles available for testing")
            # Clamp article_index to valid range
            idx = article_index or 0
            if idx < 0 or idx >= len(items):
                idx = 0
            return items[idx]
        else:
            raise ValueError(f"Unknown prompt type: {prompt_type}")

    def _render_prompt(self, template: str, context: Dict[str, Any]) -> str:
        """Render a prompt template by replacing slugs with context values"""
        result = template

        for top_key, top_value in context.items():
            if isinstance(top_value, dict):
                for sub_key, sub_value in top_value.items():
                    slug = f"{{{top_key}.{sub_key}}}"
                    if isinstance(sub_value, list):
                        result = result.replace(slug, ", ".join(str(v) for v in sub_value))
                    else:
                        result = result.replace(slug, str(sub_value))
            else:
                slug = f"{{{top_key}}}"
                result = result.replace(slug, str(top_value))

        return result

    def _flat_to_nested_context(self, flat_item: Dict[str, Any], prompt_type: str) -> Dict[str, Any]:
        """Convert flat item dict to nested context for rendering display prompts.

        Maps flat keys (used by pipeline) back to nested slugs (used in UI).
        """
        if prompt_type == "article_summary":
            return {
                "stream": {
                    "name": flat_item.get("stream_name", ""),
                    "purpose": flat_item.get("stream_purpose", ""),
                },
                "article": {
                    "title": flat_item.get("title", ""),
                    "authors": flat_item.get("authors", ""),
                    "journal": flat_item.get("journal", ""),
                    "publication_date": flat_item.get("publication_date", ""),
                    "abstract": flat_item.get("abstract", ""),
                    "filter_reason": flat_item.get("filter_reason", ""),
                }
            }
        elif prompt_type == "category_summary":
            return {
                "stream": {
                    "name": flat_item.get("stream_name", ""),
                    "purpose": flat_item.get("stream_purpose", ""),
                },
                "category": {
                    "name": flat_item.get("category_name", ""),
                    "description": flat_item.get("category_description", ""),
                    "topics": flat_item.get("category_topics", ""),
                },
                "articles": {
                    "count": flat_item.get("articles_count", ""),
                    "formatted": flat_item.get("articles_formatted", ""),
                    "summaries": flat_item.get("articles_summaries", ""),
                }
            }
        elif prompt_type == "executive_summary":
            return {
                "stream": {
                    "name": flat_item.get("stream_name", ""),
                    "purpose": flat_item.get("stream_purpose", ""),
                },
                "articles": {
                    "count": flat_item.get("articles_count", ""),
                    "formatted": flat_item.get("articles_formatted", ""),
                    "summaries": flat_item.get("articles_summaries", ""),
                },
                "categories": {
                    "count": flat_item.get("categories_count", ""),
                    "summaries": flat_item.get("categories_summaries", ""),
                }
            }
        else:
            return flat_item

    # =========================================================================
    # Categorization Prompt Testing
    # =========================================================================

    async def test_categorization_prompt(
        self,
        prompt: CategorizationPrompt,
        user_id: int,
        sample_data: Optional[Dict[str, Any]] = None,
        report_id: Optional[int] = None,
        article_index: int = 0,
        llm_config: Optional[ModelConfig] = None
    ) -> Dict[str, Any]:
        """
        Test a categorization prompt with sample data or an article from a report.

        Args:
            prompt: The categorization prompt to test
            user_id: User ID for access verification
            sample_data: Optional sample data with title, abstract, journal, publication_date, categories_json
            report_id: Optional report ID to get an article from
            article_index: Which article to use from the report (default: first)

        Returns:
            Dict with rendered_system_prompt, rendered_user_prompt, llm_response,
            parsed_category_id, and error (if any)
        """
        import json

        if not sample_data and not report_id:
            raise ValueError("Either sample_data or report_id must be provided")

        # Get sample data from report if needed
        if report_id:
            sample_data = await self._get_categorization_context_from_report(
                report_id, user_id, article_index
            )

        assert sample_data is not None  # Validated above

        # Render prompts
        rendered_system = prompt.system_prompt
        rendered_user = prompt.user_prompt_template
        for key, value in sample_data.items():
            rendered_user = rendered_user.replace(f"{{{key}}}", str(value))

        # Call categorization service
        categorization_service = ArticleCategorizationService()

        result = await categorization_service.categorize(
            items=sample_data,
            model_config=llm_config,
            custom_prompt=prompt
        )

        # Extract response
        llm_response = None
        parsed_category_id = None
        error = None

        if result.error:
            error = result.error
        elif result.data:
            parsed_category_id = result.data.get("category_id")
            llm_response = json.dumps(result.data, indent=2)

        return {
            "rendered_system_prompt": rendered_system,
            "rendered_user_prompt": rendered_user,
            "llm_response": llm_response,
            "parsed_category_id": parsed_category_id,
            "error": error
        }

    async def _get_categorization_context_from_report(
        self,
        report_id: int,
        user_id: int,
        article_index: int = 0
    ) -> Dict[str, Any]:
        """
        Get categorization context data from an existing report.

        Args:
            report_id: Report ID
            user_id: User ID for access verification
            article_index: Which article to use (0-indexed)

        Returns:
            Dict with title, abstract, journal, publication_date, categories_json
        """
        import json

        # Get the report with access check (returns report, user, stream)
        try:
            result = await self.report_service.get_report_with_access(
                report_id, user_id, raise_on_not_found=True
            )
            _, _, stream = result
        except Exception:
            raise PermissionError("You don't have access to this report")

        # Get visible articles via the association service
        associations = await self.association_service.get_visible_for_report(report_id)

        if not associations:
            raise ValueError("Report has no articles")

        # Get the requested article
        if article_index >= len(associations):
            article_index = 0

        assoc = associations[article_index]
        article = assoc.article

        if not article:
            raise ValueError("Article not found")

        # Get categories from stream presentation_config (it's a dict from JSON column)
        categories_for_context = []
        if stream.presentation_config and isinstance(stream.presentation_config, dict):
            categories = stream.presentation_config.get("categories", [])
            if categories:
                # Categories are already dicts with id, name, topics, specific_inclusions
                # Just extract the fields we need for the LLM context
                categories_for_context = [
                    {
                        "id": cat.get("id", ""),
                        "name": cat.get("name", ""),
                        "topics": cat.get("topics", []),
                        "specific_inclusions": cat.get("specific_inclusions", []),
                    }
                    for cat in categories
                ]

        return {
            "title": article.title or "",
            "abstract": article.abstract or "",
            "ai_summary": assoc.ai_summary or "",  # Include AI summary if available
            "journal": article.journal or "",
            "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
            "categories_json": json.dumps(categories_for_context, indent=2)
        }

    async def test_stance_analysis_prompt(
        self,
        prompt: PromptTemplate,
        user_id: int,
        sample_data: Optional[Dict[str, Any]] = None,
        report_id: Optional[int] = None,
        article_index: int = 0,
        llm_config: Optional[ModelConfig] = None
    ) -> Dict[str, Any]:
        """
        Test a stance analysis prompt with sample data or an article from a report.

        Args:
            prompt: The stance analysis prompt to test
            user_id: User ID for access verification
            sample_data: Optional sample data with article fields
            report_id: Optional report ID to get an article from
            article_index: Which article to use from the report (default: first)
            llm_config: Optional LLM configuration

        Returns:
            Dict with rendered_system_prompt, rendered_user_prompt, llm_response,
            parsed_stance, and error (if any)
        """
        import json

        if not sample_data and not report_id:
            raise ValueError("Either sample_data or report_id must be provided")

        # Get sample data from report if needed
        if report_id:
            sample_data = await self._get_stance_analysis_context_from_report(
                report_id, user_id, article_index
            )

        assert sample_data is not None  # Validated above

        # Convert frontend slugs to flat keys in the prompt
        system_prompt = prompt.system_prompt
        user_prompt = prompt.user_prompt_template
        for old_slug, new_placeholder in STANCE_SLUG_MAPPINGS.items():
            system_prompt = system_prompt.replace(old_slug, new_placeholder)
            user_prompt = user_prompt.replace(old_slug, new_placeholder)

        # Render prompts with actual values
        rendered_system = system_prompt
        rendered_user = user_prompt
        for key, value in sample_data.items():
            rendered_user = rendered_user.replace(f"{{{key}}}", str(value))

        # Build item using helper - wrap sample_data in SimpleNamespace for attribute access
        from types import SimpleNamespace

        # Parse year from string if needed (check new key first, fall back to legacy)
        year = sample_data.get("article_publication_date") or sample_data.get("article_year")
        if isinstance(year, str) and year.isdigit():
            year = int(year)
        elif not isinstance(year, int):
            year = None

        # Parse authors from string if needed
        authors = sample_data.get("article_authors")
        if isinstance(authors, str):
            authors = [a.strip() for a in authors.split(",")] if authors else None

        stream_obj = SimpleNamespace(
            stream_name=sample_data.get("stream_name", ""),
            purpose=sample_data.get("stream_purpose"),
        )
        article_obj = SimpleNamespace(
            title=sample_data.get("article_title"),
            authors=authors,
            journal=sample_data.get("article_journal"),
            pub_year=year,
            pub_month=None,
            pub_day=None,
            abstract=sample_data.get("article_abstract"),
        )
        item = build_stance_item(stream_obj, article_obj, sample_data.get("article_summary"))

        # Call stance analysis
        llm_result = await analyze_article_stance(
            items=item,
            stance_analysis_prompt={
                "system_prompt": system_prompt,
                "user_prompt_template": user_prompt
            },
            model_config=llm_config,
        )

        # Format response
        llm_response = None
        parsed_stance = None
        error = None

        if not llm_result.ok:
            error = llm_result.error
        elif llm_result.data:
            parsed_stance = llm_result.data.get("stance")
            llm_response = json.dumps(llm_result.data, indent=2)

        return {
            "rendered_system_prompt": rendered_system,
            "rendered_user_prompt": rendered_user,
            "llm_response": llm_response,
            "parsed_stance": parsed_stance,
            "error": error
        }

    async def _get_stance_analysis_context_from_report(
        self,
        report_id: int,
        user_id: int,
        article_index: int = 0
    ) -> Dict[str, Any]:
        """
        Get stance analysis context data from an existing report.

        Args:
            report_id: Report ID
            user_id: User ID for access verification
            article_index: Which article to use (0-indexed)

        Returns:
            Dict with article and stream fields for stance analysis
        """
        # Get the report with access check (returns report, user, stream)
        try:
            result = await self.report_service.get_report_with_access(
                report_id, user_id, raise_on_not_found=True
            )
            _, _, stream = result
        except Exception:
            raise PermissionError("You don't have access to this report")

        # Get visible articles via the association service
        associations = await self.association_service.get_visible_for_report(report_id)

        if not associations:
            raise ValueError("Report has no articles")

        # Get the requested article
        if article_index >= len(associations):
            article_index = 0

        assoc = associations[article_index]
        article = assoc.article

        if not article:
            raise ValueError("Article not found")

        # Format authors
        authors_str = ""
        if article.authors:
            if len(article.authors) > 3:
                authors_str = ", ".join(article.authors[:3]) + " et al."
            else:
                authors_str = ", ".join(article.authors)

        return {
            "stream_name": stream.stream_name or "",
            "stream_purpose": stream.purpose or "",
            "article_title": article.title or "",
            "article_authors": authors_str,
            "article_journal": article.journal or "",
            "article_publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
            "article_abstract": article.abstract or "",
            "article_summary": assoc.ai_summary or "",
        }


# Dependency injection provider for prompt testing service
from fastapi import Depends
from database import get_async_db


async def get_prompt_testing_service(
    db: AsyncSession = Depends(get_async_db)
) -> PromptTestingService:
    """Get a PromptTestingService instance with async database session."""
    return PromptTestingService(db)
