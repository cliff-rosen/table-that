#!/usr/bin/env python3
"""
Migration: Restructure research_streams to clean three-layer architecture

This migration:
1. Adds new columns: semantic_space, retrieval_config, presentation_config
2. Migrates existing data from legacy fields to new structure
3. Drops legacy columns: audience, intended_guidance, global_inclusion, global_exclusion,
   categories, workflow_config, scoring_config
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal, engine
import json
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate():
    """Execute the migration"""
    with engine.begin() as connection:

        logger.info("Step 1: Adding new columns (nullable initially)...")

        # Check if semantic_space already exists (from previous migration)
        result = connection.execute(text("""
            SELECT COUNT(*) as count
            FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'research_streams'
            AND COLUMN_NAME = 'semantic_space'
        """))
        semantic_space_exists = result.fetchone()[0] > 0

        if semantic_space_exists:
            logger.info("  semantic_space column already exists, skipping...")
            # Only add retrieval_config and presentation_config
            connection.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN retrieval_config JSON NULL,
                ADD COLUMN presentation_config JSON NULL
            """))
        else:
            # Add all three columns
            connection.execute(text("""
                ALTER TABLE research_streams
                ADD COLUMN semantic_space JSON NULL,
                ADD COLUMN retrieval_config JSON NULL,
                ADD COLUMN presentation_config JSON NULL
            """))

        logger.info("Step 2: Migrating data from legacy fields to new structure...")

        # Fetch all research streams
        result = connection.execute(text("""
            SELECT
                stream_id,
                purpose,
                audience,
                intended_guidance,
                global_inclusion,
                global_exclusion,
                categories,
                workflow_config,
                scoring_config
            FROM research_streams
        """))

        streams = result.fetchall()
        logger.info(f"Found {len(streams)} research streams to migrate")

        for stream in streams:
            stream_id = stream[0]
            purpose = stream[1]
            audience = json.loads(stream[2]) if stream[2] else []
            intended_guidance = json.loads(stream[3]) if stream[3] else []
            global_inclusion = json.loads(stream[4]) if stream[4] else []
            global_exclusion = json.loads(stream[5]) if stream[5] else []
            categories = json.loads(stream[6]) if stream[6] else []
            workflow_config = json.loads(stream[7]) if stream[7] else None
            scoring_config = json.loads(stream[8]) if stream[8] else None

            # Build semantic_space from legacy fields
            semantic_space = {
                "domain": {
                    "name": "",  # Will need to be filled in manually or from stream_name
                    "description": purpose or ""
                },
                "topics": [],
                "entities": [],
                "relationships": [],
                "context": {
                    "business_context": purpose or "",
                    "decision_types": intended_guidance if intended_guidance else [""],
                    "stakeholders": audience if audience else [""],
                    "time_sensitivity": "Weekly review"
                },
                "coverage": {
                    "signal_types": [],
                    "temporal_scope": {
                        "start_date": None,
                        "end_date": "present",
                        "focus_periods": [],
                        "recency_weight": 0.7,
                        "rationale": "Recent research prioritized"
                    },
                    "quality_criteria": {
                        "peer_review_required": True,
                        "minimum_citation_count": None,
                        "journal_quality": [],
                        "study_types": [],
                        "exclude_predatory": True,
                        "language_restrictions": ["English"],
                        "other_criteria": []
                    },
                    "completeness_requirement": "Comprehensive coverage"
                },
                "boundaries": {
                    "inclusions": [
                        {
                            "criterion_id": f"inc_{idx}",
                            "description": desc,
                            "rationale": "",
                            "mandatory": True,
                            "related_topics": [],
                            "related_entities": []
                        }
                        for idx, desc in enumerate(global_inclusion)
                    ],
                    "exclusions": [
                        {
                            "criterion_id": f"exc_{idx}",
                            "description": desc,
                            "rationale": "",
                            "strict": True,
                            "exceptions": []
                        }
                        for idx, desc in enumerate(global_exclusion)
                    ],
                    "edge_cases": []
                },
                "extraction_metadata": {
                    "extracted_from": "legacy_migration",
                    "extracted_at": "2025-01-01T00:00:00Z",
                    "human_reviewed": False,
                    "derivation_method": "manual"
                }
            }

            # Build retrieval_config
            retrieval_config = {
                "workflow": workflow_config if workflow_config else {
                    "category_configs": {},
                    "article_limit_per_week": 10
                },
                "scoring": scoring_config if scoring_config else {
                    "relevance_weight": 0.6,
                    "evidence_weight": 0.4,
                    "inclusion_threshold": 7.0,
                    "max_items_per_report": 10
                }
            }

            # Build presentation_config
            presentation_config = {
                "categories": categories if categories else []
            }

            # Update the stream with new structure
            connection.execute(
                text("""
                    UPDATE research_streams
                    SET
                        semantic_space = :semantic_space,
                        retrieval_config = :retrieval_config,
                        presentation_config = :presentation_config
                    WHERE stream_id = :stream_id
                """),
                {
                    "stream_id": stream_id,
                    "semantic_space": json.dumps(semantic_space),
                    "retrieval_config": json.dumps(retrieval_config),
                    "presentation_config": json.dumps(presentation_config)
                }
            )

            logger.info(f"  Migrated stream_id={stream_id}")

        logger.info("Step 3: Making new columns NOT NULL...")

        connection.execute(text("""
            ALTER TABLE research_streams
            MODIFY COLUMN semantic_space JSON NOT NULL,
            MODIFY COLUMN retrieval_config JSON NOT NULL,
            MODIFY COLUMN presentation_config JSON NOT NULL
        """))

        logger.info("Step 4: Dropping legacy columns...")

        connection.execute(text("""
            ALTER TABLE research_streams
            DROP COLUMN audience,
            DROP COLUMN intended_guidance,
            DROP COLUMN global_inclusion,
            DROP COLUMN global_exclusion,
            DROP COLUMN categories,
            DROP COLUMN workflow_config,
            DROP COLUMN scoring_config
        """))

        logger.info("Migration completed successfully!")


