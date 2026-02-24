"""
Migration script to populate wip_article_id on ReportArticleAssociation records.

This script finds legacy ReportArticleAssociation records that don't have a wip_article_id
and attempts to match them with WipArticle records based on:
- The report's pipeline_execution_id
- The article's PMID

Run with: python -m migrations.populate_wip_article_id
"""

import logging
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from database import SessionLocal

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def populate_wip_article_ids():
    """Populate wip_article_id on ReportArticleAssociation records."""

    db = SessionLocal()

    try:
        # First, let's see how many records need updating
        count_query = text("""
            SELECT COUNT(*) as cnt
            FROM report_article_associations raa
            WHERE raa.wip_article_id IS NULL
        """)
        result = db.execute(count_query).fetchone()
        total_missing = result[0] if result else 0

        logger.info(f"Found {total_missing} ReportArticleAssociation records with NULL wip_article_id")

        if total_missing == 0:
            logger.info("No records need updating. Exiting.")
            return

        # Update query: match by execution_id and PMID
        update_query = text("""
            UPDATE report_article_associations raa
            SET wip_article_id = (
                SELECT wa.id
                FROM wip_articles wa
                JOIN reports r ON r.pipeline_execution_id = wa.pipeline_execution_id
                JOIN articles a ON a.article_id = raa.article_id
                WHERE r.report_id = raa.report_id
                  AND wa.pmid = a.pmid
                  AND wa.pmid IS NOT NULL
                LIMIT 1
            )
            WHERE raa.wip_article_id IS NULL
              AND EXISTS (
                SELECT 1
                FROM wip_articles wa
                JOIN reports r ON r.pipeline_execution_id = wa.pipeline_execution_id
                JOIN articles a ON a.article_id = raa.article_id
                WHERE r.report_id = raa.report_id
                  AND wa.pmid = a.pmid
                  AND wa.pmid IS NOT NULL
              )
        """)

        logger.info("Running update query...")
        result = db.execute(update_query)
        updated_count = result.rowcount

        db.commit()

        logger.info(f"Updated {updated_count} records")

        # Check how many still need updating (no matching WipArticle found)
        result = db.execute(count_query).fetchone()
        still_missing = result[0] if result else 0

        if still_missing > 0:
            logger.warning(f"{still_missing} records still have NULL wip_article_id (no matching WipArticle found)")

            # Log some details about unmatched records
            detail_query = text("""
                SELECT
                    raa.report_id,
                    raa.article_id,
                    a.pmid,
                    a.title,
                    r.pipeline_execution_id
                FROM report_article_associations raa
                JOIN articles a ON a.article_id = raa.article_id
                JOIN reports r ON r.report_id = raa.report_id
                WHERE raa.wip_article_id IS NULL
                LIMIT 10
            """)
            unmatched = db.execute(detail_query).fetchall()

            logger.info("Sample of unmatched records:")
            for row in unmatched:
                logger.info(f"  Report {row[0]}, Article {row[1]}, PMID: {row[2]}, Exec: {row[4]}")
                logger.info(f"    Title: {row[3][:80]}..." if row[3] and len(row[3]) > 80 else f"    Title: {row[3]}")
        else:
            logger.info("All records now have wip_article_id populated!")

        return updated_count, still_missing

    except Exception as e:
        logger.error(f"Migration failed: {e}", exc_info=True)
        db.rollback()
        raise
    finally:
        db.close()


def check_status():
    """Check current status of wip_article_id population."""

    db = SessionLocal()

    try:
        query = text("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN wip_article_id IS NOT NULL THEN 1 ELSE 0 END) as populated,
                SUM(CASE WHEN wip_article_id IS NULL THEN 1 ELSE 0 END) as missing
            FROM report_article_associations
        """)
        result = db.execute(query).fetchone()

        total, populated, missing = result if result else (0, 0, 0)

        logger.info(f"ReportArticleAssociation status:")
        logger.info(f"  Total records: {total}")
        logger.info(f"  With wip_article_id: {populated}")
        logger.info(f"  Missing wip_article_id: {missing}")

        return total, populated, missing

    finally:
        db.close()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Populate wip_article_id on ReportArticleAssociation records")
    parser.add_argument("--check", action="store_true", help="Only check status, don't update")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be updated without committing")

    args = parser.parse_args()

    if args.check:
        check_status()
    elif args.dry_run:
        logger.info("DRY RUN - checking status only")
        check_status()
    else:
        logger.info("Starting wip_article_id population migration...")
        updated, remaining = populate_wip_article_ids()
        logger.info(f"Migration complete. Updated: {updated}, Remaining: {remaining}")
