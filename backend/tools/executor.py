"""
Tool Executor

Handles execution of both streaming and non-streaming tools.
Streaming tools yield ToolProgress updates before returning ToolResult.
"""

import asyncio
import logging
from typing import Any, AsyncGenerator, Dict, Generator, Optional, Tuple, Union

from sqlalchemy.orm import Session

from tools.registry import ToolConfig, ToolProgress, ToolResult

logger = logging.getLogger(__name__)


def execute_tool_sync(
    tool_config: ToolConfig,
    tool_input: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Generator[ToolProgress, None, Tuple[str, Optional[Dict[str, Any]]]]:
    """
    Execute a tool synchronously, yielding progress updates for streaming tools.

    Args:
        tool_config: The tool configuration
        tool_input: Input parameters for the tool
        db: Database session
        user_id: User ID
        context: Additional context

    Yields:
        ToolProgress for streaming tools

    Returns:
        Tuple of (text_result, payload_dict)
    """
    try:
        result = tool_config.executor(tool_input, db, user_id, context)

        # Check if it's a generator (streaming tool)
        if hasattr(result, '__next__'):
            # It's a generator - yield progress updates
            try:
                while True:
                    progress = next(result)
                    if isinstance(progress, ToolProgress):
                        yield progress
                    else:
                        # Shouldn't happen, but handle gracefully
                        logger.warning(f"Unexpected yield type from tool: {type(progress)}")
            except StopIteration as e:
                # Generator finished, e.value is the return value (ToolResult)
                final_result = e.value
                if isinstance(final_result, ToolResult):
                    return (final_result.text, final_result.payload)
                elif isinstance(final_result, str):
                    return (final_result, None)
                else:
                    return (str(final_result), None)
        elif isinstance(result, ToolResult):
            return (result.text, result.payload)
        elif isinstance(result, str):
            return (result, None)
        else:
            return (str(result), None)

    except Exception as e:
        logger.error(f"Tool execution error: {e}", exc_info=True)
        return (f"Error executing tool: {str(e)}", None)


async def execute_tool_async(
    tool_config: ToolConfig,
    tool_input: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> AsyncGenerator[Union[ToolProgress, Tuple[str, Optional[Dict[str, Any]]]], None]:
    """
    Execute a tool asynchronously, yielding progress updates for streaming tools.

    This wraps the sync executor in asyncio.to_thread for non-blocking execution.

    Args:
        tool_config: The tool configuration
        tool_input: Input parameters for the tool
        db: Database session
        user_id: User ID
        context: Additional context

    Yields:
        ToolProgress for progress updates
        Final yield is Tuple[str, Optional[Dict]] with (text_result, payload)
    """
    if tool_config.streaming:
        # For streaming tools, we need to run in a way that allows yielding
        # Run the generator in a thread and poll for results
        gen = execute_tool_sync(tool_config, tool_input, db, user_id, context)

        def get_next():
            try:
                return ("progress", next(gen))
            except StopIteration as e:
                return ("done", e.value)

        while True:
            result_type, value = await asyncio.to_thread(get_next)
            if result_type == "progress":
                yield value
            else:
                yield value
                break
    else:
        # Non-streaming tool - run entirely in thread
        def run_tool():
            gen = execute_tool_sync(tool_config, tool_input, db, user_id, context)
            try:
                # Consume any progress (shouldn't be any for non-streaming)
                while True:
                    next(gen)
            except StopIteration as e:
                return e.value

        result = await asyncio.to_thread(run_tool)
        yield result
