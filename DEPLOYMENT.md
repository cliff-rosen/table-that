# Deployment Guide

## 1. Environments

| Component | Production | Staging (TBD) | Local Dev |
|-----------|-----------|---------------|-----------|
| **Backend** | EB: `knowledgehorizon-env` | EB: `knowledgehorizon-staging` | `localhost:8000` |
| **Frontend** | S3: `www.knowledgehorizon.ai` | S3: TBD | `localhost:5173` |
| **Database** | MariaDB: `kh2` | MariaDB: `khdev` | MariaDB: `khdev` |
| **API URL** | `https://api.knowledgehorizon.ai` | TBD | `http://localhost:8000` |

EB application: `knowledgehorizon-app` | Region: `us-east-1` | Platform: Python 3.11 on Amazon Linux 2023

---

## 2. Configuration

### Backend

`backend/config/settings.py` selects a `.env` file based on the `ENVIRONMENT` env var:

| `ENVIRONMENT` | Loads | Database | Safe? |
|---------------|-------|----------|-------|
| _(not set)_ | `.env` | `khdev` | Default -- safe |
| `staging` | `.env.staging` | `khdev` | |
| `production` | `.env.production` | `kh2` | Must be explicit |

On EB, `ENVIRONMENT` is set once via `eb setenv` and persists across all deploys. Locally it's never set, so you always get `khdev`.

`.env` is excluded from EB deploys (via `.ebignore`). `.env.production` and `.env.staging` are deployed.

### Frontend

`frontend/src/config/settings.ts` selects the API URL based on Vite's build mode (`import.meta.env.MODE`):

| Build mode | API URL | Set by |
|------------|---------|--------|
| `development` | `localhost:8000` | `npm run dev` |
| `staging` | TBD | `vite build --mode staging` |
| `production` | `api.knowledgehorizon.ai` | `vite build` / `npm run build` |

### Config files

| File | Purpose | Deployed to EB? | In git? |
|------|---------|-----------------|---------|
| `backend/.env` | Dev config | No | No |
| `backend/.env.production` | Prod config | Yes | No |
| `backend/.env.staging` | Staging config | Yes | No |
| `backend/.ebignore` | EB deploy exclusions | N/A | Yes |

---

## 3. Deploying

### Local Dev

```bash
# Backend
cd backend && venv/Scripts/python.exe -m uvicorn main:app --reload

# Frontend
cd frontend && npm run dev
```

### Staging and Production

All deployments go through `deploy.ps1` at the repo root. One command tags the commit, deploys, and logs.

```powershell
# Deploy everything to staging
.\deploy.ps1 staging

# Deploy everything to production (prompts for confirmation)
.\deploy.ps1 production

# Deploy only backend or frontend
.\deploy.ps1 staging -backend
.\deploy.ps1 production -frontend
```

What `deploy.ps1` does:
1. **Refuses to deploy** if the working tree is dirty (uncommitted changes)
2. **Tags the commit** with `<environment>/<timestamp>-<commit>` (e.g., `production/2026-02-19-143052-a1b2c3d`)
3. **Deploys backend** to EB (`eb deploy <env> --label <commit-timestamp>`)
4. **Deploys frontend** — builds with `vite build --mode <env>`, syncs to the environment's S3 bucket
5. **Pushes the tag** to origin
6. **Appends to `DEPLOY_LOG.md`** — a running record of every deployment

For production, it requires you to type "yes" before proceeding.

### Deploy log

`DEPLOY_LOG.md` is auto-maintained by `deploy.ps1`:

```
| When                | Environment | Commit  | What             |
|---------------------|-------------|---------|------------------|
| 2026-02-19 14:30:52 | staging     | a1b2c3d | backend+frontend |
| 2026-02-19 15:00:00 | production  | a1b2c3d | backend          |
```

To see what's deployed, check the log or look up the git tag:
```bash
git tag -l "production/*"     # all production deploys
git tag -l "staging/*"        # all staging deploys
git log --oneline a1b2c3d     # what's in a specific deploy
```

### Staging setup (one-time, not yet done)

1. `eb create knowledgehorizon-staging --single` (single instance to save cost)
2. `eb setenv ENVIRONMENT=staging -e knowledgehorizon-staging`
3. Create `backend/.env.staging` (copy `.env.production`, change `DB_NAME=khdev` and `FRONTEND_URL`)
4. Create staging S3 bucket, CloudFront distribution, and DNS entries
5. Add `stagingSettings` to `frontend/src/config/settings.ts`
6. Update S3 bucket name in `deploy.ps1` staging config

---

## 4. Database Schema Changes

Schema changes happen ad-hoc during development against `khdev`. There is no formal migration system. Before deploying to production, those changes must be applied to `kh2`.

### Before a production deploy

**Compare schemas:**
```bash
cd backend
venv/Scripts/python.exe migrations/dump_schemas.py
```

This outputs `migrations/schema_khdev.sql` and `migrations/schema_kh2.sql`.

**Find differences:** Send both files to an LLM and ask it to report every difference and generate the ALTER/CREATE statements needed to bring `kh2` in line with `khdev`.

**Apply changes to `kh2`:**
```bash
set ENVIRONMENT=production
venv/Scripts/python.exe -c "
from database import async_engine
from sqlalchemy import text
import asyncio
async def run():
    async with async_engine.begin() as conn:
        await conn.execute(text('ALTER TABLE ...'))
        print('Done')
asyncio.run(run())
"
set ENVIRONMENT=
```

Or connect to `kh2` directly via MySQL Workbench.

**Deploy the code**, then re-run `dump_schemas.py` to verify the schemas match.

### How `ENVIRONMENT` targets a database from your local machine

Any script that imports from `database.py` connects to whatever `ENVIRONMENT` resolves to:

- `ENVIRONMENT` not set -> `khdev`
- `ENVIRONMENT=production` -> `kh2`

Always unset `ENVIRONMENT` when done.
