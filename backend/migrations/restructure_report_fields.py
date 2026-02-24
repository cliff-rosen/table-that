#!/usr/bin/env python3
"""
Migration to restructure report fields

This migration:
1. Adds retrieval_params JSON column (for start_date, end_date, etc.)
2. Adds enrichments JSON column (for executive_summary, category_summaries)
3. Migrates existing executive_summary to enrichments
4. Migrates existing category_summaries from pipeline_metrics to enrichments
5. Drops executive_summary column
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from config import settings
import logging
import json

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migration():
    """Restructure report fields"""

    # Create engine
    engine = create_engine(settings.DATABASE_URL)

    try:
        with engine.connect() as connection:
            # Check if the table exists
            result = connection.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.tables
                WHERE table_name = 'reports'
            """))

            table_exists = result.scalar() > 0

            if not table_exists:
                logger.info("reports table does not exist yet. Skipping migration.")
                return

            # Check if retrieval_params column already exists
            result = connection.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_name = 'reports'
                AND column_name = 'retrieval_params'
            """))

            if result.scalar() > 0:
                logger.info("retrieval_params column already exists. Migration already completed.")
                return

            # === STEP 1: Add new columns ===
            logger.info("Adding retrieval_params and enrichments columns...")

            connection.execute(text("""
                ALTER TABLE reports
                ADD COLUMN retrieval_params JSON,
                ADD COLUMN enrichments JSON;
            """))
            connection.commit()
            logger.info("Successfully added new columns.")

            # === STEP 2: Migrate existing data ===
            logger.info("Migrating existing data to new structure...")

            # Get all reports with their data
            result = connection.execute(text("""
                SELECT report_id, executive_summary, pipeline_metrics
                FROM reports
            """))
            reports = result.fetchall()

            logger.info(f"Found {len(reports)} reports to migrate.")

            for report_id, executive_summary, pipeline_metrics_json in reports:
                # Parse pipeline_metrics
                pipeline_metrics = {}
                if pipeline_metrics_json:
                    try:
                        pipeline_metrics = json.loads(pipeline_metrics_json) if isinstance(pipeline_metrics_json, str) else pipeline_metrics_json
                    except:
                        pipeline_metrics = {}

                # Extract category_summaries from pipeline_metrics
                category_summaries = pipeline_metrics.pop('category_summaries', {})

                # Build enrichments object
                enrichments = {}
                if executive_summary:
                    enrichments['executive_summary'] = executive_summary
                if category_summaries:
                    enrichments['category_summaries'] = category_summaries

                # Build retrieval_params (empty for now, old reports don't have this)
                retrieval_params = {}

                # Update report
                connection.execute(text("""
                    UPDATE reports
                    SET retrieval_params = :retrieval_params,
                        enrichments = :enrichments,
                        pipeline_metrics = :pipeline_metrics
                    WHERE report_id = :report_id
                """), {
                    'report_id': report_id,
                    'retrieval_params': json.dumps(retrieval_params),
                    'enrichments': json.dumps(enrichments),
                    'pipeline_metrics': json.dumps(pipeline_metrics)
                })

            connection.commit()
            logger.info("Successfully migrated data for all reports.")

            # === STEP 3: Drop executive_summary column ===
            logger.info("Dropping executive_summary column...")

            connection.execute(text("""
                ALTER TABLE reports
                DROP COLUMN executive_summary;
            """))
            connection.commit()
            logger.info("Successfully dropped executive_summary column.")

            # === STEP 4: Verify the migration ===
            result = connection.execute(text("""
                SELECT column_name, data_type
                FROM information_schema.columns
                WHERE table_name = 'reports'
                AND column_name IN ('retrieval_params', 'enrichments', 'executive_summary')
                ORDER BY column_name;
            """))

            columns = result.fetchall()
            logger.info("Verified columns:")
            for col_name, col_type in columns:
                logger.info(f"  {col_name}: {col_type}")

            # Check that executive_summary is gone
            result = connection.execute(text("""
                SELECT COUNT(*)
                FROM information_schema.columns
                WHERE table_name = 'reports'
                AND column_name = 'executive_summary'
            """))

            if result.scalar() == 0:
                logger.info("✓ executive_summary column successfully removed")
            else:
                logger.warning("⚠ executive_summary column still exists!")

    except ProgrammingError as e:
        logger.error(f"Database error during migration: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during migration: {e}")
        raise

if __name__ == "__main__":
    logger.info("Starting report fields restructure migration...")
    run_migration()
    logger.info("Migration completed successfully!")
