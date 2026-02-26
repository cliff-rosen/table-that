# =============================================================================
# table.that — Unified Deploy Script
#
# Usage:
#   .\deploy.ps1                  Deploy both frontend + backend
#   .\deploy.ps1 -Frontend        Deploy frontend only
#   .\deploy.ps1 -Backend         Deploy backend only
#   .\deploy.ps1 -SkipTag         Deploy without creating a new version tag
#
# What this does:
#   1. Auto-increments version tag (v1.0.0 → v1.0.1)
#   2. Tags the commit and pushes to GitHub
#   3. Builds frontend with version baked in, syncs to S3
#   4. Deploys backend to Elastic Beanstalk (immutable deploy)
# =============================================================================

param(
    [switch]$Frontend,
    [switch]$Backend,
    [switch]$SkipTag
)

$ErrorActionPreference = "Stop"

# If neither flag is set, deploy both
if (-not $Frontend -and -not $Backend) {
    $Frontend = $true
    $Backend = $true
}

# ── Configuration ──────────────────────────────────────────────────────────
$S3_BUCKET = "tablethat.ironcliff.ai"
$FRONTEND_DIR = "frontend"
$BACKEND_DIR = "backend"

# ── Preflight checks ──────────────────────────────────────────────────────

# Must be in repo root
if (-not (Test-Path ".git")) {
    Write-Host "Error: Run this from the repo root (where .git is)" -ForegroundColor Red
    exit 1
}

# Check for uncommitted changes
$status = git status --porcelain
if ($status) {
    Write-Host "Error: You have uncommitted changes. Commit or stash first." -ForegroundColor Red
    git status --short
    exit 1
}

# ── Version tagging ───────────────────────────────────────────────────────

if (-not $SkipTag) {
    # Get latest version tag
    $latestTag = git tag -l "v*" --sort=-version:refname | Select-Object -First 1

    if ($latestTag) {
        # Parse and increment patch version
        $parts = $latestTag.TrimStart("v").Split(".")
        $major = [int]$parts[0]
        $minor = [int]$parts[1]
        $patch = [int]$parts[2] + 1
        $newTag = "v$major.$minor.$patch"
    } else {
        $newTag = "v1.0.0"
        Write-Host "No existing version tags found. Starting at v1.0.0" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Version: $newTag" -ForegroundColor Cyan
    Write-Host "Commit:  $(git rev-parse --short HEAD)" -ForegroundColor Cyan
    Write-Host "Deploy:  $(if ($Frontend -and $Backend) { 'frontend + backend' } elseif ($Frontend) { 'frontend only' } else { 'backend only' })" -ForegroundColor Cyan
    Write-Host ""

    # Confirm
    $confirm = Read-Host "Proceed? (y/n)"
    if ($confirm -ne "y") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }

    # Create and push tag
    Write-Host "Tagging $newTag..." -ForegroundColor Yellow
    git tag -a $newTag -m "Release $newTag"
    git push origin $newTag

    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to push tag!" -ForegroundColor Red
        exit 1
    }

    Write-Host "Tag $newTag pushed to GitHub" -ForegroundColor Green
    $VERSION = $newTag
} else {
    # Use latest existing tag or SHA
    $VERSION = git tag -l "v*" --sort=-version:refname | Select-Object -First 1
    if (-not $VERSION) {
        $VERSION = git rev-parse --short HEAD
    }
    Write-Host "Deploying with existing version: $VERSION (no new tag)" -ForegroundColor Yellow
}

# ── Frontend deploy ───────────────────────────────────────────────────────

if ($Frontend) {
    Write-Host ""
    Write-Host "═══ Frontend Deploy ═══" -ForegroundColor Magenta

    Push-Location $FRONTEND_DIR

    # Stamp version into .env.production
    Write-Host "Stamping VITE_APP_VERSION=$VERSION" -ForegroundColor Cyan
    $envContent = Get-Content .env.production -Raw
    $envContent = $envContent -replace 'VITE_APP_VERSION=.*', "VITE_APP_VERSION=$VERSION"
    Set-Content .env.production $envContent -NoNewline

    # Build
    Write-Host "Building frontend..." -ForegroundColor Yellow
    npm run build

    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Frontend build failed!" -ForegroundColor Red
        exit 1
    }

    # Deploy to S3
    Write-Host "Syncing to s3://$S3_BUCKET..." -ForegroundColor Yellow
    aws s3 sync dist/ "s3://$S3_BUCKET" --delete

    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "S3 sync failed!" -ForegroundColor Red
        exit 1
    }

    Pop-Location
    Write-Host "Frontend deployed ($VERSION)" -ForegroundColor Green
}

# ── Backend deploy ────────────────────────────────────────────────────────

if ($Backend) {
    Write-Host ""
    Write-Host "═══ Backend Deploy ═══" -ForegroundColor Magenta

    Push-Location $BACKEND_DIR

    # Set BUILD_VERSION so settings.py picks it up on EB
    # (EB reads git tags from the deployed code, but as a fallback we also
    #  write it to a file that settings.py can read)
    Write-Host "Writing version file: $VERSION" -ForegroundColor Cyan
    Set-Content -Path "BUILD_VERSION" -Value $VERSION -NoNewline

    # Deploy via EB CLI
    Write-Host "Deploying to Elastic Beanstalk (immutable)..." -ForegroundColor Yellow
    eb deploy

    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "EB deploy failed!" -ForegroundColor Red
        exit 1
    }

    Pop-Location
    Write-Host "Backend deployed ($VERSION)" -ForegroundColor Green
}

# ── Done ──────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║  Deploy complete: $VERSION             ║" -ForegroundColor Green
Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "Verify:"
Write-Host "  Frontend: https://tablethat.ironcliff.ai" -ForegroundColor Cyan
Write-Host "  Backend:  https://tablethat-api.ironcliff.ai/api/health" -ForegroundColor Cyan
