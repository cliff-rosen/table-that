# Canonical Schema Handling Methodology

## Overview

This document outlines the standardized approach for handling canonical schemas across the JAM-BOT system, ensuring type safety and consistency from tool handlers through API layers to the frontend.

## Architecture

### 1. Single Source of Truth
- **`schemas/canonical_types.py`**: Defines all canonical Pydantic models (e.g., `CanonicalSearchResult`, `CanonicalEmail`)
- **`schemas/schema_utils.py`**: Provides utilities for conversion, validation, and serialization
- **`tools/tools.json`**: References canonical types via `canonical_type` field instead of duplicating schemas

### 2. Type Flow

```
Service Layer → Tool Handler → Tool Execution Framework → Asset Storage
     ↓              ↓                     ↓                    ↓
Canonical      Canonical         Serialized +           Serialized
Objects        Objects           Canonical Objects      Objects
```

## Implementation Guidelines

### Tool Handlers

Tool handlers should:
1. **Return `ToolExecutionResult`** with properly typed outputs
2. **Preserve canonical types** - never convert to dictionaries manually
3. **Use canonical imports** from `schemas.canonical_types`

```python
from schemas.tool_handler_schema import ToolExecutionResult
from schemas.canonical_types import CanonicalSearchResult

@create_stub_decorator("web_search")
async def handle_web_search(input: ToolExecutionInput) -> ToolExecutionResult:
    result = await search_service.search(...)
    
    return ToolExecutionResult(
        outputs={
            "search_results": result["search_results"],  # List[CanonicalSearchResult]
            "query": result["query"],
            # ... other outputs
        }
    )
```

### Tool Execution Framework

The execution framework:
1. **Accepts both typed and untyped results** for backward compatibility
2. **Automatically serializes canonical objects** for asset storage
3. **Preserves canonical objects** in `canonical_outputs` field
4. **Uses schema utilities** for consistent handling

```python
from schemas.schema_utils import create_typed_response

# Returns both serialized and canonical versions
return create_typed_response(
    success=True,
    outputs=result.outputs,  # May contain canonical objects
    metadata=result.metadata
)
```

### API Layer

API endpoints should:
1. **Use canonical types directly** in response models
2. **Leverage existing service layer** canonical objects
3. **Maintain type consistency** from service to client

```python
from schemas.canonical_types import CanonicalSearchResult

class SearchResultsData(BaseModel):
    search_results: List[CanonicalSearchResult]  # Direct canonical usage
    query: str
    total_results: int
    # ...
```

### Tool Definitions

In `tools.json`:
1. **Reference canonical types** with `canonical_type` field
2. **Avoid schema duplication** - let canonical types define structure
3. **Use clear descriptions** that reference canonical schemas

```json
{
    "id": "search_results",
    "name": "search_results",
    "description": "List of web search results using canonical CanonicalSearchResult schema",
    "required": true,
    "schema_definition": {
        "type": "search_result",
        "description": "Canonical search result object",
        "is_array": true,
        "canonical_type": "CanonicalSearchResult"
    }
}
```

## Benefits

### 1. Type Safety
- **Compile-time validation** with Pydantic models
- **Runtime type checking** in tool handlers
- **Consistent data structures** across all layers

### 2. Maintainability
- **Single schema definition** prevents duplication
- **Centralized updates** - change once, apply everywhere
- **Clear documentation** of data structures

### 3. Developer Experience
- **IDE support** with proper typing
- **Clear error messages** from Pydantic validation
- **Automatic serialization** handling

### 4. Backward Compatibility
- **Gradual migration** - old handlers still work
- **Dual output format** - both serialized and canonical
- **Flexible consumption** - clients can choose format

## Utility Functions

### `schema_utils.py` provides:

- **`serialize_canonical_object(obj)`** - Convert canonical objects to dictionaries
- **`deserialize_canonical_object(data, type)`** - Convert dictionaries to canonical objects
- **`validate_canonical_data(data, type)`** - Validate data against canonical schemas
- **`create_typed_response(success, outputs, ...)`** - Create standardized responses
- **`is_canonical_type(obj)`** - Check if object is a canonical type

## Migration Guide

### Existing Tool Handlers

1. **Import canonical types**:
   ```python
   from schemas.canonical_types import CanonicalSearchResult
   ```

2. **Return `ToolExecutionResult`**:
   ```python
   return ToolExecutionResult(outputs={...})
   ```

3. **Remove manual serialization**:
   ```python
   # OLD - DON'T DO THIS
   search_results_dict = [result.model_dump() for result in results]
   
   # NEW - DO THIS
   return ToolExecutionResult(outputs={"search_results": results})
   ```

### Tool Definitions

1. **Add canonical type references**:
   ```json
   "schema_definition": {
       "type": "search_result",
       "is_array": true,
       "canonical_type": "CanonicalSearchResult"
   }
   ```

2. **Update sample responses** to match canonical structure

3. **Remove duplicate schema definitions**

## Common Patterns

### Service → Handler → API

```python
# Service returns canonical objects
service_result = await search_service.search(...)  # Returns List[CanonicalSearchResult]

# Handler preserves canonical objects
return ToolExecutionResult(outputs={"search_results": service_result["search_results"]})

# API uses canonical objects directly
class SearchResponse(BaseModel):
    search_results: List[CanonicalSearchResult]
```

### Error Handling

```python
try:
    result = await service.operation()
    return ToolExecutionResult(outputs=result)
except Exception as e:
    return ToolExecutionResult(
        outputs={
            "results": [],  # Empty but properly typed
            "error": str(e)
        }
    )
```

## Best Practices

1. **Always use canonical types** when dealing with structured data
2. **Let the framework handle serialization** - don't do it manually
3. **Import from canonical_types** - avoid defining duplicate schemas
4. **Use schema utilities** for complex conversions
5. **Test with real canonical objects** - not just dictionaries
6. **Document canonical type usage** in docstrings

## Anti-Patterns to Avoid

1. **Manual `model_dump()` calls** in tool handlers
2. **Duplicate schema definitions** in multiple files
3. **Dictionary-only thinking** - embrace typed objects
4. **Inconsistent serialization** - use utilities
5. **Ignoring canonical types** in new code

This methodology ensures consistent, type-safe handling of data structures across the entire JAM-BOT system while maintaining backward compatibility and developer productivity. 