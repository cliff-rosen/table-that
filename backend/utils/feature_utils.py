"""
Feature Utilities

Utilities for working with feature definitions in the workbench system.
Implements the ID-based feature system from the Article-Group Data Architecture.
"""

import uuid
from typing import List, Dict, Any, Optional


def generate_feature_id() -> str:
    """
    Generate a unique feature ID with the feat_ prefix.
    
    Returns:
        str: A unique feature ID in the format "feat_{uuid}"
    """
    return f"feat_{uuid.uuid4()}"


def ensure_feature_id(feature_definition: Dict[str, Any]) -> Dict[str, Any]:
    """
    Ensure a feature definition has an ID field.
    If no ID exists, generates one.
    
    Args:
        feature_definition: Dictionary containing feature definition
        
    Returns:
        Dict with guaranteed 'id' field
    """
    if 'id' not in feature_definition or not feature_definition['id']:
        feature_definition['id'] = generate_feature_id()
    return feature_definition


def ensure_feature_ids(feature_definitions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Ensure all feature definitions in a list have ID fields.
    
    Args:
        feature_definitions: List of feature definition dictionaries
        
    Returns:
        List of feature definitions with guaranteed 'id' fields
    """
    return [ensure_feature_id(feature) for feature in feature_definitions]


def feature_data_to_legacy_columns(
    feature_definitions: List[Dict[str, Any]], 
    articles_feature_data: Dict[str, Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Convert feature_data format to legacy columns format for backward compatibility.
    
    Args:
        feature_definitions: List of feature definitions with id and name
        articles_feature_data: Dict mapping article_id -> feature_data
        
    Returns:
        List of column dictionaries in legacy format
    """
    columns = []
    
    # Create mapping from feature ID to feature name
    id_to_name = {feature['id']: feature['name'] for feature in feature_definitions if 'id' in feature}
    
    for feature in feature_definitions:
        if 'id' not in feature:
            continue
            
        feature_id = feature['id']
        feature_name = feature['name']
        
        # Extract data for this feature across all articles
        column_data = {}
        for article_id, feature_data in articles_feature_data.items():
            if feature_id in feature_data:
                column_data[article_id] = feature_data[feature_id]
        
        # Create legacy column format
        column = {
            'name': feature_name,
            'description': feature.get('description', ''),
            'type': feature.get('type', 'text'),
            'data': column_data
        }
        
        if 'options' in feature:
            column['options'] = feature['options']
            
        columns.append(column)
    
    return columns


def legacy_columns_to_feature_data(
    columns: List[Dict[str, Any]]
) -> tuple[List[Dict[str, Any]], Dict[str, Dict[str, Any]]]:
    """
    Convert legacy columns format to feature_data format.
    
    Args:
        columns: List of column dictionaries in legacy format
        
    Returns:
        Tuple of (feature_definitions, articles_feature_data)
        - feature_definitions: List with id, name, description, type
        - articles_feature_data: Dict mapping article_id -> {feature_id: value}
    """
    feature_definitions = []
    articles_feature_data = {}
    
    for column in columns:
        # Generate feature definition with ID
        feature_def = {
            'id': generate_feature_id(),
            'name': column['name'],
            'description': column.get('description', ''),
            'type': column.get('type', 'text')
        }
        
        if 'options' in column:
            feature_def['options'] = column['options']
            
        feature_definitions.append(feature_def)
        
        # Convert column data to feature_data format
        column_data = column.get('data', {})
        for article_id, value in column_data.items():
            if article_id not in articles_feature_data:
                articles_feature_data[article_id] = {}
            articles_feature_data[article_id][feature_def['id']] = value
    
    return feature_definitions, articles_feature_data


def validate_feature_definition(feature_definition: Dict[str, Any]) -> Dict[str, str]:
    """
    Validate a feature definition and return any errors.
    
    Args:
        feature_definition: Dictionary containing feature definition
        
    Returns:
        Dictionary with field names as keys and error messages as values.
        Empty dict if no errors.
    """
    errors = {}
    
    # Required fields
    if 'name' not in feature_definition or not feature_definition['name']:
        errors['name'] = 'Feature name is required'
    
    if 'type' not in feature_definition or not feature_definition['type']:
        errors['type'] = 'Feature type is required'
    
    # Valid types
    valid_types = ['boolean', 'text', 'number', 'score']
    if 'type' in feature_definition and feature_definition['type'] not in valid_types:
        errors['type'] = f'Feature type must be one of: {", ".join(valid_types)}'
    
    # Score type validation
    if feature_definition.get('type') == 'score':
        options = feature_definition.get('options', {})
        if 'min' not in options or 'max' not in options:
            errors['options'] = 'Score type requires min and max options'
        elif options['min'] >= options['max']:
            errors['options'] = 'Score min must be less than max'
    
    return errors


def get_feature_by_id(feature_definitions: List[Dict[str, Any]], feature_id: str) -> Optional[Dict[str, Any]]:
    """
    Find a feature definition by its ID.
    
    Args:
        feature_definitions: List of feature definitions
        feature_id: ID to search for
        
    Returns:
        Feature definition dict if found, None otherwise
    """
    for feature in feature_definitions:
        if feature.get('id') == feature_id:
            return feature
    return None


def get_feature_by_name(feature_definitions: List[Dict[str, Any]], feature_name: str) -> Optional[Dict[str, Any]]:
    """
    Find a feature definition by its name.
    
    Args:
        feature_definitions: List of feature definitions  
        feature_name: Name to search for
        
    Returns:
        Feature definition dict if found, None otherwise
    """
    for feature in feature_definitions:
        if feature.get('name') == feature_name:
            return feature
    return None