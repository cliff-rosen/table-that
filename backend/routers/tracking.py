"""
Tracking Router - accepts frontend tracking events (no-op for now).
"""

from fastapi import APIRouter
from pydantic import BaseModel
from typing import Any, Dict, Optional

router = APIRouter(prefix="/api/tracking", tags=["tracking"])


class TrackEventRequest(BaseModel):
    event_type: str
    event_data: Optional[Dict[str, Any]] = None


@router.post("/events")
async def track_event(body: TrackEventRequest):
    """Accept tracking events from the frontend. No-op for now."""
    return {"ok": True}
