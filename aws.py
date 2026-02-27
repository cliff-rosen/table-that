import boto3
from botocore.exceptions import ClientError
import json
import logging
from datetime import datetime
import os
import time

# This script is used to deploy an SPA application that consists of:
# Frontend: React deployed to S3 accessed via Route53/CloudFront
# Backend: App server: Python Flask on EC2 via Route53/Elastic Beanstalk
# RDBMS: MariaDB via RDS

# Instructions:
# 1. Before running script:
#  create eb app and env and then eb deploy as described in the AWS SPA Stack Deployment Guide
#   be sure to do this from the repo directory that has the application.py file
#  update the orchestration variables below
# 2. Run deploy_app()
# 3. After running script, npm run build and copy files to S3 bucket


# Constants
AWS_REGION = "us-east-1"

# Orchestrate the deployment
DOMAIN_NAME = "ironcliff.ai"
FRONTEND_SUBDOMAIN = "tablethat"
BACKEND_SUBDOMAIN = "tablethat-api"
EB_APP_NAME = "table-that-app"
EB_ENV_NAME = "table-that-env"

frontend_domain = f"{FRONTEND_SUBDOMAIN}.{DOMAIN_NAME}"
backend_domain = f"{BACKEND_SUBDOMAIN}.{DOMAIN_NAME}"

# Create logs directory if it doesn't exist
if not os.path.exists("logs"):
    os.makedirs("logs")

# Generate log filename with timestamp
log_filename = f"logs/deployment_{datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

# Configure logging to both file and console
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.FileHandler(log_filename), logging.StreamHandler()],
)
logger = logging.getLogger(__name__)

# Log the start of the script with some basic info
logger.info("=" * 80)
logger.info("Starting AWS Deployment Script")
logger.info(f"Log file: {log_filename}")
logger.info(f"AWS Region: {AWS_REGION}")
logger.info(f"Domain: {DOMAIN_NAME}")
logger.info(f"Frontend Domain: {frontend_domain}")
logger.info(f"Backend Domain: {backend_domain}")
logger.info("=" * 80)


def create_s3_bucket(domain_name):
    """
    Creates and configures an S3 bucket for static website hosting.

    Args:
        domain_name (str): The domain name to use as the bucket name

    Returns:
        dict: Contains status and website_url if successful, or error message if failed
    """
    logger.info(f"Starting S3 bucket creation for domain: {domain_name}")
    try:
        # Initialize S3 client
        s3_client = boto3.client("s3")
        logger.info(
            f"Creating bucket '{domain_name}' in region {s3_client.meta.region_name}"
        )

        # Step 1: Create the bucket with public access
        # Special handling for us-east-1 region
        if s3_client.meta.region_name == "us-east-1":
            logger.info("Using special configuration for us-east-1 region")
            s3_client.create_bucket(
                Bucket=domain_name,
                ObjectOwnership="ObjectWriter",  # Required for public access
            )
        else:
            s3_client.create_bucket(
                Bucket=domain_name,
                CreateBucketConfiguration={
                    "LocationConstraint": s3_client.meta.region_name
                },
                ObjectOwnership="ObjectWriter",  # Required for public access
            )
        logger.info(f"Successfully created bucket: {domain_name}")

        # Disable block public access
        logger.info("Configuring public access settings")
        s3_client.put_public_access_block(
            Bucket=domain_name,
            PublicAccessBlockConfiguration={
                "BlockPublicAcls": False,
                "IgnorePublicAcls": False,
                "BlockPublicPolicy": False,
                "RestrictPublicBuckets": False,
            },
        )
        logger.info("Public access block settings updated")

        # Step 2: Set bucket policy for public read access
        logger.info("Setting bucket policy for public read access")
        bucket_policy = {
            "Version": "2012-10-17",
            "Statement": [
                {
                    "Sid": "PublicReadGetObject",
                    "Effect": "Allow",
                    "Principal": "*",
                    "Action": ["s3:GetObject"],
                    "Resource": [f"arn:aws:s3:::{domain_name}/*"],
                }
            ],
        }

        # Convert policy to JSON string and apply it
        s3_client.put_bucket_policy(
            Bucket=domain_name, Policy=json.dumps(bucket_policy)
        )
        logger.info("Bucket policy applied successfully")

        # Step 3: Enable static website hosting
        logger.info("Configuring static website hosting")
        website_configuration = {
            "ErrorDocument": {"Key": "index.html"},
            "IndexDocument": {"Suffix": "index.html"},
        }

        s3_client.put_bucket_website(
            Bucket=domain_name, WebsiteConfiguration=website_configuration
        )
        logger.info("Static website hosting configured")

        # Get the website URL
        website_url = f"http://{domain_name}.s3-website-{s3_client.meta.region_name}.amazonaws.com"
        logger.info(f"Website URL: {website_url}")

        return {
            "status": "success",
            "message": "Bucket created and configured successfully",
            "website_url": website_url,
        }

    except ClientError as e:
        error_code = e.response["Error"]["Code"]
        error_message = e.response["Error"]["Message"]

        # Handle specific error cases
        if error_code == "BucketAlreadyOwnedByYou":
            logger.warning(f"Bucket {domain_name} already exists and is owned by you")
            return {
                "status": "error",
                "message": f"Bucket {domain_name} already exists and is owned by you",
            }
        elif error_code == "BucketAlreadyExists":
            logger.error(
                f"Bucket {domain_name} already exists and is owned by another AWS account"
            )
            return {
                "status": "error",
                "message": f"Bucket {domain_name} already exists and is owned by another AWS account",
            }
        else:
            logger.error(f"Error creating bucket: {error_message}")
            return {
                "status": "error",
                "message": f"Error creating bucket: {error_message}",
            }
    except Exception as e:
        logger.error(f"Unexpected error: {str(e)}", exc_info=True)
        return {"status": "error", "message": f"Unexpected error: {str(e)}"}


