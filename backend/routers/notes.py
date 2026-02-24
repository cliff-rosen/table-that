"""
Notes API endpoints for article notes with visibility control.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import logging

from models import User
from services import auth_service
from services.notes_service import NotesService, get_notes_service
from schemas.organization import (
    ArticleNote, ArticleNoteCreate, ArticleNoteUpdate, ArticleNotesResponse
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get(
    "/reports/{report_id}/articles/{article_id}",
    response_model=ArticleNotesResponse,
    summary="Get notes for an article"
)
async def get_article_notes(
    report_id: int,
    article_id: int,
    current_user: User = Depends(auth_service.validate_token),
    notes_service: NotesService = Depends(get_notes_service)
):
    """
    Get all visible notes for an article in a report.

    Returns:
    - User's own notes (personal and shared)
    - Shared notes from other users in the same organization
    """
    notes = await notes_service.get_notes(report_id, article_id, current_user)

    return ArticleNotesResponse(
        report_id=report_id,
        article_id=article_id,
        notes=[ArticleNote(**n) for n in notes],
        total_count=len(notes)
    )


@router.post(
    "/reports/{report_id}/articles/{article_id}",
    response_model=ArticleNote,
    status_code=status.HTTP_201_CREATED,
    summary="Create a note on an article"
)
async def create_article_note(
    report_id: int,
    article_id: int,
    note_data: ArticleNoteCreate,
    current_user: User = Depends(auth_service.validate_token),
    notes_service: NotesService = Depends(get_notes_service)
):
    """
    Create a new note on an article.

    - **content**: The note text
    - **visibility**: "personal" (only you can see) or "shared" (org members can see)
    """
    note = await notes_service.create_note(
        report_id=report_id,
        article_id=article_id,
        user=current_user,
        content=note_data.content,
        visibility=note_data.visibility
    )

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Article not found in report"
        )

    return ArticleNote(**note)


@router.put(
    "/reports/{report_id}/articles/{article_id}/notes/{note_id}",
    response_model=ArticleNote,
    summary="Update a note"
)
async def update_article_note(
    report_id: int,
    article_id: int,
    note_id: str,
    note_data: ArticleNoteUpdate,
    current_user: User = Depends(auth_service.validate_token),
    notes_service: NotesService = Depends(get_notes_service)
):
    """
    Update an existing note. Only the author can update their note.

    - **content**: New note text (optional)
    - **visibility**: New visibility setting (optional)
    """
    note = await notes_service.update_note(
        report_id=report_id,
        article_id=article_id,
        note_id=note_id,
        user=current_user,
        content=note_data.content,
        visibility=note_data.visibility
    )

    if not note:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found or you don't have permission to update it"
        )

    return ArticleNote(**note)


@router.delete(
    "/reports/{report_id}/articles/{article_id}/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a note"
)
async def delete_article_note(
    report_id: int,
    article_id: int,
    note_id: str,
    current_user: User = Depends(auth_service.validate_token),
    notes_service: NotesService = Depends(get_notes_service)
):
    """Delete a note. Only the author can delete their note."""
    success = await notes_service.delete_note(
        report_id=report_id,
        article_id=article_id,
        note_id=note_id,
        user=current_user
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Note not found or you don't have permission to delete it"
        )
