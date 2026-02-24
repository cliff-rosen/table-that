"""
Migration: Add summary column to help_content_override table

This allows overriding the topic summary (short description) that appears
in the TOC sent to the LLM, separate from the full content override.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :table AND column_name = :column
    """), {"table": table_name, "column": column_name})
    return result.fetchone() is not None


def run_migration():
    """Add summary column to help_content_override table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        if column_exists(conn, 'help_content_override', 'summary'):
            print("Column 'summary' already exists in help_content_override table")
        else:
            print("Adding 'summary' column to help_content_override table...")
            conn.execute(text("""
                ALTER TABLE help_content_override
                ADD COLUMN summary VARCHAR(200) NULL
            """))
            conn.commit()
            print("Column 'summary' added successfully.")

        # Also make content nullable (it was NOT NULL before)
        # This allows storing just a summary override without content
        print("Making 'content' column nullable...")
        try:
            conn.execute(text("""
                ALTER TABLE help_content_override
                MODIFY COLUMN content TEXT NULL
            """))
            conn.commit()
            print("Column 'content' is now nullable.")
        except Exception as e:
            print(f"Note: Could not modify content column (may already be nullable): {e}")

        print("Migration completed!")


if __name__ == "__main__":
    run_migration()
