"""
Artifact Tools (Defect/Feature Tracker)

Platform-admin-only tools for tracking bugs and feature requests.
Page-scoped to the "artifacts" page only.

Uses ArtifactService for all database operations.
"""

import logging
from typing import Any, Dict, List, Union

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolResult, register_tool

logger = logging.getLogger(__name__)


# =============================================================================
# Helpers
# =============================================================================

def _artifact_to_dict(artifact) -> Dict[str, Any]:
    """Convert an Artifact model to a serializable dict."""
    return {
        "id": artifact.id,
        "title": artifact.title,
        "description": artifact.description,
        "type": artifact.artifact_type.value,
        "status": artifact.status.value,
        "priority": artifact.priority.value if artifact.priority else None,
        "area": artifact.area.value if artifact.area else None,
        "category": artifact.category,
        "created_by": artifact.created_by,
        "created_by_name": artifact.created_by_name,
        "updated_by": artifact.updated_by,
        "updated_by_name": artifact.updated_by_name,
        "created_at": artifact.created_at.isoformat() if artifact.created_at else None,
        "updated_at": artifact.updated_at.isoformat() if artifact.updated_at else None,
    }


def _category_to_dict(cat) -> Dict[str, Any]:
    """Convert an ArtifactCategory model to a serializable dict."""
    return {
        "id": cat.id,
        "name": cat.name,
    }


# =============================================================================
# Artifact Tool Executors
# =============================================================================

