from typing import List, Dict, Any, Callable, TypeVar, Iterable, Optional, Union
from datetime import datetime
from dataclasses import dataclass

from schemas.canonical_types import CanonicalEmail

T = TypeVar('T')
K = TypeVar('K') 
V = TypeVar('V')

# Use the canonical email model instead of custom dataclass
Email = CanonicalEmail

@dataclass
class ExtractionResult:
    item_id: str
    original_item: Any
    extraction: Dict[str, Any]

@dataclass
class GroupedResult:
    group_key: str
    group_value: Any
    aggregated_data: Dict[str, Any]
    items: List[Any] = None  # Optional: keep original items

# Method 1: Email Search (aligned with tool registry)
def email_search(
    query: str,
    folder: str = "INBOX",
    date_range: Optional[Dict[str, str]] = None,
    limit: int = 100
) -> List[Email]:
    """
    Search and retrieve emails from Gmail with filtering capabilities
    
    Args:
        query: Gmail search query (e.g., 'from:user@example.com label:important')
        folder: Gmail folder/label to search in
        date_range: Optional dict with 'start_date' and 'end_date'
        limit: Maximum number of emails to retrieve
    
    Returns:
        List of Email objects
    """
    pass

# Method 2: Extract (enhanced to handle collections)
def extract(
    items: Union[Any, List[Any]],
    extraction_function: str,
    extraction_fields: List[str],
    batch_process: bool = True
) -> List[ExtractionResult]:
    """
    Extract specific information from items using extraction functions
    
    Args:
        items: Single item or list of items to process
        extraction_function: Function/prompt describing what to extract
        extraction_fields: List of field names to extract
        batch_process: Whether to process as batch or individual items
    
    Returns:
        List of ExtractionResult objects with extracted data
    """
    # Normalize input to list
    if not isinstance(items, list):
        items = [items]
    
    results = []
    for item in items:
        # Extract logic here
        extraction = {}  # Placeholder for actual extraction
        results.append(ExtractionResult(
            item_id=getattr(item, 'id', str(hash(str(item)))),
            original_item=item,
            extraction=extraction
        ))
    
    return results

# Method 3: Group Reduce (enhanced with metadata)
def group_reduce(
    items: Iterable[T],
    key_func: Callable[[T], K],
    reduce_func: Callable[[List[T]], V],
    sort_by: str = "group_key",
    sort_direction: str = "asc",
    include_items: bool = False
) -> List[GroupedResult]:
    """
    Group objects by rules and apply reduce functions to create aggregated results
    
    Args:
        items: Iterable of objects to group
        key_func: Function to extract grouping key from each item
        reduce_func: Function to aggregate items in each group
        sort_by: Field to sort results by
        sort_direction: 'asc' or 'desc'
        include_items: Whether to include original items in results
    
    Returns:
        List of GroupedResult objects
    """
    # Group items
    groups = {}
    for item in items:
        key = key_func(item)
        if key not in groups:
            groups[key] = []
        groups[key].append(item)
    
    # Apply reduce function and create results
    results = []
    for group_key, group_items in groups.items():
        aggregated_data = reduce_func(group_items)
        
        result = GroupedResult(
            group_key=str(group_key),
            group_value=group_key,
            aggregated_data=aggregated_data,
            items=group_items if include_items else None
        )
        results.append(result)
    
    # Sort results
    reverse = sort_direction == "desc"
    if sort_by == "group_key":
        results.sort(key=lambda x: x.group_key, reverse=reverse)
    elif sort_by == "group_value":
        results.sort(key=lambda x: x.group_value, reverse=reverse)
    
    return results

