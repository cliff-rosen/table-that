# QA Walkthrough Report

**Date:** 2026-03-03
**Test User:** qa_test_20260303_1230@test.example.com
**Base URL:** http://localhost:5174
**Browser:** Playwright (Chromium)
**Scope:** Core Flow (Phases 2-5)

## Summary

| Phase | Flow | Name | Result | Issues |
|-------|------|------|--------|--------|
| 2 | Core Flow Step 1 | Create Table | PASS | 0 |
| 3 | Core Flow Step 2 | Populate Data | PASS | 0 |
| 4 | Core Flow Step 3 | Add Column | PASS | 0 |
| 5 | Core Flow Step 4 | Enrich | PASS | 0 |

**Overall: 4/4 phases passed**

## DTP Assessment

| Phase | Decision [D] | Tool [T] | Presentation [P] | Notes |
|-------|-------------|---------|------------------|-------|
| 2 | PASS | PASS | PASS | AI proposed 9 columns including helpful extras (Job URL, Contact Person, Notes). SchemaProposalStrip appeared correctly with green highlighted columns. |
| 3 | PASS | PASS | PASS | AI used column IDs (col_xxx) in DATA_PROPOSAL. 5 sample rows with realistic data. ProposalActionBar showed correctly, progress tracking worked, auto-dismiss after success. |
| 4 | PASS | PASS | PASS | Priority column added with P0-P3 options. SchemaProposalStrip showed "1 new column" with green highlight. Filter tabs appeared after apply. |
| 5 | PASS | PASS | PASS | AI called enrich_column twice (first attempt returned no results, second used computation strategy). All 5 priorities assigned correctly. Research Log showed "5 found, 5 not found". Apply worked cleanly. |

## Checklist Coverage

### Core Flow (`_specs/flows/core-flow.md`)

| Checklist Item | Result | Phase | Notes |
|---------------|--------|-------|-------|
| AI responds with SCHEMA_PROPOSAL (create) | PASS | 2 | 9 columns proposed |
| SchemaProposalStrip appears | PASS | 2 | Blue/indigo gradient, "Schema changes proposed" |
| Apply creates table, strip disappears | PASS | 2 | Table created, redirected to /tables/152 |
| AI sends follow-up with suggestion chips | PASS | 2 | 4 suggestions: Add my first application, Import from CSV, Add sample applications, Research and add companies |
| AI responds with DATA_PROPOSAL | PASS | 3 | 5 add operations with column IDs |
| ProposalActionBar appears | PASS | 3 | Violet/blue gradient, "AI Proposed Changes — 5 additions" |
| New rows appear with green tint | PASS | 3 | Phantom rows rendered correctly |
| Checkboxes on each row (checked by default) | PASS | 3 | All 5 checked |
| Select All / Deselect All links work | PASS | 3 | Verified in snapshot |
| Apply inserts rows with progress | PASS | 3 | Progress bar, then "All 5 changes applied" |
| Action bar auto-dismisses | PASS | 3 | Auto-dismissed after ~600ms |
| Table refreshes with saved rows | PASS | 3 | Real IDs, no longer green |
| SCHEMA_PROPOSAL (update) for new column | PASS | 4 | Priority column with P0-P3 options |
| SchemaProposalStrip shows "1 new column" | PASS | 4 | Green highlighted column header |
| New column appears with green highlight | PASS | 4 | Priority header had green annotation |
| Column added, strip disappears | PASS | 4 | Filter tabs for Priority appeared after apply |
| AI proactively suggests filling new column | PASS | 4 | AI immediately called enrich_column |
| enrich_column tool called | PASS | 5 | Tool name: "Enrich Column" (shown twice — first attempt no results, second succeeded) |
| Strategy and results card | PASS | 5 | Card title: "AI Proposed Changes — 5 updates". Research Log: "5 found, 5 not found" |
| ProposalActionBar appears with results | PASS | 5 | 5 updates with checkboxes, amber highlights on Priority cells |
| Enriched data applied to table | PASS | 5 | Google/Microsoft: P0, Shopify/Stripe: P1, Airbnb: P2 |

## Key Validation: Column IDs Migration

This QA run specifically validated the "backend sends column IDs" migration:

- **DATA_PROPOSAL operations:** AI correctly used column IDs (e.g., `col_9oh3vune`, `col_kzbm89co`) instead of column names
- **DataTable display computation:** Phantom rows, update patches, and row metadata all computed correctly from raw operations within DataTable
- **executeSingleDataOperation:** Passed op.data/op.changes directly to API without name-to-ID mapping — all rows saved correctly
- **enrich_column results:** Priority values stored using column ID, displayed and persisted correctly

## Issues Found

| # | Severity | Layer | Phase | Description | Evidence |
|---|----------|-------|-------|-------------|----------|
| — | — | — | — | No issues found | — |

## Screenshots

| Filename | Phase | Description |
|----------|-------|-------------|
| qa-2-schema-proposal.png | 2 | Schema proposal strip with 9 columns |
| qa-2-table-created.png | 2 | Table created with columns and suggestion chips |
| qa-3-data-proposal.png | 3 | Data proposal with 5 green phantom rows |
| qa-3-populated.png | 3 | Table with 5 saved rows |
| qa-4-add-column.png | 4 | Priority column schema proposal |
| qa-4-column-added.png | 4 | Priority column added with filter tabs |
| qa-5-enrichment-complete.png | 5 | Enrichment results with Research Log |
| qa-5-enriched.png | 5 | Final state with all priorities applied |

## Console Errors (Unexpected)

None. 0 errors, 0 warnings across the entire session (75 total console messages, all info/debug level).

## Recommendations

No fixes needed. The core flow is working cleanly end-to-end with the column IDs migration. All four phases passed with no issues, no console errors, and correct data persistence.
