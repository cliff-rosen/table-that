import logging
import logging.handlers
import os
import uuid
import json
from datetime import datetime
from .settings import settings

class RequestIdFilter(logging.Filter):
    """Filter that adds request_id to log records."""
    def __init__(self, name=''):
        super().__init__(name)
        self.request_id = None

    def filter(self, record):
        record.request_id = getattr(record, 'request_id', self.request_id or '-')
        return True

class JsonFormatter(logging.Formatter):
    """JSON formatter for structured logging."""
    def format(self, record):
        log_record = {
            'timestamp': self.formatTime(record, self.datefmt),
            'level': record.levelname,
            'logger': record.name,
            'request_id': getattr(record, 'request_id', '-'),
            'message': record.getMessage(),
            'module': record.module,
            'function': record.funcName,
            'line': record.lineno,
        }
        
        # Add exception info if present
        if record.exc_info:
            log_record['exception'] = self.formatException(record.exc_info)
        
        # Add extra fields if present
        if hasattr(record, 'extra'):
            log_record.update(record.extra)
            
        return json.dumps(log_record)

def setup_logging():
    """Set up application logging with enhanced features."""
    # Create logs directory if it doesn't exist
    if not os.path.exists(settings.LOG_DIR):
        os.makedirs(settings.LOG_DIR)

    # Base log filename without date (TimedRotatingFileHandler manages dates)
    log_filename = os.path.join(
        settings.LOG_DIR,
        f"{settings.LOG_FILENAME_PREFIX}.log"
    )

    # Create formatters
    standard_formatter = logging.Formatter(
        '%(asctime)s - %(levelname)s - [%(request_id)s] - %(name)s - %(message)s'
    )

    json_formatter = JsonFormatter() if settings.LOG_FORMAT == 'json' else None

    # Get the root logger
    root_logger = logging.getLogger()
    root_logger.setLevel(getattr(logging, settings.LOG_LEVEL))

    # Create request ID filter
    request_id_filter = RequestIdFilter()

    # Create file handler with rotation and UTF-8 encoding
    file_handler = logging.handlers.TimedRotatingFileHandler(
        log_filename,
        when='midnight',
        backupCount=settings.LOG_BACKUP_COUNT,
        encoding='utf-8'
    )
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(json_formatter if settings.LOG_FORMAT == 'json' else standard_formatter)
    file_handler.addFilter(request_id_filter)

    # Custom namer to ensure rotated files end in .log
    # Transforms: app.log.2025-11-02 -> app_2025-11-02.log
    def custom_namer(default_name):
        """Custom naming function for rotated log files."""
        # Extract the date suffix that TimedRotatingFileHandler added
        # default_name looks like: /path/to/app.log.2025-11-02
        base_filename = default_name.replace('.log', '')
        parts = base_filename.rsplit('.', 1)
        if len(parts) == 2:
            # parts[0] is '/path/to/app', parts[1] is '2025-11-02'
            return f"{parts[0]}_{parts[1]}.log"
        return default_name

    file_handler.namer = custom_namer

    # Create console handler with UTF-8 encoding for Windows compatibility
    import sys
    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(logging.Formatter('%(levelname)s - [%(request_id)s] - %(message)s'))
    console_handler.addFilter(request_id_filter)

    # Force UTF-8 encoding on Windows to handle Unicode characters
    if hasattr(console_handler.stream, 'reconfigure'):
        console_handler.stream.reconfigure(encoding='utf-8')
    elif sys.platform == 'win32':
        import io
        console_handler.stream = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

    # Remove existing handlers to avoid duplicates
    root_logger.handlers = []

    # Add handlers to root logger
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    # Create logger for this module
    logger = logging.getLogger(__name__)
    logger.info(f"Logging setup complete. Writing to {log_filename}", extra={"request_id": "startup"})

    return logger, request_id_filter

def get_request_id():
    """Generate a unique request ID."""
    return str(uuid.uuid4()) 