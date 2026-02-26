# Deployment Guide

## Architecture

| Component | Stack | Where |
|-----------|-------|-------|
| Frontend | React/Vite static build | S3 bucket → `tablethat.ironcliff.ai` |
| Backend | FastAPI (Gunicorn + Uvicorn) | Elastic Beanstalk → `tablethat-api.ironcliff.ai` |
| Database | MySQL 8.0 | AWS RDS in `us-east-2` |
| EB Region | `us-east-1` | |

### URLs

| Service | URL |
|---------|-----|
| Frontend | `https://tablethat.ironcliff.ai` |
| Backend API | `https://tablethat-api.ironcliff.ai` |
| API Docs | `https://tablethat-api.ironcliff.ai/docs` |
| Health Check | `https://tablethat-api.ironcloff.ai/api/health` |

---

## How to Deploy

Everything goes through one script at the repo root. You must have no uncommitted changes.

### Deploy everything (most common)

```powershell
.\deploy.ps1
```

### Deploy only frontend or backend

```powershell
.\deploy.ps1 -Frontend     # S3 only
.\deploy.ps1 -Backend      # EB only
```

### Redeploy without a new version tag

```powershell
.\deploy.ps1 -SkipTag
```

### What happens when you run `.\deploy.ps1`

Here's the exact sequence:

```
1. PREFLIGHT
   ├─ Checks you're in the repo root
   └─ Checks for uncommitted changes (fails if dirty)

2. VERSION TAG
   ├─ Reads latest git tag (e.g., v1.0.3)
   ├─ Auto-increments patch → v1.0.4
   ├─ Shows version + commit + deploy scope
   ├─ Asks for confirmation (y/n)
   ├─ Creates annotated tag: git tag -a v1.0.4 -m "Release v1.0.4"
   └─ Pushes tag to GitHub: git push origin v1.0.4

3. FRONTEND DEPLOY
   ├─ cd frontend/
   ├─ Writes VITE_APP_VERSION=v1.0.4 into .env.production
   ├─ npm run build (Vite bakes version into the JS bundle)
   ├─ aws s3 sync dist/ s3://tablethat.ironcliff.ai --delete
   └─ Old assets are removed, new ones uploaded

4. BACKEND DEPLOY
   ├─ cd backend/
   ├─ Writes v1.0.4 to BUILD_VERSION file
   ├─ eb deploy (packages code + BUILD_VERSION into zip, uploads to EB)
   ├─ EB launches a NEW instance alongside the old one (immutable deploy)
   ├─ EB health-checks the new instance
   ├─ If healthy → traffic swaps to new instance, old instance terminates
   └─ If unhealthy → new instance is killed, old instance stays (auto-rollback)

5. DONE
   └─ Prints verification URLs
```

### After deploying

Verify:
- Frontend: visit `https://tablethat.ironcliff.ai` — should load
- Backend: visit `https://tablethat-api.ironcliff.ai/api/health` — should return `{"status": "healthy", "version": "v1.0.4"}`
- Version check: users with the app open will see a blue "New version available — Refresh now" banner within 60 seconds

---

## Version Tracking

### How it works

Every deploy creates a git tag (`v1.0.0`, `v1.0.1`, etc.) that becomes the version string everywhere:

| System | How it gets the version |
|--------|------------------------|
| **Git/GitHub** | Annotated tag on the commit (e.g., `v1.0.4`) |
| **Frontend JS bundle** | `VITE_APP_VERSION` baked in at build time via `.env.production` |
| **Backend /api/health** | Reads `BUILD_VERSION` file → git tag → git SHA (in that order) |
| **Browser version check** | Frontend polls `/api/health` every 60s; when response version differs from baked-in version, shows refresh banner |

### Viewing versions

```powershell
# Latest version tag
git tag -l "v*" --sort=-version:refname | head -1

# All version tags
git tag -l "v*" --sort=-version:refname

# What's deployed to backend right now
curl https://tablethat-api.ironcliff.ai/api/health

# What version a user's browser has
# (visible in browser console: import.meta.env.VITE_APP_VERSION)
```

### Bumping major/minor versions

The deploy script auto-increments the patch number. To bump major or minor, manually create the tag before deploying:

```powershell
git tag -a v2.0.0 -m "Release v2.0.0"
git push origin v2.0.0
.\deploy.ps1 -SkipTag
```

---