def create_acm_certificate(frontend_domain, backend_domain):
    """
    Creates and validates an ACM certificate for the domain and alternative names

    Args:
        domain_name (str): Main domain name (e.g., 'ironcliff.ai')
        alternative_names (list): List of full domain names (e.g., ['ra.ironcliff.ai', 'ra-api.ironcliff.ai'])

    Returns:
        str: Certificate ARN if successful, None if failed
    """
    logger.info(
        f"Creating ACM certificate for {frontend_domain} and alternative names {backend_domain}"
    )

    try:
        acm_client = boto3.client("acm", region_name=AWS_REGION)

        # Request certificate
        response = acm_client.request_certificate(
            DomainName=frontend_domain,
            ValidationMethod="DNS",
            SubjectAlternativeNames=[backend_domain],
        )

        certificate_arn = response["CertificateArn"]
        logger.info(f"Certificate requested successfully. ARN: {certificate_arn}")

        return certificate_arn

    except ClientError as e:
        logger.error(f"Error requesting certificate: {str(e)}")
        return None


def create_cloudfront_distribution(domain_name, certificate_arn):
    """
    Creates a CloudFront distribution for the S3 bucket

    Args:
        domain_name (str): Domain name for the distribution
        s3_bucket_website_endpoint (str): S3 bucket website endpoint (e.g., bucket-name.s3-website-region.amazonaws.com)
        certificate_arn (str): ACM certificate ARN

    Returns:
        dict: Distribution details if successful, None if failed
    """
    logger.info(f"Creating CloudFront distribution for {domain_name}")

    # Get S3 website endpoint for existing bucket
    s3_website_endpoint = get_s3_website_endpoint(frontend_domain)
    logger.info(f"Using S3 website endpoint: {s3_website_endpoint}")

    try:
        cloudfront_client = boto3.client("cloudfront")

        distribution_config = {
            "CallerReference": str(datetime.now().timestamp()),
            "Comment": f"Distribution for {domain_name}",
            "Aliases": {"Quantity": 1, "Items": [domain_name]},
            "DefaultRootObject": "index.html",
            "Origins": {
                "Quantity": 1,
                "Items": [
                    {
                        "Id": "S3Origin",
                        "DomainName": s3_website_endpoint,
                        "CustomOriginConfig": {
                            "HTTPPort": 80,
                            "HTTPSPort": 443,
                            "OriginProtocolPolicy": "http-only",
                        },
                    }
                ],
            },
            "DefaultCacheBehavior": {
                "TargetOriginId": "S3Origin",
                "ViewerProtocolPolicy": "redirect-to-https",
                "AllowedMethods": {
                    "Quantity": 7,
                    "Items": [
                        "GET",
                        "HEAD",
                        "OPTIONS",
                        "PUT",
                        "POST",
                        "PATCH",
                        "DELETE",
                    ],
                    "CachedMethods": {"Quantity": 2, "Items": ["GET", "HEAD"]},
                },
                "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",  # CachingDisabled policy
                "OriginRequestPolicyId": "88a5eaf4-2fd4-4709-b370-b4c650ea3fcf",  # CORS-S3Origin
                "ResponseHeadersPolicyId": "60669652-455b-4ae9-85a4-c4c02393f86c",  # SimpleCORS
            },
            "ViewerCertificate": {
                "ACMCertificateArn": certificate_arn,
                "SSLSupportMethod": "sni-only",
                "MinimumProtocolVersion": "TLSv1.2_2021",
            },
            "Enabled": True,
            "WebACLId": "",  # Explicitly not enabling WAF
        }

        response = cloudfront_client.create_distribution(
            DistributionConfig=distribution_config
        )

        logger.info(f"CloudFront distribution created successfully")
        return response["Distribution"]

    except ClientError as e:
        logger.error(f"Error creating CloudFront distribution: {str(e)}")
        return None


