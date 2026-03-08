"""
Cancel flow tests.

Verifies that cancelling a streaming chat request at various points
leaves the database in a valid state:
- Once a user message is persisted, it MUST be paired with an assistant message.
- If cancel happens before _setup_chat, nothing is written.
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

    def test_cancel_after_chat_id_event(self, cancel_client):
        """
        Cancel immediately after receiving chat_id event.

        This is the critical timing window: _setup_chat has committed the
        user message, but the LLM hasn't started yet. The finally block
        must persist an assistant message.
        """
        context = {"current_page": "tables_list"}

        # Start streaming
        resp = stream_chat(cancel_client, "Say hello", context)

        # Read just until we get the chat_id event
        events = parse_sse_events(resp, stop_after_type="chat_id")

        chat_id_events = [e for e in events if e.get("type") == "chat_id"]
        assert len(chat_id_events) > 0, f"Never got chat_id event. Events: {events}"

        conversation_id = chat_id_events[0]["conversation_id"]

        # Immediately close the connection (cancel!)
        resp.close()

        # Give the backend's finally block time to persist
        time.sleep(2)

        # Verify the DB state: must have both user and assistant messages
        conv = get_conversation_messages(cancel_client, "tables_list")
        assert conv is not None, "Conversation not found after cancel"

        messages = conv.get("messages", [])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        assert len(user_msgs) >= 1, f"Expected at least 1 user message, got {len(user_msgs)}"
        assert len(assistant_msgs) >= 1, (
            f"INVARIANT VIOLATION: User message persisted but no assistant message! "
            f"Messages: {[(m['role'], m['content'][:50]) for m in messages]}"
        )

        print(f"\nPASS Cancel after chat_id: conversation {conversation_id}")
        print(f"  User messages: {len(user_msgs)}")
        print(f"  Assistant messages: {len(assistant_msgs)}")
        print(f"  Last assistant content: {assistant_msgs[-1]['content'][:80]}")

    def test_cancel_during_streaming(self, cancel_client):
        """
        Cancel after some text has streamed back.

        The assistant message should be saved with whatever text was
        collected up to the cancellation point.
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

        # Cancel!
        resp.close()

        # Give backend time
        time.sleep(2)

        # Verify DB state
        conv = get_conversation_messages(cancel_client, "tables_list")
        assert conv is not None

        messages = conv.get("messages", [])
        user_msgs = [m for m in messages if m["role"] == "user"]
        assistant_msgs = [m for m in messages if m["role"] == "assistant"]

        # Should have at least the messages from the first test + this test
        last_user = user_msgs[-1] if user_msgs else None
        last_assistant = assistant_msgs[-1] if assistant_msgs else None

        assert last_user is not None, "No user messages found"
        assert last_assistant is not None, (
            f"INVARIANT VIOLATION: User message persisted but no assistant message!"
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
