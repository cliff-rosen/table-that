# Code Structure Checklist

## Backend

### `routers/` - API Layer
- Endpoint definitions (`@router.get`, `@router.post`, etc.)
- Calls services, does NOT contain business logic
- Does NOT make direct database queries

#### Routers Always Return Pydantic Schemas

Routers receive Models from services and convert them to Schemas before returning. These schemas come from one of two places:

**1. Domain schemas** (from `schemas/{domain}.py`):
- Represent business/domain concepts: `Report`, `Article`, `ResearchStream`
- Shared across multiple endpoints
- Import them, do NOT redefine them in the router

**2. Router-specific schemas** (defined in the router file):
- Named `{Action}Request` and `{Action}Response`
- Used for endpoint-specific shapes (pagination, combined responses, etc.)
- **Wrap domain objects** rather than duplicating their fields

```python
# ✅ CORRECT - Router-specific schema wraps domain object
class ReportsListResponse(BaseModel):
    reports: List[Report]  # Domain object from schemas/
    total: int
    page: int

# ✅ CORRECT - Return domain object directly when no wrapper needed
@router.get("/{report_id}", response_model=Report)
async def get_report(...):
    ...

# ❌ WRONG - Duplicating domain fields in router-specific schema
class ReportResponse(BaseModel):
    report_id: int        # Don't copy fields from Report
    report_name: str      # Just use Report directly
    ...
```

#### Schema Source Decision

| What you're returning | Schema source |
|----------------------|---------------|
| Single domain object | `schemas/{domain}.py` → use directly |
| List of domain objects | Router: `List[DomainObject]` or wrapper |
| Domain object + metadata | Router: wrapper that contains the domain object |
| Transformed/combined domain objects (API-only) | Router: `{Action}Response` with custom fields |
| Request payload | Router: `{Action}Request` |

#### Routers Getting Services

Routers instantiate services with the database session:

```python
@router.get("/{report_id}")
async def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    service = ReportService(db)  # Instantiate with db session
    report = service.get_report(report_id, current_user.user_id)
    return ReportSchema.from_orm(report)
```

### `services/` - Business Logic Layer
- All business logic lives here
- Database queries (via SQLAlchemy)
- Returns **typed data**: SQLAlchemy Models, Pydantic schemas, or dataclasses
- **NEVER returns `Dict[str, Any]`** - always use typed structures
- Does NOT define API-specific types

#### Service Constructor and Dependencies

Services receive the database session in their constructor and lazy-load other services:

```python
class ReportService:
    def __init__(self, db: Session):
        self.db = db
        self._wip_article_service = None  # Lazy-loaded
        self._association_service = None

    @property
    def wip_article_service(self):
        """Lazy-load to avoid circular imports."""
        if self._wip_article_service is None:
            from services.wip_article_service import WipArticleService
            self._wip_article_service = WipArticleService(self.db)
        return self._wip_article_service

    @property
    def association_service(self):
        if self._association_service is None:
            from services.report_article_association_service import ReportArticleAssociationService
            self._association_service = ReportArticleAssociationService(self.db)
        return self._association_service
```

Usage within the service:
```python
def get_report_analytics(self, report_id: int) -> PipelineAnalytics:
    # Use other services via properties
    wip_articles = self.wip_article_service.get_by_execution_id(execution_id)
    count = self.association_service.count_visible(report_id)
    ...
```

#### Service Return Types

Services should return **typed data structures**. The choice depends on what the service is producing:

| What the service produces | Return type | Example |
|---------------------------|-------------|---------|
| Single database entity | SQLAlchemy Model | `get_report() -> Report` |
| List of database entities | `List[Model]` | `get_reports() -> List[Report]` |
| Aggregated/computed view | Pydantic schema | `get_execution_queue() -> List[ExecutionQueueItem]` |
| Model + computed fields | Pydantic schema or dataclass | `get_report_with_stats() -> ReportWithStats` |
| External API data | Pydantic schema | `search_pubmed() -> List[CanonicalResearchArticle]` |