def get_s3_website_endpoint(bucket_name, region=AWS_REGION):
    """
    Gets the S3 website endpoint for an existing bucket

    Args:
        bucket_name (str): Name of the S3 bucket (e.g., ra.ironcliff.ai)
        region (str): AWS region

    Returns:
        str: Website endpoint URL
    """
    try:
        s3_client = boto3.client("s3")

        # Try to get the website configuration to confirm bucket exists and has website enabled
        try:
            s3_client.get_bucket_website(Bucket=bucket_name)
            logger.info(f"Found website configuration for bucket {bucket_name}")
        except ClientError as e:
            if e.response["Error"]["Code"] == "NoSuchWebsiteConfiguration":
                logger.error(
                    f"Bucket {bucket_name} does not have website hosting enabled"
                )
            else:
                logger.error(f"Error checking bucket website config: {str(e)}")
            return None

        # Return the bucket website endpoint
        return f"{bucket_name}.s3-website-{region}.amazonaws.com"

    except ClientError as e:
        logger.error(f"Error getting S3 website endpoint: {str(e)}")
        return None


def create_frontend_route53_record(domain_name, cloudfront_domain_name):
    """
    Creates Route53 A record pointing to CloudFront distribution

    Args:
        domain_name (str): Domain name for the record (e.g., ra.ironcliff.ai)
        cloudfront_domain_name (str): CloudFront distribution domain name
    """
    try:
        route53_client = boto3.client("route53")

        # Get the hosted zone ID for the domain
        hosted_zones = route53_client.list_hosted_zones()
        zone_id = None
        base_domain = ".".join(
            domain_name.split(".")[-2:]
        )  # Get base domain (e.g., ironcliff.ai)

        for zone in hosted_zones["HostedZones"]:
            if zone["Name"].rstrip(".") == base_domain:
                zone_id = zone["Id"]
                break

        if not zone_id:
            logger.error(f"No hosted zone found for domain {base_domain}")
            return None

        # Create A record
        response = route53_client.change_resource_record_sets(
            HostedZoneId=zone_id,
            ChangeBatch={
                "Changes": [
                    {
                        "Action": "UPSERT",
                        "ResourceRecordSet": {
                            "Name": domain_name,
                            "Type": "A",
                            "AliasTarget": {
                                "HostedZoneId": "Z2FDTNDATAQYW2",  # CloudFront's hosted zone ID (constant)
                                "DNSName": cloudfront_domain_name,
                                "EvaluateTargetHealth": False,
                            },
                        },
                    }
                ]
            },
        )

        logger.info(f"Route53 record created/updated successfully")
        return response

    except ClientError as e:
        logger.error(f"Error creating Route53 record: {str(e)}")
        return None


def wait_for_eb_environment_ready(environment_name, timeout_seconds=300):
    """
    Waits for an Elastic Beanstalk environment to be ready

    Args:
        environment_name (str): Name of the Elastic Beanstalk environment
        timeout_seconds (int): Maximum time to wait in seconds

    Returns:
        bool: True if environment is ready, False if timeout occurred
    """
    logger.info(f"Waiting for environment {environment_name} to be ready...")
    eb_client = boto3.client("elasticbeanstalk", region_name=AWS_REGION)
    start_time = time.time()

    while time.time() - start_time < timeout_seconds:
        try:
            response = eb_client.describe_environments(
                EnvironmentNames=[environment_name], IncludeDeleted=False
            )

            if not response["Environments"]:
                logger.error(f"Environment {environment_name} not found")
                return False

            status = response["Environments"][0]["Status"]
            health = response["Environments"][0]["Health"]

            logger.info(f"Environment status: {status}, health: {health}")

            if status == "Ready":
                logger.info(f"Environment {environment_name} is ready")
                return True

            time.sleep(10)  # Wait 10 seconds before checking again

        except ClientError as e:
            logger.error(f"Error checking environment status: {str(e)}")
            return False

    logger.error(f"Timeout waiting for environment {environment_name} to be ready")
    return False


