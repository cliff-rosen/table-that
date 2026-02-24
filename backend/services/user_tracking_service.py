"""
User Tracking Service

Provides tracking for user activities:
- Backend API endpoint auto-tracking via decorator
- Frontend event tracking via API
- Admin event viewing
"""

import logging
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
from functools import wraps
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, select, func
from fastapi import Depends

from models import UserEvent, EventSource, User
from database import get_async_db

logger = logging.getLogger(__name__)


class UserTrackingService:
    """Service for tracking and querying user events."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def track_event(
        self,
        user_id: int,
        event_source: EventSource,
        event_type: str,
        event_data: Optional[Dict[str, Any]] = None
    ) -> UserEvent:
        """Track a user event (async)."""
        event = UserEvent(
            user_id=user_id,
            event_source=event_source,
            event_type=event_type,
            event_data=event_data or {}
        )
        self.db.add(event)
        await self.db.commit()
        await self.db.refresh(event)

        logger.debug(f"Tracked event: user={user_id}, type={event_type}, source={event_source.value}")
        return event

    async def track_frontend_event(
        self,
        user_id: int,
        event_type: str,
        event_data: Optional[Dict[str, Any]] = None
    ) -> UserEvent:
        """Track a frontend UI event (async)."""
        return await self.track_event(
            user_id=user_id,
            event_source=EventSource.FRONTEND,
            event_type=event_type,
            event_data=event_data
        )

    async def get_all_events(
        self,
        limit: int = 100,
        offset: int = 0,
        user_id: Optional[int] = None,
        event_type: Optional[str] = None,
        event_source: Optional[EventSource] = None,
        since: Optional[datetime] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """Get all events (admin view) with user info (async)."""
        # Build base query
        query = select(UserEvent, User).join(User, User.user_id == UserEvent.user_id)
        count_query = select(func.count(UserEvent.id)).select_from(UserEvent)

        if user_id:
            query = query.where(UserEvent.user_id == user_id)
            count_query = count_query.where(UserEvent.user_id == user_id)
        if event_type:
            query = query.where(UserEvent.event_type == event_type)
            count_query = count_query.where(UserEvent.event_type == event_type)
        if event_source:
            query = query.where(UserEvent.event_source == event_source)
            count_query = count_query.where(UserEvent.event_source == event_source)
        if since:
            query = query.where(UserEvent.created_at >= since)
            count_query = count_query.where(UserEvent.created_at >= since)

        # Get total count
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Get paginated results
        query = query.order_by(desc(UserEvent.created_at)).offset(offset).limit(limit)
        result = await self.db.execute(query)
        rows = result.all()

        events = []
        for event, user in rows:
            events.append({
                "id": event.id,
                "user_id": event.user_id,
                "user_email": user.email,
                "user_name": user.full_name,
                "event_source": event.event_source.value,
                "event_type": event.event_type,
                "event_data": event.event_data,
                "created_at": event.created_at.isoformat()
            })

        return events, total

    async def get_event_types(self) -> List[str]:
        """Get distinct event types for filtering (async)."""
        result = await self.db.execute(
            select(UserEvent.event_type).distinct()
        )
        return [r[0] for r in result.all()]


# Dependency injection provider for async tracking service
async def get_tracking_service(
    db: AsyncSession = Depends(get_async_db)
) -> UserTrackingService:
    """Get a UserTrackingService instance with async database session."""
    return UserTrackingService(db)


def track_endpoint(event_type: str = "api_call", include_params: bool = True):
    """
    Decorator to automatically track API endpoint calls.

    Usage:
        @router.get("/reports/{report_id}")
        @track_endpoint("view_report")
        async def get_report(report_id: int, current_user: User = Depends(get_current_user)):
            ...

    Args:
        event_type: Custom event type name (defaults to 'api_call')
        include_params: Whether to include path/query params in event data
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract user and db from kwargs (FastAPI dependency injection)
            current_user = kwargs.get('current_user')
            db = kwargs.get('db')

            # Execute the endpoint
            result = await func(*args, **kwargs)

            # Track if we have user and db
            if current_user and db and hasattr(current_user, 'user_id'):
                try:
                    # Build event data from kwargs (path params, query params)
                    event_data = {}
                    if include_params:
                        # Include relevant params (exclude db, current_user, background_tasks)
                        excluded = {'db', 'current_user', 'background_tasks'}
                        for key, value in kwargs.items():
                            if key not in excluded:
                                # Handle Pydantic models by converting to dict
                                if hasattr(value, 'model_dump'):
                                    # Pydantic v2
                                    event_data[key] = value.model_dump()
                                elif hasattr(value, 'dict'):
                                    # Pydantic v1
                                    event_data[key] = value.dict()
                                elif isinstance(value, (str, int, float, bool, list, dict, type(None))):
                                    # Primitive serializable values
                                    event_data[key] = value

                    service = UserTrackingService(db)
                    await service.track_event(
                        user_id=current_user.user_id,
                        event_source=EventSource.BACKEND,
                        event_type=event_type,
                        event_data=event_data if event_data else None
                    )
                except Exception as e:
                    # Don't let tracking errors affect the endpoint
                    logger.warning(f"Failed to track endpoint {event_type}: {e}")

            return result
        return wrapper
    return decorator
