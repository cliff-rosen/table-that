import httpx
import asyncio
import xml.etree.ElementTree as ET
import urllib.parse
import logging
import os
from typing import List, Dict, Any, Optional

logger = logging.getLogger(__name__)

"""
PubMed Service - Article retrieval and full text access

ARTICLE TEXT ACCESS PATTERNS:
=============================
There are several ways to get article text content, depending on what's needed:

1. Abstract Only (Default)
   - search_articles(query) or get_articles_from_ids([pmid])
   - Returns metadata + abstract for all articles
   - Fastest, always available

2. Full Text from PubMed Central (PMC)
   - search_articles(query, include_full_text=True)
   - get_articles_from_ids([pmid], include_full_text=True)
   - Fetches full text from PMC for articles that have PMC IDs
   - NOT all articles are in PMC - only open access, NIH-funded, or voluntarily deposited
   - Full text stored in article.full_text field

3. Direct PMC Fetch
   - get_pmc_full_text(pmc_id)
   - Fetches full text directly from PMC given a PMC ID
   - Use when you already know the PMC ID

4. Full Text Links (LinkOut)
   - get_full_text_links(pmid)
   - Returns URLs to publisher websites (free and subscription-required)
   - Use as fallback when article is NOT in PMC
   - Links may require authentication/subscription to access

API DOCS:
https://www.ncbi.nlm.nih.gov/books/NBK25501/
https://www.ncbi.nlm.nih.gov/books/NBK25499/

SAMPLE CALLS:
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=melanocortin&retmax=10000&retmode=json
https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=38004229&retmode=xml
"""
PUBMED_API_SEARCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi"
PUBMED_API_FETCH_URL = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"


def _get_pubmed_max_results() -> int:
    """Helper function to get PubMed max results from settings."""
    from config.settings import settings

    return settings.PUBMED_MAX_RESULTS_PER_CALL