**The key rule: NEVER return `Dict[str, Any]`.** Always use a typed structure.

```python
# ✅ CORRECT - Entity CRUD returns Model
class ReportService:
    def get_report(self, report_id: int, user_id: int) -> Report:
        return self.db.query(Report).filter(...).first()

# ✅ CORRECT - Aggregated view returns Pydantic schema
class OperationsService:
    def get_execution_queue(self, ...) -> List[ExecutionQueueItem]:
        # Combines data from multiple tables into a typed view
        return [ExecutionQueueItem(...) for execution in executions]

# ✅ CORRECT - External API data returns Pydantic schema
class PubMedService:
    def search_articles(self, query: str) -> List[CanonicalResearchArticle]:
        # Converts external API response to our canonical type
        return [CanonicalResearchArticle(...) for article in results]

# ❌ WRONG - Returning untyped dict
class InvitationService:
    def list_invitations(self) -> List[Dict[str, Any]]:  # NO!
        return [{"id": inv.id, "email": inv.email, ...}]  # Use a typed schema instead
```

#### Router Conversion

When a service returns a SQLAlchemy Model, the router converts it to a Pydantic schema:

```python
@router.get("/{report_id}", response_model=ReportSchema)
async def get_report(report_id: int, ...):
    report = service.get_report(report_id, user_id)  # Returns Model
    return ReportSchema.from_orm(report)             # Convert to Schema
```

When a service returns a Pydantic schema (for aggregated views), the router can return it directly:

```python
@router.get("/queue", response_model=ExecutionQueueResponse)
async def get_queue(...):
    items = service.get_execution_queue(...)  # Returns List[ExecutionQueueItem]
    return ExecutionQueueResponse(items=items, total=len(items))
```

#### Computed Data Patterns

**Option 1: Service returns a Pydantic schema directly**

For aggregated views that combine data from multiple sources, define the schema in `schemas/` and return it from the service:

```python
# In schemas/research_stream.py
class ExecutionQueueItem(BaseModel):
    execution_id: str
    stream_name: str
    status: ExecutionStatus
    article_count: Optional[int]
    # ... other fields

# In service
class OperationsService:
    def get_execution_queue(self, ...) -> List[ExecutionQueueItem]:
        # Query multiple tables, aggregate data
        return [ExecutionQueueItem(...) for execution in executions]
```

**Option 2: Service returns a dataclass (for internal use)**

For computed data used internally or when you want to avoid schema dependencies in services:

```python
# In service file
from dataclasses import dataclass

@dataclass
class ReportWithCount:
    report: Report       # SQLAlchemy model
    article_count: int   # Computed value

class ReportService:
    def get_report_with_count(self, report_id: int) -> ReportWithCount:
        report = self.db.query(Report).filter(...).first()
        count = self.association_service.count_visible(report_id)
        return ReportWithCount(report=report, article_count=count)
```

**Choosing between Pydantic schema and dataclass:**
- Use **Pydantic schema** when the type is shared/reusable across the codebase
- Use **dataclass** for service-internal computed results that need router transformation
- **Never use `Dict[str, Any]`** - always choose one of the above

#### Entity Lookups: `find()` vs `get()`

Services MUST use consistent naming for retrieval methods:

| Method | Returns | Use Case |
|--------|---------|----------|
| `find(...)` | `Optional[Model]` | Existence checks, may not exist |
| `get(...)` | `Model` (raises 404 if not found) | Retrieval of known records |

```python
class ReportArticleAssociationService:
    def find(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """Returns None if not found. Use for existence checks."""
        return self.db.query(...).first()

    def get(self, report_id: int, article_id: int) -> ReportArticleAssociation:
        """Raises HTTPException 404 if not found. Use for known records."""
        association = self.find(report_id, article_id)
        if not association:
            raise HTTPException(status_code=404, detail="Not found")
        return association
```

