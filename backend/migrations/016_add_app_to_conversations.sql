-- Migration: Add app column to conversations table
-- Purpose: Scope conversations to specific apps (kh, tablizer, trialscout)

-- Add the app column with default value for existing rows
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS app VARCHAR(50) NOT NULL DEFAULT 'kh';

-- Create index for efficient filtering by app
CREATE INDEX IF NOT EXISTS ix_conversations_app ON conversations(app);

-- Create composite index for user + app queries
CREATE INDEX IF NOT EXISTS ix_conversations_user_app ON conversations(user_id, app);
