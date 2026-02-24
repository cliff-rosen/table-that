-- Migration 013: Sync database schema with models
-- Removes deprecated tables and columns that are no longer in SQLAlchemy models

-- Step 1: Drop the deprecated company_profiles table
-- This table was removed as part of the user management cleanup
DROP TABLE IF EXISTS `company_profiles`;

-- Step 2: Remove profile_id from research_streams
-- CompanyProfile is no longer used; streams now use scope/org_id/user_id
ALTER TABLE `research_streams` DROP COLUMN `profile_id`;

-- Step 3: Remove stream_type from research_streams
-- Stream classification is now handled differently
ALTER TABLE `research_streams` DROP COLUMN `stream_type`;

-- Step 4: Remove source_type from articles
-- Source information is now tracked via source_id foreign key
ALTER TABLE `articles` DROP COLUMN `source_type`;
