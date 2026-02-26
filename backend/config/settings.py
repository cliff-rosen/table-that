from pydantic_settings import BaseSettings
import os
import subprocess
from pathlib import Path
from dotenv import load_dotenv, find_dotenv

# Determine environment before loading any dotenv files.
# On EB, set ENVIRONMENT=production via EB environment configuration.
# Locally, ENVIRONMENT is not set, so we default to dev — safe by design.
_backend_dir = Path(__file__).resolve().parent.parent
_is_production = os.environ.get("ENVIRONMENT") == "production"

if _is_production:
    load_dotenv(_backend_dir / ".env.production", override=True)
else:
    load_dotenv(_backend_dir / ".env", override=True)


def _get_git_version() -> str:
    """Get version from BUILD_VERSION file, git tag, or fallback."""
    # 1. Check BUILD_VERSION file (written by deploy script)
    version_file = _backend_dir / "BUILD_VERSION"
    if version_file.exists():
        v = version_file.read_text().strip()
        if v:
            return v
    # 2. Try git describe (gets latest tag like "v1.0.3")
    try:
        tag = subprocess.check_output(
            ["git", "describe", "--tags", "--abbrev=0"],
            stderr=subprocess.DEVNULL,
            cwd=str(_backend_dir),
            timeout=5,
        ).decode().strip()
        if tag:
            return tag
    except Exception:
        pass
    # 3. Fall back to short SHA
    try:
        sha = subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            stderr=subprocess.DEVNULL,
            cwd=str(_backend_dir),
            timeout=5,
        ).decode().strip()
        if sha:
            return sha
    except Exception:
        pass
    return "0.0.1"


class Settings(BaseSettings):
    APP_NAME: str = "table.that"
    SETTING_VERSION: str = _get_git_version()
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")  # Dev default

    # Database settings
    DB_HOST: str = os.getenv("DB_HOST")
    DB_PORT: str = os.getenv("DB_PORT", "3306")
    DB_USER: str = os.getenv("DB_USER")
    DB_PASSWORD: str = os.getenv("DB_PASSWORD")
    DB_NAME: str = os.getenv("DB_NAME")

    # Authentication settings
    JWT_SECRET_KEY: str = os.getenv("JWT_SECRET_KEY")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # API settings
    ANTHROPIC_API_KEY: str = os.getenv("ANTHROPIC_API_KEY")

    # Environment
    IS_PRODUCTION: bool = _is_production

    # Email/SMTP settings
    SMTP_SERVER: str = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    SMTP_PORT: int = int(os.getenv("SMTP_PORT", "587"))
    SMTP_USERNAME: str = os.getenv("SMTP_USERNAME", "")
    SMTP_PASSWORD: str = os.getenv("SMTP_PASSWORD", "")
    FROM_EMAIL: str = os.getenv("FROM_EMAIL", "")

    # Google OAuth2 settings
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET")
    GOOGLE_REDIRECT_URI: str = os.getenv("GOOGLE_REDIRECT_URI")

    # CORS settings
    CORS_ORIGINS: list[str] = ["*"]  # In production, specify exact origins
    CORS_ALLOW_CREDENTIALS: bool = True
    CORS_ALLOW_METHODS: list[str] = ["*"]
    CORS_ALLOW_HEADERS: list[str] = ["*", "Authorization"]
    CORS_EXPOSE_HEADERS: list[str] = ["Authorization", "X-Request-ID"]

    # Logging settings
    LOG_LEVEL: str = "INFO"
    LOG_DIR: str = "logs"
    LOG_FILENAME_PREFIX: str = "app"
    LOG_BACKUP_COUNT: int = 10
    LOG_FORMAT: str = "standard"  # Options: "standard" or "json"
    LOG_REQUEST_BODY: bool = False  # Whether to log request bodies
    LOG_RESPONSE_BODY: bool = False  # Whether to log response bodies
    LOG_SENSITIVE_FIELDS: list[str] = ["password", "token", "secret", "key", "authorization"]
    LOG_PERFORMANCE_THRESHOLD_MS: int = 500  # Log slow operations above this threshold


    # Tool Stubbing Settings
    TOOL_STUBBING_ENABLED: bool = os.getenv("TOOL_STUBBING_ENABLED", "false").lower() == "true"
    TOOL_STUBBING_MODE: str = os.getenv("TOOL_STUBBING_MODE", "all")  # Options: "all", "external_only", "none"
    TOOL_STUBBING_DELAY_MS: int = int(os.getenv("TOOL_STUBBING_DELAY_MS", "500"))  # Simulate realistic delays
    TOOL_STUBBING_FAILURE_RATE: float = float(os.getenv("TOOL_STUBBING_FAILURE_RATE", "0.0"))  # 0.0-1.0 for testing error handling

    @property
    def DATABASE_URL(self) -> str:
        return f"mysql+pymysql://{self.DB_USER}:{self.DB_PASSWORD}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def anthropic_model(self) -> str:
        """Get the default Anthropic model"""
        return "claude-sonnet-4-20250514"

    @property
    def anthropic_api_key(self) -> str:
        """Get the Anthropic API key"""
        return self.ANTHROPIC_API_KEY

    class Config:
        env_file = ".env"
        case_sensitive = True
        env_file_encoding = 'utf-8'
        extra = "ignore"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)

        # Validate Google OAuth2 settings
        if not self.GOOGLE_CLIENT_ID:
            raise ValueError("GOOGLE_CLIENT_ID not found in environment variables")
        if not self.GOOGLE_CLIENT_SECRET:
            raise ValueError("GOOGLE_CLIENT_SECRET not found in environment variables")
        if not self.GOOGLE_REDIRECT_URI:
            raise ValueError("GOOGLE_REDIRECT_URI not found in environment variables")
        if not self.FRONTEND_URL:
            raise ValueError("FRONTEND_URL not found in environment variables")


settings = Settings()
