"""
Timeout configuration for different components of the application.
These settings ensure long-running operations like enrichment don't timeout.
"""

import os
from typing import Dict, Any

# Environment detection
IS_PRODUCTION = os.getenv("ENVIRONMENT", "development").lower() == "production"

# API Client Timeouts (in seconds)
API_TIMEOUTS = {
    # Main search API - can handle pagination
    "serpapi_search": 30,

    # Enrichment APIs - shorter timeouts for individual calls
    "semantic_scholar": 5,
    "crossref": 5,
    "web_scraping": 5,

    # Database operations
    "database_pool": 30,
    "database_query": 10,
}

# Streaming Configuration
STREAMING_CONFIG = {
    # How often to send heartbeat messages (seconds)
    "heartbeat_interval": 3,

    # Maximum time for a single enrichment batch
    "enrichment_batch_timeout": 30,

    # Maximum concurrent enrichment requests
    "max_concurrent_enrichment": 5 if IS_PRODUCTION else 3,

    # Total stream timeout (seconds) - must be less than proxy timeout
    "max_stream_duration": 290,  # Just under 5 minutes

    # Buffer size for SSE events
    "event_buffer_size": 8192,
}

# Server/Worker Configuration
SERVER_TIMEOUTS = {
    # Gunicorn worker timeout
    "worker_timeout": 300,

    # Keep-alive for TCP connections
    "keepalive": 75,

    # Graceful shutdown timeout
    "graceful_timeout": 120,
}

# Proxy/CDN Configuration Notes
PROXY_NOTES = """
Common proxy timeout settings that need to be configured:

1. Nginx (if used as reverse proxy):
   proxy_read_timeout 300s;
   proxy_connect_timeout 75s;
   proxy_send_timeout 300s;
   send_timeout 300s;
   keepalive_timeout 75s;

2. Cloudflare (if used):
   - Free plan: 100 seconds (cannot be changed)
   - Pro plan: up to 600 seconds
   - Enterprise: up to 6000 seconds

3. AWS ALB (if used):
   - Idle timeout: set to 300 seconds in target group settings

4. Heroku (if used):
   - 30-second timeout for initial response
   - Must send data within 55 seconds to keep connection alive

5. Azure App Service:
   - Default 230 seconds, configurable up to 230 seconds on Basic/Standard
   - Premium allows higher limits
"""

def get_timeout_for_operation(operation: str) -> int:
    """
    Get the appropriate timeout for a specific operation.

    Args:
        operation: The operation type (e.g., 'serpapi_search', 'enrichment')

    Returns:
        Timeout in seconds
    """
    # Check specific API timeouts
    if operation in API_TIMEOUTS:
        return API_TIMEOUTS[operation]

    # Check streaming config
    streaming_key = f"{operation}_timeout"
    if streaming_key in STREAMING_CONFIG:
        return STREAMING_CONFIG[streaming_key]

    # Default timeout
    return 30

def get_streaming_config() -> Dict[str, Any]:
    """Get the complete streaming configuration."""
    return STREAMING_CONFIG.copy()

def get_server_timeouts() -> Dict[str, Any]:
    """Get server/worker timeout configuration."""
    return SERVER_TIMEOUTS.copy()