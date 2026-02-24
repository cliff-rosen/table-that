# Schemas Layer Rules & Best Practices

## Pydantic Model Design

### Naming Conventions
- Use descriptive, domain-specific names
- Suffix request models with `Request`
- Suffix response models with `Response`
- Use clear, unambiguous field names

```python
# ✅ PREFERRED
class CreateUserRequest(BaseModel):
    email: str
    password: str
    
class CreateUserResponse(BaseModel):
    user: User
    session_id: str
```

### Field Definitions
- Use `Field()` for documentation and validation
- Provide clear descriptions for all fields
- Set appropriate defaults where needed
- Use proper type hints

```python
class ChatMessage(BaseModel):
    id: str = Field(description="Unique identifier for the message")
    chat_id: str = Field(description="ID of the parent chat")
    role: MessageRole = Field(description="Role of the message sender")
    content: str = Field(description="Content of the message")
    message_metadata: Dict[str, Any] = Field(
        default_factory=dict, 
        description="Additional message metadata"
    )
```

## Model Categories

### 1. Persistence Models
Models that directly represent database entities:

```python
class User(BaseModel):
    """User entity from database"""
    id: str
    email: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True  # For SQLAlchemy compatibility
```

### 2. Request Models
Models for API request payloads:

```python
class CreateChatMessageRequest(BaseModel):
    """Request to create a new chat message"""
    role: MessageRole
    content: str
    message_metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
```

### 3. Response Models
Models for API responses:

```python
class CreateChatMessageResponse(BaseModel):
    """Response when creating a new chat message"""
    message: ChatMessage
    success: bool = True
```

### 4. Internal Models
Models for internal business logic:

```python
class AssetReference(BaseModel):
    """Lightweight asset reference for internal use"""
    id: str
    name: str
    type: str
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict)
```

## Validation Rules

### Field Validation
Use Pydantic validators for complex business rules:

```python
class UserCreate(BaseModel):
    email: str = Field(..., pattern=r'^[^@]+@[^@]+\.[^@]+$')
    password: str = Field(..., min_length=8)
    
    @validator('email')
    def validate_email_domain(cls, v):
        if '@example.com' in v:
            raise ValueError('Example domains not allowed')
        return v
```

### Custom Validators
```python
class MissionRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    goal: str = Field(..., min_length=10)
    
    @validator('goal')
    def validate_goal_specificity(cls, v):
        if len(v.split()) < 5:
            raise ValueError('Goal must be more specific (at least 5 words)')
        return v
```

## Enums

### Define Clear Enums
```python
class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"
    STATUS = "status"

class AssetStatus(str, Enum):
    PROPOSED = "proposed"
    PENDING = "pending"
    READY = "ready"
    FAILED = "failed"
```

### Use Enums Consistently
- Always use enums for fixed sets of values
- Provide string values for API compatibility
- Document enum meanings when not obvious

## Type Hints

### Complex Types
```python
from typing import List, Optional, Dict, Any, Union

class ComplexModel(BaseModel):
    items: List[str] = Field(default_factory=list)
    metadata: Dict[str, Any] = Field(default_factory=dict)
    optional_field: Optional[str] = None
    union_field: Union[str, int] = Field(description="Can be string or integer")
```

### Generic Types
```python
from typing import Generic, TypeVar

T = TypeVar('T')

class ApiResponse(BaseModel, Generic[T]):
    data: T
    success: bool = True
    message: Optional[str] = None
```

## Configuration

### Model Configuration
```python
class MyModel(BaseModel):
    field1: str
    field2: int
    
    class Config:
        # For SQLAlchemy ORM compatibility
        from_attributes = True
        
        # Validate assignment after creation
        validate_assignment = True
        
        # Use enum values in schema
        use_enum_values = True
        
        # JSON schema customization
        schema_extra = {
            "example": {
                "field1": "example value",
                "field2": 42
            }
        }
```

## Schema Organization

### File Structure
- Group related schemas in the same file
- Use clear module names
- Import common base classes
- Keep dependencies minimal

```python
# schemas/chat.py
from .base import BaseModel
from .workflow import Mission  # Cross-references are OK
from typing import List, Optional
```

### Base Classes
```python
# schemas/base.py
from pydantic import BaseModel as PydanticBaseModel
from datetime import datetime
from typing import Optional

class BaseModel(PydanticBaseModel):
    """Base model with common configuration"""
    
    class Config:
        from_attributes = True
        validate_assignment = True
        use_enum_values = True

class TimestampedModel(BaseModel):
    """Model with timestamp fields"""
    created_at: datetime
    updated_at: datetime
```

## Testing

### Model Testing
```python
def test_chat_message_creation():
    message = ChatMessage(
        id="test-id",
        chat_id="test-chat",
        role=MessageRole.USER,
        content="Test message",
        message_metadata={},
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    
    assert message.role == MessageRole.USER
    assert message.content == "Test message"

def test_validation_error():
    with pytest.raises(ValidationError):
        CreateUserRequest(
            email="invalid-email",  # Should fail validation
            password="short"        # Too short
        )
```

## Documentation

### Model Documentation
- Use docstrings for complex models
- Document business rules and constraints
- Provide examples in schema_extra

```python
class Mission(BaseModel):
    """
    A mission represents a high-level goal with specific success criteria.
    
    Missions are composed of multiple hops (steps) that work together
    to achieve the overall objective.
    """
    id: str = Field(description="Unique mission identifier")
    title: str = Field(description="Human-readable mission title")
    goal: str = Field(description="Specific, measurable goal statement")
    
    class Config:
        schema_extra = {
            "example": {
                "id": "mission-123",
                "title": "Process Customer Feedback",
                "goal": "Analyze and categorize customer feedback from last month"
            }
        }
```

## Performance Considerations

### Lazy Loading
- Use `Optional` for expensive computed fields
- Consider separating heavy fields into separate models
- Use `exclude` in model_dump() for sensitive data

### Memory Efficiency
- Use appropriate field types (don't use `Any` unnecessarily)
- Consider using `constr` for string constraints
- Use `Field(exclude=True)` for internal-only fields 