"""
Artifact schemas for bug/feature tracking.

Mirrors frontend types/artifact.ts for easy cross-reference.
"""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class ArtifactCategory(BaseModel):
    """Artifact category domain object."""
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True


class Artifact(BaseModel):
    """Artifact domain object."""
    id: int
    title: str
    description: Optional[str] = None
    artifact_type: str  # "bug" | "feature" | "task"
    status: str         # "new" | "open" | "in_progress" | "icebox" | "closed"
    priority: Optional[str] = None  # "urgent" | "high" | "medium" | "low"
    area: Optional[str] = None      # functional area (login_auth, streams, etc.)
    category: Optional[str] = None
    created_by: int
    created_by_name: Optional[str] = None
    updated_by: Optional[int] = None
    updated_by_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True
