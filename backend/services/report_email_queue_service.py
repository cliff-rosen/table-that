"""
Report Email Queue Service

Manages the email queue for scheduled report delivery.
- Queue entries for sending reports to subscribers
- Get subscribers for a report's stream
- Process queue (mark ready, send emails)
"""

import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, select, func
from typing import List, Optional, Tuple
from datetime import datetime, date, timedelta
from fastapi import Depends

try:
    from zoneinfo import ZoneInfo
except ImportError:
    from backports.zoneinfo import ZoneInfo

from models import (
    ReportEmailQueue, ReportEmailQueueStatus,
    Report, User, ResearchStream,
)
from schemas.report_email_queue import (
    ReportEmailQueueCreate,
    ReportEmailQueue as ReportEmailQueueSchema,
    ReportEmailQueueWithDetails,
    BulkScheduleRequest,
    BulkScheduleResponse,
)
from database import get_async_db
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# Day name -> weekday number (Monday=0 .. Sunday=6)
DAY_NAME_TO_NUM = {
    'monday': 0, 'tuesday': 1, 'wednesday': 2, 'thursday': 3,
    'friday': 4, 'saturday': 5, 'sunday': 6,
}


@dataclass
class ProcessQueueResult:
    """Result of processing the email queue."""
    total_processed: int = 0
    sent_count: int = 0
    failed_count: int = 0
    skipped_count: int = 0  # Already processed or not ready
    errors: List[str] = field(default_factory=list)


