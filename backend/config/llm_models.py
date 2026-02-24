"""
Configuration for LLM models and their capabilities
"""

from typing import Dict, List, Optional
from pydantic import BaseModel


class ModelCapabilities(BaseModel):
    """Capabilities and parameters supported by a model"""
    supports_reasoning_effort: bool = False
    reasoning_effort_levels: Optional[List[str]] = None
    supports_temperature: bool = True  # Models with reasoning effort don't support temperature
    uses_max_completion_tokens: bool = False  # Newer models use max_completion_tokens instead of max_tokens
    max_tokens: Optional[int] = None
    supports_vision: bool = False
    supports_function_calling: bool = True
    supports_structured_outputs: bool = True


# Model configurations with their capabilities
MODEL_CONFIGS: Dict[str, ModelCapabilities] = {
    # GPT-5 Series - Latest generation with advanced reasoning support
    "gpt-5": ModelCapabilities(
        supports_reasoning_effort=True,
        reasoning_effort_levels=["minimal", "low", "medium", "high"],
        supports_temperature=False,  # Reasoning models don't support temperature
        uses_max_completion_tokens=True,  # Reasoning models use max_completion_tokens
        max_tokens=128000,
        supports_vision=True,
        supports_function_calling=True,
        supports_structured_outputs=True
    ),
    "gpt-5-mini": ModelCapabilities(
        supports_reasoning_effort=True,
        reasoning_effort_levels=["minimal", "low", "medium", "high"],
        supports_temperature=False,  # Reasoning models don't support temperature
        uses_max_completion_tokens=True,  # Reasoning models use max_completion_tokens
        max_tokens=64000,
        supports_vision=True,
        supports_function_calling=True,
        supports_structured_outputs=True
    ),
    "gpt-5-nano": ModelCapabilities(
        supports_reasoning_effort=True,
        reasoning_effort_levels=["minimal", "low", "medium", "high"],
        supports_temperature=False,  # Reasoning models don't support temperature
        uses_max_completion_tokens=True,  # Reasoning models use max_completion_tokens
        max_tokens=32000,
        supports_vision=False,
        supports_function_calling=True,
        supports_structured_outputs=True
    ),
    
    # GPT-4.1 Series - Enhanced GPT-4
    "gpt-4.1": ModelCapabilities(
        supports_reasoning_effort=False,  # GPT-4.1 doesn't support reasoning effort
        uses_max_completion_tokens=True,  # Newer OpenAI API uses max_completion_tokens
        max_tokens=128000,
        supports_vision=True,
        supports_function_calling=True,
        supports_structured_outputs=True
    ),
}


# Task-specific model configurations for smart search
TASK_CONFIGS = {
    "smart_search": {
        "evidence_spec": {
            "model": "gpt-5-mini",
            "reasoning_effort": "minimal",
            "description": "Generate structured evidence specifications"
        },
        "extract_concepts": {
            "model": "gpt-4.1",
            "reasoning_effort": "low",
            "description": "Generate precise boolean search queries"
        },
        "keyword_generation": {
            "model": "gpt-4.1",
            "reasoning_effort": "low",
            "description": "Generate precise boolean search queries"
        },
        "keyword_optimization": {
            "model": "gpt-5-mini",
            "reasoning_effort": "medium",
            "description": "Optimize search queries for result volume"
        },
        "discriminator": {
            "model": "gpt-4.1",  # Use more powerful model for filtering accuracy
            "temperature": 0.0,  # Fixed temperature for consistent filtering
            "description": "Semantic filtering of search results"
        },
        "feature_extraction": {
            "model": "gpt-5-mini",
            "reasoning_effort": "minimal",
            "description": "Extract structured features from articles"
        }
    },
    
    # General extraction tasks
    "extraction": {
        "default": {
            "model": "gpt-5-mini",
            "reasoning_effort": "medium",
            "description": "General data extraction tasks"
        },
        "complex": {
            "model": "gpt-5",
            "reasoning_effort": "high",
            "description": "Complex extraction requiring deeper understanding"
        }
    },

    # Document analysis tasks
    "document_analysis": {
        "hierarchical_summary": {
            "model": "gpt-4.1",
            "temperature": 0.3,
            "description": "Hierarchical document summarization"
        },
        "entity_extraction": {
            "model": "gpt-4.1",
            "temperature": 0.1,
            "description": "Entity extraction from documents"
        },
        "claim_extraction": {
            "model": "gpt-4.1",
            "temperature": 0.2,
            "description": "Claim and argument extraction"
        },
        "stance_analysis": {
            "model": "gpt-4.1",
            "temperature": 0.2,
            "description": "Article stance analysis (pro-defense vs pro-plaintiff)"
        }
    },
    
    # Default fallback
    "default": {
        "general": {
            "model": "gpt-5-mini",
            "reasoning_effort": "medium",
            "description": "Default configuration for unspecified tasks"
        }
    }
}


def get_model_capabilities(model_name: str) -> ModelCapabilities:
    """
    Get the capabilities for a specific model.
    
    Args:
        model_name: The name of the model
        
    Returns:
        ModelCapabilities object for the model
        
    Raises:
        ValueError: If the model is not found in the configuration
    """
    if model_name not in MODEL_CONFIGS:
        raise ValueError(f"Model {model_name} not found in configuration. Available models: {list(MODEL_CONFIGS.keys())}")
    return MODEL_CONFIGS[model_name]


def supports_reasoning_effort(model_name: str) -> bool:
    """
    Check if a model supports the reasoning effort parameter.
    
    Args:
        model_name: The name of the model
        
    Returns:
        True if the model supports reasoning effort, False otherwise
    """
    try:
        capabilities = get_model_capabilities(model_name)
        return capabilities.supports_reasoning_effort
    except ValueError:
        return False


def supports_temperature(model_name: str) -> bool:
    """
    Check if a model supports the temperature parameter.
    
    Args:
        model_name: The name of the model
        
    Returns:
        True if the model supports temperature, False otherwise
    """
    try:
        capabilities = get_model_capabilities(model_name)
        return capabilities.supports_temperature
    except ValueError:
        return True  # Default to True for unknown models


def get_valid_reasoning_efforts(model_name: str) -> Optional[List[str]]:
    """
    Get the valid reasoning effort levels for a model.

    Args:
        model_name: The name of the model

    Returns:
        List of valid reasoning effort levels, or None if not supported
    """
    try:
        capabilities = get_model_capabilities(model_name)
        if capabilities.supports_reasoning_effort:
            return capabilities.reasoning_effort_levels
        return None
    except ValueError:
        return None


def uses_max_completion_tokens(model_name: str) -> bool:
    """
    Check if a model uses max_completion_tokens instead of max_tokens.

    Args:
        model_name: The name of the model

    Returns:
        True if the model uses max_completion_tokens, False otherwise
    """
    try:
        capabilities = get_model_capabilities(model_name)
        return capabilities.uses_max_completion_tokens
    except ValueError:
        return False  # Default to False for unknown models


def get_task_config(category: str, task: str = None) -> dict:
    """
    Get model configuration for a specific category and task.
    
    Args:
        category: The category of task (e.g., 'smart_search', 'extraction')
        task: The specific task within the category (optional)
    
    Returns:
        Dictionary with model configuration including reasoning effort
    """
    if category in TASK_CONFIGS:
        if task and task in TASK_CONFIGS[category]:
            return TASK_CONFIGS[category][task]
        elif "default" in TASK_CONFIGS[category]:
            return TASK_CONFIGS[category]["default"]
    
    # Return default configuration if category or task not found
    return TASK_CONFIGS["default"]["general"]