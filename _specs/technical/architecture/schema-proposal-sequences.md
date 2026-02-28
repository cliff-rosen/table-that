# Proposal Sequences — End-to-End Walkthroughs

---

## Sequence 1: New Schema from Description

### User types
```
I need a bug tracker. Bugs have a title, description, severity,
status, who reported it, and when.
```

### LLM response (streamed)
Display text:
> Here's a schema for your bug tracker. I've set up Status and Severity as select columns so you can filter by them easily, and Reporter as text since you may want free-form names.

Payload (extracted, stripped from display):
```json
SCHEMA_PROPOSAL: {
  "reasoning": "Bug tracker with filterable severity/status, date tracking",
  "table_name": "Bug Tracker",
  "table_description": "Track software bugs, their severity, and resolution status",
  "operations": [
    { "action": "add", "column": { "name": "Title", "type": "text", "required": true } },
    { "action": "add", "column": { "name": "Description", "type": "text", "required": false } },
    { "action": "add", "column": { "name": "Severity", "type": "select", "required": true, "options": ["Critical", "High", "Medium", "Low"] } },
    { "action": "add", "column": { "name": "Status", "type": "select", "required": true, "options": ["Open", "In Progress", "Resolved", "Closed", "Won't Fix"] } },
    { "action": "add", "column": { "name": "Reporter", "type": "text", "required": false } },
    { "action": "add", "column": { "name": "Date Reported", "type": "date", "required": false } }
  ]
}
```

### User sees in chat
> Here's a schema for your bug tracker. I've set up Status and Severity as select columns so you can filter by them easily...
>
> **[📋 View Schema Proposal — 6 columns, rename table]**

User clicks the button.

### SchemaProposalCard renders
```
┌──────────────────────────────────────────────────────┐
│  Schema Proposal                                     │
│                                                      │
│  Table: "Bug Tracker"                                │
│  Description: "Track software bugs, their..."        │
│                                                      │
│  ☑  ＋ Add "Title" (text, required)                  │
│  ☑  ＋ Add "Description" (text)                      │
│  ☑  ＋ Add "Severity" (select, required)             │
│        Critical, High, Medium, Low                   │
│  ☑  ＋ Add "Status" (select, required)               │
│        Open, In Progress, Resolved, Closed, Won't Fix│
│  ☑  ＋ Add "Reporter" (text)                         │
│  ☑  ＋ Add "Date Reported" (date)                    │
│                                                      │
│              [Cancel]  [Apply All 6 Changes]         │
└──────────────────────────────────────────────────────┘
```

### User clicks "Apply All 6 Changes"

### Frontend executor
1. Current columns: `[]` (empty table)
2. Applies 6 add operations → generates col IDs for each
3. Calls `PUT /api/tables/7`:
```json
{
  "name": "Bug Tracker",
  "description": "Track software bugs, their severity, and resolution status",
  "columns": [
    { "id": "col_t1a2b3", "name": "Title", "type": "text", "required": true },
    { "id": "col_d4e5f6", "name": "Description", "type": "text", "required": false },
    { "id": "col_s7v8r9", "name": "Severity", "type": "select", "required": true, "options": ["Critical", "High", "Medium", "Low"] },
    { "id": "col_s0t1u2", "name": "Status", "type": "select", "required": true, "options": ["Open", "In Progress", "Resolved", "Closed", "Won't Fix"] },
    { "id": "col_r3p4t5", "name": "Reporter", "type": "text", "required": false },
    { "id": "col_d6r7p8", "name": "Date Reported", "type": "date", "required": false }
  ]
}
```
4. API returns updated table definition
5. Schema editor refreshes — user sees 6 columns
6. Payload button updates to **[✓ Schema applied]**

---

## Sequence 2: Modify Existing Schema

Table already has the 6 bug tracker columns from Sequence 1.

