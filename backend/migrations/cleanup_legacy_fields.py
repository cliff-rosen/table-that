#!/usr/bin/env python3
"""
Clean up all legacy fields and fix NULL purpose values
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def cleanup():
    """Remove legacy fields and fix NULL values"""
    db = SessionLocal()

    try:
        # 1. Fix NULL purpose values
        logger.info("Fixing NULL purpose values...")
        result = db.execute(text("""
            UPDATE research_streams
            SET purpose = CONCAT('Monitor ', stream_name)
            WHERE purpose IS NULL OR purpose = ''
        """))
        db.commit()
        logger.info(f"  Fixed {result.rowcount} NULL purpose values")

        # 2. Drop legacy fields
        logger.info("Dropping legacy fields...")
        legacy_fields = [
            "regulatory_bodies",
            "scientific_domains",
            "exclusions"
        ]

        for field in legacy_fields:
            logger.info(f"  Dropping {field}...")
            try:
                db.execute(text(f"""
                    ALTER TABLE research_streams
                    DROP COLUMN IF EXISTS {field}
                """))
                db.commit()
            except Exception as e:
                logger.warning(f"  Could not drop {field}: {e}")

        logger.info("Cleanup completed successfully!")

    except Exception as e:
        logger.error(f"Cleanup failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    cleanup()
