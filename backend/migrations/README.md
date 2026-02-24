# Database Migrations

This directory contains database migration scripts for the jam-bot backend.

## Running Migrations

### User Roles Migration

To add user roles to existing users:

```bash
cd backend
python migrations/add_user_roles.py
```

This migration:
1. Adds the `role` column to the `user` table if it doesn't exist
2. Sets default role to 'user' for any users without a role
3. Shows summary of user counts by role

### Login Tokens Migration

To add login token fields for passwordless authentication:

```bash
cd backend
python migrations/add_login_tokens.py
```

This migration:
1. Adds the `login_token` column to the `users` table if it doesn't exist
2. Adds the `login_token_expires` column to the `users` table if it doesn't exist
3. Creates an index on the `login_token` column for faster lookups
4. Shows the final table structure for login token columns

### Fix User Role Enum Migration

To fix user role enum values (if you're getting enum validation errors):

```bash
cd backend
python migrations/fix_user_role_enum.py
```

This migration:
1. Converts any uppercase role values (ADMIN, USER, TESTER) to lowercase (admin, user, tester)
2. Updates the enum constraint to ensure it has the correct lowercase values
3. Verifies the final state and shows role distribution

## Notes

- The main database initialization happens automatically via `init_db()` in `main.py`
- Migrations in this directory are for one-time data updates or schema changes
- Always backup your database before running migrations in production