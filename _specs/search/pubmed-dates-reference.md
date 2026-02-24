# PubMed Dates Reference

Single source of truth for PubMed date concepts, XML fields, and search behavior.

For how we handle dates in our application, see [Article Dates](../../backend/docs/article_dates.md).

---

## 1. PubMed Date Concepts

PubMed tracks multiple dates for each article. Understanding these is essential for searching and display.

### User-Facing Date Types (Search Tags)

| Date Type | Search Tag | XML Source | Meaning | Use When |
|-----------|------------|------------|---------|----------|
| **Publication Date** | `[dp]` | Computed: ArticleDate if earlier, else PubDate | Combined electronic + print (see behavior below) | Default - most common |
| **Electronic Publication** | `[epdat]` | ArticleDate | When article went online | Finding by online availability |
| **Print Publication** | `[ppdat]` | PubDate | Official journal issue date | Finding by print date |
| **Entry Date** | `[edat]` | PubMedPubDate[@PubStatus="entrez"] | When added to PubMed | Finding newly indexed articles |
| **Create Date** | `[crdt]` | PubMedPubDate[@PubStatus="pubmed"] | When PubMed record was created | Usually same as entry |
| **MeSH Date** | `[mhda]` | PubMedPubDate[@PubStatus="medline"] | When indexed with MeSH terms | Finding newly indexed MEDLINE |
| **Completion Date** | `[dcom]` | DateCompleted | When MEDLINE indexing completed | Recently completed records |
| **Modification Date** | `[lr]` | DateRevised | When record was last updated | Tracking updates, corrections |

### Publication Date `[dp]` Behavior

**`[dp]` is a VIRTUAL/COMPUTED field** - it doesn't exist in the XML. PubMed derives it from:

- If electronic date comes **before** print → `[dp]` matches BOTH dates
- If electronic date comes **after** print → `[dp]` matches only print date

**Example**: Article online Jan 7, print issue Feb 1
- Searching `[dp]` for January → FINDS the article (via electronic date)
- Searching `[epdat]` for January → FINDS the article
- Searching `[ppdat]` for January → Does NOT find the article

---

## 2. XML Date Fields

### What's in the XML

| XML Element | Full Path | Required? | Precision |
|-------------|-----------|-----------|-----------|
| **PubDate** | `PubmedArticle/MedlineCitation/Article/Journal/JournalIssue/PubDate` | **YES** | Variable (year only to full date) |
| **ArticleDate** | `PubmedArticle/MedlineCitation/Article/ArticleDate[@DateType="Electronic"]` | No | Full date when present |
| **DateCompleted** | `PubmedArticle/MedlineCitation/DateCompleted` | No | Full date |
| **DateRevised** | `PubmedArticle/MedlineCitation/DateRevised` | No | Full date |
| **PubMedPubDate** | `PubmedArticle/PubmedData/History/PubMedPubDate[@PubStatus="..."]` | No | Full date when present |

### History Dates (PubStatus values)

| PubStatus | Meaning |
|-----------|---------|
| `entrez` | When added to PubMed |
| `pubmed` | When PubMed record was created |
| `medline` | When MEDLINE record was created |
| `received` | When journal received manuscript |
| `revised` | When authors revised manuscript |
| `accepted` | When journal accepted manuscript |

### Reliability

**Only `PubDate` is guaranteed to exist**, but with variable precision:
- Year only: `<Year>2024</Year>`
- Year + Month: `<Year>2024</Year><Month>Jan</Month>`
- Full date: `<Year>2024</Year><Month>01</Month><Day>15</Day>`
- Date range: `<MedlineDate>2024 Jan-Mar</MedlineDate>`

**`ArticleDate` (electronic) is more precise** (always full Y+M+D when present), but optional.

### Example XML (PMID 41501212)

```xml
<!-- Electronic publication - when users can access it -->
<ArticleDate DateType="Electronic">
  <Year>2026</Year><Month>01</Month><Day>07</Day>
</ArticleDate>

<!-- Print publication - official journal issue -->
<JournalIssue CitedMedium="Internet">
  <PubDate><Year>2026</Year><Month>Feb</Month></PubDate>
</JournalIssue>

<!-- History dates -->
<PubMedPubDate PubStatus="entrez">
  <Year>2026</Year><Month>1</Month><Day>7</Day>
</PubMedPubDate>
<PubMedPubDate PubStatus="received">
  <Year>2025</Year><Month>9</Month><Day>12</Day>
</PubMedPubDate>
<PubMedPubDate PubStatus="accepted">
  <Year>2025</Year><Month>12</Month><Day>15</Day>
</PubMedPubDate>
```

---

## 3. API Usage

### Date Format

**Format**: `YYYY/MM/DD`

### E-utilities Parameters

```
mindate=2023/01/01&maxdate=2023/12/31&datetype=pdat
```

Date types: `pdat` (publication), `edat` (entrez), `mdat` (modification)

### Inline Search Syntax