def configure_eb_https(environment_name, certificate_arn):
    try:
        if not wait_for_eb_environment_ready(environment_name):
            logger.error("Environment not ready, aborting HTTPS configuration")
            return None

        eb_client = boto3.client("elasticbeanstalk", region_name=AWS_REGION)

        option_settings = [
            # HTTPS Listener
            {
                "Namespace": "aws:elbv2:listener:443",
                "OptionName": "Protocol",
                "Value": "HTTPS",
            },
            {
                "Namespace": "aws:elbv2:listener:443",
                "OptionName": "SSLCertificateArns",
                "Value": certificate_arn,
            },
            {
                "Namespace": "aws:elbv2:listener:443",
                "OptionName": "DefaultProcess",
                "Value": "default",
            },
            # HTTP Listener
            {
                "Namespace": "aws:elbv2:listener:80",
                "OptionName": "Protocol",
                "Value": "HTTP",
            },
            {
                "Namespace": "aws:elbv2:listener:80",
                "OptionName": "DefaultProcess",
                "Value": "default",
            },
            # Define the redirect process
            {
                "Namespace": "aws:elasticbeanstalk:environment:process:redirect",
                "OptionName": "Port",
                "Value": "443",
            },
            {
                "Namespace": "aws:elasticbeanstalk:environment:process:redirect",
                "OptionName": "Protocol",
                "Value": "HTTPS",
            },
            # Define the redirect rule
            {
                "Namespace": "aws:elbv2:listenerrule:redirect",
                "OptionName": "PathPatterns",
                "Value": "/*",
            },
            {
                "Namespace": "aws:elbv2:listenerrule:redirect",
                "OptionName": "Priority",
                "Value": "1",
            },
            {
                "Namespace": "aws:elbv2:listenerrule:redirect",
                "OptionName": "Process",
                "Value": "redirect",
            },
        ]

        response = eb_client.update_environment(
            EnvironmentName=environment_name, OptionSettings=option_settings
        )

        logger.info("HTTPS configuration updated successfully")

        if wait_for_eb_environment_ready(environment_name):
            logger.info("HTTPS configuration changes applied successfully")
        else:
            logger.warning(
                "Environment not ready after applying changes, but changes were submitted"
            )

        return response

    except ClientError as e:
        logger.error(f"Error configuring HTTPS for Elastic Beanstalk: {str(e)}")
        return None


def create_backend_route53_record(domain_name):
    """
    Creates Route53 A record pointing to Elastic Beanstalk environment

    Args:
        domain_name (str): Domain name for the record (e.g., ra-api.ironcliff.ai)
    """
    try:
        route53_client = boto3.client("route53")
        eb_client = boto3.client("elasticbeanstalk", region_name=AWS_REGION)

        # Get the EB environment CNAME
        eb_env = eb_client.describe_environments(
            EnvironmentNames=[EB_ENV_NAME], IncludeDeleted=False
        )["Environments"][0]

        eb_cname = eb_env["CNAME"]

        # Get the hosted zone ID for the domain
        hosted_zones = route53_client.list_hosted_zones()
        zone_id = None
        base_domain = ".".join(
            domain_name.split(".")[-2:]
        )  # Get base domain (e.g., ironcliff.ai)

        for zone in hosted_zones["HostedZones"]:
            if zone["Name"].rstrip(".") == base_domain:
                zone_id = zone["Id"]
                break

        if not zone_id:
            logger.error(f"No hosted zone found for domain {base_domain}")
            return None

        # Create A record
        response = route53_client.change_resource_record_sets(
            HostedZoneId=zone_id,
            ChangeBatch={
                "Changes": [
                    {
                        "Action": "UPSERT",
                        "ResourceRecordSet": {
                            "Name": domain_name,
                            "Type": "CNAME",
                            "TTL": 300,
                            "ResourceRecords": [{"Value": eb_cname}],
                        },
                    }
                ]
            },
        )

        logger.info(f"Route53 record created/updated successfully for backend")
        return response

    except ClientError as e:
        logger.error(f"Error creating Route53 record for backend: {str(e)}")
        return None


