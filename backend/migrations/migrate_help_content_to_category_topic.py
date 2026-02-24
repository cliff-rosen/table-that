"""
Migration: Update help_content_override table schema

Changes the help_content_override table from using a single section_id
column to using separate category and topic columns as a composite primary key.

Old schema:
  - section_id (VARCHAR, PK) - e.g., "reports/overview"
  - content (TEXT)
  - updated_at (TIMESTAMP)
  - updated_by (INTEGER)

New schema:
  - category (VARCHAR(50), PK) - e.g., "reports"
  - topic (VARCHAR(50), PK) - e.g., "overview"
  - content (TEXT)
  - updated_at (TIMESTAMP)
  - updated_by (INTEGER)
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Migrate help_content_override to category/topic schema."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if table exists
        result = conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'help_content_override'
        """))

        if not result.fetchone():
            # Table doesn't exist - create it with new schema
            print("Creating 'help_content_override' table with new schema...")
            conn.execute(text("""
                CREATE TABLE help_content_override (
                    category VARCHAR(50) NOT NULL,
                    topic VARCHAR(50) NOT NULL,
                    content TEXT NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by INTEGER REFERENCES users(user_id),
                    PRIMARY KEY (category, topic)
                )
            """))
            conn.commit()
            print("Table created with category/topic schema.")
            return

        # Check if table already has new schema (category column exists)
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'help_content_override' AND column_name = 'category'
        """))

        if result.fetchone():
            print("Table already has category/topic schema. No migration needed.")
            return

        # Check if old schema exists (section_id column)
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'help_content_override' AND column_name = 'section_id'
        """))

        if not result.fetchone():
            print("Table exists but has unexpected schema. Manual intervention required.")
            return

        # Migrate from old schema to new schema
        print("Migrating help_content_override from section_id to category/topic schema...")

        # Get existing data
        result = conn.execute(text("""
            SELECT section_id, content, updated_at, updated_by
            FROM help_content_override
        """))
        rows = result.fetchall()
        print(f"Found {len(rows)} existing override(s) to migrate.")

        # Create new table with correct schema
        print("Creating temporary table with new schema...")
        conn.execute(text("""
            CREATE TABLE help_content_override_new (
                category VARCHAR(50) NOT NULL,
                topic VARCHAR(50) NOT NULL,
                content TEXT NOT NULL,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_by INTEGER REFERENCES users(user_id),
                PRIMARY KEY (category, topic)
            )
        """))
        conn.commit()

        # Migrate data
        for section_id, content, updated_at, updated_by in rows:
            # Parse section_id into category/topic
            parts = section_id.split('/', 1)
            if len(parts) == 2:
                category, topic = parts
            else:
                # Fallback for malformed IDs
                category = 'general'
                topic = parts[0]

            conn.execute(text("""
                INSERT INTO help_content_override_new (category, topic, content, updated_at, updated_by)
                VALUES (:category, :topic, :content, :updated_at, :updated_by)
            """), {
                "category": category,
                "topic": topic,
                "content": content,
                "updated_at": updated_at,
                "updated_by": updated_by
            })
            print(f"  Migrated: {section_id} -> category='{category}', topic='{topic}'")

        conn.commit()

        # Swap tables
        print("Swapping tables...")
        conn.execute(text("DROP TABLE help_content_override"))
        conn.execute(text("ALTER TABLE help_content_override_new RENAME TO help_content_override"))
        conn.commit()

        print(f"Migration completed. Migrated {len(rows)} override(s).")


if __name__ == "__main__":
    run_migration()
