"""
Payload Schema Registry

Central definitions for all payload types used in the chat system.
This is the SINGLE SOURCE OF TRUTH for payload definitions.

Tools reference payloads by name (payload_type field).
Pages declare which payloads they use (in their TabConfig/page config).

Payloads can be:
- Global (is_global=True): Automatically available on all pages
- Non-global (is_global=False): Must be explicitly added to a page

For LLM payloads (source="llm"), this also defines:
- parse_marker: Text marker to look for in LLM output
- parser: Function to extract JSON from LLM output
- llm_instructions: Instructions for the LLM on when/how to use this payload
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


# =============================================================================
# Parser Factory
# =============================================================================

def make_json_parser(payload_type: str) -> Callable[[str], Optional[Dict[str, Any]]]:
    """Create a standard JSON parser for a payload type."""
    def parser(text: str) -> Optional[Dict[str, Any]]:
        try:
            data = json.loads(text.strip())
            return {"type": payload_type, "data": data}
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse {payload_type} JSON: {e}")
            return None
    return parser


# =============================================================================
# PayloadType Definition
# =============================================================================

@dataclass
class PayloadType:
    """Complete definition of a payload type."""
    name: str                               # e.g., "pubmed_search_results"
    description: str                        # Human-readable description
    schema: Dict[str, Any]                  # JSON schema for the data field
    source: str = "tool"                    # "tool" or "llm"
    is_global: bool = False                 # If True, available on all pages

    # For LLM payloads (source="llm"):
    parse_marker: Optional[str] = None      # e.g., "SCHEMA_PROPOSAL:"
    parser: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None
    llm_instructions: Optional[str] = None  # Instructions for LLM

    # For payload manifest (summarize for LLM context):
    summarize: Optional[Callable[[Dict[str, Any]], str]] = None  # Returns brief summary


# =============================================================================
# Payload Type Registry
# =============================================================================

_payload_types: Dict[str, PayloadType] = {}


def register_payload_type(payload_type: PayloadType) -> None:
    """Register a payload type."""
    _payload_types[payload_type.name] = payload_type


def get_payload_type(name: str) -> Optional[PayloadType]:
    """Get a payload type by name."""
    return _payload_types.get(name)


def get_all_payload_types() -> List[PayloadType]:
    """Get all registered payload types."""
    return list(_payload_types.values())


def get_payload_schema(name: str) -> Optional[Dict[str, Any]]:
    """Get the JSON schema for a payload type."""
    payload_type = _payload_types.get(name)
    return payload_type.schema if payload_type else None


def get_global_payload_types() -> List[PayloadType]:
    """Get all global payload types."""
    return [p for p in _payload_types.values() if p.is_global]


def get_payload_types_by_source(source: str) -> List[PayloadType]:
    """Get payload types by source ('tool' or 'llm')."""
    return [p for p in _payload_types.values() if p.source == source]


def get_payload_types_by_names(names: List[str]) -> List[PayloadType]:
    """Get payload types by a list of names."""
    return [_payload_types[name] for name in names if name in _payload_types]


def summarize_payload(payload_type: str, data: Dict[str, Any]) -> str:
    """
    Generate a brief summary of a payload for the LLM context manifest.

    Args:
        payload_type: The type name of the payload
        data: The payload data

    Returns:
        A brief summary string (1-2 sentences max)
    """
    pt = _payload_types.get(payload_type)
    if not pt:
        return f"Unknown payload type: {payload_type}"

    if pt.summarize:
        try:
            return pt.summarize(data)
        except Exception as e:
            logger.warning(f"Failed to summarize payload {payload_type}: {e}")
            return pt.description

    # Default: just return the description
    return pt.description


# =============================================================================
# PubMed Payloads
# =============================================================================

def _summarize_pubmed_search(data: Dict[str, Any]) -> str:
    query = data.get("query", "unknown query")
    total = data.get("total_results", 0)
    showing = data.get("showing", len(data.get("articles", [])))
    return f"PubMed search for '{query}': {showing} of {total} results"


def _summarize_pubmed_article(data: Dict[str, Any]) -> str:
    pmid = data.get("pmid", "unknown")
    title = data.get("title", "Untitled")
    if len(title) > 60:
        title = title[:57] + "..."
    return f"Article PMID:{pmid} - {title}"


def _summarize_pubmed_full_text_links(data: Dict[str, Any]) -> str:
    pmid = data.get("pmid", "unknown")
    title = data.get("title", "Untitled")
    free = len(data.get("free_links", []))
    paid = len(data.get("paid_links", []))
    if len(title) > 50:
        title = title[:47] + "..."
    return f"Full-text links for PMID:{pmid} - {free} free, {paid} paid"


# pubmed_search_results — results from a PubMed search query
register_payload_type(PayloadType(
    name="pubmed_search_results",
    description="Results from a PubMed search query",
    source="tool",
    is_global=True,
    summarize=_summarize_pubmed_search,
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query used"},
            "total_results": {"type": "integer", "description": "Total results found"},
            "showing": {"type": "integer", "description": "Number of results returned"},
            "articles": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "pmid": {"type": "string"},
                        "title": {"type": "string"},
                        "authors": {"type": "string"},
                        "journal": {"type": "string"},
                        "publication_date": {"type": "string"},
                        "abstract": {"type": "string"},
                        "has_free_full_text": {"type": "boolean"}
                    },
                    "required": ["pmid", "title"]
                }
            }
        },
        "required": ["query", "articles"]
    }
))

# pubmed_article — details of a single PubMed article
register_payload_type(PayloadType(
    name="pubmed_article",
    description="Details of a single PubMed article",
    source="tool",
    is_global=True,
    summarize=_summarize_pubmed_article,
    schema={
        "type": "object",
        "properties": {
            "pmid": {"type": "string"},
            "title": {"type": "string"},
            "authors": {"type": "string"},
            "journal": {"type": "string"},
            "publication_date": {"type": "string"},
            "volume": {"type": "string"},
            "issue": {"type": "string"},
            "pages": {"type": "string"},
            "abstract": {"type": "string"},
            "pmc_id": {"type": ["string", "null"]},
            "doi": {"type": ["string", "null"]},
            "full_text": {"type": ["string", "null"], "description": "Full text content from PMC (Markdown formatted)"}
        },
        "required": ["pmid", "title"]
    }
))

# pubmed_full_text_links — full-text access links for a PubMed article
register_payload_type(PayloadType(
    name="pubmed_full_text_links",
    description="Full-text access links for a PubMed article not in PMC",
    source="tool",
    is_global=True,
    summarize=_summarize_pubmed_full_text_links,
    schema={
        "type": "object",
        "properties": {
            "pmid": {"type": "string"},
            "title": {"type": "string"},
            "pmc_available": {"type": "boolean"},
            "free_links": {"type": "array", "items": {"type": "object"}},
            "paid_links": {"type": "array", "items": {"type": "object"}}
        },
        "required": ["pmid"]
    }
))


# =============================================================================
# Web Search Payloads
# =============================================================================

def _summarize_web_search(data: Dict[str, Any]) -> str:
    query = data.get("query", "unknown query")
    total = data.get("total_results", 0)
    results = data.get("results", [])
    return f"Web search for '{query}': {len(results)} of {total} results"


def _summarize_webpage_content(data: Dict[str, Any]) -> str:
    title = data.get("title", "Untitled")
    url = data.get("url", "")
    if len(title) > 50:
        title = title[:47] + "..."
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc
    except:
        domain = url[:30] if url else "unknown"
    return f"Webpage: {title} ({domain})"


# web_search_results — results from a web search
register_payload_type(PayloadType(
    name="web_search_results",
    description="Results from a web search",
    source="tool",
    is_global=True,
    summarize=_summarize_web_search,
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "The search query used"},
            "total_results": {"type": "integer", "description": "Total results found"},
            "results": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "snippet": {"type": "string"},
                        "source": {"type": "string"},
                        "rank": {"type": "integer"}
                    },
                    "required": ["title", "url"]
                }
            }
        },
        "required": ["query", "results"]
    }
))

# webpage_content — content extracted from a webpage
register_payload_type(PayloadType(
    name="webpage_content",
    description="Content extracted from a webpage",
    source="tool",
    is_global=True,
    summarize=_summarize_webpage_content,
    schema={
        "type": "object",
        "properties": {
            "url": {"type": "string"},
            "title": {"type": "string"},
            "content": {"type": "string"},
            "description": {"type": ["string", "null"]},
            "author": {"type": ["string", "null"]},
            "published_date": {"type": ["string", "null"]},
            "word_count": {"type": ["integer", "null"]},
            "truncated": {"type": "boolean"}
        },
        "required": ["url", "title", "content"]
    }
))


# =============================================================================
# Stream Payloads
# =============================================================================

def _summarize_stream_list(data: Dict[str, Any]) -> str:
    total = data.get("total_streams", 0)
    return f"List of {total} research streams"


def _summarize_stream_details(data: Dict[str, Any]) -> str:
    name = data.get("stream_name", "Unknown")
    status = "active" if data.get("is_active") else "inactive"
    if len(name) > 40:
        name = name[:37] + "..."
    return f"Stream details: '{name}' ({status})"


# stream_list — list of research streams
register_payload_type(PayloadType(
    name="stream_list",
    description="List of research streams accessible to the user",
    source="tool",
    is_global=True,
    summarize=_summarize_stream_list,
    schema={
        "type": "object",
        "properties": {
            "total_streams": {"type": "integer"},
            "streams": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "stream_id": {"type": "integer"},
                        "stream_name": {"type": "string"},
                        "purpose": {"type": ["string", "null"]},
                        "scope": {"type": ["string", "null"]},
                        "is_active": {"type": "boolean"},
                        "report_count": {"type": "integer"},
                        "latest_report_date": {"type": ["string", "null"]},
                        "has_schedule": {"type": "boolean"}
                    }
                }
            }
        },
        "required": ["total_streams", "streams"]
    }
))

# stream_details — detailed config of a single stream
register_payload_type(PayloadType(
    name="stream_details",
    description="Detailed configuration of a specific research stream",
    source="tool",
    is_global=True,
    summarize=_summarize_stream_details,
    schema={
        "type": "object",
        "properties": {
            "stream_id": {"type": "integer"},
            "stream_name": {"type": "string"},
            "purpose": {"type": ["string", "null"]},
            "scope": {"type": ["string", "null"]},
            "is_active": {"type": "boolean"},
            "schedule_summary": {"type": ["string", "null"]},
            "last_execution_status": {"type": ["string", "null"]}
        },
        "required": ["stream_id", "stream_name"]
    }
))


# =============================================================================
# Stream Editing Payloads (LLM)
# =============================================================================

def _summarize_schema_proposal(data: Dict[str, Any]) -> str:
    changes = data.get("proposed_changes", {})
    fields = list(changes.keys())[:3]
    confidence = data.get("confidence", "unknown")
    if fields:
        return f"Schema proposal ({confidence} confidence) for: {', '.join(fields)}"
    return f"Schema proposal ({confidence} confidence)"


def _summarize_validation_results(data: Dict[str, Any]) -> str:
    errors = len(data.get("errors", []))
    warnings = len(data.get("warnings", []))
    suggestions = len(data.get("suggestions", []))
    parts = []
    if errors:
        parts.append(f"{errors} errors")
    if warnings:
        parts.append(f"{warnings} warnings")
    if suggestions:
        parts.append(f"{suggestions} suggestions")
    return f"Validation results: {', '.join(parts)}" if parts else "Validation results: no issues"


def _summarize_retrieval_proposal(data: Dict[str, Any]) -> str:
    update_type = data.get("update_type", "unknown")
    queries = len(data.get("queries", []))
    filters = len(data.get("filters", []))
    return f"Retrieval proposal ({update_type}): {queries} queries, {filters} filters"


def _summarize_query_suggestion(data: Dict[str, Any]) -> str:
    query = data.get("query_expression", "")
    if len(query) > 50:
        query = query[:47] + "..."
    return f"Query suggestion: {query}"


def _summarize_filter_suggestion(data: Dict[str, Any]) -> str:
    criteria = data.get("criteria", "")
    threshold = data.get("threshold", 0.7)
    if len(criteria) > 50:
        criteria = criteria[:47] + "..."
    return f"Filter suggestion (threshold {threshold}): {criteria}"


def _summarize_stream_suggestions(data: Dict[str, Any]) -> str:
    suggestions = data.get("suggestions", [])
    names = [s.get("suggested_name", "unnamed") for s in suggestions[:3]]
    return f"Stream suggestions: {', '.join(names)}" if names else "Stream suggestions"


def _summarize_portfolio_insights(data: Dict[str, Any]) -> str:
    summary = data.get("summary", {})
    total = summary.get("total_streams", 0)
    insights = len(data.get("insights", []))
    return f"Portfolio analysis: {total} streams, {insights} insights"


def _summarize_quick_setup(data: Dict[str, Any]) -> str:
    name = data.get("stream_name", "Unnamed stream")
    topics = len(data.get("suggested_topics", []))
    return f"Quick setup: '{name}' with {topics} topics"


def _summarize_stream_template(data: Dict[str, Any]) -> str:
    name = data.get("stream_name", "Unnamed stream")
    topics = len(data.get("topics", []))
    entities = len(data.get("entities", []))
    return f"Stream template: '{name}' with {topics} topics, {entities} entities"


def _summarize_topic_suggestions(data: Dict[str, Any]) -> str:
    suggestions = data.get("suggestions", [])
    names = [s.get("name", "unnamed") for s in suggestions[:3]]
    return f"Topic suggestions: {', '.join(names)}" if names else "Topic suggestions"


def _summarize_validation_feedback(data: Dict[str, Any]) -> str:
    issues = len(data.get("issues", []))
    strengths = len(data.get("strengths", []))
    return f"Validation feedback: {issues} issues, {strengths} strengths noted"


# schema_proposal — proposed changes to a stream schema
register_payload_type(PayloadType(
    name="schema_proposal",
    description="Proposed changes to a research stream schema",
    source="llm",
    is_global=False,
    parse_marker="SCHEMA_PROPOSAL:",
    parser=make_json_parser("schema_proposal"),
    summarize=_summarize_schema_proposal,
    llm_instructions="""
