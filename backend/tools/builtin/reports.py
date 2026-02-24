"""
Report Tools

Tools for exploring reports, articles, and notes within research streams.
These tools are available on the reports page and article modal views.

All tools are async and use the ReportService for database access.
"""

import logging
from typing import Any, Dict, List, Union

from sqlalchemy.ext.asyncio import AsyncSession

from tools.registry import ToolConfig, ToolResult, register_tool
from utils.date_utils import format_pub_date

logger = logging.getLogger(__name__)


# =============================================================================
# Tool Executors (Async)
# =============================================================================

async def execute_list_stream_reports(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """List all reports for the current research stream."""
    from services.report_service import ReportService
    from services.user_service import UserService

    stream_id = context.get("stream_id") or params.get("stream_id")

    if not stream_id:
        return "Error: No stream context available. This tool requires being on a report page."

    try:
        # Get User object (service methods require User, not user_id)
        user_service = UserService(db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return "Error: User not found."

        service = ReportService(db)
        # Returns List[ReportWithArticleCount] - access .report for the Report model
        results = await service.get_reports_for_stream(user, stream_id)

        if not results:
            return "No reports found for this research stream."

        # Format results for LLM
        text_lines = [f"Found {len(results)} reports for this research stream:\n"]
        reports_data = []

        for i, item in enumerate(results, 1):
            report = item.report  # Extract Report from ReportWithArticleCount
            # Get key highlights preview
            highlights_preview = ""
            if report.key_highlights:
                highlights_preview = report.key_highlights[:200] + "..." if len(report.key_highlights) > 200 else report.key_highlights

            text_lines.append(f"""
{i}. Report ID: {report.report_id}
   Name: {report.report_name}
   Date: {report.report_date.strftime('%Y-%m-%d') if report.report_date else 'Unknown'}
   Articles: {item.article_count}
   Highlights: {highlights_preview or 'None'}
""")

            reports_data.append({
                "report_id": report.report_id,
                "report_name": report.report_name,
                "report_date": report.report_date.isoformat() if report.report_date else None,
                "article_count": item.article_count,
                "has_highlights": bool(report.key_highlights),
                "has_thematic_analysis": bool(report.thematic_analysis)
            })

        payload = {
            "type": "report_list",
            "data": {
                "stream_id": stream_id,
                "total_reports": len(results),
                "reports": reports_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error listing reports: {e}", exc_info=True)
        return f"Error listing reports: {str(e)}"


async def execute_get_report_summary(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Get the summary, highlights, and thematic analysis for a specific report."""
    from services.report_service import ReportService

    report_id = params.get("report_id") or context.get("report_id")

    if not report_id:
        return "Error: No report_id provided or available in context."

    try:
        service = ReportService(db)
        result = await service.get_report_with_articles(user_id, report_id)

        if not result:
            return f"No report found with ID: {report_id}"

        report = result.report
        article_count = result.article_count

        # Extract enrichments if available
        enrichments = report.enrichments or {}
        executive_summary = enrichments.get("executive_summary", "")
        category_summaries = enrichments.get("category_summaries", [])

        text_result = f"""
=== Report Summary ===
Report: {report.report_name}
Report ID: {report.report_id}
Date: {report.report_date.strftime('%Y-%m-%d') if report.report_date else 'Unknown'}
Total Articles: {article_count}

=== Key Highlights ===
{report.key_highlights or 'No key highlights available.'}

=== Thematic Analysis ===
{report.thematic_analysis or 'No thematic analysis available.'}

=== Executive Summary ===
{executive_summary or 'No executive summary available.'}
"""

        if category_summaries:
            text_result += "\n=== Category Summaries ===\n"
            for cat in category_summaries:
                if isinstance(cat, dict):
                    text_result += f"\n**{cat.get('category_name', 'Unknown')}**\n"
                    text_result += f"{cat.get('summary', 'No summary')}\n"

        payload = {
            "type": "report_summary",
            "data": {
                "report_id": report.report_id,
                "report_name": report.report_name,
                "report_date": report.report_date.isoformat() if report.report_date else None,
                "article_count": article_count,
                "key_highlights": report.key_highlights,
                "thematic_analysis": report.thematic_analysis,
                "executive_summary": executive_summary,
                "category_summaries": category_summaries
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"Error getting report summary: {e}", exc_info=True)
        return f"Error getting report summary: {str(e)}"


async def execute_get_report_articles(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """
    Get the list of articles in a report with metadata.
    Supports two modes:
    - condensed: Basic info (PMID, title, date, journal, categories)
    - expanded: Full info including abstract
    """
    from services.report_service import ReportService

    report_id = params.get("report_id") or context.get("report_id")
    mode = params.get("mode", "condensed").lower()

    if mode not in ("condensed", "expanded"):
        mode = "condensed"

    if not report_id:
        return "Error: No report_id provided or available in context."

    try:
        service = ReportService(db)
        result = await service.get_report_with_articles(user_id, report_id)

        if not result:
            return f"No report found with ID {report_id} or access denied."

        if not result.articles:
            return f"No articles found in report {report_id}."

        # Use category map from the service result
        category_map = result.category_map or {}

        # Format text for LLM
        text_lines = [f"=== Articles in Report: {result.report.report_name} ==="]
        text_lines.append(f"Total: {result.article_count} articles\n")

        articles_data = []
        for i, article_info in enumerate(result.articles, 1):
            article = article_info.article
            assoc = article_info.association

            # Resolve category IDs to names
            category_ids = assoc.presentation_categories or []
            category_names = [category_map.get(cid, cid) for cid in category_ids]
            categories_str = ', '.join(category_names) if category_names else 'Uncategorized'
            publication_date = format_pub_date(article.pub_year, article.pub_month, article.pub_day) or "Unknown"

            if mode == "condensed":
                text_lines.append(f"""
{i}. Article ID: {article.article_id} | PMID: {article.pmid}
   Title: {article.title}
   Journal: {article.journal or 'Unknown'} ({publication_date})
   Categories: {categories_str}
""")
            else:  # expanded
                text_lines.append(f"""
{i}. Article ID: {article.article_id} | PMID: {article.pmid}
   Title: {article.title}
   Authors: {article.authors or 'Unknown'}
   Journal: {article.journal or 'Unknown'} ({publication_date})
   Categories: {categories_str}
   Relevance Score: {assoc.relevance_score or 'N/A'}

   Abstract:
   {article.abstract or 'No abstract available.'}
""")

            # Build article data for payload
            articles_data.append({
                "pmid": article.pmid,
                "title": article.title,
                "journal": article.journal,
                "publication_date": publication_date,
                "categories": category_names,
                "category_ids": category_ids,
                "relevance_score": assoc.relevance_score,
                "ranking": assoc.ranking,
                "authors": article.authors if mode == "expanded" else None,
                "abstract": article.abstract if mode == "expanded" else None,
                "doi": article.doi if mode == "expanded" else None
            })

        payload = {
            "type": "report_articles",
            "data": {
                "report_id": report_id,
                "report_name": result.report.report_name,
                "report_date": result.report.report_date.isoformat() if result.report.report_date else None,
                "total_articles": result.article_count,
                "articles": articles_data,
                "mode": mode
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error getting report articles: {e}", exc_info=True)
        return f"Error getting report articles: {str(e)}"


async def execute_search_articles_in_reports(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Search for articles across all reports in the current stream."""
    from services.report_service import ReportService

    query = params.get("query", "").strip()
    stream_id = context.get("stream_id") or params.get("stream_id")
    max_results = min(params.get("max_results", 20), 50)

    if not query:
        return "Error: No search query provided."

    if not stream_id:
        return "Error: No stream context available."

    try:
        service = ReportService(db)
        results = await service.search_articles_in_stream(
            user_id=user_id,
            stream_id=stream_id,
            query=query,
            max_results=max_results
        )

        if not results:
            return f"No articles found matching '{query}' in this stream's reports."

        text_lines = [f"Found {len(results)} articles matching '{query}':\n"]
        articles_data = []

        for i, result in enumerate(results, 1):
            article = result.article
            assoc = result.association
            report = result.report
            # Create snippet from abstract
            abstract_snippet = ""
            if article.abstract:
                lower_abstract = article.abstract.lower()
                lower_query = query.lower()
                pos = lower_abstract.find(lower_query)
                if pos >= 0:
                    start = max(0, pos - 50)
                    end = min(len(article.abstract), pos + len(query) + 100)
                    abstract_snippet = "..." + article.abstract[start:end] + "..."
                else:
                    abstract_snippet = article.abstract[:150] + "..."

            text_lines.append(f"""
{i}. Article ID: {article.article_id} | PMID: {article.pmid}
   Title: {article.title}
   Journal: {article.journal} ({format_pub_date(article.pub_year, article.pub_month, article.pub_day) or 'Unknown'})
   Report: {report.report_name} ({report.report_date.strftime('%Y-%m-%d') if report.report_date else 'Unknown'})
   Relevance Score: {assoc.relevance_score or 'N/A'}
   Context: {abstract_snippet}
""")

            articles_data.append({
                "article_id": article.article_id,
                "pmid": article.pmid,
                "title": article.title,
                "journal": article.journal,
                "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
                "report_id": report.report_id,
                "report_name": report.report_name,
                "relevance_score": assoc.relevance_score
            })

        payload = {
            "type": "article_search_results",
            "data": {
                "query": query,
                "total_results": len(results),
                "articles": articles_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error searching articles: {e}", exc_info=True)
        return f"Error searching articles: {str(e)}"


async def execute_get_article_details(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Get full details of a specific article including notes and relevance info."""
    from services.article_service import ArticleService
    from services.report_article_association_service import ReportArticleAssociationService
    from services.notes_service import NotesService
    from services.user_service import UserService

    article_id = params.get("article_id")
    pmid = params.get("pmid")
    report_id = params.get("report_id") or context.get("report_id")

    if not article_id and not pmid:
        return "Error: Either article_id or pmid must be provided."

    try:
        article_service = ArticleService(db)

        # Get article via service - prefer article_id, fallback to pmid
        if article_id:
            article = await article_service.find_by_id(int(article_id))
        else:
            article = await article_service.find_by_pmid(str(pmid))

        if not article:
            return f"No article found with {'ID ' + str(article_id) if article_id else 'PMID ' + str(pmid)}"

        # Get association info if report context available
        assoc = None
        notes = []
        if report_id:
            assoc_service = ReportArticleAssociationService(db)
            assoc = await assoc_service.find(report_id, article.article_id)

            # Get notes
            if assoc:
                user_service = UserService(db)
                user = await user_service.get_user_by_id(user_id)
                if user:
                    notes_service = NotesService(db)
                    notes = await notes_service.get_notes(report_id, article.article_id, user)

        text_result = f"""
=== Article Details ===
Article ID: {article.article_id}
PMID: {article.pmid}
DOI: {article.doi or 'N/A'}
Title: {article.title}
Authors: {article.authors}
Journal: {article.journal}
Date: {format_pub_date(article.pub_year, article.pub_month, article.pub_day) or 'Unknown'}
Volume: {article.volume}, Issue: {article.issue}, Pages: {article.pages}

=== Abstract ===
{article.abstract or 'No abstract available.'}
"""

        if assoc:
            text_result += f"""
=== Report Context ===
Relevance Score: {assoc.relevance_score or 'N/A'}
Relevance Rationale: {assoc.relevance_rationale or 'N/A'}
Ranking: {assoc.ranking or 'N/A'}
User Starred: {'Yes' if assoc.is_starred else 'No'}
User Read: {'Yes' if assoc.is_read else 'No'}
"""

            if assoc.ai_enrichments:
                enrichments = assoc.ai_enrichments
                if isinstance(enrichments, dict):
                    if enrichments.get("stance_analysis"):
                        text_result += f"\n=== Stance Analysis ===\n{enrichments['stance_analysis']}\n"

        if notes:
            text_result += "\n=== Notes ===\n"
            for note in notes:
                author = note.get("author_name", "Unknown")
                visibility = note.get("visibility", "personal")
                content = note.get("content", "")
                text_result += f"\n[{visibility.upper()}] {author}:\n{content}\n"

        payload = {
            "type": "article_details",
            "data": {
                "article_id": article.article_id,
                "pmid": article.pmid,
                "title": article.title,
                "authors": article.authors,
                "abstract": article.abstract,
                "journal": article.journal,
                "publication_date": format_pub_date(article.pub_year, article.pub_month, article.pub_day),
                "relevance_score": assoc.relevance_score if assoc else None,
                "is_starred": assoc.is_starred if assoc else None,
                "notes_count": len(notes)
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"Error getting article details: {e}", exc_info=True)
        return f"Error getting article details: {str(e)}"


async def execute_get_notes_for_article(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Get all notes for a specific article in a report."""
    from services.article_service import ArticleService
    from services.notes_service import NotesService
    from services.user_service import UserService

    article_id = params.get("article_id")
    pmid = params.get("pmid")
    report_id = params.get("report_id") or context.get("report_id")

    if not article_id and not pmid:
        return "Error: Either article_id or pmid is required."

    if not report_id:
        return "Error: report_id is required (either as parameter or from context)."

    try:
        # Resolve article_id from pmid if needed using the service
        if not article_id and pmid:
            article_service = ArticleService(db)
            article = await article_service.find_by_pmid(str(pmid))
            if not article:
                return f"No article found with PMID {pmid}"
            article_id = article.article_id

        user_service = UserService(db)
        user = await user_service.get_user_by_id(user_id)
        if not user:
            return "Error: User not found."

        notes_service = NotesService(db)
        notes = await notes_service.get_notes(report_id, article_id, user)

        if not notes:
            return f"No notes found for article {article_id} in report {report_id}."

        text_lines = [f"Found {len(notes)} notes for this article:\n"]
        notes_data = []

        for i, note in enumerate(notes, 1):
            author = note.get("author_name", "Unknown")
            visibility = note.get("visibility", "personal")
            content = note.get("content", "")
            created_at = note.get("created_at", "")

            text_lines.append(f"""
{i}. [{visibility.upper()}] By: {author}
   Created: {created_at}
   ---
   {content}
""")

            notes_data.append({
                "id": note.get("id"),
                "author_name": author,
                "visibility": visibility,
                "content": content,
                "created_at": created_at
            })

        payload = {
            "type": "article_notes",
            "data": {
                "article_id": article_id,
                "report_id": report_id,
                "total_notes": len(notes),
                "notes": notes_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error getting notes: {e}", exc_info=True)
        return f"Error getting notes: {str(e)}"


async def execute_compare_reports(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Compare two reports to identify new articles, removed articles, and changes."""
    from services.report_service import ReportService

    report_id_1 = params.get("report_id_1")
    report_id_2 = params.get("report_id_2")

    if not report_id_1 or not report_id_2:
        return "Error: Both report_id_1 and report_id_2 are required."

    try:
        service = ReportService(db)

        # Get both reports with articles
        result1 = await service.get_report_with_articles(user_id, report_id_1)
        result2 = await service.get_report_with_articles(user_id, report_id_2)

        if not result1:
            return f"Report {report_id_1} not found."
        if not result2:
            return f"Report {report_id_2} not found."

        report1 = result1.report
        report2 = result2.report

        # Build article lookup dicts from data we already have
        articles_1_map = {a.article.article_id: a.article for a in result1.articles} if result1.articles else {}
        articles_2_map = {a.article.article_id: a.article for a in result2.articles} if result2.articles else {}

        articles_1_ids = set(articles_1_map.keys())
        articles_2_ids = set(articles_2_map.keys())

        # Calculate differences
        only_in_1 = articles_1_ids - articles_2_ids
        only_in_2 = articles_2_ids - articles_1_ids
        in_both = articles_1_ids & articles_2_ids

        text_result = f"""
=== Report Comparison ===

Report 1: {report1.report_name} ({report1.report_date.strftime('%Y-%m-%d') if report1.report_date else 'Unknown'})
Total articles: {len(articles_1_ids)}

Report 2: {report2.report_name} ({report2.report_date.strftime('%Y-%m-%d') if report2.report_date else 'Unknown'})
Total articles: {len(articles_2_ids)}

=== Differences ===
Articles only in Report 1: {len(only_in_1)}
Articles only in Report 2: {len(only_in_2)}
Articles in both reports: {len(in_both)}
"""

        # Show details for unique articles (use data we already have)
        if only_in_2:
            text_result += f"\n=== New in Report 2 (showing up to 10) ===\n"
            for article_id in list(only_in_2)[:10]:
                art = articles_2_map[article_id]
                text_result += f"- Article ID: {art.article_id} | {art.title} (PMID: {art.pmid})\n"

        if only_in_1:
            text_result += f"\n=== Not in Report 2 (showing up to 10) ===\n"
            for article_id in list(only_in_1)[:10]:
                art = articles_1_map[article_id]
                text_result += f"- Article ID: {art.article_id} | {art.title} (PMID: {art.pmid})\n"

        payload = {
            "type": "report_comparison",
            "data": {
                "report_1": {
                    "id": report_id_1,
                    "name": report1.report_name,
                    "date": report1.report_date.isoformat() if report1.report_date else None,
                    "article_count": len(articles_1_ids)
                },
                "report_2": {
                    "id": report_id_2,
                    "name": report2.report_name,
                    "date": report2.report_date.isoformat() if report2.report_date else None,
                    "article_count": len(articles_2_ids)
                },
                "only_in_report_1": len(only_in_1),
                "only_in_report_2": len(only_in_2),
                "in_both": len(in_both)
            }
        }

        return ToolResult(text=text_result, payload=payload)

    except Exception as e:
        logger.error(f"Error comparing reports: {e}", exc_info=True)
        return f"Error comparing reports: {str(e)}"


async def execute_get_starred_articles(
    params: Dict[str, Any],
    db: AsyncSession,
    user_id: int,
    context: Dict[str, Any]
) -> Union[str, ToolResult]:
    """Get all starred articles across reports in the current stream."""
    from services.report_service import ReportService

    stream_id = context.get("stream_id") or params.get("stream_id")

    if not stream_id:
        return "Error: No stream context available."

    try:
        service = ReportService(db)
        results = await service.get_starred_articles_in_stream(user_id, stream_id)

        if not results:
            return "No starred articles found in this stream's reports."

        text_lines = [f"Found {len(results)} starred articles:\n"]
        articles_data = []

        for i, result in enumerate(results, 1):
            article = result.article
            assoc = result.association
            report = result.report
            text_lines.append(f"""
{i}. Article ID: {article.article_id} | PMID: {article.pmid}
   Title: {article.title}
   Journal: {article.journal} ({format_pub_date(article.pub_year, article.pub_month, article.pub_day) or 'Unknown'})
   Report: {report.report_name}
   Relevance Score: {assoc.relevance_score or 'N/A'}
""")

            articles_data.append({
                "article_id": article.article_id,
                "pmid": article.pmid,
                "title": article.title,
                "journal": article.journal,
                "report_id": report.report_id,
                "report_name": report.report_name,
                "relevance_score": assoc.relevance_score
            })

        payload = {
            "type": "starred_articles",
            "data": {
                "stream_id": stream_id,
                "total_starred": len(results),
                "articles": articles_data
            }
        }

        return ToolResult(text="\n".join(text_lines), payload=payload)

    except Exception as e:
        logger.error(f"Error getting starred articles: {e}", exc_info=True)
        return f"Error getting starred articles: {str(e)}"


# =============================================================================
# Register Tools
# =============================================================================

register_tool(ToolConfig(
    name="list_stream_reports",
    description="List all reports for the current research stream. Shows report names, dates, article counts, and highlights. Use this to see the history of reports and help users navigate between them.",
    input_schema={
        "type": "object",
        "properties": {
            "stream_id": {
                "type": "integer",
                "description": "The stream ID (optional if available in context)"
            }
        }
    },
    executor=execute_list_stream_reports,
    category="reports"
))

register_tool(ToolConfig(
    name="get_report_summary",
    description="Get the full summary, key highlights, thematic analysis, and executive summary for a specific report. Use this to give users a comprehensive overview of a report's findings.",
    input_schema={
        "type": "object",
        "properties": {
            "report_id": {
                "type": "integer",
                "description": "The report ID to get summary for (optional if viewing a report)"
            }
        }
    },
    executor=execute_get_report_summary,
    category="reports"
))

register_tool(ToolConfig(
    name="get_report_articles",
    description="Get the list of articles in a report. Use 'condensed' mode for a quick overview (PMID, title, journal, date, categories) or 'expanded' mode for full details including abstracts. This is the primary way to see what articles are in a report.",
    input_schema={
        "type": "object",
        "properties": {
            "report_id": {
                "type": "integer",
                "description": "The report ID to get articles for (optional if viewing a report)"
            },
            "mode": {
                "type": "string",
                "enum": ["condensed", "expanded"],
                "description": "condensed: Basic info (PMID, title, journal, date, categories). expanded: Full details including authors and abstracts.",
                "default": "condensed"
            }
        }
    },
    executor=execute_get_report_articles,
    category="reports"
))

register_tool(ToolConfig(
    name="search_articles_in_reports",
    description="Search for articles across all reports in the stream. Use this to find specific articles by any identifier the user might have: PMID, title words, author names, journal name, or keywords from the abstract. Also searches DOI if the query looks like one. This is the primary tool for helping users locate articles they're looking for.",
    input_schema={
        "type": "object",
        "properties": {
            "query": {
                "type": "string",
                "description": "Space-separated search terms. Each term is matched independently (AND logic) against title, abstract, journal, authors, and PMID. Use simple keywords like 'Madigan asbestos' — do NOT use boolean operators (AND/OR/NOT), quotes, or field tags. For DOIs, include the '10.' prefix."
            },
            "max_results": {
                "type": "integer",
                "description": "Maximum results to return (default 20, max 50)",
                "default": 20
            }
        },
        "required": ["query"]
    },
    executor=execute_search_articles_in_reports,
    category="reports"
))

register_tool(ToolConfig(
    name="get_article_details",
    description="Get full details for a specific article including abstract, relevance info, and notes. Use the article_id shown in tool results (preferred) or pmid.",
    input_schema={
        "type": "object",
        "properties": {
            "article_id": {
                "type": "integer",
                "description": "The article's internal ID (shown as 'Article ID' in tool results - preferred)"
            },
            "pmid": {
                "type": "string",
                "description": "The PubMed ID of the article (fallback if article_id not available)"
            },
            "report_id": {
                "type": "integer",
                "description": "Report ID for context-specific info (optional)"
            }
        }
    },
    executor=execute_get_article_details,
    category="reports"
))

register_tool(ToolConfig(
    name="get_notes_for_article",
    description="Get all notes (personal and shared) for a specific article in a report. Use the article_id shown in tool results (preferred) or pmid.",
    input_schema={
        "type": "object",
        "properties": {
            "article_id": {
                "type": "integer",
                "description": "The article's internal ID (shown as 'Article ID' in tool results - preferred)"
            },
            "pmid": {
                "type": "string",
                "description": "The PubMed ID of the article (fallback if article_id not available)"
            },
            "report_id": {
                "type": "integer",
                "description": "The report ID (optional if in report context)"
            }
        },
        "required": []
    },
    executor=execute_get_notes_for_article,
    category="reports"
))

register_tool(ToolConfig(
    name="compare_reports",
    description="Compare two reports to see what articles are new, removed, or shared between them. Useful for understanding changes between report runs.",
    input_schema={
        "type": "object",
        "properties": {
            "report_id_1": {
                "type": "integer",
                "description": "First report ID (usually the older one)"
            },
            "report_id_2": {
                "type": "integer",
                "description": "Second report ID (usually the newer one)"
            }
        },
        "required": ["report_id_1", "report_id_2"]
    },
    executor=execute_compare_reports,
    category="reports"
))

register_tool(ToolConfig(
    name="get_starred_articles",
    description="Get all articles that users have starred across all reports in the stream. These are articles marked as important or of interest.",
    input_schema={
        "type": "object",
        "properties": {
            "stream_id": {
                "type": "integer",
                "description": "The stream ID (optional if in context)"
            }
        }
    },
    executor=execute_get_starred_articles,
    category="reports"
))
