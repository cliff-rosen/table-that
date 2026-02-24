"""
Help Content Router

API endpoints for browsing and editing help documentation (platform admin only).

Help content is organized by CATEGORY (e.g., "reports", "streams", "tools").
Each category contains multiple TOPICS (e.g., "overview", "viewing", "tablizer").

Content defaults come from YAML files. Database overrides are stored in
the `help_content_override` table and take precedence over YAML defaults.
"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Any, List, Optional, Dict
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import logging

from database import get_async_db
from models import User, HelpContentOverride, ChatConfig
from routers.auth import get_current_user
from services.help_registry import (
    get_all_topic_ids,
    get_all_categories,
    get_topics_by_category,
    get_topic,
    get_help_toc_for_role,
    reload_help_content,
    DEFAULT_TOC_PREAMBLE,
    DEFAULT_CATEGORY_LABELS,
    DEFAULT_HELP_NARRATIVE,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/help", tags=["admin-help"])


# ============================================================================
# Response Models
# ============================================================================

class HelpTopicContent(BaseModel):
    """A single help topic with its content."""
    category: str
    topic: str
    title: str
    summary: str  # Current summary (may be overridden)
    default_summary: str  # Original summary from YAML
    roles: List[str]
    order: int
    content: str
    has_content_override: bool = False
    has_summary_override: bool = False


class HelpCategorySummary(BaseModel):
    """Summary of a help category for listing."""
    category: str
    label: str
    topic_count: int
    override_count: int


class HelpCategoryDetail(BaseModel):
    """Full help category with all topics."""
    category: str
    label: str
    topics: List[HelpTopicContent]


class HelpCategoriesResponse(BaseModel):
    """Response for listing all help categories."""
    categories: List[HelpCategorySummary]
    total_topics: int
    total_overrides: int


class HelpTopicUpdate(BaseModel):
    """Update for a single topic."""
    category: str
    topic: str
    content: str


class HelpCategoryUpdate(BaseModel):
    """Request body for bulk updating topics in a category."""
    topics: List[HelpTopicUpdate]


class HelpTOCPreview(BaseModel):
    """Preview of TOC for a specific role."""
    role: str
    toc: str


class HelpTOCConfig(BaseModel):
    """TOC configuration for customizing help display in system prompts."""
    preamble: str
    narrative: str  # Explains when/why to use the help tool


class HelpTOCConfigUpdate(BaseModel):
    """Update for TOC config."""
    preamble: Optional[str] = None
    narrative: Optional[str] = None


class TopicSummaryInfo(BaseModel):
    """Info about a topic summary for editing."""
    category: str
    topic: str
    title: str
    default_summary: str  # From YAML
    current_summary: str  # May be overridden
    has_override: bool
    roles: List[str]  # Which roles can see this topic


class TopicSummariesResponse(BaseModel):
    """All topic summaries grouped by category."""
    categories: Dict[str, List[TopicSummaryInfo]]


class TopicSummaryUpdate(BaseModel):
    """Update for a single topic summary."""
    category: str
    topic: str
    summary: str  # New summary (empty string to reset to default)


# ============================================================================
# Helpers
# ============================================================================

def require_platform_admin(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that requires platform admin role."""
    if current_user.role.value != "platform_admin":
        raise HTTPException(status_code=403, detail="Platform admin access required")
    return current_user


def get_category_label(category: str, custom_labels: Optional[Dict[str, str]] = None) -> str:
    """Get human-readable label for a category."""
    # Start with defaults
    labels = dict(DEFAULT_CATEGORY_LABELS)
    # Merge in custom labels if provided
    if custom_labels:
        labels.update(custom_labels)
    return labels.get(category, category.replace('-', ' ').title())


async def get_all_overrides(db: AsyncSession) -> Dict[str, Dict[str, Optional[str]]]:
    """Get all help overrides as a dict of 'category/topic' -> {content, summary}."""
    result = await db.execute(select(HelpContentOverride))
    return {
        f"{row.category}/{row.topic}": {"content": row.content, "summary": row.summary}
        for row in result.scalars().all()
    }


async def save_override(
    db: AsyncSession,
    category: str,
    topic: str,
    user_id: int,
    content: Optional[str] = None,
    summary: Optional[str] = None
) -> None:
    """Save a help override (content and/or summary)."""
    from sqlalchemy import and_
    result = await db.execute(
        select(HelpContentOverride).where(
            and_(
                HelpContentOverride.category == category,
                HelpContentOverride.topic == topic
            )
        )
    )
    existing = result.scalars().first()

    if existing:
        if content is not None:
            existing.content = content
        if summary is not None:
            existing.summary = summary
        existing.updated_by = user_id
    else:
        override = HelpContentOverride(
            category=category,
            topic=topic,
            content=content,
            summary=summary,
            updated_by=user_id
        )
        db.add(override)


