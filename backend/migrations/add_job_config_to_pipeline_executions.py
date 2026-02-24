"""
Migration: Add job configuration columns to pipeline_executions

Adds columns for storing user-specified job parameters:
- job_start_date: Start date for retrieval (YYYY-MM-DD format)
- job_end_date: End date for retrieval (YYYY-MM-DD format)
- job_report_name: Custom report name
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add job config columns to pipeline_executions table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Adding job configuration columns to pipeline_executions table...")

        # Check if columns already exist
        result = conn.execute(text("""
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'pipeline_executions'
            AND COLUMN_NAME IN ('job_start_date', 'job_end_date', 'job_report_name')
        """))
        existing_columns = [row[0] for row in result]

        if 'job_start_date' not in existing_columns:
            print("  Adding job_start_date column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN job_start_date VARCHAR(10) NULL
            """))
        else:
            print("  job_start_date column already exists, skipping")

        if 'job_end_date' not in existing_columns:
            print("  Adding job_end_date column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN job_end_date VARCHAR(10) NULL
            """))
        else:
            print("  job_end_date column already exists, skipping")

        if 'job_report_name' not in existing_columns:
            print("  Adding job_report_name column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN job_report_name VARCHAR(255) NULL
            """))
        else:
            print("  job_report_name column already exists, skipping")

        conn.commit()
        print("\nMigration completed successfully!")
        print("Added columns: job_start_date, job_end_date, job_report_name")


if __name__ == "__main__":
    run_migration()
