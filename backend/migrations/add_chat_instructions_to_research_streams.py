"""
Migration: Add chat_instructions column to research_streams table

This adds a text field for stream-specific chat instructions that guide
the AI assistant when discussing articles and reports from this stream.

Example use cases:
- Classification rules (e.g., pro-plaintiff vs pro-defense criteria)
- Domain-specific terminology and concepts
- Special handling instructions for the stream's subject matter
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add chat_instructions column to research_streams table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'research_streams'
            AND column_name = 'chat_instructions'
        """))

        if result.fetchone():
            print("Column 'chat_instructions' already exists in research_streams table")
            return

        # Add the column
        print("Adding 'chat_instructions' column to research_streams table...")
        conn.execute(text("""
            ALTER TABLE research_streams
            ADD COLUMN chat_instructions TEXT
        """))
        conn.commit()

        print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
