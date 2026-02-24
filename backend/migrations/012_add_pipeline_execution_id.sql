-- Add pipeline_execution_id to track unique pipeline runs
-- This allows linking wip_articles to reports even when multiple test runs exist

-- Add to reports table
ALTER TABLE reports
ADD COLUMN pipeline_execution_id VARCHAR(36) COMMENT 'UUID linking to pipeline execution';

-- Add to wip_articles table (NOT NULL since every wip_article is from an execution)
ALTER TABLE wip_articles
ADD COLUMN pipeline_execution_id VARCHAR(36) NOT NULL COMMENT 'UUID of the pipeline execution that created this article';

-- Create indexes for fast lookups
CREATE INDEX idx_reports_pipeline_execution_id ON reports(pipeline_execution_id);
CREATE INDEX idx_wip_articles_pipeline_execution_id ON wip_articles(pipeline_execution_id);

-- Drop the report_id foreign key we added earlier (no longer needed)
ALTER TABLE wip_articles
DROP FOREIGN KEY fk_wip_articles_report,
DROP COLUMN report_id;
