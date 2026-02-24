-- Migration 015: Add default organization and invitations table
--
-- Changes:
-- 1. Create a default organization for new user registrations
-- 2. Add invitations table for user invitations
-- 3. Assign existing orphan users (members with no org) to default org

-- Create default organization if it doesn't exist
INSERT INTO organizations (name, is_active, created_at, updated_at)
SELECT 'Default Organization', true, NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM organizations WHERE name = 'Default Organization'
);

-- Create invitations table
CREATE TABLE IF NOT EXISTS invitations (
    invitation_id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    token VARCHAR(255) NOT NULL UNIQUE,
    org_id INTEGER REFERENCES organizations(org_id) ON DELETE CASCADE,
    role VARCHAR(50) NOT NULL DEFAULT 'member',
    invited_by INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    is_revoked BOOLEAN DEFAULT FALSE
);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- Assign orphan members (users with role='member' and no org) to default org
UPDATE users
SET org_id = (SELECT org_id FROM organizations WHERE name = 'Default Organization' LIMIT 1)
WHERE role = 'member' AND org_id IS NULL;
