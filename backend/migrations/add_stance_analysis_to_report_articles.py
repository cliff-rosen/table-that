"""
Migration: Add ai_enrichments column to report_article_associations table

This adds a JSON field to store AI-generated enrichments for each article
within a report context. This can include:
- Stance analysis (pro-defense, pro-plaintiff, etc.)
- Summaries
- Key insights
- Any other AI-generated content
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Add ai_enrichments column to report_article_associations table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if column already exists
        result = conn.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'report_article_associations'
            AND column_name = 'ai_enrichments'
        """))

        if result.fetchone():
            print("Column 'ai_enrichments' already exists in report_article_associations table")
            return

        # Add the column (use JSON for cross-database compatibility)
        print("Adding 'ai_enrichments' column to report_article_associations table...")
        conn.execute(text("""
            ALTER TABLE report_article_associations
            ADD COLUMN ai_enrichments JSON
        """))
        conn.commit()

        print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
