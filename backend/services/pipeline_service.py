"""
Pipeline Service - Orchestrates end-to-end test execution of research streams

This service coordinates:
1. Retrieval: Execute broad search queries from PubMed
2. Deduplication (query-level): Find duplicates within each query
3. Semantic Filtering: Apply AI-powered relevance filters per query
4. Deduplication (global): Find duplicates across all filtered results
5. Categorization: Assign articles to presentation categories using LLM
6. Summary Generation: Generate executive summary and per-category summaries using LLM
7. Report Generation: Save results to reports and report_article_associations tables

All intermediate results are stored in wip_articles table for audit trail and debugging.

Retrieval Strategy:
- Broad Search: 1-3 simple, wide-net queries optimized for weekly monitoring
- Note: Concept-based retrieval is not supported
"""

from typing import AsyncGenerator, Dict, List, Optional, Tuple, Any, Callable, Coroutine
from dataclasses import dataclass, field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, or_, select
from datetime import date, datetime
import asyncio
import json
import uuid
import logging

from utils.date_utils import format_pub_date

logger = logging.getLogger(__name__)

# Type alias for progress callbacks
ProgressCallback = Callable[[int, int], Coroutine[Any, Any, None]]

from models import (
    ResearchStream,
    Report,
    Article,
    WipArticle,
    RunType,
    PipelineExecution,
)
from schemas.research_stream import RetrievalConfig, PresentationConfig, BroadQuery, Category, EnrichmentConfig, ArticleAnalysisConfig
from schemas.llm import StageConfig, PipelineLLMConfig, get_stage_config, ModelConfig
from services.pubmed_service import PubMedService
from services.ai_evaluation_service import get_ai_evaluation_service
from agents.prompts.llm import LLMOptions
from services.article_categorization_service import ArticleCategorizationService
from services.research_stream_service import ResearchStreamService
from services.report_summary_service import ReportSummaryService
from services.wip_article_service import WipArticleService
from services.report_service import ReportService
from services.report_article_association_service import ReportArticleAssociationService
from services.article_service import ArticleService
from services.execution_service import ExecutionService


@dataclass
class PipelineContext:
    """
    Context object passed between pipeline stages.

    Immutable fields are set during config loading.
    Mutable fields are updated as stages execute.
    """

    # === Immutable (set during config loading) ===
    execution_id: str
    execution: "PipelineExecution"
    stream: "ResearchStream"
    research_stream_id: int
    user_id: int
    start_date: Optional[str]
    end_date: Optional[str]
    report_name: Optional[str]
    queries: List[BroadQuery]
    categories: List[Category]
    presentation_config: PresentationConfig
    enrichment_config: Optional[EnrichmentConfig]
    llm_config: Optional[PipelineLLMConfig]
    article_analysis_config: Optional[ArticleAnalysisConfig]

    # === Mutable (accumulated during execution) ===
    total_retrieved: int = 0
    filter_stats: Dict[str, Dict[str, int]] = field(default_factory=dict)
    global_duplicates: int = 0
    included_count: int = 0
    categorized_count: int = 0
    categorize_errors: int = 0
    stance_analyzed_count: int = 0
    stance_analysis_errors: int = 0
    executive_summary: str = ""
    category_summaries: Dict[str, str] = field(default_factory=dict)
    report: Optional["Report"] = None

    def final_metrics(self) -> Dict[str, Any]:
        """Build metrics dict for completion status."""
        return {
            "report_id": self.report.report_id if self.report else None,
            "total_retrieved": self.total_retrieved,
            "final_article_count": self.included_count,  # Use tracked count to avoid lazy load
            "filter_stats": self.filter_stats,
            "global_duplicates": self.global_duplicates,
            "included_count": self.included_count,
            "categorized_count": self.categorized_count,
        }


class PipelineStatus:
    """Status update yielded during pipeline execution"""

    def __init__(self, stage: str, message: str, data: Optional[Dict] = None):
        self.stage = stage
        self.message = message
        self.data = data or {}
        self.timestamp = datetime.utcnow().isoformat()

    def to_dict(self):
        return {
            "stage": self.stage,
            "message": self.message,
            "data": self.data,
            "timestamp": self.timestamp,
        }


