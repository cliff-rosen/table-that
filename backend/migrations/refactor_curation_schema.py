"""
Migration: Refactor curation schema for clearer ownership

Changes to ReportArticleAssociation:
- ADD: wip_article_id (nullable FK to wip_articles) - direct link back to pipeline data
- RENAME: curator_excluded -> is_hidden (clearer semantic meaning)
- DROP: curation_notes (use WipArticle.curation_notes as single source of truth)
- DROP: curated_by (use WipArticle.curated_by as single source of truth)
- DROP: curated_at (use WipArticle.curated_at as single source of truth)

Changes to WipArticle:
- DROP: presentation_categories (now only on ReportArticleAssociation)

Pipeline flow after this change:
1. Pipeline creates Report with bare associations (no categories/summaries)
2. Categorization stage writes categories directly to ReportArticleAssociation
3. Summarization stage writes ai_summary directly to ReportArticleAssociation

This clarifies ownership:
- WipArticle: Pipeline processing data + curation audit trail (why decisions were made)
- ReportArticleAssociation: How article appears in a specific report (ranking, categories, visibility, summaries)
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


def index_exists(conn, table_name: str, index_name: str) -> bool:
    """Check if an index exists (MySQL compatible)."""
    result = conn.execute(text("""
        SELECT INDEX_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = :table_name
        AND INDEX_NAME = :index_name
    """), {"table_name": table_name, "index_name": index_name})
    return result.fetchone() is not None


def run_migration():
    """Refactor curation schema."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting curation schema refactor migration...")

        # ========================================
        # ReportArticleAssociation changes
        # ========================================

        # 1. Add wip_article_id column
        if not column_exists(conn, 'report_article_associations', 'wip_article_id'):
            print("Adding 'wip_article_id' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN wip_article_id INTEGER NULL,
                ADD INDEX idx_report_article_associations_wip_article_id (wip_article_id),
                ADD CONSTRAINT fk_report_article_wip_article
                    FOREIGN KEY (wip_article_id) REFERENCES wip_articles(id) ON DELETE SET NULL
            """))
        else:
            print("Column 'wip_article_id' already exists")

        # 2. Rename curator_excluded to is_hidden
        if column_exists(conn, 'report_article_associations', 'curator_excluded'):
            if not column_exists(conn, 'report_article_associations', 'is_hidden'):
                print("Renaming 'curator_excluded' to 'is_hidden' in report_article_associations...")
                conn.execute(text("""
                    ALTER TABLE report_article_associations
                    CHANGE COLUMN curator_excluded is_hidden BOOLEAN NOT NULL DEFAULT FALSE
                """))
            else:
                print("Column 'is_hidden' already exists, dropping 'curator_excluded'...")
                conn.execute(text("""
                    ALTER TABLE report_article_associations
                    DROP COLUMN curator_excluded
                """))
        else:
            print("Column 'curator_excluded' does not exist (already renamed or dropped)")

        # 3. Drop curation_notes (data preserved in wip_articles)
        if column_exists(conn, 'report_article_associations', 'curation_notes'):
            print("Dropping 'curation_notes' from report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                DROP COLUMN curation_notes
            """))
        else:
            print("Column 'curation_notes' already dropped")

        # 4. Drop curated_by (data preserved in wip_articles)
        if column_exists(conn, 'report_article_associations', 'curated_by'):
            print("Dropping 'curated_by' from report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                DROP COLUMN curated_by
            """))
        else:
            print("Column 'curated_by' already dropped")

        # 5. Drop curated_at (data preserved in wip_articles)
        if column_exists(conn, 'report_article_associations', 'curated_at'):
            print("Dropping 'curated_at' from report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                DROP COLUMN curated_at
            """))
        else:
            print("Column 'curated_at' already dropped")

        # ========================================
        # WipArticle changes
        # ========================================

        # Drop presentation_categories from wip_articles (now only on ReportArticleAssociation)
        if column_exists(conn, 'wip_articles', 'presentation_categories'):
            print("Dropping 'presentation_categories' from wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                DROP COLUMN presentation_categories
            """))
        else:
            print("Column 'presentation_categories' already dropped from wip_articles")

        conn.commit()
        print("\nCuration schema refactor migration completed successfully!")
        print("""
Summary of changes:
- report_article_associations.wip_article_id: Added (nullable FK)
- report_article_associations.curator_excluded: Renamed to is_hidden
- report_article_associations.curation_notes: Dropped (use wip_articles)
- report_article_associations.curated_by: Dropped (use wip_articles)
- report_article_associations.curated_at: Dropped (use wip_articles)
- wip_articles.presentation_categories: Dropped (now only on ReportArticleAssociation)
        """)


if __name__ == "__main__":
    run_migration()