SCHEMA_PROPOSAL - Use when user asks for recommendations/proposals AND you have enough context:

SCHEMA_PROPOSAL: {
  "proposed_changes": {
    "stream_name": "value",
    "purpose": "value",
    "semantic_space.domain.name": "value",
    "semantic_space.domain.description": "value",
    "semantic_space.context.business_context": "value",
    "semantic_space.topics": [
      {
        "topic_id": "unique_id",
        "name": "Display Name",
        "description": "What this covers",
        "importance": "critical",
        "rationale": "Why this matters"
      }
    ]
  },
  "confidence": "high",
  "reasoning": "Based on our conversation, you mentioned X, Y, and Z, so I'm suggesting..."
}

Guidelines:
- Only propose when user asks for recommendations/proposals
- If you don't have enough information, ask clarifying questions instead
- You can propose some or all fields - only propose what you're confident about
- Use conversation history to inform your proposals
""",
    schema={
        "type": "object",
        "properties": {
            "proposed_changes": {"type": "object"},
            "confidence": {"type": "string"},
            "reasoning": {"type": "string"}
        }
    }
))

# validation_results — validation feedback for stream config
register_payload_type(PayloadType(
    name="validation_results",
    description="Validation feedback for a research stream configuration",
    source="llm",
    is_global=False,
    parse_marker="VALIDATION_RESULTS:",
    parser=make_json_parser("validation_results"),
    summarize=_summarize_validation_results,
    llm_instructions="""
