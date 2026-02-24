# Report Methods Audit - THE MESS

## The Methods

### 1. `get_report_with_access(report_id, user_id)`
**Location**: `report_service.py:650`
**Returns**: `(report, user, stream)` tuple
**Purpose**: Access check + fetch report/stream

**Callers** (15+):
- `get_report_with_articles`
- `get_report_articles_list`
- `generate_report_email_html`
- Many other report_service methods
- `prompt_testing_service`
- `curation.py`

**Verdict**: ✅ This is the right foundation - access check with report+stream fetch.

---

### 2. `get_visible_for_report(report_id)`
**Location**: `report_article_association_service.py:174`
**Returns**: `List[ReportArticleAssociation]` (with eager-loaded `.article`)
**Filters**: `is_hidden == False`, ordered by `ranking`

**Callers** (12+):
- `generate_report_email_html`
- `get_report_articles_list`
- `chat_stream_service` (for context)
- `pipeline_service` (4 places)
- `curation.py` (2 places)
- Several regeneration methods

**Verdict**: ✅ This is the canonical way to get visible articles.

---

### 3. `get_report_with_articles(user, report_id)`
**Location**: `report_service.py:755`
**Returns**: `ReportWithArticlesData`

**What it does**:
```python
access_result = await self.get_report_with_access(report_id, user.user_id)
# ... then CUSTOM QUERY:
stmt = (
    select(ReportArticleAssociation, Article)
    .join(Article, ...)
    .where(ReportArticleAssociation.report_id == report_id)  # NO is_hidden filter!
    .order_by(ReportArticleAssociation.ranking)
)
```

**Problems**:
1. ❌ Has its own query instead of calling `get_visible_for_report`
2. ❌ Does NOT filter `is_hidden == False` - returns ALL articles including hidden
3. ❌ Duplicates query logic

**Callers**:
- `routers/reports.py:151` - Main endpoint `GET /api/reports/{report_id}`
- `routers/reports.py:303` - `generate_report_email` just to get `report_name`
- `routers/reports.py:342` - `store_report_email` just to get `report_name`
- `routers/reports.py:381` - `get_report_email` just to get `report_name`
- `routers/reports.py:425` - `send_report_email` just to get `report_name`

**Verdict**: ⚠️ PROBLEMATIC - Custom query, no hidden filter, called 4x just for report_name

---

### 4. `get_report_articles_list(report_id, user_id)`
**Location**: `report_service.py:805`
**Returns**: `ReportArticlesListData` (with resolved category names)

**What it does**:
```python
result = await self.get_report_with_access(report_id, user_id)
# ... builds category_map from stream.presentation_config
visible_associations = await self.association_service.get_visible_for_report(report_id)
# ... maps category IDs to names
```

**Callers**:
- `tools/builtin/reports.py:195` - Chat tool only

**Verdict**: ✅ Uses the right methods, but only used by chat.

---

## The Problems Visualized

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  CURRENT STATE - A MESS                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  get_report_with_access ◄──────────────────┬─────────────────────────────── │
│         │                                   │                                │
│         │                                   │                                │
│         ▼                                   ▼                                │
│  ┌──────────────────────┐          ┌──────────────────────┐                 │
│  │ get_report_with_     │          │ get_report_articles_ │                 │
│  │ articles             │          │ list                 │                 │
│  │                      │          │                      │                 │
│  │ - CUSTOM QUERY ❌    │          │ - calls              │                 │
│  │ - NO hidden filter ❌│          │   get_visible_for_   │                 │
│  │ - returns ALL        │          │   report ✅          │                 │
│  │   articles           │          │ - maps categories    │                 │
│  └──────────────────────┘          └──────────────────────┘                 │
│         │                                   │                                │
│         │ Called by:                        │ Called by:                     │
│         │ - Router endpoint                 │ - Chat tool only               │
│         │ - Email endpoints x4              │                                │
│         │   (JUST FOR REPORT NAME!)         │                                │
│                                                                              │
│  get_visible_for_report ◄── Used by everyone EXCEPT get_report_with_articles│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Specific Stupidity: Email Endpoints

```python
# routers/reports.py:303 - generate_report_email
html = await service.generate_report_email_html(current_user, report_id)
report_data = await service.get_report_with_articles(current_user, report_id)  # JUST FOR THIS:
report_name = report_data.report.report_name

# routers/reports.py:342 - store_report_email
report_data = await service.get_report_with_articles(current_user, report_id)  # JUST FOR THIS:
report_name = report_data.report.report_name

# routers/reports.py:381 - get_report_email
report_data = await service.get_report_with_articles(current_user, report_id)  # JUST FOR THIS:
report_name = report_data.report.report_name

# routers/reports.py:425 - send_report_email
report = await service.get_report_with_articles(current_user, report_id)  # JUST FOR THIS:
report_name = report.report.report_name
```

**Each of these**:
1. Already called a method that has `get_report_with_access` which returns `(report, user, stream)`
2. Then calls `get_report_with_articles` which ALSO calls `get_report_with_access`
3. Fetches ALL articles with their associations
4. Just to get `report.report_name`

---

## What SHOULD Exist

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  PROPOSED CLEAN ARCHITECTURE                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  LAYER 1: Access & Basic Info                                                │
│  ─────────────────────────────                                               │
│  get_report_with_access(report_id, user_id)                                 │
│      Returns: (report, user, stream)                                         │
│      - Access check                                                          │
│      - Report metadata (name, date, enrichments)                             │
│      - Stream config (for category mapping)                                  │
│                                                                              │
│  LAYER 2: Article Fetching                                                   │
│  ─────────────────────────                                                   │
│  get_visible_for_report(report_id)  ◄── SINGLE SOURCE OF TRUTH              │
│      Returns: List[ReportArticleAssociation] with .article                  │
│      - Filters is_hidden                                                     │
│      - Orders by ranking                                                     │
│      - Eager loads article                                                   │
│                                                                              │
│  LAYER 3: Composed Methods (if needed)                                       │
│  ─────────────────────────────────────                                       │
│  get_report_with_visible_articles(user, report_id)                          │
│      - Calls get_report_with_access                                          │
│      - Calls get_visible_for_report                                          │
│      - Returns combined data                                                 │
│                                                                              │
│  UTILITIES:                                                                  │
│  ──────────                                                                  │
│  build_category_map(stream) → Dict[id, name]                                │
│      - Single place for ID→name mapping                                      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Recommended Fixes

### Fix 1: Email endpoints should not call `get_report_with_articles`

The email generation method already has the report from `get_report_with_access`. Return the report_name from the service method or make it available without fetching all articles.

### Fix 2: `get_report_with_articles` should use `get_visible_for_report`

Instead of custom query, it should call the canonical method and filter hidden articles.

### Fix 3: Consider if `get_report_with_articles` should even exist

Maybe the router should:
1. Call `get_report_with_access` for report metadata
2. Call `get_visible_for_report` for articles
3. Compose the response itself

### Fix 4: Extract category mapping utility

```python
def build_category_id_to_name_map(stream: ResearchStream) -> Dict[str, str]:
    """Build mapping from category ID to display name."""
    if not stream.presentation_config:
        return {}
    return {
        cat.get('id', ''): cat.get('name', cat.get('id', ''))
        for cat in stream.presentation_config.get('categories', [])
        if isinstance(cat, dict)
    }
```
