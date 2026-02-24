"""
Migration: Add scheduling fields to research_streams and approval fields to reports

This migration:
1. Adds schedule_config (JSON), schedule_status, next_scheduled_run, last_scheduled_run,
   last_schedule_error to research_streams table
2. Adds approval_status, approved_by, approved_at, rejection_reason to reports table
3. Drops the deprecated report_frequency column from research_streams

Part of the scheduling system implementation.
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
        WHERE table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone() is not None


def run_migration():
    """Add scheduling and approval fields."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting scheduling and approval migration...")

        # ============================================================
        # RESEARCH_STREAMS: Add scheduling columns
        # ============================================================

        # 1. Add schedule_config (JSON)
        if not column_exists(conn, 'research_streams', 'schedule_config'):
            print("Adding 'schedule_config' column to research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN schedule_config JSON DEFAULT NULL
            """))
        else:
            print("Column 'schedule_config' already exists")

        # 2. Add schedule_status (ENUM)
        if not column_exists(conn, 'research_streams', 'schedule_status'):
            print("Adding 'schedule_status' column to research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN schedule_status ENUM('idle', 'queued', 'running', 'completed', 'failed') DEFAULT 'idle'
            """))
        else:
            print("Column 'schedule_status' already exists")

        # 3. Add next_scheduled_run (DATETIME)
        if not column_exists(conn, 'research_streams', 'next_scheduled_run'):
            print("Adding 'next_scheduled_run' column to research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN next_scheduled_run DATETIME DEFAULT NULL
            """))
            # Add index for efficient polling
            conn.execute(text("""
                CREATE INDEX idx_streams_next_scheduled_run ON research_streams(next_scheduled_run)
            """))
        else:
            print("Column 'next_scheduled_run' already exists")

        # 4. Add last_scheduled_run (DATETIME)
        if not column_exists(conn, 'research_streams', 'last_scheduled_run'):
            print("Adding 'last_scheduled_run' column to research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN last_scheduled_run DATETIME DEFAULT NULL
            """))
        else:
            print("Column 'last_scheduled_run' already exists")

        # 5. Add last_schedule_error (TEXT)
        if not column_exists(conn, 'research_streams', 'last_schedule_error'):
            print("Adding 'last_schedule_error' column to research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN last_schedule_error TEXT DEFAULT NULL
            """))
        else:
            print("Column 'last_schedule_error' already exists")

        # 6. Migrate report_frequency to schedule_config, then drop it
        if column_exists(conn, 'research_streams', 'report_frequency'):
            print("Migrating 'report_frequency' data to 'schedule_config'...")
            # Update streams that don't have schedule_config yet
            conn.execute(text("""
                UPDATE research_streams
                SET schedule_config = JSON_OBJECT(
                    'enabled', false,
                    'frequency', report_frequency,
                    'anchor_day', NULL,
                    'preferred_time', '08:00',
                    'timezone', 'UTC',
                    'lookback_days', NULL
                )
                WHERE schedule_config IS NULL
            """))

            print("Dropping 'report_frequency' column from research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams
                DROP COLUMN report_frequency
            """))
        else:
            print("Column 'report_frequency' already dropped")

        # ============================================================
        # REPORTS: Add approval columns
        # ============================================================

        # 1. Add approval_status (ENUM)
        if not column_exists(conn, 'reports', 'approval_status'):
            print("Adding 'approval_status' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN approval_status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending'
            """))
            # Add index for admin dashboard queries
            conn.execute(text("""
                CREATE INDEX idx_reports_approval_status ON reports(approval_status, created_at)
            """))
            # Set existing reports to 'approved' (they were created before approval workflow)
            print("Setting existing reports to 'approved' status...")
            conn.execute(text("""
                UPDATE reports SET approval_status = 'approved' WHERE approval_status = 'pending'
            """))
        else:
            print("Column 'approval_status' already exists")

        # 2. Add approved_by (FK to users)
        if not column_exists(conn, 'reports', 'approved_by'):
            print("Adding 'approved_by' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN approved_by INT DEFAULT NULL,
                ADD CONSTRAINT fk_reports_approved_by FOREIGN KEY (approved_by) REFERENCES users(user_id)
            """))
        else:
            print("Column 'approved_by' already exists")

        # 3. Add approved_at (DATETIME)
        if not column_exists(conn, 'reports', 'approved_at'):
            print("Adding 'approved_at' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN approved_at DATETIME DEFAULT NULL
            """))
        else:
            print("Column 'approved_at' already exists")

        # 4. Add rejection_reason (TEXT)
        if not column_exists(conn, 'reports', 'rejection_reason'):
            print("Adding 'rejection_reason' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN rejection_reason TEXT DEFAULT NULL
            """))
        else:
            print("Column 'rejection_reason' already exists")

        conn.commit()
        print("\nMigration completed successfully!")


if __name__ == "__main__":
    run_migration()
