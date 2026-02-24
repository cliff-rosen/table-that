"""
Google Scholar Service

This service provides Google Scholar search functionality through the SerpAPI,
allowing users to search academic literature with various filtering options.
Follows the same abstraction pattern as PubMed service with a proper Article class.
"""

import os
import requests
import re
from typing import List, Dict, Any, Optional, Tuple, TYPE_CHECKING
from datetime import datetime
import logging

if TYPE_CHECKING:
    from schemas.canonical_types import CanonicalResearchArticle

from services.google_scholar_enrichment import GoogleScholarEnrichmentService

logger = logging.getLogger(__name__)


class GoogleScholarArticle:
    """
    Google Scholar specific article representation.
    Follows the same pattern as PubMed's Article class for consistency.
    """
    
    @staticmethod
    def _safe_string_split(value: Any, delimiter: str = ",") -> List[str]:
        """Safely split a value that might be a string or list."""
        if isinstance(value, str):
            return [item.strip() for item in value.split(delimiter) if item.strip()]
        elif isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        else:
            return []
    
    @staticmethod
    def _extract_author_names(authors_data: Any) -> List[str]:
        """
        Extract author names from various SerpAPI author data formats.
        
        Args:
            authors_data: Can be string, list of strings, or list of dicts
            
        Returns:
            List of author names as strings
        """
        if isinstance(authors_data, str):
            # Simple comma-separated string
            return [name.strip() for name in authors_data.split(",") if name.strip()]
        elif isinstance(authors_data, list):
            author_names = []
            for item in authors_data:
                if isinstance(item, dict):
                    # Dictionary format: {'name': 'Author Name', 'link': '...', ...}
                    name = item.get('name', '').strip()
                    if name:
                        author_names.append(name)
                elif isinstance(item, str):
                    # Simple string format
                    name = item.strip()
                    if name:
                        author_names.append(name)
            return author_names
        else:
            return []
    
    @classmethod
    def from_serpapi_result(cls, result: Dict[str, Any], position: int = 0) -> 'GoogleScholarArticle':
        """
        Parse a single SerpAPI search result into a GoogleScholarArticle.
        
        Args:
            result: Raw result dictionary from SerpAPI
            position: Position in search results (for debugging)
            
        Returns:
            GoogleScholarArticle instance
        """
        # Extract title
        title = result.get("title", "").strip()
        if not title:
            raise ValueError(f"No title found for result at position {position}")
        
        # Extract link
        link = result.get("link", "")
        
        # Extract authors - SerpAPI can provide these in multiple locations
        authors = []
        publication_info = result.get("publication_info", {})
        
        # Debug logging for author extraction
        logger.debug(f"Position {position}: Extracting authors from result")
        logger.debug(f"  - result.keys(): {list(result.keys())}")
        logger.debug(f"  - publication_info type: {type(publication_info)}")
        if isinstance(publication_info, dict):
            logger.debug(f"  - publication_info.keys(): {list(publication_info.keys())}")
            logger.debug(f"  - publication_info.authors: {publication_info.get('authors', 'NOT_FOUND')}")
        logger.debug(f"  - result.authors: {result.get('authors', 'NOT_FOUND')}")
        
        # Try multiple locations for authors, in order of preference
        authors_data = None
        
        # 1. Check directly in result (most common location based on your example)
        if "authors" in result and result["authors"]:
            authors_data = result["authors"]
            logger.debug(f"  - Found authors directly in result: {authors_data}")
        
        # 2. Check in publication_info.authors (nested structure)
        elif publication_info and isinstance(publication_info, dict) and "authors" in publication_info:
            authors_data = publication_info["authors"]
            logger.debug(f"  - Found authors in publication_info: {authors_data}")
        
        # 3. Check if publication_info itself contains author information as a string
        elif isinstance(publication_info, dict) and "summary" in publication_info:
            # Sometimes authors are embedded in the summary string
            summary = publication_info["summary"]
            if summary and isinstance(summary, str):
                # Look for author patterns in the summary (e.g., "Author1, Author2 - Journal")
                parts = summary.split(" - ")
                if len(parts) > 1:
                    potential_authors = parts[0].strip()
                    if potential_authors and not any(char.isdigit() for char in potential_authors):
                        authors_data = potential_authors
                        logger.debug(f"  - Found potential authors in publication_info.summary: {authors_data}")
        
        # Extract author names if we found any data
        if authors_data:
            authors = cls._extract_author_names(authors_data)
        
        logger.debug(f"  - Final extracted authors: {authors}")
        
        # Extract publication info
        pub_info_str = ""
        if publication_info and isinstance(publication_info, dict):
            summary = publication_info.get("summary", "")
            if summary:
                pub_info_str = summary
        elif isinstance(result.get("publication_info"), str):
            pub_info_str = result["publication_info"]
        
        # Extract year from publication info
        year = None
        if pub_info_str:
            year_match = re.search(r'\b(19|20)\d{2}\b', pub_info_str)
            if year_match:
                year = int(year_match.group())
        
        # Extract snippet (abstract)
        snippet = result.get("snippet", "")
        if not snippet:
            # Try alternative fields
            snippet = result.get("abstract", "") or result.get("summary", "")
            if snippet:
                logger.debug(f"Found abstract in alternative field for position {position}")
        
        if not snippet:
            logger.warning(f"No snippet/abstract found for: {title[:50]}...")
        
        # Extract citation info
        cited_by_count = None
        cited_by_link = ""
        inline_links = result.get("inline_links", {})
        if inline_links:
            cited_by_data = inline_links.get("cited_by", {})
            if cited_by_data:
                cited_by_link = cited_by_data.get("link", "")
                # Try to extract count from the text (e.g., "Cited by 123")
                cited_text = cited_by_data.get("text", "")
                if cited_text:
                    count_match = re.search(r'\d+', cited_text)
                    if count_match:
                        cited_by_count = int(count_match.group())
        
        # Extract related links
        related_pages_link = ""
        versions_link = ""
        if inline_links:
            related = inline_links.get("related_pages", {})
            if related:
                related_pages_link = related.get("link", "")
            
            versions = inline_links.get("versions", {})
            if versions:
                versions_link = versions.get("link", "")
        
        # Extract PDF link if available
        pdf_link = ""
        resources = result.get("resources", [])
        if resources:
            for resource in resources:
                if resource.get("file_format") == "PDF":
                    pdf_link = resource.get("link", "")
                    break
        
        # Extract DOI if present in the result
        doi = None
        if link:
            doi_match = re.search(r'10\.\d{4,}(?:\.\d+)*\/[-._;()\/:a-zA-Z0-9]+', link)
            if doi_match:
                doi = doi_match.group()
        
        # Extract journal/venue from publication info
        journal = None
        if pub_info_str:
            # Try to extract journal name (usually before year)
            parts = pub_info_str.split(',')
            if len(parts) >= 2:
                # Journal is often the second part after authors
                potential_journal = parts[-2].strip() if year else parts[-1].strip()
                # Clean up the journal name
                potential_journal = re.sub(r'\d{4}.*$', '', potential_journal).strip()
                if potential_journal:
                    journal = potential_journal
        
        return GoogleScholarArticle(
            title=title,
            link=link,
            authors=authors,
            publication_info=pub_info_str,
            snippet=snippet,
            abstract=snippet,
            year=year,
            journal=journal,
            doi=doi,
            cited_by_count=cited_by_count,
            cited_by_link=cited_by_link,
            related_pages_link=related_pages_link,
            versions_link=versions_link,
            pdf_link=pdf_link,
            position=position
        )
    
    def __init__(self, **kwargs: Any) -> None:
        """Initialize GoogleScholarArticle with provided fields."""
        self.title: str = kwargs.get('title', '')
        self.link: str = kwargs.get('link', '')
        self.authors: List[str] = kwargs.get('authors', [])
        self.publication_info: str = kwargs.get('publication_info', '')
        self.snippet: str = kwargs.get('snippet', '')
        self.abstract: str = kwargs.get('abstract', '')
        self.pub_year: Optional[int] = kwargs.get('year')
        self.journal: Optional[str] = kwargs.get('journal')
        self.doi: Optional[str] = kwargs.get('doi')
        self.cited_by_count: Optional[int] = kwargs.get('cited_by_count')
        self.cited_by_link: str = kwargs.get('cited_by_link', '')
        self.related_pages_link: str = kwargs.get('related_pages_link', '')
        self.versions_link: str = kwargs.get('versions_link', '')
        self.pdf_link: str = kwargs.get('pdf_link', '')
        self.position: int = kwargs.get('position', 0)
        self.metadata: Dict[str, Any] = kwargs.get('metadata', {})

        # Generate a unique ID for this article
        self.id = self._generate_id()
    
    def _generate_id(self) -> str:
        """Generate a unique ID for the article."""
        # Use DOI if available
        if self.doi:
            return f"doi:{self.doi}"
        
        # Otherwise create ID from title and first author
        title_part = re.sub(r'[^a-zA-Z0-9]', '', self.title[:30]).lower()
        author_part = ""
        if self.authors:
            first_author = self.authors[0]
            # Extract last name (assume it's the last word)
            author_parts = first_author.split()
            if author_parts:
                author_part = author_parts[-1].lower()
        
        year_part = str(self.pub_year) if self.pub_year else "nodate"
        
        return f"scholar_{author_part}_{year_part}_{title_part}"
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary representation."""
        return {
            'id': self.id,
            'title': self.title,
            'link': self.link,
            'authors': self.authors,
            'publication_info': self.publication_info,
            'snippet': self.snippet,
            'abstract': self.abstract,
            'pub_year': self.pub_year,
            'journal': self.journal,
            'doi': self.doi,
            'cited_by_count': self.cited_by_count,
            'cited_by_link': self.cited_by_link,
            'related_pages_link': self.related_pages_link,
            'versions_link': self.versions_link,
            'pdf_link': self.pdf_link
        }
    
    def __repr__(self) -> str:
        """String representation for debugging."""
        return f"GoogleScholarArticle(id={self.id}, title={self.title[:50]}..., authors={len(self.authors)} authors)"


class GoogleScholarService:
    """Service for interacting with Google Scholar via SerpAPI."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the Google Scholar service.

        Args:
            api_key: SerpAPI key. If not provided, will look for SERPAPI_KEY env var.
        """
        self.api_key = api_key or os.getenv("SERPAPI_KEY")
        if not self.api_key:
            logger.warning("No SerpAPI key provided. Set SERPAPI_KEY environment variable.")

        self.base_url = "https://serpapi.com/search"
        self.enrichment_service = GoogleScholarEnrichmentService()
    
    def _get_max_results_per_call(self) -> int:
        """Get the maximum number of results this provider can return per API call."""
        from config.settings import settings
        return settings.GOOGLE_SCHOLAR_MAX_RESULTS_PER_CALL
    
    def search_articles(
        self,
        query: str,
        num_results: int = 10,
        year_low: Optional[int] = None,
        year_high: Optional[int] = None,
        sort_by: str = "relevance",
        start_index: int = 0,
        enrich_summaries: bool = False
    ) -> Tuple[List['CanonicalResearchArticle'], Dict[str, Any]]:
        """
        Search Google Scholar for academic articles.
        Will make multiple API calls to get the requested number of results.
        
        Args:
            query: Search query string
            num_results: Number of results to return (up to 500)
            year_low: Optional minimum year filter
            year_high: Optional maximum year filter
            sort_by: Sort by "relevance" or "date"
            start_index: Starting index for pagination
            
        Returns:
            Tuple of (list of CanonicalResearchArticle objects, metadata dict)
        """
        if not self.api_key:
            raise ValueError("No API key available. Please set SERPAPI_KEY environment variable.")
        
        # Google Scholar API limit per call (from provider documentation)
        batch_size = self._get_max_results_per_call()
        target_results = num_results
        all_articles = []
        total_api_calls = 0
        current_start_index = start_index
        total_available = 0  # Track the actual total from the API
        
        logger.info(f"Starting Google Scholar search for {target_results} results (will require ~{(target_results + batch_size - 1) // batch_size} API calls at {batch_size} results per call)")
        
        while len(all_articles) < target_results:
            # Calculate how many results to request in this batch
            remaining = target_results - len(all_articles)
            current_batch_size = min(batch_size, remaining)
            
            try:
                # Make single API call for this batch
                batch_articles, batch_metadata = self._search_single_batch(
                    query=query,
                    num_results=current_batch_size,
                    year_low=year_low,
                    year_high=year_high,
                    sort_by=sort_by,
                    start_index=current_start_index,
                    enrich_summaries=enrich_summaries
                )
                
                total_api_calls += 1
                logger.info(f"API call {total_api_calls}: Requested {current_batch_size} articles starting at index {current_start_index}, got {len(batch_articles)} articles back")
                
                # Capture total available results from the first API call
                if total_api_calls == 1:
                    total_available = batch_metadata.get("total_results", 0)
                    logger.info(f"Total available results from API: {total_available}")
                
                # If no results returned, we've hit the end of available results
                if not batch_articles:
                    logger.info(f"No more results available. Got {len(all_articles)} total articles.")
                    break
                
                all_articles.extend(batch_articles)
                
                # Check if we've reached the total available before incrementing
                if total_available > 0 and len(all_articles) >= total_available:
                    logger.info(f"Retrieved all available results. Got {len(all_articles)} out of {total_available} total available")
                    break
                
                # Always increment by the batch size we requested (not what we got back)
                # This ensures consistent pagination regardless of API behavior
                current_start_index += current_batch_size
                
                # Check if next request would be beyond available results
                if total_available > 0 and current_start_index >= total_available:
                    logger.info(f"Next request would exceed available results. Total available: {total_available}, next start index would be: {current_start_index}")
                    break
                
                # Small delay between requests to be respectful to the API
                if len(all_articles) < target_results:
                    import time
                    time.sleep(0.25)
                    
            except Exception as e:
                logger.warning(f"Google Scholar API call {total_api_calls + 1} failed at start_index={current_start_index}: {e}")
                # Don't throw away articles we've already retrieved - just stop pagination
                logger.info(f"Stopping pagination. Retrieved {len(all_articles)} articles before error.")
                break
        
        # Build final metadata
        initially_reported = total_available  # What the first API call said was available
        actually_retrieved = len(all_articles)  # What we actually got
        
        # Check if Google Scholar gave us fewer than initially promised
        discrepancy_message = None
        if initially_reported > 0 and actually_retrieved < min(initially_reported, target_results):
            discrepancy_message = (
                f"Note: Google Scholar initially reported {initially_reported} results available, "
                f"but due to API limitations, only {actually_retrieved} articles could be retrieved."
            )
            logger.warning(discrepancy_message)
        
        final_metadata = {
            "total_results": initially_reported,  # What was initially reported
            "returned_results": actually_retrieved,  # What we actually got
            "requested_results": target_results,
            "api_calls_made": total_api_calls,
            "source": "google_scholar",
            "discrepancy_message": discrepancy_message  # Add message for user
        }
        
        logger.info(f"Google Scholar search completed: {actually_retrieved} articles retrieved in {total_api_calls} API calls")
        return all_articles, final_metadata

    def _search_single_batch(
        self,
        query: str,
        num_results: int,
        year_low: Optional[int] = None,
        year_high: Optional[int] = None,
        sort_by: str = "relevance",
        start_index: int = 0,
        enrich_summaries: bool = False
    ) -> Tuple[List['CanonicalResearchArticle'], Dict[str, Any]]:
        """
        Make a single API call to Google Scholar.
        This is the original search_articles logic broken out for pagination.
        """
        # Ensure this batch is within API bounds
        max_per_call = self._get_max_results_per_call()
        num_results = max(1, min(max_per_call, num_results))
        
        # Build API parameters
        params = {
            "engine": "google_scholar",
            "q": query,
            "api_key": self.api_key,
            "num": num_results
        }
        
        # Only add start parameter if we're not on the first page
        if start_index > 0:
            params["start"] = start_index
        
        # Add optional parameters
        if year_low:
            params["as_ylo"] = year_low
        if year_high:
            params["as_yhi"] = year_high
        if sort_by == "date":
            params["scisbd"] = 1  # Sort by date
            
        logger.debug(f"Single batch search: query='{query}' num_results={num_results} start_index={start_index}")
        logger.debug(f"Scholar API params: {params}")
        
        # Add a unique identifier to help detect if we're getting cached results
        if start_index > 0:
            logger.info(f"PAGINATION REQUEST: start={start_index}, query hash={hash(query) % 10000}")
        
        # Make API request
        start_time = datetime.now()
        try:
            response = requests.get(self.base_url, params=params, timeout=30)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            logger.error(f"SerpAPI request failed: {e}")
            raise Exception(f"Failed to search Google Scholar: {str(e)}")
            
        search_time_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        
        data = response.json()
        
        # Debug: Log SerpAPI response structure for pagination debugging
        logger.debug(f"SerpAPI response keys: {list(data.keys())}")
        if "search_metadata" in data:
            logger.info(f"Search metadata: {data['search_metadata']}")
        if "serpapi_pagination" in data:
            logger.debug(f"Pagination info: {data['serpapi_pagination']}")
        
        # Debug: Log organic_results count vs requested
        organic_results = data.get("organic_results", [])
        logger.info(f"Google Scholar API returned {len(organic_results)} organic results (requested {num_results})")
        if len(organic_results) < num_results:
            logger.warning(f"Google Scholar returned fewer results than requested: got {len(organic_results)}, requested {num_results}")
            
        # Check for SerpAPI warnings or notices
        if "search_parameters" in data:
            actual_params = data["search_parameters"]
            logger.debug(f"Actual search parameters used by SerpAPI: {actual_params}")
            if actual_params.get("num") != num_results:
                logger.warning(f"SerpAPI used different num parameter: requested {num_results}, used {actual_params.get('num')}")
                
        # Log any SerpAPI-specific information
        if "search_information" in data:
            search_info = data["search_information"]
            if "organic_results_state" in search_info:
                logger.info(f"Organic results state: {search_info['organic_results_state']}")
            if "total_results" in search_info:
                logger.info(f"Total results available: {search_info['total_results']}")
        
        # Check for API errors
        if "error" in data:
            raise Exception(f"SerpAPI error: {data['error']}")
            
        # Parse results using our Article class
        scholar_articles = self._parse_search_results(data)
        metadata = self._extract_search_metadata(data, query, search_time_ms)
        
        # Enrich articles with better summaries/abstracts when requested
        if enrich_summaries:
            try:
                # Use parallel async enrichment to speed up batch processing
                from config.timeout_settings import get_streaming_config
                stream_cfg = get_streaming_config()
                max_concurrent = stream_cfg.get("max_concurrent_enrichment", 5)
                self.enrichment_service.enrich_articles_in_parallel(scholar_articles, max_concurrent=max_concurrent)
            except Exception as e:
                logger.warning(f"Summary enrichment step failed: {e}")
        else:
            # Ensure abstract at least mirrors snippet for consistency
            for article in scholar_articles:
                if not getattr(article, 'abstract', None):
                    article.abstract = article.snippet

        # Convert GoogleScholarArticle objects to CanonicalResearchArticle
        from schemas.research_article_converters import scholar_to_research_article
        canonical_articles = []
        for i, article in enumerate(scholar_articles):
            canonical_article = scholar_to_research_article(article, position=start_index + i + 1)
            canonical_articles.append(canonical_article)
        
        # Log snippet availability for debugging
        articles_with_snippets = sum(1 for article in scholar_articles if article.snippet)
        logger.info(f"Found {len(scholar_articles)} articles from Google Scholar, {articles_with_snippets} with snippets")
        
        # Debug: Log first article title to verify pagination is working
        if canonical_articles:
            logger.debug(f"First article: {canonical_articles[0].title}")
            if len(canonical_articles) > 1:
                logger.debug(f"Second article: {canonical_articles[1].title}")
        
        return canonical_articles, metadata
    
    def _parse_search_results(self, data: Dict[str, Any]) -> List[GoogleScholarArticle]:
        """Parse SerpAPI response into GoogleScholarArticle objects."""
        organic_results = data.get("organic_results", [])
        articles = []
        
        for i, result in enumerate(organic_results):
            try:
                article = GoogleScholarArticle.from_serpapi_result(result, i)
                articles.append(article)
            except Exception as e:
                logger.warning(f"Failed to parse result {i}: {e}")
                logger.error(f"Problematic result structure: {result}")
                # Log specific fields that might be causing issues
                logger.error(f"  - title: {type(result.get('title', ''))} = {result.get('title', '')}")
                logger.error(f"  - authors: {type(result.get('authors', ''))} = {result.get('authors', '')}")
                if 'publication_info' in result:
                    pub_info = result['publication_info']
                    logger.error(f"  - publication_info type: {type(pub_info)}")
                    if isinstance(pub_info, dict):
                        logger.error(f"  - publication_info.authors: {type(pub_info.get('authors', ''))} = {pub_info.get('authors', '')}")
                continue
                
        return articles
    
    def _extract_search_metadata(self, data: Dict[str, Any], query: str, search_time_ms: int) -> Dict[str, Any]:
        """Extract metadata from the search response."""
        search_info = data.get("search_information", {})
        pagination = data.get("serpapi_pagination", {})
        search_metadata = data.get("search_metadata", {})
        
        # Try to get total results from search information
        total_results = search_info.get("total_results", 0)
        
        # Parse query time
        query_time_str = search_info.get("query_time", 0)
        query_time_ms = int(float(query_time_str) * 1000) if query_time_str else 0
        
        # Build metadata dictionary
        metadata = {
            "query": query,
            "total_results": total_results,
            "query_time_ms": query_time_ms,
            "search_time_ms": search_time_ms,
            "pagination": {
                "current": pagination.get("current", 0),
                "next": pagination.get("next", None),
                "other_pages": pagination.get("other_pages", {})
            },
            "serpapi_search_id": search_metadata.get("id", ""),
            "raw_query": search_metadata.get("raw_html_file", "")
        }
        
        return metadata

    
    def enrich_single_article(
        self,
        doi: Optional[str] = None,
        link: Optional[str] = None,
        title: Optional[str] = None
    ) -> Tuple['CanonicalResearchArticle', Dict[str, Any]]:
        """
        Enrich a single article identified by DOI or link by attempting to fetch a summary/abstract.
        Returns a CanonicalResearchArticle with abstract populated when possible, along with metadata.
        """
        # Resolve DOI from link if missing
        if not doi and link:
            doi = self.enrichment_service.extract_doi_from_text(link)

        # Build a minimal GoogleScholarArticle
        article = GoogleScholarArticle(
            title=title or (f"DOI {doi}" if doi else (link or "Unknown title")),
            link=link or "",
            authors=[],
            publication_info="",
            snippet="",
            abstract="",
            year=None,
            journal=None,
            doi=doi,
            cited_by_count=None,
            cited_by_link="",
            related_pages_link="",
            versions_link="",
            pdf_link="",
            position=1
        )

        # Use the enrichment service
        abstract_text = self.enrichment_service.enrich_article_summary(article)
        if abstract_text:
            article.abstract = abstract_text
            if not article.snippet:
                article.snippet = abstract_text

        # Convert to CanonicalResearchArticle
        from schemas.research_article_converters import scholar_to_research_article
        canonical = scholar_to_research_article(article, position=1)

        metadata = {
            "source": "google_scholar",
            "enrichment_source": None,  # Source not tracked by helper
            "had_doi": bool(doi),
            "had_link": bool(link)
        }

        return canonical, metadata





# Module-level function to match PubMed pattern
def search_articles(
    query: str,
    num_results: int = 10,
    year_low: Optional[int] = None,
    year_high: Optional[int] = None,
    sort_by: str = "relevance",
    start_index: int = 0
) -> Tuple[List['CanonicalResearchArticle'], Dict[str, Any]]:
    """
    Module-level search function to match PubMed's search_articles pattern.
    """
    service = GoogleScholarService()
    return service.search_articles(
        query=query,
        num_results=num_results,
        year_low=year_low,
        year_high=year_high,
        sort_by=sort_by,
        start_index=start_index
    )
