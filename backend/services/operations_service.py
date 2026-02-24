"""
Operations Service - Pipeline execution queue and scheduler management

This service handles:
- Pipeline execution queue (pending, running, completed, failed)
- Report approval workflow (for completed executions)
- Scheduler management (list scheduled streams, update schedules)
"""

import logging
from sqlalchemy import desc, select, func
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Tuple, TYPE_CHECKING
from fastapi import HTTPException, status, Depends

from models import (
    Report, ResearchStream, PipelineExecution, User,
    WipArticle as WipArticleModel,
    ApprovalStatus, ExecutionStatus
)
from schemas.research_stream import (
    ExecutionQueueItem,
    ExecutionDetail,
    ScheduledStreamSummary,
    LastExecution,
    StreamOption,
    CategoryCount,
    WipArticle,
    ScheduleConfig,
    ExecutionStatus as ExecutionStatusEnum,
    RunType as RunTypeEnum,
)
from schemas.report import ReportArticle
from database import get_async_db

if TYPE_CHECKING:
    from services.report_article_association_service import ReportArticleAssociationService

logger = logging.getLogger(__name__)


class OperationsService:
    """Service for operations management - execution queue and scheduler."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._association_service: Optional["ReportArticleAssociationService"] = None

    @property
    def association_service(self) -> "ReportArticleAssociationService":
        """Lazy-load ReportArticleAssociationService."""
        if self._association_service is None:
            from services.report_article_association_service import ReportArticleAssociationService
            self._association_service = ReportArticleAssociationService(self.db)
        return self._association_service

    # ==================== Async Methods ====================

    # Sync methods removed - use async_* versions instead

    async def get_execution_queue(
        self,
        user_id: int,
        execution_status: Optional[str] = None,
        approval_status: Optional[str] = None,
        stream_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0
    ) -> Tuple[List[ExecutionQueueItem], int, List[StreamOption]]:
        """Get pipeline executions queue with optional filters (async)."""
        logger.info(
            f"get_execution_queue - user_id={user_id}, "
            f"execution_status={execution_status}, approval_status={approval_status}, stream_id={stream_id}"
        )

        # Build base filters
        filters = []

        if execution_status:
            try:
                status_enum = ExecutionStatus(execution_status)
                filters.append(PipelineExecution.status == status_enum)
            except ValueError:
                pass

        if stream_id:
            filters.append(PipelineExecution.stream_id == stream_id)

        # Get total count
        count_stmt = select(func.count(PipelineExecution.id)).select_from(PipelineExecution)
        if filters:
            count_stmt = count_stmt.where(*filters)

        # If filtering by approval_status, need to join with Report
        if approval_status:
            try:
                approval_enum = ApprovalStatus(approval_status)
                count_stmt = count_stmt.join(Report, PipelineExecution.report_id == Report.report_id)
                count_stmt = count_stmt.where(Report.approval_status == approval_enum)
            except ValueError:
                pass

        count_result = await self.db.execute(count_stmt)
        total = count_result.scalar() or 0

        # Get executions with pagination
        stmt = (
            select(PipelineExecution)
            .order_by(desc(PipelineExecution.created_at))
            .offset(offset)
            .limit(limit)
        )
        if filters:
            stmt = stmt.where(*filters)

        if approval_status:
            try:
                approval_enum = ApprovalStatus(approval_status)
                stmt = stmt.join(Report, PipelineExecution.report_id == Report.report_id)
                stmt = stmt.where(Report.approval_status == approval_enum)
            except ValueError:
                pass

        result = await self.db.execute(stmt)
        executions_db = result.scalars().all()

        # Build response
        executions: List[ExecutionQueueItem] = []
        for execution in executions_db:
            # Get stream
            stream_result = await self.db.execute(
                select(ResearchStream).where(ResearchStream.stream_id == execution.stream_id)
            )
            stream = stream_result.scalars().first()

            # Initialize report fields
            report_id = None
            report_name = None
            report_approval_status = None
            article_count = None
            approved_by_email = None
            approved_at = None
            rejection_reason = None
            filtered_out_count = None
            has_curation_edits = None
            last_curated_by_email = None

            if execution.report_id:
                report_result = await self.db.execute(
                    select(Report).where(Report.report_id == execution.report_id)
                )
                report = report_result.scalars().first()
                if report:
                    report_id = report.report_id
                    report_name = report.report_name
                    report_approval_status = report.approval_status.value if report.approval_status else None
                    rejection_reason = report.rejection_reason
                    approved_at = report.approved_at
                    has_curation_edits = report.has_curation_edits or False

                    # Get article count
                    if report.pipeline_metrics:
                        article_count = (
                            report.pipeline_metrics.get('articles_after_filter', 0) or
                            report.pipeline_metrics.get('article_count', 0)
                        )
                    if not article_count:
                        article_count = await self.association_service.count_all(report.report_id)

                    # Get approver email
                    if report.approved_by:
                        approver_result = await self.db.execute(
                            select(User).where(User.user_id == report.approved_by)
                        )
                        approver = approver_result.scalars().first()
                        approved_by_email = approver.email if approver else None

                    # Get last curator email
                    if report.last_curated_by:
                        curator_result = await self.db.execute(
                            select(User).where(User.user_id == report.last_curated_by)
                        )
                        curator = curator_result.scalars().first()
                        last_curated_by_email = curator.email if curator else None

            # Get filtered out count
            if execution.id:
                filtered_result = await self.db.execute(
                    select(func.count(WipArticleModel.id))
                    .where(
                        WipArticleModel.pipeline_execution_id == execution.id,
                        WipArticleModel.passed_semantic_filter == False
                    )
                )
                filtered_out_count = filtered_result.scalar() or 0

            executions.append(ExecutionQueueItem(
                execution_id=execution.id,
                stream_id=execution.stream_id,
                stream_name=stream.stream_name if stream else "Unknown",
                execution_status=execution.status if execution.status else ExecutionStatusEnum.PENDING,
                run_type=execution.run_type if execution.run_type else RunTypeEnum.MANUAL,
                started_at=execution.started_at,
                completed_at=execution.completed_at,
                error=execution.error,
                created_at=execution.created_at,
                report_id=report_id,
                report_name=report_name,
                approval_status=report_approval_status,
                article_count=article_count,
                approved_by=approved_by_email,
                approved_at=approved_at,
                rejection_reason=rejection_reason,
                filtered_out_count=filtered_out_count,
                has_curation_edits=has_curation_edits,
                last_curated_by=last_curated_by_email,
            ))

        # Get streams for filter dropdown
        streams_result = await self.db.execute(
            select(ResearchStream.stream_id, ResearchStream.stream_name).distinct()
        )
        streams_list = [StreamOption(stream_id=s.stream_id, stream_name=s.stream_name) for s in streams_result.all()]

        logger.info(f"get_execution_queue complete - user_id={user_id}, count={len(executions)}, total={total}")
        return (executions, total, streams_list)

    async def get_execution_detail(
        self,
        execution_id: str,
        user_id: int
    ) -> ExecutionDetail:
        """Get full execution details for review (async)."""
        logger.info(f"get_execution_detail - user_id={user_id}, execution_id={execution_id}")

        result = await self.db.execute(
            select(PipelineExecution).where(PipelineExecution.id == execution_id)
        )
        execution = result.scalars().first()

        if not execution:
            logger.warning(f"Execution not found - execution_id={execution_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Execution not found"
            )

        stream_result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == execution.stream_id)
        )
        stream = stream_result.scalars().first()

        # Get WIP articles for this execution
        wip_result = await self.db.execute(
            select(WipArticleModel).where(WipArticleModel.pipeline_execution_id == execution.id)
        )
        wip_articles_db = wip_result.scalars().all()

        wip_articles_list: List[WipArticle] = []
        for wip in wip_articles_db:
            wip_articles_list.append(WipArticle(
                id=wip.id,
                title=wip.title,
                authors=wip.authors or [],
                journal=wip.journal,
                pub_year=wip.pub_year,
                pub_month=wip.pub_month,
                pub_day=wip.pub_day,
                pmid=wip.pmid,
                abstract=wip.abstract,
                is_duplicate=wip.is_duplicate or False,
                duplicate_of_id=wip.duplicate_of_id,
                passed_semantic_filter=wip.passed_semantic_filter,
                filter_score=wip.filter_score,
                filter_score_reason=wip.filter_score_reason,
                included_in_report=wip.included_in_report or False,
                curator_included=wip.curator_included or False,
                curator_excluded=wip.curator_excluded or False,
                curation_notes=wip.curation_notes,
            ))

        # Initialize report-related fields
        report_id = None
        report_name = None
        report_approval_status = None
        article_count = 0
        executive_summary = None
        category_summaries = None
        categories_list: List[CategoryCount] = []
        articles_list: List[ReportArticle] = []
        approved_by_email = None
        approved_at = None
        rejection_reason = None

        # Get report info if execution completed
        if execution.report_id:
            report_result = await self.db.execute(
                select(Report).where(Report.report_id == execution.report_id)
            )
            report = report_result.scalars().first()

            if report:
                report_id = report.report_id
                report_name = report.report_name
                report_approval_status = report.approval_status.value if report.approval_status else None
                rejection_reason = report.rejection_reason
                approved_at = report.approved_at

                # Get approver email
                if report.approved_by:
                    approver_result = await self.db.execute(
                        select(User).where(User.user_id == report.approved_by)
                    )
                    approver = approver_result.scalars().first()
                    approved_by_email = approver.email if approver else None

                # Get executive summary and category summaries
                if report.enrichments:
                    executive_summary = report.enrichments.get("executive_summary")
                    category_summaries = report.enrichments.get("category_summaries")

                # Get visible report articles (association service eagerly loads articles)
                visible_associations = await self.association_service.get_visible_for_report(report.report_id)

                categories_dict: dict[str, CategoryCount] = {}

                for ra in visible_associations:
                    article = ra.article
                    if article:
                        presentation_categories = ra.presentation_categories or []

                        articles_list.append(ReportArticle(
                            article_id=article.article_id,
                            title=article.title,
                            authors=article.authors or [],
                            journal=article.journal,
                            pub_year=article.pub_year,
                            pub_month=article.pub_month,
                            pub_day=article.pub_day,
                            pmid=article.pmid,
                            abstract=article.abstract,
                            relevance_score=ra.relevance_score,
                            presentation_categories=presentation_categories,
                            ai_summary=ra.ai_summary,
                        ))

                        # Track categories
                        for cat_id in presentation_categories:
                            if cat_id not in categories_dict:
                                categories_dict[cat_id] = CategoryCount(
                                    id=cat_id,
                                    name=cat_id.replace("_", " ").title(),
                                    article_count=0
                                )
                            categories_dict[cat_id].article_count += 1

                categories_list = list(categories_dict.values())
                article_count = len(articles_list)

        logger.info(f"get_execution_detail complete - user_id={user_id}, execution_id={execution_id}")
        return ExecutionDetail(
            execution_id=execution.id,
            stream_id=execution.stream_id,
            stream_name=stream.stream_name if stream else "Unknown",
            execution_status=execution.status if execution.status else ExecutionStatusEnum.PENDING,
            run_type=execution.run_type if execution.run_type else RunTypeEnum.MANUAL,
            started_at=execution.started_at,
            completed_at=execution.completed_at,
            error=execution.error,
            created_at=execution.created_at,
            wip_articles=wip_articles_list,
            start_date=execution.start_date,
            end_date=execution.end_date,
            retrieval_config=execution.retrieval_config,
            report_id=report_id,
            report_name=report_name,
            approval_status=report_approval_status,
            article_count=article_count,
            executive_summary=executive_summary,
            category_summaries=category_summaries,
            categories=categories_list,
            articles=articles_list,
            approved_by=approved_by_email,
            approved_at=approved_at,
            rejection_reason=rejection_reason,
        )

    async def get_scheduled_streams(
        self,
        user_id: int
    ) -> List[ScheduledStreamSummary]:
        """Get all streams with scheduling configuration and their last execution status (async)."""
        logger.info(f"get_scheduled_streams - user_id={user_id}")

        # Get all streams that have schedule_config (not null)
        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.schedule_config.isnot(None))
        )
        streams = result.scalars().all()

        result_list: List[ScheduledStreamSummary] = []
        for stream in streams:
            # Parse schedule_config
            schedule_config_data = stream.schedule_config or {}
            config = ScheduleConfig(
                enabled=schedule_config_data.get('enabled', False),
                frequency=schedule_config_data.get('frequency', 'weekly'),
                anchor_day=schedule_config_data.get('anchor_day'),
                preferred_time=schedule_config_data.get('preferred_time', '08:00'),
                timezone=schedule_config_data.get('timezone', 'UTC'),
                send_day=schedule_config_data.get('send_day'),
                send_time=schedule_config_data.get('send_time'),
                # lookback_days removed — derived from frequency
            )

            # Get last execution
            last_exec = None
            exec_result = await self.db.execute(
                select(PipelineExecution)
                .where(PipelineExecution.stream_id == stream.stream_id)
                .order_by(
                    PipelineExecution.started_at.is_(None),
                    PipelineExecution.started_at.desc()
                )
                .limit(1)
            )
            exec_db = exec_result.scalars().first()

            if exec_db:
                report_approval_status = None
                article_count = None
                if exec_db.report_id:
                    report_result = await self.db.execute(
                        select(Report).where(Report.report_id == exec_db.report_id)
                    )
                    report = report_result.scalars().first()
                    if report:
                        report_approval_status = report.approval_status.value if report.approval_status else None
                        if report.pipeline_metrics:
                            article_count = (
                                report.pipeline_metrics.get('articles_after_filter', 0) or
                                report.pipeline_metrics.get('article_count', 0)
                            )
                        if not article_count:
                            article_count = await self.association_service.count_all(report.report_id)

                last_exec = LastExecution(
                    id=exec_db.id,
                    stream_id=exec_db.stream_id,
                    status=exec_db.status if exec_db.status else ExecutionStatusEnum.PENDING,
                    run_type=exec_db.run_type if exec_db.run_type else RunTypeEnum.MANUAL,
                    started_at=exec_db.started_at,
                    completed_at=exec_db.completed_at,
                    error=exec_db.error,
                    report_id=exec_db.report_id,
                    report_approval_status=report_approval_status,
                    article_count=article_count
                )

            result_list.append(ScheduledStreamSummary(
                stream_id=stream.stream_id,
                stream_name=stream.stream_name,
                schedule_config=config,
                next_scheduled_run=stream.next_scheduled_run,
                last_execution=last_exec
            ))

        logger.info(f"get_scheduled_streams complete - user_id={user_id}, count={len(result_list)}")
        return result_list

    async def update_stream_schedule(
        self,
        stream_id: int,
        user_id: int,
        updates: dict
    ) -> ScheduledStreamSummary:
        """Update scheduling configuration for a stream (async)."""
        logger.info(f"update_stream_schedule - user_id={user_id}, stream_id={stream_id}")

        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()

        if not stream:
            logger.warning(f"Stream not found for schedule update - stream_id={stream_id}, user_id={user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Stream not found"
            )

        # Update schedule_config
        # Copy the dict so SQLAlchemy detects the mutation on reassignment
        current_config = dict(stream.schedule_config or {})

        if 'enabled' in updates:
            current_config['enabled'] = updates['enabled']
        if 'frequency' in updates:
            current_config['frequency'] = updates['frequency']
        if 'anchor_day' in updates:
            current_config['anchor_day'] = updates['anchor_day']
        if 'preferred_time' in updates:
            current_config['preferred_time'] = updates['preferred_time']
        if 'timezone' in updates:
            current_config['timezone'] = updates['timezone']
        if 'send_day' in updates:
            current_config['send_day'] = updates['send_day']
        if 'send_time' in updates:
            current_config['send_time'] = updates['send_time']

        stream.schedule_config = current_config

        # When schedule is enabled (or config changes), calculate next_scheduled_run
        if current_config.get('enabled'):
            from worker.dispatcher import JobDispatcher
            dispatcher = JobDispatcher(self.db)
            next_run = dispatcher._calculate_next_run(current_config)
            stream.next_scheduled_run = next_run
            logger.info(f"Set next_scheduled_run for stream {stream_id}: {next_run}")
        elif 'enabled' in updates and not updates['enabled']:
            # Explicitly disabled — clear next run
            stream.next_scheduled_run = None

        await self.db.commit()
        await self.db.refresh(stream)

        # Build response
        config = ScheduleConfig(
            enabled=current_config.get('enabled', False),
            frequency=current_config.get('frequency', 'weekly'),
            anchor_day=current_config.get('anchor_day'),
            preferred_time=current_config.get('preferred_time', '08:00'),
            timezone=current_config.get('timezone', 'UTC'),
            send_day=current_config.get('send_day'),
            send_time=current_config.get('send_time'),
        )

        logger.info(f"update_stream_schedule complete - user_id={user_id}, stream_id={stream_id}")
        return ScheduledStreamSummary(
            stream_id=stream.stream_id,
            stream_name=stream.stream_name,
            schedule_config=config,
            next_scheduled_run=stream.next_scheduled_run,
            last_execution=None
        )


# Dependency injection provider for async operations
async def get_operations_service(
    db: AsyncSession = Depends(get_async_db)
) -> OperationsService:
    """Get an OperationsService instance with async database session."""
    return OperationsService(db)