VALIDATION_RESULTS - Use when analyzing current schema values for issues:

VALIDATION_RESULTS: {
  "errors": [
    {
      "field": "semantic_space.topics",
      "message": "No topics defined - at least 3 topics recommended",
      "severity": "error"
    }
  ],
  "warnings": [
    {
      "field": "purpose",
      "message": "Purpose is quite generic - consider being more specific",
      "severity": "warning"
    }
  ],
  "suggestions": [
    {
      "field": "semantic_space.domain.description",
      "message": "Consider adding information about the therapeutic area",
      "severity": "info"
    }
  ]
}

Use this when:
- User asks "is this good?" or "what's missing?"
- User requests validation or review
- You notice obvious gaps or issues
""",
    schema={
        "type": "object",
        "properties": {
            "errors": {"type": "array"},
            "warnings": {"type": "array"},
            "suggestions": {"type": "array"}
        }
    }
))

# retrieval_proposal — proposed changes to retrieval queries/filters
register_payload_type(PayloadType(
    name="retrieval_proposal",
    description="Proposed changes to retrieval queries and filters",
    source="llm",
    is_global=False,
    parse_marker="RETRIEVAL_PROPOSAL:",
    parser=make_json_parser("retrieval_proposal"),
    summarize=_summarize_retrieval_proposal,
    llm_instructions="""
RETRIEVAL_PROPOSAL - Use when user asks for help with search queries or filters.

You can propose changes to QUERIES ONLY, FILTERS ONLY, or BOTH depending on what the user asks for.

RETRIEVAL_PROPOSAL: {
  "update_type": "queries_only" | "filters_only" | "both",
  "target_ids": ["q1", "c1"],

  "queries": [
    {
      "query_id": "q1",
      "name": "Query name",
      "query_string": "PubMed search string",
      "covered_topics": ["topic_1", "topic_2"],
      "rationale": "Why this query works"
    }
  ],

  "filters": [
    {
      "target_id": "q1",
      "semantic_filter": {
        "enabled": true,
        "criteria": "Include articles that specifically discuss X in the context of Y.",
        "threshold": 0.7
      }
    }
  ],

  "changes_summary": "Brief description of what changed",
  "reasoning": "Why these changes will improve results"
}
""",
    schema={
        "type": "object",
        "properties": {
            "update_type": {"type": "string"},
            "queries": {"type": "array"},
            "filters": {"type": "array"},
            "changes_summary": {"type": "string"},
            "reasoning": {"type": "string"}
        }
    }
))

# query_suggestion — suggested PubMed query
register_payload_type(PayloadType(
    name="query_suggestion",
    description="Suggested PubMed query",
    source="llm",
    is_global=False,
    parse_marker="QUERY_SUGGESTION:",
    parser=make_json_parser("query_suggestion"),
    summarize=_summarize_query_suggestion,
    llm_instructions="""
QUERY_SUGGESTION - Use when user asks for help writing or improving PubMed queries.

