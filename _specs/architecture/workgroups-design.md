# Multi-Tenancy & Stream Subscription Design Spec

## Overview

Introduce a three-tier stream model with organizations, subscriptions, and role-based access control.

## Stream Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                     GLOBAL STREAMS                          │
│        (Platform-level, created by platform admins)         │
│                                                             │
│   ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐       │
│   │ Cancer  │  │ Cardio  │  │ Neuro   │  │ Rare    │       │
│   │ Research│  │ Studies │  │ Science │  │ Disease │       │
│   └────┬────┘  └────┬────┘  └─────────┘  └─────────┘       │
│        │            │                                       │
│        │ subscribe  │ subscribe                             │
│        ▼            ▼                                       │
├─────────────────────────────────────────────────────────────┤
│                   ORGANIZATION: Acme Corp                   │
│                                                             │
│   Subscribed Global:        Org Streams:                    │
│   ├── Cancer Research       ├── Internal Project A         │
│   └── Cardio Studies        └── Client Matter B            │
│                                                             │
│   ┌─────────────────────────────────────────────────────┐   │
│   │                      USERS                          │   │
│   │                                                     │   │
│   │  Jane (admin)        Bob (member)      Sue (member) │   │
│   │  ├─ Cancer ✓         ├─ Cancer ✓       ├─ Cancer ✗  │   │
│   │  ├─ Cardio ✓         ├─ Cardio ✓       ├─ Cardio ✓  │   │
│   │  ├─ Project A ✓      ├─ Project A ✗    ├─ Project A ✓│   │
│   │  ├─ Matter B ✓       ├─ Matter B ✓     ├─ Matter B ✓│   │
│   │  └─ My Notes (personal)                             │   │
│   └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## User Roles

### Platform Admin
- Create/edit/delete global streams
- Manage organizations (create, view, deactivate)
- View platform analytics
- Cannot see content within org streams (privacy)

### Org Admin
- Subscribe/unsubscribe org to global streams
- Create/edit/delete org-level streams
- Manage org members (invite, remove, promote to admin)
- View all org streams and reports

### User (Member)
- Subscribe/unsubscribe self to org streams
- Opt out of global streams (that org has subscribed to)
- Create personal streams
- View subscribed streams and their reports
- Create notes (personal or shared)

---

## Data Model

### `organizations`
| Column | Type | Description |
|--------|------|-------------|
| org_id | SERIAL PK | |
| name | VARCHAR(255) | Display name |
| created_at | TIMESTAMP | |
| is_active | BOOLEAN | For soft-delete/deactivation |

### `users`
| Column | Type | Description |
|--------|------|-------------|
| user_id | SERIAL PK | |
| org_id | INT FK | Organization (required) |
| email | VARCHAR | |
| name | VARCHAR | |
| role | ENUM | 'platform_admin', 'org_admin', 'member' |
| created_at | TIMESTAMP | |

**Note:** Platform admins still belong to an org but have elevated cross-org permissions.

### `research_streams`
| Column | Type | Description |
|--------|------|-------------|
| stream_id | SERIAL PK | |
| scope | ENUM | 'global', 'organization', 'personal' |
| org_id | INT FK NULL | NULL for global, set for org/personal |
| user_id | INT FK NULL | Only set for personal streams |
| stream_name | VARCHAR | |
| ... | | (existing fields) |
| created_by | INT FK | User who created it |
| created_at | TIMESTAMP | |

**Constraints:**
- `scope = 'global'` → `org_id IS NULL AND user_id IS NULL`
- `scope = 'organization'` → `org_id IS NOT NULL AND user_id IS NULL`
- `scope = 'personal'` → `org_id IS NOT NULL AND user_id IS NOT NULL`

### `org_stream_subscriptions`
Org subscribing to global streams.

| Column | Type | Description |
|--------|------|-------------|
| org_id | INT FK | |
| stream_id | INT FK | Global stream |
| subscribed_at | TIMESTAMP | |
| subscribed_by | INT FK | Org admin who subscribed |
| PRIMARY KEY | (org_id, stream_id) | |

### `user_stream_subscriptions`
User subscriptions to org-level streams + opt-out tracking for global streams.

| Column | Type | Description |
|--------|------|-------------|
| user_id | INT FK | |
| stream_id | INT FK | |
| is_subscribed | BOOLEAN | TRUE = subscribed, FALSE = opted out |
| updated_at | TIMESTAMP | |
| PRIMARY KEY | (user_id, stream_id) | |

**Logic:**
- For **org streams**: Row exists with `is_subscribed = TRUE` means subscribed. No row = not subscribed.
- For **global streams**: If org is subscribed, user is subscribed by default. Row with `is_subscribed = FALSE` means opted out.

