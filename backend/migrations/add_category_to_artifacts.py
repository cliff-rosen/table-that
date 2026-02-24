"""
Migration: Add category column to artifacts table

Adds a free-form category tag for organizing artifacts into custom buckets.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add category column to artifacts table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'artifacts' AND column_name = 'category'
        """))

        if result.fetchone():
            print("Column 'category' already exists in 'artifacts' table. Skipping.")
            return

        # Add the column
        conn.execute(text("""
            ALTER TABLE artifacts ADD COLUMN category VARCHAR(100) DEFAULT NULL
        """))
        conn.commit()
        print("Added 'category' column to 'artifacts' table.")


if __name__ == "__main__":
    run_migration()
