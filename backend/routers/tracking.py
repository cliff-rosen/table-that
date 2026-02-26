"""
Tracking Router - accepts frontend tracking events and provides admin queries.
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Any, Dict, List, Optional
import logging

from models import User, UserRole, EventSource
from services import auth_service
from services.event_tracking import EventTrackingService, get_event_tracking_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class TrackEventRequest(BaseModel):
    event_type: str
    event_data: Optional[Dict[str, Any]] = None


class UserEventResponse(BaseModel):
    id: int
    user_id: int
    user_email: str
    user_name: Optional[str] = None
    event_source: str
    event_type: str
    event_data: Optional[Dict[str, Any]] = None
    created_at: str


class EventsResponse(BaseModel):
    events: List[UserEventResponse]
    total: int
    limit: int
    offset: int


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def require_platform_admin(
    current_user: User = Depends(auth_service.validate_token),
) -> User:
    if current_user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return current_user


# ---------------------------------------------------------------------------
# Public endpoint — record a frontend event
# ---------------------------------------------------------------------------

@router.post("/events")
async def track_event(
    body: TrackEventRequest,
    current_user: User = Depends(auth_service.validate_token),
    service: EventTrackingService = Depends(get_event_tracking_service),
):
    """Persist a tracking event from the frontend."""
    logger.info(f"track_event - user_id={current_user.user_id}, type={body.event_type}")

    await service.track(
        user_id=current_user.user_id,
        event_source=EventSource.FRONTEND,
        event_type=body.event_type,
        event_data=body.event_data,
    )

    return {"ok": True}


# ---------------------------------------------------------------------------
# Admin endpoints
# ---------------------------------------------------------------------------

@router.get("/admin/events", response_model=EventsResponse)
async def list_events(
    hours: int = Query(24, ge=1, le=720),
    event_source: Optional[str] = Query(None),
    event_type: Optional[str] = Query(None),
    user_id: Optional[int] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(require_platform_admin),
    service: EventTrackingService = Depends(get_event_tracking_service),
):
    """List tracking events with filters. Platform admin only."""
    logger.info(f"list_events - admin_user_id={current_user.user_id}, hours={hours}")

    try:
        events_with_users, total = await service.list_events(
            hours=hours,
            event_source=event_source,
            event_type=event_type,
            user_id=user_id,
            limit=limit,
            offset=offset,
        )

        events = [
            UserEventResponse(
                id=ewu.event.id,
                user_id=ewu.event.user_id,
                user_email=ewu.user_email,
                user_name=ewu.user_name,
                event_source=ewu.event.event_source.value if hasattr(ewu.event.event_source, 'value') else ewu.event.event_source,
                event_type=ewu.event.event_type,
                event_data=ewu.event.event_data,
                created_at=ewu.event.created_at.isoformat() if ewu.event.created_at else "",
            )
            for ewu in events_with_users
        ]

        logger.info(f"list_events complete - admin_user_id={current_user.user_id}, returned={len(events)}, total={total}")
        return EventsResponse(events=events, total=total, limit=limit, offset=offset)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_events failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/admin/event-types", response_model=List[str])
async def list_event_types(
    current_user: User = Depends(require_platform_admin),
    service: EventTrackingService = Depends(get_event_tracking_service),
):
    """Get distinct event types. Platform admin only."""
    logger.info(f"list_event_types - admin_user_id={current_user.user_id}")

    try:
        types = await service.list_event_types()
        logger.info(f"list_event_types complete - admin_user_id={current_user.user_id}, count={len(types)}")
        return types

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"list_event_types failed - admin_user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
