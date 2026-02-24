"""
Migration: Add chat_config table

Unified chat configuration storage for:
- Stream-specific instructions (scope='stream', scope_key=stream_id)
- Page-specific identity/persona (scope='page', scope_key=page_name)
- Global defaults (scope='global', scope_key='default')

This replaces the fragmented approach of:
- research_streams.chat_instructions (stream-specific)
- page_identities table (page-specific)
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Create chat_config table and migrate existing data."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if table already exists
        result = conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'chat_config'
        """))

        if result.fetchone():
            print("Table 'chat_config' already exists")
        else:
            # Create the table
            print("Creating 'chat_config' table...")
            conn.execute(text("""
                CREATE TABLE chat_config (
                    scope VARCHAR(20) NOT NULL,
                    scope_key VARCHAR(100) NOT NULL,
                    identity TEXT,
                    instructions TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by INTEGER REFERENCES users(user_id),
                    PRIMARY KEY (scope, scope_key)
                )
            """))
            conn.commit()
            print("Table created.")

        # Migrate existing stream chat_instructions
        print("Migrating stream chat instructions...")
        result = conn.execute(text("""
            SELECT stream_id, chat_instructions
            FROM research_streams
            WHERE chat_instructions IS NOT NULL AND chat_instructions != ''
        """))
        streams = result.fetchall()

        for stream_id, instructions in streams:
            # Check if already migrated
            existing = conn.execute(text("""
                SELECT 1 FROM chat_config
                WHERE scope = 'stream' AND scope_key = :key
            """), {"key": str(stream_id)}).fetchone()

            if not existing:
                conn.execute(text("""
                    INSERT INTO chat_config (scope, scope_key, instructions)
                    VALUES ('stream', :key, :instructions)
                """), {"key": str(stream_id), "instructions": instructions})
                print(f"  Migrated stream {stream_id}")

        conn.commit()
        print(f"Migrated {len(streams)} stream instructions.")

        # Migrate existing page_identities if table exists
        result = conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'page_identities'
        """))

        if result.fetchone():
            print("Migrating page identities...")
            result = conn.execute(text("""
                SELECT page, identity
                FROM page_identities
                WHERE identity IS NOT NULL
            """))
            pages = result.fetchall()

            for page, identity in pages:
                # Check if already migrated
                existing = conn.execute(text("""
                    SELECT 1 FROM chat_config
                    WHERE scope = 'page' AND scope_key = :key
                """), {"key": page}).fetchone()

                if not existing:
                    conn.execute(text("""
                        INSERT INTO chat_config (scope, scope_key, identity)
                        VALUES ('page', :key, :identity)
                    """), {"key": page, "identity": identity})
                    print(f"  Migrated page {page}")

            conn.commit()
            print(f"Migrated {len(pages)} page identities.")

            # Drop old table
            print("Dropping page_identities table...")
            conn.execute(text("DROP TABLE page_identities"))
            conn.commit()

        print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
