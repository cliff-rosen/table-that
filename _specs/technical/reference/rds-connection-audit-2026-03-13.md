# RDS Connection Audit — 2026-03-13

## Problem

Loading a table page in TableThat fails with `(1040, 'Too many connections')`.
The error occurs inside `validate_token`, which catches it as a generic exception
and returns **401 Unauthorized** — causing the frontend to bounce to the landing page.
(The 401-masking bug has been fixed to return 503 instead.)

## Root Cause

The shared RDS instance has `max_connections = 30`, and 27-28 of those slots
are occupied by sleeping connections from multiple applications.
A single TableThat page navigation fires ~6 concurrent requests (table + rows +
chat context, doubled by React StrictMode in dev), each needing a DB connection.
With only 2-3 free slots, the burst exceeds capacity.

## Connection Inventory (snapshot at ~18:00 UTC)

### By Host

| Host | Region | Database(s) | Connections | Stale (>10 min) |
|---|---|---|---|---|
| `rdsadmin@localhost` | — | mysql, None | 2 | 0 (RDS internal) |
| `71-211-141-248` (your IP) | local dev | table-that, signal, khdev | 9 | 2 |
| `ec2-3-135-202-66` | us-east-2 | signal | 3 | 2 |
| `ec2-107-20-8-226` | us-east-1 | kh2 | 6 | 2 |
| `ec2-3-87-35-1` | us-east-1 | table-that | 5 | **5** |
| **Total** | | | **25 app** + 2 rds = **27** | **11** |

### Stale Connections (sleeping >10 minutes)

| ID | Host | DB | Sleep Time | Likely Source |
|---|---|---|---|---|
| 325643 | your IP | signal | **7.9 hours** | Old dev session, Signal app |
| 327126 | your IP | table-that | 33 min | Previous dev server instance? |
| 325700 | ec2-3-135-202-66 | signal | **6.7 hours** | Signal app (us-east-2) |
| 326380 | ec2-3-135-202-66 | signal | **6.8 hours** | Signal app (us-east-2) |
| 326797 | ec2-107-20-8-226 | kh2 | **2.7 hours** | KH2 prod app (us-east-1) |
| 326849 | ec2-107-20-8-226 | kh2 | **2.6 hours** | KH2 prod app (us-east-1) |
| 326906 | ec2-3-87-35-1 | table-that | **2.2 hours** | TableThat prod (us-east-1) |
| 326907 | ec2-3-87-35-1 | table-that | **2.2 hours** | TableThat prod (us-east-1) |
| 326908 | ec2-3-87-35-1 | table-that | **2.2 hours** | TableThat prod (us-east-1) |
| 326909 | ec2-3-87-35-1 | table-that | **2.2 hours** | TableThat prod (us-east-1) |
| 326910 | ec2-3-87-35-1 | table-that | **2.2 hours** | TableThat prod (us-east-1) |

### By Application

| Application | Host(s) | Active | Stale | Total | Notes |
|---|---|---|---|---|---|
| **TableThat prod** | ec2-3-87-35-1 | 0 | 5 | 5 | All 5 sleeping 2+ hours. Pool not releasing. |
| **TableThat dev** | your IP | 6 | 1 | 7 | 1 stale from previous session |
| **Signal app** | ec2-3-135-202-66, your IP | 2 | 3 | 5 | 2 sleeping 6+ hours |
| **KH2 prod** | ec2-107-20-8-226 | 4 | 2 | 6 | 2 sleeping 2+ hours |
| **KH dev** | your IP | 1 | 0 | 1 | |
| **RDS admin** | localhost | 2 | 0 | 2 | Internal, don't touch |

## Key Observations

1. **TableThat prod (ec2-3-87-35-1) is the biggest offender** — 5 connections all
   sleeping for 2+ hours with zero active queries. This looks like the connection pool's
   `pool_size=5` base connections being held open indefinitely. The `pool_recycle=1800`
   (30 min) setting should recycle them, but they've been idle for 2+ hours — suggesting
   the pool_recycle isn't working as expected, or the app isn't making any requests
   (idle server keeping pool warm).

2. **Signal app has leaked connections** — 2 connections from the us-east-2 EC2 instance
   sleeping 6+ hours. Plus one from your local dev sleeping 8 hours. These are likely
   from processes that exited without closing their pools.

3. **KH2 prod has a similar pattern** — 2 stale + 4 recently active. The 4 active ones
   (~500s sleep) suggest normal pool behavior; the 2 stale ones (2.5+ hours) are likely
   from a previous deployment.

4. **max_connections=30 is extremely low** for a shared instance running 4+ apps.
   Even with perfect pool management, the base pool_size alone accounts for
   5 × 4 apps = 20 connections, leaving only 10 for overflow.

## Recommendations

### Immediate
- Kill stale connections (done in this session)
- Fix the 401-masking bug in validate_token (done — now returns 503)

### Short-term
- **Raise `max_connections`** to at least 100 on the RDS instance (check instance class supports it)
- **Lower `pool_size`** from 5 to 2-3 for each app, and `max_overflow` from 10 to 5
- **Set `wait_timeout`** on MySQL to ~300s so the server kills idle connections automatically:
  ```sql
  SET GLOBAL wait_timeout = 300;
  SET GLOBAL interactive_timeout = 300;
  ```

### Longer-term
- Each deployed app should configure its pool relative to the shared connection budget
- Consider separate RDS instances for prod vs dev, or at least separate users with per-user connection limits
- Signal app's connection management needs investigation — 6-8 hour idle connections suggest missing cleanup