class PubMedArticle:
    """
    PubmedArticle
        MedlineCitation
            PMID
            Article (PubModel)
                Journal
                    JournalIssue (CitedMedium)
                        Volume
                        Issue
                        PubDate
                    Title
                ArticleTitle
                Pagination
                Abstract
                AuthorList

    """

    @classmethod
    def from_xml(cls, article_xml: bytes) -> "PubMedArticle":
        pubmed_article_node = ET.fromstring(article_xml)
        medline_citation_node = pubmed_article_node.find(".//MedlineCitation")

        PMID_node = medline_citation_node.find(".//PMID")
        article_node = medline_citation_node.find(".//Article")
        date_completed_node = medline_citation_node.find(".//DateCompleted")
        date_revised_node = medline_citation_node.find(".//DateRevised")
        # ArticleDate can be in Article or directly in MedlineCitation
        article_date_node = None
        if article_node is not None:
            article_date_node = article_node.find(".//ArticleDate")
        if article_date_node is None:
            article_date_node = medline_citation_node.find(".//ArticleDate")
        # Entry date is in PubmedData/History/PubMedPubDate with PubStatus="entrez"
        pubmed_data_node = pubmed_article_node.find(".//PubmedData")
        entry_date_node = None
        if pubmed_data_node is not None:
            history_node = pubmed_data_node.find(".//History")
            if history_node is not None:
                entry_date_node = history_node.find(
                    './/PubMedPubDate[@PubStatus="entrez"]'
                )

        journal_node = article_node.find(".//Journal")
        journal_issue_node = journal_node.find(".//JournalIssue")
        journal_title_node = journal_node.find(".//Title")
        volume_node = journal_issue_node.find(".//Volume")
        issue_node = journal_issue_node.find(".//Issue")
        pubdate_node = journal_issue_node.find(".//PubDate")
        year_node = pubdate_node.find(".//Year")

        article_title_node = medline_citation_node.find(".//ArticleTitle")
        pagination_node = medline_citation_node.find(".//Pagination/MedlinePgn")
        abstract_node = medline_citation_node.find(".//Abstract")
        author_list_node = medline_citation_node.find(".//AuthorList")

        PMID = ""
        title = ""
        journal = ""
        medium = ""
        year = ""
        volume = ""
        issue = ""
        pages = ""
        date_completed = ""
        date_revised = ""
        article_date = ""
        entry_date = ""
        if PMID_node is not None:
            PMID = PMID_node.text
        logger.debug(f"Processing article PMID: {PMID}")
        if article_title_node is not None:
            title = "".join(article_title_node.itertext())
        if journal_title_node is not None:
            journal = journal_title_node.text
        if journal_issue_node is not None:
            medium = journal_issue_node.attrib["CitedMedium"]
        if year_node is not None:
            year = year_node.text
        if volume_node is not None:
            volume = volume_node.text
        if issue_node is not None:
            issue = issue_node.text
        if pagination_node is not None:
            pages = pagination_node.text
        date_completed = cls._get_date_from_node(date_completed_node)
        date_revised = cls._get_date_from_node(date_revised_node)
        article_date = cls._get_date_from_node(article_date_node)
        entry_date = cls._get_date_from_node(entry_date_node)

        # Debug logging
        logger.debug(f"PMID {PMID} - Date extraction:")
        logger.debug(f"  date_completed: {date_completed}")
        logger.debug(f"  date_revised: {date_revised}")
        logger.debug(f"  article_date: {article_date}")
        logger.debug(f"  entry_date: {entry_date}")
        # Parse publication date components honestly - no fabricated precision
        # Month name to number mapping for text months
        month_map = {
            "jan": 1,
            "feb": 2,
            "mar": 3,
            "apr": 4,
            "may": 5,
            "jun": 6,
            "jul": 7,
            "aug": 8,
            "sep": 9,
            "oct": 10,
            "nov": 11,
            "dec": 12,
        }
        pub_year: Optional[int] = None
        pub_month: Optional[int] = None
        pub_day: Optional[int] = None

        if year:
            try:
                pub_year = int(year)
            except (ValueError, TypeError):
                pass

            if pubdate_node is not None:
                month_node = pubdate_node.find(".//Month")
                day_node = pubdate_node.find(".//Day")
                if month_node is not None and month_node.text:
                    month_text = month_node.text.strip()
                    # Handle text months (Jan, Feb, etc.) or numeric
                    if month_text.lower()[:3] in month_map:
                        pub_month = month_map[month_text.lower()[:3]]
                    elif month_text.isdigit():
                        pub_month = int(month_text)
                    if day_node is not None and day_node.text:
                        try:
                            pub_day = int(day_node.text.strip())
                        except (ValueError, TypeError):
                            pass

        # Use the earlier of journal PubDate vs ArticleDate (electronic pub date)
        # PubMed displays the earlier date as the publication date. An article in
        # the "December 2025" journal issue may have been e-published November 3.
        if article_date_node is not None:
            epub_year_node = article_date_node.find(".//Year")
            epub_month_node = article_date_node.find(".//Month")
            epub_day_node = article_date_node.find(".//Day")
            if epub_year_node is not None and epub_year_node.text:
                try:
                    epub_year = int(epub_year_node.text)
                    epub_month = int(epub_month_node.text) if epub_month_node is not None and epub_month_node.text else None
                    epub_day = int(epub_day_node.text) if epub_day_node is not None and epub_day_node.text else None

                    # Compare: use epub date if it's earlier than journal PubDate
                    # Build comparable tuples (treat None month/day as 12/31 for "later" comparison)
                    if pub_year is not None:
                        journal_tuple = (pub_year, pub_month or 12, pub_day or 28)
                        epub_tuple = (epub_year, epub_month or 12, epub_day or 28)
                        if epub_tuple < journal_tuple:
                            pub_year = epub_year
                            pub_month = epub_month
                            pub_day = epub_day
                    else:
                        # No journal PubDate at all, use epub
                        pub_year = epub_year
                        pub_month = epub_month
                        pub_day = epub_day
                except (ValueError, TypeError):
                    pass  # Keep journal PubDate if epub parsing fails

        # Parse all authors - no truncation, store complete list
        author_list = []
        if author_list_node is not None:
            for author_node in author_list_node.findall(".//Author"):
                last_name_node = author_node.find(".//LastName")
                if last_name_node is not None:
                    last_name = last_name_node.text
                    initials_node = author_node.find(".//Initials")
                    initials = initials_node.text if initials_node is not None else ""
                    author_list.append(f"{last_name} {initials}".strip())
        authors = ", ".join(author_list)

        abstract = ""
        if abstract_node is not None:
            abstract_texts = abstract_node.findall(".//AbstractText")
            if abstract_texts is not None and len(abstract_texts) > 0:
                abstract_parts = []
                for abstract_text in abstract_texts:
                    text_content = "".join(abstract_text.itertext()).strip()
                    # Check for section label (structured abstracts)
                    label = abstract_text.get("Label")
                    if label:
                        # Format as section header with text on new line
                        abstract_parts.append(f"**{label}**\n{text_content}")
                    else:
                        abstract_parts.append(text_content)
                # Join sections with blank lines for proper markdown paragraph separation
                abstract = "\n\n".join(abstract_parts)

        # Extract ArticleIdList for PMC ID and DOI
        pmc_id = ""
        doi = ""
        if pubmed_data_node is not None:
            article_id_list = pubmed_data_node.find(".//ArticleIdList")
            if article_id_list is not None:
                for article_id in article_id_list.findall(".//ArticleId"):
                    id_type = article_id.get("IdType", "")
                    if id_type == "pmc" and article_id.text:
                        pmc_id = article_id.text
                    elif id_type == "doi" and article_id.text:
                        doi = article_id.text

        return PubMedArticle(
            PMID=PMID,
            comp_date=date_completed,
            date_revised=date_revised,
            article_date=article_date,
            entry_date=entry_date,
            title=title,
            abstract=abstract,
            authors=authors,
            journal=journal,
            medium=medium,
            volume=volume,
            issue=issue,
            pages=pages,
            pmc_id=pmc_id,
            doi=doi,
            pub_year=pub_year,
            pub_month=pub_month,
            pub_day=pub_day,
        )

    @classmethod
    def from_book_xml(cls, book_xml: bytes) -> "PubMedArticle":
        """
        Parse a PubmedBookArticle XML element (e.g., StatPearls chapters).

        Maps book-specific fields to the standard PubMedArticle structure:
        - journal -> BookTitle (e.g., "StatPearls")
        - medium -> "Book"
        - volume/issue/pages -> empty (not applicable for books)
        """
        book_article_node = ET.fromstring(book_xml)
        book_document = book_article_node.find(".//BookDocument")

        # Extract PMID
        pmid_node = book_document.find(".//PMID")
        PMID = pmid_node.text if pmid_node is not None else ""
        logger.debug(f"Processing book article PMID: {PMID}")

        # Extract title
        title_node = book_document.find(".//ArticleTitle")
        title = "".join(title_node.itertext()) if title_node is not None else ""

        # Extract book info (use as "journal")
        book_node = book_document.find(".//Book")
        book_title_node = (
            book_node.find(".//BookTitle") if book_node is not None else None
        )
        publisher_node = (
            book_node.find(".//Publisher/PublisherName")
            if book_node is not None
            else None
        )

        # Use BookTitle as journal, with publisher in parentheses
        journal = ""
        if book_title_node is not None and book_title_node.text:
            journal = book_title_node.text
            if publisher_node is not None and publisher_node.text:
                journal += f" ({publisher_node.text})"

        # Extract publication date from Book/PubDate - parse honestly
        pub_year: Optional[int] = None
        pub_month: Optional[int] = None
        pub_day: Optional[int] = None

        if book_node is not None:
            pubdate_node = book_node.find(".//PubDate")
            if pubdate_node is not None:
                year_node = pubdate_node.find(".//Year")
                month_node = pubdate_node.find(".//Month")
                if year_node is not None and year_node.text:
                    try:
                        pub_year = int(year_node.text)
                    except (ValueError, TypeError):
                        pass
                    if month_node is not None and month_node.text:
                        try:
                            pub_month = int(month_node.text)
                        except (ValueError, TypeError):
                            pass

        # Extract authors (same structure as regular articles)
        author_list_node = book_document.find(".//AuthorList")
        author_list = []
        if author_list_node is not None:
            for author_node in author_list_node.findall(".//Author"):
                last_name_node = author_node.find(".//LastName")
                if last_name_node is not None:
                    last_name = last_name_node.text
                    initials_node = author_node.find(".//Initials")
                    initials = initials_node.text if initials_node is not None else ""
                    author_list.append(f"{last_name} {initials}".strip())
        authors = ", ".join(author_list)

        # Extract abstract
        abstract = ""
        abstract_node = book_document.find(".//Abstract")
        if abstract_node is not None:
            abstract_texts = abstract_node.findall(".//AbstractText")
            if abstract_texts:
                abstract_parts = []
                for abstract_text in abstract_texts:
                    text_content = "".join(abstract_text.itertext()).strip()
                    label = abstract_text.get("Label")
                    if label:
                        abstract_parts.append(f"**{label}**\n{text_content}")
                    else:
                        abstract_parts.append(text_content)
                abstract = "\n\n".join(abstract_parts)

        # Extract book accession ID (like NBK585038) - could be useful
        pmc_id = ""
        article_id_list = book_document.find(".//ArticleIdList")
        if article_id_list is not None:
            for article_id in article_id_list.findall(".//ArticleId"):
                id_type = article_id.get("IdType", "")
                if id_type == "bookaccession" and article_id.text:
                    pmc_id = article_id.text  # Store book accession in pmc_id field

        return PubMedArticle(
            PMID=PMID,
            comp_date="",
            date_revised="",
            article_date="",
            entry_date="",
            title=title,
            abstract=abstract,
            authors=authors,
            journal=journal,
            medium="Book",
            volume="",
            issue="",
            pages="",
            pmc_id=pmc_id,
            doi="",
            pub_year=pub_year,
            pub_month=pub_month,
            pub_day=pub_day,
        )

    def __init__(self, **kwargs: Any) -> None:
        # print(kwargs)
        self.PMID = kwargs["PMID"]
        self.title = kwargs["title"]
        self.abstract = kwargs["abstract"]
        self.authors = kwargs["authors"]
        self.journal = kwargs["journal"]
        self.volume = kwargs["volume"]
        self.issue = kwargs["issue"]
        self.pages = kwargs["pages"]
        self.medium = kwargs["medium"]
        self.pmc_id = kwargs.get("pmc_id", "")
        self.doi = kwargs.get("doi", "")
        self.full_text = kwargs.get("full_text", "")  # Full text from PMC if fetched
        # Honest date fields - only set if actually present in source
        self.pub_year: Optional[int] = kwargs.get("pub_year")
        self.pub_month: Optional[int] = kwargs.get("pub_month")
        self.pub_day: Optional[int] = kwargs.get("pub_day")
        # PubMed-specific date fields
        self.comp_date = kwargs["comp_date"]
        self.date_revised = kwargs.get("date_revised", "")
        self.article_date = kwargs.get("article_date", "")
        self.entry_date = kwargs.get("entry_date", "")

    def __str__(self) -> str:
        from utils.date_utils import format_pub_date
        date_str = format_pub_date(self.pub_year, self.pub_month, self.pub_day)
        line = "===================================================\n"
        res = (
            "PMID: "
            + self.PMID
            + "\n"
            + "Comp date: "
            + self.comp_date
            + "\n"
            + "Title: "
            + self.title[0:80]
            + "\n"
            + "Abstract: "
            + self.abstract[0:80]
            + "\n"
            + "Authors: "
            + self.authors[0:80]
            + "\n"
            + "Journal: "
            + self.journal[0:80]
            + "\n"
            + "Date: "
            + date_str
            + "\n"
            + "Volume: "
            + self.volume
            + "\n"
            + "Issue: "
            + self.issue
            + "\n"
            + "Medium: "
            + self.medium
        )

        return line + res

    @staticmethod
    def _get_date_from_node(date_node: Optional[ET.Element]) -> str:
        if date_node is None:
            return ""

        year_node = date_node.find(".//Year")
        month_node = date_node.find(".//Month")
        day_node = date_node.find(".//Day")

        # Debug logging
        logger.debug(f"Date node tag: {date_node.tag}")
        logger.debug(
            f"Year node: {year_node.text if year_node is not None else 'None'}"
        )
        logger.debug(
            f"Month node: {month_node.text if month_node is not None else 'None'}"
        )
        logger.debug(f"Day node: {day_node.text if day_node is not None else 'None'}")

        # Year is required
        if year_node is None or year_node.text is None:
            logger.debug("No year found, returning empty string")
            return ""

        year = year_node.text
        month = month_node.text if month_node is not None and month_node.text else "01"
        day = day_node.text if day_node is not None and day_node.text else "01"

        # Ensure month and day are zero-padded
        month = month.zfill(2)
        day = day.zfill(2)

        result = f"{year}-{month}-{day}"
        logger.debug(f"Returning date: {result}")
        return result


