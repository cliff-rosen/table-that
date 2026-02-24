-- Migration 007: Add PubMed-specific fields to articles table
-- This adds fields that were present in the prior articles schema

-- Add PubMed ID
ALTER TABLE articles
ADD COLUMN pmid VARCHAR(20) NULL;

-- Add abstract (separate from summary)
ALTER TABLE articles
ADD COLUMN abstract TEXT NULL;

-- Add completion date
ALTER TABLE articles
ADD COLUMN comp_date DATE NULL;

-- Add publication metadata
ALTER TABLE articles
ADD COLUMN year VARCHAR(4) NULL;

ALTER TABLE articles
ADD COLUMN journal VARCHAR(255) NULL;

ALTER TABLE articles
ADD COLUMN volume VARCHAR(50) NULL;

ALTER TABLE articles
ADD COLUMN issue VARCHAR(50) NULL;

ALTER TABLE articles
ADD COLUMN medium VARCHAR(100) NULL;

ALTER TABLE articles
ADD COLUMN pages VARCHAR(50) NULL;

-- Add identifiers
ALTER TABLE articles
ADD COLUMN poi VARCHAR(255) NULL;

ALTER TABLE articles
ADD COLUMN doi VARCHAR(255) NULL;

-- Add metadata flag
ALTER TABLE articles
ADD COLUMN is_systematic BOOLEAN DEFAULT FALSE;

-- Create index on pmid for lookups
CREATE INDEX idx_articles_pmid ON articles(pmid);

-- Create index on doi for lookups
CREATE INDEX idx_articles_doi ON articles(doi);
