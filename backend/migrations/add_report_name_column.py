#!/usr/bin/env python3
"""
Migration to add report_name column to reports table

This migration adds a report_name column (VARCHAR) to the reports table.
For existing reports, it sets the report_name to the report_date in YYYY.MM.DD format.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from config import settings
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migration():
    """Add report_name column to reports table"""

    # Create engine
    engine = create_engine(settings.DATABASE_URL)

    try:
        with engine.connect() as connection:
            # Check if the table exists
            result = connection.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_name = 'reports'
            """))

            table_exists = result.scalar() > 0

            if not table_exists:
                logger.info("reports table does not exist yet. Skipping migration.")
                return

            # Check if the column already exists
            result = connection.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_name = 'reports'
                AND column_name = 'report_name'
            """))

            column_exists = result.scalar() > 0

            if column_exists:
                logger.info("report_name column already exists. Migration not needed.")
                return

            # Add the report_name column (initially nullable)
            logger.info("Adding report_name column to reports table...")

            connection.execute(text("""
                ALTER TABLE reports
                ADD COLUMN report_name VARCHAR(255);
            """))

            connection.commit()
            logger.info("Successfully added report_name column.")

            # Update existing reports with default name based on report_date
            logger.info("Setting default report_name for existing reports...")

            connection.execute(text("""
                UPDATE reports
                SET report_name = TO_CHAR(report_date, 'YYYY.MM.DD')
                WHERE report_name IS NULL;
            """))

            connection.commit()
            logger.info("Successfully set default report_name for existing reports.")

            # Make the column NOT NULL now that all rows have values
            logger.info("Making report_name column NOT NULL...")

            connection.execute(text("""
                ALTER TABLE reports
                MODIFY COLUMN report_name VARCHAR(255) NOT NULL;
            """))

            connection.commit()
            logger.info("Successfully made report_name column NOT NULL.")

            # Verify the column was added
            result = connection.execute(text("""
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns
                WHERE table_name = 'reports'
                AND column_name = 'report_name';
            """))

            column_info = result.fetchone()
            if column_info:
                logger.info(f"Verified: {column_info[0]} column added with type {column_info[1]}, nullable={column_info[2]}")
            else:
                logger.error("Failed to verify column addition")

            # Show count of updated reports
            result = connection.execute(text("""
                SELECT COUNT(*) FROM reports WHERE report_name IS NOT NULL;
            """))
            count = result.scalar()
            logger.info(f"Total reports with report_name set: {count}")

    except ProgrammingError as e:
        logger.error(f"Database error during migration: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during migration: {e}")
        raise

if __name__ == "__main__":
    logger.info("Starting report_name column migration...")
    run_migration()
    logger.info("Migration completed successfully!")
