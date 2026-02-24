-- Migration 013b: Drop foreign key and company_profiles table
-- Must run after 013_sync_schema_cleanup.sql

-- Step 1: Drop the foreign key constraint on research_streams.profile_id
ALTER TABLE `research_streams` DROP FOREIGN KEY `research_streams_ibfk_2`;

-- Step 2: Now we can drop the profile_id column
ALTER TABLE `research_streams` DROP COLUMN `profile_id`;

-- Step 3: Finally drop the company_profiles table
DROP TABLE IF EXISTS `company_profiles`;
