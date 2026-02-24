"""
Migration: Add priority column and update status enum

Changes:
1. Adds 'new' and 'icebox' to status enum, removes 'backburner'
2. Converts existing 'backburner' rows to 'icebox'
3. Adds nullable 'priority' column (enum: urgent, high, medium, low)
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add priority column and update status enum for artifacts."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # --- Step 1: Update status enum ---
        result = conn.execute(text(
            "SHOW COLUMNS FROM artifacts WHERE Field = 'status'"
        ))
        row = result.fetchone()
        if not row:
            print("Column 'status' not found in 'artifacts'. Skipping.")
            return

        col_type = row[1]
        needs_update = 'new' not in col_type or 'icebox' not in col_type

        if needs_update:
            # First convert any 'backburner' values to 'icebox' won't work
            # until enum is updated - so we update enum first with both values,
            # then convert, then remove backburner

            # Step 1a: Add new values to enum (keep backburner temporarily)
            if 'backburner' in col_type:
                conn.execute(text("""
                    ALTER TABLE artifacts MODIFY COLUMN status
                    ENUM('new', 'open', 'in_progress', 'backburner', 'icebox', 'closed')
                    NOT NULL DEFAULT 'new'
                """))
                conn.commit()
                print("Expanded status enum with 'new' and 'icebox'.")

                # Step 1b: Convert backburner -> icebox
                result = conn.execute(text(
                    "UPDATE artifacts SET status = 'icebox' WHERE status = 'backburner'"
                ))
                conn.commit()
                converted = result.rowcount
                if converted > 0:
                    print(f"Converted {converted} artifact(s) from 'backburner' to 'icebox'.")

            # Step 1c: Final enum without backburner
            conn.execute(text("""
                ALTER TABLE artifacts MODIFY COLUMN status
                ENUM('new', 'open', 'in_progress', 'icebox', 'closed')
                NOT NULL DEFAULT 'new'
            """))
            conn.commit()
            print("Finalized status enum: new, open, in_progress, icebox, closed.")
        else:
            print("Status enum already up to date. Skipping.")

        # --- Step 2: Add priority column ---
        result = conn.execute(text(
            "SHOW COLUMNS FROM artifacts WHERE Field = 'priority'"
        ))
        if result.fetchone():
            print("Column 'priority' already exists. Skipping.")
        else:
            conn.execute(text("""
                ALTER TABLE artifacts
                ADD COLUMN priority ENUM('urgent', 'high', 'medium', 'low') NULL
                AFTER status
            """))
            conn.commit()
            print("Added 'priority' column to artifacts table.")

        print("Migration complete.")


if __name__ == "__main__":
    run_migration()
