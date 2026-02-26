# Deployment Guide

## Architecture

- **Backend**: FastAPI on AWS Elastic Beanstalk (Gunicorn + Uvicorn workers)
- **Frontend**: Static build on S3/CloudFront (or similar)
- **Database**: MySQL on AWS RDS (`us-east-2`)
- **Region**: EB environment runs in `us-east-1`

### URLs

| Service | URL |
|---------|-----|
| Frontend | `https://tablethat.ironcliff.ai` |
| Backend API | `https://tablethat-api.ironcliff.ai` |
| API Docs | `https://tablethat-api.ironcliff.ai/docs` |

---

## Backend Deployment (Elastic Beanstalk)

### How Environment Config Works

The backend uses a **two-file env strategy** controlled by a single EB environment variable:

```
ENVIRONMENT=production  →  loads .env.production
ENVIRONMENT unset        →  loads .env (local dev)
```

This logic lives in `backend/config/settings.py`:

```python
_is_production = os.environ.get("ENVIRONMENT") == "production"

if _is_production:
    load_dotenv(_backend_dir / ".env.production", override=True)
else:
    load_dotenv(_backend_dir / ".env", override=True)
```

### Critical: EB Environment Variable

The **only** env var that must be set in the EB environment properties is:

```
ENVIRONMENT=production
```

Everything else is loaded from `.env.production` which is deployed with the app bundle. Without this variable, the app tries to load `.env` (which doesn't exist on EB), all required settings are `None`, and the app crashes on startup with a 502 Bad Gateway.

### Setting the EB Variable

Via AWS CLI:
```bash
aws elasticbeanstalk update-environment \
  --environment-id e-p5kewypv28 \
  --region us-east-1 \
  --option-settings "Namespace=aws:elasticbeanstalk:application:environment,OptionName=ENVIRONMENT,Value=production"
```

Via EB Console:
1. Go to Elastic Beanstalk → `table-that-env`
2. Configuration → Software → Environment properties
3. Add `ENVIRONMENT` = `production`

### EB Environment Details

| Setting | Value |
|---------|-------|
| Application | `table-that-app` |
| Environment | `table-that-env` |
| Environment ID | `e-p5kewypv28` |
| Platform | Python 3.14 on Amazon Linux 2023 |
| Region | `us-east-1` |

### Deployment Files

```
backend/
├── .elasticbeanstalk/config.yml    # EB CLI config
├── .ebextensions/
│   ├── 02_python.config            # WSGIPath = application:application
│   └── alb.config                  # ALB idle timeout (300s for LLM requests)
├── .platform/nginx/conf.d/
│   └── timeout.conf                # Nginx timeouts (300s) + buffer sizes
├── Procfile                        # gunicorn --worker-class uvicorn.workers.UvicornWorker
├── .env.production                 # Production env vars (deployed with bundle)
└── .env                            # Local dev env vars (NOT deployed)
```

### Troubleshooting

**502 Bad Gateway**
The app isn't starting. Pull logs:
```bash
aws elasticbeanstalk request-environment-info --environment-id e-p5kewypv28 --info-type tail --region us-east-1
aws elasticbeanstalk retrieve-environment-info --environment-id e-p5kewypv28 --info-type tail --region us-east-1
```
Common cause: `ENVIRONMENT=production` not set in EB, so `.env.production` isn't loaded.

**CORS errors**
If the API returns no CORS headers at all, it's likely a 502 (app not running), not a CORS config issue. Check the backend health first: `https://tablethat-api.ironcliff.ai/docs`

**Health check**
EB health should be Green. Check via:
```bash
aws elasticbeanstalk describe-environments --environment-id e-p5kewypv28 --region us-east-1
```

---

## Frontend Deployment

Production API URL is configured in `frontend/.env.production`:
```
VITE_API_URL=https://tablethat-api.ironcliff.ai
```

Build for production:
```bash
cd frontend
npm run build
```

The output in `dist/` is deployed to static hosting.
