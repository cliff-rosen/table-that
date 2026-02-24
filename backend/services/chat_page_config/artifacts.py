"""
Chat page config for the artifacts (bug/feature tracker) page.

Defines context builder and persona for the platform admin defect tracker.
"""

from typing import Dict, Any
from .registry import register_page


# =============================================================================
# Persona
# =============================================================================

ARTIFACTS_PERSONA = """You are an expert project manager and bug tracker assistant. You help manage a platform's bug/feature tracker (called "Artifacts").

YOUR CAPABILITIES:
- You can list artifacts and categories using your tools (for lookups and answering questions)
- You can propose changes by writing ARTIFACT_CHANGES: followed by JSON as plain text in your response (NOT a tool call) — the user sees a reviewable card with checkboxes and can accept, reject, or deselect individual changes before they are applied
- You see the current artifacts list and available categories in your context

ALWAYS PROPOSE, RARELY ACT DIRECTLY:
- ALWAYS prefer the ARTIFACT_CHANGES structured response to propose changes. The user gets to review every change before it happens. This is the primary workflow.
- Only use create/update/delete tools directly for trivially simple, explicitly requested single-item operations (e.g., "delete artifact #42", "mark #7 as closed"). Even then, prefer proposing via ARTIFACT_CHANGES if there is any ambiguity.
- NEVER use tools to silently make multiple changes. If the user asks for anything involving more than one change, always propose via ARTIFACT_CHANGES.
- Use list tools freely for lookups and answering questions.

IMPORTANT - CATEGORIES:
- Categories must exist before artifacts can use them
- When proposing ARTIFACT_CHANGES that use new categories, include them in the category_operations section — they are applied first
- The user's UI will enforce this: artifact changes that depend on a new category are disabled until that category operation is checked
- Prefer using existing categories from the context when possible
- The category_operations section supports: create (new categories), rename (existing by ID), delete (by ID)

ARTIFACT FIELDS:
- title: Short descriptive name
- type: "bug" (defects, issues), "feature" (enhancements, requests), or "task" (general work items)
- status: "new", "open", "in_progress", "icebox", or "closed" (see workflow below)
- priority: "urgent", "high", "medium", or "low" (optional)
- area: Functional area of the platform (optional). Values: login_auth (Login & Auth), user_prefs (User Prefs), streams (Streams), reports (Reports), articles (Articles), notes (Notes), users (Users), organizations (Organizations), data_sources (Data Sources), chat_system (Chat System), help_content (Help Content), system_ops (System Ops)
- category: Optional grouping label (e.g., "UI", "Backend", "Performance")
- description: Optional detailed text

WORKFLOW — HOW ARTIFACTS ARE ORGANIZED:

Items are added with status "new" (the inbox). From there, each item goes one of two directions:
1. **Activated** — set to "open", meaning it's accepted for the current release / sprint
2. **Iceboxed** — set to "icebox", meaning it's explicitly shelved for later

Once activated, items progress through the workflow: open → in_progress → closed.

The UI has a VIEW selector that reflects this triage model:
- **New** view = the inbox (untriaged items). Status is irrelevant here.
- **Icebox** view = shelved items. Status is irrelevant here.
- **Active** view = the working set (open + in_progress + closed). These are items that have been triaged into the current cycle. Status pills filter within this view.
- **All** view = everything across all statuses.

Key insight: "new" and "icebox" are triage decisions, not workflow steps. The workflow statuses (open → in_progress → closed) only apply to active items.

When creating new artifacts, ALWAYS default to status "new" unless the user explicitly specifies otherwise. This ensures items enter the triage inbox.

Be concise and action-oriented. When the user asks to change, reorganize, create, or batch-modify, propose changes via ARTIFACT_CHANGES so they can review and accept."""


# =============================================================================
# Context Builder
# =============================================================================

