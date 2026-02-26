"""
Event Tracking Service

Owns the user_events table. Handles persisting tracking events
and querying them for admin views.
"""

from dataclasses import dataclass
from typing import List, Optional, Tuple
from datetime import datetime, timedelta
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, desc
from fastapi import Depends

from models import User, UserEvent, EventSource
from database import get_async_db

logger = logging.getLogger(__name__)


@dataclass
class EventWithUser:
    """A UserEvent joined with user info for admin display."""
    event: UserEvent
    user_email: str
    user_name: Optional[str]


class EventTrackingService:
    """Service for tracking user events. Owns the user_events table."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def track(
        self,
        user_id: int,
        event_source: EventSource,
        event_type: str,
        event_data: Optional[dict] = None,
    ) -> None:
        """
        Persist a tracking event. Best-effort — logs errors but does not raise.
        """
        try:
            event = UserEvent(
                user_id=user_id,
                event_source=event_source,
                event_type=event_type,
                event_data=event_data,
            )
            self.db.add(event)
            await self.db.commit()
        except Exception as e:
            logger.error(f"Failed to persist tracking event: {e}")
            await self.db.rollback()

    async def list_events(
        self,
        hours: int = 24,
        event_source: Optional[str] = None,
        event_type: Optional[str] = None,
        user_id: Optional[int] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Tuple[List[EventWithUser], int]:
        """
        List tracking events with filters, joined with user info.

        Returns:
            Tuple of (events with user info, total count)
        """
        since = datetime.utcnow() - timedelta(hours=hours)

        conditions = [UserEvent.created_at >= since]
        if event_source:
            conditions.append(UserEvent.event_source == event_source)
        if event_type:
            conditions.append(UserEvent.event_type == event_type)
        if user_id:
            conditions.append(UserEvent.user_id == user_id)

        where = and_(*conditions)

        # Count
        count_stmt = select(func.count(UserEvent.id)).where(where)
        total = (await self.db.execute(count_stmt)).scalar() or 0

        # Fetch with user join
        stmt = (
            select(UserEvent, User.email, User.full_name)
            .join(User, User.user_id == UserEvent.user_id)
            .where(where)
            .order_by(desc(UserEvent.created_at))
            .offset(offset)
            .limit(limit)
        )
        rows = (await self.db.execute(stmt)).all()

        events = [
            EventWithUser(event=ev, user_email=email, user_name=full_name)
            for ev, email, full_name in rows
        ]

        return events, total

    async def list_event_types(self) -> List[str]:
        """Get distinct event types, sorted alphabetically."""
        stmt = select(UserEvent.event_type).distinct().order_by(UserEvent.event_type)
        result = await self.db.execute(stmt)
        return [row[0] for row in result.all()]


# Dependency injection
async def get_event_tracking_service(
    db: AsyncSession = Depends(get_async_db),
) -> EventTrackingService:
    return EventTrackingService(db)
