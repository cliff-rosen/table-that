#!/usr/bin/env python3
"""
Migration script to remove legacy tables for Knowledge Horizon cleanup.

This script removes tables that are no longer needed after migrating to
Knowledge Horizon POC. It keeps only essential tables for the new system.

TABLES TO REMOVE (Legacy Systems):
- Workbench System: assets, mission_assets, hop_assets, missions, hops, tool_steps, tool_executions, resource_credentials
- Legacy Chat: chats, user_sessions, chat_messages, chat_quick_actions
- Legacy Features: article_group, article_group_detail, feature_preset_groups, feature_preset_features
- Legacy Search: smart_search_sessions, user_events
- Legacy Profile: user_company_profiles (replaced by company_profiles)

TABLES TO KEEP:
- Core: users
- Knowledge Horizon: company_profiles, curation_mandates, information_sources, reports, articles,
  report_article_associations, report_schedules, user_feedback, onboarding_sessions
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_table_exists(db, table_name):
    """Check if a table exists"""
    result = db.execute(text("""
        SELECT COUNT(*) as table_exists
        FROM information_schema.tables
        WHERE table_name = :table_name
        AND table_schema = DATABASE()
    """), {"table_name": table_name})
    return result.fetchone()[0] > 0

def get_table_row_count(db, table_name):
    """Get row count for a table"""
    try:
        result = db.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
        return result.fetchone()[0]
    except:
        return 0

def drop_table_safely(db, table_name):
    """Drop a table if it exists"""
    if check_table_exists(db, table_name):
        row_count = get_table_row_count(db, table_name)
        logger.info(f"Dropping table '{table_name}' (had {row_count} rows)...")
        db.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
        return True
    else:
        logger.info(f"Table '{table_name}' does not exist, skipping...")
        return False

def cleanup_legacy_tables():
    """Remove all legacy tables that are no longer needed."""

    # Tables to remove in dependency order (children first, then parents)
    legacy_tables = [
        # Asset system (remove children first)
        'mission_assets',
        'hop_assets',
        'tool_executions',
        'tool_steps',
        'assets',
        'hops',
        'missions',
        'resource_credentials',

        # Chat system
        'chat_messages',
        'chat_quick_actions',
        'chats',
        'user_sessions',

        # Legacy features
        'article_group_detail',
        'article_group',
        'feature_preset_features',
        'feature_preset_groups',

        # Legacy search and events
        'smart_search_sessions',
        'user_events',

        # Legacy profile (replaced by company_profiles)
        'user_company_profiles'
    ]

    # Tables to keep (for verification)
    tables_to_keep = [
        'users',                        # Core authentication
        'company_profiles',             # KH company information
        'curation_mandates',            # KH preferences
        'information_sources',          # KH sources
        'reports',                      # KH reports
        'articles',                     # KH articles
        'report_article_associations',  # KH article-report links
        'report_schedules',             # KH scheduling
        'user_feedback',                # KH feedback
        'onboarding_sessions'           # KH onboarding
    ]

    with SessionLocal() as db:
        try:
            logger.info("Starting legacy table cleanup...")

            # Show current state
            result = db.execute(text("SHOW TABLES"))
            current_tables = [row[0] for row in result.fetchall()]
            logger.info(f"Current tables before cleanup: {len(current_tables)}")

            # Remove legacy tables
            removed_count = 0
            for table_name in legacy_tables:
                if drop_table_safely(db, table_name):
                    removed_count += 1

            db.commit()

            # Show final state
            result = db.execute(text("SHOW TABLES"))
            remaining_tables = [row[0] for row in result.fetchall()]
            logger.info(f"Tables after cleanup: {len(remaining_tables)}")
            logger.info(f"Removed {removed_count} legacy tables")

            # Verify expected tables still exist
            logger.info("Verifying essential tables still exist:")
            for table_name in tables_to_keep:
                if check_table_exists(db, table_name):
                    row_count = get_table_row_count(db, table_name)
                    logger.info(f"  ✓ {table_name} ({row_count} rows)")
                else:
                    logger.error(f"  ✗ {table_name} - MISSING!")

            logger.info("Final remaining tables:")
            for table in sorted(remaining_tables):
                logger.info(f"  {table}")

        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
            db.rollback()
            raise

        logger.info("Database cleanup completed successfully")

if __name__ == "__main__":
    # Safety check
    print("⚠️  This will PERMANENTLY DELETE legacy tables and all their data!")
    print("Tables to be removed:")
    legacy_tables = [
        'mission_assets', 'hop_assets', 'tool_executions', 'tool_steps', 'assets',
        'hops', 'missions', 'resource_credentials', 'chat_messages', 'chat_quick_actions',
        'chats', 'user_sessions', 'article_group_detail', 'article_group',
        'feature_preset_features', 'feature_preset_groups', 'smart_search_sessions',
        'user_events', 'user_company_profiles'
    ]

    for table in legacy_tables:
        print(f"  - {table}")

    print("\nTables to keep:")
    tables_to_keep = [
        'users', 'company_profiles', 'curation_mandates', 'information_sources',
        'reports', 'articles', 'report_article_associations', 'report_schedules',
        'user_feedback', 'onboarding_sessions'
    ]

    for table in tables_to_keep:
        print(f"  + {table}")

    response = input("\nProceed with cleanup? (type 'yes' to confirm): ")
    if response.lower() == 'yes':
        cleanup_legacy_tables()
    else:
        print("Cleanup cancelled.")