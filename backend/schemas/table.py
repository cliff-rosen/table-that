"""
Table and Row Pydantic schemas for request/response validation.
"""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


class ColumnType(str, Enum):
    TEXT = "text"
    NUMBER = "number"
    DATE = "date"
    BOOLEAN = "boolean"
    SELECT = "select"


class ColumnDefinition(BaseModel):
    """Schema for a single column in a table definition."""
    id: str = Field(description="Stable column ID (col_xxx)")
    name: str = Field(min_length=1, max_length=255, description="Column display name")
    type: ColumnType = Field(description="Column data type")
    required: bool = Field(default=False, description="Whether this column is required")
    default: Optional[Any] = Field(default=None, description="Default value for new rows")
    options: Optional[List[str]] = Field(default=None, description="Options for select type columns")


class TableCreate(BaseModel):
    """Request schema for creating a table."""
    name: str = Field(min_length=1, max_length=255, description="Table name")
    description: Optional[str] = Field(default=None, description="Table description")
    columns: List[ColumnDefinition] = Field(description="Column definitions")


class TableUpdate(BaseModel):
    """Request schema for updating a table."""
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    description: Optional[str] = None
    columns: Optional[List[ColumnDefinition]] = None


class TableSchema(BaseModel):
    """Response schema for a table definition."""
    id: int
    user_id: int
    name: str
    description: Optional[str] = None
    columns: List[ColumnDefinition]
    row_count: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class TableListItem(BaseModel):
    """Lightweight table item for list responses."""
    id: int
    name: str
    description: Optional[str] = None
    column_count: int
    row_count: int
    created_at: datetime
    updated_at: datetime


class RowCreate(BaseModel):
    """Request schema for creating a row."""
    data: Dict[str, Any] = Field(description="Column values keyed by column ID")


class RowUpdate(BaseModel):
    """Request schema for updating a row."""
    data: Dict[str, Any] = Field(description="Column values to update, keyed by column ID")


class TableRowSchema(BaseModel):
    """Response schema for a table row."""
    id: int
    table_id: int
    data: Dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RowsListResponse(BaseModel):
    """Response schema for paginated row listing."""
    rows: List[TableRowSchema]
    total: int
    offset: int
    limit: int


class BulkDeleteRequest(BaseModel):
    """Request schema for bulk row deletion."""
    row_ids: List[int] = Field(min_length=1, description="IDs of rows to delete")


class SearchRequest(BaseModel):
    """Request schema for full-text search across rows."""
    query: str = Field(min_length=1, description="Search query")
    limit: int = Field(default=50, ge=1, le=500)
