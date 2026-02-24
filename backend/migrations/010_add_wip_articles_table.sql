-- Migration 010: Add wip_articles table for test pipeline staging
-- This table holds intermediate retrieval results for audit trail and debugging

CREATE TABLE wip_articles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    research_stream_id INT NOT NULL,
    retrieval_group_id VARCHAR(255) NOT NULL,
    source_id INT NOT NULL,

    -- Article data (mirroring articles table structure)
    title VARCHAR(500) NOT NULL,
    url VARCHAR(1000),
    authors JSON,
    publication_date DATE,
    abstract TEXT,
    summary TEXT,
    full_text TEXT,

    -- PubMed-specific fields
    pmid VARCHAR(20),
    doi VARCHAR(255),
    journal VARCHAR(255),
    volume VARCHAR(50),
    issue VARCHAR(50),
    pages VARCHAR(50),
    year VARCHAR(4),

    -- Metadata
    article_metadata JSON,

    -- Processing status fields
    is_duplicate BOOLEAN DEFAULT FALSE,
    duplicate_of_id INT,
    passed_semantic_filter BOOLEAN DEFAULT NULL,
    filter_rejection_reason TEXT,
    included_in_report BOOLEAN DEFAULT FALSE,
    presentation_categories JSON,

    -- Timestamps
    retrieved_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    FOREIGN KEY (research_stream_id) REFERENCES research_streams(stream_id) ON DELETE CASCADE,
    FOREIGN KEY (source_id) REFERENCES information_sources(source_id),
    FOREIGN KEY (duplicate_of_id) REFERENCES wip_articles(id) ON DELETE SET NULL,

    -- Indexes for performance
    INDEX idx_stream_group (research_stream_id, retrieval_group_id),
    INDEX idx_source (source_id),
    INDEX idx_doi (doi),
    INDEX idx_pmid (pmid),
    INDEX idx_duplicate (is_duplicate),
    INDEX idx_filter_status (passed_semantic_filter),
    INDEX idx_included (included_in_report)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add run_type column to reports table to track test vs scheduled runs
ALTER TABLE reports
ADD COLUMN run_type ENUM('test', 'scheduled', 'manual') DEFAULT 'scheduled',
ADD COLUMN pipeline_metrics JSON COMMENT 'Metrics from pipeline execution (retrieved, deduped, filtered counts)';

-- Add presentation_category column to report_article_associations
ALTER TABLE report_article_associations
ADD COLUMN presentation_categories JSON COMMENT 'List of presentation category IDs this article was assigned to';
