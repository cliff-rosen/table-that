#!/usr/bin/env python
"""Run a SQL migration file against the database."""

import sys
from sqlalchemy import text
from database import engine

def run_migration(migration_file: str):
    """Execute SQL statements from a migration file."""
    print(f"Running migration: {migration_file}")

    with open(migration_file, 'r') as f:
        sql_content = f.read()

    # Split into individual statements (skip comments and empty lines)
    statements = []
    current_stmt = []
    for line in sql_content.split('\n'):
        stripped = line.strip()
        if stripped.startswith('--'):
            continue
        if stripped:
            current_stmt.append(stripped)
            if stripped.endswith(';'):
                statements.append(' '.join(current_stmt))
                current_stmt = []

    print(f"Found {len(statements)} SQL statements to execute")

    with engine.connect() as conn:
        for i, stmt in enumerate(statements, 1):
            # Remove trailing semicolon for execution
            stmt_clean = stmt.rstrip(';').strip()
            if not stmt_clean:
                continue
            try:
                print(f"\n[{i}] Executing: {stmt_clean[:80]}...")
                conn.execute(text(stmt_clean))
                conn.commit()
                print(f"    Success!")
            except Exception as e:
                print(f"    Error: {e}")
                # Continue with other statements even if one fails

    print("\nMigration complete!")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python run_migration.py <migration_file.sql>")
        sys.exit(1)

    run_migration(sys.argv[1])