async def execute_list_artifacts(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all artifacts with optional filtering by type and status."""
    from services.artifact_service import ArtifactService

    try:
        service = ArtifactService(db)
        artifacts = await service.list_artifacts(
            artifact_type=params.get("type"),
            status=params.get("status"),
            category=params.get("category"),
        )

        if not artifacts:
            filter_desc = ""
            if params.get("type"):
                filter_desc += f" type={params['type']}"
            if params.get("status"):
                filter_desc += f" status={params['status']}"
            return f"No artifacts found{' with' + filter_desc if filter_desc else ''}."

        text_lines = [f"Found {len(artifacts)} artifacts:\n"]
        artifacts_data = []

        for i, a in enumerate(artifacts, 1):
            text_lines.append(
                f"{i}. [{a.artifact_type.value.upper()}] #{a.id} {a.title} "
                f"({a.status.value})"
            )
            artifacts_data.append(_artifact_to_dict(a))

        payload = {
            "type": "artifact_list",
            "data": {
                "total": len(artifacts),
                "artifacts": artifacts_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error listing artifacts: {e}", exc_info=True)
        return f"Error listing artifacts: {str(e)}"


async def execute_create_artifact(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Create a new bug or feature artifact."""
    from services.artifact_service import ArtifactService

    title = params.get("title")
    artifact_type = params.get("type")

    if not title:
        return "Error: title is required."
    if not artifact_type:
        return "Error: type is required (must be 'bug', 'feature', or 'task')."
    if artifact_type not in ("bug", "feature", "task"):
        return "Error: type must be 'bug', 'feature', or 'task'."

    # Validate optional status
    status = params.get("status")
    if status and status not in ("new", "open", "in_progress", "icebox", "closed"):
        return "Error: status must be 'new', 'open', 'in_progress', 'icebox', or 'closed'."

    # Validate optional priority
    priority = params.get("priority")
    if priority and priority not in ("urgent", "high", "medium", "low"):
        return "Error: priority must be 'urgent', 'high', 'medium', or 'low'."

    # Validate optional area
    area = params.get("area")
    valid_areas = ("login_auth", "user_prefs", "streams", "reports", "articles", "notes",
                   "users", "organizations", "data_sources", "chat_system", "help_content", "system_ops")
    if area and area not in valid_areas:
        return f"Error: area must be one of: {', '.join(valid_areas)}."

    try:
        service = ArtifactService(db)
        artifact = await service.create_artifact(
            title=title,
            artifact_type=artifact_type,
            created_by=user_id,
            description=params.get("description"),
            category=params.get("category"),
            priority=priority,
            status=status,
            area=area,
        )

        payload = {
            "type": "artifact_details",
            "data": _artifact_to_dict(artifact)
        }

        return ToolResult(
            text=f"Created {artifact_type} #{artifact.id}: {title}",
            payload=payload
        )

    except Exception as e:
        logger.error(f"Error creating artifact: {e}", exc_info=True)
        return f"Error creating artifact: {str(e)}"


async def execute_update_artifact(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Update an existing artifact's title, description, status, or type."""
    from services.artifact_service import ArtifactService

    artifact_id = params.get("id")
    if not artifact_id:
        return "Error: id is required."

    # Validate enum values before passing to service
    if "status" in params and params["status"]:
        if params["status"] not in ("new", "open", "in_progress", "icebox", "closed"):
            return "Error: status must be 'new', 'open', 'in_progress', 'icebox', or 'closed'."
    if "type" in params and params["type"]:
        if params["type"] not in ("bug", "feature", "task"):
            return "Error: type must be 'bug', 'feature', or 'task'."
    if "priority" in params and params["priority"]:
        if params["priority"] not in ("urgent", "high", "medium", "low"):
            return "Error: priority must be 'urgent', 'high', 'medium', or 'low'."
    if "area" in params and params["area"]:
        valid_areas = ("login_auth", "user_prefs", "streams", "reports", "articles", "notes",
                       "users", "organizations", "data_sources", "chat_system", "help_content", "system_ops")
        if params["area"] not in valid_areas:
            return f"Error: area must be one of: {', '.join(valid_areas)}."

    try:
        service = ArtifactService(db)
        kwargs: Dict[str, Any] = dict(
            artifact_id=int(artifact_id),
            title=params.get("title"),
            description=params.get("description"),
            status=params.get("status"),
            artifact_type=params.get("type"),
            category=params.get("category"),
            updated_by=user_id,
        )
        if "priority" in params:
            kwargs["priority"] = params["priority"]
        if "area" in params:
            kwargs["area"] = params["area"]
        artifact = await service.update_artifact(**kwargs)

        if not artifact:
            return f"Error: Artifact #{artifact_id} not found."

        payload = {
            "type": "artifact_details",
            "data": _artifact_to_dict(artifact)
        }

        return ToolResult(
            text=f"Updated artifact #{artifact.id}: {artifact.title} ({artifact.status.value})",
            payload=payload
        )

    except Exception as e:
        logger.error(f"Error updating artifact: {e}", exc_info=True)
        return f"Error updating artifact: {str(e)}"


async def execute_delete_artifact(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Delete an artifact by ID."""
    from services.artifact_service import ArtifactService

    artifact_id = params.get("id")
    if not artifact_id:
        return "Error: id is required."

    try:
        service = ArtifactService(db)
        title = await service.delete_artifact(int(artifact_id))

        if title is None:
            return f"Error: Artifact #{artifact_id} not found."

        return f"Deleted artifact #{artifact_id}: {title}"

    except Exception as e:
        logger.error(f"Error deleting artifact: {e}", exc_info=True)
        return f"Error deleting artifact: {str(e)}"


# =============================================================================
# Category Tool Executors
# =============================================================================

async def execute_list_artifact_categories(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all artifact categories."""
    from services.artifact_service import ArtifactService

    try:
        service = ArtifactService(db)
        categories = await service.list_categories()

        if not categories:
            return "No categories defined yet."

        text_lines = [f"Found {len(categories)} categories:\n"]
        for cat in categories:
            text_lines.append(f"  - #{cat.id} {cat.name}")

        return "\n".join(text_lines)

    except Exception as e:
        logger.error(f"Error listing categories: {e}", exc_info=True)
        return f"Error listing categories: {str(e)}"


async def execute_create_artifact_category(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Create a single artifact category."""
    from services.artifact_service import ArtifactService

    name = params.get("name")
    if not name or not name.strip():
        return "Error: name is required."

    try:
        service = ArtifactService(db)
        cat = await service.create_category(name=name.strip())
        return f"Created category #{cat.id}: {cat.name}"

    except Exception as e:
        logger.error(f"Error creating category: {e}", exc_info=True)
        return f"Error creating category: {str(e)}"


async def execute_bulk_create_artifact_categories(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Bulk create artifact categories, skipping duplicates."""
    from services.artifact_service import ArtifactService

    names = params.get("names", [])
    if not names:
        return "Error: names list is required and must not be empty."

    try:
        service = ArtifactService(db)
        existing = await service.list_categories()
        existing_names = {c.name.lower() for c in existing}

        created: List[str] = []
        skipped: List[str] = []
        for name in names:
            clean = name.strip()
            if not clean:
                continue
            if clean.lower() in existing_names:
                skipped.append(clean)
            else:
                await service.create_category(name=clean)
                created.append(clean)
                existing_names.add(clean.lower())

        parts = []
        if created:
            parts.append(f"Created {len(created)}: {', '.join(created)}")
        if skipped:
            parts.append(f"Skipped {len(skipped)} (already exist): {', '.join(skipped)}")
        return ". ".join(parts) if parts else "No categories to create."

    except Exception as e:
        logger.error(f"Error bulk creating categories: {e}", exc_info=True)
        return f"Error bulk creating categories: {str(e)}"


async def execute_rename_artifact_category(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Rename an artifact category. Artifacts reference by FK so they automatically reflect the new name."""
    from services.artifact_service import ArtifactService

    category_id = params.get("id")
    new_name = params.get("new_name")
    if not category_id:
        return "Error: id is required."
    if not new_name or not new_name.strip():
        return "Error: new_name is required."

    try:
        service = ArtifactService(db)
        cat = await service.rename_category(int(category_id), new_name=new_name.strip())
        if not cat:
            return f"Error: Category #{category_id} not found."
        return f"Renamed category #{cat.id} to: {cat.name} (artifacts automatically reflect new name via FK)"

    except Exception as e:
        logger.error(f"Error renaming category: {e}", exc_info=True)
        return f"Error renaming category: {str(e)}"


async def execute_delete_artifact_category(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Delete an artifact category by ID."""
    from services.artifact_service import ArtifactService

    category_id = params.get("id")
    if not category_id:
        return "Error: id is required."

    try:
        service = ArtifactService(db)
        result = await service.delete_category(int(category_id))
        if not result:
            return f"Error: Category #{category_id} not found."
        name, affected_count = result
        msg = f"Deleted category #{category_id}: {name}"
        if affected_count > 0:
            msg += f" ({affected_count} artifact(s) are now uncategorized)"
        return msg

    except Exception as e:
        logger.error(f"Error deleting category: {e}", exc_info=True)
        return f"Error deleting category: {str(e)}"


# =============================================================================
# Tool Registration — Artifact CRUD (page-scoped to "artifacts")
# =============================================================================

register_tool(ToolConfig(
    name="list_artifacts",
    description="List all bugs, feature requests, and tasks. Optionally filter by type (bug/feature/task), status (new/open/in_progress/icebox/closed), and category.",
    input_schema={
        "type": "object",
        "properties": {
            "type": {
                "type": "string",
                "enum": ["bug", "feature", "task"],
                "description": "Filter by artifact type."
            },
            "status": {
                "type": "string",
                "enum": ["new", "open", "in_progress", "icebox", "closed"],
                "description": "Filter by status."
            },
            "category": {
                "type": "string",
                "description": "Filter by category name."
            }
        },
    },
    executor=execute_list_artifacts,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="create_artifact",
    description="Create a new bug report, feature request, or task. Provide a title, type, and optional description, category, priority, and status.",
    input_schema={
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Title of the artifact."
            },
            "type": {
                "type": "string",
                "enum": ["bug", "feature", "task"],
                "description": "Type: 'bug', 'feature', or 'task'."
            },
            "description": {
                "type": "string",
                "description": "Detailed description (optional)."
            },
            "category": {
                "type": "string",
                "description": "Category name for grouping (optional)."
            },
            "priority": {
                "type": "string",
                "enum": ["urgent", "high", "medium", "low"],
                "description": "Priority level (optional)."
            },
            "status": {
                "type": "string",
                "enum": ["new", "open", "in_progress", "icebox", "closed"],
                "description": "Status (optional, defaults to 'new')."
            },
            "area": {
                "type": "string",
                "enum": ["login_auth", "user_prefs", "streams", "reports", "articles", "notes",
                         "users", "organizations", "data_sources", "chat_system", "help_content", "system_ops"],
                "description": "Functional area of the platform (optional)."
            }
        },
        "required": ["title", "type"]
    },
    executor=execute_create_artifact,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="update_artifact",
    description="Update an existing artifact (bug, feature, or task). You can change the title, description, status, priority, type, or category.",
    input_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "ID of the artifact to update."
            },
            "title": {
                "type": "string",
                "description": "New title (optional)."
            },
            "description": {
                "type": "string",
                "description": "New description (optional)."
            },
            "status": {
                "type": "string",
                "enum": ["new", "open", "in_progress", "icebox", "closed"],
                "description": "New status (optional)."
            },
            "priority": {
                "type": "string",
                "enum": ["urgent", "high", "medium", "low"],
                "description": "New priority (optional). Use empty string to clear."
            },
            "type": {
                "type": "string",
                "enum": ["bug", "feature", "task"],
                "description": "New type (optional)."
            },
            "category": {
                "type": "string",
                "description": "New category name (optional). Use empty string to clear."
            },
            "area": {
                "type": "string",
                "enum": ["login_auth", "user_prefs", "streams", "reports", "articles", "notes",
                         "users", "organizations", "data_sources", "chat_system", "help_content", "system_ops"],
                "description": "New functional area (optional). Use empty string to clear."
            }
        },
        "required": ["id"]
    },
    executor=execute_update_artifact,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="delete_artifact",
    description="Delete an artifact (bug, feature, or task) by its ID.",
    input_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "ID of the artifact to delete."
            }
        },
        "required": ["id"]
    },
    executor=execute_delete_artifact,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))


