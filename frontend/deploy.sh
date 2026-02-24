#!/bin/bash
# Frontend deployment script - builds and deploys to S3

set -e

# Configuration - put your S3 bucket name between the quotes
S3_BUCKET="your-bucket-name-here"

if [ "$S3_BUCKET" = "www.knowledgehorizon.ai" ]; then
    echo "Error: Edit deploy.sh and set your S3 bucket name on line 7"
    exit 1
fi

echo "Building frontend..."
npm run build

echo "Deploying to s3://$S3_BUCKET..."
aws s3 sync dist/ "s3://$S3_BUCKET" --delete

echo "Deployment complete!"
