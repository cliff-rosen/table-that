"""
Migration: Simplify chat_config to single 'content' column

This migration:
1. Adds 'content' column to chat_config table
2. Migrates data from 'persona' and 'instructions' columns to 'content'
3. Drops legacy columns: identity, guidelines, persona, instructions

The 'content' field meaning depends on scope:
- For streams: domain-specific instructions for the assistant
- For pages: persona defining who the assistant is and how it behaves
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
    """Simplify chat_config to single content column."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Step 1: Add 'content' column if it doesn't exist
        if column_exists(conn, 'chat_config', 'content'):
            print("Column 'content' already exists in chat_config table")
        else:
            print("Adding 'content' column to chat_config table...")
            conn.execute(text("""
                ALTER TABLE chat_config
                ADD COLUMN content TEXT
            """))
            conn.commit()
            print("Column 'content' added successfully.")

        # Step 2: Migrate data from persona/instructions to content
        print("\nMigrating data to 'content' column...")

        # For pages: copy persona to content
        if column_exists(conn, 'chat_config', 'persona'):
            result = conn.execute(text("""
                UPDATE chat_config
                SET content = persona
                WHERE scope = 'page' AND persona IS NOT NULL AND content IS NULL
            """))
            conn.commit()
            print(f"  Migrated page persona data to content")

        # For streams: copy instructions to content
        if column_exists(conn, 'chat_config', 'instructions'):
            result = conn.execute(text("""
                UPDATE chat_config
                SET content = instructions
                WHERE scope = 'stream' AND instructions IS NOT NULL AND content IS NULL
            """))
            conn.commit()
            print(f"  Migrated stream instructions data to content")

        # Step 3: Drop legacy columns
        print("\nDropping legacy columns...")

        legacy_columns = ['identity', 'guidelines', 'persona', 'instructions']
        for col in legacy_columns:
            if column_exists(conn, 'chat_config', col):
                print(f"  Dropping column '{col}'...")
                conn.execute(text(f"ALTER TABLE chat_config DROP COLUMN {col}"))
                conn.commit()
                print(f"  Column '{col}' dropped.")
            else:
                print(f"  Column '{col}' does not exist, skipping.")

        # Step 4: Also drop 'help' and 'global' scope rows if any exist
        print("\nCleaning up unsupported scope values...")
        result = conn.execute(text("""
            DELETE FROM chat_config
            WHERE scope NOT IN ('stream', 'page')
        """))
        conn.commit()
        deleted = result.rowcount
        if deleted > 0:
            print(f"  Deleted {deleted} rows with unsupported scope values.")
        else:
            print("  No rows with unsupported scope values found.")

        print("\nMigration completed!")
        print("chat_config table now has: scope, scope_key, content, updated_at, updated_by")


if __name__ == "__main__":
    run_migration()