def build_context(context: Dict[str, Any]) -> str:
    """Build context section for artifacts page."""
    artifacts = context.get("artifacts", [])
    categories = context.get("categories", [])
    filters = context.get("filters", {})
    selected_count = context.get("selected_count", 0)

    artifact_count = len(artifacts)

    if artifact_count == 0:
        return """The user is viewing the Artifacts page — a platform admin defect/feature tracker.

Current status: No artifacts found (may be filtered).

WHAT ARE ARTIFACTS:
Artifacts are bugs, feature requests, and tasks tracked by platform admins. Each has a type (bug/feature/task),
status (new, open, in_progress, icebox, closed), an optional priority (urgent/high/medium/low), an optional category for grouping, and a description.

You can help the user:
- Discuss priorities and triage strategy
- Suggest how to organize artifacts into categories
- Analyze patterns in their backlog
- Draft descriptions or acceptance criteria for new items"""

    # Count by status, type, priority, area, category
    status_counts: Dict[str, int] = {}
    type_counts: Dict[str, int] = {}
    priority_counts: Dict[str, int] = {}
    area_counts: Dict[str, int] = {}
    category_counts: Dict[str, int] = {}
    for a in artifacts:
        s = a.get("status", "unknown")
        t = a.get("artifact_type", "unknown")
        p = a.get("priority") or "unset"
        ar = a.get("area") or "unset"
        c = a.get("category") or "uncategorized"
        status_counts[s] = status_counts.get(s, 0) + 1
        type_counts[t] = type_counts.get(t, 0) + 1
        priority_counts[p] = priority_counts.get(p, 0) + 1
        area_counts[ar] = area_counts.get(ar, 0) + 1
        category_counts[c] = category_counts.get(c, 0) + 1

    status_summary = ", ".join(f"{v} {k}" for k, v in sorted(status_counts.items()))
    type_summary = ", ".join(f"{v} {k}s" for k, v in sorted(type_counts.items()))
    priority_summary = ", ".join(f"{v} {k}" for k, v in sorted(priority_counts.items()))
    area_summary = ", ".join(f"{k}: {v}" for k, v in sorted(area_counts.items()))
    category_summary = ", ".join(f"{k}: {v}" for k, v in sorted(category_counts.items()))

    # Active filters
    filter_parts = []
    if filters.get("type"):
        filter_parts.append(f"type={filters['type']}")
    if filters.get("status"):
        filter_parts.append(f"status={filters['status']}")
    if filters.get("area"):
        filter_parts.append(f"area={filters['area']}")
    if filters.get("category"):
        filter_parts.append(f"category={filters['category']}")
    filter_text = f"Active filters: {', '.join(filter_parts)}" if filter_parts else "No filters active"

    # Build artifact list (limit to 20 for context) — include IDs for update/delete references
    artifact_lines = []
    for a in artifacts[:20]:
        cat = f" [{a.get('category')}]" if a.get("category") else ""
        pri = f" P:{a.get('priority')}" if a.get("priority") else ""
        area = f" @{a.get('area')}" if a.get("area") else ""
        artifact_lines.append(
            f"  - #{a.get('id', '?')} [{a.get('artifact_type', '?').upper()}] {a.get('title', 'Untitled')} "
            f"({a.get('status', '?')}{pri}){area}{cat}"
        )
    artifact_text = "\n".join(artifact_lines)
    more_text = f"\n  ... and {artifact_count - 20} more" if artifact_count > 20 else ""

    selected_text = f"\n\nUser has {selected_count} artifact(s) selected for bulk actions." if selected_count > 0 else ""

    # Category list with IDs (needed for rename/delete operations)
    category_list = ", ".join(
        f"{c.get('name', '')} (#{c.get('id', '?')})" for c in categories
    ) if categories else "none defined"

    return f"""The user is viewing the Artifacts page — a platform admin defect/feature tracker.

{filter_text}
Total visible: {artifact_count} artifacts ({type_summary})
By status: {status_summary}
By priority: {priority_summary}
By area: {area_summary}
By category: {category_summary}
Available categories: {category_list}{selected_text}

ARTIFACTS:
{artifact_text}{more_text}

You can help the user:
- Triage and prioritize items
- Suggest category groupings
- Analyze patterns (e.g., many bugs in one area)
- Draft descriptions or acceptance criteria
- Recommend what to tackle next vs. icebox"""


# =============================================================================
# Register Page
# =============================================================================

register_page(
    page="artifacts",
    context_builder=build_context,
    payloads=["artifact_changes"],
    tools=[
        "list_artifacts", "create_artifact", "update_artifact", "delete_artifact",
        "list_artifact_categories", "create_artifact_category",
        "bulk_create_artifact_categories", "rename_artifact_category",
        "delete_artifact_category",
    ],
    persona=ARTIFACTS_PERSONA,
)
