"""
Migration: Add source_id to broad search queries

Adds source_id: 1 (PubMed) to all existing broad search queries in:
- research_streams.retrieval_config
- pipeline_executions.retrieval_config (execution snapshots)

This is required because BroadQuery now requires a source_id field.
"""

import sys
import os
import json

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings

PUBMED_SOURCE_ID = 1


def migrate_retrieval_config(config_json: str) -> str:
    """Add source_id to all broad search queries in a retrieval_config JSON."""
    if not config_json:
        return config_json

    try:
        config = json.loads(config_json)
    except json.JSONDecodeError:
        return config_json

    # Check if broad_search exists with queries
    if not config.get("broad_search") or not config["broad_search"].get("queries"):
        return config_json

    modified = False
    for query in config["broad_search"]["queries"]:
        if "source_id" not in query:
            query["source_id"] = PUBMED_SOURCE_ID
            modified = True

    if modified:
        return json.dumps(config)
    return config_json


def run_migration():
    """Apply source_id to all broad search queries."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # === RESEARCH_STREAMS ===
        print("Updating research_streams.retrieval_config...")

        # Get all streams with retrieval_config
        result = conn.execute(text("""
            SELECT stream_id, retrieval_config
            FROM research_streams
            WHERE retrieval_config IS NOT NULL
        """))

        streams = list(result)
        print(f"  Found {len(streams)} streams with retrieval_config")

        updated_streams = 0
        for stream_id, retrieval_config in streams:
            if retrieval_config:
                # Handle both string and dict (depending on DB driver)
                if isinstance(retrieval_config, dict):
                    config_str = json.dumps(retrieval_config)
                else:
                    config_str = retrieval_config

                new_config = migrate_retrieval_config(config_str)
                if new_config != config_str:
                    conn.execute(
                        text("""
                            UPDATE research_streams
                            SET retrieval_config = :config
                            WHERE stream_id = :stream_id
                        """),
                        {"config": new_config, "stream_id": stream_id}
                    )
                    updated_streams += 1
                    print(f"    Updated stream {stream_id}")

        print(f"  Updated {updated_streams} streams")

        # === PIPELINE_EXECUTIONS ===
        print("\nUpdating pipeline_executions.retrieval_config...")

        # Get all executions with retrieval_config
        result = conn.execute(text("""
            SELECT id, retrieval_config
            FROM pipeline_executions
            WHERE retrieval_config IS NOT NULL
        """))

        executions = list(result)
        print(f"  Found {len(executions)} executions with retrieval_config")

        updated_executions = 0
        for exec_id, retrieval_config in executions:
            if retrieval_config:
                # Handle both string and dict
                if isinstance(retrieval_config, dict):
                    config_str = json.dumps(retrieval_config)
                else:
                    config_str = retrieval_config

                new_config = migrate_retrieval_config(config_str)
                if new_config != config_str:
                    conn.execute(
                        text("""
                            UPDATE pipeline_executions
                            SET retrieval_config = :config
                            WHERE id = :exec_id
                        """),
                        {"config": new_config, "exec_id": exec_id}
                    )
                    updated_executions += 1
                    print(f"    Updated execution {exec_id}")

        print(f"  Updated {updated_executions} executions")

        conn.commit()
        print("\nMigration completed successfully!")
        print(f"\nSummary:")
        print(f"  - research_streams: {updated_streams} updated")
        print(f"  - pipeline_executions: {updated_executions} updated")
        print(f"  - All broad search queries now have source_id: {PUBMED_SOURCE_ID} (PubMed)")


if __name__ == "__main__":
    run_migration()