def deploy_app():
    # logger.info("Starting deployment process")

    # Create S3 bucket
    s3_result = create_s3_bucket(frontend_domain)
    logger.info(f"S3 bucket creation result: {s3_result}")
    #
    # Create certificate - pass the full domain names
    cert_arn = create_acm_certificate(frontend_domain, backend_domain)
    logger.info(f"Certificate creation result: {cert_arn}")

    # # pause for certificate to be ready
    time.sleep(10)

    # cert_arn = "arn:aws:acm:us-east-1:183944926635:certificate/2929b41b-3839-4485-9ae0-820145e95401"

    # # Create CloudFront distribution
    cloudfront_distribution = create_cloudfront_distribution(frontend_domain, cert_arn)
    logger.info(f"CloudFront distribution creation result: {cloudfront_distribution}")

    # Create Route53 record for frontend
    create_frontend_route53_record(
        frontend_domain, cloudfront_distribution["DomainName"]
    )

    # # Configure HTTPS for Elastic Beanstalk
    configure_eb_https(EB_ENV_NAME, cert_arn)

    # Create Route53 record for backend
    create_backend_route53_record(backend_domain)


# deploy_app()

# cert_arn = "arn:aws:acm:us-east-1:183944926635:certificate/2929b41b-3839-4485-9ae0-820145e95401"
# configure_eb_https(EB_ENV_NAME, cert_arn)
# create_backend_route53_record(backend_domain)


# ===========================================================================
# Domain migration: *.ironcliff.ai -> tablethat.ai
# ===========================================================================
NEW_DOMAIN = "tablethat.ai"
WWW_DOMAIN = f"www.{NEW_DOMAIN}"
API_DOMAIN = f"api.{NEW_DOMAIN}"
OLD_FRONTEND_DOMAIN = frontend_domain   # tablethat.ironcliff.ai
OLD_BACKEND_DOMAIN = backend_domain     # tablethat-api.ironcliff.ai


def find_cloudfront_distribution(alias_domain):
    """Find an existing CloudFront distribution by one of its CNAME aliases.

    Returns (distribution_id, distribution_config, etag) or (None, None, None).
    """
    logger.info(f"Looking up CloudFront distribution for alias: {alias_domain}")
    cf = boto3.client("cloudfront")
    paginator = cf.get_paginator("list_distributions")

    for page in paginator.paginate():
        dist_list = page.get("DistributionList", {})
        for dist in dist_list.get("Items", []):
            aliases = dist.get("Aliases", {}).get("Items", [])
            if alias_domain in aliases:
                dist_id = dist["Id"]
                logger.info(f"Found distribution {dist_id} with alias {alias_domain}")
                # Fetch full config + ETag (needed for updates)
                resp = cf.get_distribution_config(Id=dist_id)
                return dist_id, resp["DistributionConfig"], resp["ETag"]

    logger.error(f"No CloudFront distribution found for alias {alias_domain}")
    return None, None, None


def create_migration_certificate():
    """Request an ACM certificate covering all domains:
    tablethat.ai, www.tablethat.ai, api.tablethat.ai,
    tablethat.ironcliff.ai, tablethat-api.ironcliff.ai.

    One cert for both CloudFront and EB ALB.
    Returns certificate ARN.
    """
    all_domains = [WWW_DOMAIN, API_DOMAIN, OLD_FRONTEND_DOMAIN, OLD_BACKEND_DOMAIN]
    logger.info(f"Requesting ACM cert for {NEW_DOMAIN} + {all_domains}")
    acm = boto3.client("acm", region_name=AWS_REGION)

    resp = acm.request_certificate(
        DomainName=NEW_DOMAIN,
        ValidationMethod="DNS",
        SubjectAlternativeNames=all_domains,
    )
    cert_arn = resp["CertificateArn"]
    logger.info(f"Certificate requested: {cert_arn}")
    return cert_arn


def get_hosted_zone_id(domain_name):
    """Find Route53 hosted zone ID for a domain.

    For 'tablethat.ai' looks up 'tablethat.ai'.
    For 'tablethat.ironcliff.ai' looks up 'ironcliff.ai'.
    """
    route53 = boto3.client("route53")
    # Base domain = last two labels
    parts = domain_name.split(".")
    base = ".".join(parts[-2:])

    zones = route53.list_hosted_zones()
    for zone in zones["HostedZones"]:
        if zone["Name"].rstrip(".") == base:
            zone_id = zone["Id"].split("/")[-1]
            logger.info(f"Hosted zone for {base}: {zone_id}")
            return zone_id

    logger.error(f"No hosted zone found for {base}")
    return None


