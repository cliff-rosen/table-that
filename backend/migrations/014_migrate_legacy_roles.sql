-- Migration 014: Convert legacy user roles to new roles
-- Legacy roles: admin, user, tester
-- New roles: platform_admin, org_admin, member

-- Step 1: Convert 'admin' to 'platform_admin'
UPDATE users SET role = 'platform_admin' WHERE role = 'admin';

-- Step 2: Convert 'user' to 'member'
UPDATE users SET role = 'member' WHERE role = 'user';

-- Step 3: Convert 'tester' to 'member'
UPDATE users SET role = 'member' WHERE role = 'tester';

-- Step 4: Clear org_id for platform admins (they are above all orgs)
UPDATE users SET org_id = NULL WHERE role = 'platform_admin';
