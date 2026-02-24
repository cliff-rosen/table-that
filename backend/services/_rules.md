# Services Layer Rules & Best Practices

## Database Dependency Injection Pattern

### Standard Approach: Dependency Functions
Use **dependency functions** instead of manual service instantiation to maintain consistency with FastAPI patterns.

#### ✅ PREFERRED Pattern
```python
# In service file
async def get_user_session_service(db: Session = Depends(get_db)) -> UserSessionService:
    return UserSessionService(db)

async def get_mission_service(db: Session = Depends(get_db)) -> MissionService:
    return MissionService(db)

# In router
@router.post("/endpoint")
async def endpoint(
    session_service: UserSessionService = Depends(get_user_session_service),
    mission_service: MissionService = Depends(get_mission_service)
):
    # Use services directly - no DB injection needed
    session = session_service.get_active_session(user_id)
```

#### ❌ AVOID Pattern
```python
# In router - DON'T DO THIS
@router.post("/endpoint")
async def endpoint(
    db: Session = Depends(get_db)  # Manual DB injection
):
    session_service = UserSessionService(db)  # Manual instantiation
    mission_service = MissionService(db)     # Manual instantiation
```

### Benefits of Dependency Functions
1. **Consistency**: Matches FastAPI's dependency injection philosophy
2. **Cleaner routers**: No manual service instantiation
3. **Easier testing**: Can mock individual services
4. **Better separation**: Services don't leak database concerns to callers

## Service Class Design

### Constructor Pattern
```python
class MyService:
    def __init__(self, db: Session):
        self.db = db
    
    async def my_method(self, param: str) -> Result:
        # Use self.db for database operations
        return self.db.query(...).first()
```

### Dependency Function Pattern
```python
async def get_my_service(db: Session = Depends(get_db)) -> MyService:
    return MyService(db)
```

## Entity Lookups by ID

### The Problem
Inline queries with null checks are scattered everywhere:

```python
# ❌ BAD - Repeated everywhere
def some_method(self, stream_id: int):
    stream = self.db.query(ResearchStream).filter(
        ResearchStream.stream_id == stream_id
    ).first()
    if not stream:
        raise ValueError(f"Stream {stream_id} not found")
    # ... use stream
```

### The Solution
Each service that owns a domain object MUST provide canonical lookup methods:

```python
# ✅ GOOD - Canonical method in the owning service
class ResearchStreamService:
    def get_stream_by_id(self, stream_id: int) -> ResearchStream:
        """
        Get a research stream by ID, raising ValueError if not found.

        For HTTP-facing code, use get_stream_or_404 instead.
        """
        stream = self.db.query(ResearchStream).filter(
            ResearchStream.stream_id == stream_id
        ).first()
        if not stream:
            raise ValueError(f"Research stream {stream_id} not found")
        return stream

    def get_stream_or_404(self, stream_id: int) -> ResearchStream:
        """
        Get a research stream by ID, raising HTTPException 404 if not found.

        For internal services, use get_stream_by_id instead.
        """
        try:
            return self.get_stream_by_id(stream_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research stream not found"
            )
```

### Two Methods Per Entity

| Method | Exception | Use Case |
|--------|-----------|----------|
| `get_*_by_id(id)` | `ValueError` | Internal services (e.g., PipelineService) |
| `get_*_or_404(id)` | `HTTPException(404)` | HTTP-facing code (routers, curation endpoints) |

The `_or_404` method wraps the `_by_id` method - single source of truth for the query.

### Callers Use Service Methods

```python
# ❌ BAD - Inline query in PipelineService
stream = self.db.query(ResearchStream).filter(
    ResearchStream.stream_id == execution.stream_id
).first()
if not stream:
    raise ValueError(f"Stream {execution.stream_id} not found")

# ✅ GOOD - Use the owning service's method
stream = self.research_stream_service.get_stream_by_id(execution.stream_id)
```

### Standard Methods Per Service

| Service | Entity | Methods |
|---------|--------|---------|
| `UserService` | `User` | `get_user(id)`, `get_user_or_404(id)` |
| `ResearchStreamService` | `ResearchStream` | `get_stream_by_id(id)`, `get_stream_or_404(id)` |
| `ReportService` | `Report` | `async_get_report_with_access(id, user_id)` |
| `WipArticleService` | `WipArticle` | `get_by_id(id)` |
| `PipelineService` | `PipelineExecution` | `get_execution_by_id(id)` |

### Benefits
1. **Single source of truth** - Query logic in one place
2. **Consistent error messages** - Same format everywhere
3. **No boilerplate** - Callers don't repeat the pattern
4. **Testable** - Can mock the service method
5. **Type-safe** - Return type is non-optional

## Error Handling

### Service Methods Should
- Raise domain-specific exceptions (ValidationError, NotFoundError)
- Log errors appropriately
- Handle database transaction rollbacks
- Return well-typed results

### Example
```python
async def create_resource(self, data: CreateRequest) -> Resource:
    try:
        resource = Resource(...)
        self.db.add(resource)
        self.db.commit()
        return resource
    except Exception as e:
        self.db.rollback()
        logger.error(f"Failed to create resource: {str(e)}")
        raise ValidationError(f"Resource creation failed: {str(e)}")
```

## Testing

### Mock Services in Tests
```python
# Test setup
def mock_user_session_service():
    mock_service = Mock(spec=UserSessionService)
    mock_service.get_active_session.return_value = mock_session
    return mock_service

# In test
app.dependency_overrides[get_user_session_service] = mock_user_session_service
```

## State Transition Service

### Tool Step Completion for Testing

The StateTransitionService now supports tool step completion for testing purposes through the `COMPLETE_TOOL_STEP` transaction type.

#### Features
- Simulates successful tool step execution without running actual tools
- Generates realistic output data based on result_mapping
- Creates output assets in the hop scope
- Tracks hop progress and completion status
- Updates tool step status to COMPLETED with timestamps

#### Usage
```python
# Via API endpoint
POST /state-transitions/execute
{
    "transaction_type": "complete_tool_step",
    "data": {
        "tool_step_id": "step-123",
        "simulated_output": {
            "custom_output": "Override default simulation"
        }
    }
}

# Via service directly
result = await state_transition_service.updateState(
    TransactionType.COMPLETE_TOOL_STEP,
    {
        "tool_step_id": tool_step_id,
        "user_id": user_id,
        "simulated_output": {"custom_data": "test"}
    }
)
```

#### Output Generation
- Analyzes result_mapping to determine expected outputs
- Creates realistic simulated data based on output name patterns
- Supports text, JSON, file, URL, and numeric outputs
- Allows custom output via `simulated_output` parameter

#### Asset Creation
- Creates output assets in hop scope based on result_mapping
- Determines asset type automatically from output data
- Includes metadata marking assets as simulated
- Links assets to generating tool step

## Migration Strategy

When refactoring existing services:
1. Keep existing service class unchanged
2. Add dependency function
3. Update routers to use dependency function
4. Remove manual DB injection from routers
5. Update tests to use dependency overrides 