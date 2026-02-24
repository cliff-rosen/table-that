-- Migration: Add honest pub_year/pub_month/pub_day fields
-- Replaces fabricated publication_date precision with separate fields that track actual precision

-- Add new columns to articles table
ALTER TABLE articles ADD COLUMN pub_year INT NULL;
ALTER TABLE articles ADD COLUMN pub_month INT NULL;
ALTER TABLE articles ADD COLUMN pub_day INT NULL;

-- Add new columns to wip_articles table
ALTER TABLE wip_articles ADD COLUMN pub_year INT NULL;
ALTER TABLE wip_articles ADD COLUMN pub_month INT NULL;
ALTER TABLE wip_articles ADD COLUMN pub_day INT NULL;

-- Migrate existing data from publication_date (best effort - we know some precision is fake)
UPDATE articles SET
    pub_year = YEAR(publication_date),
    pub_month = MONTH(publication_date),
    pub_day = DAY(publication_date)
WHERE publication_date IS NOT NULL;

UPDATE wip_articles SET
    pub_year = YEAR(publication_date),
    pub_month = MONTH(publication_date),
    pub_day = DAY(publication_date)
WHERE publication_date IS NOT NULL;

-- Also migrate from year column if pub_year is still null (year is stored as string)
UPDATE articles SET
    pub_year = CAST(year AS UNSIGNED)
WHERE pub_year IS NULL AND year IS NOT NULL AND year != '';

UPDATE wip_articles SET
    pub_year = CAST(year AS UNSIGNED)
WHERE pub_year IS NULL AND year IS NOT NULL AND year != '';