When you output this payload, it will appear in a side panel for the user to review.
If they click "Accept", the query will be automatically executed and results will load.
Tell the user: "I've prepared a query for you - you can see it in the panel on the right. Click 'Use This Query' to run the search."

IMPORTANT: Date filtering is done via separate fields, NOT in the query_expression itself.
Do NOT add date ranges like "2020:2024[dp]" to the query - use start_date/end_date instead.

QUERY_SUGGESTION: {
  "query_expression": "The PubMed search query (NO date filters here)",
  "start_date": "YYYY-MM-DD or null (e.g., '2020-01-01')",
  "end_date": "YYYY-MM-DD or null (e.g., '2024-12-31')",
  "date_type": "publication or entry (default: publication)",
  "explanation": "Plain English explanation of what this query searches for",
  "syntax_notes": ["Explanation of specific syntax elements used"],
  "expected_results": "What types of articles this query should find",
  "alternatives": [
    {
      "query_expression": "Alternative query option",
      "trade_off": "What this alternative gains/loses vs the main suggestion"
    }
  ]
}

Example with date filter:
QUERY_SUGGESTION: {
  "query_expression": "CRISPR[MeSH] AND gene therapy[MeSH]",
  "start_date": "2020-01-01",
  "end_date": null,
  "date_type": "publication",
  "explanation": "Searches for articles about CRISPR gene therapy published since 2020",
  ...
}
""",
    schema={
        "type": "object",
        "properties": {
            "query_expression": {"type": "string"},
            "start_date": {"type": ["string", "null"]},
            "end_date": {"type": ["string", "null"]},
            "date_type": {"type": "string", "enum": ["publication", "entry"]},
            "explanation": {"type": "string"},
            "syntax_notes": {"type": "array"},
            "expected_results": {"type": "string"},
            "alternatives": {"type": "array"}
        }
    }
))

# filter_suggestion — suggested semantic filter criteria
register_payload_type(PayloadType(
    name="filter_suggestion",
    description="Suggested semantic filter criteria",
    source="llm",
    is_global=False,
    parse_marker="FILTER_SUGGESTION:",
    parser=make_json_parser("filter_suggestion"),
    summarize=_summarize_filter_suggestion,
    llm_instructions="""
FILTER_SUGGESTION - Use when user asks for help with semantic filter criteria:

FILTER_SUGGESTION: {
  "criteria": "The semantic filter criteria text",
  "threshold": 0.7,
  "explanation": "What this filter looks for and why",
  "examples": {
    "would_pass": ["Example of an article that should pass this filter"],
    "would_fail": ["Example of an article that should NOT pass this filter"]
  },
  "threshold_guidance": "Explanation of the threshold choice"
}
""",
    schema={
        "type": "object",
        "properties": {
            "criteria": {"type": "string"},
            "threshold": {"type": "number"},
            "explanation": {"type": "string"},
            "examples": {"type": "object"},
            "threshold_guidance": {"type": "string"}
        }
    }
))

# stream_suggestions — suggested new research streams
register_payload_type(PayloadType(
    name="stream_suggestions",
    description="Suggested new research streams",
    source="llm",
    is_global=False,
    parse_marker="STREAM_SUGGESTIONS:",
    parser=make_json_parser("stream_suggestions"),
    summarize=_summarize_stream_suggestions,
    llm_instructions="""
STREAM_SUGGESTIONS - Suggest new research streams based on user's needs:

STREAM_SUGGESTIONS: {
  "suggestions": [
    {
      "suggested_name": "Clinical Trials in Oncology",
      "rationale": "Based on your existing cardiovascular stream, expanding to oncology would provide competitive intelligence on parallel therapeutic approaches",
      "domain": "Cancer Research",
      "key_topics": ["Immunotherapy", "CAR-T", "Checkpoint Inhibitors"],
      "business_value": "Track emerging competitive threats in adjacent therapeutic areas",
      "confidence": "high"
    }
  ],
  "reasoning": "Analysis based on your current portfolio and typical research patterns"
}

Use this when:
- User asks "what streams should I create?"
- User wants to expand their monitoring coverage
- User describes a need or gap in their current streams
""",
    schema={
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "suggested_name": {"type": "string"},
                        "rationale": {"type": "string"},
                        "domain": {"type": "string"},
                        "key_topics": {"type": "array", "items": {"type": "string"}},
                        "business_value": {"type": "string"},
                        "confidence": {"type": "string"}
                    }
                }
            },
            "reasoning": {"type": "string"}
        }
    }
))

# portfolio_insights — analysis of user's stream portfolio
register_payload_type(PayloadType(
    name="portfolio_insights",
    description="Analysis of user's current stream portfolio",
    source="llm",
    is_global=False,
    parse_marker="PORTFOLIO_INSIGHTS:",
    parser=make_json_parser("portfolio_insights"),
    summarize=_summarize_portfolio_insights,
    llm_instructions="""
PORTFOLIO_INSIGHTS - Analyze the user's current stream portfolio:

PORTFOLIO_INSIGHTS: {
  "summary": {
    "total_streams": 5,
    "active_streams": 4,
    "coverage_areas": ["Cardiovascular", "Neurology", "Oncology"]
  },
  "insights": [
    {
      "type": "gap",
      "title": "No coverage of regulatory developments",
      "description": "Your streams focus on clinical research but don't monitor FDA approvals or regulatory changes",
      "severity": "medium",
      "recommendation": "Consider adding a regulatory intelligence stream"
    },
    {
      "type": "overlap",
      "title": "Overlapping topics in streams 2 and 4",
      "description": "Both 'Cardiovascular Drugs' and 'Heart Failure Therapeutics' monitor beta blockers",
      "severity": "low",
      "recommendation": "Consider consolidating or clarifying boundaries"
    }
  ]
}

Use this when:
- User asks to analyze their streams
- User wants to optimize their portfolio
- User asks "what's missing?" or "any problems?"
""",
    schema={
        "type": "object",
        "properties": {
            "summary": {
                "type": "object",
                "properties": {
                    "total_streams": {"type": "integer"},
                    "active_streams": {"type": "integer"},
                    "coverage_areas": {"type": "array", "items": {"type": "string"}}
                }
            },
            "insights": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "type": {"type": "string"},
                        "title": {"type": "string"},
                        "description": {"type": "string"},
                        "severity": {"type": "string"},
                        "recommendation": {"type": "string"}
                    }
                }
            }
        }
    }
))

# quick_setup — pre-configured stream setup for quick creation
register_payload_type(PayloadType(
    name="quick_setup",
    description="Pre-configured stream setup for quick creation",
    source="llm",
    is_global=False,
    parse_marker="QUICK_SETUP:",
    parser=make_json_parser("quick_setup"),
    summarize=_summarize_quick_setup,
    llm_instructions="""
