#!/usr/bin/env python3
"""Run database migration to move job_title to users table"""

from sqlalchemy import text
from database import engine

def run_migration():
    with engine.connect() as conn:
        trans = conn.begin()

        try:
            # Add job_title to users table
            print("Adding job_title column to users table...")
            conn.execute(text("""
                ALTER TABLE users
                ADD COLUMN job_title VARCHAR(255) NULL AFTER full_name
            """))

            # Migrate existing job_title data from company_profiles to users
            print("Migrating existing job_title data...")
            result = conn.execute(text("""
                UPDATE users u
                INNER JOIN company_profiles cp ON u.user_id = cp.user_id
                SET u.job_title = cp.job_title
                WHERE cp.job_title IS NOT NULL AND cp.job_title != ''
            """))
            print(f"Migrated {result.rowcount} job_title values")

            trans.commit()
            print("Migration completed successfully!")

        except Exception as e:
            trans.rollback()
            print(f"Migration failed: {e}")
            raise

if __name__ == "__main__":
    run_migration()
