"""
Migration: Add tool_traces table

Generic trace storage for long-running tool executions.
Provides unified infrastructure for tools like deep_research, batch_analysis, etc.

Each tool stores its specific data in JSON fields:
- input_params: Parameters passed to the tool
- state: Tool's internal state (updated during execution)
- result: Final result
- metrics: Execution metrics
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Create tool_traces table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        # Check if table already exists
        result = conn.execute(text("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_name = 'tool_traces'
        """))

        if result.fetchone():
            print("Table 'tool_traces' already exists")
            return

        # Create the enum type for status
        print("Creating 'tooltracestatus' enum type...")
        conn.execute(text("""
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'tooltracestatus') THEN
                    CREATE TYPE tooltracestatus AS ENUM (
                        'pending',
                        'in_progress',
                        'completed',
                        'failed',
                        'cancelled'
                    );
                END IF;
            END$$;
        """))
        conn.commit()

        # Create the table
        print("Creating 'tool_traces' table...")
        conn.execute(text("""
            CREATE TABLE tool_traces (
                id VARCHAR(36) PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(user_id),
                org_id INTEGER REFERENCES organizations(org_id),

                tool_name VARCHAR(100) NOT NULL,

                input_params JSONB DEFAULT '{}',

                status tooltracestatus NOT NULL DEFAULT 'pending',
                progress FLOAT DEFAULT 0.0,
                current_stage VARCHAR(100),

                state JSONB DEFAULT '{}',

                result JSONB,
                error_message TEXT,

                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                started_at TIMESTAMP,
                completed_at TIMESTAMP,

                metrics JSONB DEFAULT '{}'
            )
        """))
        conn.commit()
        print("Table created.")

        # Create indexes
        print("Creating indexes...")
        conn.execute(text("""
            CREATE INDEX idx_tool_traces_user_id ON tool_traces(user_id);
        """))
        conn.execute(text("""
            CREATE INDEX idx_tool_traces_tool_name ON tool_traces(tool_name);
        """))
        conn.execute(text("""
            CREATE INDEX idx_tool_traces_status ON tool_traces(status);
        """))
        conn.execute(text("""
            CREATE INDEX idx_tool_traces_user_tool ON tool_traces(user_id, tool_name);
        """))
        conn.commit()
        print("Indexes created.")

        print("Migration completed successfully!")


if __name__ == "__main__":
    run_migration()
