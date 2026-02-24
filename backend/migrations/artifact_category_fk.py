"""
Migration: Replace artifact category string with FK to artifact_categories

1. Add category_id INTEGER column to artifacts
2. Backfill category_id from existing category string names
3. Add FK constraint with ON DELETE SET NULL
4. Drop old category VARCHAR column
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Replace artifacts.category (VARCHAR) with artifacts.category_id (FK)."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if category_id column already exists (migration already run)
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'artifacts' AND column_name = 'category_id'
        """))
        if result.fetchone():
            print("Column 'category_id' already exists on 'artifacts'. Skipping.")
            return

        # Step 1: Add category_id column
        print("Adding category_id column to artifacts...")
        conn.execute(text("""
            ALTER TABLE artifacts
            ADD COLUMN category_id INTEGER
        """))

        # Step 2: Backfill category_id from existing category string (MariaDB JOIN syntax)
        print("Backfilling category_id from category names...")
        result = conn.execute(text("""
            UPDATE artifacts a
            JOIN artifact_categories ac ON a.category = ac.name
            SET a.category_id = ac.id
            WHERE a.category IS NOT NULL
        """))
        print(f"  Backfilled {result.rowcount} artifacts with category_id.")

        # Check for orphaned categories (artifacts with category string that has no matching category record)
        orphan_result = conn.execute(text("""
            SELECT DISTINCT category
            FROM artifacts
            WHERE category IS NOT NULL
              AND category != ''
              AND category_id IS NULL
        """))
        orphans = [row[0] for row in orphan_result]
        if orphans:
            print(f"  Warning: {len(orphans)} category name(s) have no matching artifact_categories record: {orphans}")
            print("  Creating missing categories and backfilling...")
            for name in orphans:
                conn.execute(text("""
                    INSERT IGNORE INTO artifact_categories (name)
                    VALUES (:name)
                """), {"name": name})
            # Re-backfill after creating missing categories
            result2 = conn.execute(text("""
                UPDATE artifacts a
                JOIN artifact_categories ac ON a.category = ac.name
                SET a.category_id = ac.id
                WHERE a.category IS NOT NULL
                  AND a.category_id IS NULL
            """))
            print(f"  Backfilled {result2.rowcount} additional artifacts.")

        # Step 3: Add FK constraint with ON DELETE SET NULL
        print("Adding foreign key constraint...")
        conn.execute(text("""
            ALTER TABLE artifacts
            ADD CONSTRAINT fk_artifacts_category_id
            FOREIGN KEY (category_id)
            REFERENCES artifact_categories(id)
            ON DELETE SET NULL
        """))

        # Step 4: Add index on category_id for query performance
        print("Adding index on category_id...")
        conn.execute(text("""
            CREATE INDEX ix_artifacts_category_id ON artifacts(category_id)
        """))

        # Step 5: Drop old category VARCHAR column
        print("Dropping old category VARCHAR column...")
        conn.execute(text("""
            ALTER TABLE artifacts
            DROP COLUMN category
        """))

        conn.commit()
        print("Migration complete: artifacts now use category_id FK.")


if __name__ == "__main__":
    run_migration()
