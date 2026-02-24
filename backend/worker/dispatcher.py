"""
Job Dispatcher

Executes jobs by calling pipeline_service.run_pipeline().
Manages job lifecycle (status updates, error handling).

The dispatcher reads ALL configuration from PipelineExecution.
run_pipeline() only takes execution_id - it reads everything else from the execution record.
"""

import logging
import asyncio
from datetime import datetime, date, timedelta, time
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from models import ResearchStream, PipelineExecution, ExecutionStatus, RunType, Report
from services.pipeline_service import PipelineService
from services.execution_service import ExecutionService
from services.user_service import UserService
from services.email_service import get_email_service
from worker.status_broker import broker

# Day name -> weekday number (Monday=0 .. Sunday=6)
DAY_NAME_TO_NUM = {
    'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
    'friday': 4, 'saturday': 5, 'sunday': 6,
}

# Frequency -> lookback days  (used for date-range calculation)
FREQUENCY_LOOKBACK = {
    'daily': 1,
    'weekly': 7,
    'biweekly': 14,
    'monthly': 30,
}

logger = logging.getLogger('worker.dispatcher')


class JobDispatcher:
    """Dispatches and manages pipeline jobs"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.pipeline_service = PipelineService(db)
        self.execution_service = ExecutionService(db)
        self._running_jobs: Dict[str, asyncio.Task] = {}

    async def execute_pending(self, execution: PipelineExecution) -> None:
        """
        Execute a pending (manually triggered) pipeline execution.

        All configuration is already stored in the execution record.
        Updates execution status throughout lifecycle.
        """
        execution_id = execution.id
        logger.info(f"Dispatching pending execution: {execution_id} for stream {execution.stream_id}")

        try:
            # Re-query and mark as running (via execution_service)
            execution = await self.execution_service.mark_running(execution_id)
            await self.db.commit()
            logger.info(f"Execution {execution_id} marked as RUNNING")

            # Publish starting status
            await broker.publish(execution_id, "starting", f"Starting pipeline for stream {execution.stream_id}")

            # Run pipeline - only pass execution_id, pipeline reads config from execution
            async for status in self.pipeline_service.run_pipeline(execution_id):
                logger.debug(f"[{execution_id}] {status.stage}: {status.message}")
                await broker.publish(execution_id, status.stage, status.message)

            # Mark as completed
            await self.execution_service.mark_completed(execution_id)
            await self.db.commit()

            logger.info(f"Execution {execution_id} completed successfully")
            await broker.publish_complete(execution_id, success=True)

        except Exception as e:
            logger.error(f"Execution {execution_id} failed: {e}", exc_info=True)
            try:
                await self.execution_service.mark_failed(execution_id, str(e))
                await self.db.commit()
            except Exception as inner_e:
                logger.error(f"Failed to mark execution as failed: {inner_e}")
            await broker.publish_complete(execution_id, success=False, error=str(e))

    async def execute_scheduled(self, stream: ResearchStream) -> str:
        """
        Execute a scheduled pipeline run for a stream.

        Creates a PipelineExecution with ALL configuration determined at creation time,
        then runs the pipeline using only the execution_id.

        Returns the execution_id.
        """
        stream_id = stream.stream_id
        logger.info(f"Dispatching scheduled run for stream {stream_id}")

        # Re-query stream from our session (the passed object is from a different session)
        stmt = select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        result = await self.db.execute(stmt)
        stream = result.scalars().first()

        if not stream:
            raise ValueError(f"Stream {stream_id} not found")

        # Calculate date range from frequency
        # End date = day before run day, start = end - lookback + 1
        config = stream.schedule_config or {}
        frequency = config.get('frequency') or 'weekly'
        lookback_days = FREQUENCY_LOOKBACK.get(frequency, 7)

        today = date.today()
        end_date_obj = today - timedelta(days=1)  # Day before run
        start_date_obj = end_date_obj - timedelta(days=lookback_days - 1)

        end_date = end_date_obj.strftime('%Y-%m-%d')
        start_date = start_date_obj.strftime('%Y-%m-%d')

        # Create execution (via execution_service) - starts as RUNNING for scheduled runs
        execution = await self.execution_service.create_from_stream(
            stream=stream,
            run_type=RunType.SCHEDULED,
            start_date=start_date,
            end_date=end_date,
            report_name=None,  # Auto-generated for scheduled runs
            status=ExecutionStatus.RUNNING
        )
        execution_id = execution.id
        await self.db.commit()

        logger.info(f"Created execution {execution_id} for stream {stream_id}")

        try:
            # Publish starting status
            await broker.publish(execution_id, "starting", f"Starting scheduled pipeline for stream {stream.stream_id}")

            # Run pipeline - only pass execution_id
            async for status in self.pipeline_service.run_pipeline(execution_id):
                logger.debug(f"[{execution_id}] {status.stage}: {status.message}")
                await broker.publish(execution_id, status.stage, status.message)

            # Mark as completed
            await self.execution_service.mark_completed(execution_id)

            # Update next_scheduled_run on the stream
            self._update_next_scheduled_run(stream)

            await self.db.commit()

            logger.info(f"Scheduled execution {execution_id} completed successfully")
            await broker.publish_complete(execution_id, success=True)

            # Notify admins of successful completion
            await self._notify_admins_scheduled_complete(
                execution_id=execution_id,
                stream_name=stream.stream_name,
                success=True,
            )

        except Exception as e:
            logger.error(f"Scheduled execution {execution_id} failed: {e}", exc_info=True)
            try:
                await self.execution_service.mark_failed(execution_id, str(e))
            except Exception as inner_e:
                logger.error(f"Failed to mark execution as failed: {inner_e}")

            # Still update next_scheduled_run even on failure
            self._update_next_scheduled_run(stream)

            await self.db.commit()
            await broker.publish_complete(execution_id, success=False, error=str(e))

            # Notify admins of failure
            await self._notify_admins_scheduled_complete(
                execution_id=execution_id,
                stream_name=stream.stream_name,
                success=False,
                error_message=str(e),
            )

        return execution_id

    async def _notify_admins_scheduled_complete(
        self,
        execution_id: str,
        stream_name: str,
        success: bool,
        error_message: Optional[str] = None,
    ) -> None:
        """
        Notify platform admins when a scheduled pipeline run completes.

        On success: sends approval request emails with report details.
        On failure: sends failure alert emails.

        Email failures are logged but never break the pipeline flow.
        """
        try:
            user_service = UserService(self.db)
            admins = await user_service.get_admin_users_for_approval(org_id=None)

            if not admins:
                logger.warning("No platform admins found to notify for scheduled run")
                return

            email_service = get_email_service()

            if success:
                # Re-query execution to get report_id
                execution = await self.execution_service.get_by_id(execution_id)
                if not execution or not execution.report_id:
                    logger.warning(f"Cannot notify: execution {execution_id} has no report_id")
                    return

                # Load the report for name and article count
                stmt = select(Report).where(Report.report_id == execution.report_id)
                result = await self.db.execute(stmt)
                report = result.scalars().first()

                if not report:
                    logger.warning(f"Cannot notify: report {execution.report_id} not found")
                    return

                report_name = report.report_name
                article_count = (report.pipeline_metrics or {}).get('final_article_count', 0)

                for admin in admins:
                    admin_name = admin.full_name or admin.email
                    logger.info(f"Sending approval request email to {admin.email} for report {report_name}")
                    await email_service.send_approval_request_email(
                        recipient_email=admin.email,
                        recipient_name=admin_name,
                        report_id=report.report_id,
                        report_name=report_name,
                        stream_name=stream_name,
                        article_count=article_count,
                        requester_name="Scheduled Pipeline",
                    )
            else:
                for admin in admins:
                    admin_name = admin.full_name or admin.email
                    logger.info(f"Sending pipeline failure alert to {admin.email} for stream {stream_name}")
                    await email_service.send_pipeline_failure_alert_email(
                        recipient_email=admin.email,
                        recipient_name=admin_name,
                        execution_id=execution_id,
                        stream_name=stream_name,
                        error_message=error_message or "Unknown error",
                    )

            logger.info(f"Notified {len(admins)} admin(s) about scheduled run completion (success={success})")

        except Exception as e:
            logger.error(f"Failed to notify admins for execution {execution_id}: {e}", exc_info=True)

    def _update_next_scheduled_run(self, stream: ResearchStream) -> None:
        """Calculate and set the next scheduled run time"""
        if not stream.schedule_config:
            return

        next_run = self._calculate_next_run(stream.schedule_config)
        stream.next_scheduled_run = next_run
        logger.debug(f"Updated next_scheduled_run for stream {stream.stream_id}: {next_run}")

    def _calculate_next_run(self, schedule_config: dict) -> datetime:
        """
        Calculate the next scheduled run time based on config.

        For weekly/biweekly: finds the next occurrence of run_day at run_time.
        For daily: tomorrow at run_time.
        For monthly: next run_day_of_month at run_time.

        All calculations respect the configured timezone, then convert to UTC
        for storage (since next_scheduled_run is compared in UTC).
        """
        frequency = schedule_config.get('frequency') or 'weekly'
        tz_name = schedule_config.get('timezone') or 'UTC'
        tz = ZoneInfo(tz_name)

        # Parse preferred_time / run_time (HH:MM)
        run_time_str = schedule_config.get('preferred_time') or '03:00'
        hour, minute = (int(x) for x in run_time_str.split(':'))

        now_local = datetime.now(tz)

        if frequency == 'daily':
            # Tomorrow at run_time
            candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=1)
            return candidate.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)

        elif frequency in ('weekly', 'biweekly'):
            run_day_name = schedule_config.get('anchor_day') or 'monday'
            target_weekday = DAY_NAME_TO_NUM.get(run_day_name.lower(), 0)
            current_weekday = now_local.weekday()

            # Days until next target weekday
            days_ahead = (target_weekday - current_weekday) % 7
            if days_ahead == 0:
                # Same day — schedule for next week (we just ran today)
                days_ahead = 7

            if frequency == 'biweekly':
                days_ahead += 7  # Skip an extra week

            candidate = now_local.replace(hour=hour, minute=minute, second=0, microsecond=0) + timedelta(days=days_ahead)
            return candidate.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)

        elif frequency == 'monthly':
            run_day_of_month = schedule_config.get('run_day_of_month', 1)
            # Next month on run_day_of_month at run_time
            if now_local.month == 12:
                candidate = now_local.replace(year=now_local.year + 1, month=1, day=run_day_of_month,
                                              hour=hour, minute=minute, second=0, microsecond=0)
            else:
                candidate = now_local.replace(month=now_local.month + 1, day=run_day_of_month,
                                              hour=hour, minute=minute, second=0, microsecond=0)
            return candidate.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)

        else:
            # Unknown frequency — default weekly
            return datetime.utcnow() + timedelta(weeks=1)

    def get_running_jobs(self) -> Dict[str, Any]:
        """Get info about currently running jobs"""
        return {
            job_id: {
                'running': not task.done(),
                'cancelled': task.cancelled() if task.done() else False
            }
            for job_id, task in self._running_jobs.items()
        }

    async def cancel_job(self, execution_id: str) -> bool:
        """Attempt to cancel a running job"""
        if execution_id in self._running_jobs:
            task = self._running_jobs[execution_id]
            if not task.done():
                task.cancel()
                logger.info(f"Cancelled job {execution_id}")
                return True
        return False
