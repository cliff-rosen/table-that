"""
Unified LLM calling interface.

Provides a single function `call_llm` that handles:
- Single and batch calls (based on whether values is dict or list)
- Template rendering for system/user messages
- Structured (JSON schema) and text-only responses
- Concurrent batch execution with progress callbacks
- Per-item error handling in batch mode

Example:
    # Single structured call
    result = await call_llm(
        system_message="You are a classifier.",
        user_message="Classify: {title}",
        values={"title": "My Article"},
        response_schema={"type": "object", "properties": {"category": {"type": "string"}}}
    )
    if result.ok:
        category = result.data["category"]

    # Batch text call
    results = await call_llm(
        system_message="Summarize articles.",
        user_message="Summarize: {title}\n{abstract}",
        values=[{"title": "...", "abstract": "..."}, ...],
        response_schema=None,  # text mode
        options=LLMOptions(max_concurrent=10, on_progress=my_callback)
    )
    for result in results:
        print(result.input["title"], "->", result.data if result.ok else result.error)
"""

from typing import Dict, Any, List, Optional, Union, Type, Callable, Awaitable
from pydantic import BaseModel, Field
import asyncio
import logging

from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import supports_reasoning_effort
from schemas.llm import ChatMessage, MessageRole
from schemas.llm import ModelConfig, DEFAULT_MODEL_CONFIG
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# =============================================================================
# Data Classes
# =============================================================================

class LLMUsage(BaseModel):
    """Token usage from LLM call."""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResult(BaseModel):
    """Result from a single LLM call."""
    input: Dict[str, Any] = Field(description="Original values dict for this item")
    data: Union[Dict[str, Any], str, None] = Field(default=None, description="Response data: dict for structured, str for text")
    error: Optional[str] = Field(default=None, description="Error message if call failed")
    usage: LLMUsage = Field(default_factory=LLMUsage, description="Token usage")

    @property
    def ok(self) -> bool:
        """True if call succeeded (no error)."""
        return self.error is None


class LLMOptions(BaseModel):
    """Options for LLM calls."""
    max_concurrent: int = Field(default=10, description="Max concurrent calls in batch mode")
    on_progress: Optional[Callable[[int, int], Awaitable[None]]] = Field(default=None, description="Async callback(completed, total)")
    log_prompt: bool = Field(default=True, description="Whether to log prompts")

    class Config:
        arbitrary_types_allowed = True


# =============================================================================
# Template Rendering
# =============================================================================

def _render_template(template: str, values: Dict[str, Any]) -> str:
    """
    Render a template string by replacing {placeholder} with values.

    Args:
        template: String with {placeholder} markers
        values: Dict of placeholder -> value mappings

    Returns:
        Rendered string with placeholders replaced
    """
    result = template
    for key, value in values.items():
        if value is not None:
            # Handle lists (like authors)
            if isinstance(value, list):
                value = ", ".join(str(v) for v in value)
            result = result.replace(f"{{{key}}}", str(value))
    return result


# =============================================================================
# Main Interface
# =============================================================================

async def call_llm(
    system_message: str,
    user_message: str,
    values: Union[Dict[str, Any], List[Dict[str, Any]]],
    model_config: Optional[ModelConfig] = None,
    response_schema: Union[Type[BaseModel], Dict[str, Any], None] = None,
    options: Optional[LLMOptions] = None,
) -> Union[LLMResult, List[LLMResult]]:
    """
    Unified LLM call interface.

    Args:
        system_message: System prompt, can contain {placeholder} templates
        user_message: User prompt, can contain {placeholder} templates
        values: Template values. Dict for single call, List[Dict] for batch.
        model_config: Model settings (model, temperature, max_tokens, reasoning_effort)
        response_schema: Expected response structure (Pydantic class, JSON dict, or None for text)
        options: Call options (concurrency, progress callback, logging)

    Returns:
        Single call (values is dict): LLMResult
        Batch call (values is list): List[LLMResult] in same order as input

    Notes:
        - In batch mode, errors are captured per-item (never raises for individual failures)
        - Results preserve input order and include original values in result.input
        - For text mode (response_schema=None), result.data is a string
        - For structured mode, result.data is a dict
    """
    # Apply defaults
    config = model_config or DEFAULT_MODEL_CONFIG
    opts = options or LLMOptions()

    # Detect single vs batch mode
    is_batch = isinstance(values, list)

    if is_batch:
        return await _call_llm_batch(
            system_message=system_message,
            user_message=user_message,
            values_list=values,
            config=config,
            response_schema=response_schema,
            options=opts,
        )
    else:
        return await _call_llm_single(
            system_message=system_message,
            user_message=user_message,
            values=values,
            config=config,
            response_schema=response_schema,
            options=opts,
        )


