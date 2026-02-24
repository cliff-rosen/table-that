"""
Migration: Merge identity + guidelines into persona column

This migration:
1. Adds 'persona' column to chat_config table
2. Migrates existing identity + guidelines data into persona
3. Keeps identity/guidelines columns for now (can be removed in future migration)

The persona field consolidates "who the assistant is" (identity) and
"how it behaves" (guidelines) into a single page-level configuration.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add persona column and migrate data from identity + guidelines."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if persona column already exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'chat_config' AND column_name = 'persona'
        """))

        if result.fetchone():
            print("Column 'persona' already exists in chat_config table")
        else:
            print("Adding 'persona' column to chat_config table...")
            conn.execute(text("""
                ALTER TABLE chat_config
                ADD COLUMN persona TEXT
            """))
            conn.commit()
            print("Column added successfully.")

        # Migrate existing data: merge identity + guidelines into persona
        print("Migrating existing identity + guidelines data to persona...")

        # Get all page-level configs with identity or guidelines
        result = conn.execute(text("""
            SELECT scope, scope_key, identity, guidelines
            FROM chat_config
            WHERE scope = 'page' AND (identity IS NOT NULL OR guidelines IS NOT NULL)
        """))

        rows = result.fetchall()
        migrated_count = 0

        for row in rows:
            scope, scope_key, identity, guidelines = row

            # Skip if persona is already set
            check = conn.execute(text("""
                SELECT persona FROM chat_config
                WHERE scope = :scope AND scope_key = :scope_key
            """), {"scope": scope, "scope_key": scope_key})

            existing_persona = check.fetchone()
            if existing_persona and existing_persona[0]:
                print(f"  Skipping {scope_key}: persona already set")
                continue

            # Build merged persona content
            parts = []
            if identity:
                parts.append(identity.strip())
            if guidelines:
                parts.append(guidelines.strip())

            if parts:
                merged_persona = "\n\n".join(parts)

                conn.execute(text("""
                    UPDATE chat_config
                    SET persona = :persona
                    WHERE scope = :scope AND scope_key = :scope_key
                """), {"persona": merged_persona, "scope": scope, "scope_key": scope_key})

                print(f"  Migrated {scope_key}: merged identity + guidelines into persona")
                migrated_count += 1

        conn.commit()
        print(f"Migrated {migrated_count} page configurations.")
        print("Migration completed!")
        print("\nNote: identity and guidelines columns are preserved for backwards compatibility.")
        print("A future migration can remove them once all code is updated.")


if __name__ == "__main__":
    run_migration()
