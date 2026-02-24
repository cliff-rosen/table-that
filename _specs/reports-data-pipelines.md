# Reports Data Pipelines Comparison

This document compares how the Reports Page and Email Generation fetch and assemble article/category data.

---

## Pipeline 1: Reports Page

### Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ReportsPage.tsx                                                             │
│      │                                                                       │
│      ├── 1. researchStreamApi.getResearchStream(streamId)                   │
│      │       └── Returns: streamDetails (includes presentation_config)       │
│      │                                                                       │
│      └── 2. reportApi.getReportWithArticles(reportId)                       │
│              └── GET /api/reports/{report_id}                               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  GET /api/reports/{report_id}                        (routers/reports.py:138)│
│      │                                                                       │
│      ▼                                                                       │
│  service.get_report_with_articles(user, report_id)   (report_service.py:755)│
│      │                                                                       │
│      ├── get_report_with_access(report_id, user_id)                         │
│      │       └── Returns: (report, user, stream)                            │
│      │                                                                       │
│      ├── Query: SELECT assoc, article                                        │
│      │          FROM report_article_associations                             │
│      │          JOIN articles                                                │
│      │          WHERE report_id = ?                                          │
│      │          ORDER BY ranking                                             │
│      │                                                                       │
│      └── Returns: ReportWithArticlesData                                     │
│              - report                                                        │
│              - articles: [ReportArticleInfo(article, association)]          │
│              - article_count                                                 │
│              - retrieval_params                                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        ROUTER RESPONSE TRANSFORM                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  routers/reports.py:169-192                                                  │
│      │                                                                       │
│      └── For each article, builds ReportArticleSchema:                      │
│              article_id, title, authors, journal, publication_date,         │
│              pmid, doi, abstract, url, year,                                │
│              relevance_score, relevance_rationale, ranking,                 │
│              is_starred, is_read, notes,                                    │
│              presentation_categories ◄── RAW IDs (e.g., "clinical_trials") │
│              ai_summary, ai_enrichments                                     │
│                                                                              │
│  NOTE: Returns category IDs, NOT display names                              │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        FRONTEND CATEGORY MAPPING                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ReportsPage.tsx:307-336 (getArticlesByCategory)                            │
│      │                                                                       │
│      ├── Get categories from streamDetails.presentation_config.categories   │
│      │       └── [{id: "clinical_trials", name: "Clinical Trials"}, ...]    │
│      │                                                                       │
│      ├── Build categoryMap keyed by ID:                                     │
│      │       categoryMap[cat.id] = { category: cat, articles: [] }          │
│      │                                                                       │
│      ├── For each article:                                                   │
│      │       catId = article.presentation_categories[0]  ◄── ID             │
│      │       categoryMap[catId].articles.push(article)                      │
│      │                                                                       │
│      └── Display uses: data.category.name  ◄── Display name                 │
│                                                                              │
│  Category summaries accessed via:                                            │
│      selectedReport.enrichments?.category_summaries?.[categoryId]           │
│      (keyed by ID)                                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

| Step | Location | What It Does |
|------|----------|--------------|
| 1 | Frontend | Fetch `streamDetails` (has category definitions with id/name) |
| 2 | Frontend | Fetch `reportWithArticles` (has articles with category IDs) |
| 3 | Backend | `get_report_with_articles` - returns raw IDs in `presentation_categories` |
| 4 | Router | Transforms to schema, passes through IDs unchanged |
| 5 | Frontend | Builds mapping from `streamDetails.presentation_config.categories` |
| 6 | Frontend | Resolves IDs to names using the mapping |

**Key Point**: Frontend does the ID → name mapping because it already has `streamDetails`.

---

## Pipeline 2: Email Generation

### Sequence Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  EmailPreviewModal (or similar)                                              │
│      │                                                                       │
│      └── POST /api/reports/{report_id}/email/generate                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              BACKEND                                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  POST /api/reports/{report_id}/email/generate        (routers/reports.py:280)│
│      │                                                                       │
│      ▼                                                                       │
│  service.generate_report_email_html(user, report_id) (report_service.py:1012)│
│      │                                                                       │
│      ├── get_report_with_access(report_id, user_id)                         │
│      │       └── Returns: (report, user, stream)                            │
│      │                                                                       │
│      ├── association_service.get_visible_for_report(report_id)              │
│      │       └── Returns: [associations with eager-loaded article]          │
│      │       └── Filters: is_hidden == False                                │
│      │       └── Orders by: ranking                                         │
│      │                                                                       │
│      ├── BUILD CATEGORY ID → NAME MAPPING (lines 1027-1031):                │
│      │       category_id_to_name = {}                                        │
│      │       for cat in stream.presentation_config.categories:              │
│      │           category_id_to_name[cat.id] = cat.name                     │
│      │                                                                       │
│      ├── GROUP ARTICLES BY CATEGORY (lines 1034-1050):                      │
│      │       categories_dict: Dict[cat_id, List[EmailArticle]]              │
│      │       for assoc in associations:                                      │
│      │           for cat_id in assoc.presentation_categories:               │
│      │               categories_dict[cat_id].append(EmailArticle(...))      │
│      │                                                                       │
│      ├── GET ENRICHMENTS (lines 1052-1055):                                 │
│      │       enrichments = report.enrichments                                │
│      │       executive_summary = enrichments['executive_summary']           │
│      │       category_summaries = enrichments['category_summaries']         │
│      │       (category_summaries keyed by ID)                               │
│      │                                                                       │
│      ├── BUILD EMAIL CATEGORIES (lines 1057-1066):                          │
│      │       for cat_id, articles in categories_dict:                       │
│      │           EmailCategory(                                              │
│      │               id=cat_id,                                              │
│      │               name=category_id_to_name.get(cat_id, cat_id),          │
│      │               summary=category_summaries.get(cat_id, ''),            │
│      │               articles=articles                                       │
│      │           )                                                           │
│      │                                                                       │
│      └── EmailTemplateService().generate_report_email(email_data)           │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Flow Summary

