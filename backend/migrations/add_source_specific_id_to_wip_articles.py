#!/usr/bin/env python3
"""
Migration script to add source_specific_id column to wip_articles table.

This migration adds the source_specific_id column which stores the source-specific
identifier for articles (e.g., PubMed ID, Semantic Scholar ID, etc.).
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

def add_source_specific_id_column():
    """Add source_specific_id column to wip_articles table"""

    with SessionLocal() as db:
        try:
            logger.info("Starting source_specific_id migration for wip_articles...")

            # Check if table exists
            result = db.execute(text("""
                SELECT COUNT(*) as table_exists
                FROM information_schema.tables
                WHERE table_name = 'wip_articles'
                AND table_schema = DATABASE()
            """))
            if result.fetchone()[0] == 0:
                logger.error("wip_articles table does not exist!")
                return False

            # Add source_specific_id column
            if not check_column_exists(db, 'wip_articles', 'source_specific_id'):
                logger.info("Adding 'source_specific_id' column...")
                db.execute(text("""
                    ALTER TABLE wip_articles
                    ADD COLUMN source_specific_id VARCHAR(255) NULL,
                    ADD INDEX idx_wip_articles_source_specific_id (source_specific_id)
                """))
                logger.info("✓ Added 'source_specific_id' column with index")
            else:
                logger.info("'source_specific_id' column already exists")

            # Commit the changes
            db.commit()
            logger.info("✓ source_specific_id migration completed successfully!")

            # Verify column was added
            logger.info("\nVerifying new column...")
            result = db.execute(text("""
                SELECT
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_name = 'wip_articles'
                AND column_name = 'source_specific_id'
            """))

            column = result.fetchone()
            if column:
                logger.info(f"\nNew column in wip_articles:")
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
    logger.info("Source Specific ID Column Migration for WIP Articles")
    logger.info("=" * 60)

    success = add_source_specific_id_column()

    if success:
        logger.info("\n✓ Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("\n✗ Migration failed!")
        sys.exit(1)
