"""
Tool Trace Service

Generic trace management for long-running tool executions.
Provides CRUD operations for the tool_traces table.

Usage:
    service = ToolTraceService(db)

    # Create a trace when starting a tool
    trace_id = await service.create_trace(
        tool_name="deep_research",
        user_id=123,
        input_params={"question": "What is..."}
    )

    # Update progress during execution
    await service.update_progress(
        trace_id=trace_id,
        stage="searching",
        progress=0.3,
        state={"iteration": 1, "results": [...]}
    )

    # Complete the trace
    await service.complete_trace(
        trace_id=trace_id,
        result={"answer": "...", "sources": [...]},
        metrics={"iterations": 3, "sources_found": 42}
    )

    # Or fail the trace
    await service.fail_trace(trace_id=trace_id, error_message="API timeout")
"""

import logging
import uuid
from typing import List, Optional, Dict, Any
from datetime import datetime
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from models import ToolTrace, ToolTraceStatus

logger = logging.getLogger(__name__)


class ToolTraceService:
    """Service for managing tool execution traces."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # CREATE
    # =========================================================================

    async def create_trace(
        self,
        tool_name: str,
        user_id: int,
        input_params: Optional[Dict[str, Any]] = None,
        org_id: Optional[int] = None
    ) -> str:
        """
        Create a new trace for a tool execution.

        Args:
            tool_name: Name of the tool (e.g., "deep_research")
            user_id: ID of the user running the tool
            input_params: Parameters passed to the tool
            org_id: Optional organization ID

        Returns:
            The trace ID (UUID string)
        """
        trace_id = str(uuid.uuid4())

        trace = ToolTrace(
            id=trace_id,
            user_id=user_id,
            org_id=org_id,
            tool_name=tool_name,
            input_params=input_params or {},
            status=ToolTraceStatus.PENDING,
            progress=0.0,
            state={},
            metrics={},
            created_at=datetime.utcnow()
        )

        self.db.add(trace)
        await self.db.commit()

        logger.info(f"Created trace {trace_id} for tool {tool_name}, user {user_id}")
        return trace_id

    # =========================================================================
    # READ
    # =========================================================================

    async def get_trace(self, trace_id: str) -> Optional[ToolTrace]:
        """Get a trace by ID."""
        stmt = select(ToolTrace).where(ToolTrace.id == trace_id)
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def get_trace_for_user(
        self,
        trace_id: str,
        user_id: int
    ) -> Optional[ToolTrace]:
        """Get a trace by ID, ensuring it belongs to the user."""
        stmt = select(ToolTrace).where(
            ToolTrace.id == trace_id,
            ToolTrace.user_id == user_id
        )
        result = await self.db.execute(stmt)
        return result.scalars().first()

    async def list_traces(
        self,
        user_id: int,
        tool_name: Optional[str] = None,
        status: Optional[ToolTraceStatus] = None,
        limit: int = 50,
        offset: int = 0
    ) -> List[ToolTrace]:
        """
        List traces for a user with optional filters.

        Args:
            user_id: Filter by user
            tool_name: Optional filter by tool name
            status: Optional filter by status
            limit: Max results to return
            offset: Pagination offset

        Returns:
            List of traces, ordered by created_at descending
        """
        conditions = [ToolTrace.user_id == user_id]

        if tool_name:
            conditions.append(ToolTrace.tool_name == tool_name)
        if status:
            conditions.append(ToolTrace.status == status)

        stmt = (
            select(ToolTrace)
            .where(*conditions)
            .order_by(desc(ToolTrace.created_at))
            .offset(offset)
            .limit(limit)
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_active_traces(
        self,
        user_id: int,
        tool_name: Optional[str] = None
    ) -> List[ToolTrace]:
        """Get all in-progress traces for a user."""
        conditions = [
            ToolTrace.user_id == user_id,
            ToolTrace.status == ToolTraceStatus.IN_PROGRESS
        ]

        if tool_name:
            conditions.append(ToolTrace.tool_name == tool_name)

        stmt = (
            select(ToolTrace)
            .where(*conditions)
            .order_by(desc(ToolTrace.created_at))
        )

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    # =========================================================================
    # UPDATE
    # =========================================================================

    async def start_trace(self, trace_id: str) -> bool:
        """
        Mark a trace as started (in_progress).

        Returns:
            True if updated, False if trace not found
        """
        trace = await self.get_trace(trace_id)
        if not trace:
            return False

        trace.status = ToolTraceStatus.IN_PROGRESS
        trace.started_at = datetime.utcnow()
        await self.db.commit()

        logger.info(f"Started trace {trace_id}")
        return True

    async def update_progress(
        self,
        trace_id: str,
        stage: Optional[str] = None,
        progress: Optional[float] = None,
        state: Optional[Dict[str, Any]] = None,
        merge_state: bool = True
    ) -> bool:
        """
        Update the progress of a trace.

        Args:
            trace_id: The trace to update
            stage: Current stage name (e.g., "searching", "processing")
            progress: Progress value 0.0 to 1.0
            state: State data to store
            merge_state: If True, merge with existing state. If False, replace.

        Returns:
            True if updated, False if trace not found
        """
        trace = await self.get_trace(trace_id)
        if not trace:
            return False

        # Ensure trace is in progress
        if trace.status == ToolTraceStatus.PENDING:
            trace.status = ToolTraceStatus.IN_PROGRESS
            trace.started_at = datetime.utcnow()

        if stage is not None:
            trace.current_stage = stage

        if progress is not None:
            trace.progress = max(0.0, min(1.0, progress))

        if state is not None:
            if merge_state and trace.state:
                # Merge new state into existing
                merged = dict(trace.state)
                merged.update(state)
                trace.state = merged
            else:
                trace.state = state

        await self.db.commit()
        return True

    async def complete_trace(
        self,
        trace_id: str,
        result: Optional[Dict[str, Any]] = None,
        metrics: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Mark a trace as completed with its result.

        Args:
            trace_id: The trace to complete
            result: The final result data
            metrics: Execution metrics

        Returns:
            True if updated, False if trace not found
        """
        trace = await self.get_trace(trace_id)
        if not trace:
            return False

        trace.status = ToolTraceStatus.COMPLETED
        trace.progress = 1.0
        trace.completed_at = datetime.utcnow()

        if result is not None:
            trace.result = result

        if metrics is not None:
            trace.metrics = metrics

        await self.db.commit()

        logger.info(f"Completed trace {trace_id}")
        return True

    async def fail_trace(
        self,
        trace_id: str,
        error_message: str,
        metrics: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Mark a trace as failed with an error message.

        Args:
            trace_id: The trace to fail
            error_message: Description of the error
            metrics: Optional execution metrics up to failure

        Returns:
            True if updated, False if trace not found
        """
        trace = await self.get_trace(trace_id)
        if not trace:
            return False

        trace.status = ToolTraceStatus.FAILED
        trace.error_message = error_message
        trace.completed_at = datetime.utcnow()

        if metrics is not None:
            trace.metrics = metrics

        await self.db.commit()

        logger.warning(f"Failed trace {trace_id}: {error_message}")
        return True

    async def cancel_trace(self, trace_id: str) -> bool:
        """
        Mark a trace as cancelled.

        Returns:
            True if updated, False if trace not found
        """
        trace = await self.get_trace(trace_id)
        if not trace:
            return False

        trace.status = ToolTraceStatus.CANCELLED
        trace.completed_at = datetime.utcnow()
        await self.db.commit()

        logger.info(f"Cancelled trace {trace_id}")
        return True

    # =========================================================================
    # DELETE
    # =========================================================================

    async def delete_trace(self, trace_id: str, user_id: int) -> bool:
        """
        Delete a trace (must belong to user).

        Returns:
            True if deleted, False if not found or unauthorized
        """
        trace = await self.get_trace_for_user(trace_id, user_id)
        if not trace:
            return False

        await self.db.delete(trace)
        await self.db.commit()

        logger.info(f"Deleted trace {trace_id}")
        return True

    async def delete_old_traces(
        self,
        user_id: int,
        tool_name: Optional[str] = None,
        keep_count: int = 50
    ) -> int:
        """
        Delete old traces for a user, keeping the most recent ones.

        Args:
            user_id: User whose traces to clean up
            tool_name: Optional filter by tool name
            keep_count: Number of recent traces to keep

        Returns:
            Number of traces deleted
        """
        # Get traces to keep (most recent)
        conditions = [ToolTrace.user_id == user_id]
        if tool_name:
            conditions.append(ToolTrace.tool_name == tool_name)

        keep_stmt = (
            select(ToolTrace.id)
            .where(*conditions)
            .order_by(desc(ToolTrace.created_at))
            .limit(keep_count)
        )
        keep_result = await self.db.execute(keep_stmt)
        keep_ids = {row[0] for row in keep_result.all()}

        # Get all traces for user/tool
        all_stmt = select(ToolTrace).where(*conditions)
        all_result = await self.db.execute(all_stmt)
        all_traces = all_result.scalars().all()

        # Delete traces not in keep list
        deleted = 0
        for trace in all_traces:
            if trace.id not in keep_ids:
                await self.db.delete(trace)
                deleted += 1

        if deleted > 0:
            await self.db.commit()
            logger.info(f"Deleted {deleted} old traces for user {user_id}")

        return deleted