Usage:
```python
# Checking if something exists
existing = self.association_service.find(report_id, article_id)
if existing:
    # Handle existing case
    ...

# Retrieving a record that must exist
association = self.association_service.get(report_id, article_id)  # Raises if not found
```

#### Service Boundaries - NEVER Query Tables You Don't Own

**This is a critical rule.** Each domain entity has an owning service. Services MUST use other services for tables they don't own. **NEVER write `self.db.query(SomeModel)` for a model your service doesn't own.**

Why this matters:
- Encapsulation: The owning service may have specific loading strategies, filters, or business logic
- Eager loading: The owning service knows which relationships need to be loaded
- Consistency: All access to a table goes through one service, making it easy to add logging, caching, or access control
- Testability: You can mock the service instead of the database

```python
# ❌ WRONG - ReportService writing inline queries for WipArticle
class ReportService:
    def get_articles(self, execution_id: str):
        return self.db.query(WipArticle).filter(...).all()  # NO!

# ❌ WRONG - Any service querying ReportArticleAssociation directly
class SomeOtherService:
    def get_associations(self, report_id: int):
        return self.db.query(ReportArticleAssociation).filter(...).all()  # NO!

# ✅ CORRECT - Use the owning service
class ReportService:
    def get_articles(self, execution_id: str):
        return self.wip_article_service.get_by_execution_id(execution_id)

# ✅ CORRECT - Use ReportArticleAssociationService
class SomeOtherService:
    def get_associations(self, report_id: int):
        return self.association_service.get_visible_for_report(report_id)
```

**Service ownership:**
| Table | Owning Service | Other services MUST use |
|-------|----------------|-------------------------|
| `Report` | `ReportService` | `report_service.get_report()` |
| `WipArticle` | `WipArticleService` | `wip_article_service.get_by_*()` |
| `ReportArticleAssociation` | `ReportArticleAssociationService` | `association_service.get_*()` |
| `Article` | `ArticleService` | `article_service.get_*()` |
| `User` | `UserService` | `user_service.get_*()` |
| `ResearchStream` | `ResearchStreamService` | `stream_service.get_*()` |

**If you find yourself writing `self.db.query(ModelYouDontOwn)`, STOP and use the owning service instead.**

### `models/` - Database Layer
- SQLAlchemy ORM models (table definitions)
- Database relationships
- Enums used in database columns

### `schemas/` - Domain Objects
- Pydantic models representing **business/domain concepts**
- Shared across services
- NOT for API-specific response shapes (those go in routers)
- Examples: `Report`, `ReportArticle`, `ResearchStream`, `PipelineExecution`

---

## Logging

### Every Router Must Have

```python
import logging

logger = logging.getLogger(__name__)
```

### Endpoint Logging Pattern

Every endpoint MUST log:
1. **Entry** - When the endpoint is called (INFO level)
2. **Exit** - When returning successfully (INFO level)
3. **Errors** - Any exceptions (ERROR level with exc_info)

```python
@router.post("/analyze")
async def analyze_document(request: AnalyzeRequest, ...):
    logger.info(f"analyze_document called - user_id={current_user.user_id}")

    try:
        result = service.analyze(request.document_id)
        logger.info(f"analyze_document complete - user_id={current_user.user_id}")
        return result
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"analyze_document failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

### Log Levels

| Level | When | Example |
|-------|------|---------|
| DEBUG | Detailed diagnostic info | `logger.debug(f"Token expires in {seconds}s")` |
| INFO | Normal operations | `logger.info(f"Report generated - report_id={id}")` |
| WARNING | Recoverable issues | `logger.warning(f"Stream not found - user_id={user_id}")` |
| ERROR | Failures with exc_info | `logger.error(f"Failed: {e}", exc_info=True)` |

### Log Message Format

Always include context: `user_id`, `resource_id`, `operation`

```python
# ✅ GOOD
logger.info(f"delete_report - user_id={user_id}, report_id={report_id}")