### `report_article_associations`
| Column | Type | Change |
|--------|------|--------|
| notes | JSON | TEXT → JSON (array of note objects) |

**Notes JSON Structure:**
```json
[
  {
    "id": "uuid",
    "user_id": 123,
    "author_name": "Jane Smith",
    "content": "My private analysis",
    "visibility": "personal",
    "created_at": "2024-01-15T10:30:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  },
  {
    "id": "uuid2",
    "user_id": 456,
    "author_name": "Bob Jones",
    "content": "Team note for everyone",
    "visibility": "shared",
    "created_at": "2024-01-15T11:00:00Z",
    "updated_at": "2024-01-15T11:00:00Z"
  }
]
```

---

## Access Control Logic

### Stream Access

```python
def get_accessible_streams(user):
    streams = []

    # 1. Personal streams (user owns)
    streams += Stream.query.filter(
        scope='personal',
        user_id=user.user_id
    )

    # 2. Org streams (user is subscribed to)
    org_stream_ids = UserSubscription.query.filter(
        user_id=user.user_id,
        is_subscribed=True
    ).join(Stream).filter(scope='organization')
    streams += Stream.query.filter(stream_id.in_(org_stream_ids))

    # 3. Global streams (org subscribed AND user not opted out)
    org_subscribed_global = OrgSubscription.query.filter(
        org_id=user.org_id
    ).values('stream_id')

    user_opted_out = UserSubscription.query.filter(
        user_id=user.user_id,
        is_subscribed=False
    ).values('stream_id')

    global_accessible = set(org_subscribed_global) - set(user_opted_out)
    streams += Stream.query.filter(stream_id.in_(global_accessible))

    return streams
```

### Report Access

```python
def can_access_report(user, report):
    stream = report.research_stream
    return stream in get_accessible_streams(user)
```

### Notes Access

```python
def get_visible_notes(user, notes_json):
    visible = []
    for note in notes_json:
        if note['visibility'] == 'personal':
            if note['user_id'] == user.user_id:
                visible.append(note)
        else:  # 'shared'
            # If user can see the report, they see shared notes
            visible.append(note)
    return visible
```

---

## API Endpoints

### Platform Admin APIs

```
# Organizations
GET    /api/admin/orgs                    # List all organizations
POST   /api/admin/orgs                    # Create organization
GET    /api/admin/orgs/:id                # Get org details
PUT    /api/admin/orgs/:id                # Update org
DELETE /api/admin/orgs/:id                # Deactivate org

# Global Streams
GET    /api/admin/streams                 # List global streams
POST   /api/admin/streams                 # Create global stream
GET    /api/admin/streams/:id             # Get stream details
PUT    /api/admin/streams/:id             # Update stream
DELETE /api/admin/streams/:id             # Delete stream

# Platform Analytics
GET    /api/admin/analytics               # Platform-wide stats
```

### Org Admin APIs

```
# Org Management
GET    /api/org                           # Get current org
PUT    /api/org                           # Update org details

# Members
GET    /api/org/members                   # List org members
POST   /api/org/members                   # Invite member
PUT    /api/org/members/:id               # Update member role
DELETE /api/org/members/:id               # Remove member

# Global Stream Subscriptions
GET    /api/org/subscriptions             # List available global streams + subscription status
POST   /api/org/subscriptions/:stream_id  # Subscribe org to global stream
DELETE /api/org/subscriptions/:stream_id  # Unsubscribe org from global stream

# Org Streams
POST   /api/streams                       # Create org stream (scope: organization)
PUT    /api/streams/:id                   # Update org stream
DELETE /api/streams/:id                   # Delete org stream
```

### User APIs

```
# Stream Subscriptions
GET    /api/streams                       # List accessible streams (personal + subscribed org + global)
GET    /api/streams/available             # List org streams available to subscribe to
POST   /api/streams/:id/subscribe         # Subscribe to org stream
DELETE /api/streams/:id/subscribe         # Unsubscribe from org stream
POST   /api/streams/:id/opt-out           # Opt out of global stream
DELETE /api/streams/:id/opt-out           # Opt back in to global stream

# Personal Streams
POST   /api/streams                       # Create personal stream (scope: personal)
PUT    /api/streams/:id                   # Update own personal stream
DELETE /api/streams/:id                   # Delete own personal stream

# Notes
POST   /api/reports/:rid/articles/:aid/notes    # Create note
PUT    /api/reports/:rid/articles/:aid/notes/:nid    # Update note
DELETE /api/reports/:rid/articles/:aid/notes/:nid    # Delete note
GET    /api/reports/:rid/articles/:aid/notes    # Get visible notes
```

---

## UI/UX Design