# =============================================================================
# Tool Registration — Category Management (page-scoped to "artifacts")
# =============================================================================

register_tool(ToolConfig(
    name="list_artifact_categories",
    description="List all artifact categories.",
    input_schema={
        "type": "object",
        "properties": {},
    },
    executor=execute_list_artifact_categories,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="create_artifact_category",
    description="Create a new artifact category for grouping bugs and features.",
    input_schema={
        "type": "object",
        "properties": {
            "name": {
                "type": "string",
                "description": "Category name (e.g., 'UI', 'Backend', 'Performance')."
            }
        },
        "required": ["name"]
    },
    executor=execute_create_artifact_category,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="bulk_create_artifact_categories",
    description="Create multiple artifact categories at once. Skips any that already exist.",
    input_schema={
        "type": "object",
        "properties": {
            "names": {
                "type": "array",
                "items": {"type": "string"},
                "description": "List of category names to create."
            }
        },
        "required": ["names"]
    },
    executor=execute_bulk_create_artifact_categories,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="rename_artifact_category",
    description="Rename an artifact category. Artifacts reference by FK so they automatically reflect the new name.",
    input_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "ID of the category to rename."
            },
            "new_name": {
                "type": "string",
                "description": "New name for the category."
            }
        },
        "required": ["id", "new_name"]
    },
    executor=execute_rename_artifact_category,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))

register_tool(ToolConfig(
    name="delete_artifact_category",
    description="Delete an artifact category by ID. Artifacts using this category become uncategorized (FK ON DELETE SET NULL).",
    input_schema={
        "type": "object",
        "properties": {
            "id": {
                "type": "integer",
                "description": "ID of the category to delete."
            }
        },
        "required": ["id"]
    },
    executor=execute_delete_artifact_category,
    category="artifacts",
    is_global=False,
    required_role="platform_admin",
))