async def _call_llm_single(
    system_message: str,
    user_message: str,
    values: Dict[str, Any],
    config: ModelConfig,
    response_schema: Union[Type[BaseModel], Dict[str, Any], None],
    options: LLMOptions,
) -> LLMResult:
    """Execute a single LLM call."""
    try:
        # Render templates
        rendered_system = _render_template(system_message, values)
        rendered_user = _render_template(user_message, values)

        # Create prompt caller
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=rendered_system,
            messages_placeholder=True,
            model=config.model_id,
            temperature=config.temperature,
            reasoning_effort=config.reasoning_effort if supports_reasoning_effort(config.model_id) else None,
        )

        # Build user message
        chat_message = ChatMessage(
            id="llm_call",
            chat_id="llm_call",
            role=MessageRole.USER,
            content=rendered_user,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        # Invoke
        response = await prompt_caller.invoke(
            messages=[chat_message],
            return_usage=True,
            log_prompt=options.log_prompt,
            max_tokens=config.max_tokens,
        )

        # Extract result and usage
        llm_response = response.result
        usage = LLMUsage(
            prompt_tokens=response.usage.prompt_tokens,
            completion_tokens=response.usage.completion_tokens,
            total_tokens=response.usage.total_tokens,
        )

        # Convert response to appropriate type
        if response_schema is None:
            # Text mode - result is already a string
            data = llm_response
        else:
            # Structured mode - convert Pydantic to dict
            if hasattr(llm_response, 'model_dump'):
                data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                data = llm_response.dict()
            else:
                data = dict(llm_response)

        return LLMResult(
            input=values,
            data=data,
            error=None,
            usage=usage,
        )

    except Exception as e:
        logger.error(f"LLM call failed: {e}", exc_info=True)
        return LLMResult(
            input=values,
            data=None,
            error=str(e),
            usage=LLMUsage(),
        )


async def _call_llm_batch(
    system_message: str,
    user_message: str,
    values_list: List[Dict[str, Any]],
    config: ModelConfig,
    response_schema: Union[Type[BaseModel], Dict[str, Any], None],
    options: LLMOptions,
) -> List[LLMResult]:
    """Execute batch LLM calls with concurrency control."""
    if not values_list:
        return []

    logger.info(f"call_llm batch: {len(values_list)} items, max_concurrent={options.max_concurrent}")

    semaphore = asyncio.Semaphore(options.max_concurrent)
    results_by_idx: Dict[int, LLMResult] = {}
    completed = 0

    async def process_one(idx: int, values: Dict[str, Any]) -> None:
        nonlocal completed
        async with semaphore:
            result = await _call_llm_single(
                system_message=system_message,
                user_message=user_message,
                values=values,
                config=config,
                response_schema=response_schema,
                options=LLMOptions(
                    max_concurrent=options.max_concurrent,
                    on_progress=None,  # Don't pass progress to individual calls
                    log_prompt=options.log_prompt,
                ),
            )
            results_by_idx[idx] = result

            completed += 1
            if options.on_progress:
                try:
                    await options.on_progress(completed, len(values_list))
                except Exception as cb_err:
                    logger.warning(f"Progress callback failed: {cb_err}")

    # Execute all in parallel with semaphore limiting
    tasks = [process_one(i, values) for i, values in enumerate(values_list)]
    await asyncio.gather(*tasks, return_exceptions=True)

    # Build results in original order
    results = []
    for i in range(len(values_list)):
        if i in results_by_idx:
            results.append(results_by_idx[i])
        else:
            # Should not happen, but handle gracefully
            results.append(LLMResult(
                input=values_list[i],
                data=None,
                error="Processing failed unexpectedly",
                usage=LLMUsage(),
            ))

    succeeded = sum(1 for r in results if r.ok)
    failed = len(results) - succeeded
    logger.info(f"call_llm batch complete: {succeeded} succeeded, {failed} failed")

    return results
