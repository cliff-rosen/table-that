#!/usr/bin/env python3
"""
Migration script to update research_streams record id=10 with semantic_space data.

This populates the semantic_space column with the comprehensive semantic space
structure generated from the existing stream schemas.
"""

import sys
import os
import json
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def update_stream_10_semantic_space():
    """Update stream_id=10 with semantic_space data"""

    # Read semantic_space.json
    specs_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), '_specs')
    semantic_space_path = os.path.join(specs_dir, 'semantic_space.json')

    logger.info(f"Reading semantic space from: {semantic_space_path}")

    with open(semantic_space_path, 'r') as f:
        semantic_space_data = json.load(f)

    with SessionLocal() as db:
        try:
            logger.info("Checking if stream_id=10 exists...")

            # Check if stream exists
            result = db.execute(text("""
                SELECT stream_id, stream_name
                FROM research_streams
                WHERE stream_id = 10
            """))
            stream = result.fetchone()

            if not stream:
                logger.error("Stream with id=10 does not exist!")
                return False

            logger.info(f"Found stream: {stream[1]}")

            # Update semantic_space column
            logger.info("Updating semantic_space column...")

            db.execute(
                text("""
                    UPDATE research_streams
                    SET semantic_space = :semantic_space,
                        updated_at = NOW()
                    WHERE stream_id = 10
                """),
                {"semantic_space": json.dumps(semantic_space_data)}
            )

            db.commit()
            logger.info("✓ Successfully updated stream_id=10 with semantic_space data")

            # Verify the update
            logger.info("\nVerifying update...")
            result = db.execute(text("""
                SELECT
                    stream_id,
                    stream_name,
                    JSON_LENGTH(semantic_space) as semantic_space_size,
                    JSON_EXTRACT(semantic_space, '$.domain.name') as domain_name,
                    JSON_LENGTH(semantic_space, '$.topics') as topic_count,
                    JSON_LENGTH(semantic_space, '$.entities') as entity_count
                FROM research_streams
                WHERE stream_id = 10
            """))

            verification = result.fetchone()
            if verification:
                logger.info(f"\nVerification:")
                logger.info(f"  Stream ID: {verification[0]}")
                logger.info(f"  Stream Name: {verification[1]}")
                logger.info(f"  Semantic Space Size: {verification[2]} top-level keys")
                logger.info(f"  Domain Name: {verification[3]}")
                logger.info(f"  Topics: {verification[4]}")
                logger.info(f"  Entities: {verification[5]}")

            return True

        except Exception as e:
            logger.error(f"Migration failed: {e}")
            import traceback
            traceback.print_exc()
            db.rollback()
            return False

if __name__ == "__main__":
    logger.info("=" * 60)
    logger.info("Update Stream 10 with Semantic Space Data")
    logger.info("=" * 60)

    success = update_stream_10_semantic_space()

    if success:
        logger.info("\n✓ Migration completed successfully!")
        logger.info("You can now navigate to /streams/10/edit to see the semantic space in action!")
        sys.exit(0)
    else:
        logger.error("\n✗ Migration failed!")
        sys.exit(1)
