#!/usr/bin/env python3
"""
Migration script to add multi-tenancy support with organizations and stream subscriptions.

This migration:
1. Creates the organizations table
2. Creates org_stream_subscriptions table
3. Creates user_stream_subscriptions table
4. Adds org_id to users table
5. Updates userrole enum to include new roles
6. Adds scope, org_id, created_by columns to research_streams
7. Migrates existing data:
   - Creates a single-user organization for each existing user
   - Sets user.org_id to their organization
   - Sets research_streams.scope to 'personal', populates org_id and created_by
8. Migrates notes from TEXT to JSON format

Run this script once after deploying the multi-tenancy feature.
"""

import sys
import os
import json
import uuid
from datetime import datetime

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine, SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def table_exists(db, table_name: str) -> bool:
    """Check if a table exists in the database."""
    result = db.execute(text(f"""
        SELECT COUNT(*) as cnt
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
    """), {"table_name": table_name})
    return result.fetchone()[0] > 0


def column_exists(db, table_name: str, column_name: str) -> bool:
    """Check if a column exists in a table."""
    result = db.execute(text("""
        SELECT COUNT(*) as cnt
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
        AND column_name = :column_name
    """), {"table_name": table_name, "column_name": column_name})
    return result.fetchone()[0] > 0


def create_organizations_table(db):
    """Create the organizations table."""
    if table_exists(db, "organizations"):
        logger.info("organizations table already exists")
        return

    logger.info("Creating organizations table...")
    db.execute(text("""
        CREATE TABLE organizations (
            org_id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            is_active BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_org_active (is_active)
        )
    """))
    db.commit()
    logger.info("organizations table created")


def create_subscription_tables(db):
    """Create the subscription tables."""
    # org_stream_subscriptions
    if not table_exists(db, "org_stream_subscriptions"):
        logger.info("Creating org_stream_subscriptions table...")
        db.execute(text("""
            CREATE TABLE org_stream_subscriptions (
                org_id INT NOT NULL,
                stream_id INT NOT NULL,
                subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                subscribed_by INT,
                PRIMARY KEY (org_id, stream_id),
                FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE CASCADE,
                FOREIGN KEY (stream_id) REFERENCES research_streams(stream_id) ON DELETE CASCADE,
                FOREIGN KEY (subscribed_by) REFERENCES users(user_id) ON DELETE SET NULL,
                INDEX idx_org_sub_stream (stream_id)
            )
        """))
        db.commit()
        logger.info("org_stream_subscriptions table created")
    else:
        logger.info("org_stream_subscriptions table already exists")

    # user_stream_subscriptions
    if not table_exists(db, "user_stream_subscriptions"):
        logger.info("Creating user_stream_subscriptions table...")
        db.execute(text("""
            CREATE TABLE user_stream_subscriptions (
                user_id INT NOT NULL,
                stream_id INT NOT NULL,
                is_subscribed BOOLEAN NOT NULL DEFAULT TRUE,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, stream_id),
                FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                FOREIGN KEY (stream_id) REFERENCES research_streams(stream_id) ON DELETE CASCADE,
                INDEX idx_user_sub_stream (stream_id),
                INDEX idx_user_sub_subscribed (is_subscribed)
            )
        """))
        db.commit()
        logger.info("user_stream_subscriptions table created")
    else:
        logger.info("user_stream_subscriptions table already exists")


def add_org_id_to_users(db):
    """Add org_id column to users table."""
    if column_exists(db, "users", "org_id"):
        logger.info("users.org_id column already exists")
        return

    logger.info("Adding org_id column to users table...")
    db.execute(text("""
        ALTER TABLE users
        ADD COLUMN org_id INT NULL,
        ADD INDEX idx_users_org (org_id),
        ADD CONSTRAINT fk_users_org FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE SET NULL
    """))
    db.commit()
    logger.info("users.org_id column added")


def update_user_role_enum(db):
    """Update the userrole enum to include new roles."""
    logger.info("Checking userrole enum...")

    # Get current enum values
    result = db.execute(text("""
        SELECT COLUMN_TYPE
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 'users'
        AND column_name = 'role'
    """))
    row = result.fetchone()
    if row:
        current_type = row[0]
        logger.info(f"Current role column type: {current_type}")

        # Check if new roles are already present
        if 'platform_admin' in current_type:
            logger.info("userrole enum already has new roles")
            return

    logger.info("Updating userrole enum to include new roles...")
    # MySQL requires recreating the enum - we'll add the new values
    db.execute(text("""
        ALTER TABLE users
        MODIFY COLUMN role ENUM('platform_admin', 'org_admin', 'member', 'admin', 'user', 'tester')
        NOT NULL DEFAULT 'member'
    """))
    db.commit()
    logger.info("userrole enum updated")


