"""
Artifact Service

Service for managing bugs and feature requests (platform admin defect tracker).
"""

import logging
from typing import List, Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from fastapi import Depends

from models import Artifact, ArtifactCategory, ArtifactType, ArtifactStatus, ArtifactPriority, ArtifactArea
from database import get_async_db

logger = logging.getLogger(__name__)


class ArtifactService:
    """Service for artifact (bug/feature) CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def _resolve_category_id(self, category_name: Optional[str]) -> Optional[int]:
        """Resolve a category name to its ID. Returns None if name is empty/None."""
        if not category_name or category_name.strip() == '':
            return None
        result = await self.db.execute(
            select(ArtifactCategory.id).where(ArtifactCategory.name == category_name.strip())
        )
        cat_id = result.scalar_one_or_none()
        if cat_id is None:
            raise ValueError(f"Category '{category_name}' not found")
        return cat_id

    async def list_artifacts(
        self,
        artifact_type: Optional[str] = None,
        status: Optional[str] = None,
        category: Optional[str] = None,
    ) -> List[Artifact]:
        """List all artifacts with optional type, status, and category filters."""
        stmt = (
            select(Artifact)
            .options(selectinload(Artifact.creator), selectinload(Artifact.updater))
            .order_by(Artifact.created_at.desc())
        )

        if artifact_type:
            stmt = stmt.where(Artifact.artifact_type == ArtifactType(artifact_type))
        if status:
            stmt = stmt.where(Artifact.status == ArtifactStatus(status))
        if category:
            stmt = stmt.join(Artifact.category_rel).where(ArtifactCategory.name == category)

        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_artifact_by_id(self, artifact_id: int) -> Optional[Artifact]:
        """Get a single artifact by ID."""
        result = await self.db.execute(
            select(Artifact)
            .options(selectinload(Artifact.creator), selectinload(Artifact.updater))
            .where(Artifact.id == artifact_id)
        )
        return result.scalars().first()

    async def create_artifact(
        self,
        title: str,
        artifact_type: str,
        created_by: int,
        description: Optional[str] = None,
        category: Optional[str] = None,
        priority: Optional[str] = None,
        status: Optional[str] = None,
        area: Optional[str] = None,
    ) -> Artifact:
        """Create a new artifact."""
        category_id = await self._resolve_category_id(category)
        artifact = Artifact(
            title=title,
            description=description,
            artifact_type=ArtifactType(artifact_type),
            status=ArtifactStatus(status) if status else ArtifactStatus.NEW,
            category_id=category_id,
            priority=ArtifactPriority(priority) if priority else None,
            area=ArtifactArea(area) if area else None,
            created_by=created_by,
            updated_by=created_by,
        )
        self.db.add(artifact)
        await self.db.commit()
        await self.db.refresh(artifact)
        return await self.get_artifact_by_id(artifact.id)  # type: ignore[return-value]

    _UNSET = object()

    async def update_artifact(
        self,
        artifact_id: int,
        title: Optional[str] = None,
        description: Optional[str] = None,
        status: Optional[str] = None,
        artifact_type: Optional[str] = None,
        category: Optional[str] = _UNSET,
        priority: Optional[str] = _UNSET,
        area: Optional[str] = _UNSET,
        updated_by: Optional[int] = None,
    ) -> Optional[Artifact]:
        """Update an existing artifact. Returns None if not found."""
        artifact = await self.get_artifact_by_id(artifact_id)
        if not artifact:
            return None

        if title is not None:
            artifact.title = title
        if description is not None:
            artifact.description = description
        if status is not None:
            artifact.status = ArtifactStatus(status)
        if artifact_type is not None:
            artifact.artifact_type = ArtifactType(artifact_type)
        if category is not self._UNSET:
            artifact.category_id = await self._resolve_category_id(category if category else None)
        if priority is not self._UNSET:
            artifact.priority = ArtifactPriority(priority) if priority else None
        if area is not self._UNSET:
            artifact.area = ArtifactArea(area) if area else None
        if updated_by is not None:
            artifact.updated_by = updated_by

        await self.db.commit()
        return await self.get_artifact_by_id(artifact.id)  # type: ignore[return-value]

    async def delete_artifact(self, artifact_id: int) -> Optional[str]:
        """Delete an artifact by ID. Returns the title if deleted, None if not found."""
        artifact = await self.get_artifact_by_id(artifact_id)
        if not artifact:
            return None

        title = artifact.title
        await self.db.delete(artifact)
        await self.db.commit()
        return title


    async def bulk_update_artifacts(
        self,
        artifact_ids: List[int],
        status: Optional[str] = None,
        category: Optional[str] = None,
        priority: Optional[str] = None,
        area: Optional[str] = None,
        updated_by: Optional[int] = None,
    ) -> int:
        """Bulk update status, category, priority, and/or area for multiple artifacts. Returns count updated."""
        if not artifact_ids:
            return 0

        # Resolve category_id once for all artifacts
        category_id = None
        resolve_category = category is not None
        if resolve_category:
            category_id = await self._resolve_category_id(category if category != '' else None)

        stmt = (
            select(Artifact)
            .options(selectinload(Artifact.creator), selectinload(Artifact.updater))
            .where(Artifact.id.in_(artifact_ids))
        )
        result = await self.db.execute(stmt)
        artifacts = list(result.scalars().all())

        for artifact in artifacts:
            if status is not None:
                artifact.status = ArtifactStatus(status)
            if resolve_category:
                artifact.category_id = category_id
            if priority is not None:
                artifact.priority = ArtifactPriority(priority) if priority != '' else None
            if area is not None:
                artifact.area = ArtifactArea(area) if area != '' else None
            if updated_by is not None:
                artifact.updated_by = updated_by

        await self.db.commit()
        return len(artifacts)

    # ==================== Category Management ====================

    async def list_categories(self) -> List[ArtifactCategory]:
        """List all artifact categories, sorted by name."""
        stmt = select(ArtifactCategory).order_by(ArtifactCategory.name)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create_category(self, name: str) -> ArtifactCategory:
        """Create a new artifact category."""
        cat = ArtifactCategory(name=name.strip())
        self.db.add(cat)
        await self.db.commit()
        await self.db.refresh(cat)
        return cat

    async def rename_category(self, category_id: int, new_name: str) -> Optional[ArtifactCategory]:
        """Rename a category. With FK, artifacts automatically reflect the new name. Returns None if not found."""
        result = await self.db.execute(
            select(ArtifactCategory).where(ArtifactCategory.id == category_id)
        )
        cat = result.scalars().first()
        if not cat:
            return None

        cat.name = new_name.strip()
        await self.db.commit()
        await self.db.refresh(cat)
        return cat

    async def delete_category(self, category_id: int) -> Optional[Tuple[str, int]]:
        """Delete a category by ID. Returns (name, affected_count) if deleted, None if not found.
        DB cascades ON DELETE SET NULL, so affected artifacts become uncategorized."""
        result = await self.db.execute(
            select(ArtifactCategory).where(ArtifactCategory.id == category_id)
        )
        cat = result.scalars().first()
        if not cat:
            return None

        name = cat.name

        # Count affected artifacts before deleting
        count_result = await self.db.execute(
            select(func.count()).select_from(Artifact).where(Artifact.category_id == category_id)
        )
        affected_count = count_result.scalar() or 0

        await self.db.delete(cat)
        await self.db.commit()
        return (name, affected_count)


async def get_artifact_service(
    db: AsyncSession = Depends(get_async_db)
) -> ArtifactService:
    """Get an ArtifactService instance with async database session."""
    return ArtifactService(db)
