"""
Service for managing article notes with JSON storage and visibility control.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List, Optional, TYPE_CHECKING
from datetime import datetime
import uuid
import json
import logging
from fastapi import Depends

from models import User
from services.user_service import UserService
from database import get_async_db

if TYPE_CHECKING:
    from services.report_article_association_service import ReportArticleAssociationService

logger = logging.getLogger(__name__)


def _parse_notes(notes_str: Optional[str]) -> List[dict]:
    """Parse notes from JSON string stored in Text column.

    Returns the list of note dicts, or [] if the value is missing,
    empty, or not a valid JSON array.
    """
    if not notes_str:
        return []

    try:
        parsed = json.loads(notes_str)
        if isinstance(parsed, list):
            return parsed
        return []
    except (json.JSONDecodeError, TypeError):
        return []


def _serialize_notes(notes: List[dict]) -> Optional[str]:
    """Serialize notes list to JSON string for storage, or None if empty."""
    if not notes:
        return None
    return json.dumps(notes)


class NotesService:
    """Service for managing article notes."""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._user_service: Optional[UserService] = None
        self._association_service: Optional["ReportArticleAssociationService"] = None

    @property
    def user_service(self) -> UserService:
        """Lazy-load UserService."""
        if self._user_service is None:
            self._user_service = UserService(self.db)
        return self._user_service

    @property
    def association_service(self) -> "ReportArticleAssociationService":
        """Lazy-load ReportArticleAssociationService."""
        if self._association_service is None:
            from services.report_article_association_service import ReportArticleAssociationService
            self._association_service = ReportArticleAssociationService(self.db)
        return self._association_service

    # ==================== Async Methods ====================

    async def get_notes(
        self,
        report_id: int,
        article_id: int,
        user: User
    ) -> List[dict]:
        """Get all visible notes for an article (async)."""
        association = await self.association_service.find(report_id, article_id)
        if not association:
            return []

        existing_notes = _parse_notes(association.notes)

        visible_notes = []
        for note in existing_notes:
            if not isinstance(note, dict):
                continue

            note_user_id = note.get("user_id")
            visibility = note.get("visibility", "personal")

            if note_user_id == user.user_id:
                visible_notes.append(note)
            elif visibility == "shared" and user.org_id:
                result = await self.db.execute(
                    select(User).where(User.user_id == note_user_id)
                )
                author = result.scalars().first()
                if author and author.org_id == user.org_id:
                    visible_notes.append(note)

        return visible_notes

    async def create_note(
        self,
        report_id: int,
        article_id: int,
        user: User,
        content: str,
        visibility: str = "personal"
    ) -> Optional[dict]:
        """Create a new note on an article (async)."""
        association = await self.association_service.find(report_id, article_id)
        if not association:
            return None

        existing_notes = _parse_notes(association.notes)

        now = datetime.utcnow().isoformat()
        new_note = {
            "id": str(uuid.uuid4()),
            "user_id": user.user_id,
            "author_name": user.full_name or user.email.split('@')[0],
            "content": content,
            "visibility": visibility,
            "created_at": now,
            "updated_at": now
        }

        existing_notes.append(new_note)
        association.notes = _serialize_notes(existing_notes)
        await self.db.commit()

        return new_note

    async def update_note(
        self,
        report_id: int,
        article_id: int,
        note_id: str,
        user: User,
        content: Optional[str] = None,
        visibility: Optional[str] = None
    ) -> Optional[dict]:
        """Update an existing note (async). Only the author can update their note."""
        association = await self.association_service.find(report_id, article_id)
        if not association:
            return None

        existing_notes = _parse_notes(association.notes)
        if not existing_notes:
            return None

        for i, note in enumerate(existing_notes):
            if not isinstance(note, dict):
                continue

            if note.get("id") == note_id:
                # Only author can update
                if note.get("user_id") != user.user_id:
                    return None

                # Update fields
                if content is not None:
                    note["content"] = content
                if visibility is not None:
                    note["visibility"] = visibility
                note["updated_at"] = datetime.utcnow().isoformat()

                existing_notes[i] = note
                association.notes = _serialize_notes(existing_notes)
                await self.db.commit()

                return note

        return None

    async def delete_note(
        self,
        report_id: int,
        article_id: int,
        note_id: str,
        user: User
    ) -> bool:
        """Delete a note (async)."""
        association = await self.association_service.find(report_id, article_id)
        if not association:
            return False

        existing_notes = _parse_notes(association.notes)
        if not existing_notes:
            return False

        for i, note in enumerate(existing_notes):
            if not isinstance(note, dict):
                continue

            if note.get("id") == note_id:
                if note.get("user_id") != user.user_id:
                    return False

                existing_notes.pop(i)
                association.notes = _serialize_notes(existing_notes)
                await self.db.commit()

                return True

        return False


# Dependency injection provider for async notes service
async def get_notes_service(
    db: AsyncSession = Depends(get_async_db)
) -> NotesService:
    """Get a NotesService instance with async database session."""
    return NotesService(db)
