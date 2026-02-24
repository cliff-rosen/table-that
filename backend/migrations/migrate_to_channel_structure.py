#!/usr/bin/env python3
"""
Migration script to convert research_streams to channel-based structure.

Changes:
- Rename focus_areas to channels (JSONB)
- Remove description, business_goals, expected_outcomes, competitors, keywords
- Add workflow_config (JSONB, nullable)
- Migrate existing data to channel structure

Each channel has: {name, focus, type, keywords:[]}
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def migrate():
    """Run the migration"""
    db = SessionLocal()

    try:
        logger.info("Starting migration to channel-based structure...")

        # 1. Add new columns
        logger.info("Adding workflow_config column...")
        db.execute(text("""
            ALTER TABLE research_streams
            ADD COLUMN IF NOT EXISTS workflow_config JSON NULL
        """))
        db.commit()

        # 2. Add temporary channels column
        logger.info("Adding channels column...")
        db.execute(text("""
            ALTER TABLE research_streams
            ADD COLUMN IF NOT EXISTS channels JSON NULL
        """))
        db.commit()

        # 3. Migrate existing data to channels
        logger.info("Migrating existing streams to channel structure...")
        streams = db.execute(text("""
            SELECT
                stream_id,
                stream_name,
                stream_type,
                focus_areas,
                keywords,
                purpose
            FROM research_streams
            WHERE channels IS NULL
        """)).fetchall()

        for stream in streams:
            stream_id = stream.stream_id
            stream_type = stream.stream_type
            focus_areas = stream.focus_areas or []
            keywords = stream.keywords or []
            purpose = stream.purpose or ""

            # Create channels from focus_areas
            if focus_areas:
                channels = []
                for area in focus_areas:
                    channels.append({
                        "name": area,
                        "focus": f"Monitor {area} related to: {purpose}"[:200],
                        "type": stream_type,
                        "keywords": keywords  # Share keywords across all channels for now
                    })
            else:
                # No focus areas - create single channel from stream name
                channels = [{
                    "name": stream.stream_name,
                    "focus": purpose or f"Monitor {stream.stream_name}",
                    "type": stream_type,
                    "keywords": keywords
                }]

            db.execute(
                text("UPDATE research_streams SET channels = :channels WHERE stream_id = :stream_id"),
                {"channels": json.dumps(channels), "stream_id": stream_id}
            )
            logger.info(f"  Migrated stream {stream_id}: {len(channels)} channel(s)")

        db.commit()
        logger.info(f"Migrated {len(streams)} streams")

        # 4. Make channels NOT NULL (MySQL/MariaDB syntax)
        logger.info("Making channels column NOT NULL...")
        db.execute(text("""
            ALTER TABLE research_streams
            MODIFY COLUMN channels JSON NOT NULL
        """))
        db.commit()

        # 5. Drop old columns
        logger.info("Dropping old columns...")
        columns_to_drop = [
            "description",
            "business_goals",
            "expected_outcomes",
            "competitors",
            "keywords",
            "focus_areas"
        ]

        for col in columns_to_drop:
            logger.info(f"  Dropping {col}...")
            db.execute(text(f"""
                ALTER TABLE research_streams
                DROP COLUMN IF EXISTS {col}
            """))

        db.commit()

        logger.info("Migration completed successfully!")

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


def rollback():
    """Rollback the migration"""
    logger.warning("Rollback not fully implemented - would need to restore dropped columns from backup")
    # In practice, restore from database backup before running migration


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "rollback":
        rollback()
    else:
        migrate()
