# Stress Test: Bug Tracker — Full User Journey

A user wants to create and manage a bug tracker entirely through table.that. This walks through every interaction, testing the full feature set.

---

## Phase 1: Schema Design via Chat

### 1.1 Initial request
**User types:** `I want to build a bug tracker for my team's web app.`

**LLM responds** (text + schema_proposal):
> Great choice. Here's a schema covering the essentials — bug details, classification, assignment, and lifecycle tracking.

```json
SCHEMA_PROPOSAL: {
  "table_name": "Bug Tracker",
  "table_description": "Track bugs for the web application team",
  "operations": [
    { "action": "add", "column": { "name": "Title", "type": "text", "required": true } },
    { "action": "add", "column": { "name": "Description", "type": "text", "required": false } },
    { "action": "add", "column": { "name": "Severity", "type": "select", "required": true, "options": ["Critical", "High", "Medium", "Low"] } },
    { "action": "add", "column": { "name": "Status", "type": "select", "required": true, "options": ["Open", "In Progress", "Resolved", "Closed", "Won't Fix"] } },
    { "action": "add", "column": { "name": "Assigned To", "type": "text", "required": false } },
    { "action": "add", "column": { "name": "Reporter", "type": "text", "required": false } },
    { "action": "add", "column": { "name": "Date Reported", "type": "date", "required": true } },
    { "action": "add", "column": { "name": "Reproduced", "type": "boolean", "required": false } }
  ]
}
```

**User sees:** Card with 8 column additions. Reviews, accepts all.

**Result:** Table created with 8 columns. Filter bar will show chips for Severity, Status, and Reproduced.

### 1.2 Schema revision
**User types:** `Add a Component column — the options should be Frontend, Backend, API, Database, DevOps. Put it after Severity.`

**LLM proposes:**
```json
SCHEMA_PROPOSAL: {
  "operations": [
    {
      "action": "add",
      "column": { "name": "Component", "type": "select", "required": false, "options": ["Frontend", "Backend", "API", "Database", "DevOps"] },
      "after_column_id": "col_sev123"
    }
  ]
}
```

**User accepts.** Now 9 columns. Filter bar now also has a Component chip.

### 1.3 Another revision
**User types:** `Actually I want to track resolution date too. And add "Deferred" to Status.`

**LLM proposes:**
```json
SCHEMA_PROPOSAL: {
  "operations": [
    { "action": "add", "column": { "name": "Resolved Date", "type": "date", "required": false } },
    {
      "action": "modify",
      "column_id": "col_status",
      "changes": { "options": ["Open", "In Progress", "Resolved", "Closed", "Won't Fix", "Deferred"] }
    }
  ]
}
```

**User accepts.** 10 columns, Status dropdown now has 6 options.

---

## Phase 2: Populating Data via Chat

### 2.1 Bulk add
**User types:** `Add some realistic sample bugs. Give me about 15 with a mix of severities and statuses.`

**LLM proposes DATA_PROPOSAL** with 15 add operations, each with realistic data:
- Mix of severities (2 Critical, 4 High, 5 Medium, 4 Low)
- Mix of statuses (6 Open, 3 In Progress, 3 Resolved, 2 Closed, 1 Deferred)
- Mix of components
- Various reporters and assignees
- Dates spread across the last 2 weeks
- Reproduced = true for most, false for a couple

**DataProposalCard shows** a mini table with all 15 rows. User scans them, unchecks 2 that look silly, accepts 13.

**Executor:** 13 sequential `POST /api/tables/{id}/rows` calls. Progress bar fills as each row is created.

**Result:** Data view shows 13 rows. Filter bar chips for Severity, Status, Component, Reproduced are all functional.

### 2.2 Single add with duplicate detection
**User types:** `Add a bug: Login timeout on mobile Safari`

**LLM sees row 3 already titled "Safari login page crashes on iOS".** Responds:

> I notice you already have a similar bug: row 3 "Safari login page crashes on iOS" (Critical, Open, Frontend). Is this the same issue or a different one?

**User types:** `Different one — this is about session timeout, not a crash.`

**LLM uses create_row tool directly** (single row, explicit request after clarification):
```
Tool call: create_row({
  "column_values": {
    "Title": "Login timeout on mobile Safari",
    "Severity": "Medium",
    "Status": "Open",
    "Component": "Frontend",
    "Reporter": "User",
    "Date Reported": "2026-02-24",
    "Reproduced": false
  }
})
```

Row appears in the table immediately.

---

## Phase 3: Filtering and Browsing

### 3.1 Using filter chips
User clicks the **Status** chip → dropdown shows:
```
☑ Open (7)
☑ In Progress (3)
☑ Resolved (2)
☑ Closed (1)
☑ Deferred (1)
☐ Won't Fix (0)
```

