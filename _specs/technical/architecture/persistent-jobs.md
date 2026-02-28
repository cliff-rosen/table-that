# Persistent Job Architecture for Long-Running Agents

## Core Model

**Table : Conversation = 1 : N, but only one active at a time.**

- Every conversation belongs to exactly one table. No sharing across tables.
- A table can have multiple conversations (browsable history).
- Only one conversation per table can be in the "processing" state at any time.
- When a user navigates to a table, they see the active or most recent conversation, with the option to view older ones.

## Conversation State Machine

```
idle ──[user sends message]──► processing ──[agent completes]──► idle
                                    │
                                    └──[user cancels]──► cancelled ──► idle
```

States:
- **Idle**: Messages stored in DB. No live streams. Client just reads from DB.
- **Processing**: A job is running. A record marks this conversation as in-progress and stores the queue/channel ID for live event subscription.
- **Cancelled**: The backend worker receives the cancel signal, stops work, persists whatever was completed so far, and transitions back to idle. Any partial results (e.g., 4 of 10 rows researched) are kept in the message history.

## User Scenarios

### User sends a message in an idle conversation
Normal case. Conversation transitions to processing. Client subscribes to the event queue.

### User clicks Cancel while processing
Cancel signal sent to backend. Worker stops, saves partial progress, conversation goes back to idle. Client shows the conversation with whatever completed.

### User clicks "New Chat" while current conversation is processing
This is an implicit cancel. The current conversation receives a cancel signal and transitions to cancelled → idle. A new conversation is created for this table and becomes the active one. The old conversation (with its partial results) is preserved in history.

### User starts typing in a new message while processing
The input should be disabled or queued. You can't send a new user message to a conversation that's currently processing. The UI should make this clear (disabled send button, "AI is working..." indicator). The user's options are: wait, or cancel.

### User selects an old conversation from history (not processing)
Simple read-only view. Load messages from DB. No queue subscription. The user is browsing history. They could choose to "continue" this conversation (making it the active one), or just read it.

### User selects a conversation that is currently processing
Load messages from DB (catch-up on everything that's already been persisted), then subscribe to the event queue for live updates. The user lands right in the middle of the action, seeing completed steps and watching new ones arrive. This is the reconnect-after-disconnect scenario. Same device, different device, doesn't matter.

### User navigates away from the table while processing
Nothing happens on the backend. The worker keeps running. The client unsubscribes from the queue. When the user comes back (same session or different), they hit the normal load sequence: DB first, then queue subscription if still processing.

### User switches to a different table while processing
Same as navigating away. The conversation on the old table keeps processing in the background. When the user returns to that table, they reconnect to it.

## Client Load Sequence

When the user navigates to a table:

1. Fetch the conversation list for this table (most recent first)
2. Load the active/latest conversation's messages from the database
3. Check: is this conversation currently processing?
4. If **yes** — subscribe to the event queue, tail live updates (new messages, tool progress, completions)
5. If **no** — static view, just the DB messages

This is the same sequence regardless of whether the user is returning to a tab, opening a new device, or reconnecting after a disconnect. The database is always loaded first; the queue is only for live tailing.

## What This Enables

- Close browser mid-research, reopen on phone, see full progress + live updates
- Server-side agent keeps running regardless of client connection state
- No work lost or repeated on reconnect — DB has the completed steps, queue has the live tail
- History browsing across past conversations for a given table

## Key Design Decisions Still Open

- Storage for event log: append to existing chat_messages table vs separate event log table?
- Queue technology: Redis pub/sub, SSE with DB polling, or something else?
- How much intermediate state to persist (every tool_progress event, or just tool_complete checkpoints)?
- Worker crash recovery: replay from last checkpoint in the event log?
- Frontend conversation switcher UX (list of past conversations per table)