### User types
```
Add a boolean for whether it's been reproduced, and add "Deferred"
to the Status options. Also make Date Reported required.
```

### LLM response
> I'll add a Reproduced column, expand the Status options, and make Date Reported required.

```json
SCHEMA_PROPOSAL: {
  "reasoning": "Adding reproduction tracking, new status option, and requiring dates",
  "operations": [
    {
      "action": "add",
      "column": { "name": "Reproduced", "type": "boolean", "required": false },
      "after_column_id": "col_r3p4t5"
    },
    {
      "action": "modify",
      "column_id": "col_s0t1u2",
      "changes": {
        "options": ["Open", "In Progress", "Resolved", "Closed", "Won't Fix", "Deferred"]
      }
    },
    {
      "action": "modify",
      "column_id": "col_d6r7p8",
      "changes": { "required": true }
    }
  ]
}
```

### SchemaProposalCard
```
☑  ＋ Add "Reproduced" (boolean) after "Reporter"
☑  ✏ Modify "Status"
      options: + "Deferred"
☑  ✏ Modify "Date Reported"
      required: false → true
```

### User accepts all → PUT with updated columns array

---

## Sequence 3: Bulk Data — Populate Table

Table has the 7-column bug tracker schema. Zero rows.

### User types
```
Add 5 sample bugs to get me started.
```

### LLM response
> Here are 5 sample bugs to populate your tracker.

```json
DATA_PROPOSAL: {
  "reasoning": "Sample bugs covering different severities and statuses",
  "operations": [
    {
      "action": "add",
      "data": {
        "Title": "Login page crashes on Safari",
        "Description": "Users on Safari 17 see a white screen after clicking Login",
        "Severity": "Critical",
        "Status": "Open",
        "Reporter": "Jane Chen",
        "Date Reported": "2026-02-20",
        "Reproduced": true
      }
    },
    {
      "action": "add",
      "data": {
        "Title": "Typo in welcome email",
        "Description": "The word 'recieve' should be 'receive' in the welcome email template",
        "Severity": "Low",
        "Status": "Open",
        "Reporter": "Mike Torres",
        "Date Reported": "2026-02-21",
        "Reproduced": true
      }
    },
    {
      "action": "add",
      "data": {
        "Title": "Dashboard slow with 1000+ records",
        "Description": "Dashboard takes 8+ seconds to load when user has more than 1000 records",
        "Severity": "High",
        "Status": "In Progress",
        "Reporter": "Sarah Kim",
        "Date Reported": "2026-02-18",
        "Reproduced": true
      }
    },
    {
      "action": "add",
      "data": {
        "Title": "Export CSV missing headers",
        "Description": "Exported CSV files don't include column headers as the first row",
        "Severity": "Medium",
        "Status": "Open",
        "Reporter": "Alex Johnson",
        "Date Reported": "2026-02-22",
        "Reproduced": false
      }
    },
    {
      "action": "add",
      "data": {
        "Title": "Dark mode toggle doesn't persist",
        "Description": "Switching to dark mode resets to light on page refresh",
        "Severity": "Low",
        "Status": "Resolved",
        "Reporter": "Jane Chen",
        "Date Reported": "2026-02-15",
        "Reproduced": true
      }
    }
  ]
}
```

### DataProposalCard renders
```
┌──────────────────────────────────────────────────────────────────────┐
│  Data Proposal — 5 additions                                        │
│                                                                      │
│  ADDITIONS                                                           │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │  ☑ │ Title                          │ Severity │ Status       │  │
│  ├────┼────────────────────────────────┼──────────┼──────────────┤  │
│  │ ☑  │ Login page crashes on Safari   │ Critical │ Open         │  │
│  │ ☑  │ Typo in welcome email          │ Low      │ Open         │  │
│  │ ☑  │ Dashboard slow with 1000+ rec  │ High     │ In Progress  │  │
│  │ ☑  │ Export CSV missing headers     │ Medium   │ Open         │  │
│  │ ☑  │ Dark mode toggle doesn't per   │ Low      │ Resolved     │  │
│  └────┴────────────────────────────────┴──────────┴──────────────┘  │
│                                                                      │
│  Showing key columns. Click row to see full details.                 │
│                                                                      │
│                    [Cancel]  [Apply All 5 Additions]                  │
└──────────────────────────────────────────────────────────────────────┘
```