class PipelineService:
    """Orchestrates end-to-end pipeline execution for research streams"""

    # Hard limits to prevent runaway execution
    MAX_ARTICLES_PER_SOURCE = 1000
    MAX_TOTAL_ARTICLES = 1000

    def __init__(self, db: AsyncSession):
        self.db = db
        self.research_stream_service = ResearchStreamService(db)
        self.wip_article_service = WipArticleService(db)
        self.report_service = ReportService(db)
        self.association_service = ReportArticleAssociationService(db)
        self.article_service = ArticleService(db)
        self.execution_service = ExecutionService(db)
        self.pubmed_service = PubMedService()
        self.eval_service = get_ai_evaluation_service()
        self.categorization_service = ArticleCategorizationService()
        self.summary_service = ReportSummaryService()

    # =========================================================================
    # ENTITY LOOKUPS
    # =========================================================================

    async def get_execution_by_id(self, execution_id: str) -> PipelineExecution:
        """
        Get a pipeline execution by ID, raising ValueError if not found.

        Args:
            execution_id: The execution ID (UUID string)

        Returns:
            PipelineExecution model instance

        Raises:
            ValueError: if execution not found
        """
        return await self.execution_service.get_by_id_or_raise(execution_id)

    # =========================================================================
    # MODEL CONFIGURATION HELPERS
    # =========================================================================

    def _get_llm_options(self, stage_config: StageConfig, on_progress: Optional[callable] = None) -> LLMOptions:
        """
        Create LLMOptions from a StageConfig.

        Args:
            stage_config: Stage configuration with max_concurrent
            on_progress: Optional progress callback

        Returns:
            LLMOptions ready to pass to services
        """
        return LLMOptions(
            max_concurrent=stage_config.max_concurrent,
            on_progress=on_progress,
        )

    # =========================================================================
    # PIPELINE ORCHESTRATION
    # =========================================================================

    async def _stream_with_progress(
        self,
        task_coro: Coroutine,
        stage: str,
        progress_msg_template: str = "Processing: {completed}/{total}",
        heartbeat_msg: str = "Processing...",
        extra_data: Optional[Dict] = None,
        progress_interval: int = 5,
        heartbeat_timeout: float = 3.0,
    ) -> AsyncGenerator[Tuple[PipelineStatus, Any], None]:
        """
        Run a long-running task while yielding progress updates.

        The task should accept an `on_progress` callback as a keyword argument.
        Yields (status, None) during progress, then (final_status, result) at end.

        Args:
            task_coro: Coroutine that accepts on_progress callback
            stage: Stage name for status messages
            progress_msg_template: Message template with {completed} and {total}
            heartbeat_msg: Message for heartbeat status
            extra_data: Extra data to include in all status messages
            progress_interval: Report progress every N items
            heartbeat_timeout: Seconds to wait before yielding heartbeat
        """
        progress_queue: asyncio.Queue[Tuple[int, int]] = asyncio.Queue()
        extra = extra_data or {}

        async def progress_callback(completed: int, total: int):
            if (
                completed == 1
                or completed == total
                or completed % progress_interval == 0
            ):
                await progress_queue.put((completed, total))

        # Start the task - inject the progress callback
        task = asyncio.create_task(task_coro(on_progress=progress_callback))

        # Yield progress updates while task runs
        while not task.done():
            try:
                completed, total = await asyncio.wait_for(
                    progress_queue.get(), timeout=heartbeat_timeout
                )
                yield PipelineStatus(
                    stage,
                    progress_msg_template.format(completed=completed, total=total),
                    {"completed": completed, "total": total, **extra},
                ), None
            except asyncio.TimeoutError:
                yield PipelineStatus(
                    stage, heartbeat_msg, {"heartbeat": True, **extra}
                ), None

        # Drain remaining progress
        while not progress_queue.empty():
            try:
                progress_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        # Get result and yield final status with it
        result = await task
        yield PipelineStatus(stage, "Complete", extra), result

    async def _load_execution_context(self, execution_id: str) -> PipelineContext:
        """
        Load execution record and build PipelineContext.

        Raises ValueError if execution not found or configuration invalid.
        """
        # Load execution record (single source of truth)
        execution = await self.get_execution_by_id(execution_id)

        # Load stream for context (name, purpose, etc.)
        stream = await self.research_stream_service.get_stream_by_id(execution.stream_id)

        # Parse retrieval config from execution snapshot
        retrieval_config = RetrievalConfig.model_validate(execution.retrieval_config)

        # Validate retrieval strategy
        if retrieval_config.concepts and len(retrieval_config.concepts) > 0:
            raise ValueError(
                "Concept-based retrieval is not supported in pipeline execution"
            )

        if (
            not retrieval_config.broad_search
            or not retrieval_config.broad_search.queries
        ):
            raise ValueError("No broad search queries configured")

        # Parse presentation config
        presentation_config = PresentationConfig.model_validate(
            execution.presentation_config
        )

        # Parse enrichment_config from execution snapshot
        enrichment_config = None
        if execution.enrichment_config:
            enrichment_config = EnrichmentConfig.model_validate(execution.enrichment_config)

        # Parse llm_config from execution snapshot
        llm_config = None
        if execution.llm_config:
            try:
                llm_config = PipelineLLMConfig.model_validate(execution.llm_config)
            except Exception as e:
                logger.warning(f"Failed to parse llm_config, using defaults: {e}")

        # Parse article_analysis_config from execution snapshot
        article_analysis_config = None
        if execution.article_analysis_config:
            try:
                article_analysis_config = ArticleAnalysisConfig.model_validate(execution.article_analysis_config)
            except Exception as e:
                logger.warning(f"Failed to parse article_analysis_config, skipping stance analysis: {e}")

        return PipelineContext(
            execution_id=execution_id,
            execution=execution,
            stream=stream,
            research_stream_id=execution.stream_id,
            user_id=execution.user_id,
            start_date=execution.start_date,
            end_date=execution.end_date,
            report_name=execution.report_name,
            queries=retrieval_config.broad_search.queries,
            categories=presentation_config.categories or [],
            presentation_config=presentation_config,
            enrichment_config=enrichment_config,
            llm_config=llm_config,
            article_analysis_config=article_analysis_config,
        )

    async def run_pipeline_direct(
        self,
        stream_id: int,
        user_id: int,
        run_type: RunType = RunType.TEST,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        report_name: Optional[str] = None,
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Execute the pipeline directly (bypassing worker) with SSE streaming.

        Creates a PipelineExecution record with status=RUNNING so the worker
        won't pick it up, then runs the pipeline in the current process.

        This is the "test run" flow for synchronous execution with real-time
        progress updates via SSE.

        Args:
            stream_id: Research stream ID
            user_id: User triggering the run
            run_type: Type of run (defaults to TEST)
            start_date: Start date for retrieval (YYYY-MM-DD or YYYY/MM/DD)
            end_date: End date for retrieval (YYYY-MM-DD or YYYY/MM/DD)
            report_name: Optional custom report name

        Yields:
            PipelineStatus: Status updates at each stage
        """
        from models import ExecutionStatus

        yield PipelineStatus("init", "Creating execution record...")

        # Load stream to get configuration (raises ValueError if not found)
        stream = await self.research_stream_service.get_stream_by_id(stream_id)

        # Normalize date format (accept both YYYY/MM/DD and YYYY-MM-DD)
        if start_date:
            start_date = start_date.replace("/", "-")
        if end_date:
            end_date = end_date.replace("/", "-")

        # Create execution with RUNNING status (worker only picks up PENDING)
        execution = await self.execution_service.create_from_stream(
            stream=stream,
            run_type=run_type,
            start_date=start_date,
            end_date=end_date,
            report_name=report_name,
            status=ExecutionStatus.RUNNING  # Worker ignores RUNNING executions
        )
        await self.db.commit()

        execution_id = execution.id
        logger.info(f"Created direct execution {execution_id} for stream {stream_id}")

        yield PipelineStatus(
            "init",
            f"Execution {execution_id} created",
            {"execution_id": execution_id, "stream_id": stream_id}
        )

        try:
            # Run the pipeline
            async for status in self.run_pipeline(execution_id):
                yield status

            # Mark as completed
            await self.execution_service.mark_completed(execution_id)
            await self.db.commit()

        except Exception as e:
            # Mark as failed
            logger.error(f"Direct pipeline execution {execution_id} failed: {e}", exc_info=True)
            try:
                await self.execution_service.mark_failed(execution_id, str(e))
                await self.db.commit()
            except Exception as inner_e:
                logger.error(f"Failed to mark execution as failed: {inner_e}")
            raise

    async def run_pipeline(
        self, execution_id: str
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Execute the full pipeline for a research stream and yield status updates.

        ALL configuration is read from the PipelineExecution record.
        Each stage is independently testable and owns its commit.

        Args:
            execution_id: The PipelineExecution ID - ALL config is read from this record

        Yields:
            PipelineStatus: Status updates at each stage
        """
        try:
            # Load configuration
            yield PipelineStatus("init", "Loading execution configuration...")
            ctx = await self._load_execution_context(execution_id)
            logger.info(
                f"Starting pipeline for execution_id={execution_id}, stream_id={ctx.research_stream_id}"
            )

            yield PipelineStatus(
                "init",
                "Configuration loaded",
                {
                    "execution_id": execution_id,
                    "stream_name": ctx.stream.stream_name,
                    "num_queries": len(ctx.queries),
                    "num_categories": len(ctx.categories),
                    "date_range": f"{ctx.start_date} to {ctx.end_date}",
                },
            )

            # Execute pipeline stages
            async for status in self._stage_retrieval(ctx):
                yield status
            async for status in self._stage_deduplicate(ctx):
                yield status
            async for status in self._stage_semantic_filter(ctx):
                yield status
            async for status in self._stage_generate_report(ctx):
                yield status  # Creates bare associations
            async for status in self._stage_generate_article_summaries(ctx):
                yield status  # Writes ai_summary to associations (needed for categorization)
            async for status in self._stage_stance_analysis(ctx):
                yield status  # Writes stance analysis to ai_enrichments (uses ai_summary)
            async for status in self._stage_categorize(ctx):
                yield status  # Writes categories to associations (can use ai_summary)
            async for status in self._stage_generate_category_summaries(ctx):
                yield status  # Category summaries
            async for status in self._stage_generate_executive_summary(ctx):
                yield status  # Executive summary

            # Complete
            yield PipelineStatus(
                "complete", "Pipeline execution complete", ctx.final_metrics()
            )

        except Exception as e:
            logger.error(
                f"Pipeline failed for execution_id={execution_id}: {type(e).__name__}: {str(e)}",
                exc_info=True,
            )
            yield PipelineStatus(
                "error",
                f"Pipeline failed: {str(e)}",
                {"error": str(e), "error_type": type(e).__name__},
            )
            raise

    # =========================================================================
    # PIPELINE STAGES
    # =========================================================================

    async def _stage_retrieval(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Execute retrieval for each broad search query.
        Commits: WipArticle records for all retrieved articles.
        """
        yield PipelineStatus(
            "retrieval",
            f"Starting retrieval for {len(ctx.queries)} queries",
            {"num_queries": len(ctx.queries)},
        )

        for query in ctx.queries:
            # Check limits
            if ctx.total_retrieved >= self.MAX_TOTAL_ARTICLES:
                yield PipelineStatus(
                    "retrieval",
                    f"Hit MAX_TOTAL_ARTICLES limit ({self.MAX_TOTAL_ARTICLES})",
                    {"limit_reached": True},
                )
                break

            yield PipelineStatus(
                "retrieval",
                f"Fetching: {query.search_terms}",
                {
                    "query_id": query.query_id,
                    "query_expression": query.query_expression,
                },
            )

            count = await self._fetch_and_store_articles(
                research_stream_id=ctx.research_stream_id,
                execution_id=ctx.execution_id,
                retrieval_unit_id=query.query_id,
                source_id=query.source_id,
                query_expression=query.query_expression,
                start_date=ctx.start_date,
                end_date=ctx.end_date,
            )

            ctx.total_retrieved += count

            yield PipelineStatus(
                "retrieval",
                f"Retrieved {count} articles",
                {
                    "query_id": query.query_id,
                    "count": count,
                    "total": ctx.total_retrieved,
                },
            )

        yield PipelineStatus(
            "retrieval",
            f"Retrieval complete: {ctx.total_retrieved} articles",
            {"total_retrieved": ctx.total_retrieved},
        )

    async def _stage_semantic_filter(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Apply semantic filters to retrieved articles.
        Commits: Filter scores and pass/fail decisions on WipArticles.
        """
        yield PipelineStatus("filter", "Applying semantic filters...")

        # Get configuration for semantic filter stage
        stage_config = get_stage_config(ctx.llm_config, "semantic_filter")

        for query in ctx.queries:
            if not query.semantic_filter.enabled:
                # When filter is disabled, mark all non-duplicate articles as passed
                articles = await self.wip_article_service.get_for_filtering(
                    ctx.execution_id, query.query_id
                )
                count = await self.wip_article_service.bulk_update_filter_bypassed(articles)

                yield PipelineStatus(
                    "filter",
                    f"Filter disabled - {count} articles auto-passed",
                    {"query_id": query.query_id, "filtered": False, "auto_passed": count},
                )
                continue

            # Capture query-specific values for lambda closure
            q = query  # Avoid closure over loop variable

            # Stream progress while filtering
            result = None
            async for status, res in self._stream_with_progress(
                task_coro=lambda on_progress, q=q, cfg=stage_config: self._apply_semantic_filter(
                    execution_id=ctx.execution_id,
                    retrieval_unit_id=q.query_id,
                    filter_criteria=q.semantic_filter.criteria,
                    threshold=q.semantic_filter.threshold,
                    stage_config=cfg,
                    on_progress=on_progress,
                ),
                stage="filter",
                progress_msg_template="Filtering: {completed}/{total}",
                heartbeat_msg="Processing...",
                extra_data={"query_id": query.query_id},
            ):
                if res is not None:
                    result = res
                else:
                    yield status

            passed, rejected, errors = result
            ctx.filter_stats[query.query_id] = {"passed": passed, "rejected": rejected, "errors": errors}

            yield PipelineStatus(
                "filter",
                f"Filtered: {passed} passed, {rejected} rejected",
                {"query_id": query.query_id, "passed": passed, "rejected": rejected},
            )

        # Mark articles for inclusion (after filtering completes)
        ctx.included_count = await self._mark_articles_for_report(ctx.execution_id)
        await self.wip_article_service.commit()

        yield PipelineStatus(
            "filter",
            f"Semantic filtering complete. {ctx.included_count} articles marked for inclusion.",
            {"stats": ctx.filter_stats, "included": ctx.included_count}
        )

    async def _stage_deduplicate(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Deduplicate globally (runs before semantic filtering).
        Commits: Duplicate flags on WipArticles.
        """
        yield PipelineStatus("dedup_global", "Deduplicating against previous reports and within execution...")

        historical_dupes, execution_dupes = await self._deduplicate_globally(
            ctx.research_stream_id, ctx.execution_id
        )
        ctx.global_duplicates = historical_dupes + execution_dupes

        # Stage commit
        await self.wip_article_service.commit()

        yield PipelineStatus(
            "dedup_global",
            f"Found {ctx.global_duplicates} duplicates ({historical_dupes} from previous reports, {execution_dupes} within execution)",
            {"duplicates": ctx.global_duplicates, "historical": historical_dupes, "within_execution": execution_dupes},
        )

    async def _stage_categorize(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Categorize articles into presentation categories.
        Commits: presentation_categories on ReportArticleAssociations.

        Requires: Report must already exist (ctx.report populated).
        """
        yield PipelineStatus("categorize", "Categorizing articles...")

        # Get configuration for categorization stage
        stage_config = get_stage_config(ctx.llm_config, "categorization")

        # Stream progress while categorizing
        result = None
        async for status, res in self._stream_with_progress(
            task_coro=lambda on_progress, cfg=stage_config: self._categorize_articles(
                report_id=ctx.report.report_id,
                presentation_config=ctx.presentation_config,
                stage_config=cfg,
                on_progress=on_progress,
            ),
            stage="categorize",
            progress_msg_template="Categorizing: {completed}/{total}",
            heartbeat_msg="Processing...",
        ):
            if res is not None:
                result = res
            else:
                yield status

        ctx.categorized_count, ctx.categorize_errors = result

        if ctx.categorize_errors > 0:
            yield PipelineStatus(
                "categorize",
                f"Categorized {ctx.categorized_count} articles ({ctx.categorize_errors} failed)",
                {"categorized": ctx.categorized_count, "errors": ctx.categorize_errors},
            )
        else:
            yield PipelineStatus(
                "categorize",
                f"Categorized {ctx.categorized_count} articles",
                {"categorized": ctx.categorized_count},
            )

    async def _stage_generate_article_summaries(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Generate AI summaries for individual articles.
        Commits: ai_summary written to ReportArticleAssociation.
        """
        # Use enrichment_config from execution snapshot
        enrichment_config = ctx.enrichment_config

        # Get configuration for article summary stage
        stage_config = get_stage_config(ctx.llm_config, "article_summary")

        yield PipelineStatus("article_summaries", "Generating article summaries...")

        # Stream progress while generating
        result = None
        async for status, res in self._stream_with_progress(
            task_coro=lambda on_progress, cfg=stage_config: self._generate_article_summaries(
                report_id=ctx.report.report_id,
                stream=ctx.stream,
                enrichment_config=enrichment_config,
                stage_config=cfg,
                on_progress=on_progress,
            ),
            stage="article_summaries",
            progress_msg_template="Summarizing: {completed}/{total}",
            heartbeat_msg="Generating summaries...",
        ):
            if res is not None:
                result = res
            else:
                yield status

        yield PipelineStatus(
            "article_summaries",
            f"Generated {result} article summaries",
            {"generated": result},
        )

    async def _generate_article_summaries(
        self,
        report_id: int,
        stream: "ResearchStream",
        enrichment_config: Optional[EnrichmentConfig],
        stage_config: StageConfig,
        on_progress: Optional[ProgressCallback] = None,
    ) -> int:
        """
        Generate AI summaries for articles in a report.

        Returns:
            Number of summaries generated
        """
        # RETRIEVE: Get associations with articles
        associations = await self.association_service.get_visible_for_report(report_id)

        # Filter to associations with articles that have abstracts
        articles_to_summarize = [
            assoc for assoc in associations if assoc.article and assoc.article.abstract
        ]

        if not articles_to_summarize:
            return 0

        # BUILD ITEMS: Use shared helper
        items = self.summary_service.build_article_summary_items(articles_to_summarize, stream)

        if not items:
            return 0

        # GENERATE: Call summary service
        results = await self.summary_service.generate_article_summary(
            items=items,
            enrichment_config=enrichment_config,
            model_config=stage_config,
            options=self._get_llm_options(stage_config, on_progress),
        )

        # WRITE: Build association updates from results
        # Results are in same order as items/articles_to_summarize
        association_updates = []
        for i, result in enumerate(results):
            if result.ok and result.data:
                assoc = articles_to_summarize[i]
                association_updates.append((assoc, result.data))

        # Write to associations and commit
        if association_updates:
            return await self.association_service.bulk_update_ai_summaries_from_pipeline(
                association_updates
            )
        return 0

    async def _stage_stance_analysis(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Analyze article stance for litigation relevance.
        Commits: stance_analysis written to ReportArticleAssociation.ai_enrichments.

        Only runs if article_analysis_config is configured with a stance_analysis_prompt.
        """
        # Check if stance analysis is configured
        if not ctx.article_analysis_config or not ctx.article_analysis_config.stance_analysis_prompt:
            yield PipelineStatus(
                "stance_analysis",
                "Stance analysis not configured - skipping",
                {"skipped": True},
            )
            return

        yield PipelineStatus("stance_analysis", "Analyzing article stances...")

        # Get configuration for stance analysis stage
        stage_config = get_stage_config(ctx.llm_config, "stance_analysis")

        # Convert PromptTemplate to dict for the analysis function
        stance_prompt_dict = ctx.article_analysis_config.stance_analysis_prompt.model_dump()

        # Stream progress while analyzing
        result = None
        async for status, res in self._stream_with_progress(
            task_coro=lambda on_progress, cfg=stage_config, prompt=stance_prompt_dict: self._analyze_stances(
                report_id=ctx.report.report_id,
                stream=ctx.stream,
                stance_prompt=prompt,
                stage_config=cfg,
                on_progress=on_progress,
            ),
            stage="stance_analysis",
            progress_msg_template="Analyzing: {completed}/{total}",
            heartbeat_msg="Analyzing stances...",
        ):
            if res is not None:
                result = res
            else:
                yield status

        analyzed_count, error_count = result
        ctx.stance_analyzed_count = analyzed_count
        ctx.stance_analysis_errors = error_count

        if error_count > 0:
            yield PipelineStatus(
                "stance_analysis",
                f"Analyzed {analyzed_count} articles ({error_count} failed)",
                {"analyzed": analyzed_count, "errors": error_count},
            )
        else:
            yield PipelineStatus(
                "stance_analysis",
                f"Analyzed {analyzed_count} articles",
                {"analyzed": analyzed_count},
            )

    async def _analyze_stances(
        self,
        report_id: int,
        stream: "ResearchStream",
        stance_prompt: Dict[str, Any],
        stage_config: StageConfig,
        on_progress: Optional[ProgressCallback] = None,
    ) -> Tuple[int, int]:
        """
        Analyze stances for articles in a report.

        Returns:
            Tuple of (analyzed_count, error_count)
        """
        from services.article_analysis_service import analyze_article_stance, build_stance_item

        # RETRIEVE: Get associations with articles
        associations = await self.association_service.get_visible_for_report(report_id)

        # Filter to associations with articles that have abstracts
        articles_to_analyze = [
            assoc for assoc in associations if assoc.article and assoc.article.abstract
        ]

        if not articles_to_analyze:
            return 0, 0

        # BUILD ITEMS: Use shared helper
        items = [
            build_stance_item(stream, assoc.article, assoc.ai_summary)
            for assoc in articles_to_analyze
        ]

        # GENERATE: Call analysis service
        results = await analyze_article_stance(
            items=items,
            stance_analysis_prompt=stance_prompt,
            model_config=stage_config,
            options=self._get_llm_options(stage_config, on_progress),
        )

        # WRITE: Build association updates from results
        analyzed_count = 0
        error_count = 0
        stance_results = []

        for i, result in enumerate(results):
            assoc = articles_to_analyze[i]
            if result.ok and result.data:
                stance_results.append((assoc, result.data))
                analyzed_count += 1
            else:
                error_count += 1

        if stance_results:
            await self.association_service.bulk_update_stance_analysis_from_pipeline(
                stance_results
            )

        return analyzed_count, error_count

    async def _stage_generate_category_summaries(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Generate category summaries.
        Commits: Category summaries to report enrichments.
        """
        yield PipelineStatus("category_summaries", f"Generating summaries for {len(ctx.categories)} categories...")

        # Get configuration for category summary stage
        stage_config = get_stage_config(ctx.llm_config, "category_summary")

        # RETRIEVE: Get associations - single source of truth for article data
        if not ctx.report:
            ctx.category_summaries = {}
            yield PipelineStatus("category_summaries", "No report available", {})
            return
        associations = await self.association_service.get_visible_for_report(ctx.report.report_id)

        if not associations:
            ctx.category_summaries = {}
            yield PipelineStatus("category_summaries", "No articles to summarize", {"categories": 0})
            return

        # BUILD ITEMS: Use shared helper
        items = self.summary_service.build_category_summary_items(
            associations=associations,
            categories=ctx.presentation_config.categories,
            stream=ctx.stream,
        )

        if not items:
            ctx.category_summaries = {}
            yield PipelineStatus("category_summaries", "No categories with articles", {"categories": 0})
            return

        # GENERATE: Call summary service
        results = await self.summary_service.generate_category_summary(
            items=items,
            enrichment_config=ctx.enrichment_config,
            model_config=stage_config,
            options=self._get_llm_options(stage_config),
        )

        # Build category summaries dict from results
        ctx.category_summaries = {}
        for i, result in enumerate(results):
            cat_id = items[i]["category_id"]
            if result.ok and result.data:
                ctx.category_summaries[cat_id] = result.data
            else:
                ctx.category_summaries[cat_id] = f"Error generating summary: {result.error}"

        # WRITE: Save category summaries to report
        if ctx.report:
            await self.db.refresh(ctx.report)
            self.report_service.update_enrichment(
                ctx.report, "category_summaries", ctx.category_summaries
            )
            await self.db.commit()

        logger.info(f"Generated {len(ctx.category_summaries)} category summaries for report {ctx.report.report_id}")

        yield PipelineStatus(
            "category_summaries",
            f"Generated {len(ctx.category_summaries)} category summaries",
            {"categories": len(ctx.category_summaries)},
        )

    async def _stage_generate_executive_summary(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Generate executive summary.
        Commits: Executive summary to report enrichments.
        """
        yield PipelineStatus("executive_summary", "Generating executive summary...")

        # Get LLM config for executive summary
        stage_config = get_stage_config(ctx.llm_config, "executive_summary")

        # RETRIEVE: Get associations - single source of truth for article data
        if not ctx.report:
            ctx.executive_summary = "No report available for executive summary."
            yield PipelineStatus("executive_summary", "No report available", {})
            return
        associations = await self.association_service.get_visible_for_report(ctx.report.report_id)

        if not associations:
            ctx.executive_summary = "No articles in this report."
            yield PipelineStatus("executive_summary", "No articles to summarize", {})
            return

        # BUILD ITEM: Use shared helper
        item = self.summary_service.build_executive_summary_item(
            associations=associations,
            category_summaries=ctx.category_summaries,
            stream=ctx.stream,
            categories=ctx.categories,
        )

        # GENERATE: Call summary service (single item)
        result = await self.summary_service.generate_executive_summary(
            items=item,
            enrichment_config=ctx.enrichment_config,
            model_config=stage_config,
        )

        if result.ok and result.data:
            ctx.executive_summary = result.data
        else:
            ctx.executive_summary = f"Error generating executive summary: {result.error}"

        # WRITE: Save executive summary to report and set original_enrichments
        if ctx.report:
            await self.db.refresh(ctx.report)
            self.report_service.update_enrichment(
                ctx.report, "executive_summary", ctx.executive_summary, set_original=True
            )
            await self.db.commit()

        logger.info(f"Generated executive summary for report {ctx.report.report_id}")

        yield PipelineStatus(
            "executive_summary",
            "Generated executive summary",
            {"length": len(ctx.executive_summary)},
        )

    async def _stage_generate_report(
        self, ctx: PipelineContext
    ) -> AsyncGenerator[PipelineStatus, None]:
        """
        Stage: Generate final report with article associations.
        Commits: Report, execution.report_id, Articles, ReportArticleAssociations.

        CRITICAL: This stage sets execution.report_id and commits it properly.
        """
        yield PipelineStatus("report", "Generating report...")

        ctx.report = await self._create_report(
            ctx=ctx,
            executive_summary=ctx.executive_summary,
            category_summaries=ctx.category_summaries,
            metrics={
                "total_retrieved": ctx.total_retrieved,
                "filter_stats": ctx.filter_stats,
                "global_duplicates": ctx.global_duplicates,
                "included_in_report": ctx.included_count,
                "categorized": ctx.categorized_count,
            },
        )

        yield PipelineStatus(
            "report",
            f"Report created successfully",
            {
                "report_id": ctx.report.report_id,
                "article_count": ctx.included_count,  # Use tracked count to avoid lazy load
            },
        )

    async def _create_report(
        self,
        ctx: PipelineContext,
        executive_summary: str,
        category_summaries: Dict[str, str],
        metrics: Dict,
    ) -> Report:
        """
        Create report with proper execution.report_id linkage.

        Only promotes articles with included_in_report=True from WipArticle.
        WipArticle remains the source of truth for all pipeline decisions.
        See docs/_specs/article-curation-flow.md for full documentation.

        CRITICAL: This method sets ctx.execution.report_id and commits everything
        in a single transaction to ensure the link is persisted.
        """
        # Build enrichments
        enrichments = {
            "executive_summary": executive_summary,
            "category_summaries": category_summaries,
        }

        # Create report
        report_date_obj = date.today()
        final_report_name = (
            ctx.report_name if ctx.report_name else report_date_obj.strftime("%Y.%m.%d")
        )

        report = await self.report_service.create_report(
            user_id=ctx.user_id,
            research_stream_id=ctx.research_stream_id,
            report_date=report_date_obj,
            title=final_report_name,
            pipeline_execution_id=ctx.execution_id,
            executive_summary=executive_summary,
            enrichments=enrichments,
        )

        report.pipeline_metrics = metrics
        report.is_read = False

        # Store original values for curation comparison
        report.original_report_name = final_report_name
        report.original_enrichments = enrichments.copy()

        # Get only INCLUDED articles (included_in_report=True)
        wip_articles = await self.wip_article_service.get_included_articles(ctx.execution_id)

        # Create Article records and build association items
        association_items = []
        for idx, wip_article in enumerate(wip_articles):
            # Find or create Article record (via ArticleService)
            article = await self.article_service.find_or_create_from_wip(wip_article)

            # Build item for bulk_create - categories and summaries populated in later stages
            association_items.append({
                "article_id": article.article_id,
                "wip_article_id": wip_article.id,
                "ranking": idx + 1,
                "relevance_score": wip_article.filter_score,
                "relevance_rationale": wip_article.filter_score_reason,
            })

        # Bulk create associations
        await self.association_service.bulk_create(report.report_id, association_items)

        # Set bidirectional link: execution -> report
        # This MUST be set before commit to persist the link
        ctx.execution.report_id = report.report_id

        # Commit everything: Report, Articles, Associations, and execution.report_id
        await self.db.commit()

        return report

    # =========================================================================
    # STAGE HELPER METHODS
    # =========================================================================

    async def _fetch_and_store_articles(
        self,
        research_stream_id: int,
        execution_id: str,
        retrieval_unit_id: str,
        source_id: int,
        query_expression: str,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
    ) -> int:
        """
        Fetch articles from a source and store all results in wip_articles table.

        Args:
            research_stream_id: Stream ID
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (concept_id or query_id)
            source_id: Database source ID (integer FK)
            query_expression: Query to execute
            start_date: Start date for retrieval (YYYY/MM/DD format)
            end_date: End date for retrieval (YYYY/MM/DD format)

        Returns:
            Number of articles retrieved and stored

        Raises:
            Exception: If fetching or storing fails
        """
        logger.info(
            f"Fetching articles: query='{query_expression[:100]}...', "
            f"source_id={source_id}, dates={start_date} to {end_date}"
        )

        # Execute query - currently only PubMed is implemented
        # TODO: Use source_id to determine which service to call when more sources are added
        try:
            articles, metadata = await self.pubmed_service.search_articles(
                query=query_expression,
                max_results=self.MAX_ARTICLES_PER_SOURCE,
                start_date=start_date,
                end_date=end_date,
                date_type="publication",
                sort_by="relevance",
                include_full_text=True,  # Fetch full text from PMC for articles with PMC IDs
            )
        except Exception as e:
            logger.error(
                f"Failed to fetch articles: query='{query_expression[:100]}...', "
                f"source_id={source_id}, error={e}"
            )
            raise

        logger.info(
            f"Fetched {len(articles)} articles from source_id={source_id}, "
            f"total_results={metadata.get('total_results', 'unknown')}"
        )

        # Store results in wip_articles
        try:
            count = await self.wip_article_service.create_wip_articles(
                research_stream_id=research_stream_id,
                execution_id=execution_id,
                retrieval_group_id=retrieval_unit_id,
                source_id=source_id,
                articles=articles,
            )
        except Exception as e:
            logger.error(
                f"Failed to store articles: execution_id={execution_id}, "
                f"retrieval_unit_id={retrieval_unit_id}, count={len(articles)}, error={e}"
            )
            raise

        logger.info(f"Stored {count} articles for execution_id={execution_id}")
        return count

    async def _apply_semantic_filter(
        self,
        execution_id: str,
        retrieval_unit_id: str,
        filter_criteria: str,
        threshold: float,
        stage_config: StageConfig,
        on_progress: Optional[callable] = None,
    ) -> Tuple[int, int, int]:
        """
        Apply semantic filter to articles in a retrieval unit (concept or broad query) using LLM in parallel batches.

        Args:
            execution_id: UUID of this pipeline execution
            retrieval_unit_id: Retrieval unit ID (query_id)
            filter_criteria: Natural language filter criteria
            threshold: Minimum score (0-1) for article to pass
            stage_config: Stage configuration (model + concurrency settings)
            on_progress: Optional async callback(completed, total) for progress updates

        Returns:
            Tuple of (passed_count, rejected_count, error_count)
        """
        # Get all non-duplicate articles for this unit that haven't been filtered yet
        articles = await self.wip_article_service.get_for_filtering(
            execution_id, retrieval_unit_id
        )

        if not articles:
            logger.info(
                f"No articles to filter for execution_id={execution_id}, retrieval_unit_id={retrieval_unit_id}"
            )
            return 0, 0, 0

        logger.info(
            f"Filtering {len(articles)} articles for retrieval_unit_id={retrieval_unit_id}, threshold={threshold}"
        )

        # Prompt template for semantic filtering
        # filter_criteria is embedded directly; item fields use {field} placeholders
        prompt_template = f"""## Article
Title: {{title}}
Abstract: {{abstract}}
AI Summary: {{summary}}
Journal: {{journal}}
Authors: {{authors}}

## Task
{filter_criteria}

Score from {{min_value}} to {{max_value}}."""

        # Build evaluation items from WipArticles
        items, article_map = self.wip_article_service.build_filter_eval_items(articles)

        # Use AIEvaluationService score to get relevance scores
        results = await self.eval_service.score(
            items=items,
            prompt_template=prompt_template,
            min_value=0.0,
            max_value=1.0,
            include_reasoning=True,
            model_config=stage_config,
            options=self._get_llm_options(stage_config, on_progress),
        )

        # Update database with results and commit
        passed, rejected, errors = await self.wip_article_service.bulk_update_filter_results(
            results=results,
            article_map=article_map,
            threshold=threshold
        )

        logger.info(
            f"Filtering complete: {passed} passed, {rejected} rejected, {errors} errors out of {len(articles)} total"
        )
        return passed, rejected, errors

    async def _deduplicate_globally(
        self, research_stream_id: int, execution_id: str
    ) -> Tuple[int, int]:
        """
        Find and mark duplicates for this execution (runs before semantic filtering).

        Deduplication checks (in order):
        1. Historical: Articles that appeared in previous reports for this stream (via SQL join)
        2. Within-execution: Duplicates within the current execution (by DOI or title)

        Args:
            research_stream_id: Stream ID for historical deduplication
            execution_id: UUID of this pipeline execution

        Returns:
            Tuple of (historical_duplicates, within_execution_duplicates)
        """
        # Get all articles for this execution (one query)
        all_articles = await self.wip_article_service.get_by_execution_id(execution_id)

        # 1. Historical deduplication: Single SQL join to find matches
        historical_matches = await self.association_service.find_historical_duplicates(
            stream_id=research_stream_id,
            execution_id=execution_id
        )

        # Track historical duplicate IDs to skip in within-execution check
        historical_dup_ids = {wip_id for wip_id, _ in historical_matches}

        # Mark historical duplicates
        historical_duplicates = await self.wip_article_service.bulk_update_duplicates(
            [(wip_id, identifier) for wip_id, identifier in historical_matches]
        )

        # 2. Within-execution deduplication
        within_execution_duplicates = 0
        seen_dois = {}
        seen_titles = {}

        for article in all_articles:
            # Skip articles already marked as historical duplicates
            if article.id in historical_dup_ids:
                continue
            # Check DOI-based deduplication
            if article.doi and article.doi.strip():
                doi_normalized = article.doi.lower().strip()
                if doi_normalized in seen_dois:
                    self.wip_article_service.mark_as_duplicate(
                        article, seen_dois[doi_normalized]
                    )
                    within_execution_duplicates += 1
                else:
                    seen_dois[doi_normalized] = article.pmid or str(article.id)

            # Check title-based deduplication
            elif article.title:
                title_normalized = article.title.lower().strip()
                if title_normalized in seen_titles:
                    self.wip_article_service.mark_as_duplicate(
                        article, seen_titles[title_normalized]
                    )
                    within_execution_duplicates += 1
                else:
                    seen_titles[title_normalized] = article.pmid or str(article.id)

        # No commit here - stage manages the transaction
        return historical_duplicates, within_execution_duplicates

    async def _mark_articles_for_report(self, execution_id: str) -> int:
        """
        Mark articles that should be included in the final report.

        An article is included if:
        - NOT a duplicate
        - Passed semantic filter

        Args:
            execution_id: UUID of this pipeline execution

        Returns:
            Number of articles marked for inclusion
        """
        # Get non-duplicate articles that passed the semantic filter
        articles = await self.wip_article_service.get_passed_filter(execution_id)
        self.wip_article_service.mark_all_for_inclusion(articles)
        # No commit here - stage manages the transaction
        return len(articles)

    async def _categorize_articles(
        self,
        report_id: int,
        presentation_config: PresentationConfig,
        stage_config: StageConfig,
        on_progress: Optional[callable] = None,
    ) -> Tuple[int, int]:
        """
        Use LLM to categorize report articles and write directly to associations.

        Args:
            report_id: Report ID (report must already exist)
            presentation_config: Presentation configuration with categories
            stage_config: Stage configuration (model + concurrency settings)
            on_progress: Optional async callback(completed, total) for progress updates

        Returns:
            Tuple of (categorized_count, error_count)
        """
        # Get visible associations with their articles
        associations = await self.association_service.get_visible_for_report(report_id)

        if not associations:
            logger.info(f"No articles to categorize for report_id={report_id}")
            return 0, 0

        logger.info(
            f"Categorizing {len(associations)} articles into {len(presentation_config.categories)} categories"
        )

        # Prepare category definitions and format as JSON
        categories_desc = self.categorization_service.prepare_category_definitions(
            presentation_config.categories
        )
        categories_json = self.categorization_service.format_categories_json(categories_desc)

        # Build items list for categorization service
        # Track associations by index since we process results in order
        items = []
        valid_associations = []
        for assoc in associations:
            article = assoc.article
            if article:
                items.append({
                    "title": article.title or "Untitled",
                    "abstract": article.abstract or "",
                    "ai_summary": assoc.ai_summary or "",  # Use AI summary if available
                    "journal": article.journal or "Unknown",
                    "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day) or "Unknown",
                    "categories_json": categories_json,
                })
                valid_associations.append(assoc)

        if not items:
            logger.info(f"No articles with data to categorize for report_id={report_id}")
            return 0, 0

        # Get custom categorization prompt if configured
        custom_prompt = presentation_config.categorization_prompt if hasattr(presentation_config, 'categorization_prompt') else None

        # Call categorization service
        results = await self.categorization_service.categorize(
            items=items,
            model_config=stage_config,
            options=self._get_llm_options(stage_config, on_progress),
            custom_prompt=custom_prompt,
        )

        # Map results back to associations: (Association, category_id)
        # Results are in same order as items/valid_associations
        association_results = []
        error_count = 0
        for i, result in enumerate(results):
            assoc = valid_associations[i]
            if result.ok and result.data:
                category_id = result.data.get("category_id")
                association_results.append((assoc, category_id))
            else:
                error_count += 1
                association_results.append((assoc, None))

        # Update associations with results and commit
        categorized = await self.association_service.bulk_update_categories_from_pipeline(
            association_results
        )
        logger.info(
            f"Categorization complete: {categorized} articles categorized, {error_count} errors"
        )
        return categorized, error_count

