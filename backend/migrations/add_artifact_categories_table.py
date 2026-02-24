"""
Migration: Add artifact_categories table

Creates a managed list of categories for organizing artifacts into fixed buckets.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Create artifact_categories table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if table already exists
        result = conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'artifact_categories'
        """))

        if result.fetchone():
            print("Table 'artifact_categories' already exists. Skipping.")
            return

        conn.execute(text("""
            CREATE TABLE artifact_categories (
                id SERIAL PRIMARY KEY,
                name VARCHAR(100) NOT NULL UNIQUE,
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        conn.commit()
        print("Created 'artifact_categories' table.")


if __name__ == "__main__":
    run_migration()