## Zero-Downtime Backend Deploys

The backend uses **immutable deployments** via `.ebextensions/deployment.config`:

```yaml
option_settings:
  aws:elasticbeanstalk:command:
    DeploymentPolicy: Immutable
    HealthCheckSuccessThreshold: Ok
    Timeout: 600
```

This means:
- EB launches a fresh instance with the new code
- Health-checks it (hits `/api/health`)
- Only after it passes does traffic swap to the new instance
- Old instance is terminated
- If the new instance fails health checks, it's killed and the old one stays

**Result:** Users never see downtime during a deploy.

---

## Browser Auto-Refresh

When a new version is deployed:

1. The frontend has `VITE_APP_VERSION=v1.0.3` baked into the JS bundle
2. A `useVersionCheck` hook polls `GET /api/health` every 60 seconds
3. When the backend returns `v1.0.4` but the frontend has `v1.0.3`, a blue banner appears at the top of the screen: **"A new version is available. Refresh now"**
4. Clicking the banner reloads the page, loading the new frontend from S3

The poll only runs in production (`VITE_APP_VERSION !== 'dev'`). In local dev, it's disabled.

---

## Backend Configuration

### Environment Strategy

Two-file env strategy controlled by a single EB environment variable:

```
ENVIRONMENT=production  →  loads .env.production
ENVIRONMENT unset        →  loads .env (local dev)
```

### Critical: EB Environment Variable

The **only** env var that must be set in the EB console is:

```
ENVIRONMENT=production
```

Everything else is in `.env.production` which deploys with the code bundle.

### Setting the EB Variable

Via AWS CLI:
```bash
aws elasticbeanstalk update-environment \
  --environment-id e-p5kewypv28 \
  --region us-east-1 \
  --option-settings "Namespace=aws:elasticbeanstalk:application:environment,OptionName=ENVIRONMENT,Value=production"
```

Via EB Console:
1. Elastic Beanstalk → `table-that-env` → Configuration → Software
2. Environment properties → `ENVIRONMENT` = `production`

### EB Environment Details

| Setting | Value |
|---------|-------|
| Application | `table-that-app` |
| Environment | `table-that-env` |
| Environment ID | `e-p5kewypv28` |
| Platform | Python 3.14 on Amazon Linux 2023 |
| Region | `us-east-1` |

### Key Backend Files

```
backend/
├── .elasticbeanstalk/config.yml       # EB CLI config
├── .ebextensions/
│   ├── 02_python.config               # WSGIPath = application:application
│   ├── alb.config                     # ALB idle timeout (300s)
│   └── deployment.config              # Immutable deploy policy
├── .platform/nginx/conf.d/
│   └── timeout.conf                   # Nginx timeouts (300s) + buffer sizes
├── Procfile                           # gunicorn + uvicorn workers
├── .env.production                    # Production env vars (deployed)
├── .env                               # Local dev env vars (NOT deployed)
├── BUILD_VERSION                      # Written by deploy script (version tag)
└── config/settings.py                 # Reads BUILD_VERSION for /api/health
```

---

## Troubleshooting

### 502 Bad Gateway

The app isn't starting. Pull logs:
```bash
aws elasticbeanstalk request-environment-info \
  --environment-id e-p5kewypv28 --info-type tail --region us-east-1
aws elasticbeanstalk retrieve-environment-info \
  --environment-id e-p5kewypv28 --info-type tail --region us-east-1
```
Common cause: `ENVIRONMENT=production` not set in EB.

### CORS errors

If the API returns no CORS headers, it's likely a 502 (app not running), not a CORS issue. Check health first: `https://tablethat-api.ironcliff.ai/api/health`

### EB health check

```bash
aws elasticbeanstalk describe-environments \
  --environment-id e-p5kewypv28 --region us-east-1
```

### Deploy rollback

Immutable deploys auto-rollback if the new instance fails health checks. To manually roll back to a previous version:

```bash
# List recent EB application versions
aws elasticbeanstalk describe-application-versions \
  --application-name table-that-app --region us-east-1 \
  --query 'ApplicationVersions[0:5].[VersionLabel,DateCreated]' --output table

# Deploy a specific previous version
cd backend
eb deploy --version <version-label>
```

For frontend, redeploy from a previous git tag:
```powershell
git checkout v1.0.3
.\deploy.ps1 -Frontend -SkipTag
git checkout master
```
