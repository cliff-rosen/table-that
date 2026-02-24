# Async SQLAlchemy Migration Specification

## Problem Statement

We have FastAPI endpoints that need to:
1. Perform database operations (SQLAlchemy)
2. Make parallel async calls to LLMs (OpenAI, etc.)

**Current situation:** Endpoints are defined as `async def` but use synchronous SQLAlchemy operations. This blocks the event loop, causing:
- Request queuing when multiple requests arrive concurrently
- Response times of 800-2600ms when actual work is only 250-300ms
- Poor concurrency despite having an async framework

**Root cause:** Synchronous database calls inside `async def` functions block the entire event loop. Other requests must wait until the blocking operation completes.

## Solution: Async SQLAlchemy 2.0

Migrate from synchronous SQLAlchemy to async SQLAlchemy 2.0, which provides native async/await support for database operations.

### Why This Is The Right Fix

1. **Native async support** - DB operations use `await`, don't block the event loop
2. **Compatible with async LLM calls** - Both DB and LLM operations are async, work together seamlessly
3. **True concurrency** - Multiple requests handled concurrently without blocking
4. **Modern best practice** - SQLAlchemy 2.0 has first-class async support; this is the recommended pattern for FastAPI

### Alternatives Considered

| Approach | Pros | Cons |
|----------|------|------|
| **Async SQLAlchemy (chosen)** | Native async, clean code, best concurrency | Migration effort |
| `run_in_threadpool` wrapper | Quick to implement | Tedious, every DB call wrapped |
| Sync endpoints (`def`) | Simple for pure-DB endpoints | Can't await LLM calls |
| Increase pool/threads | No code changes | Doesn't fix the blocking issue |

## Technical Specification

### 1. Async MySQL Driver

**Recommended: `aiomysql`**
- More widely adopted (1.7k GitHub stars)
- Active maintenance
- Good SQLAlchemy integration

**Alternative: `asyncmy`**
- Faster (cython-optimized)
- Newer, less battle-tested

**Connection string format:**
```
mysql+aiomysql://user:password@host:port/database?charset=utf8mb4
```

### 2. Database Configuration (`database.py`)

```python
from typing import AsyncGenerator
import logging
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from models import Base
from config.settings import settings

logger = logging.getLogger(__name__)

# Convert sync URL to async URL
# mysql+pymysql://... -> mysql+aiomysql://...
ASYNC_DATABASE_URL = settings.DATABASE_URL.replace(
    "mysql+pymysql://", "mysql+aiomysql://"
).replace(
    "mysql://", "mysql+aiomysql://"
)

# Create async engine
engine = create_async_engine(
    ASYNC_DATABASE_URL,
    pool_size=5,
    max_overflow=10,
    pool_timeout=30,
    pool_recycle=1800,
    pool_pre_ping=True,
    echo=False,  # Set True for SQL debugging
)

# Create async session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency that provides an async database session.

    Usage:
        @router.get("/items")
        async def get_items(db: AsyncSession = Depends(get_db)):
            result = await db.execute(select(Item))
            return result.scalars().all()
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def init_db():
    """Initialize database tables."""
    logger.info("Initializing database...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database initialized successfully")
```

### 3. Query Pattern Changes

#### SELECT queries

**Before (sync):**
```python
def get_user_by_email(self, email: str) -> User | None:
    return self.db.query(User).filter(User.email == email).first()
```

**After (async):**
```python
async def get_user_by_email(self, email: str) -> User | None:
    result = await self.db.execute(
        select(User).where(User.email == email)
    )
    return result.scalars().first()
```

#### SELECT with relationships (eager loading)

**Before (sync):**
```python
def get_report_with_articles(self, report_id: int) -> Report | None:
    return self.db.query(Report).options(
        joinedload(Report.articles)
    ).filter(Report.report_id == report_id).first()
```

**After (async):**
```python
async def get_report_with_articles(self, report_id: int) -> Report | None:
    result = await self.db.execute(
        select(Report)
        .options(selectinload(Report.articles))
        .where(Report.report_id == report_id)
    )
    return result.scalars().first()
```

> **Note:** Use `selectinload` instead of `joinedload` for async - it performs a separate SELECT query which works better with async.

#### INSERT

**Before (sync):**
```python
def create_user(self, user: User) -> User:
    self.db.add(user)
    self.db.commit()
    self.db.refresh(user)
    return user
```

**After (async):**
```python
async def create_user(self, user: User) -> User:
    self.db.add(user)
    await self.db.commit()
    await self.db.refresh(user)
    return user
```

#### UPDATE