### Platform Admin Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│ Platform Admin                                    [Logout]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ 12 Orgs     │  │ 45 Streams  │  │ 1.2k Users  │         │
│  │ Active      │  │ Global      │  │ Total       │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
│                                                             │
│  [Organizations]  [Global Streams]  [Analytics]             │
│                                                             │
│  Global Streams                          [+ Create Stream]  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Cancer Research          │ 8 orgs subscribed  [Edit]│   │
│  │ Cardiovascular Studies   │ 5 orgs subscribed  [Edit]│   │
│  │ Neuroscience             │ 3 orgs subscribed  [Edit]│   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Org Admin - Subscription Management

```
┌─────────────────────────────────────────────────────────────┐
│ Organization Settings                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [Members]  [Stream Subscriptions]  [Org Streams]           │
│                                                             │
│  Global Streams Library                                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ ☑ Cancer Research        [Subscribed] [Unsubscribe] │   │
│  │ ☑ Cardiovascular Studies [Subscribed] [Unsubscribe] │   │
│  │ ☐ Neuroscience           [Subscribe]                │   │
│  │ ☐ Rare Diseases          [Subscribe]                │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  Organization Streams                    [+ Create Stream]  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Project Alpha            │ 12 members │ [Edit]      │   │
│  │ Client Matter 2024-001   │ 5 members  │ [Edit]      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### User - Stream List (Sidebar)

```
┌──────────────────────────┐
│ Streams                  │
├──────────────────────────┤
│                          │
│ MY STREAMS               │
│   📁 Personal Notes      │
│   📁 Side Project        │
│                          │
│ TEAM STREAMS             │
│   🏢 Project Alpha    ✓  │
│   🏢 Client Matter    ✓  │
│   └─ [Browse more...]    │
│                          │
│ GLOBAL STREAMS           │
│   🌐 Cancer Research  ✓  │
│   🌐 Cardio Studies   ✓  │
│   🌐 Neuroscience     ✗  │
│   └─ [Manage...]         │
│                          │
│ [+ New Personal Stream]  │
└──────────────────────────┘

✓ = subscribed/active
✗ = opted out (but available)
```

### Notes Panel in Article Viewer

```
┌─────────────────────────────────────────────────────────────┐
│ Notes                                                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 🔒 PRIVATE                                            │ │
│  │ My initial thoughts on methodology...                 │ │
│  │ — You, 2 hours ago                          [Edit] [X]│ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 👥 SHARED                                             │ │
│  │ Key finding: supports our hypothesis on dosing.       │ │
│  │ — Jane Smith, Yesterday                               │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ 👥 SHARED                                             │ │
│  │ Cross-reference with PMC7234567                       │ │
│  │ — Bob Jones, 3 days ago                               │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │ [Write a note...]                                     │ │
│  │                                                       │ │
│  │                          ○ Private  ● Shared  [Save]  │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Migration Strategy

### Phase 1: Schema

1. Create `organizations` table
2. Add `org_id` and `role` to `users` table
3. Create single-user org for each existing user, set as org_admin
4. Add `scope`, `org_id`, `created_by` to `research_streams`
5. Set all existing streams to `scope='personal'`, populate `org_id` from user
6. Create `org_stream_subscriptions` table
7. Create `user_stream_subscriptions` table
8. Migrate `notes` column from TEXT to JSON

### Phase 2: Backend

1. Implement role-based middleware/decorators
2. Platform admin service + routes
3. Org admin service + routes
4. Subscription service
5. Update stream access queries
6. Update notes to JSON handling

### Phase 3: Frontend

1. Platform admin dashboard (separate app or route?)
2. Org admin settings pages
3. Stream subscription UI
4. Updated stream list with sections
5. Notes UI with visibility toggle

---

## Open Questions

1. **Platform admin UI**: Separate app/subdomain, or integrated with role-based routing?

2. **Org creation flow**: Platform admin creates orgs manually, or self-service signup?

3. **User invitation flow**: Email invites? Magic links? Manual account creation?

4. **Default subscriptions**: When org subscribes to global stream, auto-subscribe all existing members?

5. **Subscription notifications**: Notify users when org subscribes to new global stream?

6. **Stream deletion**: What happens to reports when a stream is deleted? Soft delete?

7. **AI Enrichments**: Shared at report level, or also personal/shared distinction?

---

## Phased Rollout

### v1.0 - Foundation
- Organizations + user roles
- Personal streams (existing behavior preserved)
- Org-level streams with user subscriptions
- Basic org admin UI

### v1.1 - Global Streams
- Platform admin dashboard
- Global stream creation
- Org subscription to global streams
- User opt-out from global streams

### v1.2 - Notes Enhancement
- JSON notes with multiple entries
- Personal/shared visibility
- Author attribution

### v2.0 - Polish
- Invitation flow
- Notifications
- Analytics dashboards
- Activity feeds
