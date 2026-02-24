"""
Article schemas for Knowledge Horizon

Organized to mirror frontend types/article.ts for easy cross-reference.
"""

from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, date


class Article(BaseModel):
    """Article business object"""
    article_id: int
    source_id: Optional[int] = None
    title: str
    url: Optional[str] = None
    authors: List[str] = []
    summary: Optional[str] = None
    ai_summary: Optional[str] = None
    full_text: Optional[str] = None
    article_metadata: Dict[str, Any] = {}
    theme_tags: List[str] = []
    first_seen: datetime
    last_updated: datetime
    fetch_count: int = 1

    # Honest date fields - only populated with actual precision available
    pub_year: Optional[int] = None  # Publication year (always present from source)
    pub_month: Optional[int] = None  # Publication month (1-12, when available)
    pub_day: Optional[int] = None  # Publication day (1-31, when available)

    # PubMed-specific fields
    pmid: Optional[str] = None
    abstract: Optional[str] = None
    comp_date: Optional[date] = None
    journal: Optional[str] = None
    volume: Optional[str] = None
    issue: Optional[str] = None
    medium: Optional[str] = None
    pages: Optional[str] = None
    poi: Optional[str] = None
    doi: Optional[str] = None
    is_systematic: bool = False

    class Config:
        from_attributes = True
