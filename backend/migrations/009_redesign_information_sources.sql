-- Migration 009: Redesign information_sources table
-- information_sources now represents actual searchable sources (PubMed, Google Scholar, etc.)
-- not tied to specific research streams

-- Drop old table and recreate with new structure
DROP TABLE IF EXISTS information_sources;

CREATE TABLE information_sources (
    source_id INT AUTO_INCREMENT PRIMARY KEY,
    source_name VARCHAR(255) NOT NULL UNIQUE,
    source_url VARCHAR(500),
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_source_name (source_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert common sources
INSERT INTO information_sources (source_name, source_url, description, is_active) VALUES
('PubMed', 'https://pubmed.ncbi.nlm.nih.gov/', 'National Library of Medicine biomedical literature database', TRUE),
('Google Scholar', 'https://scholar.google.com/', 'Google Scholar academic search engine', TRUE),
('Semantic Scholar', 'https://www.semanticscholar.org/', 'AI-powered research tool for scientific literature', TRUE),
('arXiv', 'https://arxiv.org/', 'Open-access repository of preprints', TRUE),
('bioRxiv', 'https://www.biorxiv.org/', 'Preprint server for biology', TRUE),
('medRxiv', 'https://www.medrxiv.org/', 'Preprint server for health sciences', TRUE);