async def delete_override(db: AsyncSession, category: str, topic: str) -> bool:
    """Delete a help content override. Returns True if existed."""
    from sqlalchemy import and_
    result = await db.execute(
        select(HelpContentOverride).where(
            and_(
                HelpContentOverride.category == category,
                HelpContentOverride.topic == topic
            )
        )
    )
    existing = result.scalars().first()
    if existing:
        await db.delete(existing)
        return True
    return False


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/categories", response_model=HelpCategoriesResponse)
async def list_help_categories(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpCategoriesResponse:
    """
    List all help categories with topic counts.
    """
    categories = get_all_categories()
    overrides = await get_all_overrides(db)

    # Build category summaries
    category_summaries = []
    total_topics = 0
    total_overrides = 0

    for category in categories:
        sections = get_topics_by_category(category)
        topic_count = len(sections)
        override_count = sum(1 for s in sections if s.id in overrides)

        total_topics += topic_count
        total_overrides += override_count

        category_summaries.append(HelpCategorySummary(
            category=category,
            label=get_category_label(category),
            topic_count=topic_count,
            override_count=override_count
        ))

    return HelpCategoriesResponse(
        categories=category_summaries,
        total_topics=total_topics,
        total_overrides=total_overrides
    )


@router.get("/categories/{category}", response_model=HelpCategoryDetail)
async def get_help_category(
    category: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpCategoryDetail:
    """
    Get all topics in a help category with full content.
    """
    sections = get_topics_by_category(category)
    if not sections:
        raise HTTPException(status_code=404, detail=f"Help category '{category}' not found")

    overrides = await get_all_overrides(db)

    # Build topic list
    topics = []
    for section in sections:
        override = overrides.get(section.id, {})
        has_content_override = override.get("content") is not None
        has_summary_override = override.get("summary") is not None

        content = override.get("content") if has_content_override else section.content
        summary = override.get("summary") if has_summary_override else section.summary

        topics.append(HelpTopicContent(
            category=section.category,
            topic=section.topic,
            title=section.title,
            summary=summary,
            default_summary=section.summary,
            roles=section.roles,
            order=section.order,
            content=content,
            has_content_override=has_content_override,
            has_summary_override=has_summary_override
        ))

    return HelpCategoryDetail(
        category=category,
        label=get_category_label(category),
        topics=topics
    )


@router.get("/categories/{category}/topics/{topic}", response_model=HelpTopicContent)
async def get_help_topic(
    category: str,
    topic: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpTopicContent:
    """
    Get a single help topic by category and topic name.
    """
    section = get_topic(category, topic)
    if not section:
        raise HTTPException(status_code=404, detail=f"Help topic '{category}/{topic}' not found")

    overrides = await get_all_overrides(db)
    override = overrides.get(section.id, {})
    has_content_override = override.get("content") is not None
    has_summary_override = override.get("summary") is not None

    content = override.get("content") if has_content_override else section.content
    summary = override.get("summary") if has_summary_override else section.summary

    return HelpTopicContent(
        category=section.category,
        topic=section.topic,
        title=section.title,
        summary=summary,
        default_summary=section.summary,
        roles=section.roles,
        order=section.order,
        content=content,
        has_content_override=has_content_override,
        has_summary_override=has_summary_override
    )


@router.put("/categories/{category}", response_model=HelpCategoryDetail)
async def update_help_category(
    category: str,
    update: HelpCategoryUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpCategoryDetail:
    """
    Bulk update topics in a help category.
    Only topics included in the request are updated.
    """
    # Verify all topics exist and belong to this category
    for topic_update in update.topics:
        if topic_update.category != category:
            raise HTTPException(
                status_code=400,
                detail=f"Topic '{topic_update.category}/{topic_update.topic}' does not belong to category '{category}'"
            )

        section = get_topic(topic_update.category, topic_update.topic)
        if not section:
            raise HTTPException(
                status_code=404,
                detail=f"Topic '{topic_update.category}/{topic_update.topic}' not found"
            )

    # Save all overrides
    try:
        for topic_update in update.topics:
            default_topic = get_topic(topic_update.category, topic_update.topic)

            if default_topic and topic_update.content == default_topic.content:
                # Content matches default - delete override if exists
                await delete_override(db, topic_update.category, topic_update.topic)
            else:
                # Content differs - save override
                await save_override(db, topic_update.category, topic_update.topic, current_user.user_id, content=topic_update.content)

        await db.commit()
    except Exception as e:
        logger.error(f"Failed to update help category {category}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # Return updated category
    return await get_help_category(category, current_user, db)


@router.put("/categories/{category}/topics/{topic}", response_model=HelpTopicContent)
async def update_help_topic(
    category: str,
    topic: str,
    content: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpTopicContent:
    """
    Update a single help topic.
    """
    topic_data = get_topic(category, topic)
    if not topic_data:
        raise HTTPException(status_code=404, detail=f"Help topic '{category}/{topic}' not found")

    try:
        if topic_data and content == topic_data.content:
            await delete_override(db, category, topic)
        else:
            await save_override(db, category, topic, current_user.user_id, content=content)
        await db.commit()
    except Exception as e:
        logger.error(f"Failed to update help topic {category}/{topic}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    return await get_help_topic(category, topic, current_user, db)


@router.delete("/categories/{category}/overrides")
async def reset_help_category(
    category: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    """
    Delete all overrides in a help category, reverting all topics to defaults.
    """
    topics = get_topics_by_category(category)

    deleted_count = 0
    for topic_data in topics:
        if await delete_override(db, topic_data.category, topic_data.topic):
            deleted_count += 1

    await db.commit()

    return {
        "status": "ok",
        "category": category,
        "overrides_deleted": deleted_count
    }


@router.delete("/categories/{category}/topics/{topic}/override")
async def reset_help_topic(
    category: str,
    topic: str,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    """
    Delete the override for a single topic, reverting to default.
    """
    topic_data = get_topic(category, topic)
    if not topic_data:
        raise HTTPException(status_code=404, detail=f"Help topic '{category}/{topic}' not found")

    deleted = await delete_override(db, category, topic)
    await db.commit()

    return {
        "status": "ok",
        "category": category,
        "topic": topic,
        "override_deleted": deleted
    }


@router.get("/toc-preview", response_model=List[HelpTOCPreview])
async def preview_help_toc(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> List[HelpTOCPreview]:
    """
    Preview the help TOC as seen by each role (platform admin only).
    Uses the current TOC configuration from the database.
    """
    # Get current config
    config = await get_toc_config_from_db(db)

    roles = ["member", "org_admin", "platform_admin"]
    previews = []

    for role in roles:
        toc = get_help_toc_for_role(
            role,
            preamble=config['preamble'],
            summary_overrides=config.get('summary_overrides', {})
        )
        previews.append(HelpTOCPreview(role=role, toc=toc or "(empty)"))

    return previews


@router.post("/reload")
async def reload_help(
    current_user: User = Depends(require_platform_admin)
) -> dict:
    """
    Reload help content from YAML files (platform admin only).
    Clears the in-memory cache. Database overrides are not affected.
    """
    try:
        reload_help_content()
        topic_count = len(get_all_topic_ids())
        return {"status": "ok", "topics_loaded": topic_count}
    except Exception as e:
        logger.error(f"Failed to reload help content: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Topic Summary Endpoints
# ============================================================================

@router.get("/summaries", response_model=TopicSummariesResponse)
async def get_topic_summaries(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> TopicSummariesResponse:
    """
    Get all topic summaries for editing (platform admin only).
    Returns summaries grouped by category with override status.
    """
    from services.help_registry import get_all_categories, get_topics_by_category

    overrides = await get_all_overrides(db)
    categories_dict = {}

    for category in get_all_categories():
        topics = get_topics_by_category(category)
        summaries = []

        for topic in topics:
            override = overrides.get(topic.id, {})
            has_override = override.get("summary") is not None
            current = override.get("summary") if has_override else topic.summary

            summaries.append(TopicSummaryInfo(
                category=topic.category,
                topic=topic.topic,
                title=topic.title,
                default_summary=topic.summary,
                current_summary=current,
                has_override=has_override,
                roles=topic.roles
            ))

        categories_dict[category] = summaries

    return TopicSummariesResponse(categories=categories_dict)


@router.put("/summaries/{category}/{topic}")
async def update_topic_summary(
    category: str,
    topic: str,
    update: TopicSummaryUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> TopicSummaryInfo:
    """
    Update a topic's summary (platform admin only).
    Send empty string to reset to default.
    """
    from services.help_registry import get_topic as get_topic_section

    section = get_topic_section(category, topic)
    if not section:
        raise HTTPException(status_code=404, detail=f"Topic '{category}/{topic}' not found")

    # If empty string or matches default, clear the override
    if not update.summary.strip() or update.summary.strip() == section.summary:
        # Remove summary override (but keep content if it exists)
        from sqlalchemy import and_
        result = await db.execute(
            select(HelpContentOverride).where(
                and_(
                    HelpContentOverride.category == category,
                    HelpContentOverride.topic == topic
                )
            )
        )
        existing = result.scalars().first()
        if existing:
            existing.summary = None
            # If both content and summary are null, delete the row
            if existing.content is None:
                await db.delete(existing)
        await db.commit()

        return TopicSummaryInfo(
            category=category,
            topic=topic,
            title=section.title,
            default_summary=section.summary,
            current_summary=section.summary,
            has_override=False
        )
    else:
        # Save summary override
        await save_override(db, category, topic, current_user.user_id, summary=update.summary.strip())
        await db.commit()

        return TopicSummaryInfo(
            category=category,
            topic=topic,
            title=section.title,
            default_summary=section.summary,
            current_summary=update.summary.strip(),
            has_override=True
        )


# ============================================================================
# TOC Config Endpoints
# ============================================================================

async def get_toc_config_from_db(db: AsyncSession) -> Dict[str, Any]:
    """Get TOC config from database, falling back to defaults."""
    # Load all help-related ChatConfig entries at once
    result = await db.execute(
        select(ChatConfig).where(ChatConfig.scope == "help")
    )
    help_configs = {row.scope_key: row.content for row in result.scalars().all()}

    # Get preamble
    preamble = help_configs.get("toc-preamble") or DEFAULT_TOC_PREAMBLE

    # Get narrative
    narrative = help_configs.get("narrative") or DEFAULT_HELP_NARRATIVE

    # Get summary overrides from help_content_override table
    summary_result = await db.execute(select(HelpContentOverride))
    summary_overrides = {
        f"{row.category}/{row.topic}": row.summary
        for row in summary_result.scalars().all()
        if row.summary  # Only include non-null summaries
    }

    return {
        'preamble': preamble,
        'narrative': narrative,
        'summary_overrides': summary_overrides,
    }


@router.get("/toc-config", response_model=HelpTOCConfig)
async def get_help_toc_config(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpTOCConfig:
    """
    Get the current TOC configuration (platform admin only).

    Returns:
    - narrative: Text explaining when/why to use the help tool
    - preamble: Text shown before the TOC listing
    """
    config = await get_toc_config_from_db(db)
    return HelpTOCConfig(
        preamble=config['preamble'],
        narrative=config['narrative']
    )


@router.put("/toc-config", response_model=HelpTOCConfig)
async def update_help_toc_config(
    update: HelpTOCConfigUpdate,
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> HelpTOCConfig:
    """
    Update the TOC configuration (platform admin only).

    All fields are optional - only provided fields are updated.
    """
    from datetime import datetime

    try:
        # Update preamble if provided
        if update.preamble is not None:
            preamble_result = await db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "help",
                    ChatConfig.scope_key == "toc-preamble"
                )
            )
            existing = preamble_result.scalars().first()

            if existing:
                existing.content = update.preamble
                existing.updated_at = datetime.utcnow()
                existing.updated_by = current_user.user_id
            else:
                db.add(ChatConfig(
                    scope="help",
                    scope_key="toc-preamble",
                    content=update.preamble,
                    updated_by=current_user.user_id
                ))

        # Update narrative if provided
        if update.narrative is not None:
            narrative_result = await db.execute(
                select(ChatConfig).where(
                    ChatConfig.scope == "help",
                    ChatConfig.scope_key == "narrative"
                )
            )
            existing = narrative_result.scalars().first()

            if existing:
                existing.content = update.narrative
                existing.updated_at = datetime.utcnow()
                existing.updated_by = current_user.user_id
            else:
                db.add(ChatConfig(
                    scope="help",
                    scope_key="narrative",
                    content=update.narrative,
                    updated_by=current_user.user_id
                ))

        await db.commit()
        logger.info(f"User {current_user.email} updated help TOC config")

    except Exception as e:
        logger.error(f"Failed to update TOC config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    # Return updated config
    return await get_help_toc_config(current_user, db)


@router.delete("/toc-config")
async def reset_help_toc_config(
    current_user: User = Depends(require_platform_admin),
    db: AsyncSession = Depends(get_async_db)
) -> dict:
    """
    Reset TOC configuration to defaults (platform admin only).

    Resets narrative and preamble to their defaults.
    """
    try:
        # Delete all help-scoped config entries (narrative, preamble, labels)
        result = await db.execute(
            select(ChatConfig).where(ChatConfig.scope == "help")
        )
        for config_row in result.scalars().all():
            await db.delete(config_row)

        await db.commit()
        logger.info(f"User {current_user.email} reset help TOC config to defaults")

        return {"status": "ok", "message": "Help configuration reset to defaults"}

    except Exception as e:
        logger.error(f"Failed to reset TOC config: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
