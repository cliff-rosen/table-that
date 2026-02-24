# Unified Research Article Format

## Overview

The `CanonicalResearchArticle` provides a unified schema for research articles from different sources (PubMed, Google Scholar, etc.), enabling the research workbench to work with a consistent interface regardless of the data source.

## Schema Definition

### Core Fields

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `id` | str | Unique identifier (e.g., PMID for PubMed, URL for Scholar) | Yes |
| `source` | str | Data source (e.g., 'pubmed', 'google_scholar') | Yes |
| `title` | str | Article title | Yes |

### Metadata Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `authors` | List[str] | List of author names | [] |
| `publication_date` | Optional[str] | Publication date (ISO format preferred) | None |
| `year` | Optional[int] | Publication year | None |
| `journal` | Optional[str] | Journal or publication venue name | None |

### Content Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `abstract` | Optional[str] | Full abstract text | None |
| `snippet` | Optional[str] | Brief excerpt or summary | None |

### Identifiers and Links

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `doi` | Optional[str] | Digital Object Identifier | None |
| `url` | Optional[str] | Direct link to article | None |
| `pdf_url` | Optional[str] | Direct link to PDF version | None |

### Classification Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `keywords` | List[str] | Article keywords | [] |
| `mesh_terms` | List[str] | MeSH terms (for biomedical articles) | [] |
| `categories` | List[str] | Article categories or classifications | [] |

### Metrics and Citations

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `citation_count` | Optional[int] | Number of citations | None |
| `citations_url` | Optional[str] | Link to citing articles | None |
| `related_articles_url` | Optional[str] | Link to related articles | None |
| `versions_url` | Optional[str] | Link to different versions | None |

### Search Context

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `search_position` | Optional[int] | Position in search results | None |
| `relevance_score` | Optional[float] | Search relevance score | None |

### Additional Fields

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `source_metadata` | Optional[Dict[str, Any]] | Additional source-specific metadata | None |
| `extracted_features` | Optional[Dict[str, Any]] | Extracted research features | None |
| `quality_score` | Optional[float] | Article quality score (0-1) | None |
| `indexed_date` | Optional[datetime] | When article was indexed by source | None |
| `retrieved_date` | Optional[datetime] | When article was retrieved | None |

## Field Mapping

### PubMed → Unified Format

| PubMed Field | Unified Field | Notes |
|--------------|---------------|-------|
| `pmid` | `id` | Used as unique identifier |
| `title` | `title` | Direct mapping |
| `abstract` | `abstract` | Direct mapping |
| `abstract` | `snippet` | First 200 chars of abstract |
| `authors` | `authors` | Direct mapping |
| `journal` | `journal` | Direct mapping |
| `publication_date` | `publication_date` | Direct mapping |
| `publication_date` | `year` | Extracted from date |
| `doi` | `doi` | Direct mapping |
| `keywords` | `keywords` | Direct mapping |
| `mesh_terms` | `mesh_terms` | Direct mapping |
| `citation_count` | `citation_count` | Direct mapping |
| - | `url` | Generated from PMID |
| - | `citations_url` | Generated from PMID |
| - | `related_articles_url` | Generated from PMID |
| - | `source` | Set to "pubmed" |

### Google Scholar → Unified Format

| Scholar Field | Unified Field | Notes |
|---------------|---------------|-------|
| `link` or generated | `id` | URL or generated ID |
| `title` | `title` | Direct mapping |
| `authors` | `authors` | Direct mapping |
| `snippet` | `snippet` | Direct mapping |
| `publication_info` | `journal` | Extracted from info |
| `year` | `year` | Direct mapping |
| `link` | `url` | Direct mapping |
| `pdf_link` | `pdf_url` | Direct mapping |
| `cited_by_count` | `citation_count` | Direct mapping |
| `cited_by_link` | `citations_url` | Direct mapping |
| `related_pages_link` | `related_articles_url` | Direct mapping |
| `versions_link` | `versions_url` | Direct mapping |
| `position` | `search_position` | Direct mapping |
| - | `source` | Set to "google_scholar" |

## Usage Examples

### Converting PubMed Article

```python
from schemas.research_article_converters import pubmed_article_to_research
from services.pubmed_service import PubMedService

# Fetch PubMed articles
service = PubMedService()
articles = await service.get_articles_from_ids(["12345678"])

# Convert PubMedArticle directly to unified format
unified_article = pubmed_article_to_research(articles[0])
```

### Converting Google Scholar Article

```python
from schemas.canonical_types import CanonicalScholarArticle
from schemas.research_article_converters import scholar_to_research_article

# Original Scholar article
scholar_article = CanonicalScholarArticle(
    title="Machine Learning in Healthcare",
    link="https://example.com/article",
    authors=["Johnson B", "Williams C"],
    publication_info="IEEE Conference on AI, 2023",
    snippet="This paper presents a novel approach...",
    cited_by_count=150,
    cited_by_link="https://scholar.google.com/citations?...",
    pdf_link="https://example.com/article.pdf",
    year=2023,
    position=1
)

# Convert to unified format
unified_article = scholar_to_research_article(scholar_article)
```

### Batch Conversion

```python
from schemas.research_article_converters import pubmed_article_to_research

# Convert multiple PubMedArticle objects
unified_articles = [pubmed_article_to_research(a) for a in pubmed_articles]
```

### Working with Unified Articles

```python
# Access common fields regardless of source
for article in unified_articles:
    print(f"Title: {article.title}")
    print(f"Authors: {', '.join(article.authors)}")
    print(f"Citations: {article.citation_count or 'Unknown'}")
    print(f"Source: {article.source}")
    
    # Check for source-specific data
    if article.source == "pubmed" and article.mesh_terms:
        print(f"MeSH Terms: {', '.join(article.mesh_terms)}")
    
    if article.pdf_url:
        print(f"PDF available: {article.pdf_url}")
```

### Accessing Source-Specific Data

```python
# Source-specific fields are preserved in source_metadata
if unified_article.source == "pubmed":
    pmid = unified_article.pmid
    volume = unified_article.source_metadata.get("volume")
elif unified_article.source == "google_scholar":
    position = unified_article.search_position
```

## Best Practices

1. **Always specify source**: When creating articles, always set the `source` field correctly
2. **Preserve source metadata**: Store source-specific fields in `source_metadata` to avoid data loss
3. **Handle missing fields gracefully**: Many fields are optional - check for None before using
4. **Use converters**: Use the provided converter functions rather than manual mapping
5. **Timestamp retrieval**: Set `retrieved_date` when fetching articles for tracking freshness

## Future Extensions

The unified format is designed to be extensible. When adding new sources:

1. Create source-specific canonical type (e.g., `CanonicalArxivArticle`)
2. Add converter functions in `research_article_converters.py`
3. Map fields appropriately, preserving source-specific data in `source_metadata`
4. Update this documentation with the new mapping table