#!/usr/bin/env python3
"""
Migration script to add semantic_space column to research_streams table.

This migration adds the semantic_space column which stores Layer 1 (Semantic Space)
of the three-layer architecture - the canonical, source-agnostic representation
of what information matters.

The column is nullable for backwards compatibility with existing streams.
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

def add_semantic_space_column():
    """Add semantic_space column to research_streams table"""

    with SessionLocal() as db:
        try:
            logger.info("Starting semantic space migration for research_streams...")

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

            # Add semantic_space column
            if not check_column_exists(db, 'research_streams', 'semantic_space'):
                logger.info("Adding 'semantic_space' column...")
                db.execute(text("""
                    ALTER TABLE research_streams
                    ADD COLUMN semantic_space JSON NULL
                    COMMENT 'Layer 1: Semantic space - canonical, source-agnostic information space definition'
                """))
                logger.info("✓ Added 'semantic_space' column")
            else:
                logger.info("'semantic_space' column already exists")

            # Commit the changes
            db.commit()
            logger.info("✓ Semantic space migration completed successfully!")

            # Verify column was added
            logger.info("\nVerifying new column...")
            result = db.execute(text("""
                SELECT
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_name = 'research_streams'
                AND column_name = 'semantic_space'
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
    logger.info("Semantic Space Column Migration for Research Streams")
    logger.info("=" * 60)

    success = add_semantic_space_column()

    if success:
        logger.info("\n✓ Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("\n✗ Migration failed!")
        sys.exit(1)
