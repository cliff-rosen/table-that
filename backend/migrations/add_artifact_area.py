"""
Migration: Add area column to artifacts table

Adds a nullable 'area' ENUM column to indicate which functional area
of the platform an artifact relates to.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add area column to artifacts table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        result = conn.execute(text(
            "SHOW COLUMNS FROM artifacts WHERE Field = 'area'"
        ))
        if result.fetchone():
            print("Column 'area' already exists. Skipping.")
        else:
            conn.execute(text("""
                ALTER TABLE artifacts
                ADD COLUMN area ENUM(
                    'login_auth', 'user_prefs', 'streams', 'reports',
                    'articles', 'notes', 'users', 'organizations',
                    'data_sources', 'chat_system', 'help_content', 'system_ops'
                ) NULL
                AFTER priority
            """))
            conn.commit()
            print("Added 'area' column to artifacts table.")

        print("Migration complete.")


if __name__ == "__main__":
    run_migration()
