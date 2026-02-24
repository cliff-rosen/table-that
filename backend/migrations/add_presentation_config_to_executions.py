"""
Migration: Add presentation_config to pipeline_executions

PipelineExecution now stores ALL configuration for each execution:
- retrieval_config (already added)
- presentation_config (this migration) - categories for article categorization

This completes the design where PipelineExecution is the single source of truth
for all execution configuration. run_pipeline reads ONLY from execution record.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add presentation_config column to pipeline_executions."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Checking pipeline_executions table...")

        # Check existing columns
        result = conn.execute(text("""
            SELECT COLUMN_NAME
            FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'pipeline_executions'
        """))
        existing_columns = [row[0] for row in result]
        print(f"  Existing columns: {existing_columns}")

        # Add presentation_config JSON column if not exists
        if 'presentation_config' not in existing_columns:
            print("  Adding presentation_config JSON column...")
            conn.execute(text("""
                ALTER TABLE pipeline_executions
                ADD COLUMN presentation_config JSON NULL
            """))
            print("  -> presentation_config column added")
        else:
            print("  presentation_config column already exists, skipping")

        conn.commit()
        print("\nMigration completed successfully!")
        print("\nSummary:")
        print("  - pipeline_executions: Added presentation_config JSON column")
        print("  - PipelineExecution now stores ALL execution configuration")
        print("  - run_pipeline reads ONLY from execution record (no stream config)")


if __name__ == "__main__":
    run_migration()
