-- Migration 008: Add new source types to source_type ENUM
-- Adds PUBMED, GOOGLE_SCHOLAR, RSS_FEED, WEB_SCRAPE, MANUAL, OTHER

-- Modify the ENUM in articles table
ALTER TABLE articles
MODIFY COLUMN source_type ENUM(
    'PUBMED',
    'JOURNAL',
    'NEWS',
    'REGULATORY',
    'CLINICAL',
    'PATENT',
    'COMPANY',
    'PREPRINT',
    'CONFERENCE',
    'GOOGLE_SCHOLAR',
    'RSS_FEED',
    'WEB_SCRAPE',
    'MANUAL',
    'OTHER'
) NULL;

-- Modify the ENUM in information_sources table
ALTER TABLE information_sources
MODIFY COLUMN source_type ENUM(
    'PUBMED',
    'JOURNAL',
    'NEWS',
    'REGULATORY',
    'CLINICAL',
    'PATENT',
    'COMPANY',
    'PREPRINT',
    'CONFERENCE',
    'GOOGLE_SCHOLAR',
    'RSS_FEED',
    'WEB_SCRAPE',
    'MANUAL',
    'OTHER'
) NULL;