# Method 4: Summarize (aligned with tool registry)
def summarize(
    content: Any,
    summarization_mandate: str,
    summary_type: str = "executive",
    target_length: str = "medium",
    focus_areas: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Create summaries of content based on specific summarization mandates
    
    Args:
        content: Content to summarize (text, structured data, or mixed)
        summarization_mandate: Instructions for how to summarize
        summary_type: Type of summary ('executive', 'detailed', 'bullet_points', etc.)
        target_length: Target length ('brief', 'medium', 'comprehensive')
        focus_areas: Specific areas to focus on
    
    Returns:
        Dictionary with summary content and metadata
    """
    return {
        "title": "",
        "content": "",
        "key_points": [],
        "recommendations": [],
        "metadata": {
            "summary_type": summary_type,
            "word_count": 0,
            "created_at": datetime.utcnow().isoformat()
        }
    }

# Example Usage Functions for your workflow

def extract_highlights_from_emails(emails: List[Email]) -> List[ExtractionResult]:
    """Step 2: Extract highlights from emails"""
    return extract(
        items=emails,
        extraction_function="Extract key highlights, sentiment, and priority from email content",
        extraction_fields=["highlights", "sentiment", "priority", "key_topics"],
        batch_process=True
    )

def create_daily_summaries(emails_with_highlights: List[ExtractionResult]) -> List[GroupedResult]:
    """Step 3: Create daily summaries"""
    def get_date_key(item):
        # Extract date from timestamp
        if hasattr(item.original_item, 'timestamp'):
            return item.original_item.timestamp.date()
        return datetime.now().date()
    
    def daily_reducer(items):
        return {
            "email_count": len(items),
            "avg_sentiment": sum(item.extraction.get("sentiment", 0) for item in items) / len(items),
            "key_topics": list(set().union(*[item.extraction.get("key_topics", []) for item in items])),
            "highlights": [item.extraction.get("highlights", "") for item in items if item.extraction.get("highlights")]
        }
    
    return group_reduce(
        items=emails_with_highlights,
        key_func=get_date_key,
        reduce_func=daily_reducer,
        sort_by="group_value",
        sort_direction="asc"
    )

def create_weekly_summaries(daily_summaries: List[GroupedResult]) -> List[GroupedResult]:
    """Step 4: Create weekly summaries"""
    def get_week_key(item):
        # Convert date to week of year
        date_val = item.group_value
        return f"{date_val.year}-W{date_val.isocalendar()[1]}"
    
    def weekly_reducer(items):
        total_emails = sum(item.aggregated_data.get("email_count", 0) for item in items)
        all_topics = list(set().union(*[item.aggregated_data.get("key_topics", []) for item in items]))
        
        return {
            "total_emails": total_emails,
            "avg_daily_emails": total_emails / len(items),
            "week_topics": all_topics,
            "daily_summaries": [item.aggregated_data for item in items]
        }
    
    return group_reduce(
        items=daily_summaries,
        key_func=get_week_key,
        reduce_func=weekly_reducer,
        sort_by="group_value",
        sort_direction="asc"
    )

def generate_final_report(weekly_summaries: List[GroupedResult]) -> Dict[str, Any]:
    """Step 5: Generate final report"""
    return summarize(
        content={"weekly_data": [ws.aggregated_data for ws in weekly_summaries]},
        summarization_mandate="Create executive summary of email patterns, key themes, and trends over the analyzed period",
        summary_type="executive",
        target_length="comprehensive",
        focus_areas=["volume_trends", "topic_analysis", "engagement_patterns"]
    )

# Complete workflow example
def email_analysis_workflow(search_query: str) -> Dict[str, Any]:
    """Complete email analysis workflow"""
    
    # Step 1: Retrieve emails
    emails = email_search(query=search_query, limit=1000)
    
    # Step 2: Extract highlights
    emails_with_highlights = extract_highlights_from_emails(emails)
    
    # Step 3: Create daily summaries
    daily_summaries = create_daily_summaries(emails_with_highlights)
    
    # Step 4: Create weekly summaries
    weekly_summaries = create_weekly_summaries(daily_summaries)
    
    # Step 5: Generate final report
    final_report = generate_final_report(weekly_summaries)
    
    return {
        "final_report": final_report,
        "weekly_summaries": weekly_summaries,
        "daily_summaries": daily_summaries,
        "metadata": {
            "total_emails_processed": len(emails),
            "analysis_date": datetime.utcnow().isoformat(),
            "search_query": search_query
        }
    }