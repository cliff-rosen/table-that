#!/usr/bin/env python3
"""
Migration script to add article_analysis_config column to pipeline_executions table.

This migration adds the article_analysis_config column which stores a snapshot of
the stance analysis prompt configuration at execution time.

The column is nullable and defaults to NULL (stance analysis disabled).
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_column_exists(db, table_name, column_name):
    """Check if a column exists in a table"""
    result = db.execute(text("""
        SELECT COUNT(*) as column_exists
        FROM information_schema.columns
        WHERE table_name = :table_name
        AND column_name = :column_name
        AND table_schema = DATABASE()
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone()[0] > 0

def add_article_analysis_config_to_executions():
    """Add article_analysis_config column to pipeline_executions table"""

    with SessionLocal() as db:
        try:
            logger.info("Starting article_analysis_config migration for pipeline_executions...")

            # Check if table exists
            result = db.execute(text("""
                SELECT COUNT(*) as table_exists
                FROM information_schema.tables
                WHERE table_name = 'pipeline_executions'
                AND table_schema = DATABASE()
            """))
            if result.fetchone()[0] == 0:
                logger.error("pipeline_executions table does not exist!")
                return False

            # Add article_analysis_config column
            if not check_column_exists(db, 'pipeline_executions', 'article_analysis_config'):
                logger.info("Adding 'article_analysis_config' column...")
                db.execute(text("""
                    ALTER TABLE pipeline_executions
                    ADD COLUMN article_analysis_config JSON NULL
                    COMMENT 'Snapshot of stance analysis config at execution time'
                """))
                logger.info("Added 'article_analysis_config' column")
            else:
                logger.info("'article_analysis_config' column already exists")

            # Commit the changes
            db.commit()
            logger.info("article_analysis_config migration completed successfully!")

            # Verify column was added
            logger.info("\nVerifying new column...")
            result = db.execute(text("""
                SELECT
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_name = 'pipeline_executions'
                AND column_name = 'article_analysis_config'
            """))

            column = result.fetchone()
            if column:
                logger.info(f"\nNew column in pipeline_executions:")
                logger.info(f"  - {column[0]} ({column[1]}, nullable: {column[2]})")
            else:
                logger.warning("Could not verify new column")

            return True

        except Exception as e:
            logger.error(f"Migration failed: {e}")
            db.rollback()
            return False

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Article Analysis Config Column Migration for Pipeline Executions")
    logger.info("=" * 60)

    success = add_article_analysis_config_to_executions()

    if success:
        logger.info("\nMigration completed successfully!")
        sys.exit(0)
    else:
        logger.error("\nMigration failed!")
        sys.exit(1)