class ReportEmailQueueService:
    """Service for managing the report email queue."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._subscription_service = None
        self._stream_service = None
        self._report_service = None

    @property
    def subscription_service(self):
        if self._subscription_service is None:
            from services.subscription_service import SubscriptionService
            self._subscription_service = SubscriptionService(self.db)
        return self._subscription_service

    @property
    def stream_service(self):
        if self._stream_service is None:
            from services.research_stream_service import ResearchStreamService
            self._stream_service = ResearchStreamService(self.db)
        return self._stream_service

    @property
    def report_service(self):
        if self._report_service is None:
            from services.report_service import ReportService
            self._report_service = ReportService(self.db)
        return self._report_service

    # ==================== Queue Management ====================

    async def get_queue_entries(
        self,
        status_filter: Optional[ReportEmailQueueStatus] = None,
        scheduled_from: Optional[date] = None,
        scheduled_to: Optional[date] = None,
        report_id: Optional[int] = None,
        limit: int = 100,
        offset: int = 0,
    ) -> Tuple[List[ReportEmailQueueWithDetails], int]:
        """Get queue entries with optional filters."""

        # Build base query
        conditions = []

        if status_filter:
            conditions.append(ReportEmailQueue.status == status_filter)

        if scheduled_from:
            conditions.append(ReportEmailQueue.scheduled_for >= scheduled_from)

        if scheduled_to:
            conditions.append(ReportEmailQueue.scheduled_for <= scheduled_to)

        if report_id:
            conditions.append(ReportEmailQueue.report_id == report_id)

        # Get total count
        count_query = select(func.count(ReportEmailQueue.id))
        if conditions:
            count_query = count_query.where(and_(*conditions))
        count_result = await self.db.execute(count_query)
        total = count_result.scalar() or 0

        # Get entries with joins
        query = (
            select(ReportEmailQueue, Report, User, ResearchStream)
            .join(Report, ReportEmailQueue.report_id == Report.report_id)
            .join(User, ReportEmailQueue.user_id == User.user_id)
            .outerjoin(ResearchStream, Report.research_stream_id == ResearchStream.stream_id)
        )

        if conditions:
            query = query.where(and_(*conditions))

        query = (
            query
            .order_by(ReportEmailQueue.scheduled_for.desc(), ReportEmailQueue.created_at.desc())
            .limit(limit)
            .offset(offset)
        )

        result = await self.db.execute(query)
        rows = result.all()

        entries = []
        for queue_entry, report, user, stream in rows:
            entries.append(ReportEmailQueueWithDetails(
                id=queue_entry.id,
                report_id=queue_entry.report_id,
                user_id=queue_entry.user_id,
                email=queue_entry.email,
                status=queue_entry.status,
                scheduled_for=queue_entry.scheduled_for,
                created_at=queue_entry.created_at,
                updated_at=queue_entry.updated_at,
                sent_at=queue_entry.sent_at,
                error_message=queue_entry.error_message,
                report_name=report.report_name if report else None,
                user_full_name=user.full_name if user else None,
                stream_name=stream.stream_name if stream else None,
            ))

        return entries, total

    async def get_entry_by_id(self, entry_id: int) -> Optional[ReportEmailQueue]:
        """Get a single queue entry by ID."""
        result = await self.db.execute(
            select(ReportEmailQueue).where(ReportEmailQueue.id == entry_id)
        )
        return result.scalars().first()

    async def create_entry(self, data: ReportEmailQueueCreate) -> ReportEmailQueue:
        """Create a single queue entry."""
        entry = ReportEmailQueue(
            report_id=data.report_id,
            user_id=data.user_id,
            email=data.email,
            scheduled_for=data.scheduled_for,
            status=ReportEmailQueueStatus.SCHEDULED,
        )
        self.db.add(entry)
        await self.db.commit()
        await self.db.refresh(entry)
        return entry

    async def check_duplicate(
        self,
        report_id: int,
        user_id: int,
        scheduled_for: datetime,
    ) -> bool:
        """Check if a duplicate entry exists (same report, user, datetime)."""
        result = await self.db.execute(
            select(ReportEmailQueue.id).where(
                and_(
                    ReportEmailQueue.report_id == report_id,
                    ReportEmailQueue.user_id == user_id,
                    ReportEmailQueue.scheduled_for == scheduled_for,
                    # Only check non-terminal statuses
                    ReportEmailQueue.status.in_([
                        ReportEmailQueueStatus.SCHEDULED,
                        ReportEmailQueueStatus.READY,
                        ReportEmailQueueStatus.PROCESSING,
                    ])
                )
            )
        )
        return result.scalars().first() is not None

    async def schedule_emails(
        self, request: BulkScheduleRequest
    ) -> BulkScheduleResponse:
        """
        Schedule emails for multiple users.
        Skips duplicates and users without emails.
        """
        # Get user emails
        result = await self.db.execute(
            select(User).where(User.user_id.in_(request.user_ids))
        )
        users = {u.user_id: u for u in result.scalars().all()}

        scheduled_entries = []
        skipped_count = 0

        for user_id in request.user_ids:
            user = users.get(user_id)

            # Skip if user not found or no email
            if not user or not user.email:
                skipped_count += 1
                logger.warning(f"Skipping user {user_id}: not found or no email")
                continue

            # Skip if duplicate exists
            if await self.check_duplicate(request.report_id, user_id, request.scheduled_for):
                skipped_count += 1
                logger.info(f"Skipping duplicate: report={request.report_id}, user={user_id}, date={request.scheduled_for}")
                continue

            # Create entry
            entry = ReportEmailQueue(
                report_id=request.report_id,
                user_id=user_id,
                email=user.email,
                scheduled_for=request.scheduled_for,
                status=ReportEmailQueueStatus.SCHEDULED,
            )
            self.db.add(entry)
            scheduled_entries.append(entry)

        if scheduled_entries:
            await self.db.commit()
            # Refresh all entries to get IDs
            for entry in scheduled_entries:
                await self.db.refresh(entry)

        logger.info(
            f"Scheduled {len(scheduled_entries)} emails for report {request.report_id}, "
            f"skipped {skipped_count}"
        )

        return BulkScheduleResponse(
            scheduled_count=len(scheduled_entries),
            skipped_count=skipped_count,
            queue_entries=[
                ReportEmailQueueSchema.model_validate(e) for e in scheduled_entries
            ],
        )

    async def cancel_entry(self, entry_id: int) -> bool:
        """
        Cancel a scheduled entry.
        Only works for scheduled/ready status.
        """
        entry = await self.get_entry_by_id(entry_id)

        if not entry:
            return False

        if entry.status not in [ReportEmailQueueStatus.SCHEDULED, ReportEmailQueueStatus.READY]:
            logger.warning(
                f"Cannot cancel entry {entry_id}: status is {entry.status}"
            )
            return False

        await self.db.delete(entry)
        await self.db.commit()

        logger.info(f"Cancelled email queue entry {entry_id}")
        return True

    async def update_status(
        self,
        entry_id: int,
        new_status: ReportEmailQueueStatus,
        error_message: Optional[str] = None,
    ) -> Optional[ReportEmailQueue]:
        """Update the status of a queue entry."""
        entry = await self.get_entry_by_id(entry_id)

        if not entry:
            return None

        entry.status = new_status

        if new_status == ReportEmailQueueStatus.SENT:
            entry.sent_at = datetime.utcnow()

        if error_message:
            entry.error_message = error_message

        await self.db.commit()
        await self.db.refresh(entry)

        return entry

    # ==================== Report & Subscriber Helpers ====================

    async def get_approved_reports(self, limit: int = 50) -> List[Report]:
        """Get approved reports for the dropdown."""
        return await self.report_service.get_approved_reports(limit)

    async def get_stream_subscribers(self, report_id: int) -> List[User]:
        """
        Get all users subscribed to the stream of a given report.
        Delegates subscriber resolution to SubscriptionService.
        """
        # Get the report via its owning service
        report = await self.report_service.get_report_by_id_internal(report_id)
        if not report or not report.research_stream_id:
            return []

        # Get the stream via its owning service
        try:
            stream = await self.stream_service.get_stream_by_id(report.research_stream_id)
        except ValueError:
            return []

        # Delegate subscriber resolution to SubscriptionService
        return await self.subscription_service.get_subscribed_users_for_stream(stream)

    # ==================== Auto-Queue on Approval ====================

    @staticmethod
    def calculate_send_datetime(schedule_config: dict, reference_date: date) -> datetime:
        """
        Calculate the send datetime for a report based on schedule config.

        For weekly/biweekly: the next occurrence of send_day at send_time on or after reference_date.
        For daily: reference_date at send_time (or next day if send_time < run_time).
        For monthly: send_day_of_month at send_time.

        Returns a naive UTC datetime.
        """
        tz_name = schedule_config.get('timezone') or 'UTC'
        tz = ZoneInfo(tz_name)
        frequency = schedule_config.get('frequency') or 'weekly'

        send_time_str = schedule_config.get('send_time') or '08:00'
        s_hour, s_minute = (int(x) for x in send_time_str.split(':'))

        if frequency in ('weekly', 'biweekly'):
            send_day_name = schedule_config.get('send_day') or schedule_config.get('anchor_day') or 'monday'
            target_weekday = DAY_NAME_TO_NUM.get(send_day_name.lower(), 0)
            ref_weekday = reference_date.weekday()

            days_ahead = (target_weekday - ref_weekday) % 7
            if days_ahead == 0:
                # Same day as reference — check if send_time is after run_time
                run_time_str = schedule_config.get('preferred_time') or '03:00'
                r_hour, r_minute = (int(x) for x in run_time_str.split(':'))
                if (s_hour, s_minute) <= (r_hour, r_minute):
                    days_ahead = 7  # Next week

            send_date = reference_date + timedelta(days=days_ahead)

        elif frequency == 'daily':
            # Same day unless send_time <= run_time
            run_time_str = schedule_config.get('preferred_time') or '03:00'
            r_hour, r_minute = (int(x) for x in run_time_str.split(':'))
            if (s_hour, s_minute) <= (r_hour, r_minute):
                send_date = reference_date + timedelta(days=1)
            else:
                send_date = reference_date

        elif frequency == 'monthly':
            send_day_of_month = schedule_config.get('send_day_of_month',
                                                     schedule_config.get('run_day_of_month', 1))
            if send_day_of_month >= reference_date.day:
                send_date = reference_date.replace(day=send_day_of_month)
            else:
                # Next month
                if reference_date.month == 12:
                    send_date = reference_date.replace(year=reference_date.year + 1, month=1, day=send_day_of_month)
                else:
                    send_date = reference_date.replace(month=reference_date.month + 1, day=send_day_of_month)
        else:
            send_date = reference_date

        # Build timezone-aware datetime, then convert to naive UTC
        local_dt = datetime(send_date.year, send_date.month, send_date.day,
                            s_hour, s_minute, 0, tzinfo=tz)
        return local_dt.astimezone(ZoneInfo('UTC')).replace(tzinfo=None)

    async def auto_queue_for_approved_report(self, report_id: int) -> int:
        """
        Queue emails for all stream subscribers of an approved report.

        Called from approve_report(). Loads the report's stream and schedule_config,
        calculates the send datetime, resolves subscribers, and creates queue entries.

        Does NOT commit — caller commits atomically with the approval.

        Returns the number of entries queued.
        """
        # Load the report via its owning service
        report = await self.report_service.get_report_by_id_internal(report_id)
        if not report or not report.research_stream_id:
            logger.warning(f"auto_queue: report {report_id} not found or has no stream")
            return 0

        # Load the stream via its owning service
        try:
            stream = await self.stream_service.get_stream_by_id(report.research_stream_id)
        except ValueError:
            logger.warning(f"auto_queue: stream {report.research_stream_id} not found")
            return 0

        config = stream.schedule_config or {}

        # Only auto-queue if schedule has send_time configured
        if not config.get('send_time'):
            logger.info(f"auto_queue: no send_time for stream {stream.stream_id}, skipping")
            return 0

        # Calculate the send datetime from today
        send_dt = self.calculate_send_datetime(config, date.today())
        logger.info(f"auto_queue: report {report_id}, send_dt={send_dt}")

        # Get subscribers
        subscribers = await self.get_stream_subscribers(report_id)
        if not subscribers:
            logger.info(f"auto_queue: no subscribers for stream {stream.stream_id}")
            return 0

        queued_count = 0
        for user in subscribers:
            if not user.email:
                logger.warning(f"auto_queue: skipping user {user.user_id}: no email")
                continue

            # Check for duplicates
            is_dup = await self.check_duplicate(report_id, user.user_id, send_dt)
            if is_dup:
                continue

            entry = ReportEmailQueue(
                report_id=report_id,
                user_id=user.user_id,
                email=user.email,
                scheduled_for=send_dt,
                status=ReportEmailQueueStatus.SCHEDULED,
            )
            self.db.add(entry)
            queued_count += 1

        logger.info(f"auto_queue: queued {queued_count} emails for report {report_id} (send at {send_dt})")
        return queued_count

    # ==================== Queue Processing ====================

    async def process_queue(self, as_of: Optional[datetime] = None, force_all: bool = False) -> ProcessQueueResult:
        """
        Process all scheduled emails that are due.

        Queue entries only exist for approved reports (created at approval time),
        so only the time gate is needed: scheduled_for <= now AND status = scheduled.

        Args:
            as_of: Datetime to process as of (defaults to now)
            force_all: If True, skip the time gate

        Returns:
            ProcessQueueResult with counts and any errors
        """
        from services.report_service import ReportService
        from services.email_service import get_email_service

        if as_of is None:
            as_of = datetime.utcnow()

        result = ProcessQueueResult()

        # Find all scheduled entries that are due (no approval gate needed —
        # entries are only created when a report is approved)
        if force_all:
            query = (
                select(ReportEmailQueue)
                .where(ReportEmailQueue.status == ReportEmailQueueStatus.SCHEDULED)
            )
            logger.info(f"Processing ALL scheduled emails (force_all=True)")
        else:
            query = (
                select(ReportEmailQueue)
                .where(
                    and_(
                        ReportEmailQueue.scheduled_for <= as_of,
                        ReportEmailQueue.status == ReportEmailQueueStatus.SCHEDULED,
                    )
                )
            )
        entries_result = await self.db.execute(query)
        entries = list(entries_result.scalars().all())

        if not entries:
            count_result = await self.db.execute(
                select(func.count(ReportEmailQueue.id)).where(
                    ReportEmailQueue.status == ReportEmailQueueStatus.SCHEDULED
                )
            )
            total_scheduled = count_result.scalar() or 0
            logger.info(
                f"No ready emails to process as of {as_of}. "
                f"Total scheduled entries in DB: {total_scheduled}"
            )
            return result

        logger.info(f"Processing {len(entries)} scheduled emails as of {as_of}")

        # Step 2: Mark all as ready
        for entry in entries:
            entry.status = ReportEmailQueueStatus.READY
        await self.db.commit()

        # Step 3: Process each entry
        # Get services
        email_service = get_email_service()

        # Group entries by report_id to avoid regenerating email HTML multiple times
        entries_by_report: dict[int, List[ReportEmailQueue]] = {}
        for entry in entries:
            if entry.report_id not in entries_by_report:
                entries_by_report[entry.report_id] = []
            entries_by_report[entry.report_id].append(entry)

        # Process each report's emails
        for report_id, report_entries in entries_by_report.items():
            # Generate email HTML once per report
            try:
                # Create a temporary report service with the current db session
                report_service = ReportService(self.db)

                # We need a user to generate the email - use the first entry's user
                # Note: generate_report_email_html checks access, so we need a user with access
                # For admin-triggered sends, we'll create a synthetic admin user check
                first_entry = report_entries[0]

                # Get a user who has access to this report (the recipient should have access)
                user_result = await self.db.execute(
                    select(User).where(User.user_id == first_entry.user_id)
                )
                user = user_result.scalars().first()

                if not user:
                    error_msg = f"User {first_entry.user_id} not found for report {report_id}"
                    logger.error(error_msg)
                    for entry in report_entries:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = error_msg
                        result.failed_count += 1
                        result.errors.append(error_msg)
                    await self.db.commit()
                    continue

                # Generate email HTML
                email_result = await report_service.generate_report_email_html(user, report_id)

                if not email_result or not email_result.html:
                    error_msg = f"Failed to generate email HTML for report {report_id}"
                    logger.error(error_msg)
                    for entry in report_entries:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = error_msg
                        result.failed_count += 1
                        result.errors.append(error_msg)
                    await self.db.commit()
                    continue

                # Send to each recipient
                for entry in report_entries:
                    result.total_processed += 1

                    # Mark as processing
                    entry.status = ReportEmailQueueStatus.PROCESSING
                    await self.db.commit()

                    try:
                        # Send the email
                        success = await email_service.send_report_email(
                            to_email=entry.email,
                            report_name=email_result.report_name,
                            html_content=email_result.html,
                            subject=email_result.subject,
                            from_name=email_result.from_name,
                            images=email_result.images,
                        )

                        if success:
                            entry.status = ReportEmailQueueStatus.SENT
                            entry.sent_at = datetime.utcnow()
                            result.sent_count += 1
                            logger.info(f"Email sent successfully to {entry.email} for report {report_id}")
                        else:
                            entry.status = ReportEmailQueueStatus.FAILED
                            entry.error_message = "Email service returned failure"
                            result.failed_count += 1
                            result.errors.append(f"Failed to send to {entry.email}")
                            logger.error(f"Email service failed for {entry.email}")

                    except Exception as e:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = str(e)[:500]  # Truncate long errors
                        result.failed_count += 1
                        result.errors.append(f"Error sending to {entry.email}: {str(e)}")
                        logger.error(f"Exception sending email to {entry.email}: {e}", exc_info=True)

                    await self.db.commit()

            except Exception as e:
                error_msg = f"Error processing report {report_id}: {str(e)}"
                logger.error(error_msg, exc_info=True)
                for entry in report_entries:
                    if entry.status in [ReportEmailQueueStatus.READY, ReportEmailQueueStatus.PROCESSING]:
                        entry.status = ReportEmailQueueStatus.FAILED
                        entry.error_message = str(e)[:500]
                        result.failed_count += 1
                        result.errors.append(error_msg)
                await self.db.commit()

        logger.info(
            f"Queue processing complete: {result.total_processed} processed, "
            f"{result.sent_count} sent, {result.failed_count} failed"
        )
        return result


# Dependency injection provider
async def get_report_email_queue_service(
    db: AsyncSession = Depends(get_async_db)
) -> ReportEmailQueueService:
    """Get a ReportEmailQueueService instance with async database session."""
    return ReportEmailQueueService(db)
