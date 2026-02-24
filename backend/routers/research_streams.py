"""
Research Streams API endpoints
"""

import logging
from dataclasses import asdict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

from database import get_async_db
from models import User, StreamScope, UserRole, InformationSource as InformationSourceModel

from schemas.research_stream import (
    ResearchStream,
    Category,
    StreamType,
    ReportFrequency,
    RetrievalConfig,
    PresentationConfig,
    Concept,
    BroadQuery,
    BroadSearchStrategy,
    ScheduleConfig,
    PipelineLLMConfig,
    EnrichmentConfig,
    PromptTemplate,
    CategorizationPrompt,
    ArticleAnalysisConfig,
)
from schemas.semantic_space import SemanticSpace
from schemas.sources import INFORMATION_SOURCES, InformationSource
from schemas.canonical_types import CanonicalResearchArticle


from services.research_stream_service import (
    ResearchStreamService,
    get_research_stream_service,
)
from services.report_service import (
    ReportService,
    SuppliedArticleStatusData,
    ReportOnlyArticleData,
    CompareReportResultData,
)
from services.retrieval_query_service import RetrievalQueryService
from services.concept_proposal_service import ConceptProposalService
from services.broad_search_service import BroadSearchService
from services.user_tracking_service import track_endpoint
from services.report_summary_service import DEFAULT_PROMPTS
from services.article_categorization_service import ArticleCategorizationService
from services.article_analysis_service import (
    DEFAULT_STANCE_PROMPT,
    get_stance_available_slugs,
)

from routers.auth import get_current_user

router = APIRouter(prefix="/api/research-streams", tags=["research-streams"])


def _check_can_modify_stream(stream, current_user: User):
    """
    Check if user can modify (edit/delete/run) a stream.

    Rules:
    - Global streams: Only platform admins can modify
    - Organization streams: Only org admins of that org (or platform admins)
    - Personal streams: Only the creator (or platform admins)

    Raises HTTPException if not authorized.
    """
    # Normalize scope to string for comparison (handles both enum and string)
    scope = getattr(stream.scope, 'value', stream.scope) if stream.scope else 'personal'

    if scope == StreamScope.GLOBAL.value:
        if current_user.role != UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can modify global streams"
            )
    elif scope == StreamScope.ORGANIZATION.value:
        if current_user.role == UserRole.PLATFORM_ADMIN:
            return  # Platform admins can modify any stream
        if current_user.role != UserRole.ORG_ADMIN or current_user.org_id != stream.org_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only org admins can modify organization streams"
            )
    else:  # Personal stream
        if stream.user_id != current_user.user_id and current_user.role != UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You can only modify your own personal streams"
            )


class InformationSourceResponse(BaseModel):
    """Information source from database"""
    source_id: int
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


@router.get("/metadata/sources", response_model=List[InformationSourceResponse])
async def get_information_sources(db: AsyncSession = Depends(get_async_db)):
    """Get the list of available information sources from the database"""
    result = await db.execute(
        select(InformationSourceModel).where(InformationSourceModel.is_active == True)
    )
    sources = result.scalars().all()
    return [
        InformationSourceResponse(
            source_id=s.source_id,
            name=s.source_name,
            description=s.description
        )
        for s in sources
    ]

# ============================================================================
# Research Stream CRUD Endpoints
# ============================================================================

class ResearchStreamCreateRequest(BaseModel):
    """Request schema for creating a research stream - three-layer architecture"""
    stream_name: str = Field(..., min_length=1, max_length=255)
    purpose: str = Field(..., min_length=1, description="Why this stream exists")
    schedule_config: Optional[ScheduleConfig] = Field(None, description="Scheduling configuration (frequency, timing, etc.)")
    # Scope determines visibility (personal, organization, or global)
    # - personal: Only creator can see (default)
    # - organization: All org members can subscribe (org_admin only)
    # - global: Platform-wide, orgs subscribe to access (platform_admin only)
    scope: Optional[str] = Field("personal", description="Stream scope: personal, organization, or global")
    # Three-layer architecture
    semantic_space: SemanticSpace = Field(..., description="Layer 1: What information matters")
    retrieval_config: RetrievalConfig = Field(..., description="Layer 2: How to find & filter")
    presentation_config: PresentationConfig = Field(..., description="Layer 3: How to organize results")

class ResearchStreamUpdateRequest(BaseModel):
    """Request schema for updating a research stream - three-layer architecture"""
    stream_name: Optional[str] = Field(None, min_length=1, max_length=255)
    purpose: Optional[str] = None
    schedule_config: Optional[ScheduleConfig] = None
    is_active: Optional[bool] = None
    # Three-layer architecture
    semantic_space: Optional[SemanticSpace] = None
    retrieval_config: Optional[RetrievalConfig] = None
    presentation_config: Optional[PresentationConfig] = None
    # Control Panel: LLM configuration
    llm_config: Optional[PipelineLLMConfig] = Field(None, description="LLM configuration for pipeline stages")