# ❌ BAD
logger.info("Deleting report")
```

---

## Exception Handling

### Router Exception Pattern

```python
@router.post("/operation", response_model=ResponseSchema)
async def operation(request: RequestSchema, ...):
    logger.info(f"operation called - user_id={current_user.user_id}")

    try:
        result = service.do_operation(request, current_user.user_id)
        logger.info(f"operation complete - user_id={current_user.user_id}")
        return result
    except HTTPException:
        # Let HTTP exceptions pass through unchanged
        raise
    except ValueError as e:
        # Known business logic errors → 400
        logger.warning(f"operation validation failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        # Unexpected errors → 500
        logger.error(f"operation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
```

### Service Exceptions

Services raise:
- `HTTPException(404)` - Resource not found
- `HTTPException(403)` - Access denied (but prefer 404 to avoid revealing existence)
- `ValueError` - Invalid input/state (router converts to 400)
- Regular exceptions for unexpected errors (router converts to 500)

### Security: Use 404 for Unauthorized Access

Don't reveal that a resource exists if user can't access it:

```python
# ✅ CORRECT - Don't reveal existence
raise HTTPException(status_code=404, detail="Report not found")

# ❌ WRONG - Reveals the report exists
raise HTTPException(status_code=403, detail="Not authorized to access this report")
```

---

## Access Control

### User ID Must Come From JWT

The `user_id` for access control MUST come from the authenticated JWT token, never from request parameters:

```python
# ✅ CORRECT - user_id from JWT
@router.get("/{report_id}")
async def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)  # From JWT
):
    service = ReportService(db)
    return service.get_report(report_id, current_user.user_id)  # Use JWT user_id

# ❌ WRONG - user_id from request (security vulnerability!)
@router.get("/{report_id}")
async def get_report(
    report_id: int,
    user_id: int,  # Attacker can spoof any user_id!
    db: Session = Depends(get_db)
):
    ...
```

### Always Verify User Access

Never trust that a resource belongs to a user just because they provided an ID:

```python
# In service
def get_report(self, report_id: int, user_id: int) -> Report:
    report = self.db.query(Report).filter(Report.report_id == report_id).first()

    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    # Always verify access
    if not self._user_can_access_report(user_id, report):
        raise HTTPException(status_code=404, detail="Report not found")  # Don't reveal existence

    return report