def add_cert_validation_records(cert_arn):
    """Read DNS validation records from the certificate and create them
    in the appropriate Route53 hosted zones.
    """
    acm = boto3.client("acm", region_name=AWS_REGION)
    route53 = boto3.client("route53")

    # Wait a moment for ACM to populate validation options
    time.sleep(5)

    cert = acm.describe_certificate(CertificateArn=cert_arn)["Certificate"]
    validations = cert.get("DomainValidationOptions", [])

    for val in validations:
        domain = val["DomainName"]
        if val.get("ValidationStatus") == "SUCCESS":
            logger.info(f"  {domain} already validated, skipping")
            continue

        rr = val.get("ResourceRecord")
        if not rr:
            logger.warning(f"  No ResourceRecord yet for {domain}, may need to retry")
            continue

        zone_id = get_hosted_zone_id(domain)
        if not zone_id:
            continue

        logger.info(f"  Adding validation CNAME for {domain}: {rr['Name']} -> {rr['Value']}")
        route53.change_resource_record_sets(
            HostedZoneId=zone_id,
            ChangeBatch={
                "Changes": [{
                    "Action": "UPSERT",
                    "ResourceRecordSet": {
                        "Name": rr["Name"],
                        "Type": rr["Type"],
                        "TTL": 300,
                        "ResourceRecords": [{"Value": rr["Value"]}],
                    },
                }]
            },
        )
        logger.info(f"  Validation record created for {domain}")


def wait_for_certificate_issued(cert_arn, timeout=600):
    """Poll until certificate status is ISSUED."""
    logger.info(f"Waiting for certificate {cert_arn} to be issued (timeout {timeout}s)...")
    acm = boto3.client("acm", region_name=AWS_REGION)
    start = time.time()

    while time.time() - start < timeout:
        cert = acm.describe_certificate(CertificateArn=cert_arn)["Certificate"]
        status = cert["Status"]
        logger.info(f"  Certificate status: {status}")

        if status == "ISSUED":
            logger.info("Certificate issued!")
            return True
        if status == "FAILED":
            logger.error(f"Certificate failed: {cert.get('FailureReason')}")
            return False

        time.sleep(15)

    logger.error("Timeout waiting for certificate")
    return False


def create_redirect_function():
    """Create a CloudFront Function that 301-redirects www.tablethat.ai and
    tablethat.ironcliff.ai to tablethat.ai.

    Returns the function ARN.
    """
    cf = boto3.client("cloudfront")
    func_name = "tablethat-redirect"

    function_code = f"""function handler(event) {{
    var request = event.request;
    var host = request.headers.host.value;

    if (host === '{WWW_DOMAIN}' || host === '{OLD_FRONTEND_DOMAIN}') {{
        return {{
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {{
                location: {{ value: 'https://{NEW_DOMAIN}' + request.uri }}
            }}
        }};
    }}

    return request;
}}"""

    # Check if function already exists
    try:
        existing = cf.describe_function(Name=func_name)
        etag = existing["ETag"]
        logger.info(f"Updating existing CloudFront Function: {func_name}")
        resp = cf.update_function(
            Name=func_name,
            IfMatch=etag,
            FunctionConfig={
                "Comment": "Redirect www and old domain to tablethat.ai",
                "Runtime": "cloudfront-js-2.0",
            },
            FunctionCode=function_code.encode("utf-8"),
        )
        etag = resp["ETag"]
    except cf.exceptions.NoSuchFunctionExists:
        logger.info(f"Creating new CloudFront Function: {func_name}")
        resp = cf.create_function(
            Name=func_name,
            FunctionConfig={
                "Comment": "Redirect www and old domain to tablethat.ai",
                "Runtime": "cloudfront-js-2.0",
            },
            FunctionCode=function_code.encode("utf-8"),
        )
        etag = resp["ETag"]

    # Publish the function (required before attaching to a distribution)
    logger.info("Publishing CloudFront Function...")
    pub_resp = cf.publish_function(Name=func_name, IfMatch=etag)
    func_arn = pub_resp["FunctionSummary"]["FunctionMetadata"]["FunctionARN"]
    logger.info(f"CloudFront Function published: {func_arn}")
    return func_arn


