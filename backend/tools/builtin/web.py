"""
Web Tools

Tools for searching the web and fetching webpage content.
"""

import logging
import asyncio
from typing import Any, Dict, Union

from sqlalchemy.orm import Session

from tools.registry import ToolConfig, ToolResult, register_tool
from services.search_service import SearchService
from services.web_retrieval_service import WebRetrievalService

logger = logging.getLogger(__name__)


def execute_search_web(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Search the web using Google or DuckDuckGo.
    Returns search results with titles, URLs, and snippets.
    """
    query = params.get("query", "").strip()
    num_results = min(params.get("num_results", 5), 10)

    if not query:
        return "Error: No search query provided."

    try:
        service = SearchService()
        service.initialize()

        # Run async search in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                service.search(query, num_results=num_results)
            )
        finally:
            loop.close()

        if not result["search_results"]:
            return f"No results found for: {query}"

        # Format results for the LLM
        text_results = [f"Web search results for '{query}':\n"]

        for i, item in enumerate(result["search_results"], 1):
            text_results.append(f"""
{i}. {item.title}
   URL: {item.url}
   {item.snippet}
""")

        text_result = "\n".join(text_results)

        # Build payload for frontend display
        payload = {
            "type": "web_search_results",
            "data": {
                "query": query,
                "total_results": result["total_results"],
                "results": [
                    {
                        "title": item.title,
                        "url": item.url,
                        "snippet": item.snippet,
                        "source": item.source,
                        "rank": item.rank
                    }
                    for item in result["search_results"]
                ]
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"Web search error: {e}", exc_info=True)
        return f"Error searching the web: {str(e)}"


def execute_fetch_webpage(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Fetch and extract content from a webpage URL.
    Returns the page title, extracted text content, and metadata.
    """
    url = params.get("url", "").strip()

    if not url:
        return "Error: No URL provided."

    # Add https:// if no scheme provided
    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    try:
        service = WebRetrievalService()

        # Run async fetch in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(
                service.retrieve_webpage(url, extract_text_only=True)
            )
        finally:
            loop.close()

        webpage = result["webpage"]

        # Truncate content if too long (to avoid token limits)
        content = webpage.content or ""
        max_chars = 10000
        truncated = False
        if len(content) > max_chars:
            content = content[:max_chars]
            truncated = True

        # Format result for the LLM
        metadata = webpage.metadata or {}
        description = metadata.get("description", "")

        text_result = f"""=== Webpage Content ===
URL: {webpage.url}
Title: {webpage.title}
"""

        if description:
            text_result += f"Description: {description}\n"

        if metadata.get("author"):
            text_result += f"Author: {metadata['author']}\n"

        if metadata.get("published_date"):
            text_result += f"Published: {metadata['published_date']}\n"

        text_result += f"""
Word Count: {metadata.get('word_count', 'unknown')}

=== Content ===
{content}
"""

        if truncated:
            text_result += f"\n\n[Content truncated. Full page is {len(webpage.content)} characters.]"

        # Build payload for frontend display
        payload = {
            "type": "webpage_content",
            "data": {
                "url": webpage.url,
                "title": webpage.title,
                "content": content,
                "description": description,
                "author": metadata.get("author"),
                "published_date": metadata.get("published_date"),
                "word_count": metadata.get("word_count"),
                "truncated": truncated
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"Webpage fetch error: {e}", exc_info=True)
        return f"Error fetching webpage: {str(e)}"


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
    name="search_web",
    description="Search the web for information. Use this to find current information, news, documentation, or any web content. Returns titles, URLs, and snippets from search results.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query. Be specific for better results."
            },
            "num_results": {
                "type": "integer",
                "description": "Number of results to return (1-10). Default is 5.",
                "default": 5,
                "minimum": 1,
                "maximum": 10
            }
        },
        "required": ["query"]
    },
    executor=execute_search_web,
    category="web",
    payload_type="web_search_results",
    is_global=True
))

register_tool(ToolConfig(
    name="fetch_webpage",
    description="Fetch and read the content of a webpage. Use this when you need to read the actual content of a URL - for example when the user shares a link, or when you want to get more details from a search result. Returns the page title, extracted text content, and metadata.",
    input_schema={
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The URL of the webpage to fetch. Can be with or without https://."
            }
        },
        "required": ["url"]
    },
    executor=execute_fetch_webpage,
    category="web",
    payload_type="webpage_content",
    is_global=True
))