def add_columns_to_research_streams(db):
    """Add scope, org_id, created_by columns to research_streams."""
    changes_made = False

    # Add scope column
    if not column_exists(db, "research_streams", "scope"):
        logger.info("Adding scope column to research_streams...")
        db.execute(text("""
            ALTER TABLE research_streams
            ADD COLUMN scope ENUM('global', 'organization', 'personal') NOT NULL DEFAULT 'personal',
            ADD INDEX idx_streams_scope (scope)
        """))
        changes_made = True
        logger.info("research_streams.scope column added")
    else:
        logger.info("research_streams.scope column already exists")

    # Add org_id column
    if not column_exists(db, "research_streams", "org_id"):
        logger.info("Adding org_id column to research_streams...")
        db.execute(text("""
            ALTER TABLE research_streams
            ADD COLUMN org_id INT NULL,
            ADD INDEX idx_streams_org (org_id),
            ADD CONSTRAINT fk_streams_org FOREIGN KEY (org_id) REFERENCES organizations(org_id) ON DELETE SET NULL
        """))
        changes_made = True
        logger.info("research_streams.org_id column added")
    else:
        logger.info("research_streams.org_id column already exists")

    # Add created_by column
    if not column_exists(db, "research_streams", "created_by"):
        logger.info("Adding created_by column to research_streams...")
        db.execute(text("""
            ALTER TABLE research_streams
            ADD COLUMN created_by INT NULL,
            ADD INDEX idx_streams_created_by (created_by),
            ADD CONSTRAINT fk_streams_created_by FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
        """))
        changes_made = True
        logger.info("research_streams.created_by column added")
    else:
        logger.info("research_streams.created_by column already exists")

    # Make user_id nullable (if not already)
    # Note: This is a bit tricky in MySQL, we need to check current nullability
    result = db.execute(text("""
        SELECT IS_NULLABLE
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 'research_streams'
        AND column_name = 'user_id'
    """))
    row = result.fetchone()
    if row and row[0] == 'NO':
        logger.info("Making research_streams.user_id nullable...")
        db.execute(text("""
            ALTER TABLE research_streams
            MODIFY COLUMN user_id INT NULL
        """))
        changes_made = True
        logger.info("research_streams.user_id is now nullable")
    else:
        logger.info("research_streams.user_id is already nullable")

    if changes_made:
        db.commit()


def migrate_existing_data(db):
    """Migrate existing data to the new structure."""
    logger.info("Starting data migration...")

    # Get all users without an org_id
    users_without_org = db.execute(text("""
        SELECT user_id, email, full_name
        FROM users
        WHERE org_id IS NULL
    """)).fetchall()

    if not users_without_org:
        logger.info("All users already have organizations assigned")
    else:
        logger.info(f"Creating organizations for {len(users_without_org)} users...")

        for user in users_without_org:
            user_id = user[0]
            email = user[1]
            full_name = user[2]

            # Create organization name from user info
            org_name = full_name if full_name else email.split('@')[0]
            org_name = f"{org_name}'s Organization"

            # Create organization
            db.execute(text("""
                INSERT INTO organizations (name, is_active, created_at)
                VALUES (:name, TRUE, NOW())
            """), {"name": org_name})

            # Get the created org_id
            result = db.execute(text("SELECT LAST_INSERT_ID()"))
            org_id = result.fetchone()[0]

            # Update user with org_id and set role to org_admin (they're the owner of their org)
            db.execute(text("""
                UPDATE users
                SET org_id = :org_id,
                    role = CASE
                        WHEN role IN ('admin', 'tester') THEN role
                        ELSE 'org_admin'
                    END
                WHERE user_id = :user_id
            """), {"org_id": org_id, "user_id": user_id})

            logger.info(f"  Created org '{org_name}' (id={org_id}) for user {user_id}")

        db.commit()
        logger.info("User organizations created")

    # Update research_streams: set scope='personal', populate org_id and created_by
    streams_to_update = db.execute(text("""
        SELECT rs.stream_id, rs.user_id, u.org_id
        FROM research_streams rs
        JOIN users u ON rs.user_id = u.user_id
        WHERE rs.org_id IS NULL OR rs.created_by IS NULL
    """)).fetchall()

    if streams_to_update:
        logger.info(f"Updating {len(streams_to_update)} research streams...")
        for stream in streams_to_update:
            stream_id = stream[0]
            user_id = stream[1]
            org_id = stream[2]

            db.execute(text("""
                UPDATE research_streams
                SET scope = 'personal',
                    org_id = :org_id,
                    created_by = :user_id
                WHERE stream_id = :stream_id
            """), {"org_id": org_id, "user_id": user_id, "stream_id": stream_id})

        db.commit()
        logger.info("Research streams updated")
    else:
        logger.info("All research streams already have org_id and created_by set")


