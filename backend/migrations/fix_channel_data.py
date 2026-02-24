#!/usr/bin/env python3
"""
Fix channel data from migration - convert types to lowercase and parse keywords
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


def fix_channels():
    """Fix channel data types and keywords"""
    db = SessionLocal()

    try:
        logger.info("Fixing channel data...")

        # Get all streams with channels
        streams = db.execute(text("""
            SELECT stream_id, channels
            FROM research_streams
            WHERE channels IS NOT NULL
        """)).fetchall()

        for stream in streams:
            stream_id = stream.stream_id
            channels_json = stream.channels

            # Parse channels (they're already JSON in the DB)
            if isinstance(channels_json, str):
                channels = json.loads(channels_json)
            else:
                channels = channels_json

            # Fix each channel
            fixed_channels = []
            for channel in channels:
                # Convert type to lowercase
                channel_type = channel.get('type', '').lower()

                # Parse keywords if it's a string
                keywords = channel.get('keywords', [])
                if isinstance(keywords, str):
                    try:
                        keywords = json.loads(keywords)
                    except:
                        keywords = [kw.strip() for kw in keywords.split(',') if kw.strip()]

                fixed_channels.append({
                    "name": channel.get('name', ''),
                    "focus": channel.get('focus', ''),
                    "type": channel_type,
                    "keywords": keywords
                })

            # Update the stream
            db.execute(
                text("UPDATE research_streams SET channels = :channels WHERE stream_id = :stream_id"),
                {"channels": json.dumps(fixed_channels), "stream_id": stream_id}
            )
            logger.info(f"  Fixed stream {stream_id}: {len(fixed_channels)} channel(s)")

        db.commit()
        logger.info(f"Fixed {len(streams)} streams")

    except Exception as e:
        logger.error(f"Fix failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    fix_channels()
