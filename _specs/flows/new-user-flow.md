# New User Flow

> Registration, login, and first-use experience — the preamble before [Core Flow](./core-flow.md).

---

## Overview

A new user arrives at TableThat and can either **try it immediately as a guest** or **register first**. Both paths lead to the Tables List, where the first-use experience guides them into the [Core Flow](./core-flow.md) (create table → populate → enrich).

```
Landing Page → type prompt → guest session → /tables (chat open) → Core Flow
                   — or —
Landing Page → Get Started → Register → /tables (PromptHero) → Core Flow
```

---

## Step 0: Guest Try-It Flow

The primary entry path — user tries before registering.

### What the user sees

**Landing page** with pain-statement hero:

```
         "Here's your updated table."
         You check. It's not updated.

  You ask AI to build a table. It says "Done!"
  It's never done. Rows are missing. Values changed.
  You're doing QA, not work.

  We could explain how we fix this. Or you could just try it.

  ┌──────────────────────────────────────────┐
  │ Describe your table...                   │
  │                                          │
  └──────────────────────────────────────────┘
              [ Create Table ]
  [Find a Dentist] [Compare Laptops]
  [Track Job Applications] [Research Competitors]
```

> Note: Landing page pills display the full prompt text as button labels (e.g., "Build me a list of top dentists in my area with ratings, insurance accepted, and availability"). The short names above are the internal `title` used for filtering.

**Header** (PublicTopBar): App name, dark mode toggle, "Log in" link, "Get Started" button (links to /register)

### What happens on submit

1. User types a prompt (or clicks a starter pill)
2. `guestLogin()` creates an anonymous session via `POST /api/auth/guest`
3. Prompt stored in `sessionStorage` as `guestInitialPrompt`
4. Navigate to `/tables`

### Tables List bridge

On mount, `TablesListPage` picks up `guestInitialPrompt` from `sessionStorage`:
- Opens chat panel
- Sends the prompt as a new conversation
- Clears the sessionStorage key

### Guest restrictions

| Feature | Guest | Registered |
|---------|-------|-----------|
| Import CSV button | Hidden | Visible |
| Create Table button (header) | Hidden | Visible |
| StarterGrid | Hidden | Visible |
| PromptHero (empty state) | Hidden (sees "Your table will appear here") | Visible |
| Edit Schema button | Hidden | Visible |
| Suggestion pills (after guest limit) | Disabled | Always enabled |
| Profile / Logout | Hidden | Visible |
| Header CTA | "Log in" + "Register to save your work" | Profile icon + Logout |

### Guest limit

The backend enforces a configurable message limit (`GUEST_TURN_LIMIT` constant in `chat_stream_service.py`). When a guest's total message count reaches the limit:

1. The current message is still processed normally (AI responds)
2. A `GuestLimitEvent` is yielded after the `CompleteEvent`
3. Frontend hides the chat input and shows "Register to continue"
4. Suggestion pills are disabled

See [guest-limit-flow.md](../technical/guest-limit-flow.md) for the full end-to-end trace.

### Conversion

Clicking "Register to save your work" in the header opens `GuestRegistrationModal`:
- Email + password fields
- Converts the anonymous account to a real account
- All tables and data preserved

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

The Tables List has two empty states depending on context:

### State A — PromptHero

Shown when: no tables AND chat closed AND not a guest AND no active proposal.

```
         What do you want to track?
  Describe a table and AI will build it for you...
  ┌──────────────────────────────────────────┐
  │ Describe your table...                   │
  │                                          │
  └──────────────────────────────────────────┘
              [ Create Table ]
  [Find a Dentist] [Compare Laptops]
  [Track Job Applications] [Research Competitors]
           or create a table manually
```

- Heading: "What do you want to track?"
- Subtext: "Describe a table and AI will build it for you — schema, data, and all."
- Textarea with placeholder "Describe your table..."
- "Create Table" submit button
- 4 starter pills: Find a Dentist, Compare Laptops, Track Job Applications, Research Competitors (same as landing page)
- "or create a table manually" link → opens CreateTableModal

### StarterGrid (when tables exist)

When the user has at least one table, the tables list shows a **StarterGrid** below the table cards with up to 6 starter cards (title + description format). The StarterGrid pulls from the full set of starter prompts, which may include additional entries beyond the 4 shown on the landing page and PromptHero (e.g., "Plan a Wedding", "Home Renovation").

### State B — Waiting state

Shown when: no tables AND (chat is open OR user is a guest with chat open).

```
           [Table Icon - faded]
      Your table will appear here
  Describe what you need in the chat...
```

Faded table icon, "Your table will appear here" heading, and subtext directing user to the chat panel.

### Entry points

| Action | What it does |
|--------|-------------|
| **Type prompt + Create Table** (primary) | Opens chat, sends prompt → Core Flow Step 1 |
| **Click a starter pill** | Same as above with preset prompt |
| **or create a table manually** | Opens CreateTableModal |
| **Import CSV** (header, hidden for guests) | Creates table from CSV upload |
| **Create Table** (header, hidden for guests) | Opens CreateTableModal |

### Header actions

- **Import CSV** button — creates table from CSV file upload (hidden for guests)
- **Create Table** button — manual table builder modal (hidden for guests)
- **Dark mode toggle** — always visible
- **Profile icon + Logout** — registered users only
- **"Register to save your work"** — guests only

---

## Step 4: Enter Core Flow

Once the user has chosen how to create their first table (AI prompt, starter pill, manual, or CSV), they enter the [Core Flow](./core-flow.md):

1. **Create Table** — define columns via AI or manual
2. **Populate** — add data via AI research, CSV import, or manual entry
3. **Add Column** — extend schema with enrichment columns
4. **Enrich** — fill new columns with AI research, lookups, or computation

See [core-flow.md](./core-flow.md) for the full specification of each step.

---

## Verification Checklist

### Guest Try-It Flow

- [ ] Landing page shows pain-statement hero: "Here's your updated table." / "You check. It's not updated."
- [ ] Textarea with placeholder "Describe your table..."
- [ ] "Create Table" submit button
- [ ] 4 starter pills: Find a Dentist, Compare Laptops, Track Job Applications, Research Competitors
- [ ] Header shows "Log in" and "Get Started" links
- [ ] Submitting prompt: creates guest session, navigates to /tables, chat opens, prompt sent
- [ ] Clicking starter pill: same behavior with preset prompt
- [ ] Guest restrictions: no Import CSV, no Create Table, no StarterGrid, no PromptHero, no Edit Schema
- [ ] Guest header: "Log in" + "Register to save your work" (not profile/logout)
- [ ] After guest limit: input hidden, "Register to continue" shown, suggestion pills disabled
- [ ] GuestRegistrationModal: email + password, converts anonymous account, resets guest limit

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

- [ ] PromptHero visible when no tables and chat closed: heading, textarea, button, 4 starter pills, manual link
- [ ] Submitting prompt or clicking starter opens chat and sends message
- [ ] After chat opens with no tables: shows "Your table will appear here" placeholder
- [ ] Header shows Import CSV and Create Table buttons (hidden for guests)
- [ ] Guest users see "Register to save your work" in header instead of profile/logout
- [ ] Dark mode toggle visible

### Transition to Core Flow

- [ ] After creating first table (any method), user lands on Table View page
- [ ] Chat panel available with AI assistant ready
- [ ] AI suggests next steps appropriate to the table state
