-- Migration: Add user_article_stars table for per-user article starring
-- This enables users to star articles within reports, with each user's stars being personal

-- Create the user_article_stars table
CREATE TABLE IF NOT EXISTS user_article_stars (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    report_id INTEGER NOT NULL REFERENCES reports(report_id) ON DELETE CASCADE,
    article_id INTEGER NOT NULL REFERENCES articles(article_id) ON DELETE CASCADE,
    starred_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, report_id, article_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_user_article_stars_user ON user_article_stars(user_id);
CREATE INDEX IF NOT EXISTS idx_user_article_stars_report ON user_article_stars(report_id);
CREATE INDEX IF NOT EXISTS idx_user_article_stars_article ON user_article_stars(article_id);

-- Note: The existing is_starred column on report_article_associations is deprecated
-- but left in place for backward compatibility. New code should use user_article_stars.