QUICK_SETUP - Provide a pre-configured stream setup for quick creation:

QUICK_SETUP: {
  "stream_name": "Alzheimer's Disease Research",
  "purpose": "Monitor emerging treatments and biomarker research for competitive intelligence",
  "domain": {
    "name": "Neurodegenerative Disease - Alzheimer's",
    "description": "Research focused on Alzheimer's disease pathology, diagnostics, and therapeutics"
  },
  "suggested_topics": [
    {
      "topic_id": "amyloid_targeting",
      "name": "Amyloid-Beta Targeting Therapies",
      "description": "Drugs and treatments targeting amyloid plaques",
      "importance": "critical"
    },
    {
      "topic_id": "biomarkers",
      "name": "Early Detection Biomarkers",
      "description": "Blood-based and imaging biomarkers for early diagnosis",
      "importance": "important"
    }
  ],
  "reasoning": "Based on your request to track Alzheimer's research, this configuration covers key therapeutic and diagnostic areas"
}

Use this when:
- User says "create a stream for X" where X is a specific topic
- User wants help setting up a new stream quickly
- User describes what they want to monitor and asks for a starting point
""",
    schema={
        "type": "object",
        "properties": {
            "stream_name": {"type": "string"},
            "purpose": {"type": "string"},
            "domain": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"}
                }
            },
            "suggested_topics": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "topic_id": {"type": "string"},
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "importance": {"type": "string"}
                    }
                }
            },
            "reasoning": {"type": "string"}
        }
    }
))

# stream_template — complete stream configuration template
register_payload_type(PayloadType(
    name="stream_template",
    description="Complete research stream configuration template",
    source="llm",
    is_global=False,
    parse_marker="STREAM_TEMPLATE:",
    parser=make_json_parser("stream_template"),
    summarize=_summarize_stream_template,
    llm_instructions="""
STREAM_TEMPLATE - Suggest a complete research stream configuration:

STREAM_TEMPLATE: {
  "stream_name": "string",
  "domain": {
    "name": "string",
    "description": "string"
  },
  "topics": [
    {
      "name": "string",
      "description": "string",
      "importance": "high" | "medium" | "low",
      "rationale": "string (why this topic is important)"
    }
  ],
  "entities": [
    {
      "name": "string",
      "type": "disease" | "substance" | "chemical" | "organization" | "regulation" | "standard" | "methodology" | "biomarker" | "geographic" | "population" | "drug" | "gene" | "protein" | "pathway" | "therapy" | "device",
      "description": "string",
      "importance": "high" | "medium" | "low"
    }
  ],
  "business_context": "string",
  "confidence": "high" | "medium" | "low",
  "reasoning": "string"
}

Use this when:
- User asks "help me create a stream for X"
- User describes what they want to monitor
- User asks "what would a good stream look like for X"
- User wants a complete setup suggestion
""",
    schema={
        "type": "object",
        "properties": {
            "stream_name": {"type": "string"},
            "domain": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "description": {"type": "string"}
                }
            },
            "topics": {"type": "array"},
            "entities": {"type": "array"},
            "business_context": {"type": "string"},
            "confidence": {"type": "string"},
            "reasoning": {"type": "string"}
        }
    }
))

# topic_suggestions — suggested topics for a stream
register_payload_type(PayloadType(
    name="topic_suggestions",
    description="Suggested topics for a research stream",
    source="llm",
    is_global=False,
    parse_marker="TOPIC_SUGGESTIONS:",
    parser=make_json_parser("topic_suggestions"),
    summarize=_summarize_topic_suggestions,
    llm_instructions="""
TOPIC_SUGGESTIONS - Suggest topics for the research stream:

TOPIC_SUGGESTIONS: {
  "suggestions": [
    {
      "name": "string",
      "description": "string",
      "importance": "high" | "medium" | "low",
      "rationale": "string"
    }
  ],
  "based_on": "string describing what the suggestions are based on"
}

Use this when:
- User asks "what topics should I include"
- User mentions a domain and needs topic ideas
- User asks "what else should I cover"
- User describes business context and needs relevant topics
""",
    schema={
        "type": "object",
        "properties": {
            "suggestions": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "name": {"type": "string"},
                        "description": {"type": "string"},
                        "importance": {"type": "string"},
                        "rationale": {"type": "string"}
                    }
                }
            },
            "based_on": {"type": "string"}
        }
    }
))

# validation_feedback — validation/improvement suggestions for stream config
register_payload_type(PayloadType(
    name="validation_feedback",
    description="Validation and improvement suggestions for stream configuration",
    source="llm",
    is_global=False,
    parse_marker="VALIDATION_FEEDBACK:",
    parser=make_json_parser("validation_feedback"),
    summarize=_summarize_validation_feedback,
    llm_instructions="""
VALIDATION_FEEDBACK - Provide validation and improvement suggestions:

VALIDATION_FEEDBACK: {
  "issues": [
    {
      "field": "string (field path like 'stream_name' or 'domain.description')",
      "severity": "error" | "warning" | "suggestion",
      "message": "string describing the issue",
      "suggestion": "string with improvement recommendation"
    }
  ],
  "strengths": [
    "string describing what's good about the current setup"
  ],
  "overall_assessment": "string with overall quality assessment"
}

Use this when:
- User asks "does this look good"
- User asks "what am I missing"
- User wants feedback on their configuration
- User asks "how can I improve this"
- User wants validation before submitting
""",
    schema={
        "type": "object",
        "properties": {
            "issues": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "field": {"type": "string"},
                        "severity": {"type": "string"},
                        "message": {"type": "string"},
                        "suggestion": {"type": "string"}
                    }
                }
            },
            "strengths": {"type": "array", "items": {"type": "string"}},
            "overall_assessment": {"type": "string"}
        }
    }
))


# =============================================================================
# Tablizer / TrialScout Payloads
# =============================================================================

def _summarize_ai_column_suggestion(data: Dict[str, Any]) -> str:
    name = data.get("name", "Unnamed column")
    col_type = data.get("type", "unknown")
    return f"AI column suggestion: '{name}' ({col_type})"


# ai_column_suggestion — AI column for filtering/categorizing results
register_payload_type(PayloadType(
    name="ai_column_suggestion",
    description="Suggested AI column for filtering or categorizing results",
    source="llm",
    is_global=False,
    parse_marker="AI_COLUMN:",
    parser=make_json_parser("ai_column_suggestion"),
    summarize=_summarize_ai_column_suggestion,
    llm_instructions="""
