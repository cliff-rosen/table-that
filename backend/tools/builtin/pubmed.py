"""
PubMed Tools

Tools for searching and retrieving articles from PubMed.

ARTICLE TEXT ACCESS PATTERNS:
=============================
1. search_pubmed - Returns articles with abstracts (no full text)
2. get_pubmed_article - Returns full metadata + abstract for a specific PMID
3. get_full_text - Returns EITHER:
   - Full text content (if article is in PubMed Central/PMC)
   - OR publisher links (free and subscription) as fallback

Note: Only ~30% of PubMed articles are in PMC (open access, NIH-funded, or voluntarily deposited).
For articles NOT in PMC, the get_full_text tool returns LinkOut URLs to publishers.
"""

import asyncio
import logging
from typing import Any, Dict, Union

from sqlalchemy.orm import Session

from tools.registry import ToolConfig, ToolResult, register_tool
from utils.date_utils import format_pub_date

logger = logging.getLogger(__name__)


def execute_search_pubmed(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Execute a PubMed search and return formatted results.
    Returns a ToolResult with both text for LLM and payload for frontend table.
    """
    from services.pubmed_service import PubMedService

    query = params.get("query", "")
    max_results = min(params.get("max_results", 10), 20)  # Cap at 20

    if not query:
        return "Error: No search query provided."

    try:
        service = PubMedService()
        articles, metadata = asyncio.run(service.search_articles(
            query=query,
            max_results=max_results
        ))

        if not articles:
            return f"No articles found for query: {query}"

        total_results = metadata.get('total_results', len(articles))

        # Build payload data for frontend
        articles_data = []
        # Compact listing for LLM (titles + PMIDs only - full details are in the UI panel)
        compact_lines = []

        for i, article in enumerate(articles, 1):
            # Get authors - handle both list and string formats
            authors = article.authors
            if isinstance(authors, list):
                authors_str = ", ".join(authors[:3])
                if len(authors) > 3:
                    authors_str += " et al."
            else:
                authors_str = str(authors) if authors else "Unknown"

            pmid = article.pmid or article.id
            journal = article.journal or 'Unknown'
            date_str = format_pub_date(article.pub_year, article.pub_month, article.pub_day) or 'Unknown'

            compact_lines.append(f"{i}. \"{article.title}\" (PMID: {pmid}, {date_str})")

            # Data for frontend payload
            articles_data.append({
                "pmid": str(pmid),
                "title": article.title,
                "authors": authors_str,
                "journal": journal,
                "publication_date": date_str,
                "abstract": article.abstract or "",
                "has_free_full_text": bool(getattr(article, 'pmc_id', None))
            })

        text_result = (
            f"Found {total_results} results for \"{query}\". Showing top {len(articles)}.\n"
            f"A search results panel with full details (authors, journals, abstracts) is displayed to the user. "
            f"Do NOT repeat article details inline. Just summarize findings or offer to help explore specific articles.\n\n"
            + "\n".join(compact_lines)
        )

        payload = {
            "type": "pubmed_search_results",
            "data": {
                "query": query,
                "total_results": total_results,
                "showing": len(articles),
                "articles": articles_data
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"PubMed search error: {e}", exc_info=True)
        return f"Error searching PubMed: {str(e)}"


def execute_get_pubmed_article(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Retrieve a specific PubMed article by PMID.
    Returns a ToolResult with both text for LLM and payload for frontend card.
    """
    from services.pubmed_service import PubMedService

    pmid = params.get("pmid", "")

    if not pmid:
        return "Error: No PMID provided."

    # Clean the PMID - remove any prefixes
    pmid = str(pmid).strip()
    if pmid.lower().startswith("pmid:"):
        pmid = pmid[5:].strip()

    try:
        service = PubMedService()
        articles = asyncio.run(service.get_articles_from_ids([pmid]))

        if not articles:
            return f"No article found with PMID: {pmid}"

        article = articles[0]

        article_date = format_pub_date(article.pub_year, article.pub_month, article.pub_day)

        # Concise text for LLM - full details are shown in the article card panel
        pmc_note = " (free full text available via PMC)" if article.pmc_id else ""
        text_result = (
            f"Retrieved article PMID {article.PMID}: \"{article.title}\"{pmc_note}.\n"
            f"An article card with full metadata, authors, journal info, and abstract is displayed to the user in a panel. "
            f"Do NOT repeat the article details inline. You may reference the article by title or PMID and discuss its content.\n\n"
            f"Abstract: {article.abstract or 'No abstract available.'}"
        )

        # Build payload for frontend card
        payload = {
            "type": "pubmed_article",
            "data": {
                "pmid": article.PMID,
                "title": article.title,
                "authors": article.authors,
                "journal": article.journal,
                "publication_date": article_date,
                "volume": article.volume,
                "issue": article.issue,
                "pages": article.pages,
                "abstract": article.abstract,
                "pmc_id": article.pmc_id if article.pmc_id else None,
                "doi": article.doi if article.doi else None
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"PubMed fetch error: {e}", exc_info=True)
        return f"Error fetching article: {str(e)}"


def execute_get_full_text(
    params: Dict[str, Any],
    db: Session,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Retrieve the full text of an article from PubMed Central, or provide
    alternative full-text links if the article is not in PMC.

    Returns:
    - If PMC full text available: ToolResult with full text content
    - If not in PMC but links exist: ToolResult with full-text links info
    - If no options available: Error message
    """
    from services.pubmed_service import PubMedService, get_full_text_links

    pmc_id = params.get("pmc_id", "")
    pmid = params.get("pmid", "")

    if not pmc_id and not pmid:
        return "Error: Either pmc_id or pmid must be provided."

    try:
        service = PubMedService()
        article = None

        # If only PMID provided, first fetch the article to get PMC ID
        if not pmc_id and pmid:
            # Clean the PMID
            pmid = str(pmid).strip()
            if pmid.lower().startswith("pmid:"):
                pmid = pmid[5:].strip()

            articles = asyncio.run(service.get_articles_from_ids([pmid]))
            if not articles:
                logger.warning(f"No article found for PMID: {pmid}")
                return f"No article found with PMID: {pmid}"

            article = articles[0]

            if not article.pmc_id:
                # No PMC ID - fetch full-text links as alternative with retry

                # Retry logic for ELink API (can be flaky with 500 errors)
                import time
                links = []
                links_error = None
                max_retries = 3
                for attempt in range(max_retries):
                    try:
                        links = asyncio.run(get_full_text_links(pmid))
                        links_error = None  # Success
                        break
                    except Exception as e:
                        links_error = str(e)
                        logger.warning(f"ELink API error (attempt {attempt + 1}/{max_retries}): {e}")
                        if attempt < max_retries - 1:
                            time.sleep(1)  # Brief delay before retry

                # Separate free and paid links
                free_links = [l for l in links if l.get('is_free', False)]
                paid_links = [l for l in links if not l.get('is_free', False)]

                if links:
                    # Concise text for LLM - link details are shown in the panel
                    free_count = len(free_links)
                    paid_count = len(paid_links)
                    text_result = (
                        f"Article PMID {pmid} (\"{article.title}\") is not in PubMed Central.\n"
                        f"A panel is displayed to the user showing {free_count} free and {paid_count} subscription full-text links. "
                        f"Do NOT list the links inline. You may mention whether free access is available and offer to fetch content from free links."
                    )

                    # Build payload with links info
                    payload = {
                        "type": "pubmed_full_text_links",
                        "data": {
                            "pmid": pmid,
                            "title": article.title,
                            "authors": article.authors,
                            "journal": article.journal,
                            "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
                            "doi": article.doi,
                            "abstract": article.abstract,
                            "pmc_available": False,
                            "free_links": free_links,
                            "paid_links": paid_links
                        }
                    }

                    return ToolResult(text=text_result, payload=payload)
                else:
                    # No links available - distinguish between API error and genuinely no links
                    if links_error:
                        logger.error(f"Failed to fetch full-text links after retries: {links_error}")
                        return f"Article PMID {pmid} is not available in PubMed Central. Could not check for alternative full-text links due to an API error. You may want to try again later, or check the publisher's website using DOI: {article.doi}" if article.doi else f"Article PMID {pmid} is not available in PubMed Central. Could not check for alternative full-text links due to an API error."
                    else:
                        return f"Article PMID {pmid} is not available in PubMed Central and no alternative full-text links were found. Only the abstract is available."

            pmc_id = article.pmc_id
        else:
            # If PMC ID provided directly, normalize format
            pmc_id = str(pmc_id).strip()
            if not pmc_id.lower().startswith("pmc"):
                pmc_id = f"PMC{pmc_id}"

        # Fetch the full text
        full_text = asyncio.run(service.get_pmc_full_text(pmc_id))

        if not full_text:
            logger.warning(f"No full text returned for PMC ID: {pmc_id}")
            return f"Could not retrieve full text for PMC ID: {pmc_id}. The article may not be available or there was an error."

        # If we don't have article metadata yet, try to fetch it
        if not article and pmid:
            articles = asyncio.run(service.get_articles_from_ids([pmid]))
            if articles:
                article = articles[0]

        # Build text result for LLM (truncated for token limits)
        # Note: LLM needs the full text to answer content questions, but the card also shows it
        text_full_text = full_text
        max_chars = 15000
        if len(text_full_text) > max_chars:
            text_full_text = text_full_text[:max_chars] + f"\n\n... [Text truncated. Full article is {len(full_text)} characters]"

        title_note = f" \"{article.title}\"" if article else ""
        text_result = (
            f"Full text retrieved for PMC ID {pmc_id}{title_note}.\n"
            f"An article card with the full text is displayed to the user in a panel. "
            f"Do NOT reproduce large sections of the article inline. Summarize or quote briefly as needed.\n\n"
            f"{text_full_text}"
        )

        # Build payload for frontend card with full text
        if article:
            payload = {
                "type": "pubmed_article",
                "data": {
                    "pmid": article.PMID,
                    "title": article.title,
                    "authors": article.authors,
                    "journal": article.journal,
                    "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
                    "volume": article.volume,
                    "issue": article.issue,
                    "pages": article.pages,
                    "abstract": article.abstract,
                    "pmc_id": pmc_id,
                    "doi": article.doi if article.doi else None,
                    "full_text": full_text  # Full text for the card
                }
            }
        else:
            # Minimal payload if we couldn't fetch article metadata
            payload = {
                "type": "pubmed_article",
                "data": {
                    "pmid": pmid or "Unknown",
                    "title": "Full Text Retrieved",
                    "authors": "Unknown",
                    "journal": "Unknown",
                    "publication_date": "Unknown",
                    "pmc_id": pmc_id,
                    "full_text": full_text
                }
            }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"Full text fetch error: {e}", exc_info=True)
        return f"Error fetching full text: {str(e)}"


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
    name="search_pubmed",
    description="[BETA] Search PubMed for research articles beyond what's in the stream's reports. IMPORTANT: Before using this tool, you must first ask the user for confirmation — explain that you'd like to search PubMed and that this is a beta feature. Only call this tool after the user confirms in a subsequent message.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "The PubMed search query. Can include boolean operators (AND, OR, NOT), field tags like [Title], [Author], etc."
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum number of results to return (1-20). Default is 10.",
                "default": 10,
                "minimum": 1,
                "maximum": 20
            }
        },
        "required": ["query"]
    },
    executor=execute_search_pubmed,
    category="research",
    payload_type="pubmed_search_results"
))

register_tool(ToolConfig(
    name="get_pubmed_article",
    description="Retrieve the full details of a specific PubMed article by its PMID. Use this to get complete information about an article including the full abstract. The response will indicate if free full text is available (PMC ID present).",
    input_schema={
        "type": "object",
        "properties": {
            "pmid": {
                "type": "string",
                "description": "The PubMed ID (PMID) of the article to retrieve."
            }
        },
        "required": ["pmid"]
    },
    executor=execute_get_pubmed_article,
    category="research",
    payload_type="pubmed_article"
))

register_tool(ToolConfig(
    name="get_full_text",
    description="""Retrieve the full text of an article. Use this when the user wants to read the complete article, not just the abstract.

IMPORTANT: Only ~30% of PubMed articles are in PubMed Central (PMC). This tool handles both cases:

1. If the article IS in PMC (has a PMC ID):
   - Returns the full text content directly
   - Response type: pubmed_article with full_text field

2. If the article is NOT in PMC:
   - Returns a list of full-text links from publishers
   - Links are categorized as FREE (open access) or SUBSCRIPTION REQUIRED
   - Response type: pubmed_full_text_links
   - You can use a web fetch tool to retrieve content from free access URLs

Provide either pmc_id (if known) or pmid (tool will check if article has a PMC ID).""",
    input_schema={
        "type": "object",
        "properties": {
            "pmc_id": {
                "type": "string",
                "description": "The PubMed Central ID (e.g., 'PMC1234567' or just '1234567'). Preferred if known - skips lookup step."
            },
            "pmid": {
                "type": "string",
                "description": "The PubMed ID. Will be used to look up the PMC ID. If no PMC ID exists, returns publisher links instead."
            }
        }
    },
    executor=execute_get_full_text,
    category="research",
    payload_type="pubmed_article"
))
