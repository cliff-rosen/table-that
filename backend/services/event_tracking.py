"""
Event Tracking Service for SmartSearch2

Simple service for tracking user events in their search journey.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from uuid import uuid4
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import and_, func, select

from models import UserEvent, EventType


class EventTracker:
    """Service for tracking user events"""

    def __init__(self, db: AsyncSession):
        """Initialize with async database session"""
        self.db = db
        self.user_id: Optional[str] = None
        self.journey_id: Optional[str] = None

    async def track_event(
        self,
        user_id: str,
        journey_id: str,
        event_type: EventType,
        event_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Track a single event

        Args:
            user_id: User identifier
            journey_id: Journey identifier
            event_type: Type of event from EventType enum
            event_data: Optional event-specific data

        Returns:
            Event ID
        """
        event = UserEvent(
            user_id=user_id,
            journey_id=journey_id,
            event_type=event_type,
            event_data=event_data or {},
            timestamp=datetime.utcnow()
        )

        self.db.add(event)
        await self.db.commit()

        return event.event_id

    async def track(
        self,
        event_type: EventType,
        event_data: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Track event using pre-set user_id and journey_id

        Args:
            event_type: Type of event
            event_data: Optional event-specific data

        Returns:
            Event ID
        """
        if not self.user_id or not self.journey_id:
            raise ValueError("user_id and journey_id must be set before tracking")

        return await self.track_event(
            user_id=self.user_id,
            journey_id=self.journey_id,
            event_type=event_type,
            event_data=event_data
        )

    async def start_journey(
        self,
        user_id: str,
        source: str = "pubmed",
        initial_query: Optional[str] = None
    ) -> str:
        """
        Start a new journey

        Args:
            user_id: User identifier
            source: Initial search source (pubmed or google_scholar)
            initial_query: Initial search query if provided

        Returns:
            Journey ID
        """
        journey_id = str(uuid4())

        await self.track_event(
            user_id=user_id,
            journey_id=journey_id,
            event_type=EventType.JOURNEY_START,
            event_data={
                "source": source,
                "initial_query": initial_query
            }
        )

        return journey_id

    async def complete_journey(
        self,
        user_id: str,
        journey_id: str,
        total_articles: int = 0
    ) -> None:
        """Mark a journey as completed"""
        await self.track_event(
            user_id=user_id,
            journey_id=journey_id,
            event_type=EventType.JOURNEY_COMPLETE,
            event_data={"total_articles": total_articles}
        )

    async def get_journey_events(
        self,
        journey_id: str,
        event_type: Optional[EventType] = None
    ) -> List[UserEvent]:
        """
        Get all events for a journey

        Args:
            journey_id: Journey identifier
            event_type: Optional filter by event type

        Returns:
            List of events ordered by timestamp
        """
        stmt = select(UserEvent).where(
            UserEvent.journey_id == journey_id
        )

        if event_type:
            stmt = stmt.where(UserEvent.event_type == event_type)

        stmt = stmt.order_by(UserEvent.timestamp)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_user_journeys(
        self,
        user_id: str,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Get recent journeys for a user

        Args:
            user_id: User identifier
            limit: Maximum number of journeys to return

        Returns:
            List of journey summaries
        """
        # Get distinct journey IDs with their first event times
        # Since we don't always have JOURNEY_START events, use the earliest event per journey
        stmt = select(
            UserEvent.journey_id,
            func.min(UserEvent.timestamp).label('start_time'),
            func.max(UserEvent.timestamp).label('last_time'),
            func.count(UserEvent.event_id).label('event_count'),
            func.max(UserEvent.event_type).label('last_event_type')
        ).where(
            UserEvent.user_id == user_id
        ).group_by(
            UserEvent.journey_id
        ).order_by(
            func.min(UserEvent.timestamp).desc()
        ).limit(limit)

        result = await self.db.execute(stmt)
        journeys = result.all()

        journey_summaries = []
        for journey_id, start_time, last_time, event_count, last_event_type in journeys:
            # Calculate duration
            duration_seconds = (last_time - start_time).total_seconds()
            duration_str = f"{int(duration_seconds//60)}m {int(duration_seconds%60)}s" if duration_seconds >= 60 else f"{int(duration_seconds)}s"

            journey_summaries.append({
                "journey_id": journey_id,
                "start_time": start_time.isoformat(),
                "last_time": last_time.isoformat(),
                "duration": duration_str,
                "event_count": event_count,
                "last_event_type": last_event_type.value if last_event_type else "unknown"
            })

        return journey_summaries

    async def get_all_user_journeys(
        self,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """
        Get recent journeys from all users (admin only)

        Args:
            limit: Maximum number of journeys to return

        Returns:
            List of journey summaries with user info
        """
        from models import User

        # Get distinct journey IDs with their first event times and user info
        # Since we don't always have JOURNEY_START events, use the earliest event per journey
        stmt = select(
            UserEvent.journey_id,
            UserEvent.user_id,
            func.min(UserEvent.timestamp).label('start_time'),
            func.max(UserEvent.timestamp).label('last_time'),
            func.count(UserEvent.event_id).label('event_count'),
            func.max(UserEvent.event_type).label('last_event_type'),
            User.email
        ).join(
            User, User.user_id == UserEvent.user_id
        ).group_by(
            UserEvent.journey_id, UserEvent.user_id, User.email
        ).order_by(
            func.min(UserEvent.timestamp).desc()
        ).limit(limit)

        result = await self.db.execute(stmt)
        journeys = result.all()

        journey_summaries = []
        for journey_id, user_id, start_time, last_time, event_count, last_event_type, email in journeys:
            # Calculate duration
            duration_seconds = (last_time - start_time).total_seconds()
            duration_str = f"{int(duration_seconds//60)}m {int(duration_seconds%60)}s" if duration_seconds >= 60 else f"{int(duration_seconds)}s"

            journey_summaries.append({
                "journey_id": journey_id,
                "user_id": user_id,
                "username": email,
                "start_time": start_time.isoformat(),
                "last_time": last_time.isoformat(),
                "duration": duration_str,
                "event_count": event_count,
                "last_event_type": last_event_type.value if last_event_type else "unknown"
            })

        return journey_summaries

    async def get_journey_analytics(
        self,
        journey_id: str
    ) -> Dict[str, Any]:
        """
        Get analytics for a journey

        Args:
            journey_id: Journey identifier

        Returns:
            Analytics dictionary with funnel, timeline, and metrics
        """
        events = await self.get_journey_events(journey_id)

        if not events:
            return {"error": "Journey not found"}

        # Build timeline
        timeline = [
            {
                "event_type": event.event_type.value,
                "timestamp": event.timestamp.isoformat(),
                "data": event.event_data
            }
            for event in events
        ]

        # Build funnel
        funnel_steps = {
            "journey_start": False,
            "search_execute": False,
            "filter_apply": False,
            "columns_add": False,
            "journey_complete": False
        }

        for event in events:
            if event.event_type.value in funnel_steps:
                funnel_steps[event.event_type.value] = True

        # Calculate metrics
        first_event = events[0]
        last_event = events[-1]
        duration = (last_event.timestamp - first_event.timestamp).total_seconds()

        # Count key events
        searches = sum(1 for e in events if e.event_type == EventType.SEARCH_EXECUTE)
        filters = sum(1 for e in events if e.event_type == EventType.FILTER_APPLY)
        extractions = sum(1 for e in events if e.event_type == EventType.COLUMNS_ADD)

        return {
            "journey_id": journey_id,
            "timeline": timeline,
            "funnel": funnel_steps,
            "metrics": {
                "total_events": len(events),
                "duration_seconds": duration,
                "searches": searches,
                "filters": filters,
                "extractions": extractions,
                "is_complete": funnel_steps["journey_complete"]
            }
        }


# Dependency injection provider
from fastapi import Depends
from database import get_async_db


async def get_event_tracker(
    db: AsyncSession = Depends(get_async_db)
) -> EventTracker:
    """Get an EventTracker instance with async database session."""
    return EventTracker(db)