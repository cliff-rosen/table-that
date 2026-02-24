# deploy.ps1 — Tag, deploy, and log in one move.
#
# Usage:
#   .\deploy.ps1 staging              # deploy backend + frontend to staging
#   .\deploy.ps1 production           # deploy backend + frontend to production
#   .\deploy.ps1 staging -backend     # backend only
#   .\deploy.ps1 staging -frontend    # frontend only
#
# What it does:
#   1. Refuses to deploy if working tree is dirty
#   2. Creates a git tag: staging/2026-02-19-143052-a1b2c3d
#   3. Deploys backend to EB and/or frontend to S3
#   4. Appends to DEPLOY_LOG.md
#   5. Pushes the tag to origin

param(
    [Parameter(Mandatory=$true, Position=0)]
    [ValidateSet("staging", "production")]
    [string]$Environment,

    [switch]$backend,
    [switch]$frontend
)

$ErrorActionPreference = "Stop"

# If neither flag specified, deploy both
if (-not $backend -and -not $frontend) {
    $backend = $true
    $frontend = $true
}

# --- Environment config ---
$config = @{
    staging = @{
        eb_env    = "knowledgehorizon-staging"
        s3_bucket = "TBD"  # TODO: set staging S3 bucket
        vite_mode = "staging"
    }
    production = @{
        eb_env    = "knowledgehorizon-env"
        s3_bucket = "www.knowledgehorizon.ai"
        vite_mode = "production"
    }
}

$env_config = $config[$Environment]

# --- Preflight checks ---
$dirty = git status --porcelain
if ($dirty) {
    Write-Host "ERROR: Working tree is dirty. Commit or stash changes before deploying." -ForegroundColor Red
    git status --short
    exit 1
}

$commit_hash = git rev-parse --short HEAD
$commit_full = git rev-parse HEAD
$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$tag_name = "$Environment/$timestamp-$commit_hash"

Write-Host ""
Write-Host "=== Deploy to $Environment ===" -ForegroundColor Cyan
Write-Host "  Commit:    $commit_hash" -ForegroundColor Gray
Write-Host "  Tag:       $tag_name" -ForegroundColor Gray
Write-Host "  Backend:   $($backend)" -ForegroundColor Gray
Write-Host "  Frontend:  $($frontend)" -ForegroundColor Gray
Write-Host "  EB env:    $($env_config.eb_env)" -ForegroundColor Gray
if ($frontend) {
    Write-Host "  S3 bucket: $($env_config.s3_bucket)" -ForegroundColor Gray
}
Write-Host ""

# Confirm production deploys
if ($Environment -eq "production") {
    $confirm = Read-Host "Deploy to PRODUCTION? Type 'yes' to confirm"
    if ($confirm -ne "yes") {
        Write-Host "Aborted." -ForegroundColor Yellow
        exit 0
    }
}

# --- Create git tag ---
Write-Host "Tagging $tag_name..." -ForegroundColor Yellow
git tag $tag_name
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to create tag" -ForegroundColor Red
    exit 1
}

# --- Deploy backend ---
if ($backend) {
    Write-Host "Deploying backend to $($env_config.eb_env)..." -ForegroundColor Yellow
    Push-Location backend
    eb deploy $env_config.eb_env --label "$commit_hash-$timestamp"
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Host "Backend deploy failed!" -ForegroundColor Red
        exit 1
    }
    Pop-Location
    Write-Host "Backend deployed." -ForegroundColor Green
}

# --- Deploy frontend ---
if ($frontend) {
    if ($env_config.s3_bucket -eq "TBD") {
        Write-Host "SKIPPING frontend — S3 bucket not configured for $Environment" -ForegroundColor Yellow
    } else {
        Write-Host "Building frontend (mode=$($env_config.vite_mode))..." -ForegroundColor Yellow
        Push-Location frontend
        npx vite build --mode $env_config.vite_mode
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Write-Host "Frontend build failed!" -ForegroundColor Red
            exit 1
        }

        Write-Host "Syncing to s3://$($env_config.s3_bucket)..." -ForegroundColor Yellow
        aws s3 sync dist/ "s3://$($env_config.s3_bucket)" --delete
        if ($LASTEXITCODE -ne 0) {
            Pop-Location
            Write-Host "Frontend deploy failed!" -ForegroundColor Red
            exit 1
        }
        Pop-Location
        Write-Host "Frontend deployed." -ForegroundColor Green
    }
}

# --- Push tag ---
Write-Host "Pushing tag to origin..." -ForegroundColor Yellow
git push origin $tag_name
if ($LASTEXITCODE -ne 0) {
    Write-Host "Warning: failed to push tag (deploy succeeded, tag is local only)" -ForegroundColor Yellow
}

# --- Log ---
$what = @()
if ($backend) { $what += "backend" }
if ($frontend -and $env_config.s3_bucket -ne "TBD") { $what += "frontend" }
$what_str = $what -join "+"

$log_line = "| $($timestamp.Substring(0,10)) $($timestamp.Substring(11).Replace('-',':').Insert(2,':').Insert(5,':').Substring(0,8)) | $Environment | $commit_hash | $what_str |"

$log_path = Join-Path $PSScriptRoot "DEPLOY_LOG.md"
if (-not (Test-Path $log_path)) {
    "# Deploy Log`n`n| When | Environment | Commit | What |`n|------|-------------|--------|------|" | Out-File $log_path -Encoding utf8
}
Add-Content $log_path $log_line

Write-Host ""
Write-Host "=== Done ===" -ForegroundColor Green
Write-Host "  Tag:    $tag_name" -ForegroundColor Gray
Write-Host "  Log:    DEPLOY_LOG.md" -ForegroundColor Gray
Write-Host ""
