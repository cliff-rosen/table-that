"""
Migration: Add updated_by column to artifacts table

Adds a nullable FK column tracking who last updated each artifact.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add updated_by column to artifacts table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        result = conn.execute(text(
            "SHOW COLUMNS FROM artifacts WHERE Field = 'updated_by'"
        ))
        if result.fetchone():
            print("Column 'updated_by' already exists. Skipping.")
        else:
            conn.execute(text("""
                ALTER TABLE artifacts
                ADD COLUMN updated_by INT NULL
                AFTER created_by,
                ADD CONSTRAINT fk_artifacts_updated_by
                FOREIGN KEY (updated_by) REFERENCES users(user_id)
                ON DELETE SET NULL
            """))
            conn.commit()
            print("Added 'updated_by' column to artifacts table.")

        print("Migration complete.")


if __name__ == "__main__":
    run_migration()