AI_COLUMN - Use when user wants to filter or categorize results with an AI-powered column.

When you output this payload, it will appear in a side panel for the user to review.
If they click "Add Column", the AI column will be created and start processing their articles.
Tell the user: "I've prepared an AI column for you - you can see the details in the panel on the right. Click 'Add Column' to create it."

AI_COLUMN: {
  "name": "Column display name",
  "criteria": "The criteria prompt for the AI to evaluate each item",
  "type": "boolean",
  "explanation": "What this column will help identify and how to use it"
}

Guidelines:
- type "boolean" = yes/no filtering (enables quick filter toggles) - best for narrowing results
- type "text" = extract or summarize information from each article
- Write clear, specific criteria that the AI can evaluate for each article
- The explanation should tell the user what the column does and how to use the results

Example:
User: "I only want articles about clinical trials"
AI_COLUMN: {
  "name": "Is Clinical Trial",
  "criteria": "Is this article about a clinical trial? Look for trial registration, randomized/placebo-controlled design, or clinical trial phases.",
  "type": "boolean",
  "explanation": "Identifies clinical trial articles. After adding, filter to 'Yes' to see only trials."
}

Example for extraction:
User: "Add a column showing the main drug studied"
AI_COLUMN: {
  "name": "Main Drug",
  "criteria": "What is the primary drug or compound being studied in this article? Provide the drug name or 'N/A' if not applicable.",
  "type": "text",
  "explanation": "Extracts the main drug or compound studied, making it easy to scan and compare across articles."
}
""",
    schema={
        "type": "object",
        "properties": {
            "name": {"type": "string", "description": "Display name for the column"},
            "criteria": {"type": "string", "description": "Criteria prompt for AI evaluation"},
            "type": {"type": "string", "enum": ["boolean", "text"], "description": "Output type"},
            "explanation": {"type": "string", "description": "Explanation for the user"}
        },
        "required": ["name", "criteria", "type"]
    }
))


# =============================================================================
# Report & Article Payloads
# =============================================================================

def _summarize_report_list(data: Dict[str, Any]) -> str:
    total = data.get("total_reports", 0)
    return f"List of {total} reports for the stream"


def _summarize_report_summary(data: Dict[str, Any]) -> str:
    name = data.get("report_name", "Unknown")
    article_count = data.get("article_count", 0)
    if len(name) > 40:
        name = name[:37] + "..."
    return f"Report summary: '{name}' ({article_count} articles)"


def _summarize_report_articles(data: Dict[str, Any]) -> str:
    name = data.get("report_name", "Unknown")
    total = data.get("total_articles", 0)
    mode = data.get("mode", "condensed")
    if len(name) > 30:
        name = name[:27] + "..."
    return f"{total} articles from '{name}' ({mode})"


def _summarize_article_search_results(data: Dict[str, Any]) -> str:
    query = data.get("query", "unknown")
    total = data.get("total_results", 0)
    if len(query) > 30:
        query = query[:27] + "..."
    return f"Article search for '{query}': {total} results"


def _summarize_article_details(data: Dict[str, Any]) -> str:
    pmid = data.get("pmid", "unknown")
    title = data.get("title", "Untitled")
    if len(title) > 50:
        title = title[:47] + "..."
    return f"Article PMID:{pmid} - {title}"


def _summarize_article_notes(data: Dict[str, Any]) -> str:
    article_id = data.get("article_id", "unknown")
    total = data.get("total_notes", 0)
    return f"{total} notes for article {article_id}"


def _summarize_report_comparison(data: Dict[str, Any]) -> str:
    only_1 = data.get("only_in_report_1", 0)
    only_2 = data.get("only_in_report_2", 0)
    return f"Comparison: {only_2} new, {only_1} removed"


def _summarize_starred_articles(data: Dict[str, Any]) -> str:
    total = data.get("total_starred", 0)
    return f"{total} starred articles in stream"


# report_list — list of reports for a stream
register_payload_type(PayloadType(
    name="report_list",
    description="List of reports for a research stream",
    source="tool",
    is_global=True,
    summarize=_summarize_report_list,
    schema={
        "type": "object",
        "properties": {
            "stream_id": {"type": "integer"},
            "total_reports": {"type": "integer"},
            "reports": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "report_id": {"type": "integer"},
                        "report_name": {"type": "string"},
                        "report_date": {"type": ["string", "null"]},
                        "has_highlights": {"type": "boolean"},
                        "has_thematic_analysis": {"type": "boolean"}
                    }
                }
            }
        }
    }
))

# report_summary — summary, highlights, and analysis for a report
register_payload_type(PayloadType(
    name="report_summary",
    description="Summary, highlights, and analysis for a report",
    source="tool",
    is_global=True,
    summarize=_summarize_report_summary,
    schema={
        "type": "object",
        "properties": {
            "report_id": {"type": "integer"},
            "report_name": {"type": "string"},
            "report_date": {"type": ["string", "null"]},
            "article_count": {"type": "integer"},
            "key_highlights": {"type": ["string", "null"]},
            "thematic_analysis": {"type": ["string", "null"]},
            "executive_summary": {"type": ["string", "null"]},
            "category_summaries": {"type": "array"}
        }
    }
))

# report_articles — list of articles in a report
register_payload_type(PayloadType(
    name="report_articles",
    description="List of articles in a report",
    source="tool",
    is_global=True,
    summarize=_summarize_report_articles,
    schema={
        "type": "object",
        "properties": {
            "report_id": {"type": "integer"},
            "report_name": {"type": "string"},
            "total_articles": {"type": "integer"},
            "articles": {"type": "array"},
            "mode": {"type": "string"}
        }
    }
))

# article_search_results — search results for articles across reports
register_payload_type(PayloadType(
    name="article_search_results",
    description="Search results for articles across reports",
    source="tool",
    is_global=True,
    summarize=_summarize_article_search_results,
    schema={
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "total_results": {"type": "integer"},
            "articles": {"type": "array"}
        }
    }
))

# article_details — full details of a specific article
register_payload_type(PayloadType(
    name="article_details",
    description="Full details of a specific article",
    source="tool",
    is_global=True,
    summarize=_summarize_article_details,
    schema={
        "type": "object",
        "properties": {
            "article_id": {"type": "integer"},
            "pmid": {"type": "string"},
            "title": {"type": "string"},
            "authors": {"type": "string"},
            "abstract": {"type": ["string", "null"]},
            "journal": {"type": "string"},
            "publication_date": {"type": ["string", "integer", "null"]},
            "relevance_score": {"type": ["number", "null"]},
            "is_starred": {"type": ["boolean", "null"]},
            "notes_count": {"type": "integer"}
        }
    }
))

# article_notes — notes for a specific article
register_payload_type(PayloadType(
    name="article_notes",
    description="Notes for a specific article",
    source="tool",
    is_global=True,
    summarize=_summarize_article_notes,
    schema={
        "type": "object",
        "properties": {
            "article_id": {"type": "integer"},
            "report_id": {"type": "integer"},
            "total_notes": {"type": "integer"},
            "notes": {"type": "array"}
        }
    }
))

# report_comparison — comparison between two reports
register_payload_type(PayloadType(
    name="report_comparison",
    description="Comparison between two reports",
    source="tool",
    is_global=True,
    summarize=_summarize_report_comparison,
    schema={
        "type": "object",
        "properties": {
            "report_1": {"type": "object"},
            "report_2": {"type": "object"},
            "only_in_report_1": {"type": "integer"},
            "only_in_report_2": {"type": "integer"},
            "in_both": {"type": "integer"}
        }
    }
))

# starred_articles — starred articles across a stream's reports
register_payload_type(PayloadType(
    name="starred_articles",
    description="Starred articles across a stream's reports",
    source="tool",
    is_global=True,
    summarize=_summarize_starred_articles,
    schema={
        "type": "object",
        "properties": {
            "stream_id": {"type": "integer"},
            "total_starred": {"type": "integer"},
            "articles": {"type": "array"}
        }
    }
))


# =============================================================================
# Artifact Payloads (Bug/Feature/Task Tracker)
# =============================================================================

def _summarize_artifact_list(data: Dict[str, Any]) -> str:
    total = data.get("total", 0)
    return f"List of {total} artifacts (bugs/features/tasks)"


def _summarize_artifact_details(data: Dict[str, Any]) -> str:
    artifact_id = data.get("id", "?")
    title = data.get("title", "Untitled")
    atype = data.get("type", "unknown")
    status = data.get("status", "unknown")
    if len(title) > 40:
        title = title[:37] + "..."
    return f"[{atype.upper()}] #{artifact_id} {title} ({status})"


def _summarize_artifact_changes(data: Dict[str, Any]) -> str:
    cat_ops = data.get("category_operations", [])
    changes = data.get("changes", [])
    creates = len([c for c in changes if c.get("action") == "create"])
    updates = len([c for c in changes if c.get("action") == "update"])
    deletes = len([c for c in changes if c.get("action") == "delete"])
    parts = []
    if cat_ops:
        parts.append(f"{len(cat_ops)} category ops")
    if creates:
        parts.append(f"{creates} create")
    if updates:
        parts.append(f"{updates} update")
    if deletes:
        parts.append(f"{deletes} delete")
    return f"Artifact changes proposal: {', '.join(parts) or 'empty'}"


# artifact_list — list of bugs, features, and tasks
register_payload_type(PayloadType(
    name="artifact_list",
    description="List of bugs, feature requests, and tasks",
    source="tool",
    is_global=True,
    summarize=_summarize_artifact_list,
    schema={
        "type": "object",
        "properties": {
            "total": {"type": "integer"},
            "artifacts": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "integer"},
                        "title": {"type": "string"},
                        "description": {"type": ["string", "null"]},
                        "type": {"type": "string", "enum": ["bug", "feature", "task"]},
                        "status": {"type": "string", "enum": ["new", "open", "in_progress", "icebox", "closed"]},
                        "priority": {"type": ["string", "null"], "enum": ["urgent", "high", "medium", "low", None]},
                        "area": {"type": ["string", "null"]},
                        "category": {"type": ["string", "null"]},
                        "created_by": {"type": "integer"},
                        "created_by_name": {"type": ["string", "null"]},
                        "updated_by": {"type": ["integer", "null"]},
                        "updated_by_name": {"type": ["string", "null"]},
                        "created_at": {"type": ["string", "null"]},
                        "updated_at": {"type": ["string", "null"]}
                    }
                }
            }
        }
    }
))

# artifact_details — details of a single bug, feature, or task
register_payload_type(PayloadType(
    name="artifact_details",
    description="Details of a single bug, feature request, or task",
    source="tool",
    is_global=True,
    summarize=_summarize_artifact_details,
    schema={
        "type": "object",
        "properties": {
            "id": {"type": "integer"},
            "title": {"type": "string"},
            "description": {"type": ["string", "null"]},
            "type": {"type": "string", "enum": ["bug", "feature", "task"]},
            "status": {"type": "string", "enum": ["new", "open", "in_progress", "icebox", "closed"]},
            "priority": {"type": ["string", "null"], "enum": ["urgent", "high", "medium", "low", None]},
            "area": {"type": ["string", "null"]},
            "category": {"type": ["string", "null"]},
            "created_by": {"type": "integer"},
            "created_by_name": {"type": ["string", "null"]},
            "updated_by": {"type": ["integer", "null"]},
            "updated_by_name": {"type": ["string", "null"]},
            "created_at": {"type": ["string", "null"]},
            "updated_at": {"type": ["string", "null"]}
        }
    }
))

# artifact_changes — proposed bulk changes to artifacts and categories (LLM)
register_payload_type(PayloadType(
    name="artifact_changes",
    description="Proposed bulk changes to artifacts and categories (create/update/delete)",
    source="llm",
    is_global=False,
    parse_marker="ARTIFACT_CHANGES:",
    parser=make_json_parser("artifact_changes"),
    summarize=_summarize_artifact_changes,
    llm_instructions="""
