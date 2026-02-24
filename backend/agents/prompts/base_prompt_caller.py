from typing import Dict, Any, List, Optional, Union, Type
from pydantic import BaseModel, create_model, Field
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.output_parsers import PydanticOutputParser
from openai import AsyncOpenAI, APIError, APIConnectionError, RateLimitError, APITimeoutError
import httpx
import logging
from schemas.llm import ChatMessage
from utils.message_formatter import format_langchain_messages, format_messages_for_openai
from utils.prompt_logger import log_prompt_messages
from config.llm_models import MODEL_CONFIGS, get_model_capabilities, supports_reasoning_effort, supports_temperature, get_valid_reasoning_efforts, uses_max_completion_tokens
import json

logger = logging.getLogger(__name__)

# Derive available models from the single source of truth (config/llm_models.py)
AVAILABLE_MODELS = {model_id: model_id for model_id in MODEL_CONFIGS.keys()}

DEFAULT_MODEL = "gpt-4.1"  # Default to GPT-4.1 (supports temperature)
OPENAI_TIMEOUT = 120.0

# Shared OpenAI client with higher connection limits for parallel processing
_shared_openai_client = None

def get_shared_openai_client():
    global _shared_openai_client
    if _shared_openai_client is None:
        # Create httpx client with higher connection limits
        http_client = httpx.AsyncClient(
            limits=httpx.Limits(
                max_connections=1000,  # Total connection pool size
                max_keepalive_connections=100,  # Keep-alive connections
            ),
            timeout=httpx.Timeout(OPENAI_TIMEOUT)
        )
        _shared_openai_client = AsyncOpenAI(http_client=http_client)
    return _shared_openai_client


class LLMUsage(BaseModel):
    """Token usage information from LLM calls"""
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0


class LLMResponse(BaseModel):
    """Response from LLM containing both the result and usage information"""
    result: Any  # The parsed result
    usage: LLMUsage


