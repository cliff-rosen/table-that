-- Migration: Add job_title to users table and remove from company_profiles
-- job_title is a user attribute, not a company attribute

-- Add job_title to users table
ALTER TABLE users
ADD COLUMN job_title VARCHAR(255) NULL AFTER full_name;

-- Migrate existing job_title data from company_profiles to users
UPDATE users u
INNER JOIN company_profiles cp ON u.user_id = cp.user_id
SET u.job_title = cp.job_title
WHERE cp.job_title IS NOT NULL AND cp.job_title != '';

-- Remove job_title from company_profiles (optional, can keep for backward compatibility)
-- ALTER TABLE company_profiles DROP COLUMN job_title;
