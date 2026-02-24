# Router Layer Rules & Best Practices

## Endpoint Design Principles

### Route Structure
- Use clear, RESTful naming conventions
- Group related endpoints using `APIRouter` with appropriate prefixes
- Use consistent HTTP methods (GET, POST, PUT, DELETE, PATCH)

#### ✅ PREFERRED Pattern
```python
router = APIRouter(prefix="/chat", tags=["chat"])

@router.post("/stream")  # POST /chat/stream
@router.get("/{chat_id}/messages")  # GET /chat/{chat_id}/messages
@router.post("/{chat_id}/messages")  # POST /chat/{chat_id}/messages
```

### Dependency Injection

#### Use Service Dependencies (Not Manual DB Injection)
```python
# ✅ PREFERRED
@router.post("/endpoint")
async def endpoint(
    session_service: UserSessionService = Depends(get_user_session_service),
    mission_service: MissionService = Depends(get_mission_service),
    current_user: User = Depends(validate_token)
):
    # Clean, testable, no DB concerns
    session = session_service.get_active_session(current_user.user_id)
```

```python
# ❌ AVOID
@router.post("/endpoint")
async def endpoint(
    db: Session = Depends(get_db),  # Manual DB injection
    current_user: User = Depends(validate_token)
):
    session_service = UserSessionService(db)  # Manual instantiation
```

## Request/Response Patterns

### Request Validation
- Use Pydantic models for request validation
- Keep request models focused and specific
- Use appropriate HTTP status codes

```python
@router.post("/create", response_model=CreateResponse)
async def create_resource(
    request: CreateRequest,
    service: MyService = Depends(get_my_service)
) -> CreateResponse:
    result = await service.create_resource(request)
    return CreateResponse(resource=result)
```

### Error Handling
- Let FastAPI handle HTTP exceptions
- Convert service exceptions to appropriate HTTP responses
- Use consistent error response format

```python
@router.get("/{resource_id}")
async def get_resource(
    resource_id: str,
    service: MyService = Depends(get_my_service)
):
    try:
        resource = await service.get_resource(resource_id)
        return resource
    except NotFoundError:
        raise HTTPException(status_code=404, detail="Resource not found")
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

## Streaming Responses

### Server-Sent Events (SSE)
For streaming endpoints like chat:

```python
@router.post("/stream")
async def stream_endpoint(
    request: StreamRequest,
    service: MyService = Depends(get_my_service)
):
    async def event_generator():
        try:
            async for output in service.stream_data(request):
                yield {
                    "event": "message",
                    "data": json.dumps(output)
                }
        except Exception as e:
            yield {
                "event": "error", 
                "data": json.dumps({"error": str(e)})
            }
    
    return EventSourceResponse(event_generator())
```

## Authentication & Authorization

### Standard Pattern
- Use `Depends(validate_token)` for protected endpoints
- Extract user information from validated token
- Pass user context to services

```python
@router.post("/protected")
async def protected_endpoint(
    current_user: User = Depends(validate_token),
    service: MyService = Depends(get_my_service)
):
    result = await service.do_something(current_user.user_id)
    return result
```

## Documentation

### Endpoint Documentation
- Use clear docstrings for endpoint functions
- Provide meaningful `summary` and `description` parameters
- Document expected request/response formats

```python
@router.post("/create", 
    summary="Create new resource",
    description="Creates a new resource with the provided data"
)
async def create_resource(
    request: CreateRequest,
    service: MyService = Depends(get_my_service)
) -> CreateResponse:
    """
    Create a new resource.
    
    Args:
        request: Resource creation data
        service: Injected service dependency
        
    Returns:
        CreateResponse: Created resource information
    """
    # Implementation
```

## Testing

### Router Testing
- Use FastAPI's `TestClient` for integration tests
- Override dependencies for testing
- Test both success and error cases

```python
def test_endpoint():
    def mock_service():
        return Mock(spec=MyService)
    
    app.dependency_overrides[get_my_service] = mock_service
    
    response = client.post("/endpoint", json={"data": "test"})
    assert response.status_code == 200
```

## Performance Considerations

### Async/Await
- Use `async def` for all endpoint handlers
- Ensure all service calls are properly awaited
- Avoid blocking operations in request handlers

### Database Connections
- Never manage database connections directly in routers
- Let dependency injection handle connection lifecycle
- Use service layer for all database operations 