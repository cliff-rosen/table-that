"""
Table Definition Service - CRUD operations for table schemas.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete
from typing import Optional, List
from fastapi import HTTPException, status, Depends
import logging

from models import TableDefinition, TableRow, User
from schemas.table import TableCreate, TableUpdate, ColumnDefinition
from database import get_async_db

logger = logging.getLogger(__name__)


class TableService:
    """Service for table definition CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, user_id: int, data: TableCreate) -> TableDefinition:
        """Create a new table definition."""
        columns_json = [col.model_dump() for col in data.columns]
        table = TableDefinition(
            user_id=user_id,
            name=data.name,
            description=data.description,
            columns=columns_json,
        )
        self.db.add(table)
        await self.db.commit()
        await self.db.refresh(table)
        return table

    async def get(self, table_id: int, user_id: int) -> TableDefinition:
        """Get a table definition by ID, verifying ownership."""
        result = await self.db.execute(
            select(TableDefinition).where(
                TableDefinition.id == table_id,
                TableDefinition.user_id == user_id,
            )
        )
        table = result.scalars().first()
        if not table:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Table not found"
            )
        return table

    async def list(self, user_id: int) -> List[dict]:
        """List all tables for a user with row counts."""
        # Get tables
        result = await self.db.execute(
            select(TableDefinition)
            .where(TableDefinition.user_id == user_id)
            .order_by(TableDefinition.updated_at.desc())
        )
        tables = result.scalars().all()

        # Get row counts per table
        count_result = await self.db.execute(
            select(TableRow.table_id, func.count(TableRow.id).label("row_count"))
            .where(TableRow.table_id.in_([t.id for t in tables]))
            .group_by(TableRow.table_id)
        )
        row_counts = {row.table_id: row.row_count for row in count_result}

        return [
            {
                "id": t.id,
                "name": t.name,
                "description": t.description,
                "column_count": len(t.columns) if t.columns else 0,
                "row_count": row_counts.get(t.id, 0),
                "created_at": t.created_at,
                "updated_at": t.updated_at,
            }
            for t in tables
        ]

    async def update(self, table_id: int, user_id: int, data: TableUpdate) -> TableDefinition:
        """Update a table definition."""
        table = await self.get(table_id, user_id)

        if data.name is not None:
            table.name = data.name
        if data.description is not None:
            table.description = data.description
        if data.columns is not None:
            table.columns = [col.model_dump() for col in data.columns]

        await self.db.commit()
        await self.db.refresh(table)
        return table

    async def delete(self, table_id: int, user_id: int) -> bool:
        """Delete a table and all its rows (cascade)."""
        table = await self.get(table_id, user_id)
        await self.db.delete(table)
        await self.db.commit()
        return True

    async def get_row_count(self, table_id: int) -> int:
        """Get the number of rows in a table."""
        result = await self.db.execute(
            select(func.count(TableRow.id)).where(TableRow.table_id == table_id)
        )
        return result.scalar() or 0


async def get_table_service(db: AsyncSession = Depends(get_async_db)) -> TableService:
    """Dependency injection provider."""
    return TableService(db)
