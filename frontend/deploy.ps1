# Frontend deployment script - builds and deploys to S3

$ErrorActionPreference = "Stop"

# Configuration - put your S3 bucket name between the quotes
$S3_BUCKET = "tablethat.ironcliff.ai"

if ($S3_BUCKET -eq "your-bucket-name-here") {
    Write-Host "Error: Edit deploy.ps1 and set your S3 bucket name on line 6" -ForegroundColor Red
    exit 1
}

# Stamp version from git SHA into .env.production
$gitSha = git rev-parse --short HEAD
Write-Host "Stamping version: $gitSha" -ForegroundColor Cyan
$envContent = Get-Content .env.production -Raw
$envContent = $envContent -replace 'VITE_APP_VERSION=.*', "VITE_APP_VERSION=$gitSha"
Set-Content .env.production $envContent -NoNewline

Write-Host "Building frontend..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Deploying to s3://$S3_BUCKET..." -ForegroundColor Yellow
aws s3 sync dist/ "s3://$S3_BUCKET" --delete

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment complete! (version: $gitSha)" -ForegroundColor Green
} else {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}
