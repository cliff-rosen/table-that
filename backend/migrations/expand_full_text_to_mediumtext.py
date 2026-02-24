"""
Migration: Expand full_text columns from TEXT (64KB) to MEDIUMTEXT (16MB)

The TEXT type is too small for full article content. Articles fetched from
PubMed Central or publisher sites can easily exceed 64KB.
"""

import sys
import os

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Alter full_text columns to MEDIUMTEXT."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.begin() as conn:
        for table in ['wip_articles', 'articles']:
            print(f"Altering {table}.full_text to MEDIUMTEXT...")
            conn.execute(text(f"ALTER TABLE {table} MODIFY COLUMN full_text MEDIUMTEXT"))
            print(f"  Done.")

    print("Migration complete.")


if __name__ == "__main__":
    run_migration()
