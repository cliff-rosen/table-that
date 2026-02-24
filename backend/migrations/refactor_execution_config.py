"""
Migration: Refactor execution configuration

PipelineExecution is now the single source of truth for ALL execution configuration.
Reports no longer store input configuration (run_type, retrieval_params).

Changes to pipeline_executions:
- Add user_id (FK to users)
- Rename job_start_date → start_date
- Rename job_end_date → end_date
- Rename job_report_name → report_name
- Add retrieval_config (JSON snapshot of config at execution time)

Changes to reports:
- Drop run_type column (now in PipelineExecution)
- Drop retrieval_params column (now in PipelineExecution)
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Apply schema changes for execution config refactor."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # === PIPELINE_EXECUTIONS CHANGES ===
        print("Updating pipeline_executions table...")

        # Check existing columns
        result = conn.execute(text("""
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'pipeline_executions'
        """))
        existing_columns = [row[0] for row in result]
        print(f"  Existing columns: {existing_columns}")

        # Add user_id if not exists
        if 'user_id' not in existing_columns:
            print("  Adding user_id column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN user_id INT NULL
            """))
            # For existing records, try to get user_id from the stream
            print("  Populating user_id from streams for existing records...")
            conn.execute(text("""
                UPDATE pipeline_executions pe
                JOIN research_streams rs ON pe.stream_id = rs.stream_id
                SET pe.user_id = rs.user_id
                WHERE pe.user_id IS NULL
            """))
            # Add FK constraint and make NOT NULL
            print("  Adding FK constraint...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD CONSTRAINT fk_pipeline_execution_user
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            """))
        else:
            print("  user_id column already exists, skipping")

        # Rename job_start_date to start_date if needed
        if 'job_start_date' in existing_columns and 'start_date' not in existing_columns:
            print("  Renaming job_start_date -> start_date...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                CHANGE COLUMN job_start_date start_date VARCHAR(10) NULL
            """))
        elif 'start_date' not in existing_columns:
            print("  Adding start_date column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN start_date VARCHAR(10) NULL
            """))
        else:
            print("  start_date column already exists, skipping")

        # Rename job_end_date to end_date if needed
        if 'job_end_date' in existing_columns and 'end_date' not in existing_columns:
            print("  Renaming job_end_date -> end_date...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                CHANGE COLUMN job_end_date end_date VARCHAR(10) NULL
            """))
        elif 'end_date' not in existing_columns:
            print("  Adding end_date column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN end_date VARCHAR(10) NULL
            """))
        else:
            print("  end_date column already exists, skipping")

        # Rename job_report_name to report_name if needed
        if 'job_report_name' in existing_columns and 'report_name' not in existing_columns:
            print("  Renaming job_report_name -> report_name...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                CHANGE COLUMN job_report_name report_name VARCHAR(255) NULL
            """))
        elif 'report_name' not in existing_columns:
            print("  Adding report_name column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN report_name VARCHAR(255) NULL
            """))
        else:
            print("  report_name column already exists, skipping")

        # Add retrieval_config JSON column if not exists
        if 'retrieval_config' not in existing_columns:
            print("  Adding retrieval_config JSON column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN retrieval_config JSON NULL
            """))
        else:
            print("  retrieval_config column already exists, skipping")

        # === REPORTS CHANGES ===
        print("\nUpdating reports table...")

        # Check existing columns in reports
        result = conn.execute(text("""
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'reports'
        """))
        report_columns = [row[0] for row in result]
        print(f"  Existing columns: {report_columns}")

        # Note: We're NOT dropping run_type and retrieval_params from existing data
        # because that would destroy historical data. Instead, we just stop using them.
        # The model changes will ignore these columns.
        # If you want to drop them, uncomment below:

        # if 'run_type' in report_columns:
        #     print("  Dropping run_type column...")
        #     conn.execute(text("""
        #         ALTER TABLE reports
        #         DROP COLUMN run_type
        #     """))

        # if 'retrieval_params' in report_columns:
        #     print("  Dropping retrieval_params column...")
        #     conn.execute(text("""
        #         ALTER TABLE reports
        #         DROP COLUMN retrieval_params
        #     """))

        print("  Keeping run_type and retrieval_params columns for historical data")
        print("  (Code changes will ignore these columns going forward)")

        conn.commit()
        print("\nMigration completed successfully!")
        print("\nSummary:")
        print("  - pipeline_executions: Added user_id, start_date, end_date, report_name, retrieval_config")
        print("  - reports: run_type and retrieval_params preserved but no longer used")


if __name__ == "__main__":
    run_migration()
