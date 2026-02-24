"""
Google Scholar Article Enrichment Service

This module handles enrichment of Google Scholar articles with abstracts/summaries
from various external sources including Semantic Scholar, Crossref, and web scraping.
"""

import re
import html
import asyncio
import aiohttp
import requests
import logging
from typing import Optional, List, TYPE_CHECKING
from urllib.parse import quote

if TYPE_CHECKING:
    from services.google_scholar_service import GoogleScholarArticle

logger = logging.getLogger(__name__)


class GoogleScholarEnrichmentService:
    """Service for enriching Google Scholar articles with abstracts from external sources."""

    def __init__(self):
        """Initialize the enrichment service."""
        pass

    def enrich_articles_in_parallel(
        self,
        scholar_articles: List['GoogleScholarArticle'],
        max_concurrent: int = 5
    ) -> None:
        """Run async batch enrichment from sync context, safely in all environments.

        Creates a dedicated event loop when a loop is already running (e.g., inside FastAPI),
        otherwise uses asyncio.run(). Articles are modified in-place.
        """
        if not scholar_articles:
            return

        try:
            # If a loop is already running, run enrichment in a dedicated loop
            asyncio.get_running_loop()
            loop = asyncio.new_event_loop()
            try:
                loop.run_until_complete(
                    self.enrich_articles_batch_async(
                        scholar_articles,
                        max_concurrent=max_concurrent
                    )
                )
            finally:
                try:
                    loop.stop()
                except Exception:
                    pass
                loop.close()
        except RuntimeError:
            # No running loop; safe to use asyncio.run
            asyncio.run(
                self.enrich_articles_batch_async(
                    scholar_articles,
                    max_concurrent=max_concurrent
                )
            )

    async def enrich_articles_batch_async(
        self,
        scholar_articles: List['GoogleScholarArticle'],
        max_concurrent: int = 5,
        progress_callback: Optional[callable] = None
    ) -> None:
        """
        Enrich a batch of articles with abstracts using concurrent async requests.

        Args:
            scholar_articles: List of GoogleScholarArticle objects to enrich
            max_concurrent: Maximum number of concurrent enrichment tasks
            progress_callback: Optional async callback to report progress
        """
        if not scholar_articles:
            return

        connector = aiohttp.TCPConnector(limit=max_concurrent)
        timeout = aiohttp.ClientTimeout(total=30, connect=5, sock_read=5)

        async with aiohttp.ClientSession(connector=connector, timeout=timeout) as session:
            # Process articles in batches to avoid overwhelming the system
            batch_size = max_concurrent
            for i in range(0, len(scholar_articles), batch_size):
                batch = scholar_articles[i:i + batch_size]

                # Create enrichment tasks for this batch
                tasks = []
                for article in batch:
                    tasks.append(self.enrich_article_summary_async(article, session))

                # Execute batch concurrently
                if tasks:
                    await asyncio.gather(*tasks, return_exceptions=True)
                    # Articles are modified in-place, no need to process results

                # Report progress if callback provided
                if progress_callback:
                    await progress_callback(i + len(batch), len(scholar_articles))

    async def enrich_article_summary_async(self, article: 'GoogleScholarArticle', session: aiohttp.ClientSession) -> None:
        """
        Async version: Attempt to retrieve a fuller abstract/summary for a Scholar result.
        Tries Semantic Scholar and Crossref via DOI, then page meta tags.

        Sets article.abstract directly and stores enrichment metadata in article.metadata.
        """
        enrichment_metadata = {
            'semantic_scholar': {'called': False, 'success': False, 'error': None},
            'crossref': {'called': False, 'success': False, 'error': None},
            'meta_description': {'called': False, 'success': False, 'error': None},
            'successful_source': None
        }

        # Initialize metadata if not exists
        if not hasattr(article, 'metadata') or article.metadata is None:
            article.metadata = {}

        try:
            # Try DOI-based services first
            if article.doi:
                # Try Semantic Scholar
                enrichment_metadata['semantic_scholar']['called'] = True
                try:
                    abstract_text = await self._try_semantic_scholar_abstract_async(article.doi, session)
                    if abstract_text:
                        enrichment_metadata['semantic_scholar']['success'] = True
                        enrichment_metadata['successful_source'] = 'semantic_scholar'
                        article.abstract = abstract_text
                        article.metadata['enrichment'] = enrichment_metadata
                        return
                except Exception as e:
                    enrichment_metadata['semantic_scholar']['error'] = str(e)

                # Try Crossref
                enrichment_metadata['crossref']['called'] = True
                try:
                    abstract_text = await self._try_crossref_abstract_async(article.doi, session)
                    if abstract_text:
                        enrichment_metadata['crossref']['success'] = True
                        enrichment_metadata['successful_source'] = 'crossref'
                        article.abstract = abstract_text
                        article.metadata['enrichment'] = enrichment_metadata
                        return
                except Exception as e:
                    enrichment_metadata['crossref']['error'] = str(e)

            # Fallback to meta description from landing page
            # Check both 'link' and 'url' properties for compatibility
            article_url = getattr(article, 'link', None) or getattr(article, 'url', None)
            if article_url:
                enrichment_metadata['meta_description']['called'] = True
                try:
                    meta_desc = await self._try_fetch_meta_description_async(article_url, session)
                    if meta_desc:
                        enrichment_metadata['meta_description']['success'] = True
                        enrichment_metadata['successful_source'] = 'meta_description'
                        article.abstract = meta_desc
                        article.metadata['enrichment'] = enrichment_metadata
                        return
                except Exception as e:
                    enrichment_metadata['meta_description']['error'] = str(e)

        finally:
            # Always store the metadata, even if all methods failed
            article.metadata['enrichment'] = enrichment_metadata

            # If no abstract was found and article doesn't have one, use snippet as fallback
            if not article.abstract and article.snippet:
                article.abstract = article.snippet

    def enrich_article_summary(self, article: 'GoogleScholarArticle') -> Optional[str]:
        """
        Synchronous version: Attempt to retrieve a fuller abstract/summary for a Scholar result.
        Tries Semantic Scholar and Crossref via DOI, then page meta tags.

        Returns the abstract text if found, None otherwise.
        """
        # Try DOI-based services first
        if article.doi:
            try:
                abstract_text = self._try_semantic_scholar_abstract(article.doi)
                if abstract_text:
                    return abstract_text
            except Exception:
                pass
            try:
                abstract_text = self._try_crossref_abstract(article.doi)
                if abstract_text:
                    return abstract_text
            except Exception:
                pass

        # Fallback to meta description from landing page
        if article.link:
            try:
                meta_desc = self._try_fetch_meta_description(article.link)
                if meta_desc:
                    return meta_desc
            except Exception:
                pass

        return None

    # === Async enrichment methods ===

    async def _try_semantic_scholar_abstract_async(self, doi: str, session: aiohttp.ClientSession) -> Optional[str]:
        """Async: Fetch abstract via Semantic Scholar Graph API if available."""
        url = f"https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}?fields=title,abstract"
        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                abstract = data.get('abstract') or data.get('paperAbstract')
                if isinstance(abstract, str) and abstract.strip():
                    return self._normalize_whitespace(abstract)
                return None
        except Exception:
            return None

    async def _try_crossref_abstract_async(self, doi: str, session: aiohttp.ClientSession) -> Optional[str]:
        """Async: Fetch abstract via Crossref API if available (often JATS XML)."""
        safe_doi = quote(doi, safe='')
        url = f"https://api.crossref.org/works/{safe_doi}"
        headers = {"Accept": "application/json"}
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                if resp.status != 200:
                    return None
                data = await resp.json()
                message = data.get('message', {})
                abstract = message.get('abstract')
                if not abstract:
                    return None
                text = self._strip_html(abstract)
                return self._normalize_whitespace(text)
        except Exception:
            return None

    async def _try_fetch_meta_description_async(self, url: str, session: aiohttp.ClientSession) -> Optional[str]:
        """Async: Fetch landing page and extract description/abstract-like meta tags."""
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; JamBot/1.0; +https://example.com/bot)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
        try:
            async with session.get(url, headers=headers, timeout=aiohttp.ClientTimeout(total=5), allow_redirects=True) as resp:
                content_type = resp.headers.get('Content-Type', '').lower()
                if 'text/html' not in content_type:
                    return None

                html_content = await resp.text()
                if not html_content:
                    return None

                # Extract description-like meta tags
                for tag in re.findall(r'<meta[^>]+>', html_content, flags=re.IGNORECASE):
                    if re.search(r'(name|property)\s*=\s*["\']?(description|og:description|dc\.description|citation_abstract|abstract)["\']?', tag, flags=re.IGNORECASE):
                        m = re.search(r'content\s*=\s*["\']?(.*?)["\']?', tag, flags=re.IGNORECASE)
                        if m:
                            content = html.unescape(m.group(1))
                            content = self._normalize_whitespace(self._strip_html(content))
                            if content:
                                return content
                return None
        except Exception:
            return None

    # === Sync enrichment methods ===

    def _try_semantic_scholar_abstract(self, doi: str) -> Optional[str]:
        """Fetch abstract via Semantic Scholar Graph API if available."""
        url = f"https://api.semanticscholar.org/graph/v1/paper/DOI:{doi}?fields=title,abstract"
        try:
            resp = requests.get(url, timeout=10)
            if resp.status_code != 200:
                return None
            data = resp.json()
            abstract = data.get('abstract') or data.get('paperAbstract')
            if isinstance(abstract, str) and abstract.strip():
                return self._normalize_whitespace(abstract)
            return None
        except Exception:
            return None

    def _try_crossref_abstract(self, doi: str) -> Optional[str]:
        """Fetch abstract via Crossref API if available (often JATS XML)."""
        safe_doi = quote(doi, safe='')
        url = f"https://api.crossref.org/works/{safe_doi}"
        headers = {"Accept": "application/json"}
        try:
            resp = requests.get(url, headers=headers, timeout=10)
            if resp.status_code != 200:
                return None
            message = resp.json().get('message', {})
            abstract = message.get('abstract')
            if not abstract:
                return None
            text = self._strip_html(abstract)
            return self._normalize_whitespace(text)
        except Exception:
            return None

    def _try_fetch_meta_description(self, url: str) -> Optional[str]:
        """Fetch landing page and extract description/abstract-like meta tags."""
        headers = {
            "User-Agent": "Mozilla/5.0 (compatible; JamBot/1.0; +https://example.com/bot)",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        }
        try:
            resp = requests.get(url, headers=headers, timeout=10, allow_redirects=True)
        except Exception:
            return None

        content_type = resp.headers.get('Content-Type', '').lower()
        if 'text/html' not in content_type:
            return None

        html_content = resp.text or ''
        if not html_content:
            return None

        # Extract description-like meta tags
        for tag in re.findall(r'<meta[^>]+>', html_content, flags=re.IGNORECASE):
            if re.search(r'(name|property)\s*=\s*["\'](description|og:description|dc\.description|citation_abstract|abstract)["\']', tag, flags=re.IGNORECASE):
                m = re.search(r'content\s*=\s*["\'](.*?)["\']', tag, flags=re.IGNORECASE)
                if m:
                    content = html.unescape(m.group(1))
                    content = self._normalize_whitespace(self._strip_html(content))
                    if content:
                        return content
        return None

    # === Utility methods ===

    def _strip_html(self, text: str) -> str:
        """Remove HTML tags and unescape entities."""
        no_tags = re.sub(r'<[^>]+>', ' ', text)
        return html.unescape(no_tags)

    def _normalize_whitespace(self, text: str) -> str:
        """Collapse whitespace and trim."""
        return re.sub(r'\s+', ' ', text).strip()

    def extract_doi_from_text(self, text: str) -> Optional[str]:
        """Extract DOI from a text or URL if present."""
        if not text:
            return None
        match = re.search(r'10\.[0-9]{4,}(?:\.[0-9]+)*/[-._;()/:A-Za-z0-9]+', text)
        return match.group(0) if match else None