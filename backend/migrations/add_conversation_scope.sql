-- Add scope column to conversations table for scoped chat (tables_list, table:42, etc.)
ALTER TABLE conversations ADD COLUMN scope VARCHAR(100) DEFAULT NULL;
CREATE INDEX idx_conversations_scope ON conversations(scope);
