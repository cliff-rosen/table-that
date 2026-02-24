"""
Migration: Fix approval_status enum to match model

The original migration used 'pending' but the model uses 'awaiting_approval'.
This migration updates the ENUM to use the correct value.
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def run_migration():
    """Fix approval_status enum values."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Fixing approval_status enum in reports table...")

        # MySQL requires recreating the column to change ENUM values
        # First, update any 'pending' values to a temp value, then alter the column

        # Step 1: Alter the ENUM to include both old and new values temporarily
        print("Step 1: Expanding ENUM to include 'awaiting_approval'...")
        conn.execute(text("""
            ALTER TABLE reports
            MODIFY COLUMN approval_status ENUM('pending', 'awaiting_approval', 'approved', 'rejected')
            DEFAULT 'awaiting_approval'
        """))

        # Step 2: Update any 'pending' values to 'awaiting_approval'
        print("Step 2: Migrating 'pending' values to 'awaiting_approval'...")
        conn.execute(text("""
            UPDATE reports
            SET approval_status = 'awaiting_approval'
            WHERE approval_status = 'pending'
        """))

        # Step 3: Remove 'pending' from the ENUM (final schema)
        print("Step 3: Finalizing ENUM (removing 'pending')...")
        conn.execute(text("""
            ALTER TABLE reports
            MODIFY COLUMN approval_status ENUM('awaiting_approval', 'approved', 'rejected')
            DEFAULT 'awaiting_approval'
            NOT NULL
        """))

        conn.commit()
        print("\nMigration completed successfully!")
        print("approval_status ENUM now uses: 'awaiting_approval', 'approved', 'rejected'")


if __name__ == "__main__":
    run_migration()