class BasePromptCaller:
    """Base class for creating and using prompt callers"""

    def __init__(
        self,
        response_model: Union[Type[BaseModel], Dict[str, Any], None] = None,
        system_message: Optional[str] = None,
        messages_placeholder: bool = True,
        model: Optional[str] = None,
        temperature: float = 0.0,
        reasoning_effort: Optional[str] = None
    ):
        """
        Initialize a prompt caller.

        Args:
            response_model: Either a Pydantic model class, a JSON schema dict, or None for text-only mode
            system_message: The system message to use in the prompt (optional)
            messages_placeholder: Whether to include a messages placeholder in the prompt
            model: The OpenAI model to use (optional, defaults to DEFAULT_MODEL)
            temperature: The temperature for the model (optional, defaults to 0.0)
            reasoning_effort: The reasoning effort level for models that support it (optional)
        """
        # Handle text-only mode (no response model)
        if response_model is None:
            self.response_model = None
            self._is_dynamic_model = False
            self._original_schema = None
            self.parser = None
            self._text_only = True
        # Handle both Pydantic models and JSON schemas
        elif isinstance(response_model, dict):
            # Convert JSON schema to Pydantic model
            self.response_model = self._json_schema_to_pydantic_model(response_model)
            self._is_dynamic_model = True
            self._original_schema = response_model
            self.parser = PydanticOutputParser(pydantic_object=self.response_model)
            self._text_only = False
        else:
            # Use the Pydantic model directly
            self.response_model = response_model
            self._is_dynamic_model = False
            self._original_schema = None
            self.parser = PydanticOutputParser(pydantic_object=self.response_model)
            self._text_only = False
        self.system_message = system_message
        self.messages_placeholder = messages_placeholder
        
        # Set and validate model
        if model:
            if model not in AVAILABLE_MODELS:
                raise ValueError(f"Model {model} not available. Choose from: {list(AVAILABLE_MODELS.keys())}")
            self.model = AVAILABLE_MODELS[model]
        else:
            self.model = DEFAULT_MODEL
            
        self.temperature = temperature
        
        # Handle reasoning effort parameter
        self.reasoning_effort = None
        if reasoning_effort:
            if supports_reasoning_effort(self.model):
                valid_efforts = get_valid_reasoning_efforts(self.model)
                if reasoning_effort in valid_efforts:
                    self.reasoning_effort = reasoning_effort
                else:
                    raise ValueError(f"Invalid reasoning effort '{reasoning_effort}' for model {self.model}. Valid options: {valid_efforts}")
            else:
                logger.warning(f"Model {self.model} does not support reasoning effort parameter. Ignoring.")
        
        # Use shared OpenAI client with higher connection limits
        self.client = get_shared_openai_client()
        
    def _json_schema_to_pydantic_model(self, schema: Dict[str, Any], model_name: str = "DynamicModel") -> Type[BaseModel]:
        """
        Convert a JSON schema to a Pydantic model class dynamically.
        
        Args:
            schema: JSON schema dictionary
            model_name: Name for the generated model class
            
        Returns:
            Dynamically created Pydantic model class
        """
        if schema.get("type") != "object":
            raise ValueError("Only object type schemas are supported")
        
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        
        # Build field definitions for create_model
        field_definitions = {}
        
        for prop_name, prop_schema in properties.items():
            prop_type = prop_schema.get("type", "string")
            description = prop_schema.get("description", "")

            # Handle nullable types: {"type": ["string", "null"]} means Optional[str]
            is_nullable = False
            if isinstance(prop_type, list):
                # JSON Schema array type like ["string", "null"]
                is_nullable = "null" in prop_type
                # Get the non-null type
                non_null_types = [t for t in prop_type if t != "null"]
                prop_type = non_null_types[0] if non_null_types else "string"

            # Map JSON schema types to Python types
            if prop_type == "string":
                if "enum" in prop_schema:
                    # Create literal type for enums
                    from typing import Literal
                    enum_values = tuple(prop_schema["enum"])
                    python_type = Literal[enum_values]
                else:
                    python_type = str
            elif prop_type == "number":
                python_type = float
            elif prop_type == "integer":
                python_type = int
            elif prop_type == "boolean":
                python_type = bool
            elif prop_type == "array":
                # Simple array handling - could be enhanced
                python_type = List[Any]
            elif prop_type == "object":
                # Simple object handling - could be enhanced
                python_type = Dict[str, Any]
            else:
                python_type = str  # Default fallback

            # Handle required vs optional fields, and nullable types
            # Use Union[type, None] for Pydantic v2 compatibility with explicit default=None
            if is_nullable or prop_name not in required:
                field_definitions[prop_name] = (Union[python_type, None], Field(default=None, description=description))
            else:
                field_definitions[prop_name] = (python_type, Field(description=description))
        
        # Create the dynamic model with a unique name based on schema hash
        unique_name = f"{model_name}_{abs(hash(json.dumps(schema, sort_keys=True)))}"
        return create_model(unique_name, **field_definitions)
    
    def get_prompt_template(self) -> ChatPromptTemplate:
        """Get the prompt template with system message and optional messages placeholder"""
        messages = []
        if self.system_message:
            messages.append(("system", self.system_message))
        if self.messages_placeholder:
            messages.append(MessagesPlaceholder(variable_name="messages"))
        return ChatPromptTemplate.from_messages(messages)
    
    def get_formatted_messages(
        self,
        messages: List[ChatMessage],
        **kwargs: Dict[str, Any]
    ) -> List[Dict[str, str]]:
        """Format messages for the prompt"""
        # Convert messages to langchain format
        langchain_messages = format_langchain_messages(messages)

        # Get format instructions (empty string for text-only mode)
        format_instructions = self.parser.get_format_instructions() if self.parser else ""

        # Format messages using template
        prompt = self.get_prompt_template()
        formatted_messages = prompt.format_messages(
            messages=langchain_messages,
            format_instructions=format_instructions,
            **kwargs
        )

        # Convert to OpenAI format
        return format_messages_for_openai(formatted_messages)
    
    def get_schema(self) -> Dict[str, Any]:
        """Get the JSON schema for the response model"""
        # If we started with a JSON schema, return the original
        if self._is_dynamic_model and self._original_schema:
            return self._original_schema
        # Otherwise get schema from Pydantic model
        return self.response_model.model_json_schema()
    
    def get_response_model_name(self) -> str:
        """Get the name of the response model"""
        if self.response_model is None:
            return "TextResponse"
        return self.response_model.__name__
    
    async def invoke(
        self,
        messages: List[ChatMessage] = None,
        log_prompt: bool = True,
        return_usage: bool = False,
        model: Optional[str] = None,
        temperature: Optional[float] = None,
        reasoning_effort: Optional[str] = None,
        max_tokens: Optional[int] = None,
        **kwargs: Dict[str, Any]
    ) -> Union[BaseModel, LLMResponse, str]:
        """
        Invoke the prompt and get a parsed response.

        Args:
            messages: List of conversation messages (optional)
            log_prompt: Whether to log the prompt messages
            return_usage: Whether to return usage information along with result
            model: Override the model for this call (optional)
            temperature: Override the temperature for this call (optional)
            reasoning_effort: Override the reasoning effort for this call (optional)
            max_tokens: Maximum tokens in response (optional)
            **kwargs: Additional variables to format into the prompt

        Returns:
            If text-only mode: str (raw text response)
            If return_usage=True: LLMResponse with result and usage info
            If return_usage=False: Parsed response as an instance of the response model
        """
        # Use empty list if no messages provided
        if messages is None:
            messages = []
        
        # Format messages
        formatted_messages = self.get_formatted_messages(messages, **kwargs)
        
        # Log prompt if requested
        if log_prompt:
            try:
                log_file_path = log_prompt_messages(
                    messages=formatted_messages,
                    prompt_type=self.__class__.__name__.lower()
                )
                logger.debug(f"Prompt messages logged to: {log_file_path}")
            except Exception as log_error:
                logger.warning(f"Failed to log prompt: {log_error}")

        # Get schema (None for text-only mode)
        schema = self.get_schema() if not self._text_only else None

        # Determine which model and temperature to use
        use_model = self.model
        if model:
            if model not in AVAILABLE_MODELS:
                raise ValueError(f"Model {model} not available. Choose from: {list(AVAILABLE_MODELS.keys())}")
            use_model = AVAILABLE_MODELS[model]
        
        use_temperature = temperature if temperature is not None else self.temperature
        
        # Determine reasoning effort to use
        use_reasoning_effort = None
        if reasoning_effort or self.reasoning_effort:
            # Check if the model supports reasoning effort
            if supports_reasoning_effort(use_model):
                valid_efforts = get_valid_reasoning_efforts(use_model)
                effort_to_use = reasoning_effort if reasoning_effort else self.reasoning_effort
                if effort_to_use in valid_efforts:
                    use_reasoning_effort = effort_to_use
                else:
                    logger.warning(f"Invalid reasoning effort '{effort_to_use}' for model {use_model}. Valid options: {valid_efforts}")
        
        # Build API call parameters
        api_params = {
            "model": use_model,
            "messages": formatted_messages,
        }

        # Add response_format only for structured output (not text-only mode)
        if not self._text_only and schema:
            api_params["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "schema": schema,
                    "name": self.get_response_model_name()
                }
            }

        # Add max_tokens if specified (use max_completion_tokens for newer models)
        if max_tokens:
            if uses_max_completion_tokens(use_model):
                api_params["max_completion_tokens"] = max_tokens
            else:
                api_params["max_tokens"] = max_tokens

        # Add reasoning effort if supported and valid (top-level parameter for Chat Completions API)
        if use_reasoning_effort:
            # Ensure we pass the string value, not an enum object
            effort_value = use_reasoning_effort.value if hasattr(use_reasoning_effort, 'value') else str(use_reasoning_effort)
            api_params["reasoning_effort"] = effort_value
            logger.info(f"Using reasoning effort: {effort_value} for model {use_model}")

        # Add temperature only if the model supports it
        if supports_temperature(use_model):
            api_params["temperature"] = use_temperature
        elif use_temperature != 0.0:
            # Only warn if user tried to set a non-zero temperature
            logger.debug(f"Temperature parameter not supported for model {use_model} with reasoning_effort")

        # Call OpenAI with error handling
        try:
            logger.debug(f"Calling OpenAI API: model={use_model}, schema={self.get_response_model_name()}")
            response = await self.client.chat.completions.create(**api_params)
            logger.debug(f"OpenAI API response received: {response.usage.total_tokens if response.usage else 0} tokens")
        except APITimeoutError as e:
            logger.error(f"OpenAI API timeout: {e}")
            raise RuntimeError(f"OpenAI API request timed out after {OPENAI_TIMEOUT}s") from e
        except RateLimitError as e:
            logger.error(f"OpenAI API rate limit exceeded: {e}")
            raise RuntimeError("OpenAI API rate limit exceeded. Please try again later.") from e
        except APIConnectionError as e:
            logger.error(f"OpenAI API connection error: {e}")
            raise RuntimeError("Failed to connect to OpenAI API. Check network connectivity.") from e
        except APIError as e:
            logger.error(f"OpenAI API error: {e.status_code} - {e.message}")
            raise RuntimeError(f"OpenAI API error: {e.message}") from e

        # Parse response with error handling
        try:
            choice = response.choices[0]
            message = choice.message
            response_text = message.content

            if not response_text:
                # Log full response for debugging
                logger.error(f"OpenAI returned empty response content. Model: {use_model}")
                logger.error(f"Response message: {message}")
                logger.error(f"Full response: {response}")

                # Check for specific error conditions and provide helpful messages
                finish_reason = choice.finish_reason

                if finish_reason == 'length':
                    # Token limit exceeded - check if reasoning tokens consumed the budget
                    usage = response.usage
                    if usage and hasattr(usage, 'completion_tokens_details'):
                        details = usage.completion_tokens_details
                        if details and hasattr(details, 'reasoning_tokens') and details.reasoning_tokens:
                            raise ValueError(
                                f"Token limit exceeded: model used {details.reasoning_tokens} tokens for reasoning "
                                f"but had no tokens left for output. Try increasing max_tokens or using a different model."
                            )
                    raise ValueError(
                        "Token limit exceeded: response was cut off before completion. "
                        "Try increasing max_tokens or simplifying the request."
                    )

                if finish_reason == 'content_filter':
                    raise ValueError(
                        "Content was filtered by OpenAI's safety system. "
                        "The request or response may contain content that violates usage policies."
                    )

                if hasattr(message, 'refusal') and message.refusal:
                    logger.error(f"Model refused: {message.refusal}")
                    raise ValueError(f"Model refused to respond: {message.refusal}")

                raise ValueError("OpenAI returned empty response")

            # For text-only mode, return raw text; otherwise parse with Pydantic
            if self._text_only:
                parsed_result = response_text
            else:
                parsed_result = self.parser.parse(response_text)
        except Exception as parse_error:
            logger.error(f"Failed to parse LLM response: {parse_error}")
            logger.debug(f"Raw response text: {response_text[:500] if response_text else 'None'}...")
            raise

        # Extract usage information
        usage_info = LLMUsage(
            prompt_tokens=response.usage.prompt_tokens if response.usage else 0,
            completion_tokens=response.usage.completion_tokens if response.usage else 0,
            total_tokens=response.usage.total_tokens if response.usage else 0
        )

        # Return based on return_usage flag
        if return_usage:
            return LLMResponse(result=parsed_result, usage=usage_info)
        else:
            return parsed_result 