```

### Admin Endpoints

Admin endpoints must verify admin role before any operations:

```python
@router.get("/admin/all-reports")
async def admin_list_all_reports(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role != UserRole.PLATFORM_ADMIN:
        logger.warning(f"Unauthorized admin access attempt - user_id={current_user.user_id}")
        raise HTTPException(status_code=403, detail="Admin access required")

    # Admin can proceed
    ...
```

---

## Typing Requirements

### Endpoint Response Models

Every endpoint MUST specify a `response_model` (unless returning 204 No Content):

```python
# ✅ CORRECT
@router.get("/{report_id}", response_model=ReportSchema)
async def get_report(...):
    ...

@router.delete("/{report_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_report(...):  # No response body, no response_model needed
    ...

# ❌ WRONG - missing response_model
@router.get("/{report_id}")
async def get_report(...):
    ...
```

### Service Method Typing

All service methods MUST have typed parameters and return types:

```python
# ✅ CORRECT
def get_report(self, report_id: int, user_id: int) -> Report:
    ...

def get_reports_for_user(self, user_id: int, limit: int = 50) -> List[Report]:
    ...

# ❌ WRONG - no types
def get_report(self, report_id, user_id):
    ...
```

---

## New Endpoint Checklist

Before merging any new endpoint, verify:

- [ ] `response_model` specified (or 204 status)
- [ ] Logging: entry, exit, and error logging with context
- [ ] Exception handling: try/except with HTTPException passthrough
- [ ] User ID from JWT (`current_user.user_id`), not request params
- [ ] User access verified for resource access
- [ ] Business logic in service, not router
- [ ] No direct database queries in router
- [ ] Service methods have type annotations

---

## TBD

### Database/Transaction Patterns
_To be documented: when to commit, session lifecycle, transaction boundaries_

### Testing Patterns
_To be documented: unit tests, integration tests, mocking services_

---

## Frontend

### `lib/api/` - API Client Layer
- API client functions
- **Import and use domain types from `types/`** - do NOT duplicate them
- Only define NEW types when the API shape is genuinely different (e.g., paginated wrapper, combined response)
- Do NOT create duplicates of domain types - import them

#### All API Calls Must Go Through Dedicated API Files

**Components must NEVER import `api` directly to make raw API calls.** Every backend endpoint must have a corresponding method in a dedicated API file.

```typescript
// ❌ WRONG - Direct api call in component
import { api } from '../../lib/api';

useEffect(() => {
    const response = await api.get('/api/llm/models');
    setModels(response.data.models);
}, []);

// ✅ CORRECT - Use dedicated API file
import { llmApi } from '../../lib/api/llmApi';

useEffect(() => {
    const response = await llmApi.getModels();
    setModels(response.models);
}, []);
```

**If an endpoint doesn't have an API file, create one:**
1. Create `lib/api/{domain}Api.ts` (e.g., `llmApi.ts`, `reportApi.ts`)
2. Define request/response types in the API file
3. Export the API object with methods for each endpoint
4. Import and use from components

This ensures:
- Centralized API logic (error handling, response transformation)
- Single source of truth for endpoint URLs
- Easier refactoring when endpoints change
- Better discoverability of available API methods

#### API Request Methods

**Standard requests** - Use the `api` instance from `index.ts`:
```typescript
import { api } from './index';

// GET request
const response = await api.get<MyType>('/api/endpoint');
return response.data;

// POST request
const response = await api.post<MyType>('/api/endpoint', requestBody);
return response.data;
```

**Streaming responses (async generator)** - Use `makeStreamRequest` from `streamUtils.ts`:
```typescript
import { makeStreamRequest } from './streamUtils';

// For endpoints that stream chunks of data (e.g., LLM responses)
for await (const chunk of makeStreamRequest('/api/chat/stream', params, 'POST')) {
    // chunk.data contains the raw streamed data
    processChunk(chunk.data);
}
```

**Server-Sent Events (SSE)** - Use `subscribeToSSE` from `streamUtils.ts`:
```typescript
import { subscribeToSSE } from './streamUtils';

// For endpoints that push discrete events (e.g., job status updates)
const cleanup = subscribeToSSE<MyEventType>(
    '/api/events/stream',
    (event) => handleEvent(event),      // Called for each parsed event
    (error) => handleError(error),      // Called on error
    () => handleComplete()              // Called when stream ends
);

// Call cleanup() to close the connection
```

#### When to Use Each Method

| Method | Use Case | Data Format |
|--------|----------|-------------|
| `api.get/post/etc` | Standard request-response | JSON |
| `makeStreamRequest` | Continuous data stream (LLM output) | Raw chunks |
| `subscribeToSSE` | Discrete event notifications (status updates) | Parsed JSON events |

#### Token Handling

**NEVER access localStorage directly for tokens.** All methods above handle auth automatically:

- `api` instance: Token injected via axios interceptor
- `makeStreamRequest`: Uses `getAuthToken()` internally
- `subscribeToSSE`: Uses `getAuthToken()` internally

If you need the token for a special case (rare), use:
```typescript
import { getAuthToken } from './index';
const token = getAuthToken(); // Handles main app + standalone apps (pubmed, trialscout)
```

### `types/` - Domain Types
- TypeScript types representing **business/domain concepts**
- Shared across components
- NOT for API-specific response shapes (those go in api files)

---

## Quick Decision Guide

| What you're creating | Backend location | Frontend location |
|---------------------|------------------|-------------------|
| API response shape | `routers/` | `lib/api/` |
| API request shape | `routers/` | `lib/api/` |
| Business/domain object | `schemas/` | `types/` |
| Database table | `models/` | N/A |
| Business logic | `services/` | N/A |
| API endpoint | `routers/` | N/A |
| API client function | N/A | `lib/api/` |
