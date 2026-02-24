"""
Migration: Add curation fields for report approval workflow

This migration adds:
1. Report table: original values and curation tracking
2. ReportArticleAssociation table: original values for comparison, AI summary editing
3. WipArticle table: curator override fields for audit trail
4. CurationEvent table: audit trail for all curation actions

See docs/_specs/article-curation-flow.md for full state transition documentation.
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


def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(text("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_name = :table_name
    """), {"table_name": table_name})
    return result.fetchone() is not None


def run_migration():
    """Add curation fields to reports, associations, and wip_articles."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting curation fields migration...")

        # ============================================================
        # REPORTS: Add curation tracking columns
        # ============================================================

        # 1. Add original_report_name
        if not column_exists(conn, 'reports', 'original_report_name'):
            print("Adding 'original_report_name' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN original_report_name VARCHAR(255) DEFAULT NULL
            """))
            # Set existing reports' original_report_name to current report_name
            conn.execute(text("""
                UPDATE reports SET original_report_name = report_name
                WHERE original_report_name IS NULL
            """))
        else:
            print("Column 'original_report_name' already exists")

        # 2. Add original_enrichments
        if not column_exists(conn, 'reports', 'original_enrichments'):
            print("Adding 'original_enrichments' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN original_enrichments JSON DEFAULT NULL
            """))
            # Set existing reports' original_enrichments to current enrichments
            conn.execute(text("""
                UPDATE reports SET original_enrichments = enrichments
                WHERE original_enrichments IS NULL
            """))
        else:
            print("Column 'original_enrichments' already exists")

        # 3. Add has_curation_edits
        if not column_exists(conn, 'reports', 'has_curation_edits'):
            print("Adding 'has_curation_edits' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN has_curation_edits BOOLEAN DEFAULT FALSE
            """))
        else:
            print("Column 'has_curation_edits' already exists")

        # 4. Add last_curated_by
        if not column_exists(conn, 'reports', 'last_curated_by'):
            print("Adding 'last_curated_by' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN last_curated_by INT DEFAULT NULL,
                ADD CONSTRAINT fk_reports_last_curated_by FOREIGN KEY (last_curated_by) REFERENCES users(user_id)
            """))
        else:
            print("Column 'last_curated_by' already exists")

        # 5. Add last_curated_at
        if not column_exists(conn, 'reports', 'last_curated_at'):
            print("Adding 'last_curated_at' column to reports...")
            conn.execute(text("""
                ALTER TABLE reports
                ADD COLUMN last_curated_at DATETIME DEFAULT NULL
            """))
        else:
            print("Column 'last_curated_at' already exists")

        # ============================================================
        # REPORT_ARTICLE_ASSOCIATIONS: Add curation columns
        # (Only for articles IN the report - tracking edits)
        # ============================================================

        # 1. Add original_presentation_categories
        if not column_exists(conn, 'report_article_associations', 'original_presentation_categories'):
            print("Adding 'original_presentation_categories' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN original_presentation_categories JSON DEFAULT NULL
            """))
            # Copy current categories as original
            conn.execute(text("""
                UPDATE report_article_associations SET original_presentation_categories = presentation_categories
                WHERE original_presentation_categories IS NULL
            """))
        else:
            print("Column 'original_presentation_categories' already exists")

        # 2. Add original_ranking
        if not column_exists(conn, 'report_article_associations', 'original_ranking'):
            print("Adding 'original_ranking' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN original_ranking INT DEFAULT NULL
            """))
            # Copy current ranking as original
            conn.execute(text("""
                UPDATE report_article_associations SET original_ranking = ranking
                WHERE original_ranking IS NULL
            """))
        else:
            print("Column 'original_ranking' already exists")

        # 3. Add ai_summary
        if not column_exists(conn, 'report_article_associations', 'ai_summary'):
            print("Adding 'ai_summary' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN ai_summary TEXT DEFAULT NULL
            """))
        else:
            print("Column 'ai_summary' already exists")

        # 4. Add original_ai_summary
        if not column_exists(conn, 'report_article_associations', 'original_ai_summary'):
            print("Adding 'original_ai_summary' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN original_ai_summary TEXT DEFAULT NULL
            """))
        else:
            print("Column 'original_ai_summary' already exists")

        # 5. Add curation_notes
        if not column_exists(conn, 'report_article_associations', 'curation_notes'):
            print("Adding 'curation_notes' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN curation_notes TEXT DEFAULT NULL
            """))
        else:
            print("Column 'curation_notes' already exists")

        # 6. Add curated_by
        if not column_exists(conn, 'report_article_associations', 'curated_by'):
            print("Adding 'curated_by' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN curated_by INT DEFAULT NULL
            """))
        else:
            print("Column 'curated_by' already exists")

        # 7. Add curated_at
        if not column_exists(conn, 'report_article_associations', 'curated_at'):
            print("Adding 'curated_at' column to report_article_associations...")
            conn.execute(text("""
                ALTER TABLE report_article_associations
                ADD COLUMN curated_at DATETIME DEFAULT NULL
            """))
        else:
            print("Column 'curated_at' already exists")

        # ============================================================
        # WIP_ARTICLES: Add curation override fields
        # (Audit trail for curator decisions)
        # ============================================================

        # 1. Add duplicate_of_pmid
        if not column_exists(conn, 'wip_articles', 'duplicate_of_pmid'):
            print("Adding 'duplicate_of_pmid' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN duplicate_of_pmid VARCHAR(20) DEFAULT NULL
            """))
        else:
            print("Column 'duplicate_of_pmid' already exists")

        # 2. Add filter_score
        if not column_exists(conn, 'wip_articles', 'filter_score'):
            print("Adding 'filter_score' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN filter_score FLOAT DEFAULT NULL
            """))
        else:
            print("Column 'filter_score' already exists")

        # 2b. Rename filter_rejection_reason to filter_score_reason
        if column_exists(conn, 'wip_articles', 'filter_rejection_reason') and not column_exists(conn, 'wip_articles', 'filter_score_reason'):
            print("Renaming 'filter_rejection_reason' to 'filter_score_reason' in wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                CHANGE COLUMN filter_rejection_reason filter_score_reason TEXT DEFAULT NULL
            """))
        elif not column_exists(conn, 'wip_articles', 'filter_score_reason'):
            print("Adding 'filter_score_reason' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN filter_score_reason TEXT DEFAULT NULL
            """))
        else:
            print("Column 'filter_score_reason' already exists")

        # 3. Add curator_included
        if not column_exists(conn, 'wip_articles', 'curator_included'):
            print("Adding 'curator_included' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN curator_included BOOLEAN DEFAULT FALSE
            """))
        else:
            print("Column 'curator_included' already exists")

        # 4. Add curator_excluded
        if not column_exists(conn, 'wip_articles', 'curator_excluded'):
            print("Adding 'curator_excluded' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN curator_excluded BOOLEAN DEFAULT FALSE
            """))
        else:
            print("Column 'curator_excluded' already exists")

        # 5. Add curation_notes
        if not column_exists(conn, 'wip_articles', 'curation_notes'):
            print("Adding 'curation_notes' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN curation_notes TEXT DEFAULT NULL
            """))
        else:
            print("Column 'curation_notes' already exists")

        # 6. Add curated_by
        if not column_exists(conn, 'wip_articles', 'curated_by'):
            print("Adding 'curated_by' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN curated_by INT DEFAULT NULL
            """))
        else:
            print("Column 'curated_by' already exists")

        # 7. Add curated_at
        if not column_exists(conn, 'wip_articles', 'curated_at'):
            print("Adding 'curated_at' column to wip_articles...")
            conn.execute(text("""
                ALTER TABLE wip_articles
                ADD COLUMN curated_at DATETIME DEFAULT NULL
            """))
        else:
            print("Column 'curated_at' already exists")

        # ============================================================
        # CURATION_EVENTS: Create audit trail table
        # ============================================================

        if not table_exists(conn, 'curation_events'):
            print("Creating 'curation_events' table...")
            conn.execute(text("""
                CREATE TABLE curation_events (
                    id INT AUTO_INCREMENT PRIMARY KEY,
                    report_id INT NOT NULL,
                    article_id INT DEFAULT NULL,
                    event_type VARCHAR(50) NOT NULL,
                    field_name VARCHAR(100) DEFAULT NULL,
                    old_value TEXT DEFAULT NULL,
                    new_value TEXT DEFAULT NULL,
                    notes TEXT DEFAULT NULL,
                    curator_id INT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

                    CONSTRAINT fk_curation_events_report FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
                    CONSTRAINT fk_curation_events_article FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE,
                    CONSTRAINT fk_curation_events_curator FOREIGN KEY (curator_id) REFERENCES users(user_id),

                    INDEX idx_curation_events_report (report_id),
                    INDEX idx_curation_events_report_article (report_id, article_id),
                    INDEX idx_curation_events_created (created_at)
                )
            """))
        else:
            print("Table 'curation_events' already exists")

        conn.commit()
        print("\nCuration fields migration completed successfully!")


if __name__ == "__main__":
    run_migration()
