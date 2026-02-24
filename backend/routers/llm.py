from fastapi import APIRouter
from typing import List
from pydantic import BaseModel

from config.llm_models import MODEL_CONFIGS
from schemas.llm import ModelInfo

router = APIRouter(prefix="/llm", tags=["llm"])


class ModelsResponse(BaseModel):
    """Response from /api/llm/models endpoint."""
    models: List[ModelInfo]
    default_model: str


@router.get("/models", response_model=ModelsResponse)
async def get_models() -> ModelsResponse:
    """
    Get all available models and their configurations.
    Returns model data with capabilities for frontend model selection.
    """
    models = []
    for model_id, capabilities in MODEL_CONFIGS.items():
        models.append(ModelInfo(
            model_id=model_id,
            display_name=_format_model_name(model_id),
            supports_reasoning_effort=capabilities.supports_reasoning_effort,
            reasoning_effort_levels=capabilities.reasoning_effort_levels,
            supports_temperature=capabilities.supports_temperature,
            max_tokens=capabilities.max_tokens,
            supports_vision=capabilities.supports_vision,
        ))

    return ModelsResponse(
        models=models,
        default_model="gpt-4.1",
    )


def _format_model_name(model_id: str) -> str:
    """Format model ID into display name"""
    name_map = {
        "gpt-5": "GPT-5",
        "gpt-5-mini": "GPT-5 Mini",
        "gpt-5-nano": "GPT-5 Nano",
        "gpt-4.1": "GPT-4.1",
    }
    return name_map.get(model_id, model_id)
