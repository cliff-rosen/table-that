#!/usr/bin/env python3
"""
Migration script to transform curation_mandates to research_streams.

This migration:
1. Creates the new research_streams table
2. Migrates data from curation_mandates to research_streams
3. Updates foreign key references in related tables
4. Drops the old curation_mandates table

CRITICAL: This is a destructive migration that changes the core data model.
Backup your database before running this script.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging
import json

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

def migrate_mandates_to_research_streams():
    """Transform curation_mandates to research_streams"""

    with SessionLocal() as db:
        try:
            logger.info("Starting migration from curation_mandates to research_streams...")

            # Check if curation_mandates exists
            if not check_table_exists(db, 'curation_mandates'):
                logger.info("curation_mandates table doesn't exist, creating research_streams from scratch")
                create_research_streams_table(db)
                return

            mandate_count = get_table_row_count(db, 'curation_mandates')
            logger.info(f"Found {mandate_count} existing mandates to migrate")

            # Create new research_streams table
            create_research_streams_table(db)

            if mandate_count > 0:
                # Migrate data from curation_mandates to research_streams
                migrate_mandate_data(db)

                # Update foreign key references
                update_foreign_key_references(db)

                # Drop old table
                drop_curation_mandates_table(db)

            db.commit()
            logger.info("Migration completed successfully")

        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise

def create_research_streams_table(db):
    """Create the new research_streams table"""
    logger.info("Creating research_streams table...")

    db.execute(text("""
        CREATE TABLE research_streams (
            stream_id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            profile_id INT,
            stream_name VARCHAR(255) NOT NULL,
            description TEXT,
            stream_type ENUM('competitive', 'regulatory', 'clinical', 'market', 'scientific', 'mixed') NOT NULL DEFAULT 'mixed',
            focus_areas JSON,
            competitors JSON,
            regulatory_bodies JSON,
            scientific_domains JSON,
            exclusions JSON,
            keywords JSON,
            report_frequency ENUM('daily', 'weekly', 'biweekly', 'monthly') DEFAULT 'weekly',
            is_active BOOLEAN DEFAULT TRUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
            FOREIGN KEY (profile_id) REFERENCES company_profiles(profile_id) ON DELETE SET NULL,
            INDEX idx_user_id (user_id),
            INDEX idx_stream_name (stream_name),
            INDEX idx_stream_type (stream_type)
        )
    """))

    logger.info("research_streams table created")

def migrate_mandate_data(db):
    """Migrate data from curation_mandates to research_streams"""
    logger.info("Migrating mandate data to research_streams...")

    # Get all mandates
    result = db.execute(text("""
        SELECT
            mandate_id,
            user_id,
            profile_id,
            primary_focus,
            secondary_interests,
            competitors_to_track,
            regulatory_focus,
            scientific_domains,
            exclusions,
            is_active,
            created_at,
            updated_at
        FROM curation_mandates
        ORDER BY mandate_id
    """))

    mandates = result.fetchall()
    migrated_count = 0

    for mandate in mandates:
        # Determine stream name and type based on content
        stream_name, stream_type = generate_stream_name_and_type(mandate)

        # Consolidate focus areas
        focus_areas = []
        if mandate.primary_focus:
            focus_areas.extend(mandate.primary_focus if isinstance(mandate.primary_focus, list) else [])
        if mandate.secondary_interests:
            focus_areas.extend(mandate.secondary_interests if isinstance(mandate.secondary_interests, list) else [])

        # Merge regulatory focus into regulatory_bodies
        regulatory_bodies = mandate.regulatory_focus if mandate.regulatory_focus else []

        # Insert into research_streams
        db.execute(text("""
            INSERT INTO research_streams (
                user_id, profile_id, stream_name, stream_type,
                focus_areas, competitors, regulatory_bodies,
                scientific_domains, exclusions,
                is_active, created_at, updated_at
            ) VALUES (
                :user_id, :profile_id, :stream_name, :stream_type,
                :focus_areas, :competitors, :regulatory_bodies,
                :scientific_domains, :exclusions,
                :is_active, :created_at, :updated_at
            )
        """), {
            "user_id": mandate.user_id,
            "profile_id": mandate.profile_id,
            "stream_name": stream_name,
            "stream_type": stream_type,
            "focus_areas": json.dumps(focus_areas) if focus_areas else None,
            "competitors": json.dumps(mandate.competitors_to_track) if mandate.competitors_to_track else None,
            "regulatory_bodies": json.dumps(regulatory_bodies) if regulatory_bodies else None,
            "scientific_domains": json.dumps(mandate.scientific_domains) if mandate.scientific_domains else None,
            "exclusions": json.dumps(mandate.exclusions) if mandate.exclusions else None,
            "is_active": mandate.is_active,
            "created_at": mandate.created_at,
            "updated_at": mandate.updated_at
        })

        migrated_count += 1

    logger.info(f"Migrated {migrated_count} mandates to research_streams")

def generate_stream_name_and_type(mandate):
    """Generate appropriate stream name and type based on mandate content"""

    # Try to determine type based on content
    stream_type = "mixed"

    if mandate.competitors_to_track:
        stream_type = "competitive"
    elif mandate.regulatory_focus:
        stream_type = "regulatory"
    elif mandate.scientific_domains:
        stream_type = "scientific"

    # Generate a descriptive name
    name_parts = []

    # Add primary focus if available
    if mandate.primary_focus and len(mandate.primary_focus) > 0:
        name_parts.append(mandate.primary_focus[0])

    # Add type description
    type_descriptions = {
        "competitive": "Competitive Intelligence",
        "regulatory": "Regulatory Monitoring",
        "scientific": "Scientific Research",
        "clinical": "Clinical Intelligence",
        "market": "Market Analysis",
        "mixed": "Research Stream"
    }

    name_parts.append(type_descriptions.get(stream_type, "Research Stream"))

    stream_name = " ".join(name_parts) if name_parts else f"Research Stream {mandate.mandate_id}"

    # Ensure name is not too long
    if len(stream_name) > 255:
        stream_name = stream_name[:252] + "..."

    return stream_name, stream_type

def update_foreign_key_references(db):
    """Update foreign key references in related tables"""
    logger.info("Updating foreign key references...")

    # Create mapping from old mandate_id to new stream_id
    result = db.execute(text("""
        SELECT
            cm.mandate_id,
            rs.stream_id
        FROM curation_mandates cm
        JOIN research_streams rs ON (
            cm.user_id = rs.user_id
            AND cm.created_at = rs.created_at
        )
        ORDER BY cm.mandate_id
    """))

    id_mapping = {row.mandate_id: row.stream_id for row in result.fetchall()}
    logger.info(f"Created mapping for {len(id_mapping)} mandate->stream relationships")

    # Update information_sources table
    if check_table_exists(db, 'information_sources'):
        logger.info("Updating information_sources table...")
        db.execute(text("""
            ALTER TABLE information_sources
            ADD COLUMN research_stream_id INT,
            ADD FOREIGN KEY (research_stream_id) REFERENCES research_streams(stream_id) ON DELETE CASCADE
        """))

        # Update the values
        for mandate_id, stream_id in id_mapping.items():
            db.execute(text("""
                UPDATE information_sources
                SET research_stream_id = :stream_id
                WHERE mandate_id = :mandate_id
            """), {"stream_id": stream_id, "mandate_id": mandate_id})

        # Remove old foreign key and column
        db.execute(text("ALTER TABLE information_sources DROP FOREIGN KEY information_sources_ibfk_1"))
        db.execute(text("ALTER TABLE information_sources DROP COLUMN mandate_id"))

    # Update reports table
    if check_table_exists(db, 'reports'):
        logger.info("Updating reports table...")
        db.execute(text("""
            ALTER TABLE reports
            ADD COLUMN research_stream_id INT,
            ADD FOREIGN KEY (research_stream_id) REFERENCES research_streams(stream_id) ON DELETE SET NULL
        """))

        # Update the values
        for mandate_id, stream_id in id_mapping.items():
            db.execute(text("""
                UPDATE reports
                SET research_stream_id = :stream_id
                WHERE mandate_id = :mandate_id
            """), {"stream_id": stream_id, "mandate_id": mandate_id})

        # Remove old foreign key and column
        db.execute(text("ALTER TABLE reports DROP FOREIGN KEY reports_ibfk_2"))
        db.execute(text("ALTER TABLE reports DROP COLUMN mandate_id"))

def drop_curation_mandates_table(db):
    """Drop the old curation_mandates table"""
    logger.info("Dropping curation_mandates table...")

    # Update company_profiles relationship
    if check_table_exists(db, 'company_profiles'):
        # Note: The relationship in company_profiles was only for back_populates,
        # no actual foreign key column to update
        logger.info("company_profiles table relationships will be updated via ORM")

    db.execute(text("DROP TABLE IF EXISTS curation_mandates"))
    logger.info("curation_mandates table dropped")

if __name__ == "__main__":
    # Safety check
    print("WARNING: This will TRANSFORM the curation_mandates table to research_streams!")
    print("This is a DESTRUCTIVE migration that changes the core data model.")
    print("\nChanges:")
    print("  1. Creates new research_streams table")
    print("  2. Migrates all data from curation_mandates")
    print("  3. Updates foreign keys in information_sources and reports")
    print("  4. Drops the curation_mandates table")
    print("\nBACKUP YOUR DATABASE BEFORE PROCEEDING!")

    response = input("\nType 'TRANSFORM' to proceed with migration: ")
    if response == 'TRANSFORM':
        migrate_mandates_to_research_streams()
    else:
        print("Migration cancelled.")