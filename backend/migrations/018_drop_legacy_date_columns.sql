-- Migration: Drop legacy date columns from articles and wip_articles
-- These columns were replaced by pub_year/pub_month/pub_day in migration 017.
-- Data was already migrated in that migration. All code now uses pub_year/month/day.

-- Drop from articles table
ALTER TABLE articles DROP COLUMN IF EXISTS publication_date;
ALTER TABLE articles DROP COLUMN IF EXISTS year;

-- Drop from wip_articles table
ALTER TABLE wip_articles DROP COLUMN IF EXISTS publication_date;
ALTER TABLE wip_articles DROP COLUMN IF EXISTS year;
