"""
Migration: Add 'backburner' value to artifactstatus enum

Adds a new status option for artifacts that are deprioritized but not closed.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add 'backburner' to the artifactstatus MySQL enum."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check current enum values
        result = conn.execute(text(
            "SHOW COLUMNS FROM artifacts WHERE Field = 'status'"
        ))
        row = result.fetchone()
        if not row:
            print("Column 'status' not found in 'artifacts'. Skipping.")
            return

        col_type = row[1]  # e.g. "enum('open','in_progress','closed')"
        if 'backburner' in col_type:
            print("Enum value 'backburner' already exists in artifacts.status. Skipping.")
            return

        conn.execute(text("""
            ALTER TABLE artifacts MODIFY COLUMN status
            ENUM('open', 'in_progress', 'backburner', 'closed') NOT NULL DEFAULT 'open'
        """))
        conn.commit()
        print("Added 'backburner' to artifacts.status enum.")


if __name__ == "__main__":
    run_migration()
