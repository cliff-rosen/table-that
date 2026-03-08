"""
Test: Send message and IMMEDIATELY cancel (close connection).

This simulates the user clicking send then instantly hitting cancel
before ANY events come back from the server.

Reports both backend state (DB) and what the frontend would have received.
"""
import time
import json
import requests

BASE_URL = "http://localhost:8001"


def main():
    # Register a fresh user
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from tests.conftest import APIClient
    client = APIClient(BASE_URL)
    ts = int(time.time())
    email = f"imm_cancel_{ts}@test.example.com"
    resp = client.register(email, "TestPass123!")
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    print(f"Registered: {email}")

    context = {"current_page": "tables_list"}

    # ── Test: Send and IMMEDIATELY close ──
    print("\n=== Sending message and immediately closing connection ===")
    resp = client.session.post(
        f"{BASE_URL}/api/chat/stream",
        json={
            "message": "Say hello",
            "context": context,
            "interaction_type": "text_input",
        },
        headers={"Authorization": f"Bearer {client.token}"},
        stream=True,
        timeout=10,
    )
    print(f"Response status: {resp.status_code}")

    # Read whatever came in the first chunk (might be nothing, might be partial)
    events_received = []
    try:
        # Use a very short timeout to grab whatever's already buffered
        for line in resp.iter_lines(decode_unicode=True):
            if not line or not line.startswith("data: "):
                continue
            json_str = line[6:]
            if json_str in ("", "ping"):
                continue
            try:
                event = json.loads(json_str)
                events_received.append(event)
                print(f"  Received event: type={event.get('type')}")
            except json.JSONDecodeError:
                continue
            # Close IMMEDIATELY after first event (or even before)
            break
    except Exception as e:
        print(f"  Exception during read: {e}")

    # Close connection NOW
    resp.close()
    print(f"  Connection closed. Events received: {len(events_received)}")
    for e in events_received:
        print(f"    {e.get('type')}: {json.dumps(e)[:100]}")

    # Wait for backend to process
    print("\nWaiting 3 seconds for backend to process...")
    time.sleep(3)

    # ── Check DB state ──
    print("\n=== Checking backend DB state ===")
    params = {"current_page": "tables_list", "app": "table_that"}
    conv_resp = client.get("/api/chats/by-context", params=params)
    print(f"GET /api/chats/by-context status: {conv_resp.status_code}")

    if conv_resp.status_code == 200:
        data = conv_resp.json()
        messages = data.get("messages", [])
        print(f"Conversation ID: {data.get('id')}")
        print(f"Total messages: {len(messages)}")
        for m in messages:
            print(f"  [{m['role']}] {m['content'][:80]}")

        user_msgs = [m for m in messages if m["role"] == "user"]
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        print(f"\nUser messages: {len(user_msgs)}")
        print(f"Assistant messages: {len(asst_msgs)}")

        if len(user_msgs) > len(asst_msgs):
            print("\n*** INVARIANT VIOLATION: Orphaned user message! ***")
        elif len(user_msgs) == 0 and len(asst_msgs) == 0:
            print("\nNo messages persisted (clean cancel before _setup_chat)")
        else:
            print("\nMessages are balanced (OK)")
    elif conv_resp.status_code == 404:
        print("No conversation found (nothing was persisted)")
    else:
        print(f"Unexpected response: {conv_resp.text[:200]}")

    # ── Summary for frontend analysis ──
    print("\n=== Frontend perspective ===")
    got_chat_id = any(e.get("type") == "chat_id" for e in events_received)
    print(f"Got chat_id event? {got_chat_id}")
    print(f"backendConfirmed would be: {got_chat_id}")
    if not got_chat_id:
        print("Frontend should: remove optimistic message, restore to input")
    else:
        print("Frontend should: sync from backend")


def test_zero_events():
    """Abort before reading ANY events at all."""
    import sys, os
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    from tests.conftest import APIClient

    client = APIClient(BASE_URL)
    ts = int(time.time())
    email = f"zero_cancel_{ts}@test.example.com"
    resp = client.register(email, "TestPass123!")
    assert resp.status_code == 200, f"Registration failed: {resp.text}"
    print(f"\nRegistered: {email}")

    context = {"current_page": "tables_list"}

    print("\n=== Sending message and closing BEFORE reading any events ===")
    resp = client.session.post(
        f"{BASE_URL}/api/chat/stream",
        json={
            "message": "Say goodbye",
            "context": context,
            "interaction_type": "text_input",
        },
        headers={"Authorization": f"Bearer {client.token}"},
        stream=True,
        timeout=10,
    )
    print(f"Response status: {resp.status_code}")

    # Close IMMEDIATELY — don't read anything
    resp.close()
    print("Connection closed immediately (zero events read)")

    time.sleep(3)

    print("\n=== Checking backend DB state ===")
    params = {"current_page": "tables_list", "app": "table_that"}
    conv_resp = client.get("/api/chats/by-context", params=params)
    print(f"GET /api/chats/by-context status: {conv_resp.status_code}")

    if conv_resp.status_code == 200:
        data = conv_resp.json()
        messages = data.get("messages", [])
        print(f"Conversation ID: {data.get('id')}")
        print(f"Total messages: {len(messages)}")
        for m in messages:
            print(f"  [{m['role']}] {m['content'][:80]}")

        user_msgs = [m for m in messages if m["role"] == "user"]
        asst_msgs = [m for m in messages if m["role"] == "assistant"]
        print(f"User messages: {len(user_msgs)}, Assistant messages: {len(asst_msgs)}")
        if len(user_msgs) > len(asst_msgs):
            print("*** INVARIANT VIOLATION: Orphaned user message! ***")
        elif len(messages) == 0:
            print("No messages persisted (clean cancel)")
        else:
            print("Messages are balanced (OK)")
    elif conv_resp.status_code == 404:
        print("No conversation found (nothing persisted — clean cancel)")
    else:
        print(f"Unexpected: {conv_resp.text[:200]}")


if __name__ == "__main__":
    main()
    test_zero_events()
