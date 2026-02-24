"""
Migration: Change scheduled_for from DATE to DATETIME

The email queue needs time-level granularity for send scheduling
(e.g., "send Tuesday at 08:00 AM") rather than just date-level.

Existing DATE values are preserved — MariaDB automatically converts
DATE to DATETIME by appending 00:00:00.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Change scheduled_for from DATE to DATETIME."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting scheduled_for migration...")

        # Check current column type
        result = conn.execute(text("""
            SELECT COLUMN_TYPE
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'report_email_queue'
            AND COLUMN_NAME = 'scheduled_for'
        """))
        row = result.fetchone()

        if not row:
            print("Column 'scheduled_for' not found — table may not exist yet.")
            return

        current_type = row[0].lower()
        print(f"Current type: {current_type}")

        if 'datetime' in current_type:
            print("Already DATETIME, nothing to do.")
            return

        # Alter column from DATE to DATETIME
        # MariaDB automatically converts DATE -> DATETIME by appending 00:00:00
        print("Altering scheduled_for from DATE to DATETIME...")
        conn.execute(text("""
            ALTER TABLE report_email_queue
            MODIFY COLUMN scheduled_for DATETIME NOT NULL
        """))

        conn.commit()
        print("Migration completed successfully!")
        print("  - scheduled_for changed from DATE to DATETIME")
        print("  - Existing values preserved with time set to 00:00:00")


if __name__ == "__main__":
    run_migration()
