# Article Dates

Single source of truth for how we handle article dates in our application.

For PubMed date concepts and XML fields, see [PubMed Dates Reference](../../_specs/search/pubmed-dates-reference.md).

---

## 1. Overview

We handle dates for two purposes:
1. **Searching/sorting** - filtering articles by date range
2. **Display** - showing users when an article was published

### The Honest Date Approach

PubMed provides publication dates with varying precision:
- Some articles have full dates: `2026-01-15`
- Some have only month: `2026-01` (day unknown)
- Some have only year: `2026` (month and day unknown)

**Problem with the old approach:** We stored dates as a `Date` type, which fabricated precision by defaulting missing day/month to `01`. This caused confusion when users saw "January 1st" for articles that were actually just "sometime in 2026".

**Solution:** We now store three separate integer fields that honestly represent only what we know:
- `pub_year` (int) - Always present
- `pub_month` (int, nullable) - 1-12 when known
- `pub_day` (int, nullable) - 1-31 when known

---

## 2. Our Article Type Objects

### Summary Table

| # | Object | Location | Date Fields |
|---|--------|----------|-------------|
| 1 | PubMedArticle | `services/pubmed_service.py` | pub_year, pub_month, pub_day, entry_date, comp_date, date_revised |
| 2 | CanonicalResearchArticle | `schemas/canonical_types.py` | pub_year, pub_month, pub_day, date_completed, date_revised, date_entered |
| 3 | WipArticle (model) | `models.py` | pub_year, pub_month, pub_day |
| 4 | WipArticle (schema) | `schemas/research_stream.py` | pub_year, pub_month, pub_day |
| 5 | Article (model) | `models.py` | pub_year, pub_month, pub_day, comp_date |
| 6 | Article (schema) | `schemas/article.py` | pub_year, pub_month, pub_day |
| 7 | ReportArticle | `schemas/report.py` | pub_year, pub_month, pub_day |

### Type Architecture

```
PubMed XML
       │
       ▼
PubMedArticle (parsing)
       │  Parses year/month/day separately from XML
       │  Converted via pubmed_article_to_research()
       ▼
CanonicalResearchArticle ───► Universal interface for ALL sources
       │                      (PubMed, Google Scholar, future sources)
       ▼
WipArticle ─────────────────► Pipeline intermediate storage (database)
       │
       ▼
Article ────────────────────► Permanent storage (database)
       │
       ▼
ReportArticle ──────────────► Report presentation (API response)
       │
       ▼
Frontend Types ─────────────► Display with formatArticleDate() utility
```

**Key point:** CanonicalScholarArticle is a backend-only transient type. PubMedArticle converts directly to CanonicalResearchArticle via `pubmed_article_to_research()`. The frontend only sees CanonicalResearchArticle.

---

## 3. Date Field Details

### 3.1 PubMedArticle

**Location:** `backend/services/pubmed_service.py`

| Field | Type | XML Source | Semantic |
|-------|------|------------|----------|
| `pub_year` | int | Computed (see below) | Publication year (always present) |
| `pub_month` | int \| None | Computed (see below) | Publication month (1-12, when available) |
| `pub_day` | int \| None | Computed (see below) | Publication day (1-31, when available) |
| `entry_date` | date \| None | `PubMedPubDate[@PubStatus="entrez"]` | When added to PubMed |
| `comp_date` | date \| None | `DateCompleted` | When MEDLINE indexing completed |
| `date_revised` | date \| None | `DateRevised` | When record last revised |

**How `pub_year`/`pub_month`/`pub_day` are derived:**

These fields mirror PubMed's `[dp]` (Publication Date) virtual field — they represent the **earlier** of the print date and the electronic date. The derivation has two steps:

1. **Start with PubDate** (`Article/Journal/JournalIssue/PubDate`):
   - Parse `<Year>` (always present), `<Month>` (text like "Jan" or numeric, may be absent), `<Day>` (may be absent)
   - Month names are normalized to integers (Jan→1, Feb→2, etc.)
   - No fabrication of missing precision — if Day is absent, `pub_day` stays None

