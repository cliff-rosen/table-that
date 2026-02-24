"""
Google Scholar API Router

This module provides REST API endpoints for Google Scholar search functionality.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
import asyncio
import time
import logging
from config.timeout_settings import get_streaming_config

logger = logging.getLogger(__name__)

from database import get_async_db
from models import User
from schemas.canonical_types import CanonicalResearchArticle

from services.auth_service import validate_token
from services.google_scholar_service import GoogleScholarService

# Event tracking imports
from models import EventType

router = APIRouter(
    prefix="/google-scholar",
    tags=["google-scholar"]
)


class GoogleScholarSearchRequest(BaseModel):
    """Request model for Google Scholar search."""
    query: str = Field(..., description="Search query for academic literature")
    num_results: Optional[int] = Field(10, ge=1, le=500, description="Number of results to return")
    year_low: Optional[int] = Field(None, description="Filter results from this year onwards")
    year_high: Optional[int] = Field(None, description="Filter results up to this year")
    sort_by: Optional[str] = Field("relevance", pattern="^(relevance|date)$", description="Sort order")
    start_index: Optional[int] = Field(0, ge=0, description="Starting index for pagination")
    enrich_summaries: Optional[bool] = Field(False, description="If true, attempt to enrich abstracts/summaries for returned results")


class GoogleScholarSearchResponse(BaseModel):
    """Response model for Google Scholar search."""
    articles: List[CanonicalResearchArticle] = Field(..., description="List of academic articles")
    metadata: dict = Field(..., description="Search metadata")
    success: bool = Field(..., description="Whether the search was successful")


class GoogleScholarEnrichRequest(BaseModel):
    """Request to enrich a single article by DOI or link."""
    doi: Optional[str] = Field(None, description="Article DOI")
    link: Optional[str] = Field(None, description="Article landing page URL")
    title: Optional[str] = Field(None, description="Optional title to include in response")


class GoogleScholarEnrichResponse(BaseModel):
    """Response with a single enriched article."""
    article: CanonicalResearchArticle = Field(..., description="Enriched article")
    metadata: dict = Field(..., description="Enrichment metadata")
    success: bool = Field(..., description="Whether enrichment succeeded")


class GoogleScholarStreamRequest(BaseModel):
    """Request model for streaming Google Scholar search."""
    query: str = Field(..., description="Search query for academic literature")
    num_results: Optional[int] = Field(10, ge=1, le=500, description="Number of results to return")
    year_low: Optional[int] = Field(None, description="Filter results from this year onwards")
    year_high: Optional[int] = Field(None, description="Filter results up to this year")
    sort_by: Optional[str] = Field("relevance", pattern="^(relevance|date)$", description="Sort order")
    start_index: Optional[int] = Field(0, ge=0, description="Starting index for pagination")
    enrich_summaries: Optional[bool] = Field(False, description="If true, attempt to enrich abstracts/summaries for returned results")


@router.post("/search", response_model=GoogleScholarSearchResponse)
async def search_google_scholar(
    request: GoogleScholarSearchRequest,
    current_user: User = Depends(validate_token)
):
    """
    Search Google Scholar for academic articles.

    This endpoint provides access to Google Scholar search functionality,
    allowing users to find academic literature across all disciplines.

    Args:
        request: Search parameters
        current_user: Authenticated user

    Returns:
        GoogleScholarSearchResponse with articles and metadata

    Raises:
        HTTPException: If search fails or parameters are invalid
    """
    try:
        # Get the service
        service = GoogleScholarService()

        # Perform the search
        articles, search_metadata = service.search_articles(
            query=request.query,
            num_results=request.num_results,
            year_low=request.year_low,
            year_high=request.year_high,
            sort_by=request.sort_by,
            start_index=request.start_index,
            enrich_summaries=bool(request.enrich_summaries)
        )

        return GoogleScholarSearchResponse(
            articles=articles,
            metadata=search_metadata,
            success=True
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")


@router.get("/search", response_model=GoogleScholarSearchResponse)
async def search_google_scholar_get(
    query: str = Query(..., description="Search query"),
    num_results: Optional[int] = Query(10, ge=1, le=500, description="Number of results"),
    year_low: Optional[int] = Query(None, description="Start year filter"),
    year_high: Optional[int] = Query(None, description="End year filter"),
    sort_by: Optional[str] = Query("relevance", pattern="^(relevance|date)$", description="Sort order"),
    start_index: Optional[int] = Query(0, ge=0, description="Starting index for pagination"),
    enrich_summaries: Optional[bool] = Query(False, description="If true, attempt to enrich abstracts/summaries for returned results"),
    current_user: User = Depends(validate_token)
):
    """
    Search Google Scholar (GET method).

    Same as POST /search but using query parameters.
    Useful for simple searches or browser testing.
    """
    request = GoogleScholarSearchRequest(
        query=query,
        num_results=num_results,
        year_low=year_low,
        year_high=year_high,
        sort_by=sort_by,
        start_index=start_index,
        enrich_summaries=enrich_summaries
    )

    return await search_google_scholar(request, current_user)


@router.get("/test-connection")
async def test_google_scholar_connection(
    current_user: User = Depends(validate_token)
):
    """
    Test Google Scholar/SerpAPI connection.

    Verifies that the SerpAPI key is configured and the service is accessible.
    """
    try:
        service = GoogleScholarService()

        # Check if API key is configured
        if not service.api_key:
            return {
                "status": "error",
                "message": "SerpAPI key not configured. Set SERPAPI_KEY environment variable."
            }

        # Try a minimal search to test the connection
        try:
            articles, metadata = service.search_articles(
                query="test",
                num_results=1
            )
            return {
                "status": "success",
                "message": "Google Scholar connection successful",
                "api_configured": True,
                "test_results": len(articles)
            }
        except Exception as e:
            return {
                "status": "error",
                "message": f"Connection test failed: {str(e)}",
                "api_configured": True
            }

    except Exception as e:
        return {
            "status": "error",
            "message": f"Service initialization failed: {str(e)}",
            "api_configured": False
        }


@router.post("/enrich", response_model=GoogleScholarEnrichResponse)
async def enrich_article(
    request: GoogleScholarEnrichRequest,
    current_user: User = Depends(validate_token)
):
    """
    Enrich a single article identified by DOI or URL by attempting to fetch a summary/abstract.
    """
    if not request.doi and not request.link:
        raise HTTPException(status_code=400, detail="Either 'doi' or 'link' is required")

    try:
        service = GoogleScholarService()
        article, metadata = service.enrich_single_article(
            doi=request.doi,
            link=request.link,
            title=request.title
        )
        return GoogleScholarEnrichResponse(article=article, metadata=metadata, success=True)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Enrichment failed: {str(e)}")


def _sse_format(data: dict) -> str:
    import json
    return f"data: {json.dumps(data)}\n\n"


@router.post("/stream")
async def stream_google_scholar(
    request: GoogleScholarStreamRequest,
    req: Request,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(validate_token)
):
    """
    Stream Google Scholar search progress and article batches via SSE.
    """
    service = GoogleScholarService()

    async def event_generator():
        accumulated = 0
        try:
            # Announce start
            yield _sse_format({"status": "starting", "payload": {"query": request.query}})

            batch_size = service._get_max_results_per_call()
            target = request.num_results or 10
            start_index = request.start_index or 0

            # Track when to send next heartbeat
            next_heartbeat = time.time() + 3

            while accumulated < target:
                # Send heartbeat if needed
                current_time = time.time()
                if current_time >= next_heartbeat:
                    yield _sse_format({
                        "status": "heartbeat",
                        "payload": {
                            "message": "keep_alive",
                            "timestamp": current_time,
                            "accumulated": accumulated,
                            "target": target
                        }
                    })
                    next_heartbeat = current_time + 3

                remaining = target - accumulated
                current_batch = min(batch_size, remaining)

                # Emit progress before batch
                yield _sse_format({
                    "status": "progress",
                    "payload": {
                        "message": "requesting_batch",
                        "start_index": start_index,
                        "batch_size": current_batch
                    }
                })

                # Get articles synchronously (SerpAPI call), optionally enriching within batch
                articles, meta = await asyncio.get_event_loop().run_in_executor(
                    None,
                    service._search_single_batch,
                    request.query,
                    current_batch,
                    request.year_low,
                    request.year_high,
                    request.sort_by or "relevance",
                    start_index,
                    bool(request.enrich_summaries)
                )

                if not articles:
                    yield _sse_format({"status": "complete", "payload": {"returned": accumulated, "metadata": meta}})
                    break

                # Enrichment already handled inside _search_single_batch when requested

                accumulated += len(articles)
                start_index += current_batch

                # Emit batch of articles
                yield _sse_format({
                    "status": "articles",
                    "payload": {
                        "articles": [a.model_dump() for a in articles],
                        "metadata": meta
                    }
                })

                # If we hit total available or target, stop
                total_available = meta.get("total_results", 0)
                if total_available and accumulated >= min(total_available, target):
                    yield _sse_format({"status": "complete", "payload": {"returned": accumulated, "metadata": meta}})
                    break

            # Final completion if loop exits normally
            yield _sse_format({"status": "complete", "payload": {"returned": accumulated}})

        except Exception as e:
            yield _sse_format({"status": "error", "error": str(e)})
        finally:
            # Track completion event with results
            try:
                from services.event_tracking import EventTracker
                from utils.tracking_helpers import get_journey_id_from_request

                journey_id = get_journey_id_from_request(req)
                if journey_id and db and current_user:
                    user_id = getattr(current_user, 'user_id', str(current_user))

                    # Create completion event data
                    completion_data = {
                        'query': request.query,
                        'num_results_requested': request.num_results or 10,
                        'num_results_returned': accumulated,
                        'year_low': request.year_low,
                        'year_high': request.year_high,
                        'sort_by': request.sort_by or 'relevance',
                        'start_index': request.start_index or 0,
                        'enrich_summaries': bool(request.enrich_summaries)
                    }

                    # Track completion event
                    tracker = EventTracker(db)
                    await tracker.track_event(
                        user_id=user_id,
                        journey_id=journey_id,
                        event_type=EventType.SCHOLAR_ENRICH_COMPLETE,
                        event_data=completion_data
                    )
            except Exception as e:
                logger.warning(f"[TRACKING ERROR] Failed to track Google Scholar completion event: {e}")

    headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no"
    }
    return StreamingResponse(event_generator(), media_type="text/event-stream", headers=headers)


@router.get("/stream")
async def stream_google_scholar_get(
    request: Request,
    query: str = Query(..., description="Search query"),
    num_results: Optional[int] = Query(10, ge=1, le=500, description="Number of results"),
    year_low: Optional[int] = Query(None, description="Start year filter"),
    year_high: Optional[int] = Query(None, description="End year filter"),
    sort_by: Optional[str] = Query("relevance", pattern="^(relevance|date)$", description="Sort order"),
    start_index: Optional[int] = Query(0, ge=0, description="Starting index for pagination"),
    enrich_summaries: Optional[bool] = Query(False, description="If true, attempt to enrich abstracts/summaries for returned results"),
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(validate_token)
):
    req = GoogleScholarStreamRequest(
        query=query,
        num_results=num_results,
        year_low=year_low,
        year_high=year_high,
        sort_by=sort_by,
        start_index=start_index,
        enrich_summaries=enrich_summaries
    )
    return await stream_google_scholar(req, request, db, current_user)
