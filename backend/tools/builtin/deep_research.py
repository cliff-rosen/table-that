"""
Deep Research Tool

A tool that conducts in-depth research on complex questions by orchestrating
multiple search sources (PubMed, Web) through an iterative refinement loop.

This tool:
1. Refines the question to eliminate ambiguity
2. Generates a checklist of what constitutes a complete answer
3. Iteratively searches PubMed and web sources in parallel
4. Builds a knowledge base from findings
5. Synthesizes a comprehensive answer with citations

Typical execution time: 1-3 minutes
"""

import logging
from typing import Any, AsyncGenerator, Dict, Union

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolProgress, ToolResult, register_tool

logger = logging.getLogger(__name__)


async def execute_deep_research(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
    """
    Execute deep research on a question.

    This is an async generator that yields ToolProgress updates during execution,
    then yields a final ToolResult when complete.
    """
    from services.deep_research_service import DeepResearchService

    question = params.get("question", "")
    research_context = params.get("context")
    max_iterations = params.get("max_iterations", 10)

    if not question:
        yield ToolResult(
            text="Error: No research question provided.",
            payload={
                "type": "deep_research_error",
                "error": "No question provided"
            }
        )
        return

    # Validate max_iterations
    max_iterations = min(max(1, max_iterations), 15)  # Clamp between 1 and 15

    try:
        # Get org_id from context if available
        org_id = context.get("org_id")

        # Create service and execute
        service = DeepResearchService(
            db=db,
            user_id=user_id,
            org_id=org_id
        )

        # Forward all progress updates and the final result
        async for item in service.execute(
            question=question,
            context=research_context,
            max_iterations=max_iterations
        ):
            yield item

    except Exception as e:
        logger.error(f"Deep research tool error: {e}", exc_info=True)
        yield ToolResult(
            text=f"Error during deep research: {str(e)}",
            payload={
                "type": "deep_research_error",
                "error": str(e)
            }
        )


# =============================================================================
# Register Tool
# =============================================================================

register_tool(ToolConfig(
    name="deep_research",
    description="""[BETA] Conducts in-depth research on a question using PubMed and web search. This is for complex questions that require synthesizing information from multiple sources.

IMPORTANT: Before using this tool, you must first ask the user for confirmation — explain what you'd research, note that this is a beta feature, and mention it may take 1-3 minutes. Only call this tool after the user confirms in a subsequent message.

Do NOT use this for:
- Simple factual lookups (use search_pubmed instead, with user confirmation)
- Questions about the current report/stream content (answer from local context)
- Questions that can be answered from context already available""",
    input_schema={
        "type": "object",
        "properties": {
            "question": {
                "type": "string",
                "description": "The research question to investigate. Be specific and clear."
            },
            "context": {
                "type": "string",
                "description": "Optional context about the user's needs, domain, or constraints that should guide the research."
            },
            "max_iterations": {
                "type": "integer",
                "description": "Maximum research iterations (1-15). Default is 10. More iterations may find more comprehensive answers but take longer.",
                "default": 10,
                "minimum": 1,
                "maximum": 15
            }
        },
        "required": ["question"]
    },
    executor=execute_deep_research,
    streaming=True,
    category="research",
    payload_type="deep_research_result",
    is_global=True
))
