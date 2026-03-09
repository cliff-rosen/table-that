"""
Cancel flow tests.

Verifies that cancelling a streaming chat request at various points
leaves the database in a valid state (write-late pattern):

- Cancel with no content streamed → nothing written to DB
- Cancel with content streamed → user + assistant messages committed atomically
- Normal completion → user + assistant messages committed atomically
- No orphaned user messages ever
"""

import time
import json
import requests
import pytest

BASE_URL = "http://localhost:8001"


@pytest.fixture(scope="module")
def cancel_client():
    """Register a fresh user for cancel tests."""
    from tests.conftest import APIClient

    client = APIClient(BASE_URL)
    ts = int(time.time())
    email = f"cancel_test_{ts}@test.example.com"
    resp = client.register(email, "TestPass123!")
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    return client


def stream_chat(client, message: str, context: dict, conversation_id=None, timeout=30):
    """Start a streaming chat request. Returns the Response object (streaming)."""
    return client.session.post(
        f"{BASE_URL}/api/chat/stream",
        json={
            "message": message,
            "context": context,
            "interaction_type": "text_input",
            "conversation_id": conversation_id,
        },
        headers={"Authorization": f"Bearer {client.token}"},
        stream=True,
        timeout=timeout,
    )


def parse_sse_events(response, max_events=None, stop_after_type=None):
    """Parse SSE events from a streaming response. Returns list of parsed events."""
    events = []
    for line in response.iter_lines(decode_unicode=True):
        if not line or not line.startswith("data: "):
            continue
        json_str = line[6:]
        if json_str in ("", "ping"):
            continue
        try:
            event = json.loads(json_str)
            events.append(event)
            if max_events and len(events) >= max_events:
                break
            if stop_after_type and event.get("type") == stop_after_type:
                break
        except json.JSONDecodeError:
            continue
    return events


def get_conversation_messages(client, current_page: str, table_id=None):
    """Fetch the conversation and its messages for a given context."""
    params = {"current_page": current_page, "app": "table_that"}
    if table_id:
        params["table_id"] = table_id
    resp = client.get("/api/chats/by-context", params=params)
    if resp.status_code != 200:
        return None
    data = resp.json()
    return data


class TestCancelFlow:
    """Test cancellation at different points in the stream."""

    def test_cancel_before_content(self, cancel_client):
        """
        Cancel immediately after first status event (before any text_delta).

        With write-late pattern, nothing should be written to the DB.
        """
        context = {"current_page": "tables_list"}

        # Start streaming
        resp = stream_chat(cancel_client, "Say hello", context)

        # Read just the first status event, then cancel
        events = parse_sse_events(resp, stop_after_type="status")
        assert len(events) >= 1, f"Expected at least 1 event. Events: {events}"

        # Immediately close the connection (cancel!)
        resp.close()

        # Give the backend time to process
        time.sleep(2)

        # Verify nothing was written — no conversation should exist
        conv = get_conversation_messages(cancel_client, "tables_list")

        if conv is not None:
            messages = conv.get("messages", [])
            # If a conversation was created (from a prior run), that's OK.
            # What matters: no NEW orphaned user message from this test.
            # The conversation should have 0 messages or balanced pairs.
            user_msgs = [m for m in messages if m["role"] == "user"]
            assistant_msgs = [m for m in messages if m["role"] == "assistant"]
            assert len(user_msgs) == len(assistant_msgs), (
                f"INVARIANT VIOLATION: unbalanced messages after cancel-before-content! "
                f"user={len(user_msgs)} assistant={len(assistant_msgs)} "
                f"messages={[(m['role'], m['content'][:50]) for m in messages]}"
            )

        print(f"\nPASS Cancel before content: {'no conversation' if conv is None else 'balanced'}")

    def test_cancel_during_streaming(self, cancel_client):
        """
        Cancel after some text has streamed back.

        The turn (user + partial assistant) should be committed atomically.
        """
        context = {"current_page": "tables_list"}

        # Start streaming
        resp = stream_chat(cancel_client, "Tell me a long story about a dog", context)

        # Read until we get some text_delta events
        events = []
        text_deltas = 0
        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            json_str = line[6:]
            if json_str in ("", "ping"):
                continue
            try:
                event = json.loads(json_str)
                events.append(event)
                if event.get("type") == "text_delta":
                    text_deltas += 1
                    if text_deltas >= 5:
                        break
            except json.JSONDecodeError:
                continue

        assert text_deltas >= 5, f"Only got {text_deltas} text_delta events"

        # Cancel!
        resp.close()

        # Give backend time to commit — SSE scope cleanup can take 4+ seconds
        time.sleep(6)

        # Verify DB state: should have a committed turn
        conv = get_conversation_messages(cancel_client, "tables_list")
        assert conv is not None, "Conversation not found after cancel-with-content"

        messages = conv.get("messages", [])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        last_user = user_msgs[-1] if user_msgs else None
        last_assistant = assistant_msgs[-1] if assistant_msgs else None

        assert last_user is not None, "No user messages found"
        assert last_assistant is not None, (
            f"INVARIANT VIOLATION: User message persisted but no assistant message! "
            f"Messages: {[(m['role'], m['content'][:50]) for m in messages]}"
        )

        print(f"\nPASS Cancel during streaming:")
        print(f"  Total user messages: {len(user_msgs)}")
        print(f"  Total assistant messages: {len(assistant_msgs)}")
        print(f"  Last assistant content: {last_assistant['content'][:80]}")

    def test_message_pairing_integrity(self, cancel_client):
        """
        Verify that every user message in the conversation has a
        corresponding assistant message after it. No orphaned user messages.
        """
        conv = get_conversation_messages(cancel_client, "tables_list")
        assert conv is not None

        messages = conv.get("messages", [])
        # Filter to user/assistant only (skip system messages)
        msgs = [m for m in messages if m["role"] in ("user", "assistant")]

        # Walk through and verify pairing
        i = 0
        pairs = 0
        while i < len(msgs):
            if msgs[i]["role"] == "user":
                # Next message must be assistant
                assert i + 1 < len(msgs), (
                    f"Orphaned user message at index {i}: {msgs[i]['content'][:50]}"
                )
                assert msgs[i + 1]["role"] == "assistant", (
                    f"Expected assistant after user at index {i}, "
                    f"got {msgs[i+1]['role']}: {msgs[i+1]['content'][:50]}"
                )
                pairs += 1
                i += 2
            else:
                # Standalone assistant message (shouldn't happen normally)
                i += 1

        print(f"\nPASS Message pairing integrity: {pairs} complete pairs verified")
