#!/usr/bin/env python3
"""
Migration script to add Phase 1 enhancement fields to research_streams table.

This migration adds:
- purpose: Text field for stream purpose/objective
- business_goals: JSON array for strategic objectives
- expected_outcomes: Text field for expected outcomes
- scoring_config: JSON object for relevance scoring configuration

All fields are nullable for backwards compatibility with existing streams.
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

def add_phase1_fields():
    """Add Phase 1 enhancement fields to research_streams table"""

    with SessionLocal() as db:
        try:
            logger.info("Starting Phase 1 migration for research_streams...")

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

            # Add purpose column
            if not check_column_exists(db, 'research_streams', 'purpose'):
                logger.info("Adding 'purpose' column...")
                db.execute(text("""
                    ALTER TABLE research_streams
                    ADD COLUMN purpose TEXT NULL
                    COMMENT 'Why this stream exists - what decisions it will inform'
                """))
                logger.info("✓ Added 'purpose' column")
            else:
                logger.info("'purpose' column already exists")

            # Add business_goals column
            if not check_column_exists(db, 'research_streams', 'business_goals'):
                logger.info("Adding 'business_goals' column...")
                db.execute(text("""
                    ALTER TABLE research_streams
                    ADD COLUMN business_goals JSON NULL
                    COMMENT 'Strategic objectives this stream supports'
                """))
                logger.info("✓ Added 'business_goals' column")
            else:
                logger.info("'business_goals' column already exists")

            # Add expected_outcomes column
            if not check_column_exists(db, 'research_streams', 'expected_outcomes'):
                logger.info("Adding 'expected_outcomes' column...")
                db.execute(text("""
                    ALTER TABLE research_streams
                    ADD COLUMN expected_outcomes TEXT NULL
                    COMMENT 'What outcomes/decisions this intelligence will drive'
                """))
                logger.info("✓ Added 'expected_outcomes' column")
            else:
                logger.info("'expected_outcomes' column already exists")

            # Add scoring_config column
            if not check_column_exists(db, 'research_streams', 'scoring_config'):
                logger.info("Adding 'scoring_config' column...")
                db.execute(text("""
                    ALTER TABLE research_streams
                    ADD COLUMN scoring_config JSON NULL
                    COMMENT 'Relevance scoring and filtering configuration'
                """))
                logger.info("✓ Added 'scoring_config' column")
            else:
                logger.info("'scoring_config' column already exists")

            # Commit the changes
            db.commit()
            logger.info("✓ Phase 1 migration completed successfully!")

            # Verify columns were added
            logger.info("\nVerifying new columns...")
            result = db.execute(text("""
                SELECT
                    column_name,
                    data_type,
                    is_nullable
                FROM information_schema.columns
                WHERE table_name = 'research_streams'
                AND column_name IN ('purpose', 'business_goals', 'expected_outcomes', 'scoring_config')
                ORDER BY column_name
            """))

            columns = result.fetchall()
            if columns:
                logger.info("\nNew columns in research_streams:")
                for col in columns:
                    logger.info(f"  - {col[0]} ({col[1]}, nullable: {col[2]})")
            else:
                logger.warning("Could not verify new columns")

            return True

        except Exception as e:
            logger.error(f"Migration failed: {e}")
            db.rollback()
            return False

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Phase 1 Enhancement Migration for Research Streams")
    logger.info("=" * 60)

    success = add_phase1_fields()

    if success:
        logger.info("\n✓ Migration completed successfully!")
        sys.exit(0)
    else:
        logger.error("\n✗ Migration failed!")
        sys.exit(1)
