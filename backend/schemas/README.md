# Canonical Schema System

This directory contains the canonical schema system for the JAM Bot application. The system ensures consistency and type safety across all custom data types used throughout the backend and frontend.

## Architecture

### Single Source of Truth
- **Pydantic BaseModel classes** in `canonical_types.py` are the definitive schema definitions
- **No duplication** - schemas are defined once and used everywhere
- **Dynamic generation** - `SchemaType` objects are automatically generated from Pydantic models

### Key Files

- `base.py` - Core schema framework and type definitions
- `canonical_types.py` - Canonical Pydantic models for all custom types
- `email.py`, `asset.py`, etc. - Domain-specific schemas that use canonical types

## Available Canonical Types

1. **Email** (`CanonicalEmail`)
   - Unified email structure for all email-related tools and services
   - Used by: `email_search` tool, email handlers, email services

2. **Search Result** (`CanonicalSearchResult`)
   - Standardized web search result format
   - Used by: `web_search` tool, search handlers

3. **Webpage** (`CanonicalWebpage`)
   - Consistent webpage representation
   - Used by: web scraping tools, content extraction

4. **Research Article** (`CanonicalResearchArticle`)
   - Unified academic article metadata from any source (PubMed, Google Scholar, etc.)
   - Used by: research tools, article extraction, workbench

5. **Newsletter** (`CanonicalNewsletter`)
   - Newsletter content and metadata
   - Used by: newsletter processing, content analysis

6. **Daily Newsletter Recap** (`CanonicalDailyNewsletterRecap`)
   - Daily summary and statistics
   - Used by: reporting tools, analytics

## Usage

### In Tools (tools.json)
```json
{
  "outputs": [
    {
      "id": "emails",
      "name": "emails",
      "description": "List of matching emails",
      "required": true,
      "schema_definition": {
        "type": "email",
        "description": "Email object",
        "is_array": true
      }
    }
  ]
}
```

### In Python Code
```python
from schemas.canonical_types import CanonicalEmail, get_canonical_model, validate_canonical_data

# Create and validate email data
email_data = {
    "id": "123",
    "subject": "Test",
    "body": "Hello",
    "sender": "test@example.com",
    # ... other fields
}

# Validate using canonical model
email = CanonicalEmail(**email_data)

# Or validate using type name
validated = validate_canonical_data('email', email_data)
```

### In Tool Handlers
```python
from schemas.canonical_types import CanonicalEmail

async def handle_email_search(input: ToolExecutionInput) -> Dict[str, Any]:
    # Process emails and return in canonical format
    emails = []
    for raw_email in search_results:
        canonical_email = CanonicalEmail(
            id=raw_email['id'],
            subject=raw_email['subject'],
            # ... map other fields
        )
        emails.append(canonical_email.model_dump())
    
    return {"emails": emails}
```

## Frontend Integration

The frontend has matching schema definitions in `frontend/src/types/base.ts` in the `getCanonicalTypeSchema()` function:

```typescript
import { getCanonicalTypeSchema } from '@/types/base';

// Get canonical schema for rendering
const emailSchema = getCanonicalTypeSchema('email');
// This will show proper structure in Tool Browser
```

**Important**: Frontend and backend schemas are manually kept in sync. When updating canonical types:
1. Update backend Pydantic model in `canonical_types.py`
2. Update frontend schema in `base.ts` `getCanonicalTypeSchema()` function

## Benefits

1. **Consistency** - Same data structure everywhere
2. **Type Safety** - Frontend and backend guaranteed to match
3. **Maintainability** - Change schema in one place
4. **Validation** - Automatic data validation
5. **Documentation** - Self-documenting through Pydantic models

## Adding New Canonical Types

1. **Backend**: Add Pydantic model to `canonical_types.py`
2. **Backend**: Add to `CustomType` literal in `base.py`
3. **Backend**: Add to `get_canonical_model()` function in `canonical_types.py`
4. **Frontend**: Add to `CustomType` type in `base.ts`
5. **Frontend**: Add schema definition to `getCanonicalTypeSchema()` function in `base.ts`
6. **Tools**: Update `tools.json` to use new canonical type
7. **Optional**: Add TypeScript interface to `canonical.ts` for type safety

## Testing

Run the test suite:
```bash
cd backend
python test_canonical_schemas.py
```

This validates that all canonical types work correctly and tools reference them properly. 