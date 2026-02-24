"""
Migration: Add curation flags to ReportArticleAssociation

Adds:
- curator_excluded: Flag to hide article from report view (instead of deleting)
- curator_added: Flag to indicate curator added this (vs pipeline added)

This allows undo operations to preserve all article data.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def column_exists(conn, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = conn.execute(text("""
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone() is not None


def run_migration():
    """Add curation flags to report_article_associations."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting association curation flags migration...")

        # 1. Add curator_excluded
        if not column_exists(conn, 'report_article_associations', 'curator_excluded'):
            print("Adding 'curator_excluded' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN curator_excluded BOOLEAN NOT NULL DEFAULT FALSE
            """))
        else:
            print("Column 'curator_excluded' already exists")

        # 2. Add curator_added
        if not column_exists(conn, 'report_article_associations', 'curator_added'):
            print("Adding 'curator_added' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN curator_added BOOLEAN NOT NULL DEFAULT FALSE
            """))
        else:
            print("Column 'curator_added' already exists")

        # 3. Add index for efficient filtering of visible articles
        print("Adding index for curator_excluded filtering...")
        try:
            conn.execute(text("""
                CREATE INDEX idx_report_articles_visible
                ON report_article_associations (report_id, curator_excluded)
            """))
        except Exception as e:
            if "Duplicate key name" in str(e) or "already exists" in str(e).lower():
                print("Index 'idx_report_articles_visible' already exists")
            else:
                raise

        conn.commit()
        print("\nAssociation curation flags migration completed successfully!")


if __name__ == "__main__":
    run_migration()