def update_cloudfront_for_migration(dist_id, config, etag, new_cert_arn, function_arn):
    """Update the existing CloudFront distribution:
    - Add tablethat.ai and www.tablethat.ai as aliases
    - Switch to the new certificate
    - Attach the redirect CloudFront Function
    """
    cf = boto3.client("cloudfront")

    # Update aliases to include all three domains
    config["Aliases"] = {
        "Quantity": 3,
        "Items": [NEW_DOMAIN, WWW_DOMAIN, OLD_FRONTEND_DOMAIN],
    }

    # Update certificate
    config["ViewerCertificate"] = {
        "ACMCertificateArn": new_cert_arn,
        "SSLSupportMethod": "sni-only",
        "MinimumProtocolVersion": "TLSv1.2_2021",
    }

    # Attach the redirect function to viewer-request
    config["DefaultCacheBehavior"]["FunctionAssociations"] = {
        "Quantity": 1,
        "Items": [{
            "FunctionARN": function_arn,
            "EventType": "viewer-request",
        }],
    }

    logger.info(f"Updating CloudFront distribution {dist_id}...")
    cf.update_distribution(Id=dist_id, DistributionConfig=config, IfMatch=etag)
    logger.info("CloudFront distribution updated successfully")


def create_new_domain_route53_records(cloudfront_domain_name):
    """Create Route53 A alias records in the tablethat.ai hosted zone
    for both the apex (tablethat.ai) and www.tablethat.ai,
    pointing to the CloudFront distribution.
    """
    route53 = boto3.client("route53")
    zone_id = get_hosted_zone_id(NEW_DOMAIN)
    if not zone_id:
        return None

    CLOUDFRONT_HOSTED_ZONE_ID = "Z2FDTNDATAQYW2"  # AWS constant for all CF distributions

    changes = []
    for domain in [NEW_DOMAIN, WWW_DOMAIN]:
        changes.append({
            "Action": "UPSERT",
            "ResourceRecordSet": {
                "Name": domain,
                "Type": "A",
                "AliasTarget": {
                    "HostedZoneId": CLOUDFRONT_HOSTED_ZONE_ID,
                    "DNSName": cloudfront_domain_name,
                    "EvaluateTargetHealth": False,
                },
            },
        })

    resp = route53.change_resource_record_sets(
        HostedZoneId=zone_id,
        ChangeBatch={"Changes": changes},
    )
    logger.info(f"Route53 A records created for {NEW_DOMAIN} and {WWW_DOMAIN}")
    return resp


def create_backend_route53_record_new_domain(api_domain):
    """Create Route53 CNAME record for api.tablethat.ai pointing to EB."""
    try:
        route53 = boto3.client("route53")
        eb_client = boto3.client("elasticbeanstalk", region_name=AWS_REGION)

        eb_env = eb_client.describe_environments(
            EnvironmentNames=[EB_ENV_NAME], IncludeDeleted=False
        )["Environments"][0]
        eb_cname = eb_env["CNAME"]

        zone_id = get_hosted_zone_id(api_domain)
        if not zone_id:
            return None

        resp = route53.change_resource_record_sets(
            HostedZoneId=zone_id,
            ChangeBatch={
                "Changes": [{
                    "Action": "UPSERT",
                    "ResourceRecordSet": {
                        "Name": api_domain,
                        "Type": "CNAME",
                        "TTL": 300,
                        "ResourceRecords": [{"Value": eb_cname}],
                    },
                }]
            },
        )
        logger.info(f"Route53 CNAME created for {api_domain} -> {eb_cname}")
        return resp
    except ClientError as e:
        logger.error(f"Error creating Route53 record for {api_domain}: {str(e)}")
        return None


