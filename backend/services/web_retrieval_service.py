"""
Web Retrieval Service for fetching and parsing web pages

This service handles web page retrieval operations, extracting content
and metadata to create CanonicalWebpage objects.
"""

from typing import Optional, Dict, Any, TypedDict
from datetime import datetime
import logging
import asyncio
import aiohttp
from bs4 import BeautifulSoup
import re
from urllib.parse import urlparse, urljoin

from config.settings import settings
from schemas.canonical_types import CanonicalWebpage

logger = logging.getLogger(__name__)


class WebRetrievalServiceResult(TypedDict):
    """Simple service result structure containing canonical webpage and metadata"""
    webpage: CanonicalWebpage
    status_code: int
    response_time: int
    timestamp: str


class WebRetrievalService:
    """Service for retrieving and parsing web pages"""
    
    def __init__(self):
        self.default_timeout = 30
        self.default_user_agent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        
    async def retrieve_webpage(
        self,
        url: str,
        extract_text_only: bool = True,
        timeout: int = None,
        user_agent: str = None
    ) -> WebRetrievalServiceResult:
        """
        Retrieve and parse a webpage
        
        Args:
            url: The webpage URL to retrieve
            extract_text_only: Whether to extract only text content or include HTML
            timeout: Request timeout in seconds
            user_agent: Custom user agent string
            
        Returns:
            WebRetrievalServiceResult containing CanonicalWebpage and metadata
        """
        if not url:
            raise ValueError("URL is required")
        
        # Validate URL format
        if not self._is_valid_url(url):
            raise ValueError(f"Invalid URL format: {url}")
        
        # Use default values if not provided
        timeout = timeout or self.default_timeout
        user_agent = user_agent or self.default_user_agent
        
        headers = {
            "User-Agent": user_agent,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Accept-Encoding": "gzip, deflate",
            "Connection": "keep-alive",
            "Upgrade-Insecure-Requests": "1",
        }
        
        try:
            async with aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=timeout),
                headers=headers
            ) as session:
                start_time = datetime.utcnow()
                
                async with session.get(url, allow_redirects=True) as response:
                    end_time = datetime.utcnow()
                    response_time_ms = int((end_time - start_time).total_seconds() * 1000)
                    
                    # Get response content
                    content = await response.read()
                    
                    # Parse the webpage
                    webpage = await self._parse_webpage(
                        url=str(response.url),  # Use final URL after redirects
                        content=content,
                        status_code=response.status,
                        headers=dict(response.headers),
                        extract_text_only=extract_text_only
                    )
                    
                    return WebRetrievalServiceResult(
                        webpage=webpage,
                        status_code=response.status,
                        response_time=response_time_ms,
                        timestamp=datetime.utcnow().isoformat()
                    )
                    
        except aiohttp.ClientTimeout:
            raise Exception(f"Request timed out after {timeout} seconds")
        except aiohttp.ClientError as e:
            raise Exception(f"Network error: {str(e)}")
        except Exception as e:
            logger.error(f"Error retrieving webpage {url}: {str(e)}")
            raise Exception(f"Failed to retrieve webpage: {str(e)}")

    async def _parse_webpage(
        self,
        url: str,
        content: bytes,
        status_code: int,
        headers: Dict[str, str],
        extract_text_only: bool = True
    ) -> CanonicalWebpage:
        """
        Parse webpage content and extract structured data
        
        Args:
            url: Final URL after redirects
            content: Raw webpage content
            status_code: HTTP status code
            headers: HTTP response headers
            extract_text_only: Whether to extract only text content
            
        Returns:
            CanonicalWebpage object with parsed content
        """
        try:
            # Decode content
            encoding = self._detect_encoding(content, headers)
            html_content = content.decode(encoding, errors='ignore')
            
            # Parse with BeautifulSoup
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Extract title
            title = self._extract_title(soup)
            
            # Extract text content
            text_content = self._extract_text_content(soup) if extract_text_only else ""
            
            # Extract metadata
            metadata = self._extract_metadata(soup, html_content)
            
            # Get content type
            content_type = headers.get('content-type', 'text/html')
            
            # Get last modified date
            last_modified = self._parse_last_modified(headers.get('last-modified'))
            
            # Create canonical webpage object
            webpage = CanonicalWebpage(
                url=url,
                title=title,
                content=text_content,
                html=html_content if not extract_text_only else None,
                last_modified=last_modified,
                content_type=content_type,
                status_code=status_code,
                headers=headers,
                metadata=metadata
            )
            
            return webpage
            
        except Exception as e:
            logger.error(f"Error parsing webpage content: {str(e)}")
            # Return minimal webpage object for error cases
            return CanonicalWebpage(
                url=url,
                title="Error parsing webpage",
                content=f"Failed to parse webpage content: {str(e)}",
                html=None,
                last_modified=None,
                content_type=headers.get('content-type', 'text/html'),
                status_code=status_code,
                headers=headers,
                metadata={"error": str(e)}
            )

    def _is_valid_url(self, url: str) -> bool:
        """Validate URL format"""
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False

    def _detect_encoding(self, content: bytes, headers: Dict[str, str]) -> str:
        """Detect content encoding from headers or content"""
        # Check content-type header
        content_type = headers.get('content-type', '')
        if 'charset=' in content_type:
            try:
                charset = content_type.split('charset=')[1].split(';')[0].strip()
                return charset
            except Exception:
                pass
        
        # Check HTML meta tags
        try:
            # Try to decode as UTF-8 first for meta tag detection
            html_sample = content[:2048].decode('utf-8', errors='ignore')
            soup = BeautifulSoup(html_sample, 'html.parser')
            
            # Look for charset in meta tags
            meta_charset = soup.find('meta', {'charset': True})
            if meta_charset:
                return meta_charset.get('charset', 'utf-8')
            
            # Look for http-equiv content-type
            meta_content_type = soup.find('meta', {'http-equiv': 'Content-Type'})
            if meta_content_type:
                content_attr = meta_content_type.get('content', '')
                if 'charset=' in content_attr:
                    return content_attr.split('charset=')[1].split(';')[0].strip()
        except Exception:
            pass
        
        return 'utf-8'  # Default fallback

    def _extract_title(self, soup: BeautifulSoup) -> str:
        """Extract page title"""
        # Try title tag first
        title_tag = soup.find('title')
        if title_tag and title_tag.get_text(strip=True):
            return title_tag.get_text(strip=True)
        
        # Try h1 tag
        h1_tag = soup.find('h1')
        if h1_tag and h1_tag.get_text(strip=True):
            return h1_tag.get_text(strip=True)
        
        # Try meta title
        meta_title = soup.find('meta', {'name': 'title'})
        if meta_title and meta_title.get('content'):
            return meta_title.get('content').strip()
        
        # Try Open Graph title
        og_title = soup.find('meta', {'property': 'og:title'})
        if og_title and og_title.get('content'):
            return og_title.get('content').strip()
        
        return "Untitled Page"

    def _extract_text_content(self, soup: BeautifulSoup) -> str:
        """Extract clean text content from HTML"""
        # Remove script and style elements
        for script in soup(["script", "style", "nav", "footer", "header", "aside"]):
            script.decompose()
        
        # Get text content
        text = soup.get_text()
        
        # Clean up whitespace
        lines = (line.strip() for line in text.splitlines())
        chunks = (phrase.strip() for line in lines for phrase in line.split("  "))
        text = ' '.join(chunk for chunk in chunks if chunk)
        
        return text

    def _extract_metadata(self, soup: BeautifulSoup, html_content: str) -> Dict[str, Any]:
        """Extract metadata from webpage"""
        metadata = {}
        
        # Extract meta description
        meta_desc = soup.find('meta', {'name': 'description'})
        if meta_desc and meta_desc.get('content'):
            metadata['description'] = meta_desc.get('content').strip()
        
        # Extract author
        meta_author = soup.find('meta', {'name': 'author'})
        if meta_author and meta_author.get('content'):
            metadata['author'] = meta_author.get('content').strip()
        
        # Extract keywords
        meta_keywords = soup.find('meta', {'name': 'keywords'})
        if meta_keywords and meta_keywords.get('content'):
            metadata['keywords'] = [k.strip() for k in meta_keywords.get('content').split(',')]
        
        # Extract published date
        published_date = self._extract_published_date(soup)
        if published_date:
            metadata['published_date'] = published_date
        
        # Extract language
        html_lang = soup.find('html', {'lang': True})
        if html_lang:
            metadata['language'] = html_lang.get('lang')
        
        # Calculate word count
        text_content = self._extract_text_content(soup)
        metadata['word_count'] = len(text_content.split())
        
        # Extract Open Graph data
        og_data = self._extract_open_graph_data(soup)
        if og_data:
            metadata['open_graph'] = og_data
        
        return metadata

    def _extract_published_date(self, soup: BeautifulSoup) -> Optional[str]:
        """Extract published date from various meta tags"""
        # Try different date meta tags
        date_selectors = [
            ('meta', {'name': 'date'}),
            ('meta', {'name': 'pubdate'}),
            ('meta', {'name': 'published'}),
            ('meta', {'name': 'article:published_time'}),
            ('meta', {'property': 'article:published_time'}),
            ('meta', {'name': 'dc.date'}),
            ('meta', {'name': 'DC.date'}),
            ('time', {'datetime': True})
        ]
        
        for tag_name, attrs in date_selectors:
            element = soup.find(tag_name, attrs)
            if element:
                date_value = element.get('content') or element.get('datetime')
                if date_value:
                    return date_value.strip()
        
        return None

    def _extract_open_graph_data(self, soup: BeautifulSoup) -> Dict[str, str]:
        """Extract Open Graph metadata"""
        og_data = {}
        
        og_tags = soup.find_all('meta', {'property': lambda x: x and x.startswith('og:')})
        for tag in og_tags:
            property_name = tag.get('property', '').replace('og:', '')
            content = tag.get('content')
            if property_name and content:
                og_data[property_name] = content.strip()
        
        return og_data

    def _parse_last_modified(self, last_modified_header: Optional[str]) -> Optional[datetime]:
        """Parse last-modified header to datetime"""
        if not last_modified_header:
            return None
        
        try:
            # Parse RFC 2822 format: Wed, 21 Oct 2015 07:28:00 GMT
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(last_modified_header)
        except Exception:
            return None

    async def retrieve_multiple_pages(
        self,
        urls: list[str],
        extract_text_only: bool = True,
        timeout: int = None,
        user_agent: str = None,
        max_concurrent: int = 5
    ) -> list[WebRetrievalServiceResult]:
        """
        Retrieve multiple webpages concurrently
        
        Args:
            urls: List of URLs to retrieve
            extract_text_only: Whether to extract only text content
            timeout: Request timeout in seconds
            user_agent: Custom user agent string
            max_concurrent: Maximum number of concurrent requests
            
        Returns:
            List of WebRetrievalServiceResult objects
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def retrieve_single(url: str) -> WebRetrievalServiceResult:
            async with semaphore:
                try:
                    return await self.retrieve_webpage(url, extract_text_only, timeout, user_agent)
                except Exception as e:
                    logger.error(f"Error retrieving {url}: {str(e)}")
                    # Return error result
                    return WebRetrievalServiceResult(
                        webpage=CanonicalWebpage(
                            url=url,
                            title="Error",
                            content=f"Error retrieving webpage: {str(e)}",
                            html=None,
                            last_modified=None,
                            content_type="text/html",
                            status_code=0,
                            headers={},
                            metadata={"error": str(e)}
                        ),
                        status_code=0,
                        response_time=0,
                        timestamp=datetime.utcnow().isoformat()
                    )
        
        # Execute all requests concurrently
        results = await asyncio.gather(*[retrieve_single(url) for url in urls])
        return results 