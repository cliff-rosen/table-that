#!/usr/bin/env python3
"""
Migration script to add full_name field to the User table.

This script adds the full_name field to support storing user's full name
from the Knowledge Horizon onboarding process.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_add_full_name():
    """Add full_name field to user table."""

    with SessionLocal() as db:
        try:
            # Check if full_name column exists
            result = db.execute(text("""
                SELECT COUNT(*) as column_exists
                FROM information_schema.columns
                WHERE table_name = 'users'
                AND column_name = 'full_name'
                AND table_schema = DATABASE()
            """))

            full_name_exists = result.fetchone()[0] > 0

            if not full_name_exists:
                logger.info("Adding full_name column to users table...")

                db.execute(text("""
                    ALTER TABLE users
                    ADD COLUMN full_name VARCHAR(255) NULL
                """))
                db.commit()
                logger.info("full_name column added successfully")
            else:
                logger.info("full_name column already exists")

            # Show final table structure for full_name column
            result = db.execute(text("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                FROM information_schema.columns
                WHERE table_name = 'users'
                AND column_name = 'full_name'
                AND table_schema = DATABASE()
            """))

            logger.info("full_name column in users table:")
            for row in result:
                logger.info(f"  {row[0]}: {row[1]} (Nullable: {row[2]}, Default: {row[3]})")

        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise

        logger.info("Migration completed successfully")

if __name__ == "__main__":
    migrate_add_full_name()