User unchecks everything except Open. Table shows 7 rows. Chip highlights: **Status: Open**.

User clicks **Severity** chip → dropdown shows:
```
☑ Critical (1)
☑ High (3)
☑ Medium (2)
☑ Low (1)
```

User checks only Critical and High. Table shows 4 rows (Open AND Critical/High). Two chips highlighted.

### 3.2 Text search with filters
User types "safari" in search bar while filters are active. Table shows 1 row matching both the text search and the active filters.

### 3.3 Clearing filters
User clicks the Status chip → "All" → filter resets. Chip returns to muted. Table shows all Critical/High bugs (Severity filter still active).

---

## Phase 4: Data Operations via Chat

### 4.1 Bulk status update
**User types:** `Mark all the Resolved bugs as Closed and set their Resolved Date to today.`

**LLM uses get_rows to find Resolved bugs** (may need to paginate if >20 rows):
```
Tool call: get_rows({ offset: 0, limit: 50 })
```

Identifies 2 Resolved bugs (rows 8 and 11).

**LLM proposes:**
```json
DATA_PROPOSAL: {
  "reasoning": "Close resolved bugs and stamp resolution date",
  "operations": [
    { "action": "update", "row_id": 8, "changes": { "Status": "Closed", "Resolved Date": "2026-02-24" } },
    { "action": "update", "row_id": 11, "changes": { "Status": "Closed", "Resolved Date": "2026-02-24" } }
  ]
}
```

**DataProposalCard shows:**
```
UPDATES
☑  Row 8: "Export button not responding"
   Status: Resolved → Closed
   Resolved Date: (empty) → 2026-02-24

☑  Row 11: "Dark mode toggle doesn't persist"
   Status: Resolved → Closed
   Resolved Date: (empty) → 2026-02-24
```

**User accepts.** Both rows updated. Data view refreshes.

### 4.2 Assign bugs
**User types:** `Assign all the unassigned Critical and High bugs to Sarah.`

**LLM uses get_rows, filters mentally for unassigned + Critical/High.** Finds 3 matching rows.

**LLM proposes DATA_PROPOSAL** with 3 update operations, each setting "Assigned To": "Sarah".

**User reviews, accepts.**

### 4.3 Delete duplicates
**User types:** `I think rows 5 and 12 are duplicates. Show me both so I can decide.`

**LLM uses get_rows or already has them in context.** Responds with a comparison:

> Here are both bugs:
>
> **Row 5:** "API returns 500 on empty payload" — High, Open, API, reported 2/19
> **Row 12:** "Server error when POST body is empty" — High, Open, API, reported 2/22
>
> These look like the same issue described differently. Row 5 was reported first. Want me to delete row 12?

**User types:** `Yes, delete 12.`

**LLM uses delete_row tool directly** (single row, explicit request):
```
Tool call: delete_row({ "row_id": 12 })
```

### 4.4 Data cleanup
**User types:** `Normalize all the Reporter names to just first names.`

**LLM uses get_rows to scan all rows.** Sees reporters like "Jane Chen", "Mike Torres", "Sarah Kim", "Alex Johnson".

**LLM proposes:**
```json
DATA_PROPOSAL: {
  "reasoning": "Normalize reporter names to first names only",
  "operations": [
    { "action": "update", "row_id": 1, "changes": { "Reporter": "Jane" } },
    { "action": "update", "row_id": 2, "changes": { "Reporter": "Mike" } },
    { "action": "update", "row_id": 3, "changes": { "Reporter": "Sarah" } },
    ...
  ]
}
```

**DataProposalCard shows** each row with the Reporter change. User accepts.

---

## Phase 5: Analysis via Chat

### 5.1 Status breakdown
**User types:** `How are we doing? What's the bug situation?`

**LLM already has context (20 sample rows + describe_table stats).** Responds:

> You have 13 bugs total:
> - **3 Closed** (all done)
> - **2 In Progress** (actively being worked on)
> - **1 Deferred** (parked for now)
> - **7 Open** (need attention)
>
> Of the 7 Open bugs, 1 is Critical and 2 are High severity. The Critical one ("Login timeout on mobile Safari") has been open since Feb 24 and hasn't been reproduced yet — might want to prioritize that.

No tools, no proposals — pure analysis from context.

### 5.2 Querying with pagination
**User types:** `Show me every bug that Sarah is assigned to.`

**LLM uses search_rows or get_rows.** If the table has grown large:
```
Tool call: get_rows({ offset: 0, limit: 100 })
```

Filters results mentally, responds with a formatted list:

> Sarah is assigned to 4 bugs:
> 1. Row 1: "Login page crashes on Safari" — Critical, Open
> 2. Row 3: "Safari login page crashes on iOS" — High, In Progress
> 3. Row 7: "Dashboard slow with 1000+ records" — High, Open
> 4. Row 14: "Login timeout on mobile Safari" — Medium, Open
>
> Three of them are Safari-related. Might be worth combining those.

