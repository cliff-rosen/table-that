"""
Migration: Add page_identities table

This creates a table to store custom identity/persona overrides for chat pages.
Identities can be edited through the admin UI, overriding code-defined defaults.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Create page_identities table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if table already exists
        result = conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'page_identities'
        """))

        if result.fetchone():
            print("Table 'page_identities' already exists")
            return

        # Create the table
        print("Creating 'page_identities' table...")
        conn.execute(text("""
            CREATE TABLE page_identities (
                page VARCHAR(100) PRIMARY KEY,
                identity TEXT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(user_id)
            )
        """))
        conn.commit()

        print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
