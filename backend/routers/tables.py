"""
Tables Router - REST endpoints for table and row CRUD, import/export.
"""

from fastapi import APIRouter, Depends, Query, UploadFile, File
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
import io
import logging

from database import get_async_db
from models import User
from services import auth_service
from services.table_service import TableService, get_table_service
from services.row_service import RowService, get_row_service
from services.import_export_service import (
    detect_schema, parse_csv_rows, import_csv_to_table, export_csv,
)
from schemas.table import (
    TableCreate, TableUpdate, TableSchema, TableListItem,
    RowCreate, RowUpdate, TableRowSchema, RowsListResponse,
    BulkDeleteRequest, SearchRequest, ColumnDefinition,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tables", tags=["tables"])


# =============================================================================
# Table CRUD
# =============================================================================

@router.get("", response_model=List[TableListItem])
async def list_tables(
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
):
    """List all tables for the current user."""
    return await table_service.list(current_user.user_id)


@router.post("", response_model=TableSchema, status_code=201)
async def create_table(
    data: TableCreate,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
):
    """Create a new table."""
    table = await table_service.create(current_user.user_id, data)
    row_count = await table_service.get_row_count(table.id)
    return TableSchema(
        id=table.id,
        user_id=table.user_id,
        name=table.name,
        description=table.description,
        columns=[ColumnDefinition(**c) for c in table.columns],
        row_count=row_count,
        created_at=table.created_at,
        updated_at=table.updated_at,
    )


@router.get("/{table_id}", response_model=TableSchema)
async def get_table(
    table_id: int,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
):
    """Get a table definition by ID."""
    table = await table_service.get(table_id, current_user.user_id)
    row_count = await table_service.get_row_count(table.id)
    return TableSchema(
        id=table.id,
        user_id=table.user_id,
        name=table.name,
        description=table.description,
        columns=[ColumnDefinition(**c) for c in table.columns],
        row_count=row_count,
        created_at=table.created_at,
        updated_at=table.updated_at,
    )


@router.put("/{table_id}", response_model=TableSchema)
async def update_table(
    table_id: int,
    data: TableUpdate,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
):
    """Update a table definition."""
    table = await table_service.update(table_id, current_user.user_id, data)
    row_count = await table_service.get_row_count(table.id)
    return TableSchema(
        id=table.id,
        user_id=table.user_id,
        name=table.name,
        description=table.description,
        columns=[ColumnDefinition(**c) for c in table.columns],
        row_count=row_count,
        created_at=table.created_at,
        updated_at=table.updated_at,
    )


@router.delete("/{table_id}")
async def delete_table(
    table_id: int,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
):
    """Delete a table and all its rows."""
    await table_service.delete(table_id, current_user.user_id)
    return {"ok": True}


# =============================================================================
# Row CRUD
# =============================================================================

@router.get("/{table_id}/rows", response_model=RowsListResponse)
async def list_rows(
    table_id: int,
    offset: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    sort_column: Optional[str] = None,
    sort_direction: str = Query("asc", pattern="^(asc|desc)$"),
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """List rows with optional sorting and pagination."""
    # Verify table ownership
    await table_service.get(table_id, current_user.user_id)

    rows, total = await row_service.list(
        table_id=table_id,
        offset=offset,
        limit=limit,
        sort_column=sort_column,
        sort_direction=sort_direction,
    )
    return RowsListResponse(
        rows=[TableRowSchema.model_validate(r) for r in rows],
        total=total,
        offset=offset,
        limit=limit,
    )


@router.post("/{table_id}/rows", response_model=TableRowSchema, status_code=201)
async def create_row(
    table_id: int,
    data: RowCreate,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """Create a new row in a table."""
    await table_service.get(table_id, current_user.user_id)
    row = await row_service.create(table_id, data)
    return TableRowSchema.model_validate(row)


@router.get("/{table_id}/rows/{row_id}", response_model=TableRowSchema)
async def get_row(
    table_id: int,
    row_id: int,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """Get a single row by ID."""
    await table_service.get(table_id, current_user.user_id)
    row = await row_service.get(table_id, row_id)
    return TableRowSchema.model_validate(row)


@router.put("/{table_id}/rows/{row_id}", response_model=TableRowSchema)
async def update_row(
    table_id: int,
    row_id: int,
    data: RowUpdate,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """Update a row's data."""
    await table_service.get(table_id, current_user.user_id)
    row = await row_service.update(table_id, row_id, data)
    return TableRowSchema.model_validate(row)


@router.delete("/{table_id}/rows/{row_id}")
async def delete_row(
    table_id: int,
    row_id: int,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """Delete a single row."""
    await table_service.get(table_id, current_user.user_id)
    await row_service.delete(table_id, row_id)
    return {"ok": True}


@router.post("/{table_id}/rows/bulk-delete")
async def bulk_delete_rows(
    table_id: int,
    data: BulkDeleteRequest,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """Delete multiple rows at once."""
    await table_service.get(table_id, current_user.user_id)
    deleted = await row_service.bulk_delete(table_id, data.row_ids)
    return {"ok": True, "deleted": deleted}


@router.post("/{table_id}/rows/search", response_model=List[TableRowSchema])
async def search_rows(
    table_id: int,
    data: SearchRequest,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """Full-text search across text columns in a table."""
    table = await table_service.get(table_id, current_user.user_id)
    rows = await row_service.search(
        table_id=table_id,
        query=data.query,
        columns=table.columns,
        limit=data.limit,
    )
    return [TableRowSchema.model_validate(r) for r in rows]


# =============================================================================
# Import / Export
# =============================================================================

@router.post("/{table_id}/import")
async def import_csv(
    table_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    db: AsyncSession = Depends(get_async_db),
):
    """Import CSV data into an existing table."""
    table = await table_service.get(table_id, current_user.user_id)

    content = await file.read()
    csv_text = content.decode("utf-8-sig")  # Handle BOM

    count = await import_csv_to_table(db, table, csv_text)
    return {"ok": True, "imported": count}


@router.post("/import-with-schema", response_model=TableSchema)
async def import_with_schema(
    file: UploadFile = File(...),
    table_name: str = Query(..., min_length=1, max_length=255),
    table_description: Optional[str] = Query(None),
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    db: AsyncSession = Depends(get_async_db),
):
    """Create a new table from a CSV file with auto-detected schema."""
    content = await file.read()
    csv_text = content.decode("utf-8-sig")

    # Detect schema
    columns, header_names = detect_schema(csv_text)
    if not columns:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail="Could not detect columns from CSV")

    # Create table
    table_data = TableCreate(
        name=table_name,
        description=table_description,
        columns=[ColumnDefinition(**c) for c in columns],
    )
    table = await table_service.create(current_user.user_id, table_data)

    # Import rows
    count = await import_csv_to_table(db, table, csv_text)

    row_count = await table_service.get_row_count(table.id)
    return TableSchema(
        id=table.id,
        user_id=table.user_id,
        name=table.name,
        description=table.description,
        columns=[ColumnDefinition(**c) for c in table.columns],
        row_count=row_count,
        created_at=table.created_at,
        updated_at=table.updated_at,
    )


@router.get("/{table_id}/export")
async def export_table_csv(
    table_id: int,
    current_user: User = Depends(auth_service.validate_token),
    table_service: TableService = Depends(get_table_service),
    row_service: RowService = Depends(get_row_service),
):
    """Export a table's data as CSV."""
    table = await table_service.get(table_id, current_user.user_id)

    # Fetch all rows (up to 10k for safety)
    rows, _ = await row_service.list(table_id=table_id, limit=10000)

    csv_content = export_csv(table.columns, rows)

    # Return as downloadable CSV file
    safe_name = table.name.replace('"', '').replace("'", "")[:100]
    return StreamingResponse(
        io.StringIO(csv_content),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}.csv"'
        },
    )