**Before (sync):**
```python
def update_user(self, user_id: int, data: dict) -> User | None:
    user = self.db.query(User).filter(User.user_id == user_id).first()
    if user:
        for key, value in data.items():
            setattr(user, key, value)
        self.db.commit()
    return user
```

**After (async):**
```python
async def update_user(self, user_id: int, data: dict) -> User | None:
    result = await self.db.execute(
        select(User).where(User.user_id == user_id)
    )
    user = result.scalars().first()
    if user:
        for key, value in data.items():
            setattr(user, key, value)
        await self.db.commit()
    return user
```

#### DELETE

**Before (sync):**
```python
def delete_user(self, user_id: int) -> bool:
    user = self.db.query(User).filter(User.user_id == user_id).first()
    if user:
        self.db.delete(user)
        self.db.commit()
        return True
    return False
```

**After (async):**
```python
async def delete_user(self, user_id: int) -> bool:
    result = await self.db.execute(
        select(User).where(User.user_id == user_id)
    )
    user = result.scalars().first()
    if user:
        await self.db.delete(user)
        await self.db.commit()
        return True
    return False
```

#### Bulk operations

**After (async):**
```python
async def bulk_insert(self, items: list[Item]) -> None:
    self.db.add_all(items)
    await self.db.commit()

async def bulk_update(self, updates: list[dict]) -> None:
    await self.db.execute(
        update(Item),
        updates  # List of dicts with 'id' and fields to update
    )
    await self.db.commit()
```

### 4. Service Pattern

Services receive `AsyncSession` and use async methods:

```python
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

class UserService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_by_id(self, user_id: int) -> User | None:
        result = await self.db.execute(
            select(User).where(User.user_id == user_id)
        )
        return result.scalars().first()

    async def get_users_with_org(self) -> list[User]:
        result = await self.db.execute(
            select(User).options(selectinload(User.organization))
        )
        return result.scalars().all()
```

### 5. Router Pattern

Routers stay `async def` and await service methods:

```python
from sqlalchemy.ext.asyncio import AsyncSession

@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    db: AsyncSession = Depends(get_db)
):
    service = UserService(db)
    user = await service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

### 6. Mixed Async Operations (DB + LLM)

This is now clean - both are async:

```python
@router.post("/reports/{report_id}/summarize")
async def summarize_report(
    report_id: int,
    db: AsyncSession = Depends(get_db)
):
    # Async DB call
    service = ReportService(db)
    report = await service.get_report_with_articles(report_id)

    # Async LLM call (parallel processing inside)
    summary_service = ReportSummaryService()
    summary = await summary_service.generate_executive_summary(report)

    # Async DB update
    await service.update_report_summary(report_id, summary)

    return {"summary": summary}
```

### 7. Transaction Management

```python
async def transfer_funds(self, from_id: int, to_id: int, amount: float):
    async with self.db.begin():  # Auto-commits on success, rollbacks on exception
        from_account = await self.get_account(from_id)
        to_account = await self.get_account(to_id)

        from_account.balance -= amount
        to_account.balance += amount
        # Commits automatically when exiting the context
```

## Migration Strategy

### Phase 1: Infrastructure
1. Install `aiomysql` package
2. Update `database.py` with async engine and session
3. Update `get_db` dependency to be async

### Phase 2: Auth Service (Critical Path)
1. Migrate `validate_token` to async
2. Migrate `UserService.get_user_by_email` to async
3. Test authentication flow

### Phase 3: Core Services
Migrate services in dependency order:
1. `UserService`
2. `ResearchStreamService`
3. `ReportService`
4. `ReportArticleAssociationService`
5. Other services

### Phase 4: Routers
Update routers to use `AsyncSession` type hints and await service calls.

### Phase 5: Testing & Validation
1. Run all existing tests
2. Load test concurrent requests
3. Verify no event loop blocking

## Required Package Changes

Add to `requirements.txt`:
```
aiomysql>=0.2.0
```

## Import Changes Summary

**Old imports:**
```python
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
```

**New imports:**
```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy import select, update, delete
from sqlalchemy.orm import selectinload
```

## References

- [SQLAlchemy 2.1 MySQL Dialects](https://docs.sqlalchemy.org/en/21/dialects/mysql.html)
- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)
- [Building High-Performance Async APIs](https://leapcell.io/blog/building-high-performance-async-apis-with-fastapi-sqlalchemy-2-0-and-asyncpg)
- [Async FastAPI with SQLAlchemy Session Management](https://gichon.com/blog/async-fastapi-with-sqlalchemy-session)
- [FastSQLA - Async SQLAlchemy extension for FastAPI](https://github.com/hadrien/FastSQLA)
