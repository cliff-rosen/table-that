"""
Row Service - CRUD operations for table rows with filtering, sorting, and pagination.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, text, case, literal_column
from typing import Optional, List, Dict, Any, Tuple
from fastapi import HTTPException, status, Depends
import logging

from models import TableRow, TableDefinition
from schemas.table import RowCreate, RowUpdate
from database import get_async_db

logger = logging.getLogger(__name__)


class RowService:
    """Service for table row CRUD operations."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(self, table_id: int, data: RowCreate) -> TableRow:
        """Create a new row in a table."""
        row = TableRow(
            table_id=table_id,
            data=data.data,
        )
        self.db.add(row)
        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def get(self, table_id: int, row_id: int) -> TableRow:
        """Get a row by ID, verifying it belongs to the table."""
        result = await self.db.execute(
            select(TableRow).where(
                TableRow.id == row_id,
                TableRow.table_id == table_id,
            )
        )
        row = result.scalars().first()
        if not row:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Row not found"
            )
        return row

    async def list(
        self,
        table_id: int,
        offset: int = 0,
        limit: int = 100,
        sort_column: Optional[str] = None,
        sort_direction: str = "asc",
        filters: Optional[Dict[str, Any]] = None,
    ) -> Tuple[List[TableRow], int]:
        """
        List rows with optional filtering, sorting, and pagination.

        Args:
            table_id: Table to query
            offset: Pagination offset
            limit: Pagination limit
            sort_column: Column ID to sort by (sorts via JSON_EXTRACT)
            sort_direction: 'asc' or 'desc'
            filters: Dict of {column_id: {operator: value}} for filtering

        Returns:
            Tuple of (rows, total_count)
        """
        # Base query
        query = select(TableRow).where(TableRow.table_id == table_id)
        count_query = select(func.count(TableRow.id)).where(TableRow.table_id == table_id)

        # Apply filters
        if filters:
            for col_id, filter_spec in filters.items():
                if isinstance(filter_spec, dict):
                    operator = filter_spec.get("operator", "equals")
                    value = filter_spec.get("value")
                    json_path = f"$.{col_id}"

                    if operator == "equals":
                        condition = func.json_extract(TableRow.data, json_path) == value
                    elif operator == "contains":
                        condition = func.json_extract(TableRow.data, json_path).like(f"%{value}%")
                    elif operator == "gt":
                        condition = func.json_extract(TableRow.data, json_path) > value
                    elif operator == "lt":
                        condition = func.json_extract(TableRow.data, json_path) < value
                    elif operator == "gte":
                        condition = func.json_extract(TableRow.data, json_path) >= value
                    elif operator == "lte":
                        condition = func.json_extract(TableRow.data, json_path) <= value
                    elif operator == "is_true":
                        condition = func.json_extract(TableRow.data, json_path) == True
                    elif operator == "is_false":
                        condition = func.json_extract(TableRow.data, json_path) == False
                    elif operator == "is_empty":
                        condition = (
                            (func.json_extract(TableRow.data, json_path) == None) |
                            (func.json_extract(TableRow.data, json_path) == "")
                        )
                    elif operator == "is_not_empty":
                        condition = (
                            (func.json_extract(TableRow.data, json_path) != None) &
                            (func.json_extract(TableRow.data, json_path) != "")
                        )
                    else:
                        continue

                    query = query.where(condition)
                    count_query = count_query.where(condition)

        # Get total count
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply sorting
        if sort_column:
            json_path = f"$.{sort_column}"
            sort_expr = func.json_extract(TableRow.data, json_path)
            if sort_direction == "desc":
                query = query.order_by(sort_expr.desc())
            else:
                query = query.order_by(sort_expr.asc())
        else:
            query = query.order_by(TableRow.created_at.desc())

        # Apply pagination
        query = query.offset(offset).limit(limit)

        result = await self.db.execute(query)
        rows = result.scalars().all()

        return rows, total

    async def update(self, table_id: int, row_id: int, data: RowUpdate) -> TableRow:
        """Update a row's data (merge with existing)."""
        row = await self.get(table_id, row_id)

        # Merge new data into existing
        current_data = dict(row.data) if row.data else {}
        current_data.update(data.data)
        row.data = current_data

        await self.db.commit()
        await self.db.refresh(row)
        return row

    async def delete(self, table_id: int, row_id: int) -> bool:
        """Delete a single row."""
        row = await self.get(table_id, row_id)
        await self.db.delete(row)
        await self.db.commit()
        return True

    async def bulk_delete(self, table_id: int, row_ids: List[int]) -> int:
        """Delete multiple rows. Returns count of deleted rows."""
        result = await self.db.execute(
            delete(TableRow).where(
                TableRow.table_id == table_id,
                TableRow.id.in_(row_ids),
            )
        )
        await self.db.commit()
        return result.rowcount

    async def search(
        self,
        table_id: int,
        query: str,
        columns: List[Dict[str, Any]],
        limit: int = 50,
    ) -> List[TableRow]:
        """
        Search across text columns for matching rows.

        Args:
            table_id: Table to search
            query: Search query string
            columns: Column definitions from the table schema
            limit: Max results to return
        """
        # Find text columns to search
        text_col_ids = [
            col["id"] for col in columns
            if col.get("type") in ("text", "select")
        ]

        if not text_col_ids:
            return []

        # Build OR conditions for each text column
        conditions = []
        for col_id in text_col_ids:
            json_path = f"$.{col_id}"
            conditions.append(
                func.json_extract(TableRow.data, json_path).like(f"%{query}%")
            )

        from sqlalchemy import or_
        stmt = (
            select(TableRow)
            .where(
                TableRow.table_id == table_id,
                or_(*conditions),
            )
            .limit(limit)
        )

        result = await self.db.execute(stmt)
        return result.scalars().all()


async def get_row_service(db: AsyncSession = Depends(get_async_db)) -> RowService:
    """Dependency injection provider."""
    return RowService(db)