class ToggleStatusRequest(BaseModel):
    is_active: bool


@router.get("", response_model=List[ResearchStream])
async def get_research_streams(
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get all research streams for the current user (async)"""
    logger.info(f"get_research_streams - user_id={current_user.user_id}")

    try:
        # Use async method on service
        results = await service.get_user_research_streams(current_user)

        # Convert dataclasses to schemas at API boundary
        streams = [
            ResearchStream.model_validate(r.stream, from_attributes=True).model_copy(
                update={'report_count': r.report_count, 'latest_report_date': r.latest_report_date}
            )
            for r in results
        ]

        logger.info(f"get_research_streams complete - user_id={current_user.user_id}, count={len(streams)}")
        return streams

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_research_streams failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get research streams: {str(e)}"
        )


@router.get("/{stream_id}", response_model=ResearchStream)
@track_endpoint("view_stream")
async def get_research_stream(
    stream_id: int,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get a specific research stream by ID (async)"""
    logger.info(f"get_research_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Use async method for access check and retrieval
        stream = await service.get_research_stream(current_user, stream_id)

        if not stream:
            logger.warning(f"get_research_stream - not found - user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Convert to Pydantic schema
        result = ResearchStream.model_validate(stream)

        logger.info(f"get_research_stream complete - user_id={current_user.user_id}, stream_id={stream_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_research_stream failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get research stream: {str(e)}"
        )


@router.post("", response_model=ResearchStream, status_code=status.HTTP_201_CREATED)
async def create_research_stream(
    request: ResearchStreamCreateRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Create a new research stream with three-layer architecture (async).

    Scope determines visibility:
    - personal: Only creator can see (any user)
    - organization: Org members can subscribe (org_admin only)
    - global: Platform-wide (platform_admin only)
    """
    logger.info(f"create_research_stream - user_id={current_user.user_id}, stream_name={request.stream_name}, scope={request.scope}")

    try:
        # Parse and validate scope
        scope_str = (request.scope or "personal").lower()
        try:
            scope = StreamScope(scope_str)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid scope: {scope_str}. Must be one of: personal, organization, global"
            )

        # Validate scope based on user role
        if scope == StreamScope.GLOBAL and current_user.role != UserRole.PLATFORM_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only platform admins can create global streams"
            )

        if scope == StreamScope.ORGANIZATION:
            if current_user.role not in (UserRole.PLATFORM_ADMIN, UserRole.ORG_ADMIN):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Only org admins can create organization streams"
                )
            if not current_user.org_id and current_user.role != UserRole.PLATFORM_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="You must belong to an organization to create org streams"
                )

        # Convert Pydantic models to dicts
        semantic_space_dict = request.semantic_space.model_dump() if hasattr(request.semantic_space, 'model_dump') else request.semantic_space
        retrieval_config_dict = request.retrieval_config.model_dump() if hasattr(request.retrieval_config, 'model_dump') else request.retrieval_config
        presentation_config_dict = request.presentation_config.model_dump() if hasattr(request.presentation_config, 'model_dump') else request.presentation_config
        schedule_config_dict = request.schedule_config.model_dump() if request.schedule_config and hasattr(request.schedule_config, 'model_dump') else request.schedule_config

        stream = await service.create_research_stream(
            user=current_user,
            stream_name=request.stream_name,
            purpose=request.purpose,
            scope=scope,
            semantic_space=semantic_space_dict,
            retrieval_config=retrieval_config_dict,
            presentation_config=presentation_config_dict,
            schedule_config=schedule_config_dict,
            org_id=current_user.org_id
        )

        # Convert to Pydantic schema
        result = ResearchStream.model_validate(stream)

        logger.info(f"create_research_stream complete - user_id={current_user.user_id}, stream_id={stream.stream_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"create_research_stream failed - user_id={current_user.user_id}, stream_name={request.stream_name}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create research stream: {str(e)}"
        )


@router.put("/{stream_id}", response_model=ResearchStream)
async def update_research_stream(
    stream_id: int,
    request: ResearchStreamUpdateRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Update an existing research stream (async)"""
    logger.info(f"update_research_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify access using async method
        existing_stream = await service.get_research_stream(current_user, stream_id)
        if not existing_stream:
            logger.warning(f"update_research_stream - not found - user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Check if user can modify this stream (based on scope and role)
        _check_can_modify_stream(existing_stream, current_user)

        # Prepare update data (only non-None values)
        update_data = {k: v for k, v in request.dict().items() if v is not None}

        # Convert scoring_config from Pydantic model to dict if present
        if 'scoring_config' in update_data and update_data['scoring_config'] is not None:
            if hasattr(update_data['scoring_config'], 'dict'):
                update_data['scoring_config'] = update_data['scoring_config'].dict()

        stream = await service.update_research_stream(stream_id, update_data)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Convert to Pydantic schema
        result = ResearchStream.model_validate(stream)

        logger.info(f"update_research_stream complete - user_id={current_user.user_id}, stream_id={stream_id}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_research_stream failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update research stream: {str(e)}"
        )


@router.delete("/{stream_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_research_stream(
    stream_id: int,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Delete a research stream (async)"""
    logger.info(f"delete_research_stream - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify access using async method
        existing_stream = await service.get_research_stream(current_user, stream_id)
        if not existing_stream:
            logger.warning(f"delete_research_stream - not found - user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Check if user can modify this stream (based on scope and role)
        _check_can_modify_stream(existing_stream, current_user)

        deleted = await service.delete_research_stream(current_user, stream_id)
        if not deleted:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found or not authorized"
            )

        logger.info(f"delete_research_stream complete - user_id={current_user.user_id}, stream_id={stream_id}")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"delete_research_stream failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete research stream: {str(e)}"
        )


@router.patch("/{stream_id}/status", response_model=ResearchStream)
async def toggle_research_stream_status(
    stream_id: int,
    request: ToggleStatusRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Toggle research stream active status (async)"""
    logger.info(f"toggle_research_stream_status - user_id={current_user.user_id}, stream_id={stream_id}, is_active={request.is_active}")

    try:
        # Verify access using async method
        existing_stream = await service.get_research_stream(current_user, stream_id)
        if not existing_stream:
            logger.warning(f"toggle_research_stream_status - not found - user_id={current_user.user_id}, stream_id={stream_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Check if user can modify this stream (based on scope and role)
        _check_can_modify_stream(existing_stream, current_user)

        stream = await service.update_research_stream(stream_id, {"is_active": request.is_active})
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Convert to Pydantic schema
        result = ResearchStream.model_validate(stream)

        logger.info(f"toggle_research_stream_status complete - user_id={current_user.user_id}, stream_id={stream_id}, is_active={request.is_active}")
        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"toggle_research_stream_status failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to toggle stream status: {str(e)}"
        )


# ============================================================================
# Granular Update Endpoints (for Refinement Workbench)
# ============================================================================


class UpdateBroadQueryRequest(BaseModel):
    """Request to update a specific broad query"""
    query_expression: str = Field(..., description="Updated PubMed query expression")


class UpdateSemanticFilterRequest(BaseModel):
    """Request to update semantic filter for a broad query"""
    enabled: bool = Field(..., description="Whether semantic filter is enabled")
    criteria: str = Field("", description="Natural language filter criteria")
    threshold: float = Field(0.7, ge=0.0, le=1.0, description="Relevance threshold (0.0-1.0)")


@router.patch("/{stream_id}/retrieval-config/queries/{query_index}", response_model=ResearchStream)
async def update_broad_query(
    stream_id: int,
    query_index: int,
    request: UpdateBroadQueryRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Update a specific broad query's expression (async).
    Used by refinement workbench to apply tested queries back to stream config.

    Args:
        stream_id: Research stream ID
        query_index: Index of the query to update (0-based)
        request: Updated query expression

    Returns:
        Updated ResearchStream
    """
    logger.info(f"update_broad_query - user_id={current_user.user_id}, stream_id={stream_id}, query_index={query_index}")

    try:
        # Verify access using async method
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Check if user can modify this stream (based on scope and role)
        _check_can_modify_stream(stream, current_user)

        # Update via async method
        updated_stream = await service.update_broad_query(
            stream_id=stream_id,
            query_index=query_index,
            query_expression=request.query_expression
        )

        if not updated_stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Convert to Pydantic schema
        result = ResearchStream.model_validate(updated_stream)

        logger.info(f"update_broad_query complete - user_id={current_user.user_id}, stream_id={stream_id}, query_index={query_index}")
        return result

    except ValueError as e:
        logger.warning(f"update_broad_query validation error - user_id={current_user.user_id}, stream_id={stream_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_broad_query failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update broad query: {str(e)}"
        )


@router.patch("/{stream_id}/retrieval-config/queries/{query_index}/semantic-filter", response_model=ResearchStream)
async def update_semantic_filter(
    stream_id: int,
    query_index: int,
    request: UpdateSemanticFilterRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Update semantic filter configuration for a specific broad query (async).
    Used by refinement workbench to apply tested filters back to stream config.

    Args:
        stream_id: Research stream ID
        query_index: Index of the query whose filter to update (0-based)
        request: Updated filter configuration

    Returns:
        Updated ResearchStream
    """
    logger.info(f"update_semantic_filter - user_id={current_user.user_id}, stream_id={stream_id}, query_index={query_index}")

    try:
        # Verify access using async method
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Check if user can modify this stream (based on scope and role)
        _check_can_modify_stream(stream, current_user)

        # Update via async method
        updated_stream = await service.update_semantic_filter(
            stream_id=stream_id,
            query_index=query_index,
            enabled=request.enabled,
            criteria=request.criteria,
            threshold=request.threshold
        )

        if not updated_stream:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )

        # Convert to Pydantic schema
        result = ResearchStream.model_validate(updated_stream)

        logger.info(f"update_semantic_filter complete - user_id={current_user.user_id}, stream_id={stream_id}, query_index={query_index}")
        return result

    except ValueError as e:
        logger.warning(f"update_semantic_filter validation error - user_id={current_user.user_id}, stream_id={stream_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_semantic_filter failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update semantic filter: {str(e)}"
        )


# ============================================================================
# Enrichment and Categorization Configuration Endpoints
# ============================================================================

class EnrichmentConfigResponse(BaseModel):
    """Response containing stream's enrichment config or defaults"""
    enrichment_config: Optional[EnrichmentConfig]
    is_using_defaults: bool
    defaults: Dict[str, PromptTemplate]


class UpdateEnrichmentConfigRequest(BaseModel):
    """Request to update enrichment config"""
    enrichment_config: Optional[EnrichmentConfig] = Field(
        None,
        description="Set to null to reset to defaults"
    )


class CategorizationPromptResponse(BaseModel):
    """Response containing stream's categorization prompt or defaults"""
    categorization_prompt: Optional[CategorizationPrompt]
    is_using_defaults: bool
    defaults: CategorizationPrompt


class UpdateCategorizationPromptRequest(BaseModel):
    """Request to update categorization prompt"""
    categorization_prompt: Optional[CategorizationPrompt] = Field(
        None,
        description="Set to null to reset to defaults"
    )


class ArticleAnalysisConfigResponse(BaseModel):
    """Response containing stream's article analysis config or defaults"""
    article_analysis_config: Optional[ArticleAnalysisConfig]
    is_using_defaults: bool
    defaults: Dict[str, Any]  # {stance_analysis_prompt: {...}}
    available_slugs: List[Dict[str, str]]  # [{slug: str, description: str}, ...]


class UpdateArticleAnalysisConfigRequest(BaseModel):
    """Request to update article analysis config"""
    article_analysis_config: Optional[ArticleAnalysisConfig] = Field(
        None,
        description="Set to null to reset to defaults"
    )


@router.get("/{stream_id}/enrichment-config", response_model=EnrichmentConfigResponse)
async def get_stream_enrichment_config(
    stream_id: int,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get enrichment config for a stream (or defaults if not set)"""
    logger.info(f"get_enrichment_config - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify ownership and get stream
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

        # Build response
        enrichment_config = None
        if stream.enrichment_config:
            enrichment_config = EnrichmentConfig(**stream.enrichment_config)

        defaults = {
            key: PromptTemplate(
                system_prompt=value["system_prompt"],
                user_prompt_template=value["user_prompt_template"]
            )
            for key, value in DEFAULT_PROMPTS.items()
        }

        return EnrichmentConfigResponse(
            enrichment_config=enrichment_config,
            is_using_defaults=enrichment_config is None,
            defaults=defaults
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_enrichment_config failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get enrichment config: {str(e)}"
        )


@router.put("/{stream_id}/enrichment-config")
async def update_stream_enrichment_config(
    stream_id: int,
    request: UpdateEnrichmentConfigRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Update enrichment config for a stream (set to null to reset to defaults)"""
    logger.info(f"update_enrichment_config - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify ownership
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

        # Check if user can modify this stream
        _check_can_modify_stream(stream, current_user)

        # Prepare enrichment config dict
        config_dict = request.enrichment_config.dict() if request.enrichment_config else None

        # Update via async method
        await service.update_research_stream(stream_id, {"enrichment_config": config_dict})

        logger.info(f"Enrichment config saved for stream {stream_id}")
        return {"status": "success", "message": "Enrichment config updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_enrichment_config failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update enrichment config: {str(e)}"
        )


@router.get("/{stream_id}/categorization-prompt", response_model=CategorizationPromptResponse)
async def get_stream_categorization_prompt(
    stream_id: int,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get categorization prompt for a stream (or defaults if not set)"""
    logger.info(f"get_categorization_prompt - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify ownership and get stream
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

        # Get categorization prompt from presentation_config
        categorization_prompt = None
        if stream.presentation_config and isinstance(stream.presentation_config, dict):
            cat_prompt_data = stream.presentation_config.get("categorization_prompt")
            if cat_prompt_data:
                categorization_prompt = CategorizationPrompt(**cat_prompt_data)

        # Get defaults
        defaults_data = ArticleCategorizationService.get_default_prompts()
        defaults = CategorizationPrompt(
            system_prompt=defaults_data["system_prompt"],
            user_prompt_template=defaults_data["user_prompt_template"]
        )

        return CategorizationPromptResponse(
            categorization_prompt=categorization_prompt,
            is_using_defaults=categorization_prompt is None,
            defaults=defaults
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_categorization_prompt failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get categorization prompt: {str(e)}"
        )


@router.put("/{stream_id}/categorization-prompt")
async def update_stream_categorization_prompt(
    stream_id: int,
    request: UpdateCategorizationPromptRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Update categorization prompt for a stream (set to null to reset to defaults)"""
    logger.info(f"update_categorization_prompt - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify ownership
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

        # Check if user can modify this stream
        _check_can_modify_stream(stream, current_user)

        # Get current presentation_config
        current_config = stream.presentation_config or {}
        if isinstance(current_config, dict):
            # Update categorization_prompt within presentation_config
            if request.categorization_prompt:
                current_config["categorization_prompt"] = request.categorization_prompt.dict()
            else:
                current_config.pop("categorization_prompt", None)

        # Update via async method
        await service.update_research_stream(stream_id, {"presentation_config": current_config})

        logger.info(f"Categorization prompt saved for stream {stream_id}")
        return {"status": "success", "message": "Categorization prompt updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_categorization_prompt failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update categorization prompt: {str(e)}"
        )


@router.get("/{stream_id}/article-analysis-config", response_model=ArticleAnalysisConfigResponse)
async def get_stream_article_analysis_config(
    stream_id: int,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Get article analysis config for a stream (or defaults if not set)"""
    logger.info(f"get_article_analysis_config - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify ownership and get stream
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

        # Build response
        article_analysis_config = None
        if stream.article_analysis_config:
            article_analysis_config = ArticleAnalysisConfig(**stream.article_analysis_config)

        defaults = {
            "stance_analysis_prompt": DEFAULT_STANCE_PROMPT,
        }

        return ArticleAnalysisConfigResponse(
            article_analysis_config=article_analysis_config,
            is_using_defaults=article_analysis_config is None,
            defaults=defaults,
            available_slugs=get_stance_available_slugs()
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_article_analysis_config failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get article analysis config: {str(e)}"
        )


@router.put("/{stream_id}/article-analysis-config")
async def update_stream_article_analysis_config(
    stream_id: int,
    request: UpdateArticleAnalysisConfigRequest,
    service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """Update article analysis config for a stream (set to null to reset to defaults)"""
    logger.info(f"update_article_analysis_config - user_id={current_user.user_id}, stream_id={stream_id}")

    try:
        # Verify ownership
        stream = await service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Stream not found")

        # Check if user can modify this stream
        _check_can_modify_stream(stream, current_user)

        # Prepare config dict
        config_dict = request.article_analysis_config.model_dump() if request.article_analysis_config else None

        # Update via async method
        await service.update_research_stream(stream_id, {"article_analysis_config": config_dict})

        logger.info(f"Article analysis config saved for stream {stream_id}")
        return {"status": "success", "message": "Article analysis config updated"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_article_analysis_config failed - user_id={current_user.user_id}, stream_id={stream_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update article analysis config: {str(e)}"
        )


# ============================================================================
# Shared Retrieval Response Models
# ============================================================================


class QueryTestResponse(BaseModel):
    """Response from query testing"""
    success: bool = Field(..., description="Whether query executed successfully")
    article_count: int = Field(..., description="Total number of articles found")
    sample_articles: List[CanonicalResearchArticle] = Field(..., description="Sample articles")
    error_message: Optional[str] = Field(None, description="Error message if query failed")


class ProposeConceptsResponse(BaseModel):
    """Response from concept proposal based on semantic space analysis"""
    proposed_concepts: List[Concept] = Field(..., description="Proposed concepts for retrieval")
    analysis: Dict[str, Any] = Field(..., description="Phase 1 analysis (entities, relationships)")
    reasoning: str = Field(..., description="Overall strategy explanation")
    coverage_check: Dict[str, Any] = Field(..., description="Topic coverage validation")


class ProposeBroadSearchResponse(BaseModel):
    """Response from broad search proposal"""
    queries: List[BroadQuery] = Field(..., description="Proposed broad search queries (usually 1-3)")
    strategy_rationale: str = Field(..., description="Overall explanation of broad search strategy")
    coverage_analysis: Dict[str, Any] = Field(..., description="Analysis of how queries cover topics")


class GenerateBroadFilterRequest(BaseModel):
    """Request to generate semantic filter for a broad query"""
    broad_query: BroadQuery = Field(..., description="Broad query to generate filter for")


class GenerateConceptQueryRequest(BaseModel):
    """Request to generate a query for a specific concept"""
    concept: Concept = Field(..., description="Concept to generate query for")
    source_id: str = Field(..., description="Source to generate query for (e.g., 'pubmed')")


class GenerateConceptQueryResponse(BaseModel):
    """Response from concept query generation"""
    query_expression: str = Field(..., description="Generated query expression")
    reasoning: str = Field(..., description="Explanation of query design")


class GenerateConceptFilterRequest(BaseModel):
    """Request to generate semantic filter for a concept"""
    concept: Concept = Field(..., description="Concept to generate filter for")


class GenerateConceptFilterResponse(BaseModel):
    """Response from semantic filter generation"""
    criteria: str = Field(..., description="Filter criteria description")
    threshold: float = Field(..., ge=0.0, le=1.0, description="Relevance threshold (0-1)")
    reasoning: str = Field(..., description="Explanation of filter design")


class ValidateConceptsRequest(BaseModel):
    """Request to validate concepts configuration"""
    concepts: List[Concept]


class ValidateConceptsResponse(BaseModel):
    """Response from concepts validation"""
    is_complete: bool = Field(..., description="Whether all topics are covered")
    coverage: Dict[str, Any] = Field(..., description="Topic coverage details")
    configuration_status: Dict[str, Any] = Field(..., description="Configuration completeness")
    warnings: List[str] = Field(..., description="Validation warnings")
    ready_to_activate: bool = Field(..., description="Whether config is ready for production")


# ============================================================================
# Retrieval Concept Workflow (Concept-Based Architecture)
# ============================================================================

@router.post("/{stream_id}/retrieval/propose-concepts", response_model=ProposeConceptsResponse)
async def propose_retrieval_concepts(
    stream_id: int,
    db: AsyncSession = Depends(get_async_db),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Phase 1: Propose retrieval concepts based on semantic space analysis.

    Analyzes the semantic space and generates concept proposals following the framework:
    - Extracts entities and relationships
    - Generates entity-relationship patterns (concepts)
    - Many-to-many mapping to topics
    - Volume-driven design (will be refined in later phases)
    """
    concept_service = ConceptProposalService(db, current_user.user_id)

    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns model with semantic_space already parsed
        stream = await stream_service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        # Propose concepts using parsed semantic_space
        result = await concept_service.propose_concepts(stream.semantic_space)

        # Convert dataclass to schema at API boundary
        return ProposeConceptsResponse(
            proposed_concepts=result.proposed_concepts,
            analysis=result.analysis,
            reasoning=result.reasoning,
            coverage_check=asdict(result.coverage_check)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Concept proposal failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Concept proposal failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/propose-broad-search", response_model=ProposeBroadSearchResponse)
async def propose_broad_search(
    stream_id: int,
    db: AsyncSession = Depends(get_async_db),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Alternative to propose-concepts: Generate broad, simple search strategy.

    Analyzes the semantic space and proposes 1-3 broad search queries that
    cast a wide net to capture all relevant literature. Optimized for weekly
    monitoring where accepting false positives is better than missing papers.

    Philosophy:
    - Find the most general terms that cover all topics
    - Simple is better: 1-3 queries instead of many narrow concepts
    - Accept some false positives (better than missing papers)
    - Leverage that weekly volumes are naturally limited
    """
    broad_search_service = BroadSearchService(db, current_user.user_id)

    try:
        # Get stream (raises 404 if not found or not authorized)
        stream = await stream_service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        # Propose broad search using parsed semantic_space
        result = await broad_search_service.propose_broad_search(stream.semantic_space)

        # Convert dataclass to schema at API boundary
        return ProposeBroadSearchResponse(
            queries=result.queries,
            strategy_rationale=result.strategy_rationale,
            coverage_analysis=asdict(result.coverage_analysis)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Broad search proposal failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Broad search proposal failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/generate-broad-filter", response_model=GenerateConceptFilterResponse)
async def generate_broad_filter(
    stream_id: int,
    request: GenerateBroadFilterRequest,
    db: AsyncSession = Depends(get_async_db),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Generate semantic filter criteria for a broad query.

    Uses LLM to create filter criteria based on the broad query's covered topics
    and search terms.
    """
    query_service = RetrievalQueryService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        stream = await stream_service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        # Generate filter using service
        criteria, threshold, reasoning = await query_service.generate_filter_for_broad_query(
            broad_query=request.broad_query,
            semantic_space=stream.semantic_space
        )

        return GenerateConceptFilterResponse(
            criteria=criteria,
            threshold=threshold,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Broad filter generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Broad filter generation failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/generate-concept-query", response_model=GenerateConceptQueryResponse)
async def generate_concept_query(
    stream_id: int,
    request: GenerateConceptQueryRequest,
    db: AsyncSession = Depends(get_async_db),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Generate a source-specific query for a concept.

    Uses the concept's entity pattern, relationship pattern, and vocabulary terms
    to generate an optimized query following framework principles:
    - Single inclusion pattern
    - Vocabulary expansion within entities
    - Minimal exclusions
    """
    query_service = RetrievalQueryService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns model with semantic_space already parsed
        stream = await stream_service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        # Validate source
        valid_sources = [src.source_id for src in INFORMATION_SOURCES]
        if request.source_id not in valid_sources:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid source_id. Must be one of: {', '.join(valid_sources)}"
            )

        # Generate query using concept from request and parsed semantic_space
        query_expression, reasoning = await query_service.generate_query_for_concept(
            concept=request.concept,
            source_id=request.source_id,
            semantic_space=stream.semantic_space
        )

        return GenerateConceptQueryResponse(
            query_expression=query_expression,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Concept query generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Concept query generation failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/generate-concept-filter", response_model=GenerateConceptFilterResponse)
async def generate_concept_filter(
    stream_id: int,
    request: GenerateConceptFilterRequest,
    db: AsyncSession = Depends(get_async_db),
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Generate semantic filter criteria for a concept.

    Uses LLM to create filter criteria based on the concept's covered topics,
    entity pattern, and rationale.
    """
    query_service = RetrievalQueryService(db)

    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns model with semantic_space already parsed
        stream = await stream_service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        # Generate filter using service with concept from request and parsed semantic_space
        criteria, threshold, reasoning = await query_service.generate_filter_for_concept(
            concept=request.concept,
            semantic_space=stream.semantic_space
        )

        return GenerateConceptFilterResponse(
            criteria=criteria,
            threshold=threshold,
            reasoning=reasoning
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Semantic filter generation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Semantic filter generation failed: {str(e)}"
        )


@router.post("/{stream_id}/retrieval/validate-concepts", response_model=ValidateConceptsResponse)
async def validate_concepts(
    stream_id: int,
    request: ValidateConceptsRequest,
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Validate concepts configuration for completeness and readiness.

    Checks coverage, configuration status, and whether the retrieval
    config is ready to activate.
    """
    try:
        # Get stream (raises 404 if not found or not authorized)
        # Returns Pydantic schema with semantic_space already parsed
        stream = await stream_service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        concepts = request.concepts

        # Check coverage using parsed semantic_space
        from schemas.research_stream import RetrievalConfig
        temp_config = RetrievalConfig(concepts=concepts)
        coverage = temp_config.validate_coverage(stream.semantic_space)

        # Check configuration status
        config_status = {
            "total_concepts": len(concepts),
            "concepts_with_queries": sum(
                1 for c in concepts if c.source_queries and len(c.source_queries) > 0
            ),
            "concepts_with_filters": sum(
                1 for c in concepts if c.semantic_filter.enabled or c.semantic_filter.criteria
            )
        }

        # Generate warnings
        warnings = []
        if not coverage["is_complete"]:
            warnings.append(f"Incomplete coverage: {len(coverage['uncovered_topics'])} topics not covered")

        if config_status["concepts_with_queries"] == 0:
            warnings.append("No concepts have queries configured")

        if config_status["concepts_with_queries"] < len(concepts):
            warnings.append(f"Only {config_status['concepts_with_queries']}/{len(concepts)} concepts have queries")

        # Determine if ready to activate
        ready_to_activate = (
            coverage["is_complete"] and
            config_status["concepts_with_queries"] == len(concepts) and
            len(concepts) > 0
        )

        return ValidateConceptsResponse(
            is_complete=coverage["is_complete"],
            coverage=coverage,
            configuration_status=config_status,
            warnings=warnings,
            ready_to_activate=ready_to_activate
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Concept validation failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Concept validation failed: {str(e)}"
        )


# ============================================================================
# Report Comparison Endpoint
# ============================================================================

class CompareReportRequest(BaseModel):
    """Request schema for comparing report to supplied PubMed IDs"""
    report_id: int = Field(..., description="Report ID to compare against")
    pubmed_ids: List[str] = Field(..., description="List of PubMed IDs to compare")


class SuppliedArticleStatus(BaseModel):
    """Status of a supplied PubMed ID in the pipeline"""
    pmid: str
    status: str = Field(..., description="not_found, filtered_out, or included")
    article_title: Optional[str] = None
    retrieval_unit_id: Optional[str] = Field(None, description="Concept ID or broad query ID that retrieved this article")
    filter_score: Optional[float] = None
    filter_score_reason: Optional[str] = None


class ReportOnlyArticle(BaseModel):
    """Article that was in the report but not in supplied PMIDs"""
    pmid: str
    title: str
    retrieval_unit_id: str = Field(..., description="Concept ID or broad query ID that retrieved this article")
    url: Optional[str] = None


class CompareReportResponse(BaseModel):
    """Response for report comparison"""
    supplied_articles: List[SuppliedArticleStatus]
    report_only_articles: List[ReportOnlyArticle]
    statistics: Dict[str, int] = Field(
        ...,
        description="Statistics: total_supplied, not_found, filtered_out, included, report_only"
    )


@router.post("/reports/{report_id}/compare", response_model=CompareReportResponse)
async def compare_report_to_pubmed_ids(
    report_id: int,
    request: CompareReportRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """
    Compare a pipeline report to a supplied set of PubMed IDs.

    For each supplied PMID, determines:
    - Was it retrieved in the search?
    - Did it pass the semantic filter?
    - Was it included in the report?

    Also returns articles in the report that weren't in the supplied list.
    """
    report_service = ReportService(db)
    result = await report_service.compare_to_pubmed_ids(
        report_id=report_id,
        user_id=current_user.user_id,
        pubmed_ids=request.pubmed_ids
    )

    # Convert dataclasses to Pydantic models for response
    return CompareReportResponse(
        supplied_articles=[
            SuppliedArticleStatus(
                pmid=a.pmid,
                status=a.status,
                article_title=a.article_title,
                retrieval_unit_id=a.retrieval_unit_id,
                filter_score=a.filter_score,
                filter_score_reason=a.filter_score_reason
            )
            for a in result.supplied_articles
        ],
        report_only_articles=[
            ReportOnlyArticle(
                pmid=a.pmid,
                title=a.title,
                retrieval_unit_id=a.retrieval_unit_id,
                url=a.url
            )
            for a in result.report_only_articles
        ],
        statistics=result.statistics
    )


# ============================================================================
# Curation Notes Endpoint
# ============================================================================

class CurationNoteItem(BaseModel):
    """A single curation note entry"""
    wip_article_id: int
    pmid: Optional[str] = None
    title: str
    curation_notes: str
    curator_included: bool
    curator_excluded: bool
    curated_by: Optional[int] = None
    curator_name: Optional[str] = None
    curated_at: Optional[str] = None
    pipeline_execution_id: str
    report_id: Optional[int] = None


class StreamCurationNotesResponse(BaseModel):
    """Response for stream curation notes"""
    stream_id: int
    stream_name: str
    notes: List[CurationNoteItem]
    total_count: int


@router.get("/{stream_id}/curation-notes", response_model=StreamCurationNotesResponse)
async def get_stream_curation_notes(
    stream_id: int,
    stream_service: ResearchStreamService = Depends(get_research_stream_service),
    current_user: User = Depends(get_current_user)
):
    """
    Get all curation notes for a research stream.

    Returns all WIP articles with curation notes across all pipeline executions
    for this stream, ordered by most recent first.
    """
    from services.wip_article_service import WipArticleService

    try:
        # Get stream (raises 404 if not found or not authorized)
        stream = await stream_service.get_research_stream(current_user, stream_id)
        if not stream:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Research stream not found")

        # Get wip service with same db session
        wip_service = WipArticleService(stream_service.db)

        # Get all articles with curation notes for this stream
        articles = await wip_service.get_articles_with_curation_notes_by_stream(stream_id)

        # Build response items with curator names and report IDs
        notes_list = []
        for article in articles:
            # Get curator name if available
            curator_name = None
            if article.curator and hasattr(article.curator, 'display_name'):
                curator_name = article.curator.display_name
            elif article.curator and hasattr(article.curator, 'email'):
                curator_name = article.curator.email

            # Get report ID from execution if available
            report_id = None
            if article.execution and article.execution.report_id:
                report_id = article.execution.report_id

            notes_list.append(CurationNoteItem(
                wip_article_id=article.id,
                pmid=article.pmid,
                title=article.title,
                curation_notes=article.curation_notes,
                curator_included=article.curator_included or False,
                curator_excluded=article.curator_excluded or False,
                curated_by=article.curated_by,
                curator_name=curator_name,
                curated_at=article.curated_at.isoformat() if article.curated_at else None,
                pipeline_execution_id=article.pipeline_execution_id,
                report_id=report_id
            ))

        return StreamCurationNotesResponse(
            stream_id=stream_id,
            stream_name=stream.stream_name,
            notes=notes_list,
            total_count=len(notes_list)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get curation notes: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get curation notes: {str(e)}"
        )
