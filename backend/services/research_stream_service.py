"""
Research Stream service for managing research streams
"""

import logging
from dataclasses import dataclass
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any, Set
from datetime import datetime, date
from fastapi import HTTPException, status, Depends

from models import (
    ResearchStream,
    Report,
    User,
    UserRole,
    StreamScope,
    OrgStreamSubscription,
    UserStreamSubscription,
)
from services.user_service import UserService
from database import get_async_db

logger = logging.getLogger(__name__)
from schemas.research_stream import ResearchStream as ResearchStreamSchema
from schemas.research_stream import (
    StreamType,
    ReportFrequency,
    StreamScope as StreamScopeSchema,
)


# --- Service Result Dataclasses ---


@dataclass
class StreamWithStats:
    """Research stream with report statistics."""

    stream: ResearchStream  # SQLAlchemy model
    report_count: int
    latest_report_date: Optional[datetime]


@dataclass
class StreamChatInstructionsInfo:
    """Stream chat instructions status info."""

    stream_id: int
    stream_name: str
    has_instructions: bool
    instructions_preview: Optional[str]


def serialize_json_data(data: Any) -> Any:
    """
    Recursively serialize datetime objects to ISO format strings in nested structures.
    This is needed for JSON columns that may contain datetime objects.
    """
    if isinstance(data, (datetime, date)):
        return data.isoformat()
    elif isinstance(data, dict):
        return {key: serialize_json_data(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [serialize_json_data(item) for item in data]
    else:
        return data


class ResearchStreamService:
    """Service for managing research streams."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._user_service: Optional[UserService] = None

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    # =============================================================================
    # Async Methods
    # =============================================================================

    async def create_research_stream(
        self,
        user: User,
        stream_name: str,
        purpose: str,
        scope: StreamScope,
        semantic_space: Dict[str, Any],
        retrieval_config: Dict[str, Any],
        presentation_config: Dict[str, Any],
        schedule_config: Optional[Dict[str, Any]] = None,
        org_id: Optional[int] = None,
    ) -> ResearchStream:
        """
        Create a new research stream (async).

        Args:
            user: The user creating the stream
            scope: StreamScope.PERSONAL (default), ORGANIZATION, or GLOBAL
            org_id: Override org_id (for org streams, uses user's org_id by default)

        Returns:
            Created ResearchStream model
        """
        # Determine the correct user_id, org_id based on scope
        stream_user_id = None
        stream_org_id = org_id

        if scope == StreamScope.PERSONAL:
            stream_user_id = user.user_id
            stream_org_id = user.org_id  # Personal streams use user's org
        elif scope == StreamScope.ORGANIZATION:
            stream_user_id = None  # Org streams have no owner
            if not org_id:
                stream_org_id = user.org_id  # Default to user's org
        elif scope == StreamScope.GLOBAL:
            stream_user_id = None
            stream_org_id = None

        # Serialize datetime objects in JSON fields
        semantic_space = serialize_json_data(semantic_space)
        retrieval_config = serialize_json_data(retrieval_config)
        presentation_config = serialize_json_data(presentation_config)

        stream = ResearchStream(
            scope=scope,
            org_id=stream_org_id,
            user_id=stream_user_id,
            created_by=user.user_id,  # Always track who created it
            stream_name=stream_name,
            purpose=purpose,
            schedule_config=schedule_config,
            semantic_space=semantic_space,
            retrieval_config=retrieval_config,
            presentation_config=presentation_config,
            is_active=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )

        self.db.add(stream)
        await self.db.commit()
        await self.db.refresh(stream)

        return stream

    async def delete_research_stream(self, user: User, stream_id: int) -> bool:
        """
        Delete a research stream (async). Only owner can delete.

        Returns:
            True if deleted, False if not found or not authorized
        """
        from sqlalchemy import delete as sql_delete

        # Check ownership - user must own the stream
        result = await self.db.execute(
            select(ResearchStream).where(
                ResearchStream.stream_id == stream_id,
                ResearchStream.user_id == user.user_id,
            )
        )
        stream = result.scalars().first()

        if not stream:
            return False

        # Delete associated reports first
        await self.db.execute(
            sql_delete(Report).where(Report.research_stream_id == stream_id)
        )

        # Delete the stream
        await self.db.execute(
            sql_delete(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        await self.db.commit()

        return True

    async def delete_global_stream(self, stream_id: int) -> bool:
        """Delete a global stream (async). For platform admin use."""
        result = await self.db.execute(
            select(ResearchStream).where(
                ResearchStream.stream_id == stream_id,
                ResearchStream.scope == StreamScope.GLOBAL,
            )
        )
        stream = result.scalars().first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Global stream not found"
            )

        await self.db.delete(stream)
        await self.db.commit()

        logger.info(f"Deleted global stream {stream_id}")
        return True

    async def update_research_stream(
        self, stream_id: int, update_data: Dict[str, Any]
    ) -> Optional[ResearchStream]:
        """
        Update an existing research stream (async).

        Returns:
            Updated ResearchStream model or None if not found
        """
        from sqlalchemy.orm.attributes import flag_modified

        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()

        if not stream:
            return None

        # JSON fields that need datetime serialization
        json_fields = [
            "semantic_space",
            "retrieval_config",
            "presentation_config",
            "workflow_config",
            "scoring_config",
            "categories",
            "audience",
            "intended_guidance",
            "global_inclusion",
            "global_exclusion",
        ]

        # Update fields
        for field, value in update_data.items():
            if hasattr(stream, field):
                # Serialize datetime objects in JSON fields
                if field in json_fields and value is not None:
                    value = serialize_json_data(value)

                setattr(stream, field, value)

                # Flag mutable fields as modified
                if field in json_fields:
                    flag_modified(stream, field)

        stream.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(stream)
        return stream

    async def update_broad_query(
        self, stream_id: int, query_index: int, query_expression: str
    ) -> Optional[ResearchStream]:
        """
        Update a specific broad query's expression (async).

        Returns:
            Updated ResearchStream model or None if not found
        """
        from sqlalchemy.orm.attributes import flag_modified

        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()

        if not stream:
            return None

        # Get retrieval config
        retrieval_config = stream.retrieval_config or {}
        broad_search = retrieval_config.get("broad_search", {})
        queries = broad_search.get("queries", [])

        # Validate query index
        if query_index < 0 or query_index >= len(queries):
            raise ValueError(
                f"Query index {query_index} out of range (0-{len(queries)-1})"
            )

        # Update the query expression
        queries[query_index]["query_expression"] = query_expression

        # Save back to database
        broad_search["queries"] = queries
        retrieval_config["broad_search"] = broad_search
        stream.retrieval_config = retrieval_config

        # Mark as modified
        flag_modified(stream, "retrieval_config")
        stream.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(stream)
        return stream

    async def update_semantic_filter(
        self,
        stream_id: int,
        query_index: int,
        enabled: bool,
        criteria: str,
        threshold: float,
    ) -> Optional[ResearchStream]:
        """
        Update semantic filter configuration for a specific broad query (async).

        Returns:
            Updated ResearchStream model or None if not found
        """
        from sqlalchemy.orm.attributes import flag_modified

        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()

        if not stream:
            return None

        # Get retrieval config
        retrieval_config = stream.retrieval_config or {}
        broad_search = retrieval_config.get("broad_search", {})
        queries = broad_search.get("queries", [])

        # Validate query index
        if query_index < 0 or query_index >= len(queries):
            raise ValueError(
                f"Query index {query_index} out of range (0-{len(queries)-1})"
            )

        # Update the semantic filter
        queries[query_index]["semantic_filter"] = {
            "enabled": enabled,
            "criteria": criteria,
            "threshold": threshold,
        }

        # Save back
        broad_search["queries"] = queries
        retrieval_config["broad_search"] = broad_search
        stream.retrieval_config = retrieval_config

        flag_modified(stream, "retrieval_config")
        stream.updated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(stream)
        return stream

    async def update_enrichment_config(
        self, stream_id: int, enrichment_config: Optional[Dict[str, Any]]
    ) -> None:
        """
        Update enrichment config for a stream (async).

        Args:
            stream_id: Research stream ID
            enrichment_config: New enrichment config dict, or None to reset to defaults
        """
        from sqlalchemy.orm.attributes import flag_modified

        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()

        if not stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        logger.info(
            f"Setting enrichment_config for stream {stream_id}: {enrichment_config}"
        )
        stream.enrichment_config = enrichment_config

        # Always flag as modified since we're updating the column
        flag_modified(stream, "enrichment_config")

        stream.updated_at = datetime.utcnow()
        await self.db.commit()
        logger.info(f"Committed enrichment_config for stream {stream_id}")

    async def update_stream_scope_global(self, stream_id: int) -> ResearchStreamSchema:
        """Change a stream's scope to global (async). For platform admin use."""
        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()

        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found"
            )

        stream.scope = StreamScope.GLOBAL
        stream.org_id = None

        await self.db.commit()
        await self.db.refresh(stream)

        logger.info(f"Set stream {stream_id} scope to global")
        return ResearchStreamSchema.model_validate(stream)

    async def list_global_streams(self) -> List[ResearchStreamSchema]:
        """Get all global streams (async). For platform admin use."""
        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.scope == StreamScope.GLOBAL)
        )
        streams = result.scalars().all()

        logger.info(f"Listed {len(streams)} global streams")
        return [ResearchStreamSchema.model_validate(s) for s in streams]

    async def get_research_stream(
        self, user: User, stream_id: int
    ) -> Optional[ResearchStream]:
        """
        Get a specific research stream by ID with access check (async).

        Returns:
            ResearchStream model or None if not found/no access
        """
        # Check if user has access to this stream
        accessible_ids = await self.get_accessible_stream_ids(user)

        if stream_id not in accessible_ids:
            return None

        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        return result.scalars().first()

    async def get_accessible_stream_ids(self, user: User) -> Set[int]:
        """
        Get all stream IDs that a user can access (async version).

        Access rules by role:
        - PLATFORM_ADMIN: All global streams + own personal streams
        - ORG_ADMIN: All org streams for their org + subscribed global streams + own personal
        - MEMBER: Subscribed org streams + subscribed global streams (via org) + own personal
        """
        accessible_ids: Set[int] = set()

        # 1. Personal streams (user owns) - same for all roles
        result = await self.db.execute(
            select(ResearchStream.stream_id).where(
                and_(
                    ResearchStream.scope == StreamScope.PERSONAL,
                    ResearchStream.user_id == user.user_id,
                )
            )
        )
        accessible_ids.update(row[0] for row in result.all())

        # 2. Handle based on role
        if user.role == UserRole.PLATFORM_ADMIN:
            # Platform admins see ALL global streams
            result = await self.db.execute(
                select(ResearchStream.stream_id).where(
                    ResearchStream.scope == StreamScope.GLOBAL
                )
            )
            accessible_ids.update(row[0] for row in result.all())

        elif user.role == UserRole.ORG_ADMIN and user.org_id:
            # Org admins see ALL org streams for their org
            result = await self.db.execute(
                select(ResearchStream.stream_id).where(
                    and_(
                        ResearchStream.scope == StreamScope.ORGANIZATION,
                        ResearchStream.org_id == user.org_id,
                    )
                )
            )
            accessible_ids.update(row[0] for row in result.all())

            # Plus global streams their org is subscribed to
            result = await self.db.execute(
                select(OrgStreamSubscription.stream_id).where(
                    OrgStreamSubscription.org_id == user.org_id
                )
            )
            accessible_ids.update(row[0] for row in result.all())

        else:
            # Regular members: subscribed org streams only
            result = await self.db.execute(
                select(UserStreamSubscription.stream_id)
                .join(
                    ResearchStream,
                    ResearchStream.stream_id == UserStreamSubscription.stream_id,
                )
                .where(
                    and_(
                        UserStreamSubscription.user_id == user.user_id,
                        UserStreamSubscription.is_subscribed == True,
                        ResearchStream.scope == StreamScope.ORGANIZATION,
                    )
                )
            )
            accessible_ids.update(row[0] for row in result.all())

            # Plus global streams (org subscribed AND user not opted out)
            if user.org_id:
                result = await self.db.execute(
                    select(OrgStreamSubscription.stream_id).where(
                        OrgStreamSubscription.org_id == user.org_id
                    )
                )
                org_subscribed_ids = {row[0] for row in result.all()}

                # Get streams user has opted out of
                result = await self.db.execute(
                    select(UserStreamSubscription.stream_id).where(
                        and_(
                            UserStreamSubscription.user_id == user.user_id,
                            UserStreamSubscription.is_subscribed == False,
                        )
                    )
                )
                opted_out_ids = {row[0] for row in result.all()}

                # Global streams = org subscribed - user opted out
                accessible_ids.update(org_subscribed_ids - opted_out_ids)

        return accessible_ids

    async def get_user_research_streams(self, user: User) -> List[StreamWithStats]:
        """
        Get all research streams accessible to a user with report counts and latest report date (async version).

        Returns:
            List of StreamWithStats dataclasses containing stream model and stats
        """
        # Get accessible stream IDs
        accessible_ids = await self.get_accessible_stream_ids(user)

        if not accessible_ids:
            return []

        # Query streams with report counts and latest report date
        stmt = (
            select(
                ResearchStream,
                func.count(Report.report_id).label("report_count"),
                func.max(Report.created_at).label("latest_report_date"),
            )
            .outerjoin(Report, Report.research_stream_id == ResearchStream.stream_id)
            .where(ResearchStream.stream_id.in_(accessible_ids))
            .group_by(ResearchStream.stream_id)
            .order_by(ResearchStream.scope, ResearchStream.stream_name)
        )

        result = await self.db.execute(stmt)
        rows = result.all()

        # Return list of StreamWithStats dataclasses
        return [
            StreamWithStats(
                stream=stream,
                report_count=report_count,
                latest_report_date=latest_report_date,
            )
            for stream, report_count, latest_report_date in rows
        ]

    async def get_global_stream(self, stream_id: int) -> Optional[ResearchStreamSchema]:
        """Get a specific global stream by ID (async). For platform admin use."""
        result = await self.db.execute(
            select(ResearchStream).where(
                ResearchStream.stream_id == stream_id,
                ResearchStream.scope == StreamScope.GLOBAL,
            )
        )
        stream = result.scalars().first()

        if stream:
            return ResearchStreamSchema.model_validate(stream)
        return None

    async def get_all_streams_basic_info(self) -> List[dict]:
        """Get basic info (id, name) for all streams (async). For admin chat config."""
        result = await self.db.execute(
            select(ResearchStream).order_by(ResearchStream.stream_name)
        )
        streams = result.scalars().all()

        results = [
            {
                "stream_id": stream.stream_id,
                "stream_name": stream.stream_name,
            }
            for stream in streams
        ]

        logger.info(f"Got basic info for {len(results)} streams")
        return results

    async def get_stream_by_id(self, stream_id: int) -> ResearchStream:
        """
        Get a research stream by ID, raising ValueError if not found (async).

        Args:
            stream_id: The stream ID to look up

        Returns:
            ResearchStream model instance

        Raises:
            ValueError: if stream not found
        """
        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()
        if not stream:
            raise ValueError(f"Research stream {stream_id} not found")
        return stream

    async def get_streams_by_ids(self, stream_ids: List[int]) -> List[ResearchStream]:
        """
        Get multiple research streams by their IDs (async).

        Args:
            stream_ids: List of stream IDs to look up

        Returns:
            List of ResearchStream model instances (may be shorter than input if some not found)
        """
        if not stream_ids:
            return []

        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id.in_(stream_ids))
        )
        return list(result.scalars().all())

    async def get_enrichment_config(self, stream_id: int) -> Optional[Dict[str, Any]]:
        """
        Get enrichment config for a stream (async).

        Args:
            stream_id: Research stream ID

        Returns:
            Enrichment config dict or None if not set
        """
        result = await self.db.execute(
            select(ResearchStream).where(ResearchStream.stream_id == stream_id)
        )
        stream = result.scalars().first()

        if not stream:
            raise ValueError(f"Research stream with ID {stream_id} not found")

        return stream.enrichment_config


# Dependency injection provider for async research stream service
async def get_research_stream_service(
    db: AsyncSession = Depends(get_async_db),
) -> ResearchStreamService:
    """Get a ResearchStreamService instance with async database session."""
    return ResearchStreamService(db)
