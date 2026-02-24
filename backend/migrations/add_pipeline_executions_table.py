"""
Migration: Add pipeline_executions table and refactor scheduling fields

This migration:
1. Creates pipeline_executions table to track all run attempts
2. Adds last_execution_id FK to research_streams
3. Removes redundant fields from research_streams (schedule_status, last_scheduled_run, last_schedule_error)
4. Adds FK constraints from reports and wip_articles to pipeline_executions

The pipeline_executions table becomes the single source of truth for execution state,
replacing the scattered fields on research_streams.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(text("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
    """), {"table_name": table_name})
    return result.fetchone() is not None


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone() is not None


def constraint_exists(conn, constraint_name: str) -> bool:
    """Check if a constraint exists."""
    result = conn.execute(text("""
        SELECT constraint_name
        FROM information_schema.table_constraints
        WHERE constraint_schema = DATABASE()
        AND constraint_name = :constraint_name
    """), {"constraint_name": constraint_name})
    return result.fetchone() is not None


def index_exists(conn, index_name: str) -> bool:
    """Check if an index exists."""
    result = conn.execute(text("""
        SELECT index_name
        FROM information_schema.statistics
        WHERE table_schema = DATABASE()
        AND index_name = :index_name
        LIMIT 1
    """), {"index_name": index_name})
    return result.fetchone() is not None


def run_migration():
    """Add pipeline_executions table and refactor scheduling."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting pipeline_executions migration...")

        # ============================================================
        # STEP 1: Create pipeline_executions table
        # ============================================================

        if not table_exists(conn, 'pipeline_executions'):
            print("Creating 'pipeline_executions' table...")
            conn.execute(text("""
                CREATE TABLE pipeline_executions (
                    id VARCHAR(36) PRIMARY KEY,
                    stream_id INT NOT NULL,
                    status ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
                    run_type ENUM('scheduled', 'manual', 'test') NOT NULL DEFAULT 'manual',
                    started_at DATETIME DEFAULT NULL,
                    completed_at DATETIME DEFAULT NULL,
                    error TEXT DEFAULT NULL,
                    report_id INT DEFAULT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    INDEX idx_executions_stream_id (stream_id),
                    INDEX idx_executions_status (status),
                    INDEX idx_executions_started_at (started_at),

                    CONSTRAINT fk_executions_stream
                        FOREIGN KEY (stream_id) REFERENCES research_streams(stream_id) ON DELETE CASCADE,
                    CONSTRAINT fk_executions_report
                        FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE SET NULL
                )
            """))
            print("Created 'pipeline_executions' table")
        else:
            print("Table 'pipeline_executions' already exists")

        # ============================================================
        # STEP 2: Add last_execution_id to research_streams
        # ============================================================

        if not column_exists(conn, 'research_streams', 'last_execution_id'):
            print("Adding 'last_execution_id' column to research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN last_execution_id VARCHAR(36) DEFAULT NULL
            """))
            # Add FK constraint
            if not constraint_exists(conn, 'fk_streams_last_execution'):
                conn.execute(text("""
                    ALTER TABLE research_streams
                    ADD CONSTRAINT fk_streams_last_execution
                        FOREIGN KEY (last_execution_id) REFERENCES pipeline_executions(id) ON DELETE SET NULL
                """))
            print("Added 'last_execution_id' with FK constraint")
        else:
            print("Column 'last_execution_id' already exists")

        # ============================================================
        # STEP 3: Remove redundant fields from research_streams
        # ============================================================

        # Remove schedule_status (now derived from last_execution.status)
        if column_exists(conn, 'research_streams', 'schedule_status'):
            print("Dropping 'schedule_status' column from research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams DROP COLUMN schedule_status
            """))
        else:
            print("Column 'schedule_status' already dropped")

        # Remove last_scheduled_run (now derived from last_execution.started_at)
        if column_exists(conn, 'research_streams', 'last_scheduled_run'):
            print("Dropping 'last_scheduled_run' column from research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams DROP COLUMN last_scheduled_run
            """))
        else:
            print("Column 'last_scheduled_run' already dropped")

        # Remove last_schedule_error (now derived from last_execution.error)
        if column_exists(conn, 'research_streams', 'last_schedule_error'):
            print("Dropping 'last_schedule_error' column from research_streams...")
            conn.execute(text("""
                ALTER TABLE research_streams DROP COLUMN last_schedule_error
            """))
        else:
            print("Column 'last_schedule_error' already dropped")

        # ============================================================
        # STEP 4: Add FK from reports.pipeline_execution_id to pipeline_executions
        # ============================================================

        # Note: reports.pipeline_execution_id already exists as VARCHAR(36)
        # We just need to add the FK constraint
        if not constraint_exists(conn, 'fk_reports_pipeline_execution'):
            print("Adding FK constraint from reports.pipeline_execution_id to pipeline_executions...")
            # First, we need to handle any orphaned execution IDs
            # Insert placeholder executions for any existing reports with execution IDs
            conn.execute(text("""
                INSERT IGNORE INTO pipeline_executions (id, stream_id, status, run_type, completed_at, report_id)
                SELECT DISTINCT
                    r.pipeline_execution_id,
                    r.research_stream_id,
                    'completed',
                    r.run_type,
                    r.created_at,
                    r.report_id
                FROM reports r
                WHERE r.pipeline_execution_id IS NOT NULL
                AND r.pipeline_execution_id != ''
                AND NOT EXISTS (
                    SELECT 1 FROM pipeline_executions pe WHERE pe.id = r.pipeline_execution_id
                )
            """))

            # Now add the FK constraint
            conn.execute(text("""
                ALTER TABLE reports
                ADD CONSTRAINT fk_reports_pipeline_execution
                    FOREIGN KEY (pipeline_execution_id) REFERENCES pipeline_executions(id) ON DELETE SET NULL
            """))
            print("Added FK constraint to reports.pipeline_execution_id")
        else:
            print("FK constraint 'fk_reports_pipeline_execution' already exists")

        # ============================================================
        # STEP 5: Add FK from wip_articles.pipeline_execution_id to pipeline_executions
        # ============================================================

        if not constraint_exists(conn, 'fk_wip_articles_pipeline_execution'):
            print("Adding FK constraint from wip_articles.pipeline_execution_id to pipeline_executions...")
            # Insert placeholder executions for any orphaned WIP articles
            conn.execute(text("""
                INSERT IGNORE INTO pipeline_executions (id, stream_id, status, run_type)
                SELECT DISTINCT
                    w.pipeline_execution_id,
                    w.research_stream_id,
                    'completed',
                    'manual'
                FROM wip_articles w
                WHERE w.pipeline_execution_id IS NOT NULL
                AND w.pipeline_execution_id != ''
                AND NOT EXISTS (
                    SELECT 1 FROM pipeline_executions pe WHERE pe.id = w.pipeline_execution_id
                )
            """))

            # Now add the FK constraint
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD CONSTRAINT fk_wip_articles_pipeline_execution
                    FOREIGN KEY (pipeline_execution_id) REFERENCES pipeline_executions(id) ON DELETE CASCADE
            """))
            print("Added FK constraint to wip_articles.pipeline_execution_id")
        else:
            print("FK constraint 'fk_wip_articles_pipeline_execution' already exists")

        conn.commit()
        print("\nMigration completed successfully!")
        print("\nSummary:")
        print("  - Created pipeline_executions table")
        print("  - Added last_execution_id to research_streams")
        print("  - Removed schedule_status, last_scheduled_run, last_schedule_error from research_streams")
        print("  - Added FK constraints from reports and wip_articles to pipeline_executions")


if __name__ == "__main__":
    run_migration()