```
("2023/01/01"[dp] : "2023/12/31"[dp])
```

### Sorting

| Sort Value | What It Does |
|------------|--------------|
| _(omitted)_ | Relevance (default) |
| `pub_date` | Publication Date (newest first) |
| `Author` | Author name (A-Z) |
| `JournalName` | Journal title (A-Z) |

---

## 4. Common Use Cases

### Recent Publications (Last 3 Months)

```python
search_articles(
    query="CRISPR gene editing",
    start_date="2024/08/15",
    end_date="2024/11/15",
    date_type="publication",
    sort_by="date"
)
```

Query: `CRISPR gene editing AND ("2024/08/15"[DP] : "2024/11/15"[DP])`

### Newly Indexed Articles

```python
search_articles(
    query="immunotherapy",
    start_date="2024/11/08",
    end_date="2024/11/15",
    date_type="entry",
    sort_by="date"
)
```

Query: `immunotherapy AND ("2024/11/08"[EDAT] : "2024/11/15"[EDAT])`

### Recently Updated Records

```python
search_articles(
    query="retinopathy",
    start_date="2024/10/15",
    end_date="2024/11/15",
    date_type="revised",
    sort_by="date"
)
```

---

## 5. Important Timing Considerations

### Electronic vs Print

- Many articles are available online weeks/months before print issue
- Example: Online Jan 7, Print issue Feb 1
- `[dp]` will match January search (uses earlier date)
- **This is why search results may show "February" articles in January results if we display print date instead of electronic date**

### Entry Date Timing

- May be days/weeks after publication
- Depends on journal indexing speed
- Used by PubMed for "Most Recent" sort order

### MeSH Date Timing

- Set when MeSH terms are added (article becomes MEDLINE)
- Until then, equals Entry Date
- Can be months after entry for some articles

### Completion Date Gaps

- Older records may not have completion dates
- Some record types don't get completion dates

---

## 6. Our Implementation

### How We Derive `pub_year`/`pub_month`/`pub_day`

Our publication date fields mirror PubMed's `[dp]` virtual field. In `pubmed_service.py`, we compute them as the **earlier** of the two source XML fields:

| XML Field | Path | Role |
|-----------|------|------|
| **PubDate** | `Article/Journal/JournalIssue/PubDate` | Print/journal issue date (always present, variable precision) |
| **ArticleDate** | `Article/ArticleDate[@DateType="Electronic"]` | Electronic publication date (optional, full precision) |

**Algorithm:**
1. Parse year/month/day from PubDate (month may be text like "Jan", day may be absent)
2. If ArticleDate exists, parse its year/month/day
3. Compare using tuples — missing month/day default to 12/28 (biasing toward "later" so imprecise dates don't spuriously win)
4. Use whichever is earlier

This means our `pub_year`/`pub_month`/`pub_day` may come from either XML field depending on which date is earlier for a given article.

For full details on our date storage model, see [Article Dates](../../backend/docs/article_dates.md).

### Search Date Field Mapping

```python
# In pubmed_service.py
date_field_map = {
    "publication": "DP",   # Default - combined electronic + print
    "entry": "EDAT",
    "completion": "DCOM",
    "revised": "LR"
}
# Note: We don't currently expose [epdat], [ppdat], [crdt], or [mhda]
```

### Sort Mapping

```python
sort_mapping = {
    'relevance': None,
    'date': 'pub_date'
}
```

### Function Signature

```python
def search_articles(
    query: str,
    max_results: int = 100,
    offset: int = 0,
    sort_by: str = "relevance",      # "relevance" or "date"
    start_date: Optional[str] = None, # Format: "YYYY/MM/DD"
    end_date: Optional[str] = None,   # Format: "YYYY/MM/DD"
    date_type: Optional[str] = None   # "publication", "completion", "entry", "revised"
) -> tuple[List[CanonicalResearchArticle], Dict[str, Any]]
```

---

## 7. Quick Decision Tree

**Which date type should I use?**

```
Do you want articles by when they became available?
  └─ YES → date_type="publication" [dp]
           Note: This matches electronic date if earlier than print

Do you want newly indexed articles (regardless of pub date)?
  └─ YES → date_type="entry" [edat]

Do you want recently updated/corrected articles?
  └─ YES → date_type="revised" [lr]
```

---

## 8. API Constraints

| Limit | Value |
|-------|-------|
| Max results per query | 10,000 |
| Rate limit | 3 req/sec (10 with API key) |

---

## 9. External Resources

- [PubMed Help - Date Searching](https://pubmed.ncbi.nlm.nih.gov/help/#date-search)
- [E-utilities Documentation](https://www.ncbi.nlm.nih.gov/books/NBK25499/)
- [Search Field Tags](https://www.ncbi.nlm.nih.gov/books/NBK49540/)
- [PubMedPubDate DTD](https://dtd.nlm.nih.gov/ncbi/pubmed/doc/out/180101/el-PubMedPubDate.html)
