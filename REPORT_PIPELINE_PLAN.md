# Report Pipeline — Sequence of Operations

## The Chain

### Step 1: Admin configures schedule

| | |
|---|---|
| **Who** | Admin (human) |
| **Trigger** | Manual action — Operations > Scheduler > Edit |
| **What it does** | Configures when a stream's pipeline should run and when emails should be sent |
| **DB reads** | `research_streams` — current `schedule_config` for the stream |
| **DB writes** | `research_streams.schedule_config` — full JSON config |
| | `research_streams.next_scheduled_run` — next run datetime (UTC) |
| **Code** | `services/operations_service.py` > `update_stream_schedule()` |

**Example — DB writes:**

`research_streams.schedule_config`:
```json
{
  "enabled": true,
  "frequency": "weekly",
  "anchor_day": "sunday",
  "preferred_time": "03:00",
  "timezone": "America/New_York",
  "send_day": "monday",
  "send_time": "08:00"
}
```

`research_streams.next_scheduled_run`: `2026-02-22 08:00:00` (Sunday 3am ET → UTC)

---

### Step 2: Worker runs the pipeline

| | |
|---|---|
| **Who** | Worker (automated, 30s poll loop) |
| **Trigger** | `research_streams` where `schedule_config->enabled = true` AND `next_scheduled_run <= now` |
| **What it does** | Runs full pipeline: retrieval > dedup > filtering > categorization > summarization > report creation |
| **DB reads** | `research_streams.schedule_config` (for frequency → date range calculation) |
| **DB writes** | `pipeline_executions` — new row |
| | `reports` — new row (status: `awaiting_approval`) |
| | `articles` — new/existing rows |
| | `report_article_associations` — new rows |
| | `research_streams.next_scheduled_run` — advanced to next run |
| **Code** | `worker/scheduler.py` > `find_scheduled_streams()` |
| | `worker/dispatcher.py` > `execute_scheduled()` |
| | `services/pipeline_service.py` > `run_pipeline()` > `_create_report()` |

**Example — DB reads (trigger):**
```sql
SELECT * FROM research_streams
WHERE JSON_EXTRACT(schedule_config, '$.enabled') = true
  AND next_scheduled_run <= '2026-02-22 08:00:00'
```

**Example — DB writes:**

`pipeline_executions` (new row):
```
id:           "a1b2c3d4-..."
stream_id:    5
status:       "completed"
run_type:     "scheduled"
start_date:   "2026-02-15"   (Saturday, 7 days back)
end_date:     "2026-02-21"   (Saturday, day before Sunday run)
report_id:    42
started_at:   "2026-02-22 08:00:01"
completed_at: "2026-02-22 08:03:45"
```

`reports` (new row):
```
report_id:        42
stream_id:        5
report_name:      "Weekly Report - Feb 15-21, 2026"
approval_status:  "awaiting_approval"
created_at:       "2026-02-22 08:03:45"
```

`research_streams.next_scheduled_run`: `2026-03-01 08:00:00` (next Sunday 3am ET → UTC)

**Note:** No email queue entries are created at this stage. Emails are only queued when the report is approved (step 3).

---

### Step 3: Curator approves the report → emails are queued

| | |
|---|---|
| **Who** | Curator (human) |
| **Trigger** | Sees report with `approval_status = awaiting_approval` in Curation UI |
| **What it does** | Reviews articles, edits summaries, clicks Approve. Approval atomically creates email queue entries for all stream subscribers. |
| **DB reads** | `reports` where `approval_status = 'awaiting_approval'` |
| | `research_streams.schedule_config` — for `send_day`, `send_time`, `timezone` |
| | Stream subscriber list (users linked to the stream) |
| **DB writes** | `reports` — approval fields updated |
| | `curation_events` — audit row |
| | `report_email_queue` — one row per subscriber |
| **Code** | `routers/curation.py` > approve endpoint |
| | `services/report_service.py` > `approve_report()` |
| | `services/report_email_queue_service.py` > `auto_queue_for_approved_report()` |

**Example — DB writes:**

`reports` (update):
```
report_id:        42
approval_status:  "approved"     (was "awaiting_approval")
approved_by:      7              (curator's user_id)
approved_at:      "2026-02-22 16:30:00"
```

`curation_events` (new row):
```
report_id:   42
user_id:     7
event_type:  "approved"
created_at:  "2026-02-22 16:30:00"
```

`report_email_queue` (new rows — one per subscriber):
```
Row 1:
  report_id:     42
  user_id:       10
  email:         "alice@example.com"
  status:        "scheduled"
  scheduled_for: "2026-02-23 13:00:00"  (Monday 8am ET → UTC)

Row 2:
  report_id:     42
  user_id:       11
  email:         "bob@example.com"
  status:        "scheduled"
  scheduled_for: "2026-02-23 13:00:00"  (Monday 8am ET → UTC)
```

All three writes (approval, audit event, queue entries) happen in a single atomic commit.

If the stream has no `send_time` configured, no queue entries are created. Curators can still manually schedule emails via the operations UI.

---

### Step 4: Worker sends the emails

| | |
|---|---|
| **Who** | Worker (automated, 30s poll loop) |
| **Trigger** | `report_email_queue` where `status = 'scheduled'` AND `scheduled_for <= now` |
| **What it does** | Generates email HTML, sends via SMTP to each subscriber |
| **DB reads** | `report_email_queue` (time gate only — no approval join needed) |
| **DB writes** | `report_email_queue` — status and sent_at updated |
| **Code** | `worker/main.py` > `process_email_queue()` |
| | `services/report_email_queue_service.py` > `process_queue()` |

**Example — DB reads (trigger query):**
```sql
SELECT q.* FROM report_email_queue q
WHERE q.status = 'scheduled'
  AND q.scheduled_for <= '2026-02-23 13:00:00'   -- it's now Monday 8am ET
```

Only the time gate is needed — queue entries only exist for approved reports.

**Example — DB writes (success):**

`report_email_queue` (update each row):
```
Row 1:
  status:   "sent"       (was "scheduled")
  sent_at:  "2026-02-23 13:00:05"

Row 2:
  status:   "sent"       (was "scheduled")
  sent_at:  "2026-02-23 13:00:06"
```

**Example — DB writes (failure):**
```
  status:         "failed"
  error_message:  "SMTP connection refused"
```

---

## Gaps identified

- **No curator notification**: When step 2 creates a report, nobody is automatically told. The curator has to check the UI. There is a manual "request approval" button that sends an email, but it's a separate human action, not part of the automated chain.
