"""
Base Schema Definitions

This module contains the most fundamental, shared types and Pydantic models
that other schema modules will build upon. It is the root of the new,
modular schema system.
"""

from pydantic import BaseModel, Field
from typing import Dict, Optional, Union, Literal, get_args, TYPE_CHECKING

if TYPE_CHECKING:
    from schemas.canonical_types import get_canonical_schema

# --- Common Type Definitions ---

# Defines the basic data types that can be represented.
PrimitiveType = Literal['string', 'number', 'boolean', 'primitive']
ComplexType = Literal['object', 'file', 'database_entity', 'markdown', 'config']
CanonicalType = Literal['email', 'webpage', 'search_result', 'newsletter', 'daily_newsletter_recap', 'pubmed_extraction', 'scored_article', 'scholar_article']
ValueType = Union[PrimitiveType, ComplexType, CanonicalType]

# Defines the role an asset plays within a workflow.
AssetRole = Literal['input', 'output', 'intermediate']


# --- Core Schema Models ---

class SchemaType(BaseModel):
    """
    Defines the structure and type of a piece of data, whether it's an asset,
    a tool parameter, or a tool output. It is the fundamental building block
    for describing data schemas.
    """
    type: ValueType
    description: Optional[str] = None
    is_array: bool = Field(default=False)
    fields: Optional[Dict[str, 'SchemaType']] = Field(default=None, description="Schema for nested objects")

class SchemaEntity(BaseModel):
    """
    A base model for any entity that has a schema. This includes Assets,
    ToolParameters, and ToolOutputs, providing them with common fields like
    id, name, description, and a schema definition.
    """
    id: str
    name: str
    description: str
    schema_definition: SchemaType

    model_config = {
        "populate_by_name": True,
        "arbitrary_types_allowed": True,
    }


# --- Utility Functions ---

def is_compatible_schema(source_schema: SchemaType, target_schema: SchemaType) -> bool:
    """
    Checks if a source schema can be safely used where a target schema is
    expected. This is crucial for validating connections between tool steps.
    """
    if source_schema.type == target_schema.type:
        return True
    
    # Allow broader types to be compatible with more specific custom types.
    if source_schema.type in ['string', 'object'] and is_custom_type(target_schema.type):
        return True
    
    return False

def is_custom_type(type_value: ValueType) -> bool:
    """Checks if a given type is one of the defined custom types."""
    return type_value in get_args(CanonicalType)

def is_primitive_type(type_value: ValueType) -> bool:
    """Checks if a given type is a primitive type."""
    return type_value in get_args(PrimitiveType)

def resolve_canonical_schema(schema: SchemaType) -> SchemaType:
    """
    Resolve a SchemaType that references a canonical type by expanding it
    to include the full field definitions.
    
    Args:
        schema: The schema to resolve
        
    Returns:
        Resolved schema with canonical type fields expanded
    """
    if not is_custom_type(schema.type):
        return schema
    
    # Import here to avoid circular imports
    from schemas.canonical_types import get_canonical_schema
    
    try:
        canonical_schema = get_canonical_schema(schema.type)
        # Preserve the original array setting and description
        canonical_schema.is_array = schema.is_array
        if schema.description:
            canonical_schema.description = schema.description
        return canonical_schema
    except ValueError:
        # If we can't resolve the canonical type, return the original
        return schema

# Pydantic v2 requires this to correctly resolve forward references in models.
SchemaType.model_rebuild() 