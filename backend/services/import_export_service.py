"""
Import/Export Service - CSV import and export for table data.
"""

import csv
import io
import uuid
import logging
from typing import List, Dict, Any, Optional, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from fastapi import Depends

from models import TableDefinition, TableRow
from database import get_async_db

logger = logging.getLogger(__name__)


def _generate_column_id() -> str:
    """Generate a stable column ID."""
    return f"col_{uuid.uuid4().hex[:8]}"


def detect_schema(
    csv_content: str,
    has_header: bool = True,
    sample_size: int = 100,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Auto-detect column types from CSV content.

    Returns:
        Tuple of (column_definitions, header_names)
    """
    reader = csv.reader(io.StringIO(csv_content))

    if has_header:
        try:
            headers = next(reader)
        except StopIteration:
            return [], []
    else:
        # Peek at first row for column count
        try:
            first_row = next(reader)
        except StopIteration:
            return [], []
        headers = [f"Column {i + 1}" for i in range(len(first_row))]
        # Re-read from beginning so sample includes first row
        reader = csv.reader(io.StringIO(csv_content))

    # Clean headers
    headers = [h.strip() for h in headers]

    # Sample rows for type detection
    sample_rows: List[List[str]] = []
    for i, row in enumerate(reader):
        if i >= sample_size:
            break
        sample_rows.append(row)

    columns = []
    for col_idx, header in enumerate(headers):
        col_values = [
            row[col_idx].strip() for row in sample_rows
            if col_idx < len(row) and row[col_idx].strip()
        ]

        col_type = _detect_column_type(col_values)
        col_def = {
            "id": _generate_column_id(),
            "name": header or f"Column {col_idx + 1}",
            "type": col_type,
            "required": False,
        }

        # If select type, include detected options
        if col_type == "select":
            unique_values = sorted(set(col_values))
            col_def["options"] = unique_values

        columns.append(col_def)

    return columns, headers


def _detect_column_type(values: List[str]) -> str:
    """Detect the most appropriate column type for a set of values."""
    if not values:
        return "text"

    # Check if all values are boolean-like
    bool_values = {"true", "false", "yes", "no", "1", "0", "y", "n"}
    if all(v.lower() in bool_values for v in values):
        return "boolean"

    # Check if all values are numeric
    numeric_count = 0
    for v in values:
        try:
            float(v.replace(",", ""))
            numeric_count += 1
        except ValueError:
            pass
    if numeric_count == len(values):
        return "number"

    # Check if all values look like dates
    date_patterns = _check_date_values(values)
    if date_patterns:
        return "date"

    # Check if values are a small set of options (select)
    unique_count = len(set(values))
    if unique_count <= 10 and len(values) >= 3 and unique_count < len(values) * 0.5:
        return "select"

    return "text"


def _check_date_values(values: List[str]) -> bool:
    """Check if values appear to be dates."""
    from datetime import datetime

    date_formats = [
        "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y",
        "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M:%S",
        "%Y/%m/%d", "%d-%m-%Y",
    ]

    date_count = 0
    for v in values:
        for fmt in date_formats:
            try:
                datetime.strptime(v, fmt)
                date_count += 1
                break
            except ValueError:
                continue

    # At least 80% should parse as dates
    return date_count >= len(values) * 0.8


def _coerce_value(raw: str, col_type: str) -> Any:
    """Coerce a raw CSV string value to the target column type."""
    raw = raw.strip()
    if not raw:
        return None

    if col_type == "number":
        try:
            # Handle comma-formatted numbers
            cleaned = raw.replace(",", "")
            if "." in cleaned:
                return float(cleaned)
            return int(cleaned)
        except ValueError:
            return raw

    if col_type == "boolean":
        return raw.lower() in ("true", "yes", "1", "y")

    if col_type == "date":
        # Try to normalize to YYYY-MM-DD
        from datetime import datetime
        date_formats = [
            "%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y",
            "%Y-%m-%d %H:%M:%S", "%m/%d/%Y %H:%M:%S",
            "%Y/%m/%d", "%d-%m-%Y",
        ]
        for fmt in date_formats:
            try:
                return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return raw

    # text or select: return as-is
    return raw


def parse_csv_rows(
    csv_content: str,
    columns: List[Dict[str, Any]],
    has_header: bool = True,
    header_names: Optional[List[str]] = None,
) -> List[Dict[str, Any]]:
    """
    Parse CSV content into row data dicts using the given column schema.

    Args:
        csv_content: Raw CSV string
        columns: Column definitions with id and type
        has_header: Whether CSV has a header row
        header_names: Original header names for mapping (if different from column names)

    Returns:
        List of {column_id: typed_value} dicts
    """
    reader = csv.reader(io.StringIO(csv_content))

    if has_header:
        try:
            csv_headers = next(reader)
        except StopIteration:
            return []
        csv_headers = [h.strip() for h in csv_headers]

        # Build mapping: csv column index → column definition
        col_map: Dict[int, Dict[str, Any]] = {}
        for csv_idx, csv_header in enumerate(csv_headers):
            for col in columns:
                # Match by name (case-insensitive)
                if col["name"].lower() == csv_header.lower():
                    col_map[csv_idx] = col
                    break
            else:
                # Try matching against original header names
                if header_names:
                    for orig_idx, orig_name in enumerate(header_names):
                        if orig_name.lower() == csv_header.lower() and orig_idx < len(columns):
                            col_map[csv_idx] = columns[orig_idx]
                            break
    else:
        # Map by position
        col_map = {i: col for i, col in enumerate(columns)}

    rows = []
    for row_data in reader:
        data: Dict[str, Any] = {}
        for csv_idx, col in col_map.items():
            if csv_idx < len(row_data):
                value = _coerce_value(row_data[csv_idx], col["type"])
                if value is not None:
                    data[col["id"]] = value
        if data:  # Skip entirely empty rows
            rows.append(data)

    return rows


async def import_csv_to_table(
    db: AsyncSession,
    table: TableDefinition,
    csv_content: str,
    has_header: bool = True,
) -> int:
    """
    Import CSV data into an existing table.

    Args:
        db: Database session
        table: Target table definition
        csv_content: Raw CSV string
        has_header: Whether CSV has a header row

    Returns:
        Number of rows imported
    """
    rows_data = parse_csv_rows(csv_content, table.columns, has_header)

    if not rows_data:
        return 0

    # Batch create rows
    new_rows = [
        TableRow(table_id=table.id, data=data)
        for data in rows_data
    ]
    db.add_all(new_rows)
    await db.commit()

    return len(new_rows)


def export_csv(
    columns: List[Dict[str, Any]],
    rows: List[TableRow],
) -> str:
    """
    Export rows to CSV string.

    Args:
        columns: Column definitions
        rows: TableRow objects to export

    Returns:
        CSV string with header + data rows
    """
    output = io.StringIO()
    writer = csv.writer(output)

    # Write header
    headers = [col["name"] for col in columns]
    writer.writerow(headers)

    # Write data rows
    for row in rows:
        csv_row = []
        for col in columns:
            value = row.data.get(col["id"], "")
            if value is None:
                value = ""
            elif isinstance(value, bool):
                value = "true" if value else "false"
            csv_row.append(str(value))
        writer.writerow(csv_row)

    return output.getvalue()


async def get_import_export_service(db: AsyncSession = Depends(get_async_db)):
    """Dependency injection provider (returns module-level functions with db closure)."""
    return db