def migrate_notes_to_json(db):
    """Migrate notes from TEXT to JSON format."""
    logger.info("Checking notes column format...")

    # Check current column type
    result = db.execute(text("""
        SELECT DATA_TYPE
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
        AND table_name = 'report_article_associations'
        AND column_name = 'notes'
    """))
    row = result.fetchone()

    if not row:
        logger.info("notes column not found - skipping migration")
        return

    current_type = row[0].lower()
    logger.info(f"Current notes column type: {current_type}")

    if current_type == 'json':
        logger.info("notes column is already JSON type")
        return

    # Get all non-empty notes
    notes_to_migrate = db.execute(text("""
        SELECT report_id, article_id, notes
        FROM report_article_associations
        WHERE notes IS NOT NULL AND notes != ''
    """)).fetchall()

    logger.info(f"Found {len(notes_to_migrate)} notes to migrate")

    # First, add a temporary column for the JSON data
    if not column_exists(db, "report_article_associations", "notes_json"):
        db.execute(text("""
            ALTER TABLE report_article_associations
            ADD COLUMN notes_json JSON NULL
        """))
        db.commit()

    # Migrate each note to JSON format
    for note_row in notes_to_migrate:
        report_id = note_row[0]
        article_id = note_row[1]
        old_notes = note_row[2]

        # Get the user_id from the report
        user_result = db.execute(text("""
            SELECT r.user_id, u.full_name
            FROM reports r
            JOIN users u ON r.user_id = u.user_id
            WHERE r.report_id = :report_id
        """), {"report_id": report_id})
        user_row = user_result.fetchone()

        if user_row:
            user_id = user_row[0]
            author_name = user_row[1] or "Unknown"

            # Create JSON note structure
            new_notes = [{
                "id": str(uuid.uuid4()),
                "user_id": user_id,
                "author_name": author_name,
                "content": old_notes,
                "visibility": "personal",
                "created_at": datetime.utcnow().isoformat() + "Z",
                "updated_at": datetime.utcnow().isoformat() + "Z"
            }]

            db.execute(text("""
                UPDATE report_article_associations
                SET notes_json = :notes_json
                WHERE report_id = :report_id AND article_id = :article_id
            """), {
                "notes_json": json.dumps(new_notes),
                "report_id": report_id,
                "article_id": article_id
            })

    db.commit()
    logger.info("Notes migrated to JSON format in notes_json column")

    # Now swap the columns
    logger.info("Swapping notes columns...")
    db.execute(text("ALTER TABLE report_article_associations DROP COLUMN notes"))
    db.execute(text("ALTER TABLE report_article_associations CHANGE notes_json notes JSON NULL"))
    db.commit()
    logger.info("Notes column migration complete")


def run_migration():
    """Run the complete migration."""
    with SessionLocal() as db:
        try:
            logger.info("=" * 60)
            logger.info("Starting multi-tenancy migration")
            logger.info("=" * 60)

            # Step 1: Create organizations table
            create_organizations_table(db)

            # Step 2: Add org_id to users (before subscription tables to satisfy FK)
            add_org_id_to_users(db)

            # Step 3: Update user role enum
            update_user_role_enum(db)

            # Step 4: Add columns to research_streams
            add_columns_to_research_streams(db)

            # Step 5: Create subscription tables
            create_subscription_tables(db)

            # Step 6: Migrate existing data
            migrate_existing_data(db)

            # Step 7: Migrate notes to JSON
            migrate_notes_to_json(db)

            logger.info("=" * 60)
            logger.info("Migration completed successfully!")
            logger.info("=" * 60)

            # Print summary
            org_count = db.execute(text("SELECT COUNT(*) FROM organizations")).fetchone()[0]
            user_count = db.execute(text("SELECT COUNT(*) FROM users WHERE org_id IS NOT NULL")).fetchone()[0]
            stream_count = db.execute(text("SELECT COUNT(*) FROM research_streams WHERE scope IS NOT NULL")).fetchone()[0]

            logger.info(f"Summary:")
            logger.info(f"  - Organizations: {org_count}")
            logger.info(f"  - Users with org: {user_count}")
            logger.info(f"  - Streams with scope: {stream_count}")

        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise


if __name__ == "__main__":
    run_migration()
