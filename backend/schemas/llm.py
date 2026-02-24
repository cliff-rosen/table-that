"""
LLM types for AI model interactions

These types are used across the application for structuring messages to LLMs
(OpenAI, Anthropic, etc.). Used by agents, prompts, and services that call LLMs.

Organized to mirror frontend types/llm.ts for easy cross-reference.
Note: This file has additional Message Types section for LLM infrastructure.

NOT for user-facing chat - see schemas/chat.py for user chat types.
"""

from typing import Optional, Any, Dict, List, Literal
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


# =============================================================================
# Model Configuration Hierarchy
# =============================================================================

class ReasoningEffort(str, Enum):
    """Reasoning effort levels for reasoning models (o3, o3-mini, o4-mini)"""
    MINIMAL = "minimal"
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class ModelConfig(BaseModel):
    """Base configuration for model selection and parameters."""
    model_config = {
        "populate_by_name": True,  # Allow both 'model' and 'model_id'
        "protected_namespaces": (),  # Allow 'model_' prefix (needed for model_id field)
    }

    model_id: str = Field(
        description="Model identifier (e.g., 'gpt-4.1', 'o4-mini')",
        validation_alias="model"  # Accept 'model' from old database records
    )
    temperature: Optional[float] = Field(
        None,
        ge=0.0,
        le=2.0,
        description="Temperature (0.0-2.0) for chat models. Not supported by reasoning models."
    )
    reasoning_effort: Optional[ReasoningEffort] = Field(
        None,
        description="Reasoning effort level for reasoning models (o3, o3-mini, o4-mini). Not supported by chat models."
    )
    max_tokens: Optional[int] = Field(
        None,
        gt=0,
        description="Maximum tokens for the response. If not set, uses model default."
    )


class StageConfig(ModelConfig):
    """Configuration for a pipeline stage. Extends ModelConfig with concurrency settings."""
    max_concurrent: int = Field(
        default=10,
        gt=0,
        description="Maximum concurrent LLM calls for batch processing in this stage."
    )


class ModelInfo(BaseModel):
    """Information about an available model. Returned from /api/llm/models endpoint."""
    model_config = {"protected_namespaces": ()}  # Allow 'model_' prefix
    model_id: str = Field(description="Model identifier")
    display_name: str = Field(description="Human-readable model name")
    supports_reasoning_effort: bool = Field(description="Whether model supports reasoning_effort parameter")
    reasoning_effort_levels: Optional[List[str]] = Field(None, description="Available reasoning effort levels")
    supports_temperature: bool = Field(description="Whether model supports temperature parameter")
    max_tokens: Optional[int] = Field(None, description="Maximum tokens supported by model")
    supports_vision: bool = Field(default=False, description="Whether model supports vision/image input")


class PipelineLLMConfig(BaseModel):
    """LLM configuration for all pipeline stages."""
    semantic_filter: Optional[StageConfig] = Field(None, description="Config for semantic filtering stage")
    categorization: Optional[StageConfig] = Field(None, description="Config for article categorization stage")
    article_summary: Optional[StageConfig] = Field(None, description="Config for article summary generation")
    stance_analysis: Optional[StageConfig] = Field(None, description="Config for stance analysis")
    category_summary: Optional[StageConfig] = Field(None, description="Config for category summary generation")
    executive_summary: Optional[StageConfig] = Field(None, description="Config for executive summary generation")


# Type alias for pipeline stage names
PipelineStage = Literal["semantic_filter", "categorization", "article_summary", "stance_analysis", "category_summary", "executive_summary"]


# =============================================================================
# Defaults
# =============================================================================

DEFAULT_MODEL_CONFIG: ModelConfig = ModelConfig(
    model_id="gpt-4.1",
    temperature=0.0,
    max_tokens=2000
)

DEFAULT_STAGE_CONFIG: StageConfig = StageConfig(
    model_id="gpt-4.1",
    temperature=0.0,
    max_tokens=2000,
    max_concurrent=10
)

DEFAULT_PIPELINE_CONFIG: PipelineLLMConfig = PipelineLLMConfig(
    semantic_filter=StageConfig(model_id="gpt-4.1", temperature=0.0, max_tokens=2000, max_concurrent=10),
    categorization=StageConfig(model_id="gpt-4.1", temperature=0.0, max_tokens=2000, max_concurrent=10),
    article_summary=StageConfig(model_id="gpt-4.1", temperature=0.0, max_tokens=2000, max_concurrent=5),
    stance_analysis=StageConfig(model_id="gpt-4.1", temperature=0.0, max_tokens=2000, max_concurrent=5),
    category_summary=StageConfig(model_id="gpt-4.1", temperature=0.0, max_tokens=2000, max_concurrent=5),
    executive_summary=StageConfig(model_id="gpt-4.1", temperature=0.0, max_tokens=2000, max_concurrent=1),
)


def get_stage_config(config: Optional[PipelineLLMConfig], stage: PipelineStage) -> StageConfig:
    """Get the configuration for a pipeline stage, merging with defaults to ensure all fields are present."""
    default_stage: StageConfig = getattr(DEFAULT_PIPELINE_CONFIG, stage)

    if config is None:
        return default_stage

    stage_config = getattr(config, stage, None)
    if stage_config is None:
        return default_stage

    # Merge provided config with defaults to ensure max_concurrent is always present
    return StageConfig(
        model_id=stage_config.model_id,
        temperature=stage_config.temperature,
        reasoning_effort=stage_config.reasoning_effort,
        max_tokens=stage_config.max_tokens or default_stage.max_tokens,
        max_concurrent=getattr(stage_config, 'max_concurrent', None) or default_stage.max_concurrent,
    )


# =============================================================================
# Message Types
# =============================================================================

class MessageRole(str, Enum):
    """Role of a message in an LLM conversation"""
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"
    STATUS = "status"


class LLMMessage(BaseModel):
    """Individual message for LLM interactions.

    Can be used in two modes:
    1. Simple mode: Just role and content (for internal LLM calls)
    2. Full mode: All fields populated (for chat storage/retrieval)
    """
    role: MessageRole = Field(description="Role of the message sender")
    content: str = Field(description="Content of the message")
    # Optional fields for chat storage - not needed for simple LLM calls
    id: Optional[str] = Field(default=None, description="Unique identifier for the message")
    chat_id: Optional[str] = Field(default=None, description="ID of the parent chat session")
    message_metadata: Dict[str, Any] = Field(default_factory=dict, description="Additional message metadata")
    created_at: Optional[datetime] = Field(default=None, description="When the message was created")
    updated_at: Optional[datetime] = Field(default=None, description="When the message was last updated")


# Backwards compatibility alias
ChatMessage = LLMMessage
