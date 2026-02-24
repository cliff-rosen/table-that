"""
Migration: Add extras column to messages table

This adds a JSON column to store extended message data that wasn't previously persisted:
- tool_history: Record of tool calls made during the response
- custom_payload: Structured payload data (e.g., PubMed results, suggestions)
- diagnostics: Debug info about what was passed to the agent loop
- suggested_values: Quick-select options offered to the user
- suggested_actions: Action buttons offered to the user
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add extras column to messages table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'messages'
            AND column_name = 'extras'
        """))

        if result.fetchone():
            print("Column 'extras' already exists in messages table")
            return

        # Add the column
        print("Adding 'extras' column to messages table...")
        conn.execute(text("""
            ALTER TABLE messages
            ADD COLUMN extras JSON
        """))
        conn.commit()

        print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
