"""
Research Stream Tools

Global tools for exploring research streams from any page.
Uses ResearchStreamService for permission-scoped access.
"""

import logging
from typing import Any, Dict, Union

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolResult, register_tool

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Executors (Async)
# =============================================================================

async def execute_list_research_streams(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all research streams accessible to the current user."""
    from services.research_stream_service import ResearchStreamService
    from services.user_service import UserService

    try:
        user_service = UserService(db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return "Error: User not found."

        stream_service = ResearchStreamService(db)
        results = await stream_service.get_user_research_streams(user)

        if not results:
            return "No research streams found. You don't have access to any streams yet."

        text_lines = [f"Found {len(results)} research streams:\n"]
        streams_data = []

        for i, item in enumerate(results, 1):
            stream = item.stream
            latest_date_str = item.latest_report_date.strftime('%Y-%m-%d') if item.latest_report_date else "No reports"

            text_lines.append(
                f"{i}. {stream.stream_name} ({stream.scope.value}) - "
                f"{item.report_count} reports, last: {latest_date_str}"
            )

            streams_data.append({
                "stream_id": stream.stream_id,
                "stream_name": stream.stream_name,
                "purpose": stream.purpose,
                "scope": stream.scope.value if stream.scope else None,
                "is_active": stream.is_active,
                "report_count": item.report_count,
                "latest_report_date": item.latest_report_date.isoformat() if item.latest_report_date else None,
                "has_schedule": bool(stream.schedule_config and stream.schedule_config.get("enabled")),
            })

        text_lines.append("\nA panel is displayed with the full stream listing.")

        payload = {
            "type": "stream_list",
            "data": {
                "total_streams": len(results),
                "streams": streams_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error listing research streams: {e}", exc_info=True)
        return f"Error listing research streams: {str(e)}"


async def execute_get_stream_details(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Get detailed information about a specific research stream."""
    from services.research_stream_service import ResearchStreamService
    from services.user_service import UserService

    stream_id = params.get("stream_id")
    if not stream_id:
        return "Error: stream_id is required."

    try:
        user_service = UserService(db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return "Error: User not found."

        stream_service = ResearchStreamService(db)
        stream = await stream_service.get_research_stream(user, int(stream_id))

        if not stream:
            return f"Error: Stream {stream_id} not found or you don't have access."

        # Build schedule summary
        schedule_summary = "No schedule configured"
        if stream.schedule_config:
            sc = stream.schedule_config
            if sc.get("enabled"):
                freq = sc.get("frequency", "unknown")
                time = sc.get("preferred_time", "")
                tz = sc.get("timezone", "")
                schedule_summary = f"{freq}, {time} {tz}"
            else:
                schedule_summary = "Schedule disabled"

        # Last execution status
        last_exec_status = "No executions"
        last_exec_date = None
        if stream.last_execution:
            last_exec_status = stream.last_execution.status.value if stream.last_execution.status else "unknown"
            last_exec_date = stream.last_execution.completed_at or stream.last_execution.started_at

        # Semantic space summary (topics/entities if present)
        semantic_summary = ""
        if stream.semantic_space:
            topics = stream.semantic_space.get("topics", [])
            entities = stream.semantic_space.get("entities", [])
            if topics:
                topic_names = [t.get("name", t) if isinstance(t, dict) else str(t) for t in topics[:5]]
                semantic_summary += f"Topics: {', '.join(topic_names)}"
            if entities:
                entity_names = [e.get("name", e) if isinstance(e, dict) else str(e) for e in entities[:5]]
                if semantic_summary:
                    semantic_summary += "; "
                semantic_summary += f"Entities: {', '.join(entity_names)}"

        text_lines = [
            f"Stream: {stream.stream_name}",
            f"Purpose: {stream.purpose}",
            f"Scope: {stream.scope.value if stream.scope else 'unknown'}",
            f"Schedule: {schedule_summary}",
            f"Last execution: {last_exec_status}",
        ]
        if semantic_summary:
            text_lines.append(f"Semantic space: {semantic_summary}")
        text_lines.append("\nFull details are displayed in the panel.")

        data = {
            "stream_id": stream.stream_id,
            "stream_name": stream.stream_name,
            "purpose": stream.purpose,
            "scope": stream.scope.value if stream.scope else None,
            "is_active": stream.is_active,
            "schedule_config": stream.schedule_config,
            "schedule_summary": schedule_summary,
            "last_execution_status": last_exec_status,
            "last_execution_date": last_exec_date.isoformat() if last_exec_date else None,
            "semantic_space": stream.semantic_space,
            "retrieval_config": stream.retrieval_config,
            "presentation_config": stream.presentation_config,
            "enrichment_config": stream.enrichment_config,
            "created_at": stream.created_at.isoformat() if stream.created_at else None,
            "updated_at": stream.updated_at.isoformat() if stream.updated_at else None,
        }

        payload = {
            "type": "stream_details",
            "data": data
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error getting stream details: {e}", exc_info=True)
        return f"Error getting stream details: {str(e)}"


# =============================================================================
# Tool Registration
# =============================================================================

register_tool(ToolConfig(
    name="list_research_streams",
    description="List all research streams accessible to you, including their scope, report count, and last report date. Use this to discover available streams.",
    input_schema={
        "type": "object",
        "properties": {},
    },
    executor=execute_list_research_streams,
    category="streams",
    is_global=True,
))

register_tool(ToolConfig(
    name="get_stream_details",
    description="Get detailed information about a specific research stream, including its configuration, schedule, last execution status, and semantic space.",
    input_schema={
        "type": "object",
        "properties": {
            "stream_id": {
                "type": "integer",
                "description": "The ID of the research stream to get details for."
            }
        },
        "required": ["stream_id"]
    },
    executor=execute_get_stream_details,
    category="streams",
    is_global=True,
))
