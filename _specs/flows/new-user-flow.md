# New User Flow

> Registration, login, and first-use experience — the preamble before [Core Flow](./core-flow.md).

---

## Overview

A new user arrives at table.that, creates an account, and lands on an empty Tables List. The first-use experience guides them into the [Core Flow](./core-flow.md) (create table → populate → enrich).

```
Register → Login → Tables List (empty state) → Core Flow
```

---

## Step 1: Registration

### What the user sees

A registration form with three fields:

| Field | Type | Validation |
|-------|------|-----------|
| Email | email input | Required, valid email format |
| Password | password input | Required, minimum 5 characters |
| Confirm Password | password input | Required, must match password |

### Variant: Invitation-based registration

If the user arrives via an invitation link (`/register?token=...`):
- Email field is pre-filled and disabled (set by invitation)
- Token validates against `/api/auth/validate-invitation/{token}`
- Shows organization name and assigned role (admin or member)
- Expired/invalid tokens show error with link back to login

### What happens on submit

1. Frontend calls `POST /api/auth/register` with email + password
2. Account created, user auto-logged-in (no separate login step)
3. Redirect to `/tables` (Tables List page)

---

## Step 2: Login

### What the user sees

Login form with two modes (togglable):

**Password login** (default):
- Email field
- Password field
- "Forgot password?" link → `/reset-password`

**Passwordless login** (toggle):
- Email field only
- "Send Login Link" button
- One-time token sent via email, expires in 30 minutes

### What happens on submit

1. Frontend calls `POST /api/auth/login` (password) or `POST /api/auth/login-with-token` (passwordless)
2. Auth token stored
3. Redirect to `/tables` (Tables List page)

### Password reset

1. User clicks "Forgot password?" on login page
2. Enters email → `POST /api/auth/request-password-reset`
3. Reset link sent via email (expires in 1 hour)
4. User clicks link → `/reset-password` page → enters new password

---

## Step 3: Tables List (Empty State)

### What the user sees

When the user has no tables:

```
┌──────────────────────────────────────────────────────────────────┐
│  Header                                                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│                     [Table Icon]                                 │
│                   No tables yet                                  │
│                                                                  │
│   Create your first table to start organizing and managing       │
│   your data. Tables let you define custom columns and store      │
│   structured information.                                        │
│                                                                  │
│              [ ✨ Build a Table with AI ]                        │
│                or create one manually                            │
│                                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                  │
│   Starter Prompts (3-column grid)                               │
│                                                                  │
│   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│   │  Template 1  │  │  Template 2  │  │  Template 3  │            │
│   │  title +     │  │  title +     │  │  title +     │            │
│   │  description │  │  description │  │  description │            │
│   └─────────────┘  └─────────────┘  └─────────────┘            │
│   ...more starters...                                           │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### Three entry points

| Action | What it does |
|--------|-------------|
| **Build a Table with AI** (primary CTA) | Opens chat panel, user describes what they want → enters Core Flow Step 1 |
| **Create one manually** | Opens table builder modal with manual column definition |
| **Click a starter prompt** | Opens chat panel pre-filled with that prompt → enters Core Flow Step 1 |

### Header actions (also available)

- **Ask AI** button — opens chat panel (same as "Build a Table with AI")
- **Import CSV** button — creates table from CSV file upload
- **Create Table** button — manual table builder modal

### Starter prompts

Pre-configured table templates shown as clickable cards. Each has:
- Icon
- Title (e.g., "Bug Tracker", "Product Comparison")
- Short description

Clicking a starter opens the AI chat with that prompt pre-filled, immediately entering Core Flow Step 1.

The starter prompts grid is always visible — it becomes compact when the user already has tables.

---

## Step 4: Enter Core Flow

Once the user has chosen how to create their first table (AI, manual, CSV, or starter), they enter the [Core Flow](./core-flow.md):

1. **Create Table** — define columns via AI or manual
2. **Populate** — add data via AI research, CSV import, or manual entry
3. **Add Column** — extend schema with enrichment columns
4. **Enrich** — fill new columns with AI research, lookups, or computation

See [core-flow.md](./core-flow.md) for the full specification of each step.

---

## Verification Checklist

### Registration

- [ ] Registration form shows: email, password, confirm password
- [ ] Password validation: minimum 5 characters
- [ ] Confirm password must match password
- [ ] Successful registration auto-logs in (no separate login step)
- [ ] Redirects to `/tables` after registration
- [ ] Invitation-based: email pre-filled and disabled
- [ ] Invitation-based: shows organization name and role
- [ ] Expired invitation token shows error message

### Login

- [ ] Password login: email + password fields
- [ ] Passwordless login: email field + "Send Login Link" button
- [ ] Toggle between password and passwordless modes works
- [ ] "Forgot password?" link navigates to reset page
- [ ] Successful login redirects to `/tables`

### Tables List (Empty State)

- [ ] Empty state shows: table icon, "No tables yet" heading, description text
- [ ] "Build a Table with AI" button (primary, gradient with sparkles icon)
- [ ] "or create one manually" link visible
- [ ] Starter prompts grid visible (3 columns on desktop)
- [ ] Clicking starter opens chat panel with prompt pre-filled
- [ ] Clicking "Build a Table with AI" opens chat panel
- [ ] Header shows: Ask AI, Import CSV, Create Table buttons

### Transition to Core Flow

- [ ] After creating first table (any method), user lands on Table View page
- [ ] Chat panel available with AI assistant ready
- [ ] AI suggests next steps appropriate to the table state
