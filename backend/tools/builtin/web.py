"""
Web Tools

Global tools for searching the web and fetching webpage content.
Uses Google Custom Search API for search and httpx for fetching.

Also includes research_web — a mini search agent that loops over search/fetch
to answer a natural-language question.
"""

import logging
import os
from typing import Any, AsyncGenerator, Dict, List

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
    """Search the web via Google Custom Search API."""
    query = params.get("query", "").strip()
    if not query:
        return "Error: Search query is required."

    num_results = min(max(params.get("num_results", 5), 1), 10)

    api_key = os.getenv("GOOGLE_SEARCH_API_KEY")
    cx = os.getenv("GOOGLE_SEARCH_ENGINE_ID")

    if not api_key or not cx:
        return "Error: Google Search API key or Engine ID not configured."

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                "https://www.googleapis.com/customsearch/v1",
                params={
                    "key": api_key,
                    "cx": cx,
                    "q": query,
                    "num": num_results,
                },
            )
            resp.raise_for_status()

        data = resp.json()
        items = data.get("items", [])

        if not items:
            return f"No results found for: {query}"

        results = []
        for item in items[:num_results]:
            results.append({
                "title": item.get("title", ""),
                "url": item.get("link", ""),
                "snippet": item.get("snippet", ""),
            })

        lines = [f"Search results for: {query}\n"]
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. {r['title']}")
            if r["url"]:
                lines.append(f"   URL: {r['url']}")
            if r["snippet"]:
                lines.append(f"   {r['snippet']}")
            lines.append("")

        return "\n".join(lines)

    except httpx.HTTPStatusError as e:
        logger.warning(f"Web search failed: {e}")
        if e.response.status_code == 429:
            return "Error: Google Search API rate limit exceeded. Try again later."
        return f"Error: Web search failed — {e}"
    except Exception as e:
        logger.warning(f"Web search error: {e}")
        return f"Error: Web search failed — {e}"


register_tool(ToolConfig(
    name="search_web",
    description="Search the web. Returns titles, URLs, and snippets for matching results. Use this to look up information, find websites, or research topics.",
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
# research_web — Search agent with progress streaming
# =============================================================================

# Inner tool definitions for the research LLM call
_RESEARCH_INNER_TOOLS = [
    {
        "name": "search_web",
        "description": "Search the web via DuckDuckGo. Returns titles, URLs, and snippets.",
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
        "description": "Fetch a webpage and extract its text. Use this to read a specific URL and get its full content.",
        "input_schema": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to fetch"},
            },
            "required": ["url"],
        },
    },
]