| Step | Location | What It Does |
|------|----------|--------------|
| 1 | Backend | `get_report_with_access` - gets report, user, stream |
| 2 | Backend | `get_visible_for_report` - gets visible articles |
| 3 | Backend | Builds ID → name mapping from `stream.presentation_config.categories` |
| 4 | Backend | Groups articles by category ID |
| 5 | Backend | Gets `category_summaries` from `report.enrichments` (keyed by ID) |
| 6 | Backend | Resolves IDs to names, attaches summaries |
| 7 | Backend | Generates HTML |

**Key Point**: Backend does the ID → name mapping because there's no frontend.

---

## Comparison

| Aspect | Reports Page | Email Generation |
|--------|--------------|------------------|
| **Who fetches articles** | Backend: `get_report_with_articles` | Backend: `get_visible_for_report` |
| **Article query** | Custom SELECT with JOIN | `association_service.get_visible_for_report` |
| **Hidden articles** | Includes ALL articles | Filters `is_hidden == False` |
| **Who maps ID → name** | Frontend | Backend |
| **Where mapping data comes from** | `streamDetails.presentation_config` | `stream.presentation_config` |
| **Category summaries source** | `report.enrichments.category_summaries` | `report.enrichments.category_summaries` |
| **Category summaries key** | Category ID | Category ID |

---

## Issues Identified

### 1. Different Article Queries

**Reports Page** uses a custom query in `get_report_with_articles`:
```python
stmt = (
    select(ReportArticleAssociation, Article)
    .join(Article, ...)
    .where(ReportArticleAssociation.report_id == report_id)
    .order_by(ReportArticleAssociation.ranking)
)
```

**Email Generation** uses the service method:
```python
associations = await self.association_service.get_visible_for_report(report_id)
```

**Problem**: `get_report_with_articles` returns ALL articles. `get_visible_for_report` filters `is_hidden == False`. Should they be consistent?

### 2. Duplicate ID → Name Mapping Logic

The same mapping logic exists in three places:

1. **Frontend** (`ReportsPage.tsx:311-316`):
   ```tsx
   categories.forEach(cat => {
       categoryMap[cat.id] = { category: cat, articles: [] };
   });
   ```

2. **Backend `get_report_articles_list`** (`report_service.py:831-836`):
   ```python
   for cat in categories:
       category_map[cat.get("id", "")] = cat.get("name", ...)
   ```

3. **Backend `generate_report_email_html`** (`report_service.py:1027-1031`):
   ```python
   for cat in stream.presentation_config.get('categories', []):
       category_id_to_name[cat.get('id', '')] = cat.get('name', ...)
   ```

### 3. `get_report_articles_list` vs `get_report_with_articles`

There are two similar methods:

| Method | Returns | Does Mapping | Used By |
|--------|---------|--------------|---------|
| `get_report_with_articles` | `ReportWithArticlesData` with raw IDs | No | Router → Frontend |
| `get_report_articles_list` | `ReportArticlesListData` with BOTH names and IDs | Yes | Chat tools |

**Question**: Should `get_report_with_articles` also return resolved names, or is the current approach (letting frontend map) intentional?

---

## Potential Refactoring Options

### Option A: Keep Current Architecture
- Frontend has `streamDetails`, so it can do the mapping
- Backend only maps when frontend isn't involved (email)
- **Pros**: Minimal change, frontend already works
- **Cons**: Duplicate mapping logic

### Option B: Backend Always Returns Both IDs and Names
- Modify `get_report_with_articles` to include `category_names` alongside `presentation_categories`
- **Pros**: Frontend doesn't need to map
- **Cons**: Slightly larger payload, still need stream access in backend

### Option C: Extract Shared Mapping Helper
- Create a utility function for ID → name mapping
- Use it in all three places
- **Pros**: DRY principle
- **Cons**: Still doing mapping in multiple layers

### Option D: Store Category Names in Association
- When pipeline categorizes, store both ID and name
- **Pros**: No runtime mapping needed
- **Cons**: Denormalized data, breaks if category renamed
