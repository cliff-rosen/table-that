"""
Migration: Add 'task' value to artifact_type enum

Adds a third artifact type for general work items alongside bugs and features.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add 'task' to the artifact_type MySQL enum."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check current enum values
        result = conn.execute(text(
            "SHOW COLUMNS FROM artifacts WHERE Field = 'artifact_type'"
        ))
        row = result.fetchone()
        if not row:
            print("Column 'artifact_type' not found in 'artifacts'. Skipping.")
            return

        col_type = row[1]  # e.g. "enum('bug','feature')"
        if 'task' in col_type:
            print("Enum value 'task' already exists in artifacts.artifact_type. Skipping.")
            return

        conn.execute(text("""
            ALTER TABLE artifacts MODIFY COLUMN artifact_type
            ENUM('bug', 'feature', 'task') NOT NULL
        """))
        conn.commit()
        print("Added 'task' to artifacts.artifact_type enum.")


if __name__ == "__main__":
    run_migration()
