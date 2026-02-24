"""
Auto-tracking decorator for SmartSearch2 API endpoints

Provides automatic event tracking with minimal code changes.
"""

import functools
import asyncio
from typing import Callable, Optional, Any
from uuid import uuid4
from fastapi import Request
from sqlalchemy.orm import Session

from services.event_tracking import EventTracker
from models import EventType
from utils.tracking_helpers import get_journey_id_from_request




def auto_track(
    event_type: EventType,
    extract_data_fn: Optional[Callable] = None
):
    """
    Simplified decorator that automatically tracks events for API endpoints

    Only supports async functions (all FastAPI endpoints are async)
    """

    def decorator(func: Callable) -> Callable:

        @functools.wraps(func)
        async def wrapper(*args, **kwargs):

            # Find Request, db Session, and current_user
            request = None
            db = None
            current_user = None

            # Check positional args
            for i, arg in enumerate(args):
                if isinstance(arg, Request):
                    request = arg

            # Check kwargs (FastAPI passes dependencies as kwargs)
            db = kwargs.get('db')
            current_user = kwargs.get('current_user')

            # Also check kwargs for Request (FastAPI might pass it as kwarg)
            if not request:
                request = kwargs.get('req')  # The parameter name in the function signature is 'req'

            # Execute the original function first
            result = await func(*args, **kwargs)

            # Track if we have what we need
            if db and current_user and request:
                try:
                    user_id = getattr(current_user, 'user_id', str(current_user))
                    journey_id = get_journey_id_from_request(request)

                    if journey_id:
                        # Extract event data if function provided
                        event_data = {}
                        if extract_data_fn:
                            try:
                                event_data = extract_data_fn(result, *args, **kwargs)
                            except Exception as e:
                                # Keep this error logging as it's important for debugging data extraction issues
                                print(f"[TRACKING ERROR] Failed to extract event data for {event_type}: {e}")

                        # Track the event
                        tracker = EventTracker(db)
                        tracker.track_event(
                            user_id=user_id,
                            journey_id=journey_id,
                            event_type=event_type,
                            event_data=event_data
                        )
                except Exception as e:
                    # Keep this error logging as it's critical for debugging tracking failures
                    print(f"[TRACKING ERROR] Failed to track {event_type} event: {e}")

            return result

        return wrapper

    return decorator


# Convenient pre-configured decorators for common events

def track_search(extract_data_fn: Optional[Callable] = None):
    """Track a search execution"""
    return auto_track(EventType.SEARCH_EXECUTE, extract_data_fn)


def track_filter(extract_data_fn: Optional[Callable] = None):
    """Track a filter application"""
    return auto_track(EventType.FILTER_APPLY, extract_data_fn)


def track_columns(extract_data_fn: Optional[Callable] = None):
    """Track column extraction"""
    return auto_track(EventType.COLUMNS_ADD, extract_data_fn)


def track_scholar_enrichment(extract_data_fn: Optional[Callable] = None):
    """Track Google Scholar enrichment"""
    return auto_track(EventType.SCHOLAR_ENRICH_COMPLETE, extract_data_fn)