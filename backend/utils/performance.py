import time
import logging
import functools
import inspect
from typing import Callable, Any, Optional
from config.settings import settings

logger = logging.getLogger(__name__)

def performance_logger(func: Callable) -> Callable:
    """
    Decorator to log function execution time.
    
    Args:
        func: The function to be decorated
        
    Returns:
        Wrapped function with performance logging
    """
    @functools.wraps(func)
    def wrapper(*args, **kwargs):
        start_time = time.time()
        
        # Get request_id from context if available
        request_id = '-'
        # Check if first arg is self and has request attribute
        if args and hasattr(args[0], 'request') and hasattr(args[0].request, 'state'):
            if hasattr(args[0].request.state, 'request_id'):
                request_id = args[0].request.state.request_id
        
        # Extract function details
        module = func.__module__
        function_name = func.__qualname__
        
        try:
            result = func(*args, **kwargs)
            duration_ms = (time.time() - start_time) * 1000
            
            # Log based on duration threshold
            if duration_ms > settings.LOG_PERFORMANCE_THRESHOLD_MS:
                logger.warning(
                    f"SLOW OPERATION: {module}.{function_name} took {duration_ms:.2f}ms",
                    extra={
                        "request_id": request_id,
                        "module": module,
                        "function": function_name,
                        "duration_ms": duration_ms
                    }
                )
            else:
                logger.debug(
                    f"PERFORMANCE: {module}.{function_name} took {duration_ms:.2f}ms",
                    extra={
                        "request_id": request_id,
                        "module": module,
                        "function": function_name,
                        "duration_ms": duration_ms
                    }
                )
            
            return result
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"EXCEPTION in {module}.{function_name}: {str(e)} after {duration_ms:.2f}ms",
                extra={
                    "request_id": request_id,
                    "module": module,
                    "function": function_name,
                    "duration_ms": duration_ms,
                    "exception": str(e)
                },
                exc_info=True
            )
            raise
    
    # For async functions
    @functools.wraps(func)
    async def async_wrapper(*args, **kwargs):
        start_time = time.time()
        
        # Get request_id from context if available
        request_id = '-'
        # Check if first arg is self and has request attribute
        if args and hasattr(args[0], 'request') and hasattr(args[0].request, 'state'):
            if hasattr(args[0].request.state, 'request_id'):
                request_id = args[0].request.state.request_id
        
        # Extract function details
        module = func.__module__
        function_name = func.__qualname__
        
        try:
            result = await func(*args, **kwargs)
            duration_ms = (time.time() - start_time) * 1000
            
            # Log based on duration threshold
            if duration_ms > settings.LOG_PERFORMANCE_THRESHOLD_MS:
                logger.warning(
                    f"SLOW OPERATION: {module}.{function_name} took {duration_ms:.2f}ms",
                    extra={
                        "request_id": request_id,
                        "module": module,
                        "function": function_name,
                        "duration_ms": duration_ms
                    }
                )
            else:
                logger.debug(
                    f"PERFORMANCE: {module}.{function_name} took {duration_ms:.2f}ms",
                    extra={
                        "request_id": request_id,
                        "module": module,
                        "function": function_name,
                        "duration_ms": duration_ms
                    }
                )
            
            return result
        except Exception as e:
            duration_ms = (time.time() - start_time) * 1000
            logger.error(
                f"EXCEPTION in {module}.{function_name}: {str(e)} after {duration_ms:.2f}ms",
                extra={
                    "request_id": request_id,
                    "module": module,
                    "function": function_name,
                    "duration_ms": duration_ms,
                    "exception": str(e)
                },
                exc_info=True
            )
            raise
    
    # Return appropriate wrapper based on whether the function is async
    if inspect.iscoroutinefunction(func):
        return async_wrapper
    return wrapper


class log_performance:
    """
    Context manager for logging performance of code blocks.
    
    Example:
        with log_performance("database_query", request_id="123"):
            # Code to measure
            result = db.execute_query()
    """
    
    def __init__(self, operation_name: str, request_id: Optional[str] = None):
        """
        Initialize the context manager.
        
        Args:
            operation_name: Name of the operation being measured
            request_id: Optional request ID for correlation
        """
        self.operation_name = operation_name
        self.request_id = request_id or '-'
        self.start_time = None
        
    def __enter__(self):
        self.start_time = time.time()
        return self
        
    def __exit__(self, exc_type, exc_val, exc_tb):
        if not self.start_time:
            return
            
        duration_ms = (time.time() - self.start_time) * 1000
        
        # Get caller information
        frame = inspect.currentframe().f_back
        module = frame.f_globals['__name__']
        function = frame.f_code.co_name
        
        if exc_type:
            # Log exception
            logger.error(
                f"EXCEPTION in {self.operation_name}: {str(exc_val)} after {duration_ms:.2f}ms",
                extra={
                    "request_id": self.request_id,
                    "module": module,
                    "function": function,
                    "operation": self.operation_name,
                    "duration_ms": duration_ms,
                    "exception": str(exc_val)
                },
                exc_info=(exc_type, exc_val, exc_tb)
            )
        else:
            # Log performance
            if duration_ms > settings.LOG_PERFORMANCE_THRESHOLD_MS:
                logger.warning(
                    f"SLOW OPERATION: {self.operation_name} took {duration_ms:.2f}ms",
                    extra={
                        "request_id": self.request_id,
                        "module": module,
                        "function": function,
                        "operation": self.operation_name,
                        "duration_ms": duration_ms
                    }
                )
            else:
                logger.debug(
                    f"PERFORMANCE: {self.operation_name} took {duration_ms:.2f}ms",
                    extra={
                        "request_id": self.request_id,
                        "module": module,
                        "function": function,
                        "operation": self.operation_name,
                        "duration_ms": duration_ms
                    }
                ) 