### User clicks "Apply All 5 Additions"

### Frontend executor
Executes 5 `POST /api/tables/{id}/rows` calls sequentially with progress:
```
✓ Added "Login page crashes on Safari"
✓ Added "Typo in welcome email"
● Adding "Dashboard slow with 1000+ records"...
○ "Export CSV missing headers"
○ "Dark mode toggle doesn't persist"
```

Each row call maps column names → column IDs before sending.

On completion: data view refreshes, shows 5 rows. Payload button: **[✓ 5 rows added]**

---

## Sequence 4: Bulk Data — Updates and Deletes

Table has 20 bugs. User has filtered to Status = "Open" (12 visible).

### User types
```
The Safari login bug is a duplicate of ticket #3. Delete it.
And mark all the Low severity open bugs as Deferred.
```

### LLM sees in context
The 20 rows (or first 20 sample) with their IDs. It identifies:
- Row 1 (id=1): "Login page crashes on Safari" — to delete
- Row 2 (id=2): "Typo in welcome email" — Low, Open → Deferred
- Row 15 (id=15): "Tooltip misaligned on hover" — Low, Open → Deferred

### LLM response
> I'll remove the duplicate Safari bug and defer the low-severity open items.

```json
DATA_PROPOSAL: {
  "reasoning": "Remove duplicate, defer low-priority open bugs",
  "operations": [
    {
      "action": "delete",
      "row_id": 1
    },
    {
      "action": "update",
      "row_id": 2,
      "changes": { "Status": "Deferred" }
    },
    {
      "action": "update",
      "row_id": 15,
      "changes": { "Status": "Deferred" }
    }
  ]
}
```

### DataProposalCard renders
```
┌──────────────────────────────────────────────────────────────────────┐
│  Data Proposal — 2 updates, 1 deletion                              │
│                                                                      │
│  UPDATES                                                             │
│  ☑  Row 2: "Typo in welcome email"                                  │
│     Status: Open → Deferred                                          │
│  ☑  Row 15: "Tooltip misaligned on hover"                           │
│     Status: Open → Deferred                                          │
│                                                                      │
│  DELETIONS                                                           │
│  ☑  Row 1: "Login page crashes on Safari"  ██ strikethrough ██      │
│                                                                      │
│               [Cancel]  [Apply 2 Updates, 1 Deletion]                │
└──────────────────────────────────────────────────────────────────────┘
```

### User unchecks the deletion, accepts the updates only
Clicks **"Apply 2 Updates"**.

Executor calls:
- `PUT /api/tables/{id}/rows/2` with `{data: {col_s0t1u2: "Deferred"}}`
- `PUT /api/tables/{id}/rows/15` with `{data: {col_s0t1u2: "Deferred"}}`

Data view refreshes. Payload button: **[✓ Partially applied (2 of 3)]**

---

## Sequence 5: User Rejects, Then Iterates

### User types
```
Rename the Severity column to Priority and change the options to
P0, P1, P2, P3.
```

### LLM proposes
```json
SCHEMA_PROPOSAL: {
  "operations": [
    {
      "action": "modify",
      "column_id": "col_s7v8r9",
      "changes": {
        "name": "Priority",
        "options": ["P0", "P1", "P2", "P3"]
      }
    }
  ]
}
```

### User opens card, clicks Cancel
Payload state: `rejected`

### User types
```
Actually, keep the name Severity but use P0-P3 as options.
And also update all existing rows: Critical→P0, High→P1, Medium→P2, Low→P3.
```