2. **Compare with ArticleDate** (`Article/ArticleDate[@DateType="Electronic"]`), if present:
   - Parse its `<Year>`, `<Month>`, `<Day>` (ArticleDate always has full precision when it exists)
   - Build comparable tuples: missing month/day default to 12/28 (biasing toward "later" so imprecise dates don't win the comparison spuriously)
   - **If the electronic date is earlier → replace all three pub fields with the electronic date values**
   - If the electronic date is the same or later → keep the PubDate values

**Why:** Many articles appear online weeks or months before their print journal issue. Using the earlier date matches what PubMed displays and avoids confusing results where an article found in a January date search shows "February 2026" because we only stored the print date.

**Example:**
```
PubDate:     <Year>2026</Year><Month>Feb</Month>          → (2026, 2, None)
ArticleDate: <Year>2026</Year><Month>01</Month><Day>07</Day> → (2026, 1, 7)

ArticleDate is earlier → pub_year=2026, pub_month=1, pub_day=7
```

### 3.2 CanonicalResearchArticle

**Location:** `backend/schemas/canonical_types.py`

| Field | Type | Semantic |
|-------|------|----------|
| `pub_year` | int \| None | Publication year |
| `pub_month` | int \| None | Publication month (1-12) |
| `pub_day` | int \| None | Publication day (1-31) |
| `date_completed` | str \| None | MEDLINE completion (YYYY-MM-DD) |
| `date_revised` | str \| None | Last revision (YYYY-MM-DD) |
| `date_entered` | str \| None | PubMed entry (YYYY-MM-DD) |

**Population:** `research_article_converters.py` → `pubmed_article_to_research()`

### 3.3 WipArticle (model)

**Location:** `backend/models.py`

| Column | Type | Semantic |
|--------|------|----------|
| `pub_year` | Integer | Publication year |
| `pub_month` | Integer | Publication month (1-12) |
| `pub_day` | Integer | Publication day (1-31) |

**Population:** `wip_article_service.py` → `create_wip_articles()`

### 3.4 Article (model)

**Location:** `backend/models.py`

| Column | Type | Semantic |
|--------|------|----------|
| `pub_year` | Integer | Publication year |
| `pub_month` | Integer | Publication month (1-12) |
| `pub_day` | Integer | Publication day (1-31) |
| `comp_date` | Date | MEDLINE completion |

**Population:** `article_service.py` → `find_or_create_from_wip()`

### 3.5 ReportArticle

**Location:** `backend/schemas/report.py`

| Field | Type | Semantic |
|-------|------|----------|
| `pub_year` | int \| None | Publication year |
| `pub_month` | int \| None | Publication month (1-12) |
| `pub_day` | int \| None | Publication day (1-31) |

**Population:** `routers/reports.py` and `report_service.py`

---

## 4. Data Flow Diagram

```
PubMed XML
    │
    │  <PubDate>                              <ArticleDate DateType="Electronic">
    │    <Year>2026</Year>                      <Year>2026</Year>
    │    <Month>Feb</Month>                     <Month>01</Month>
    │    <!-- No Day element -->                <Day>07</Day>
    │  </PubDate>                             </ArticleDate>
    │         \                               /
    │          \     compare: use earlier     /
    │           \           ▼               /
    │            └──────────┬──────────────┘
    │                       │
    ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│ PubMedArticle                                           │
│   pub_year = 2026     ← from ArticleDate (earlier)      │
│   pub_month = 1       ← from ArticleDate (earlier)      │
│   pub_day = 7         ← from ArticleDate (earlier)      │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ CanonicalResearchArticle (via pubmed_article_to_research)│
│   pub_year = 2026                                       │
│   pub_month = 1                                         │
│   pub_day = 7                                           │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ WipArticle → Article (database)                         │
│   pub_year = 2026                                       │
│   pub_month = 1                                         │
│   pub_day = 7                                           │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ ReportArticle (API response)                            │
│   pub_year = 2026                                       │
│   pub_month = 1                                         │
│   pub_day = 7                                           │
└─────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────┐
│ Frontend Display                                        │
│   formatArticleDate(2026, 1, 7) → "Jan 7, 2026"        │
│   ← DISPLAYS ONLY KNOWN PRECISION                       │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Frontend Display

### Date Formatting Utility

**Location:** `frontend/src/utils/dateUtils.ts`

```typescript
/**
 * Format a publication date with only the precision actually available.
 */
export function formatPubDate(
    year?: number | null,
    month?: number | null,
    day?: number | null,
    format: 'short' | 'long' = 'short'
): string {
    if (!year) return '';
    if (!month) return `${year}`;                    // "2026"
    if (!day) return `${monthName} ${year}`;         // "Jan 2026"
    return `${monthName} ${day}, ${year}`;           // "Jan 15, 2026"
}

// Convenience wrapper for article display
export function formatArticleDate(year?, month?, day?): string {
    return formatPubDate(year, month, day, 'short');
}

// Get just the year as string
export function getYearString(year?: number | null): string {
    return year ? `${year}` : '';
}
```

### Usage in Components

Components that display article dates use the utility:

```typescript
// In ReportArticleCard.tsx
{article.pub_year && (
    <span>• {formatArticleDate(article.pub_year, article.pub_month, article.pub_day)}</span>
)}

// In ArticleViewerModal.tsx
{article.pub_year && (
    <span>{formatArticleDate(article.pub_year, article.pub_month, article.pub_day)}</span>
)}
```

### Tablizer Display

For table-based displays (Tablizer component), we compute a `publication_date` string field:

```typescript
// Transform data for Tablizer column accessor
const displayArticles = articles.map(article => ({
    ...article,
    publication_date: formatArticleDate(article.pub_year, article.pub_month, article.pub_day)
}));
```

---

## 6. Database Schema

### Migration

**File:** `migrations/017_add_pub_date_fields.sql`

```sql
-- Add new columns to articles table
ALTER TABLE articles ADD COLUMN pub_year INT NULL;
ALTER TABLE articles ADD COLUMN pub_month INT NULL;
ALTER TABLE articles ADD COLUMN pub_day INT NULL;

-- Add new columns to wip_articles table
ALTER TABLE wip_articles ADD COLUMN pub_year INT NULL;
ALTER TABLE wip_articles ADD COLUMN pub_month INT NULL;
ALTER TABLE wip_articles ADD COLUMN pub_day INT NULL;

-- Migrate existing data (best effort from old publication_date)
UPDATE articles SET
    pub_year = YEAR(publication_date),
    pub_month = MONTH(publication_date),
    pub_day = DAY(publication_date)
WHERE publication_date IS NOT NULL;
```

### Legacy Fields (Removed)

The following fields have been removed from both the code and database:
- `publication_date` (Date) - Old fabricated-precision date (dropped in migration 018)
- `year` (String) - Old year-only field (dropped in migration 018)

All code uses `pub_year`, `pub_month`, `pub_day` exclusively.

---

## 7. Files Reference

| File | Purpose |
|------|---------|
| `services/pubmed_service.py` | PubMedArticle parsing with honest date extraction |
| `schemas/canonical_types.py` | CanonicalResearchArticle with pub_year/month/day |
| `schemas/research_article_converters.py` | Conversion between types |
| `services/wip_article_service.py` | WipArticle creation with date fields |
| `services/article_service.py` | Article creation with date fields |
| `schemas/article.py` | Article schema with pub_year/month/day |
| `schemas/report.py` | ReportArticle schema with pub_year/month/day |
| `schemas/research_stream.py` | WipArticle schema with pub_year/month/day |
| `models.py` | Database models with pub_year/month/day columns |
| `migrations/017_add_pub_date_fields.sql` | Database migration |

---

## 8. Frontend Types

| Backend | Frontend Location | Notes |
|---------|-------------------|-------|
| CanonicalResearchArticle | `types/canonical_types.ts` | 1:1 mirror with pub_year/month/day |
| WipArticle (model) | `types/research-stream.ts` | Has pub_year/month/day |
| Article (model) | `types/article.ts` | Has pub_year/month/day |
| ReportArticle | `types/report.ts` | Has pub_year/month/day |

### Frontend Utility Files

| File | Purpose |
|------|---------|
| `utils/dateUtils.ts` | `formatPubDate()`, `formatArticleDate()`, `getYearString()` |

---

## 9. Benefits of This Approach

1. **Honesty** - We only display what we actually know
2. **Clarity** - Users see "Jan 2026" not "Jan 1, 2026" for month-precision dates
3. **Simplicity** - No complex date parsing/formatting logic scattered throughout
4. **Flexibility** - Easy to adjust display format in one place
5. **Source agnostic** - Works for PubMed, Google Scholar, or any future source
