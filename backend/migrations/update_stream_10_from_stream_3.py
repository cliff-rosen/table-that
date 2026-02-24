#!/usr/bin/env python3
"""
Update stream_id 10 with semantic space from stream 3 (without synonyms)
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def update_stream_10():
    """Update stream 10 with stream 3 semantic space (removing synonyms from topics)"""

    # Read stream 3 semantic space
    spec_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), '_specs', 'stream 3 semantic space.json')
    logger.info(f"Reading semantic space from: {spec_path}")

    with open(spec_path, 'r', encoding='utf-8') as f:
        semantic_space = json.load(f)

    # Remove synonyms from all topics
    logger.info("Removing synonyms from topics...")
    for topic in semantic_space.get('topics', []):
        if 'synonyms' in topic:
            del topic['synonyms']
            logger.info(f"  Removed synonyms from topic: {topic['name']}")

    # Get the existing stream to preserve retrieval_config and presentation_config
    with engine.begin() as connection:
        logger.info("Fetching existing stream_id=10...")
        result = connection.execute(
            text("""
                SELECT retrieval_config, presentation_config
                FROM research_streams
                WHERE stream_id = 10
            """)
        )
        existing_stream = result.fetchone()

        if not existing_stream:
            logger.error("Stream 10 not found!")
            return

        retrieval_config = json.loads(existing_stream[0]) if existing_stream[0] else {}
        presentation_config = json.loads(existing_stream[1]) if existing_stream[1] else {}

        logger.info(f"Updating stream_id=10 with modified semantic space...")
        logger.info(f"  Topics count: {len(semantic_space.get('topics', []))}")
        logger.info(f"  Entities count: {len(semantic_space.get('entities', []))}")
        logger.info(f"  Relationships count: {len(semantic_space.get('relationships', []))}")

        # Update the stream
        connection.execute(
            text("""
                UPDATE research_streams
                SET
                    semantic_space = :semantic_space,
                    updated_at = NOW()
                WHERE stream_id = 10
            """),
            {
                "semantic_space": json.dumps(semantic_space)
            }
        )

        logger.info("✅ Successfully updated stream_id=10 with stream 3 semantic space (synonyms removed)")

        # Verify the update
        result = connection.execute(
            text("""
                SELECT
                    stream_name,
                    JSON_LENGTH(semantic_space, '$.topics') as topic_count,
                    JSON_LENGTH(semantic_space, '$.entities') as entity_count
                FROM research_streams
                WHERE stream_id = 10
            """)
        )
        verification = result.fetchone()
        logger.info(f"Verification - Stream: {verification[0]}, Topics: {verification[1]}, Entities: {verification[2]}")

if __name__ == "__main__":
    update_stream_10()