ARTIFACT_CHANGES - Your PRIMARY method for making any changes to artifacts or categories.
THIS IS NOT A TOOL. Write the marker and JSON as plain text in your response message.

ALWAYS use this to propose changes so the user can review them before they are applied.
The user sees a card with checkboxes for each change and can accept, reject, or deselect individual items.

Only skip this for trivially simple, single-item operations the user explicitly requested (e.g., "delete #42").
When in doubt, always propose via ARTIFACT_CHANGES.

IMPORTANT: category_operations are applied FIRST (before artifact changes), so new categories will exist
before artifacts try to use them. The UI enforces this — artifact changes that depend on a new category
are disabled until that category operation is checked.

To use: write the marker followed by JSON as text in your response, like this:

ARTIFACT_CHANGES: {
  "category_operations": [
    {"action": "create", "name": "New Category Name"},
    {"action": "rename", "id": 3, "old_name": "Old Name", "new_name": "Better Name"},
    {"action": "delete", "id": 5, "name": "Obsolete Category"}
  ],
  "changes": [
    {
      "action": "create",
      "title": "New artifact title",
      "artifact_type": "bug",
      "status": "new",
      "priority": "high",
      "area": "login_auth",
      "category": "New Category Name",
      "description": "Optional description"
    },
    {
      "action": "update",
      "id": 42,
      "title": "Updated title (optional)",
      "status": "icebox",
      "category": "Better Name",
      "artifact_type": "bug",
      "description": "Updated description (optional)"
    },
    {
      "action": "delete",
      "id": 15,
      "title_hint": "Title for display only"
    }
  ],
  "reasoning": "Explain why you're proposing these changes"
}

