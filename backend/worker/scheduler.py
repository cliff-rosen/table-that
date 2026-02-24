"""
Job Discovery & Scheduling

Finds jobs that are ready to run:
1. Scheduled: Streams with schedule_config.enabled=true and next_scheduled_run <= now
2. Manual: PipelineExecutions with status='pending'
"""

import logging
from datetime import datetime
from typing import List, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy import and_, select

from models import ResearchStream, PipelineExecution, ExecutionStatus
from services.execution_service import ExecutionService

logger = logging.getLogger('worker.scheduler')


class JobDiscovery:
    """Discovers jobs ready to be executed"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.execution_service = ExecutionService(db)

    async def find_pending_executions(self) -> List[PipelineExecution]:
        """
        Find manually triggered executions waiting to be picked up.

        Returns executions with status='pending'.
        """
        try:
            return await self.execution_service.find_pending()

        except SQLAlchemyError as e:
            logger.error(f"Database error finding pending executions: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Unexpected error finding pending executions: {e}", exc_info=True)
            raise

    async def find_scheduled_streams(self) -> List[ResearchStream]:
        """
        Find streams due for scheduled execution.

        Returns streams where:
        - schedule_config.enabled = true
        - next_scheduled_run <= now
        """
        try:
            now = datetime.utcnow()

            # Query streams with scheduling enabled and due to run
            stmt = select(ResearchStream).where(
                and_(
                    ResearchStream.schedule_config.isnot(None),
                    ResearchStream.next_scheduled_run.isnot(None),
                    ResearchStream.next_scheduled_run <= now
                )
            )
            result = await self.db.execute(stmt)
            due_streams = list(result.scalars().all())

            # Filter to only enabled schedules (JSON field check)
            enabled_streams = []
            for s in due_streams:
                try:
                    if s.schedule_config and s.schedule_config.get('enabled', False):
                        enabled_streams.append(s)
                except Exception as e:
                    logger.warning(f"Error checking schedule_config for stream {s.stream_id}: {e}")
                    continue

            return enabled_streams

        except SQLAlchemyError as e:
            logger.error(f"Database error finding scheduled streams: {e}", exc_info=True)
            raise
        except Exception as e:
            logger.error(f"Unexpected error finding scheduled streams: {e}", exc_info=True)
            raise

    async def find_all_ready_jobs(self) -> Dict[str, Any]:
        """
        Find all jobs ready to execute.

        Returns:
            {
                'pending_executions': [...],
                'scheduled_streams': [...]
            }
        """
        result = {
            'pending_executions': [],
            'scheduled_streams': []
        }

        try:
            result['pending_executions'] = await self.find_pending_executions()
            logger.debug(f"Found {len(result['pending_executions'])} pending executions")
        except Exception as e:
            logger.error(f"Failed to find pending executions: {e}")
            # Continue to check scheduled streams even if pending check fails

        try:
            result['scheduled_streams'] = await self.find_scheduled_streams()
            logger.debug(f"Found {len(result['scheduled_streams'])} scheduled streams due")
        except Exception as e:
            logger.error(f"Failed to find scheduled streams: {e}")

        return result
