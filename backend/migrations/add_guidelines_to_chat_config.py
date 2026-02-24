"""
Migration: Add guidelines column to chat_config table

Adds a 'guidelines' column for storing behavioral guidelines (style, suggestions, constraints).
These can be set at page level or globally.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add guidelines column to chat_config table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'chat_config' AND column_name = 'guidelines'
        """))

        if result.fetchone():
            print("Column 'guidelines' already exists in chat_config table")
        else:
            print("Adding 'guidelines' column to chat_config table...")
            conn.execute(text("""
                ALTER TABLE chat_config
                ADD COLUMN guidelines TEXT
            """))
            conn.commit()
            print("Column added successfully.")

        print("Migration completed!")


if __name__ == "__main__":
    run_migration()