def get_citation_from_article(article: PubMedArticle) -> str:
    from utils.date_utils import format_pub_date
    authors = article.authors
    title = article.title
    journal = article.journal
    date_str = format_pub_date(article.pub_year, article.pub_month, article.pub_day)
    volume = article.volume
    issue = article.issue
    pages = article.pages

    return f"{authors} ({date_str}). {title}. {journal}, {volume}({issue}), {pages}."


async def search_articles(
    query: str,
    max_results: int = 100,
    offset: int = 0,
    sort_by: str = "relevance",
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    date_type: Optional[str] = None,
) -> tuple[List["CanonicalResearchArticle"], Dict[str, Any]]:
    """
    Module-level search function to match Google Scholar pattern (async).
    Creates a service instance and calls search_articles.
    """
    service = PubMedService()
    return await service.search_articles(
        query=query,
        max_results=max_results,
        offset=offset,
        sort_by=sort_by,
        start_date=start_date,
        end_date=end_date,
        date_type=date_type,
    )


class PubMedService:
    """Service for interacting with PubMed via NCBI E-utilities API."""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize the PubMed service.

        Args:
            api_key: NCBI API key. If not provided, will look for NCBI_API_KEY env var.
        """
        self.api_key = api_key or os.getenv("NCBI_API_KEY")
        self.search_url = PUBMED_API_SEARCH_URL
        self.fetch_url = PUBMED_API_FETCH_URL

        if self.api_key:
            logger.info("Using NCBI API key for increased rate limits")

    def _get_max_results_per_call(self) -> int:
        """Get the maximum number of results this provider can return per API call."""
        from config.settings import settings

        return settings.PUBMED_MAX_RESULTS_PER_CALL

    async def get_article_ids(
        self,
        query: str,
        max_results: int = 1000,
        sort_by: str = "relevance",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        date_type: Optional[str] = None,
    ) -> tuple[List[str], int]:
        """
        Get just the PubMed IDs from a search query (fast - no article fetching, async).

        Returns:
            Tuple of (list of PMIDs, total count)
        """
        return await self._get_article_ids(
            search_term=query,
            max_results=max_results,
            sort_by=sort_by,
            start_date=start_date,
            end_date=end_date,
            date_type=date_type,
        )

    async def search_articles(
        self,
        query: str,
        max_results: int = 100,
        offset: int = 0,
        sort_by: str = "relevance",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        date_type: Optional[str] = None,
        include_full_text: bool = False,
    ) -> tuple[List["CanonicalResearchArticle"], Dict[str, Any]]:
        """
        Search PubMed articles (async).

        Args:
            query: Search query string
            max_results: Maximum number of results to return
            offset: Number of results to skip (for pagination)
            sort_by: Sort order ("relevance" or "date")
            start_date: Filter by start date (YYYY-MM-DD)
            end_date: Filter by end date (YYYY-MM-DD)
            date_type: Type of date to filter on ("publication", "completion", "entry", "revised")
            include_full_text: If True, fetch full text from PMC for articles with PMC IDs
        """
        from schemas.research_article_converters import pubmed_article_to_research

        logger.info(
            f"PubMed search: query='{query}', max_results={max_results}, offset={offset}"
        )

        # Get article IDs with total count
        article_ids, total_count = await self._get_article_ids(
            search_term=query,
            max_results=offset + max_results,  # Get enough IDs for pagination
            sort_by=sort_by,
            start_date=start_date,
            end_date=end_date,
            date_type=date_type,
        )

        logger.info(
            f"Found {total_count} total results, retrieved {len(article_ids)} IDs"
        )

        # Apply pagination to IDs
        paginated_ids = article_ids[offset : offset + max_results]

        if not paginated_ids:
            return [], {"total_results": total_count, "offset": offset, "returned": 0}

        # Get full article data for the current page
        logger.info(f"Fetching article data for {len(paginated_ids)} articles")
        articles = await self._get_articles_from_ids(
            paginated_ids, include_full_text=include_full_text
        )
        logger.info(f"Retrieved {len(articles)} articles")

        # Convert to canonical format
        canonical_articles = []
        conversion_failures: List[tuple[str, str]] = []  # (pmid, error)
        for i, article in enumerate(articles):
            try:
                research_article = pubmed_article_to_research(article)
                research_article.search_position = offset + i + 1
                # Pass through full_text if fetched
                if article.full_text:
                    research_article.full_text = article.full_text
                canonical_articles.append(research_article)

            except Exception as e:
                pmid = getattr(article, "PMID", "unknown")
                logger.error(f"Error converting article {pmid}: {e}")
                logger.error(
                    f"Article data - Title: {getattr(article, 'title', 'None')}, Abstract: {getattr(article, 'abstract', 'None')[:100] if getattr(article, 'abstract', None) else 'None'}, Journal: {getattr(article, 'journal', 'None')}"
                )
                conversion_failures.append((pmid, str(e)))
                continue

        # Summary logging for conversion failures
        if conversion_failures:
            logger.warning(
                f"CONVERSION DROP SUMMARY: {len(conversion_failures)} articles failed conversion"
            )
            logger.warning(f"Failed PMIDs and errors: {conversion_failures}")

        # Trim to requested max_results if we got extra
        if len(canonical_articles) > max_results:
            canonical_articles = canonical_articles[:max_results]

        metadata = {
            "total_results": total_count,
            "offset": offset,
            "returned": len(canonical_articles),
        }

        return canonical_articles, metadata

    def _get_date_clause(
        self, start_date: str, end_date: str, date_type: str = "publication"
    ) -> str:
        """Build PubMed date filter clause based on date type."""
        # Map date types to PubMed E-utilities search field tags
        date_field_map = {
            "completion": "DCOM",  # Date Completed
            "publication": "DP",  # Date of Publication
            "entry": "EDAT",  # Entry Date (formerly Entrez Date)
            "revised": "LR",  # Date Last Revised
        }

        field = date_field_map.get(date_type, "DP")
        clause = f'AND (("{start_date}"[{field}] : "{end_date}"[{field}]))'
        return clause

    async def _get_article_ids(
        self,
        search_term: str,
        max_results: int = 100,
        sort_by: str = "relevance",
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        date_type: str = "publication",
    ) -> tuple[List[str], int]:
        """Search PubMed for article IDs with optional date filtering (async)."""
        url = self.search_url

        # Build search term with optional date clause
        if start_date and end_date:
            full_term = f"({search_term}){self._get_date_clause(start_date, end_date, date_type)}"
        else:
            full_term = search_term

        params = {
            "db": "pubmed",
            "term": full_term,
            "retmax": min(max_results, self._get_max_results_per_call()),
            "retmode": "json",
        }

        # Map unified sort values to PubMed API sort values
        sort_mapping = {
            "relevance": None,  # Default, don't need to specify
            "date": "pub_date",  # Sort by publication date
        }

        pubmed_sort = sort_mapping.get(sort_by)
        if pubmed_sort:
            params["sort"] = pubmed_sort

        headers = {
            "User-Agent": "JamBot/1.0 (Research Assistant; Contact: admin@example.com)"
        }

        # Add NCBI API key if available
        if self.api_key:
            params["api_key"] = self.api_key

        logger.info(f"Retrieving article IDs for query: {full_term}")
        logger.debug(f"Parameters: {params}")

        # Check if the URL is too long (PubMed has a limit of about 2000-3000 characters)
        from urllib.parse import urlencode

        full_url = f"{url}?{urlencode(params)}"
        if len(full_url) > 2000:
            logger.error(
                f"URL too long ({len(full_url)} characters): Query is too complex"
            )
            raise ValueError(
                f"Search query is too long ({len(full_url)} characters). PubMed has a URL length limit. Please simplify your search by reducing the number of terms."
            )

        # Retry logic with exponential backoff
        max_retries = 3
        retry_delay = 1

        async with httpx.AsyncClient(timeout=30.0) as client:
            for attempt in range(max_retries):
                try:
                    response = await client.get(url, params=params, headers=headers)
                    break
                except httpx.RequestError as e:
                    if attempt < max_retries - 1:
                        logger.warning(
                            f"Request failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {retry_delay}s..."
                        )
                        await asyncio.sleep(retry_delay)
                        retry_delay *= 2
                    else:
                        logger.error(
                            f"Request failed after {max_retries} attempts: {e}"
                        )
                        raise

            try:
                response.raise_for_status()

                content_type = response.headers.get("content-type", "")
                if "application/json" not in content_type:
                    logger.error(f"Expected JSON but got content-type: {content_type}")
                    raise Exception(
                        f"PubMed API returned non-JSON response. Content-Type: {content_type}"
                    )

                if not response.text:
                    logger.error("PubMed API returned empty response body")
                    raise Exception("PubMed API returned empty response")

                content = response.json()

                if "esearchresult" not in content:
                    raise Exception("Invalid response format from PubMed API")

                count = int(content["esearchresult"]["count"])
                ids = content["esearchresult"]["idlist"]

                logger.info(f"Found {count} articles, returning {len(ids)} IDs")
                return ids, count

            except httpx.HTTPStatusError as e:
                logger.error(f"HTTP error in PubMed search: {e}", exc_info=True)
                raise Exception(f"PubMed API request failed: {str(e)}")
            except Exception as e:
                logger.error(f"Error in PubMed search: {e}", exc_info=True)
                raise

    async def get_articles_from_ids(
        self, ids: List[str], include_full_text: bool = False
    ) -> List[PubMedArticle]:
        """
        Fetch full article data from PubMed IDs (public wrapper, async).

        Args:
            ids: List of PubMed IDs
            include_full_text: If True, also fetch full text from PMC for articles that have a PMC ID

        Returns:
            List of PubMedArticle objects
        """
        return await self._get_articles_from_ids(
            ids, include_full_text=include_full_text
        )

    async def _get_articles_from_ids(
        self, ids: List[str], include_full_text: bool = False
    ) -> List[PubMedArticle]:
        """Fetch full article data from PubMed IDs (async).

        Args:
            ids: List of PubMed IDs
            include_full_text: If True, also fetch full text from PMC for articles with PMC IDs
        """
        BATCH_SIZE = 100
        articles = []
        batch_size = BATCH_SIZE
        low = 0
        high = low + batch_size
        dropped_pmids: List[str] = []
        failed_batches: List[tuple[int, int, str]] = []

        async with httpx.AsyncClient(timeout=30.0) as client:
            while low < len(ids):
                logger.info(f"Processing articles {low} to {high}")
                id_batch = ids[low:high]
                url = self.fetch_url
                params = {"db": "pubmed", "id": ",".join(id_batch)}
                xml = ""
                try:
                    response = await client.get(url, params=params)
                    response.raise_for_status()
                    xml = response.text
                except Exception as e:
                    logger.error(
                        f"Error fetching articles batch {low}-{high}: {e}",
                        exc_info=True,
                    )
                    failed_batches.append((low, high, str(e)))
                    dropped_pmids.extend(id_batch)
                    low += batch_size
                    high += batch_size
                    continue

                try:
                    root = ET.fromstring(xml)
                except ET.ParseError as e:
                    logger.error(f"Error parsing XML for batch {low}-{high}: {e}")
                    failed_batches.append((low, high, f"XML parse error: {e}"))
                    dropped_pmids.extend(id_batch)
                    low += batch_size
                    high += batch_size
                    continue

                # Track which PMIDs we successfully parsed from this batch
                batch_parsed_pmids = set()

                # Parse regular PubmedArticle elements
                for article_node in root.findall(".//PubmedArticle"):
                    try:
                        article = PubMedArticle.from_xml(ET.tostring(article_node))
                        articles.append(article)
                        batch_parsed_pmids.add(article.PMID)
                    except Exception as e:
                        # Try to extract PMID from the XML node for error reporting
                        pmid_node = article_node.find(".//PMID")
                        pmid = pmid_node.text if pmid_node is not None else "unknown"
                        logger.error(
                            f"Error parsing article PMID {pmid}: {e}", exc_info=True
                        )
                        if pmid:
                            dropped_pmids.append(pmid)

                # Parse book articles (PubmedBookArticle) - e.g., StatPearls chapters
                for book_node in root.findall(".//PubmedBookArticle"):
                    try:
                        article = PubMedArticle.from_book_xml(ET.tostring(book_node))
                        articles.append(article)
                        batch_parsed_pmids.add(article.PMID)
                    except Exception as e:
                        pmid_node = book_node.find(".//PMID")
                        pmid = pmid_node.text if pmid_node is not None else "unknown"
                        logger.error(
                            f"Error parsing book article PMID {pmid}: {e}",
                            exc_info=True,
                        )
                        dropped_pmids.append(f"{pmid} (book parse error)")

                # Check for PMIDs that were requested but not returned in XML at all
                for pmid in id_batch:
                    if pmid not in batch_parsed_pmids:
                        logger.warning(
                            f"PMID {pmid} was requested but not found in PubMed response at all"
                        )
                        dropped_pmids.append(pmid)

                low += batch_size
                high += batch_size

        # Summary logging for dropped articles
        if dropped_pmids:
            logger.warning(
                f"ARTICLE DROP SUMMARY: {len(dropped_pmids)} articles were dropped during fetch"
            )
            logger.warning(f"Dropped PMIDs: {dropped_pmids}")
        if failed_batches:
            logger.warning(f"Failed batches: {failed_batches}")

        logger.info(
            f"Fetch complete: requested {len(ids)}, returned {len(articles)}, dropped {len(dropped_pmids)}"
        )

        # Fetch full text for articles with PMC IDs if requested
        if include_full_text:
            articles_with_pmc = [a for a in articles if a.pmc_id]
            if articles_with_pmc:
                logger.info(
                    f"Fetching full text for {len(articles_with_pmc)} articles with PMC IDs"
                )
                await self._fetch_full_text_for_articles(articles_with_pmc)

        return articles

    async def _fetch_full_text_for_articles(
        self, articles: List[PubMedArticle]
    ) -> None:
        """Fetch full text from PMC for a list of articles that have PMC IDs.

        Updates the articles in place with their full_text attribute.
        """
        # Fetch full text concurrently but with some rate limiting
        import asyncio

        async def fetch_one(article: PubMedArticle) -> None:
            try:
                full_text = await self.get_pmc_full_text(article.pmc_id)
                if full_text:
                    article.full_text = full_text
                    logger.info(
                        f"Fetched full text for PMID {article.PMID} ({len(full_text)} chars)"
                    )
                else:
                    logger.warning(
                        f"No full text returned for PMID {article.PMID} (PMC {article.pmc_id})"
                    )
            except Exception as e:
                logger.error(f"Error fetching full text for PMID {article.PMID}: {e}")

        # Process in batches to avoid overwhelming the PMC API
        BATCH_SIZE = 5
        for i in range(0, len(articles), BATCH_SIZE):
            batch = articles[i : i + BATCH_SIZE]
            await asyncio.gather(*[fetch_one(article) for article in batch])
            # Small delay between batches to be nice to the API
            if i + BATCH_SIZE < len(articles):
                await asyncio.sleep(0.5)

    async def get_full_text_links(self, pmid: str) -> List[Dict[str, Any]]:
        """
        Get full text link options for a PubMed article using the ELink API (async).

        Args:
            pmid: PubMed ID

        Returns:
            List of link dictionaries with provider, url, category, and is_free info
        """
        url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi"
        params = {"dbfrom": "pubmed", "id": pmid, "cmd": "llinks", "retmode": "json"}

        if self.api_key:
            params["api_key"] = self.api_key

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                data = response.json()

            links = []

            # Parse the linksets from the response
            linksets = data.get("linksets", [])
            for linkset in linksets:
                idurllist = linkset.get("idurllist", [])
                for idurl in idurllist:
                    objurls = idurl.get("objurls", [])
                    for objurl in objurls:
                        provider = objurl.get("provider", {}).get("name", "Unknown")
                        url_value = objurl.get("url", {}).get("value", "")
                        # Categories is a list of strings, not objects
                        categories = objurl.get("categories", [])
                        # Attributes contains subscription/free info
                        attributes = objurl.get("attributes", [])

                        # Determine if it's free based on attributes
                        # Free articles won't have "subscription/membership/fee required"
                        is_free = not any(
                            "subscription" in attr.lower() or "fee" in attr.lower()
                            for attr in attributes
                        )
                        # Also check if any attribute explicitly says free
                        if any("free" in attr.lower() for attr in attributes):
                            is_free = True

                        if url_value:
                            links.append(
                                {
                                    "provider": provider,
                                    "url": url_value,
                                    "categories": categories,  # Already a list of strings
                                    "is_free": is_free,
                                }
                            )

            # Deduplicate by URL
            seen_urls = set()
            unique_links = []
            for link in links:
                if link["url"] not in seen_urls:
                    seen_urls.add(link["url"])
                    unique_links.append(link)

            # Sort: free links first, then by provider name
            unique_links.sort(key=lambda x: (not x["is_free"], x["provider"].lower()))

            return unique_links

        except httpx.HTTPStatusError as e:
            logger.error(f"HTTP error fetching full text links for PMID {pmid}: {e}")
            raise  # Re-raise so caller can handle/retry
        except httpx.RequestError as e:
            logger.error(f"Request error fetching full text links for PMID {pmid}: {e}")
            raise  # Re-raise so caller can handle/retry
        except Exception as e:
            logger.error(f"Error parsing full text links for PMID {pmid}: {e}")
            return []  # Parsing error - return empty, don't retry

    async def get_pmc_full_text(self, pmc_id: str) -> Optional[str]:
        """
        Fetch full text from PubMed Central for an article with a PMC ID (async).

        Args:
            pmc_id: The PMC ID (e.g., "PMC1234567" or just "1234567")

        Returns:
            The full text of the article as plain text, or None if not available.
        """
        # Normalize PMC ID
        if pmc_id.upper().startswith("PMC"):
            pmc_id = pmc_id[3:]

        url = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi"
        params = {"db": "pmc", "id": pmc_id, "rettype": "xml"}

        if self.api_key:
            params["api_key"] = self.api_key

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(url, params=params)
                response.raise_for_status()
                xml_content = response.text

            # Parse the XML to extract text content
            root = ET.fromstring(xml_content)

            # Extract all text from body sections
            text_parts = []

            # Get the article title
            title = root.find(".//article-title")
            if title is not None:
                text_parts.append(f"# {''.join(title.itertext())}\n")

            # Get abstract
            abstract = root.find(".//abstract")
            if abstract is not None:
                text_parts.append("## Abstract\n")
                for p in abstract.findall(".//p"):
                    text_parts.append("".join(p.itertext()) + "\n")

            # Get body sections
            body = root.find(".//body")
            if body is not None:
                for sec in body.findall(".//sec"):
                    # Get section title
                    sec_title = sec.find("./title")
                    if sec_title is not None:
                        text_parts.append(f"\n## {''.join(sec_title.itertext())}\n")

                    # Get paragraphs in section
                    for p in sec.findall("./p"):
                        text_parts.append("".join(p.itertext()) + "\n")

            if text_parts:
                return "\n".join(text_parts)
            else:
                logger.warning(f"No text content found in PMC article {pmc_id}")
                return None

        except httpx.RequestError as e:
            logger.error(f"Error fetching PMC article {pmc_id}: {e}")
            return None
        except ET.ParseError as e:
            logger.error(f"Error parsing PMC XML for {pmc_id}: {e}")
            return None


async def get_pmc_full_text(pmc_id: str) -> Optional[str]:
    """
    Module-level function to fetch full text from PubMed Central (async).

    Args:
        pmc_id: The PMC ID (e.g., "PMC1234567" or just "1234567")

    Returns:
        The full text of the article, or None if not available.
    """
    service = PubMedService()
    return await service.get_pmc_full_text(pmc_id)


# Keep the old function for backward compatibility but have it call the new one
async def search_articles_by_date_range(
    filter_term: str,
    start_date: str,
    end_date: str,
    date_type: str = "publication",
    sort_by: str = "relevance",
) -> tuple[List["CanonicalResearchArticle"], Dict[str, Any]]:
    """
    DEPRECATED: Use search_articles() instead.

    This function is kept for backward compatibility and now returns (articles, metadata) tuple (async).
    """
    # Just call the new unified search function
    articles, metadata = await search_articles(
        query=filter_term,
        max_results=_get_pubmed_max_results(),
        offset=0,
        sort_by=sort_by,
        start_date=start_date,
        end_date=end_date,
        date_type=date_type,
    )
    return articles, metadata


async def fetch_articles_by_ids(pubmed_ids: List[str]) -> List[PubMedArticle]:
    """
    Fetch PubMed articles by their PMID (async).

    Args:
        pubmed_ids: List of PubMed IDs to fetch

    Returns:
        List of PubMedArticle objects
    """
    service = PubMedService()
    return await service._get_articles_from_ids(pubmed_ids)


async def search_pubmed_count(search_term: str) -> int:
    """
    Get the count of results for a PubMed search without fetching articles (async).

    Args:
        search_term: PubMed search query

    Returns:
        Number of results found
    """
    service = PubMedService()
    _, count = await service._get_article_ids(
        search_term, max_results=1
    )  # Only get count, not actual results
    return count


async def get_full_text_links(pmid: str) -> List[Dict[str, Any]]:
    """
    Get full text link options for a PubMed article using the ELink API (async).

    Args:
        pmid: PubMed ID

    Returns:
        List of link dictionaries with provider, url, and category info
    """
    service = PubMedService()
    return await service.get_full_text_links(pmid)
