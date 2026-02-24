-- Migration 007: Remove CompanyProfile table and references
-- This migration removes the deprecated company_profiles table and profile_id column

-- Step 1: Drop the profile_id column from research_streams
-- SQLite doesn't support DROP COLUMN directly, so we need to recreate the table
-- For now, we'll just set all profile_id values to NULL (the column will be ignored by SQLAlchemy)

-- If using PostgreSQL or MySQL, you could do:
-- ALTER TABLE research_streams DROP COLUMN profile_id;
-- DROP TABLE IF EXISTS company_profiles;

-- For SQLite, we mark this as a no-op since SQLAlchemy will ignore the column
-- The table and column will remain in the database but won't be used
-- A full cleanup would require recreating the research_streams table

-- Set all profile_id values to NULL (cleanup)
UPDATE research_streams SET profile_id = NULL WHERE profile_id IS NOT NULL;

-- Note: To fully remove the column in SQLite, you would need to:
-- 1. Create a new table without the column
-- 2. Copy data from old table to new table
-- 3. Drop old table
-- 4. Rename new table
-- This is not done here to avoid data loss risk
