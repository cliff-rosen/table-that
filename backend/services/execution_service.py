"""
Execution Service - Single source of truth for PipelineExecution table operations.

This service owns:
- PipelineExecution CRUD operations
- Status lifecycle management
- Execution queries (by ID, pending, etc.)

The pipeline orchestration logic remains in pipeline_service.py.
"""

import logging
import uuid
from datetime import datetime
from typing import Optional, List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from fastapi import Depends

from models import PipelineExecution, ExecutionStatus, RunType, ResearchStream
from database import get_async_db

logger = logging.getLogger(__name__)


class ExecutionService:
    """
    Service for PipelineExecution operations.

    This is the single source of truth for PipelineExecution table access.
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # READ Operations
    # =========================================================================

    async def get_by_id(self, execution_id: str) -> Optional[PipelineExecution]:
        """Get an execution by ID, returning None if not found."""
        stmt = select(PipelineExecution).where(PipelineExecution.id == execution_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_by_id_or_raise(self, execution_id: str) -> PipelineExecution:
        """Get an execution by ID, raising ValueError if not found."""
        execution = await self.get_by_id(execution_id)
        if not execution:
            raise ValueError(f"Pipeline execution {execution_id} not found")
        return execution

    async def find_pending(self) -> List[PipelineExecution]:
        """Find all executions with PENDING status."""
        stmt = select(PipelineExecution).where(
            PipelineExecution.status == ExecutionStatus.PENDING
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def find_by_stream(
        self,
        stream_id: int,
        limit: int = 10
    ) -> List[PipelineExecution]:
        """Find recent executions for a stream."""
        stmt = (
            select(PipelineExecution)
            .where(PipelineExecution.stream_id == stream_id)
            .order_by(desc(PipelineExecution.created_at))
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # =========================================================================
    # CREATE Operations
    # =========================================================================

    async def create(
        self,
        stream_id: int,
        user_id: int,
        run_type: RunType,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        report_name: Optional[str] = None,
        retrieval_config: Optional[Dict[str, Any]] = None,
        presentation_config: Optional[Dict[str, Any]] = None,
        enrichment_config: Optional[Dict[str, Any]] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        article_analysis_config: Optional[Dict[str, Any]] = None,
        status: ExecutionStatus = ExecutionStatus.PENDING
    ) -> PipelineExecution:
        """
        Create a new pipeline execution.

        All configuration is snapshotted at creation time.
        The pipeline reads ONLY from the execution record, not from the stream.
        """
        execution_id = str(uuid.uuid4())

        execution = PipelineExecution(
            id=execution_id,
            stream_id=stream_id,
            user_id=user_id,
            status=status,
            run_type=run_type,
            started_at=datetime.utcnow() if status == ExecutionStatus.RUNNING else None,
            start_date=start_date,
            end_date=end_date,
            report_name=report_name,
            retrieval_config=retrieval_config or {},
            presentation_config=presentation_config or {},
            enrichment_config=enrichment_config,
            llm_config=llm_config,
            article_analysis_config=article_analysis_config
        )

        self.db.add(execution)
        await self.db.flush()

        logger.info(f"Created execution {execution_id} for stream {stream_id}, status={status.value}")
        return execution

    async def create_from_stream(
        self,
        stream: ResearchStream,
        run_type: RunType,
        start_date: str,
        end_date: str,
        report_name: Optional[str] = None,
        status: ExecutionStatus = ExecutionStatus.PENDING
    ) -> PipelineExecution:
        """
        Create a new execution by snapshotting configuration from a stream.

        Convenience method that extracts all config from the stream.
        """
        return await self.create(
            stream_id=stream.stream_id,
            user_id=stream.user_id,
            run_type=run_type,
            start_date=start_date,
            end_date=end_date,
            report_name=report_name,
            retrieval_config=stream.retrieval_config if stream.retrieval_config else {},
            presentation_config=stream.presentation_config if stream.presentation_config else {},
            enrichment_config=stream.enrichment_config if stream.enrichment_config else None,
            llm_config=stream.llm_config if stream.llm_config else None,
            article_analysis_config=stream.article_analysis_config if stream.article_analysis_config else None,
            status=status
        )

    # =========================================================================
    # UPDATE Operations
    # =========================================================================

    async def update_status(
        self,
        execution_id: str,
        status: ExecutionStatus,
        error: Optional[str] = None
    ) -> PipelineExecution:
        """
        Update execution status.

        Automatically sets started_at when transitioning to RUNNING,
        and completed_at when transitioning to COMPLETED or FAILED.
        """
        execution = await self.get_by_id_or_raise(execution_id)

        execution.status = status

        if status == ExecutionStatus.RUNNING and not execution.started_at:
            execution.started_at = datetime.utcnow()

        if status in (ExecutionStatus.COMPLETED, ExecutionStatus.FAILED):
            execution.completed_at = datetime.utcnow()

        if error:
            execution.error = error

        await self.db.flush()

        logger.info(f"Updated execution {execution_id} status to {status.value}")
        return execution

    async def set_report_id(
        self,
        execution_id: str,
        report_id: int
    ) -> PipelineExecution:
        """Link an execution to its generated report."""
        execution = await self.get_by_id_or_raise(execution_id)
        execution.report_id = report_id
        await self.db.flush()

        logger.debug(f"Linked execution {execution_id} to report {report_id}")
        return execution

    async def mark_running(self, execution_id: str) -> PipelineExecution:
        """Mark execution as RUNNING."""
        return await self.update_status(execution_id, ExecutionStatus.RUNNING)

    async def mark_completed(self, execution_id: str) -> PipelineExecution:
        """Mark execution as COMPLETED."""
        return await self.update_status(execution_id, ExecutionStatus.COMPLETED)

    async def mark_failed(self, execution_id: str, error: str) -> PipelineExecution:
        """Mark execution as FAILED with error message."""
        return await self.update_status(execution_id, ExecutionStatus.FAILED, error=error)


# Dependency injection provider
async def get_execution_service(
    db: AsyncSession = Depends(get_async_db)
) -> ExecutionService:
    """Get an ExecutionService instance with async database session."""
    return ExecutionService(db)
