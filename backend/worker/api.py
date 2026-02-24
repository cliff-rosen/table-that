"""
Management Plane API

External control interface for the worker:
- Trigger runs
- Check status
- Cancel jobs
- Health checks
"""

import logging
import asyncio
import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional, List, AsyncGenerator
from datetime import datetime

from database import get_async_db
from models import PipelineExecution, ResearchStream, ExecutionStatus, RunType
from services.execution_service import ExecutionService
from worker.status_broker import broker
from worker.state import worker_state

logger = logging.getLogger('worker.api')

router = APIRouter(prefix="/worker", tags=["worker"])


# ==================== Request/Response Models ====================

class TriggerRunRequest(BaseModel):
    """Request to trigger a pipeline run"""
    stream_id: int
    run_type: str = "manual"  # manual, test
    # Job config options
    report_name: Optional[str] = None
    start_date: Optional[str] = None  # YYYY-MM-DD format
    end_date: Optional[str] = None    # YYYY-MM-DD format


class TriggerRunResponse(BaseModel):
    """Response after triggering a run"""
    execution_id: str
    stream_id: int
    status: str
    message: str


class JobStatusResponse(BaseModel):
    """Status of a pipeline execution"""
    execution_id: str
    stream_id: int
    status: str
    run_type: str
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    error: Optional[str]


class HealthResponse(BaseModel):
    """Health check response"""
    status: str
    timestamp: datetime
    version: str = "1.0.0"


# ==================== Endpoints ====================

@router.post("/runs", response_model=TriggerRunResponse)
async def trigger_run(
    request: TriggerRunRequest,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Trigger a pipeline run for a stream.

    Creates a PipelineExecution with ALL configuration determined at creation time:
    - user_id from stream
    - retrieval_config snapshot from stream
    - dates from request or calculated from lookback_days
    - report_name from request

    The worker loop picks up pending executions and runs them.
    """
    logger.info(f"trigger_run called - stream_id={request.stream_id}, run_type={request.run_type}")

    try:
        # Get stream with all its configuration
        stmt = select(ResearchStream).where(ResearchStream.stream_id == request.stream_id)
        result = await db.execute(stmt)
        stream = result.scalars().first()

        if not stream:
            logger.warning(f"trigger_run failed - stream {request.stream_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Stream {request.stream_id} not found"
            )

        # Determine dates: use request values or derive from frequency
        start_date = request.start_date
        end_date = request.end_date

        if not start_date or not end_date:
            frequency = (stream.schedule_config or {}).get('frequency', 'weekly')
            lookback_map = {'daily': 1, 'weekly': 7, 'biweekly': 14, 'monthly': 30}
            lookback_days = lookback_map.get(frequency, 7)

            from datetime import date, timedelta
            today = date.today()
            if not end_date:
                end_date = (today - timedelta(days=1)).strftime('%Y-%m-%d')  # Day before run
            if not start_date:
                end_dt = today - timedelta(days=1)
                start_dt = end_dt - timedelta(days=lookback_days - 1)
                start_date = start_dt.strftime('%Y-%m-%d')

        # Create execution via service (snapshots all config from stream)
        run_type = RunType.TEST if request.run_type == "test" else RunType.MANUAL
        execution_service = ExecutionService(db)

        execution = await execution_service.create(
            stream_id=request.stream_id,
            user_id=stream.user_id,
            run_type=run_type,
            start_date=start_date,
            end_date=end_date,
            report_name=request.report_name,
            retrieval_config=stream.retrieval_config if stream.retrieval_config else {},
            presentation_config=stream.presentation_config if stream.presentation_config else {},
            enrichment_config=stream.enrichment_config if stream.enrichment_config else None,
            llm_config=stream.llm_config if stream.llm_config else None,
            article_analysis_config=stream.article_analysis_config if stream.article_analysis_config else None,
            status=ExecutionStatus.PENDING
        )
        execution_id = execution.id
        await db.commit()

        # Wake up the scheduler immediately so it picks up this job
        worker_state.wake_scheduler()

        logger.info(f"trigger_run success - execution_id={execution_id}, stream={stream.stream_name}, dates={start_date} to {end_date}")

        return TriggerRunResponse(
            execution_id=execution_id,
            stream_id=request.stream_id,
            status="pending",
            message=f"Pipeline run queued for stream {stream.stream_name}"
        )

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"trigger_run database error - stream_id={request.stream_id}: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while creating execution"
        )
    except Exception as e:
        logger.error(f"trigger_run unexpected error - stream_id={request.stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to trigger run"
        )


@router.get("/runs", response_model=List[JobStatusResponse])
async def list_runs(
    status_filter: Optional[str] = None,
    limit: int = 20,
    db: AsyncSession = Depends(get_async_db)
):
    """List recent pipeline executions"""
    logger.info(f"list_runs called - status_filter={status_filter}, limit={limit}")

    try:
        stmt = select(PipelineExecution).order_by(PipelineExecution.created_at.desc())

        if status_filter:
            try:
                exec_status = ExecutionStatus(status_filter)
                stmt = stmt.where(PipelineExecution.status == exec_status)
            except ValueError:
                logger.warning(f"list_runs invalid status filter: {status_filter}")
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid status: {status_filter}. Valid values: pending, running, completed, failed"
                )

        stmt = stmt.limit(limit)
        result = await db.execute(stmt)
        executions = list(result.scalars().all())

        logger.info(f"list_runs returning {len(executions)} executions")

        return [
            JobStatusResponse(
                execution_id=e.id,
                stream_id=e.stream_id,
                status=e.status.value,
                run_type=e.run_type.value,
                started_at=e.started_at,
                completed_at=e.completed_at,
                error=e.error
            )
            for e in executions
        ]

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"list_runs database error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while fetching executions"
        )
    except Exception as e:
        logger.error(f"list_runs unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to list runs"
        )


@router.get("/runs/{execution_id}", response_model=JobStatusResponse)
async def get_run_status(
    execution_id: str,
    db: AsyncSession = Depends(get_async_db)
):
    """Get status of a specific execution"""
    logger.debug(f"get_run_status called - execution_id={execution_id}")

    try:
        execution_service = ExecutionService(db)
        execution = await execution_service.get_by_id(execution_id)

        if not execution:
            logger.warning(f"get_run_status - execution {execution_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Execution {execution_id} not found"
            )

        return JobStatusResponse(
            execution_id=execution.id,
            stream_id=execution.stream_id,
            status=execution.status.value,
            run_type=execution.run_type.value,
            started_at=execution.started_at,
            completed_at=execution.completed_at,
            error=execution.error
        )

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"get_run_status database error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while fetching execution"
        )
    except Exception as e:
        logger.error(f"get_run_status unexpected error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get run status"
        )


@router.get("/runs/{execution_id}/stream")
async def stream_run_status(
    execution_id: str,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Stream status updates for a running execution via SSE.

    Connect to this endpoint to receive real-time status updates.
    The stream ends when the job completes or fails.
    """
    logger.info(f"stream_run_status called - execution_id={execution_id}")

    # Verify execution exists
    try:
        execution_service = ExecutionService(db)
        execution = await execution_service.get_by_id(execution_id)

        if not execution:
            logger.warning(f"stream_run_status - execution {execution_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Execution {execution_id} not found"
            )

        # If already completed, return immediately with final status
        if execution.status in [ExecutionStatus.COMPLETED, ExecutionStatus.FAILED]:
            logger.info(f"stream_run_status - execution {execution_id} already {execution.status.value}")

            async def completed_stream() -> AsyncGenerator[str, None]:
                data = {
                    "execution_id": execution_id,
                    "stage": execution.status.value,
                    "message": execution.error if execution.error else "Completed",
                    "timestamp": execution.completed_at.isoformat() if execution.completed_at else None
                }
                yield f"data: {json.dumps(data)}\n\n"

            return StreamingResponse(
                completed_stream(),
                media_type="text/event-stream",
                headers={
                    "Cache-Control": "no-cache",
                    "Connection": "keep-alive",
                }
            )

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"stream_run_status database error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error"
        )

    # Subscribe to status updates
    async def event_stream() -> AsyncGenerator[str, None]:
        queue = await broker.subscribe(execution_id)
        try:
            logger.debug(f"Client subscribed to execution {execution_id}")
            while True:
                try:
                    # Wait for status update with timeout
                    update = await asyncio.wait_for(queue.get(), timeout=30.0)
                    logger.debug(f"Update: {update}")

                    if update is None:
                        # Sentinel value - stream complete
                        logger.debug(f"Stream complete for execution {execution_id}")
                        break

                    data = update.to_dict()
                    yield f"data: {json.dumps(data)}\n\n"

                    # If this was a completion message, we're done
                    if update.stage in ["completed", "failed"]:
                        break

                except asyncio.TimeoutError:
                    # Send keepalive
                    yield f": keepalive\n\n"

        except asyncio.CancelledError:
            logger.debug(f"Stream cancelled for execution {execution_id}")
        finally:
            await broker.unsubscribe(execution_id, queue)
            logger.debug(f"Client unsubscribed from execution {execution_id}")

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )


@router.delete("/runs/{execution_id}")
async def cancel_run(
    execution_id: str,
    db: AsyncSession = Depends(get_async_db)
):
    """
    Request cancellation of a running job.

    Note: Actual cancellation depends on the worker's ability to interrupt.
    """
    logger.info(f"cancel_run called - execution_id={execution_id}")

    try:
        execution_service = ExecutionService(db)
        execution = await execution_service.get_by_id(execution_id)

        if not execution:
            logger.warning(f"cancel_run - execution {execution_id} not found")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Execution {execution_id} not found"
            )

        if execution.status not in [ExecutionStatus.PENDING, ExecutionStatus.RUNNING]:
            logger.warning(f"cancel_run - cannot cancel execution {execution_id} with status {execution.status.value}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot cancel execution with status: {execution.status.value}"
            )

        # For pending jobs, we can just mark as failed
        if execution.status == ExecutionStatus.PENDING:
            await execution_service.mark_failed(execution_id, "Cancelled by user")
            await db.commit()
            logger.info(f"cancel_run - cancelled pending execution {execution_id}")
            return {"message": "Execution cancelled", "execution_id": execution_id}

        # For running jobs, we'd need to signal the worker
        # This is a placeholder - actual implementation depends on worker architecture
        logger.info(f"cancel_run - cancellation requested for running execution {execution_id}")
        return {
            "message": "Cancellation requested (running jobs may not stop immediately)",
            "execution_id": execution_id
        }

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"cancel_run database error - execution_id={execution_id}: {e}", exc_info=True)
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database error while cancelling execution"
        )
    except Exception as e:
        logger.error(f"cancel_run unexpected error - execution_id={execution_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to cancel run"
        )


@router.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint"""
    logger.debug("health_check called")
    return HealthResponse(
        status="healthy",
        timestamp=datetime.utcnow()
    )
