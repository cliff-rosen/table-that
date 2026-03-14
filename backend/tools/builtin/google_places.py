"""
Google Places Tool

Looks up a business on Google Maps via SerpAPI's google_maps engine.
Returns the Google Maps URL and place metadata.

Used standalone as a tool and also by the google_places enrichment strategy.
"""

import json
import os
import logging
from typing import Any, AsyncGenerator, Dict, Optional, Union

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolResult, ToolProgress, register_tool

logger = logging.getLogger(__name__)

SERPAPI_BASE_URL = "https://serpapi.com/search.json"


# =============================================================================
# Core logic (shared by standalone tool and enrichment strategy)
# =============================================================================

async def _google_places_core(
    query: str,
    location: Optional[str] = None,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Look up a business on Google Maps via SerpAPI.

    Yields step dicts:
      {"action": "search", "query": ...}
      {"action": "answer", "outcome": "found"|"not_found", "value": url, "matched_name": ..., "place_id": ...}
      {"action": "error", "detail": ...}
    """
    api_key = os.getenv("SERPAPI_KEY")
    if not api_key:
        yield {"action": "error", "detail": "SERPAPI_KEY not configured"}
        yield {"action": "answer", "outcome": "error", "value": None,
               "explanation": "SERPAPI_KEY not configured"}
        return

    search_query = f"{query} {location}".strip() if location else query
    yield {"action": "search", "query": search_query}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(SERPAPI_BASE_URL, params={
                "engine": "google_maps",
                "q": search_query,
                "type": "search",
                "api_key": api_key,
            })
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        yield {"action": "error", "detail": f"SerpAPI request failed: {e}"}
        yield {"action": "answer", "outcome": "not_found", "value": None,
               "explanation": f"SerpAPI request failed: {e}"}
        return

    # Parse response: exact match first, then best from list
    place_id = None
    matched_name = None

    if data.get("place_results"):
        result = data["place_results"]
        place_id = result.get("place_id", "")
        matched_name = result.get("title", "")
    elif data.get("local_results"):
        result = data["local_results"][0]
        place_id = result.get("place_id", "")
        matched_name = result.get("title", "")

    if not place_id:
        yield {"action": "answer", "outcome": "not_found", "value": None,
               "explanation": f"No Google Maps results for '{search_query}'"}
        return

    maps_url = f"https://www.google.com/maps/place/?q=place_id:{place_id}"

    yield {"action": "answer", "outcome": "found", "value": maps_url,
           "matched_name": matched_name, "place_id": place_id}


# =============================================================================
# Standalone tool executor
# =============================================================================

async def execute_google_places(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
    """Standalone tool: look up a business on Google Maps."""
    query = params.get("query", "").strip()
    if not query:
        yield ToolResult(text="Error: query is required.")
        return

    location = params.get("location", "").strip() or None

    async for step in _google_places_core(query, location):
        action = step["action"]
        if action == "search":
            yield ToolProgress(
                stage="search",
                message=f"Searching Google Maps: {step['query'][:80]}",
            )
        elif action == "error":
            yield ToolProgress(
                stage="error",
                message=step.get("detail", ""),
            )
        elif action == "answer":
            outcome = step.get("outcome", "not_found")
            yield ToolProgress(
                stage="answer",
                message=f"{'Found' if outcome == 'found' else 'Not found'}: "
                        f"{(step.get('value') or step.get('explanation') or '')[:120]}",
            )

    # Final result from last answer step
    last_answer = step if step.get("action") == "answer" else {}  # type: ignore[possibly-undefined]
    result = {
        "outcome": last_answer.get("outcome", "not_found"),
        "value": last_answer.get("value"),
        "matched_name": last_answer.get("matched_name"),
        "explanation": last_answer.get("explanation"),
    }
    yield ToolResult(text=json.dumps(result))


register_tool(ToolConfig(
    name="google_places",
    description=(
        "Look up a business on Google Maps and return its Maps URL. "
        "Use for finding Google Maps links, review page URLs, or verifying business locations. "
        "Returns JSON: {outcome, value (Maps URL), matched_name, explanation}."
    ),
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Business name to search for, e.g. 'Meadows Family Dentistry'",
            },
            "location": {
                "type": "string",
                "description": "Optional location context, e.g. 'Castle Rock, CO'",
            },
        },
        "required": ["query"],
    },
    executor=execute_google_places,
    category="web",
    is_global=True,
))
