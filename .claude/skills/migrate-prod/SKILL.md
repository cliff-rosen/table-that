---
name: migrate-prod
description: Run database migration scripts against the PRODUCTION database (kh2).
---

# Run Production Database Migrations

## Arguments
$ARGUMENTS — one or more migration script filenames from `backend/migrations/`

## Instructions

If no arguments provided, list available migrations:
- Run: `ls backend/migrations/*.py` and display the list

For each script name provided:
1. Verify the file exists at `backend/migrations/<name>`
2. Run: `ENVIRONMENT=production backend/venv/Scripts/python.exe backend/migrations/<name>`
3. Report the result (success/skip/error)

Always use `ENVIRONMENT=production` — this makes settings.py load `.env.production` which targets the `kh2` production database.
