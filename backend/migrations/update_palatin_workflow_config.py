"""
Update Palatin stream workflow config to new structure
"""

import json
import sys
import os

# Add parent directory to path to import database
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
from sqlalchemy import text


def update_palatin_workflow():
    """Update the Palatin stream with new workflow config structure"""

    # Load the JSON spec
    spec_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))),
                             '_specs', 'palatin_mandate_1_channel_structure.json')

    with open(spec_path, 'r') as f:
        spec = json.load(f)

    workflow_config = spec['workflow_config']

    db = SessionLocal()
    try:
        # Find the Palatin Scientific Literature Monitor stream
        result = db.execute(text("""
            SELECT stream_id, stream_name
            FROM research_streams
            WHERE stream_name = 'Palatin Scientific Literature Monitor'
        """))

        stream = result.fetchone()
        if not stream:
            print("Palatin Science stream not found")
            return

        stream_id = stream[0]
        print(f"Found stream: {stream[1]} (ID: {stream_id})")

        # Update workflow_config
        db.execute(text("""
            UPDATE research_streams
            SET workflow_config = :workflow_config,
                updated_at = NOW()
            WHERE stream_id = :stream_id
        """), {
            'stream_id': stream_id,
            'workflow_config': json.dumps(workflow_config)
        })

        db.commit()
        print(f"Updated workflow_config for stream {stream_id}")
        print(f"  - Added {len(workflow_config['sources'])} sources")
        for source in workflow_config['sources']:
            print(f"    - {source['source_id']}: {len(source['channel_queries'])} channel queries")

    except Exception as e:
        print(f"Error: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    update_palatin_workflow()