### LLM sees the rejected proposal in the manifest
```
- p_abc (schema_proposal): "1 modification" — REJECTED
```

### LLM generates TWO proposals in one response
> I'll update the Severity options and migrate all existing values.

```json
SCHEMA_PROPOSAL: {
  "reasoning": "Update severity options to P0-P3 scale",
  "operations": [
    {
      "action": "modify",
      "column_id": "col_s7v8r9",
      "changes": { "options": ["P0", "P1", "P2", "P3"] }
    }
  ]
}
```

```json
DATA_PROPOSAL: {
  "reasoning": "Migrate existing severity values to new P0-P3 scale",
  "operations": [
    { "action": "update", "row_id": 1, "changes": { "Severity": "P0" } },
    { "action": "update", "row_id": 3, "changes": { "Severity": "P1" } },
    { "action": "update", "row_id": 4, "changes": { "Severity": "P2" } },
    { "action": "update", "row_id": 2, "changes": { "Severity": "P3" } },
    { "action": "update", "row_id": 5, "changes": { "Severity": "P3" } }
  ]
}
```

### User sees two payload buttons
> I'll update the Severity options and migrate all existing values.
>
> **[📋 View Schema Proposal — 1 modification]**
> **[📋 View Data Proposal — 5 updates]**

User applies schema first (changes the options), then applies data (migrates values). Order matters — the schema must update before the data values make sense.

---

## Sequence 6: Duplicate Detection

### User types
```
Add a bug: Login page crashes on Safari, Critical, reported by Jane Chen.
```

### LLM sees sample rows in context
It notices row 1 already has title "Login page crashes on Safari".

### LLM response (no proposal, just conversation)
> There's already a bug with that exact title (row 1: "Login page crashes on Safari", reported by Jane Chen on 2026-02-20, Status: Open). Is this a duplicate, or do you want to add it as a separate entry?

The LLM uses its judgment and the data context. No tool call, no proposal — just a clarifying question. If the user says "add it anyway", then the LLM uses the `create_row` tool directly (single row, explicit request).

---

## Sequence 7: Data Analysis via Chat

### User types
```
Give me a breakdown of bugs by severity and status.
```

### LLM response (no proposal, just text)
The LLM already has the sample rows in context. It responds with a text summary:

> Here's the breakdown of your 20 bugs:
>
> **By Severity:**
> | Severity | Count |
> |----------|-------|
> | P0 | 2 |
> | P1 | 5 |
> | P2 | 8 |
> | P3 | 5 |
>
> **By Status:**
> | Status | Count |
> |--------|-------|
> | Open | 8 |
> | In Progress | 4 |
> | Resolved | 3 |
> | Closed | 2 |
> | Deferred | 3 |
>
> The two P0 bugs are both Open — you might want to prioritize those.

No tools needed, no proposals — the LLM already has the data in its context.

---

## Key Design Principles

### The frontend is the executor
The backend doesn't need "apply schema proposal" or "apply data proposal" endpoints. The frontend executor maps proposal operations to existing CRUD endpoints. This keeps the backend simple and the proposals as a pure frontend/chat UX layer.

### One PUT for schema, sequential calls for data
- Schema: compute final column array, single `PUT /api/tables/{id}` — atomic
- Data: one API call per row — allows partial success, progress tracking

### Proposals use column NAMES, not IDs
The LLM writes proposals using human-readable column names. The frontend maps names → IDs before making API calls. This makes proposals readable in the chat card and doesn't expose internal IDs to the LLM.

### The LLM decides tool vs proposal based on clear rules
Single row + explicit request → direct tool. Anything else → proposal. The persona instructions make this unambiguous.

### Multiple proposals per message
A single LLM response can contain both a SCHEMA_PROPOSAL and a DATA_PROPOSAL (as in Sequence 5). The backend parser finds all registered markers in the text. Each renders as its own payload button.
