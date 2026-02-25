"""
Web Tools

Global tools for searching the web and fetching webpage content.
Uses DuckDuckGo HTML search (no API key required) and httpx for fetching.

Also includes research_web — a mini search agent that loops over search/fetch
to answer a natural-language question.
"""

import logging
import os
from typing import Any, Dict, List

import anthropic
import httpx
from bs4 import BeautifulSoup
from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, register_tool

logger = logging.getLogger(__name__)

CHROME_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


# =============================================================================
# search_web
# =============================================================================

async def execute_search_web(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Search the web via DuckDuckGo HTML search."""
    query = params.get("query", "").strip()
    if not query:
        return "Error: Search query is required."

    num_results = min(max(params.get("num_results", 5), 1), 10)

    try:
        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": CHROME_USER_AGENT},
        ) as client:
            url = "https://html.duckduckgo.com/html/"
            resp = await client.post(url, data={"q": query})
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")
        results = []

        for item in soup.select(".result"):
            if len(results) >= num_results:
                break

            title_el = item.select_one(".result__title a, .result__a")
            snippet_el = item.select_one(".result__snippet")
            url_el = item.select_one(".result__url")

            title = title_el.get_text(strip=True) if title_el else ""
            snippet = snippet_el.get_text(strip=True) if snippet_el else ""
            result_url = ""

            if url_el:
                result_url = url_el.get_text(strip=True)
            elif title_el and title_el.get("href"):
                result_url = title_el["href"]

            if title or snippet:
                results.append({
                    "title": title,
                    "url": result_url,
                    "snippet": snippet,
                })

        if not results:
            return f"No results found for: {query}"

        lines = [f"Search results for: {query}\n"]
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. {r['title']}")
            if r["url"]:
                lines.append(f"   URL: {r['url']}")
            if r["snippet"]:
                lines.append(f"   {r['snippet']}")
            lines.append("")

        return "\n".join(lines)

    except httpx.HTTPError as e:
        logger.warning(f"Web search failed: {e}")
        return f"Error: Web search failed — {e}"
    except Exception as e:
        logger.warning(f"Web search error: {e}")
        return f"Error: Web search failed — {e}"


register_tool(ToolConfig(
    name="search_web",
    description="Search the web using DuckDuckGo. Returns titles, URLs, and snippets for matching results. Use this to look up information, find websites, or research topics.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The search query"
            },
            "num_results": {
                "type": "integer",
                "description": "Number of results to return (1-10, default 5)"
            },
        },
        "required": ["query"]
    },
    executor=execute_search_web,
    category="web",
    is_global=True,
    streaming=False,
))


# =============================================================================
# fetch_webpage
# =============================================================================

async def execute_fetch_webpage(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """Fetch a webpage and extract its text content."""
    url = params.get("url", "").strip()
    if not url:
        return "Error: URL is required."

    # Add scheme if missing
    if not url.startswith("http://") and not url.startswith("https://"):
        url = "https://" + url

    max_chars = 8000

    try:
        async with httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
            headers={"User-Agent": CHROME_USER_AGENT},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        content_type = resp.headers.get("content-type", "")
        if "html" not in content_type and "text" not in content_type:
            return f"Error: URL returned non-HTML content ({content_type}). Only HTML pages are supported."

        soup = BeautifulSoup(resp.text, "html.parser")

        # Extract title
        title = ""
        title_el = soup.find("title")
        if title_el:
            title = title_el.get_text(strip=True)

        # Remove non-content elements
        for tag in soup(["script", "style", "nav", "footer", "aside", "header", "noscript", "svg", "iframe"]):
            tag.decompose()

        # Get text content
        text = soup.get_text(separator="\n")

        # Clean up whitespace: collapse blank lines
        lines = [line.strip() for line in text.splitlines()]
        lines = [line for line in lines if line]
        text = "\n".join(lines)

        truncated = False
        if len(text) > max_chars:
            text = text[:max_chars]
            truncated = True

        word_count = len(text.split())

        result_lines = [
            f"URL: {url}",
            f"Title: {title}" if title else "",
            f"Words: ~{word_count}",
        ]
        if truncated:
            result_lines.append(f"(Truncated to {max_chars} characters)")
        result_lines.append("")
        result_lines.append(text)

        return "\n".join(line for line in result_lines if line or line == "")

    except httpx.HTTPError as e:
        logger.warning(f"Webpage fetch failed for {url}: {e}")
        return f"Error: Failed to fetch {url} — {e}"
    except Exception as e:
        logger.warning(f"Webpage fetch error for {url}: {e}")
        return f"Error: Failed to fetch {url} — {e}"


register_tool(ToolConfig(
    name="fetch_webpage",
    description="Fetch a webpage and extract its text content. Use this to read the content of a specific URL — for example, to get details from a company website, read an article, or verify information.",
    input_schema={
        "type": "object",
        "properties": {
            "url": {
                "type": "string",
                "description": "The URL to fetch (https:// added automatically if missing)"
            },
        },
        "required": ["url"]
    },
    executor=execute_fetch_webpage,
    category="web",
    is_global=True,
    streaming=False,
))


# =============================================================================
# research_web — Mini search agent
# =============================================================================

# Inner tool definitions for the research LLM call
_RESEARCH_INNER_TOOLS = [
    {
        "name": "search_web",
        "description": "Search the web. Returns titles, URLs, and snippets.",
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Search query"},
                "num_results": {"type": "integer", "description": "1-10, default 5"},
            },
            "required": ["query"],
        },
    },
    {
        "name": "fetch_webpage",
        "description": "Fetch a webpage and extract its text content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch"},
            },
            "required": ["url"],
        },
    },
]


async def execute_research_web(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """
    Mini search agent: takes a natural language query, loops over
    search_web/fetch_webpage with an inner LLM to arrive at a definitive answer.
    """
    query = params.get("query", "").strip()
    if not query:
        return "Error: query is required."

    max_steps = min(max(params.get("max_steps", 3), 1), 5)

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))

    messages: List[Dict[str, Any]] = [{"role": "user", "content": query}]

    for _turn in range(max_steps):
        try:
            response = await client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=messages,
                tools=_RESEARCH_INNER_TOOLS,
                system=(
                    "You are a research assistant. Your job is to answer a specific question "
                    "by searching the web and reading pages. Be concise. "
                    "After researching, respond with ONLY the answer — no explanation, no quotes, "
                    "just the raw value. If you cannot determine the answer, respond with exactly: "
                    "Could not determine an answer."
                ),
            )
        except Exception as e:
            logger.warning(f"research_web inner LLM call failed: {e}")
            return "Could not determine an answer."

        # Check for tool use
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        if not tool_uses:
            # Extract text response — we're done
            for block in response.content:
                if block.type == "text":
                    text = block.text.strip()
                    if text:
                        return text
            return "Could not determine an answer."

        # Execute tool calls and continue the conversation
        messages.append({"role": "assistant", "content": response.content})

        tool_results: List[Dict[str, Any]] = []
        for tool_use in tool_uses:
            context_stub: Dict[str, Any] = {}
            if tool_use.name == "search_web":
                result_text = await execute_search_web(tool_use.input, db, user_id, context_stub)
            elif tool_use.name == "fetch_webpage":
                result_text = await execute_fetch_webpage(tool_use.input, db, user_id, context_stub)
            else:
                result_text = f"Unknown tool: {tool_use.name}"

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result_text,
            })

        messages.append({"role": "user", "content": tool_results})

    # Exhausted turns
    return "Could not determine an answer."


register_tool(ToolConfig(
    name="research_web",
    description=(
        "Research agent: answers a natural language question by searching the web "
        "and reading pages. Use this for one-off factual lookups like "
        "'What is Acme Corp's LinkedIn URL?' or 'When was Company X founded?'. "
        "Returns a concise answer or 'Could not determine an answer.'"
    ),
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Natural language question to research, e.g. 'What is Acme Corp\\'s LinkedIn URL?'"
            },
            "max_steps": {
                "type": "integer",
                "description": "Max search/fetch rounds (1-5, default 3)"
            },
        },
        "required": ["query"]
    },
    executor=execute_research_web,
    category="web",
    is_global=True,
    streaming=False,
))
