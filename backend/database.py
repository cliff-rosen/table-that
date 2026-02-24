from typing import Generator, AsyncGenerator
import logging
from models import Base
from config.settings import settings
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
import pymysql
pymysql.install_as_MySQLdb()

logger = logging.getLogger(__name__)

# =============================================================================
# Sync Engine (legacy - will be removed after full migration)
# =============================================================================

engine = create_engine(
    settings.DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db() -> Generator:
    """
    FastAPI dependency that provides a SYNC database session.
    DEPRECATED: Use get_async_db for new code.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =============================================================================
# Async Engine (new - use for all new code)
# =============================================================================

# Convert sync URL to async URL: mysql+pymysql:// -> mysql+aiomysql://
# Note: Can't use simple replace() because 'aiomysql://' contains 'mysql://' as substring
def _convert_to_async_url(url: str) -> str:
    """Convert sync MySQL URL to async aiomysql URL."""
    if url.startswith('mysql+pymysql://'):
        return 'mysql+aiomysql://' + url[len('mysql+pymysql://'):]
    elif url.startswith('mysql://'):
        return 'mysql+aiomysql://' + url[len('mysql://'):]
    else:
        return url

ASYNC_DATABASE_URL = _convert_to_async_url(settings.DATABASE_URL)

async_engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo=False,
)

AsyncSessionLocal = async_sessionmaker(
    async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an ASYNC database session.

    Usage:
        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_async_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


# =============================================================================
# Database Initialization
# =============================================================================

def init_db():
    """Initialize database tables (sync version for startup)."""
    logger.info("Initializing database...")
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized successfully")
    except Exception as e:
        logger.error(f"Error initializing database: {e}")
        raise e


async def init_async_db():
    """Initialize database tables (async version)."""
    logger.info("Initializing database (async)...")
    async with async_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized successfully")
