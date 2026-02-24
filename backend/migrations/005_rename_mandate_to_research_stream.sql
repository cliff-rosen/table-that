-- Migration: Rename mandate_id to research_stream_id in reports table
-- This aligns the reports table with the new research_streams architecture

-- Rename the column
ALTER TABLE reports
CHANGE COLUMN mandate_id research_stream_id INT;

-- Update the foreign key constraint if it exists
-- First, check if there's an existing foreign key and drop it
SET @fk_name = (
    SELECT CONSTRAINT_NAME
    FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'reports'
    AND COLUMN_NAME = 'research_stream_id'
    AND REFERENCED_TABLE_NAME IS NOT NULL
    LIMIT 1
);

SET @drop_fk = IF(@fk_name IS NOT NULL,
    CONCAT('ALTER TABLE reports DROP FOREIGN KEY ', @fk_name),
    'SELECT "No foreign key to drop"');

PREPARE stmt FROM @drop_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add the new foreign key constraint to research_streams
ALTER TABLE reports
ADD CONSTRAINT fk_reports_research_stream
FOREIGN KEY (research_stream_id) REFERENCES research_streams(stream_id)
ON DELETE SET NULL;
