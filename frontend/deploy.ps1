# Frontend deployment script - builds and deploys to S3

$ErrorActionPreference = "Stop"

# Configuration - put your S3 bucket name between the quotes
$S3_BUCKET = "www.knowledgehorizon.ai"

if ($S3_BUCKET -eq "your-bucket-name-here") {
    Write-Host "Error: Edit deploy.ps1 and set your S3 bucket name on line 6" -ForegroundColor Red
    exit 1
}

Write-Host "Building frontend..." -ForegroundColor Yellow
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

Write-Host "Deploying to s3://$S3_BUCKET..." -ForegroundColor Yellow
aws s3 sync dist/ "s3://$S3_BUCKET" --delete

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment complete!" -ForegroundColor Green
} else {
    Write-Host "Deployment failed!" -ForegroundColor Red
    exit 1
}