def rollback():
    """Rollback the migration (restore legacy structure)"""
    with engine.begin() as connection:
        logger.info("Rolling back migration...")

        logger.info("Step 1: Adding back legacy columns...")

        connection.execute(text("""
            ALTER TABLE research_streams
            ADD COLUMN audience JSON NULL,
            ADD COLUMN intended_guidance JSON NULL,
            ADD COLUMN global_inclusion JSON NULL,
            ADD COLUMN global_exclusion JSON NULL,
            ADD COLUMN categories JSON NULL,
            ADD COLUMN workflow_config JSON NULL,
            ADD COLUMN scoring_config JSON NULL
        """))

        logger.info("Step 2: Migrating data back to legacy fields...")

        result = connection.execute(text("""
            SELECT
                stream_id,
                semantic_space,
                retrieval_config,
                presentation_config
            FROM research_streams
        """))

        streams = result.fetchall()

        for stream in streams:
            stream_id = stream[0]
            semantic_space = json.loads(stream[1]) if stream[1] else {}
            retrieval_config = json.loads(stream[2]) if stream[2] else {}
            presentation_config = json.loads(stream[3]) if stream[3] else {}

            # Extract legacy fields from semantic_space
            audience = semantic_space.get("context", {}).get("stakeholders", [])
            intended_guidance = semantic_space.get("context", {}).get("decision_types", [])
            global_inclusion = [
                inc["description"]
                for inc in semantic_space.get("boundaries", {}).get("inclusions", [])
            ]
            global_exclusion = [
                exc["description"]
                for exc in semantic_space.get("boundaries", {}).get("exclusions", [])
            ]

            # Extract categories from presentation_config
            categories = presentation_config.get("categories", [])

            # Extract workflow and scoring from retrieval_config
            workflow_config = retrieval_config.get("workflow")
            scoring_config = retrieval_config.get("scoring")

            connection.execute(
                text("""
                    UPDATE research_streams
                    SET
                        audience = :audience,
                        intended_guidance = :intended_guidance,
                        global_inclusion = :global_inclusion,
                        global_exclusion = :global_exclusion,
                        categories = :categories,
                        workflow_config = :workflow_config,
                        scoring_config = :scoring_config
                    WHERE stream_id = :stream_id
                """),
                {
                    "stream_id": stream_id,
                    "audience": json.dumps(audience),
                    "intended_guidance": json.dumps(intended_guidance),
                    "global_inclusion": json.dumps(global_inclusion),
                    "global_exclusion": json.dumps(global_exclusion),
                    "categories": json.dumps(categories),
                    "workflow_config": json.dumps(workflow_config),
                    "scoring_config": json.dumps(scoring_config)
                }
            )

        logger.info("Step 3: Dropping new columns...")

        connection.execute(text("""
            ALTER TABLE research_streams
            DROP COLUMN semantic_space,
            DROP COLUMN retrieval_config,
            DROP COLUMN presentation_config
        """))

        logger.info("Rollback completed successfully!")


if __name__ == "__main__":
    import sys

    if len(sys.argv) > 1 and sys.argv[1] == "--rollback":
        rollback()
    else:
        migrate()