### 5.3 Trend question
**User types:** `Which component has the most open bugs?`

**LLM responds from context:**

> Frontend has the most open bugs (4 out of 7):
> - 1 Critical, 2 High, 1 Medium
>
> Backend and API each have 1 open bug. Database and DevOps have none open.

---

## Phase 6: Schema Evolution

### 6.1 Adding a column after data exists
**User types:** `We need to track which version of the app each bug was found in. Add a Version column.`

**LLM proposes:**
```json
SCHEMA_PROPOSAL: {
  "operations": [
    {
      "action": "add",
      "column": { "name": "Version", "type": "text", "required": false },
      "after_column_id": "col_component"
    }
  ]
}
```

**User accepts.** Column added. Existing rows get null/empty for Version. User can backfill manually or via chat.

### 6.2 Backfilling the new column
**User types:** `Set Version to "2.1" for all bugs reported before Feb 20, and "2.2" for everything after.`

**LLM uses get_rows to check dates.** Proposes DATA_PROPOSAL with update operations for each row.

**User reviews and accepts.**

### 6.3 Type change consideration
**User types:** `I want to change Component from a select to text so people can type anything.`

**LLM responds thoughtfully:**

> I can change Component from select to text. Since all your existing values ("Frontend", "Backend", "API", etc.) are already valid text strings, no data will be lost. However, you'll lose the ability to filter by Component using the filter chip — text columns don't have dropdown filters.
>
> Want me to proceed, or would you prefer to keep it as select and just add more options?

**User types:** `Keep it as select but add Mobile and Infrastructure.`

**LLM proposes:**
```json
SCHEMA_PROPOSAL: {
  "operations": [
    {
      "action": "modify",
      "column_id": "col_component",
      "changes": { "options": ["Frontend", "Backend", "API", "Database", "DevOps", "Mobile", "Infrastructure"] }
    }
  ]
}
```

---

## Phase 7: Large Table Operations

### 7.1 Table with 200+ rows
After months of use, the table has 247 bugs. The context only shows 20 sample rows.

**User types:** `How many bugs are still open?`

**LLM reads describe_table stats from context:**

> You have 247 bugs total. Based on the status distribution: 43 Open, 28 In Progress, 89 Resolved, 72 Closed, 12 Deferred, 3 Won't Fix.

### 7.2 Scanning all data
**User types:** `Find every bug assigned to Mike that's still open.`

**LLM needs to scan all rows (only 20 in context):**
```
Tool call: get_rows({ offset: 0, limit: 200 })
```
```
Tool call: get_rows({ offset: 200, limit: 50 })
```

Scans all 247 rows, finds 7 assigned to Mike that are Open. Responds with the list.

### 7.3 Bulk operation on large table
**User types:** `Close every bug that's been Resolved for more than 30 days.`

**LLM scans rows via get_rows (multiple calls if needed).** Identifies 45 Resolved bugs where Date Reported is before Jan 25. Proposes DATA_PROPOSAL with 45 update operations.

**DataProposalCard shows** the 45 rows in a scrollable table. User reviews, spots 3 they want to keep Resolved, unchecks those. Accepts 42.

**Executor** runs 42 PUT calls with progress tracking. Takes ~15 seconds. User watches progress bar fill up.

---

## What This Tests

| Feature | Tested In |
|---------|-----------|
| Schema proposal — new table | Phase 1.1 |
| Schema proposal — add column | Phase 1.2, 6.1 |
| Schema proposal — modify options | Phase 1.3, 6.3 |
| Data proposal — bulk add | Phase 2.1 |
| Data proposal — bulk update | Phase 4.1, 4.2, 4.4, 6.2 |
| Data proposal — bulk delete | Phase 4.3 (single via tool) |
| Data proposal — partial accept | Phase 2.1 (unchecked 2), 7.3 (unchecked 3) |
| Direct tool — create_row | Phase 2.2 |
| Direct tool — delete_row | Phase 4.3 |
| Direct tool — get_rows pagination | Phase 5.2, 7.2, 7.3 |
| Direct tool — describe_table | Phase 5.1, 7.1 |
| Duplicate detection | Phase 2.2 |
| Filter chips — select | Phase 3.1 |
| Filter chips — multi-select | Phase 3.1 (Severity) |
| Filter chips + search combo | Phase 3.2 |
| Filter clear | Phase 3.3 |
| Data analysis (no tools) | Phase 5.1, 5.3 |
| LLM warns about implications | Phase 6.3 |
| Large table pagination | Phase 7.2, 7.3 |
| Progress tracking | Phase 2.1, 7.3 |
| Multiple proposals in one turn | Not shown (see Sequence 5 in sequences doc) |
