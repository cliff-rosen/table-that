# ReportArticleAssociation Access Refactoring Plan

## Current State Problems

1. **Scattered direct SQL queries** - Multiple services query the table directly instead of using the association service
2. **Duplicate logic** - Same queries written in multiple places (count, find by IDs)
3. **Inconsistent patterns** - Some code uses service, some uses raw SQL
4. **Legacy sync code** - `tools/builtin/reports.py` uses synchronous queries

---

## Target Architecture

### Principle: Single Point of Access

**All reads and writes to `ReportArticleAssociation` go through `ReportArticleAssociationService`.**

Other services inject the association service and call its methods. No direct imports of the `ReportArticleAssociation` model for queries outside the service.

```
┌─────────────────────────────────────────────────────────────────┐
│                         ROUTERS                                  │
│  reports.py, curation.py, notes.py                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATING SERVICES                        │
│  ReportService, PipelineService, NotesService, OperationsService │
│                                                                  │
│  - Handle access control (user can access report?)               │
│  - Orchestrate multi-step operations                             │
│  - Call association service for data operations                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              ReportArticleAssociationService                     │
│                                                                  │
│  - ALL queries to ReportArticleAssociation table                 │
│  - ALL mutations to ReportArticleAssociation table               │
│  - In-memory helpers for batch updates                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ReportArticleAssociation                      │
│                         (Model)                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## ReportArticleAssociationService Methods

### Reads

```python
class ReportArticleAssociationService:
    """Single point of access for ReportArticleAssociation table."""

    # === Single Record ===

    async def find(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """Find association by composite key. Returns None if not found."""

    async def get(self, report_id: int, article_id: int) -> ReportArticleAssociation:
        """Get association by composite key. Raises 404 if not found."""

    # === Collections for Report ===

    async def get_all_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """All associations for a report (visible + hidden)."""

    async def get_visible_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Visible (non-hidden) associations, ordered by ranking."""

    async def get_hidden_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Hidden associations only."""

    async def get_curator_added_for_report(self, report_id: int) -> List[ReportArticleAssociation]:
        """Curator-added associations only."""

    # === Counts ===

    async def count_all(self, report_id: int) -> int:
        """Count all associations for a report."""

    async def count_visible(self, report_id: int) -> int:
        """Count visible (non-hidden) associations."""

    # === Utilities ===

    async def get_next_ranking(self, report_id: int) -> int:
        """Get the next available ranking value."""
```

### Writes

```python
    # === Single Record Mutations ===

    async def create(
        self,
        report_id: int,
        article_id: int,
        ranking: int,
        presentation_categories: Optional[List[str]] = None,
        ai_summary: Optional[str] = None,
        relevance_score: Optional[float] = None,
        curator_added: bool = False,
        wip_article_id: Optional[int] = None
    ) -> ReportArticleAssociation:
        """Create a new association."""

    async def delete(self, association: ReportArticleAssociation) -> None:
        """Delete a single association."""

    async def delete_by_ids(self, report_id: int, article_id: int) -> bool:
        """Delete by composite key. Returns True if deleted."""

    # === Bulk Mutations ===

    async def delete_all_for_report(self, report_id: int) -> int:
        """Delete all associations for a report. Returns count deleted."""

    async def bulk_create(
        self,
        report_id: int,
        items: List[AssociationCreateInput]
    ) -> List[ReportArticleAssociation]:
        """Bulk create associations."""

    # === Field Updates ===

    async def update_enrichments(
        self,
        report_id: int,
        article_id: int,
        ai_enrichments: Dict[str, Any]
    ) -> Optional[ReportArticleAssociation]:
        """Update AI enrichments field."""

    async def update_notes(
        self,
        report_id: int,
        article_id: int,
        notes: List[Dict[str, Any]]
    ) -> Optional[ReportArticleAssociation]:
        """Update notes field."""

    # === In-Memory Helpers (no DB queries, modify objects) ===

    def set_hidden(self, association: ReportArticleAssociation, hidden: bool) -> None:
        """Set is_hidden flag."""

    def update_ranking(self, association: ReportArticleAssociation, ranking: int) -> None:
        """Update ranking."""

    def update_categories(self, association: ReportArticleAssociation, categories: List[str]) -> None:
        """Update presentation_categories."""

    def update_ai_summary(self, association: ReportArticleAssociation, summary: str) -> None:
        """Update ai_summary (preserves original on first edit)."""

    def bulk_update_categories_from_pipeline(
        self,
        results: List[Tuple[ReportArticleAssociation, str]]
    ) -> int:
        """Bulk update categories from pipeline results."""

    def bulk_update_ai_summaries_from_pipeline(
        self,
        results: List[Tuple[ReportArticleAssociation, str]]
    ) -> int:
        """Bulk update summaries from pipeline results."""
```

---

## Migration: What Changes in Each Service

### ReportService

**Current:** Direct SQL for counts and bulk delete

**After:**
```python
class ReportService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.association_service = ReportArticleAssociationService(db)

    async def get_report_with_articles(self, user_id: int, report_id: int):
        # Use association service instead of direct query
        associations = await self.association_service.get_visible_for_report(report_id)
        article_count = len(associations)
        # ...

    async def delete_report(self, user: User, report_id: int):
        # Use association service for bulk delete
        await self.association_service.delete_all_for_report(report_id)
        # Then delete report
```

**Remove:** All direct `select(ReportArticleAssociation)` and `select(func.count(...))` queries

---

### NotesService

**Current:** Has its own `_async_get_article_association()` method

**After:**
```python
class NotesService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.association_service = ReportArticleAssociationService(db)

    async def get_notes(self, report_id: int, article_id: int) -> List[Note]:
        association = await self.association_service.find(report_id, article_id)
        if not association:
            raise HTTPException(404, "Article not found in report")
        return association.notes or []

    async def add_note(self, report_id: int, article_id: int, note: NoteCreate) -> Note:
        association = await self.association_service.get(report_id, article_id)
        notes = association.notes or []
        notes.append(note.model_dump())
        await self.association_service.update_notes(report_id, article_id, notes)
        return note
```

**Remove:** `_async_get_article_association()` method

---

### OperationsService

**Current:** Direct SQL joins and counts

**After:**
```python
class OperationsService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.association_service = ReportArticleAssociationService(db)

    async def get_report_stats(self, report_id: int) -> ReportStats:
        article_count = await self.association_service.count_visible(report_id)
        # ...
```

**Remove:** All direct queries to ReportArticleAssociation

---

### PipelineService

**Current:** Already uses association service for most operations, but creates associations directly

**After:**
```python
class PipelineService:
    # Keep using association_service.get_visible_for_report() - this is correct

    async def _create_associations(self, ctx: PipelineContext):
        # Use bulk_create instead of direct instantiation
        items = [
            AssociationCreateInput(
                article_id=wip.article_id,
                wip_article_id=wip.wip_article_id,
                ranking=idx + 1,
                relevance_score=wip.relevance_score
            )
            for idx, wip in enumerate(ctx.wip_articles)
        ]
        await self.association_service.bulk_create(ctx.report.report_id, items)
```

---

### tools/builtin/reports.py (Legacy Sync)

**Current:** Synchronous direct SQL queries

**Options:**
1. **Convert to async** - Use association service async methods
2. **Create sync wrappers** - If sync is required, add sync methods to service
3. **Deprecate** - If this is legacy code being phased out

**Recommended:** If these are MCP tools that need sync, add sync wrappers:

```python
class ReportArticleAssociationService:
    # Sync wrappers for legacy code
    def find_sync(self, report_id: int, article_id: int) -> Optional[ReportArticleAssociation]:
        """Synchronous version for legacy tools."""
        result = self.db.execute(
            select(ReportArticleAssociation).where(...)
        )
        return result.scalars().first()
```

---

## File Changes Summary

| File | Action |
|------|--------|
| `report_article_association_service.py` | Add missing methods: `count_all`, `update_notes`, `bulk_create` |
| `report_service.py` | Remove direct SQL, use association service |
| `notes_service.py` | Remove `_async_get_article_association`, use association service |
| `operations_service.py` | Remove direct SQL, use association service |
| `pipeline_service.py` | Use `bulk_create` instead of direct instantiation |
| `tools/builtin/reports.py` | Either add sync wrappers or convert to async |

---

## Import Rules

### Allowed
```python
# In services that orchestrate operations
from services.report_article_association_service import (
    ReportArticleAssociationService,
    get_association_service
)
```

### Not Allowed (after refactor)
```python
# Direct model import for queries - WRONG
from models import ReportArticleAssociation

# Then using it in queries - WRONG
result = await db.execute(
    select(ReportArticleAssociation).where(...)
)
```

### Exception: Type Hints Only
```python
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from models import ReportArticleAssociation

# OK for type hints
def process(self, assoc: "ReportArticleAssociation") -> None:
    ...
```

---

## Transaction Management

The association service methods that write should **not commit** by default. The calling service controls the transaction:

```python
class ReportArticleAssociationService:
    async def create(self, ..., auto_commit: bool = False) -> ReportArticleAssociation:
        association = ReportArticleAssociation(...)
        self.db.add(association)
        if auto_commit:
            await self.db.commit()
        return association

class ReportService:
    async def complex_operation(self, ...):
        # Multiple writes in one transaction
        await self.association_service.create(..., auto_commit=False)
        await self.association_service.create(..., auto_commit=False)
        self.report.status = "complete"
        await self.db.commit()  # Single commit
```

---

## Exception: Legacy Sync Tools

**File:** `tools/builtin/reports.py`

These are MCP/chat tools that use synchronous `Session` (not `AsyncSession`). The association service is async-only.

**Decision:** Keep direct queries for now.

**Rationale:**
- Adding sync wrappers would require dual-path code in the service
- These tools do complex joins across Article/Association/Report that don't fit neatly into the association service's scope
- The chat tools may be migrated to async in the future

**Allowed in this file:**
```python
from models import Report, Article, ReportArticleAssociation, User

# Direct sync queries are OK here
article_count = db.query(ReportArticleAssociation).filter(...).count()
```

**Future migration:** When chat tools are converted to async, migrate to use the association service.

---

## Implementation Status

| Service | Status |
|---------|--------|
| `ReportArticleAssociationService` | Added missing methods (count_all, update_notes, bulk_create) |
| `ReportService` | Migrated - uses association service for counts and deletes |
| `NotesService` | Migrated - removed `_async_get_article_association()` |
| `OperationsService` | Migrated - uses association service for counts and visible articles |
| `PipelineService` | Migrated - uses `bulk_create()` for association creation |
| `tools/builtin/reports.py` | **Exception** - keeps direct sync queries (see above) |

---

## Benefits of This Refactor

1. **Single source of truth** - All association logic in one place
2. **Easier testing** - Mock one service instead of scattered queries
3. **Consistent behavior** - Same eager loading, ordering everywhere
4. **Clear ownership** - Association service owns the table
5. **Reduced duplication** - Count logic written once
6. **Type safety** - Consistent return types
7. **Transaction control** - Callers control commit boundaries
