import time
import logging
import json
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from config.settings import settings
from config.logging_config import get_request_id

logger = logging.getLogger(__name__)

class LoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for comprehensive request/response logging with performance tracking.
    
    Features:
    - Assigns a unique request ID to each request
    - Logs request details (method, path, headers, query params, body)
    - Logs response details (status code, headers, body)
    - Tracks request duration and logs slow requests
    - Masks sensitive information in logs
    """
    
    def __init__(self, app: ASGIApp, request_id_filter=None):
        super().__init__(app)
        self.request_id_filter = request_id_filter
        
    async def dispatch(self, request: Request, call_next):
        # Generate request ID and set in filter
        request_id = get_request_id()
        if self.request_id_filter:
            self.request_id_filter.request_id = request_id
            
        # Add request ID to request state for access in route handlers
        request.state.request_id = request_id
        
        # Start timer for request duration
        start_time = time.time()
        
        # Log request details
        await self._log_request(request, request_id)
        
        # Process the request
        try:
            response = await call_next(request)
            
            # Calculate request duration
            duration_ms = (time.time() - start_time) * 1000
            
            # Log response details
            await self._log_response(request, response, duration_ms, request_id)
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            
            return response
        except Exception as exc:
            # Log exceptions
            duration_ms = (time.time() - start_time) * 1000
            logger.exception(
                f"Unhandled exception processing request: {str(exc)}",
                extra={
                    "request_id": request_id,
                    "method": request.method,
                    "path": request.url.path,
                    "duration_ms": duration_ms
                }
            )
            raise
        finally:
            # Clear request ID from filter
            if self.request_id_filter:
                self.request_id_filter.request_id = None
    
    async def _log_request(self, request: Request, request_id: str):
        """Log details about the incoming request."""
        log_data = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "query_params": dict(request.query_params),
            "client_host": request.client.host if request.client else None,
            "user_agent": request.headers.get("user-agent"),
        }
        
        # Log headers if in debug mode
        if settings.LOG_LEVEL == "DEBUG":
            log_data["headers"] = self._mask_sensitive_headers(dict(request.headers))
        
        # Log request body if enabled
        if settings.LOG_REQUEST_BODY:
            try:
                # Clone the request body stream
                body = await request.body()
                # Restore the request body stream
                await request._receive()
                
                # Try to parse as JSON
                try:
                    body_json = json.loads(body)
                    log_data["body"] = self._mask_sensitive_data(body_json)
                except:
                    # If not JSON, log as string if not too large
                    if len(body) < 1000:  # Don't log large binary data
                        log_data["body"] = body.decode('utf-8', errors='replace')
            except Exception as e:
                log_data["body_error"] = str(e)
        
        logger.info(f"Request: {request.method} {request.url.path}", extra=log_data)
    
    async def _log_response(self, request: Request, response: Response, duration_ms: float, request_id: str):
        """Log details about the response and request performance."""
        log_data = {
            "request_id": request_id,
            "method": request.method,
            "path": request.url.path,
            "status_code": response.status_code,
            "duration_ms": round(duration_ms, 2)
        }
        
        # Log response headers if in debug mode
        if settings.LOG_LEVEL == "DEBUG":
            log_data["headers"] = dict(response.headers)
        
        # Log response body if enabled and not a streaming response
        if settings.LOG_RESPONSE_BODY and hasattr(response, "body"):
            try:
                # Try to parse as JSON
                try:
                    body_json = json.loads(response.body)
                    log_data["body"] = self._mask_sensitive_data(body_json)
                except:
                    # If not JSON, log as string if not too large
                    if len(response.body) < 1000:  # Don't log large binary data
                        log_data["body"] = response.body.decode('utf-8', errors='replace')
            except Exception as e:
                log_data["body_error"] = str(e)
        
        # Log at appropriate level based on status code and duration
        if response.status_code >= 500:
            logger.error(f"Response: {response.status_code} - {duration_ms:.2f}ms", extra=log_data)
        elif response.status_code >= 400:
            logger.warning(f"Response: {response.status_code} - {duration_ms:.2f}ms", extra=log_data)
        elif duration_ms > settings.LOG_PERFORMANCE_THRESHOLD_MS:
            logger.warning(f"Slow response: {request.method} {request.url.path} - {response.status_code} - {duration_ms:.2f}ms", extra=log_data)
        else:
            logger.info(f"Response: {response.status_code} - {duration_ms:.2f}ms", extra=log_data)
    
    def _mask_sensitive_headers(self, headers: dict) -> dict:
        """Mask sensitive information in headers."""
        masked_headers = headers.copy()
        for key in masked_headers:
            if any(sensitive in key.lower() for sensitive in settings.LOG_SENSITIVE_FIELDS):
                masked_headers[key] = "********"
        return masked_headers
    
    def _mask_sensitive_data(self, data):
        """Recursively mask sensitive fields in data structures."""
        if isinstance(data, dict):
            masked_data = {}
            for key, value in data.items():
                if any(sensitive in key.lower() for sensitive in settings.LOG_SENSITIVE_FIELDS):
                    masked_data[key] = "********"
                else:
                    masked_data[key] = self._mask_sensitive_data(value)
            return masked_data
        elif isinstance(data, list):
            return [self._mask_sensitive_data(item) for item in data]
        else:
            return data 