def migrate_domains():
    """Orchestrate the full domain migration (frontend + backend).

    Frontend:
      tablethat.ai              = canonical site
      www.tablethat.ai          -> 301 redirect to tablethat.ai
      tablethat.ironcliff.ai    -> 301 redirect to tablethat.ai

    Backend:
      api.tablethat.ai          = API endpoint
      tablethat-api.ironcliff.ai  (keep working with same EB)

    Steps:
      1. Request ACM cert covering all 5 domains
      2. Add DNS validation records to both hosted zones
      3. Wait for cert to be issued
      4. Find existing CloudFront distribution
      5. Create CloudFront Function for frontend redirects
      6. Update CloudFront distribution (aliases, cert, function)
      7. Create Route53 A records for tablethat.ai + www.tablethat.ai
      8. Update EB HTTPS with new cert
      9. Create Route53 CNAME for api.tablethat.ai
    """
    logger.info("=" * 80)
    logger.info("DOMAIN MIGRATION")
    logger.info(f"  Frontend: {OLD_FRONTEND_DOMAIN} -> {NEW_DOMAIN}")
    logger.info(f"  Frontend: {WWW_DOMAIN} -> {NEW_DOMAIN} (redirect)")
    logger.info(f"  Backend:  {OLD_BACKEND_DOMAIN} -> {API_DOMAIN}")
    logger.info("=" * 80)

    # Step 1: Request certificate
    print("\n=== Step 1: Request ACM certificate ===")
    cert_arn = create_migration_certificate()
    if not cert_arn:
        print("FAILED: Could not request certificate")
        return

    # Step 2: Add DNS validation records
    print("\n=== Step 2: Add DNS validation records ===")
    add_cert_validation_records(cert_arn)

    # Step 3: Wait for certificate
    print("\n=== Step 3: Waiting for certificate validation ===")
    if not wait_for_certificate_issued(cert_arn, timeout=600):
        print("FAILED: Certificate not issued. Check DNS validation records.")
        print(f"  Cert ARN: {cert_arn}")
        print("  You can re-run migrate_domains_resume(cert_arn) once it's issued.")
        return

    # Continue with the rest
    migrate_domains_resume(cert_arn)


def migrate_domains_resume(cert_arn):
    """Resume migration after certificate is issued (in case of timeout)."""

    # Step 4: Find existing CloudFront distribution
    print("\n=== Step 4: Find existing CloudFront distribution ===")
    dist_id, config, etag = find_cloudfront_distribution(OLD_FRONTEND_DOMAIN)
    if not dist_id:
        print("FAILED: Could not find CloudFront distribution")
        return

    # Step 5: Create CloudFront Function
    print("\n=== Step 5: Create redirect CloudFront Function ===")
    function_arn = create_redirect_function()
    if not function_arn:
        print("FAILED: Could not create CloudFront Function")
        return

    # Step 6: Update CloudFront distribution
    print("\n=== Step 6: Update CloudFront distribution ===")
    update_cloudfront_for_migration(dist_id, config, etag, cert_arn, function_arn)

    # Step 7: Create Route53 records for frontend
    print("\n=== Step 7: Create Route53 records for frontend ===")
    cf = boto3.client("cloudfront")
    dist = cf.get_distribution(Id=dist_id)
    cf_domain = dist["Distribution"]["DomainName"]
    create_new_domain_route53_records(cf_domain)

    # Step 8: Update EB HTTPS with new cert
    print("\n=== Step 8: Update EB HTTPS with new certificate ===")
    configure_eb_https(EB_ENV_NAME, cert_arn)

    # Step 9: Create Route53 CNAME for api.tablethat.ai
    print("\n=== Step 9: Create Route53 record for api.tablethat.ai ===")
    create_backend_route53_record_new_domain(API_DOMAIN)

    print("\n" + "=" * 80)
    print("MIGRATION COMPLETE")
    print()
    print("Frontend:")
    print(f"  https://{NEW_DOMAIN}              <- canonical")
    print(f"  https://{WWW_DOMAIN}          -> redirects to {NEW_DOMAIN}")
    print(f"  https://{OLD_FRONTEND_DOMAIN} -> redirects to {NEW_DOMAIN}")
    print()
    print("Backend:")
    print(f"  https://{API_DOMAIN}          <- new API endpoint")
    print(f"  https://{OLD_BACKEND_DOMAIN}  <- still works (same EB)")
    print()
    print("Config updates needed:")
    print(f"  1. frontend/src/config/settings.ts: apiUrl -> https://{API_DOMAIN}")
    print(f"  2. backend/.env.production: FRONTEND_URL -> https://{NEW_DOMAIN}")
    print(f"  3. deploy.ps1: update verify URLs")
    print(f"  4. Wait ~15 min for DNS propagation, then test all URLs")
    print("=" * 80)


# To run the migration:
# migrate_domains()  # DONE 2026-02-26
#
# If cert times out, resume with:
# migrate_domains_resume("arn:aws:acm:us-east-1:183944926635:certificate/XXXX")
