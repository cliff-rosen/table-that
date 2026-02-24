-- Add report_id to wip_articles for linking to final reports
-- This allows us to trace back pipeline execution details for any report

ALTER TABLE wip_articles
ADD COLUMN report_id INTEGER,
ADD CONSTRAINT fk_wip_articles_report FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE;

-- Create index for faster lookups
CREATE INDEX idx_wip_articles_report_id ON wip_articles(report_id);
