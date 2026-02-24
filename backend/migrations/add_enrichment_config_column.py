#!/usr/bin/env python3
"""
Migration script to add enrichment_config column to research_streams table.

This migration adds the enrichment_config column which stores Layer 4 (Content Enrichment)
configuration - custom prompts for executive summaries, category summaries, etc.

The column is nullable and defaults to NULL (use system defaults).
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

def add_enrichment_config_column():
    """Add enrichment_config column to research_streams table"""

    with SessionLocal() as db:
        try:
            logger.info("Starting enrichment config migration for research_streams...")

            # Check if table exists
            result = db.execute(text("""
                SELECT COUNT(*) as table_exists
                FROM information_schema.tables
                WHERE table_name = 'research_streams'
                AND table_schema = DATABASE()
            """))
            if result.fetchone()[0] == 0:
                logger.error("research_streams table does not exist!")
                return False

            # Add enrichment_config column
            if not check_column_exists(db, 'research_streams', 'enrichment_config'):
                logger.info("Adding 'enrichment_config' column...")
                db.execute(text("""
                    ALTER TABLE research_streams
                    ADD COLUMN enrichment_config JSON NULL
                    COMMENT 'Layer 4: Content enrichment configuration - custom prompts for summaries'
                """))
                logger.info("✓ Added 'enrichment_config' column")
            else:
                logger.info("'enrichment_config' column already exists")

            # Commit the changes
            db.commit()
            logger.info("✓ Enrichment config migration completed successfully!")

            # Verify column was added
            logger.info("\nVerifying new column...")
            result = db.execute(text("""
                SELECT
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_name = 'research_streams'
                AND column_name = 'enrichment_config'
            """))

            column = result.fetchone()
            if column:
                logger.info(f"\nNew column in research_streams:")
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
    logger.info("Enrichment Config Column Migration for Research Streams")
    logger.info("=" * 60)

    success = add_enrichment_config_column()

    if success:
        logger.info("\n✓ Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("\n✗ Migration failed!")
        sys.exit(1)