def _build_research_system_prompt() -> str:
    """Build research system prompt with current date/time."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    return (
        f"You are a web research assistant. Your job is to answer a question using web search.\n\n"
        f"Current date and time: {now}\n\n"
        "## Research workflow\n"
        "1. ALWAYS start by calling search_web with a well-crafted query.\n"
        "2. Review the search results. If the answer is clearly in the snippets, return it.\n"
        "3. If the answer is NOT clear from snippets, call fetch_webpage on the most promising URL "
        "to read the full page content.\n"
        "4. If the first page didn't have the answer, try fetching another result or refine your "
        "search query and search again.\n"
        "5. When you have a confident answer, respond with just the answer text. "
        "Keep it concise — match the scope of what was asked.\n\n"
        "## Rules\n"
        "- NEVER answer from memory or training data. ALWAYS search first.\n"
        "- Make a genuine effort: try at least 2 different approaches before giving up.\n"
        "- For URLs/links: fetch the page to verify the URL is correct.\n"
        "- If you truly cannot find the answer after multiple attempts, respond with exactly: "
        "Could not determine an answer.\n\n"
        "## CRITICAL: Output format\n"
        "Your final answer will be stored directly in a database cell. "
        "Return ONLY the raw value — no preambles, no explanations, no surrounding text.\n\n"
        "NEVER start with phrases like:\n"
        "- 'Based on my research...'\n"
        "- 'According to...'\n"
        "- 'The [thing] is...'\n"
        "- 'I found that...'\n"
        "- 'After searching...'\n\n"
        "Examples:\n"
        "- Asked for a URL? Return ONLY the URL: https://example.com\n"
        "- Asked for a date? Return ONLY the date: 2024-03-15\n"
        "- Asked for a name? Return ONLY the name: John Smith\n"
        "- Asked for a number? Return ONLY the number: 42\n"
        "- Asked for a description? Return ONLY the description, max 1-2 sentences.\n\n"
        "WRONG: 'The official website for Acme Corp is https://acme.com'\n"
        "RIGHT: 'https://acme.com'\n"
        "WRONG: 'Based on my research, the CEO is Jane Doe'\n"
        "RIGHT: 'Jane Doe'\n"
        "WRONG: 'According to their website, Acme Corp was founded in 2010'\n"
        "RIGHT: '2010'\n\n"
        "This is the MOST IMPORTANT rule. Your output goes directly into a spreadsheet cell."
    )


import re as _re

_PREAMBLE_PATTERNS = [
    _re.compile(r'^(?:based on (?:my |the )?(?:research|search|findings|results)[\s,]*)', _re.IGNORECASE),
    _re.compile(r'^(?:according to (?:the |my )?(?:search|results|findings|webpage|article|page)[\s,]*)', _re.IGNORECASE),
    _re.compile(r'^(?:(?:I |i )?found (?:that )?)', _re.IGNORECASE),
    _re.compile(r'^(?:after (?:searching|researching|looking)[\s,]*)', _re.IGNORECASE),
    _re.compile(r'^(?:the (?:answer|result|latest|information) (?:is|was|to .+? is) )', _re.IGNORECASE),
    _re.compile(r'^(?:(?:I )?need to (?:fetch|search|look).+?[:\.]\s*)', _re.IGNORECASE | _re.DOTALL),
    _re.compile(r'^(?:let me .+?[:\.]\s*)', _re.IGNORECASE | _re.DOTALL),
]


def _strip_preamble(text: str) -> str:
    """Strip common LLM preamble phrases from the answer."""
    result = text.strip()
    for pattern in _PREAMBLE_PATTERNS:
        new_result = pattern.sub('', result).strip()
        if new_result != result:
            logger.warning(
                f"strip_preamble: detected preamble in answer. "
                f"Pattern: {pattern.pattern!r}, "
                f"before={result[:100]!r}, after={new_result[:100]!r}"
            )
            result = new_result
    # Strip wrapping quotes if the entire answer is quoted
    if len(result) > 2 and result[0] == result[-1] and result[0] in ('"', "'"):
        result = result[1:-1].strip()
    return result


async def _research_web_core(
    query: str,
    max_steps: int,
    db: AsyncSession,
    user_id: int,
) -> AsyncGenerator[Dict[str, Any], None]:
    """
    Core research loop as an async generator.

    Yields step dicts during execution. Each step has "action" and details:
      {"action": "search", "query": "...", "detail": "5 results found"}
      {"action": "fetch", "url": "...", "detail": "Title: ..."}
      {"action": "thinking", "text": "..."}
      {"action": "error", "detail": "LLM call failed: ..."}
      {"action": "answer", "text": "..." | None}  — final answer (always last)

    The "action"/"detail" keys are designed to be collected into a trace log.
    """
    query_short = query[:100] + "..." if len(query) > 100 else query
    logger.info(f"research_web_core: starting, max_steps={max_steps}, query={query_short!r}")

    client = anthropic.AsyncAnthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    messages: List[Dict[str, Any]] = [{"role": "user", "content": query}]

    for turn in range(max_steps):
        try:
            api_kwargs: Dict[str, Any] = dict(
                model="claude-haiku-4-5-20251001",
                max_tokens=1024,
                messages=messages,
                tools=_RESEARCH_INNER_TOOLS,
                system=_build_research_system_prompt(),
            )
            # Force search_web on the first turn
            if turn == 0:
                api_kwargs["tool_choice"] = {"type": "tool", "name": "search_web"}

            response = await client.messages.create(**api_kwargs)
            logger.info(
                f"research_web_core: turn {turn}, stop_reason={response.stop_reason}, "
                f"content_blocks={len(response.content)}"
            )
        except Exception as e:
            logger.warning(f"research_web_core: LLM call failed (turn {turn}): {e}")
            yield {"action": "error", "detail": f"LLM call failed: {e}"}
            yield {"action": "answer", "text": None}
            return

        # Check for tool use
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        text_blocks = [b for b in response.content if b.type == "text"]

        if not tool_uses:
            # No more tool calls — extract the final text answer
            if text_blocks:
                raw_text = text_blocks[0].text.strip()
                text = _strip_preamble(raw_text)
                logger.info(
                    f"research_web_core: final answer, length={len(text)}, "
                    f"preview={text[:120]!r}"
                )
                if text:
                    yield {"action": "answer", "text": text}
                    return
            logger.warning("research_web_core: no tool calls and no text in response")
            yield {"action": "error", "detail": "LLM returned empty response (no tools, no text)"}
            yield {"action": "answer", "text": None}
            return

        # Emit any thinking text before tool calls
        for block in text_blocks:
            if block.text.strip():
                yield {"action": "thinking", "text": block.text.strip()}

        # Execute each tool call
        messages.append({"role": "assistant", "content": response.content})
        tool_results: List[Dict[str, Any]] = []

        for tool_use in tool_uses:
            logger.info(f"research_web_core: turn {turn}, calling {tool_use.name}")
            ctx: Dict[str, Any] = {}

            if tool_use.name == "search_web":
                search_query = tool_use.input.get("query", query)
                result_text = await execute_search_web(tool_use.input, db, user_id, ctx)

                # Summarize search results for the trace
                if result_text.startswith("No results found"):
                    detail = result_text
                elif result_text.startswith("Error:"):
                    detail = result_text
                else:
                    # Extract top result titles for the trace
                    result_lines = []
                    for line in result_text.splitlines():
                        if line and line[0].isdigit() and '. ' in line:
                            # Lines like "1. Title of Result"
                            result_lines.append(line)
                    n = len(result_lines)
                    # Show top 3 results so the user can see what was returned
                    top = "; ".join(r.split('. ', 1)[1] if '. ' in r else r for r in result_lines[:3])
                    detail = f"{n} results — {top}" if top else f"{n} results found"

                yield {"action": "search", "query": search_query, "detail": detail}

            elif tool_use.name == "fetch_webpage":
                fetch_url = tool_use.input.get("url", "")
                result_text = await execute_fetch_webpage(tool_use.input, db, user_id, ctx)

                # Summarize fetch for the trace
                if result_text.startswith("Error:"):
                    detail = result_text[:200]
                else:
                    # Extract title line if present
                    for line in result_text.splitlines():
                        if line.startswith("Title:"):
                            detail = line
                            break
                    else:
                        words = len(result_text.split())
                        detail = f"Fetched ~{words} words"

                yield {"action": "fetch", "url": fetch_url, "detail": detail}
            else:
                result_text = f"Unknown tool: {tool_use.name}"

            result_preview = result_text[:100] if result_text else "(empty)"
            logger.info(f"research_web_core: {tool_use.name} result: {result_preview!r}")

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": result_text,
            })

        messages.append({"role": "user", "content": tool_results})

    # Exhausted all turns — force a final answer (no tools)
    logger.warning(f"research_web_core: exhausted {max_steps} turns, forcing final answer")
    messages.append({
        "role": "user",
        "content": (
            "STOP RESEARCHING. You have no more search/fetch steps available. "
            "You MUST answer NOW using ONLY information you already found above.\n\n"
            "CRITICAL OUTPUT RULES:\n"
            "- Return ONLY the raw answer value. Your output goes directly into a spreadsheet cell.\n"
            "- NEVER include preambles like 'Based on...', 'I found...', 'The answer is...', "
            "'I need to fetch...', 'Let me search...'\n"
            "- Do NOT describe what you would do next or what you still need to find.\n"
            "- If you found partial information, return what you have.\n"
            "- If you truly found NOTHING useful, respond with exactly: Could not determine an answer."
        )
    })
    try:
        response = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=1024,
            messages=messages,
            system=_build_research_system_prompt(),
            # No tools — forces text response
        )
        text_blocks = [b for b in response.content if b.type == "text"]
        if text_blocks:
            raw_text = text_blocks[0].text.strip()
            text = _strip_preamble(raw_text)
            if text:
                yield {"action": "answer", "text": text}
                return
    except Exception as e:
        logger.warning(f"research_web_core: final answer call failed: {e}")

    yield {"action": "error", "detail": f"Exhausted all {max_steps} research turns without reaching an answer"}
    yield {"action": "answer", "text": None}


async def execute_research_web(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any],
) -> str:
    """
    Standalone tool executor: runs the research loop and returns the final answer.
    Progress steps are consumed silently (not streamed to frontend).
    When called from for_each_row, use _research_web_core directly to get progress.
    """
    query = params.get("query", "").strip()
    if not query:
        return "Error: query is required."

    max_steps = min(max(params.get("max_steps", 5), 1), 8)

    answer = "Could not determine an answer."
    async for step in _research_web_core(query, max_steps, db, user_id):
        if step["action"] == "answer":
            answer = step.get("text") or "Could not determine an answer."

    return answer


register_tool(ToolConfig(
    name="research_web",
    description=(
        "Research agent: answers a natural language question by searching the web "
        "and reading pages. Performs multiple rounds of search and fetch to find a "
        "definitive answer. Use this for factual lookups like "
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
                "description": "Max search/fetch rounds (1-8, default 5)"
            },
        },
        "required": ["query"]
    },
    executor=execute_research_web,
    category="web",
    is_global=True,
    streaming=False,
))
