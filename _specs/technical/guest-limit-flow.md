# Guest Limit Flow — End-to-End Trace

## Sequence Overview

```
User sends message
  → Backend saves message to DB (count increments)
  → Backend checks: is user a guest? Is count >= 10?
  → If yes: sets flag, but STILL PROCESSES the message
  → AI responds normally → yields CompleteEvent
  → THEN yields GuestLimitEvent
  → Frontend receives guest_limit event
  → Frontend sets guestLimitReached = true
  → Chat input is replaced with "Register to continue" button
  → User clicks Register → convertGuest() → resetGuestLimit()
  → Input reappears, chat continues
```

---

## 1. Backend Trigger

**File:** `backend/services/chat_stream_service.py`

After saving the user's message to the DB (which increments the count), the backend checks the limit:

```python
# Lines 108-120
guest_limit_hit = False
user = await user_service.get_user_by_id(self.user_id)
if user and user.is_guest:
    msg_count = await self.chat_service.count_user_messages(self.user_id)
    if msg_count >= GUEST_TURN_LIMIT:   # GUEST_TURN_LIMIT = 10
        guest_limit_hit = True
```

This sets a flag — it does NOT block processing. The AI processes the message normally. After the AI response is fully streamed:

```python
# Lines 342-351
yield CompleteEvent(payload=final_payload).model_dump_json()

if guest_limit_hit:
    yield GuestLimitEvent(
        message="You've used all your free messages. Register to keep going."
    ).model_dump_json()
```

**Key:** `GuestLimitEvent` is yielded AFTER `CompleteEvent`, so the AI response is delivered first.

---

## 2. SSE Parsing

**File:** `frontend/src/lib/api/chatApi.ts`

Events arrive as SSE `data:` lines, parsed as JSON, yielded as typed `StreamEvent` objects. No special handling for `guest_limit` — it's just another event type in the stream.

---

## 3. Frontend State Change

**File:** `frontend/src/context/ChatContext.tsx`

Inside `sendMessage()`, the event loop handles `guest_limit`:

```typescript
// Lines 182-187
case 'guest_limit':
    setGuestLimitReached(true);   // <-- THIS IS THE BLOCKING STATE
    setIsLoading(false);
    setStreamingText('');
    setStatusText(null);
    break;
```

This sets `guestLimitReached = true` in React state.

---

## 4. UI Effect — Input Replaced

**File:** `frontend/src/components/chat/ChatTray.tsx`

```typescript
// Lines 655-668
{guestLimitReached && isGuest ? (
    <div className="text-center space-y-2">
        <p>You've used all your free messages.</p>
        <button onClick={() => setShowRegistrationModal(true)}>
            Register to continue
        </button>
    </div>
) : (
    <form onSubmit={handleSubmit}>
        <textarea ... />
        <button type="submit" ... />
    </form>
)}
```

When `guestLimitReached && isGuest` is true:
- The text input **disappears entirely** (not disabled — gone)
- Replaced with "Register to continue" button
- User cannot type new messages

---

## 5. Registration Resets the Block

**File:** `frontend/src/components/auth/GuestRegistrationModal.tsx`

```typescript
// Lines 23-26
await convertGuest(email, password);  // Sets is_guest=false in DB, updates JWT
resetGuestLimit();                     // Sets guestLimitReached = false
onClose();                             // Closes modal
```

After this:
- `isGuest` becomes `false` (email no longer ends in `@guest.tablethat.ai`)
- `guestLimitReached` becomes `false`
- The condition `guestLimitReached && isGuest` is `false`
- Input form reappears

---

## 6. The Data Proposal Path

**File:** `frontend/src/hooks/useTableProposal.ts`

When the user clicks "Apply All" on a data proposal:

```typescript
// Line 161 (inside applyData)
sendMessage('[User accepted the data proposal and applied all changes.]');
```

This calls `sendMessage()` directly — **no check on `guestLimitReached`**. The message goes to the backend, which processes it and may yield another `guest_limit` event.

The same applies to schema proposals (line 175):
```typescript
sendMessage('[User accepted the schema proposal and applied changes.]');
```

---

## 7. Where is the ACTUAL block?

There are only **two** places `guestLimitReached` is used:

| Location | What it does |
|----------|-------------|
| `ChatContext.tsx:183` | Sets it to `true` when `guest_limit` event received |
| `ChatTray.tsx:655` | Hides the input form when `true && isGuest` |

There is **no** guard preventing `sendMessage()` from being called programmatically. The block is purely UI — the input is hidden so the user can't type.

---

## 8. Guest UI Restrictions (TableViewPage)

**File:** `frontend/src/pages/TableViewPage.tsx`

Guests should not see:
- **Edit Schema** button — hidden via `{!isGuest && (...)}`
- Suggestion pills in chat — disabled via `disabled={isLoading || (guestLimitReached && isGuest)}`

---

## Possible Failure Scenarios

### Scenario A: Limit hit on same message as data proposal
1. Guest sends message 10 ("Add 3 applications")
2. Backend: `guest_limit_hit = true`, processes anyway, yields DATA_PROPOSAL
3. Backend: yields `CompleteEvent`, then `GuestLimitEvent`
4. Frontend: renders data proposal AND sets `guestLimitReached = true`
5. User clicks "Apply All" → `applyData()` calls `sendMessage()`
6. Backend receives message 11, processes it (user is still a guest)
7. Backend yields another `GuestLimitEvent` after complete
8. Frontend: `guestLimitReached` is already true, input already hidden
9. AI follow-up IS delivered ✓

### Scenario B: Race condition with registration
1. Steps 1-5 from above
2. User sees "Register to continue" but ALSO sees the data proposal
3. User registers FIRST → `resetGuestLimit()` → `isGuest = false`
4. User clicks "Apply All" → `sendMessage()` fires
5. Backend: user is no longer a guest → no limit check → processes normally ✓

### Scenario C: ???
What exact sequence caused the bug you saw?