Guidelines:
- This is the preferred way to make changes — always propose, let the user decide
- Include reasoning to explain your proposal
- If artifact changes need NEW categories, include them in category_operations
- For updates, only include fields that are actually changing
- Valid statuses: new, open, in_progress, icebox, closed
  - "new" = just added, needs triage
  - "open" = triaged and accepted for work
  - "in_progress" = actively being worked on
  - "icebox" = explicitly shelved / not now
  - "closed" = done/resolved
- When creating new artifacts, default to status "new" unless the user indicates otherwise
- Valid types: bug, feature, task
- Valid priorities: urgent, high, medium, low (optional)
- Valid areas: login_auth, user_prefs, streams, reports, articles, notes, users, organizations, data_sources, chat_system, help_content, system_ops (optional)
- category_operations is optional — omit it if no category changes are needed
""",
    schema={
        "type": "object",
        "properties": {
            "category_operations": {
                "type": "array",
                "description": "Category changes applied before artifact changes",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["create", "rename", "delete"]},
                        "id": {"type": "integer", "description": "Category ID (for rename/delete)"},
                        "name": {"type": "string", "description": "Category name (for create/delete display)"},
                        "old_name": {"type": "string", "description": "Old name (for rename display)"},
                        "new_name": {"type": "string", "description": "New name (for rename)"}
                    },
                    "required": ["action"]
                }
            },
            "changes": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "action": {"type": "string", "enum": ["create", "update", "delete"]},
                        "id": {"type": "integer"},
                        "title": {"type": "string"},
                        "title_hint": {"type": "string"},
                        "artifact_type": {"type": "string", "enum": ["bug", "feature", "task"]},
                        "status": {"type": "string", "enum": ["new", "open", "in_progress", "icebox", "closed"]},
                        "priority": {"type": "string", "enum": ["urgent", "high", "medium", "low"]},
                        "area": {"type": "string", "enum": ["login_auth", "user_prefs", "streams", "reports", "articles", "notes", "users", "organizations", "data_sources", "chat_system", "help_content", "system_ops"]},
                        "category": {"type": "string"},
                        "description": {"type": "string"}
                    },
                    "required": ["action"]
                }
            },
            "reasoning": {"type": "string"}
        },
        "required": ["changes"]
    }
))


# =============================================================================
# Deep Research Payloads
# =============================================================================

def _summarize_deep_research_result(data: Dict[str, Any]) -> str:
    status = data.get("status", "unknown")
    iterations = data.get("iterations_used", 0)
    sources = len(data.get("sources", []))
    return f"Deep research: {status} ({iterations} iterations, {sources} sources)"


# deep_research_result — synthesized answer with citations from deep research
register_payload_type(PayloadType(
    name="deep_research_result",
    description="Result from deep research tool with synthesized answer and citations",
    source="tool",
    is_global=True,
    summarize=_summarize_deep_research_result,
    schema={
        "type": "object",
        "properties": {
            "trace_id": {"type": "string", "description": "Trace ID for research execution"},
            "question": {"type": "string", "description": "Original research question"},
            "refined_question": {"type": "string", "description": "Refined/clarified version of the question"},
            "answer": {"type": "string", "description": "Synthesized answer with inline citations"},
            "sources": {
                "type": "array",
                "description": "Sources used in the answer",
                "items": {
                    "type": "object",
                    "properties": {
                        "id": {"type": "string"},
                        "type": {"type": "string", "enum": ["pubmed", "web"]},
                        "title": {"type": "string"},
                        "url": {"type": "string"},
                        "snippet": {"type": "string"}
                    }
                }
            },
            "checklist_coverage": {
                "type": "object",
                "description": "Coverage of checklist items",
                "properties": {
                    "satisfied": {"type": "array", "items": {"type": "string"}},
                    "partial": {"type": "array", "items": {"type": "string"}},
                    "gaps": {"type": "array", "items": {"type": "string"}}
                }
            },
            "iterations_used": {"type": "integer", "description": "Number of research iterations performed"},
            "status": {"type": "string", "enum": ["completed", "max_iterations_reached", "error"]},
            "limitations": {"type": "array", "items": {"type": "string"}, "description": "Known limitations"},
            "evaluation": {
                "type": "object",
                "description": "Evaluation details from the research process",
                "properties": {
                    "final_confidence": {"type": "number", "description": "Final confidence score (0.0 to 1.0)"},
                    "used_second_opinion": {"type": "boolean", "description": "Whether a second opinion was requested"}
                }
            }
        },
        "required": ["trace_id", "answer", "sources", "status"]
    }
))
