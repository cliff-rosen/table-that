"""
Analyze the last chat conversation against the quality framework.
Pulls messages + traces from the database and evaluates each turn.
"""
import sys
import os
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env'))

from sqlalchemy import create_engine, text
from config.settings import Settings

settings = Settings()
engine = create_engine(settings.DATABASE_URL)

with engine.connect() as conn:
    # Get the most recent conversation
    row = conn.execute(text(
        "SELECT id, user_id, app, title, created_at, updated_at "
        "FROM conversations ORDER BY updated_at DESC LIMIT 1"
    )).fetchone()

    if not row:
        print("No conversations found.")
        sys.exit(0)

    conv_id, user_id, app, title, created_at, updated_at = row
    print(f"=== Conversation #{conv_id} ===")
    print(f"App: {app}")
    print(f"Title: {title}")
    print(f"Created: {created_at}")
    print(f"Updated: {updated_at}")
    print()

    # Get all messages
    messages = conn.execute(text(
        "SELECT id, role, content, context, extras, created_at "
        "FROM messages WHERE conversation_id = :cid ORDER BY created_at ASC"
    ), {"cid": conv_id}).fetchall()

    print(f"Total messages: {len(messages)}")
    print()

    for msg_id, role, content, context_json, extras_json, msg_created in messages:
        context = json.loads(context_json) if context_json else {}
        extras = json.loads(extras_json) if extras_json else {}

        # Truncate content for display
        content_preview = content[:200] + "..." if len(content) > 200 else content

        print(f"--- [{role.upper()}] (msg #{msg_id}, {msg_created}) ---")
        print(f"Content: {content_preview}")

        if role == "user":
            page = context.get("current_page", "?")
            tab = context.get("active_tab", "")
            stream = context.get("stream_name", "")
            report = context.get("report_name", "")
            print(f"  Page: {page}" + (f" / {tab}" if tab else ""))
            if stream:
                print(f"  Stream: {stream}")
            if report:
                print(f"  Report: {report}")

        if role == "assistant":
            # Trace analysis
            trace = extras.get("trace")
            if trace:
                iterations = trace.get("iterations", [])
                outcome = trace.get("outcome", "?")
                total_in = trace.get("total_input_tokens", 0)
                total_out = trace.get("total_output_tokens", 0)
                peak_in = trace.get("peak_input_tokens")
                duration = trace.get("total_duration_ms", 0)

                # Compute peak from iterations if not stored (old traces)
                if peak_in is None and iterations:
                    peak_in = max(it.get("usage", {}).get("input_tokens", 0) for it in iterations)

                print(f"  Outcome: {outcome}")
                print(f"  Iterations: {len(iterations)}")
                print(f"  Tokens - cumulative in: {total_in:,} | cumulative out: {total_out:,} | peak context: {peak_in:,}")
                print(f"  Peak context: {peak_in / 200000 * 100:.1f}% of 200k window")
                print(f"  Duration: {duration / 1000:.2f}s")

                # Check final iteration stop_reason
                if iterations:
                    last_stop = iterations[-1].get("stop_reason", "?")
                    print(f"  Final stop_reason: {last_stop}")
                    if last_stop == "max_tokens":
                        print(f"  *** WARNING: Response was TRUNCATED (max_tokens) ***")

                # Analyze tool calls
                all_tool_calls = []
                for it in iterations:
                    for tc in it.get("tool_calls", []):
                        all_tool_calls.append(tc)

                if all_tool_calls:
                    print(f"  Tool calls ({len(all_tool_calls)}):")
                    for tc in all_tool_calls:
                        name = tc.get("tool_name", "?")
                        exec_ms = tc.get("execution_ms", 0)
                        output_text = tc.get("output_to_model", "")
                        is_error = output_text.startswith("Error:") or "error" in output_text[:50].lower()
                        output_preview = output_text[:120].replace("\n", " ")

                        status = "ERROR" if is_error else "ok"
                        print(f"    - {name} [{status}] ({exec_ms}ms)")
                        if is_error:
                            print(f"      Output: {output_preview}")

                        # Check for help misses
                        if name == "get_help" and ("not found" in output_text.lower() or "no topics" in output_text.lower()):
                            print(f"      *** HELP MISS: topic not found ***")

            # Check payload parsing
            sv = extras.get("suggested_values")
            sa = extras.get("suggested_actions")
            cp = extras.get("custom_payload")
            payloads = extras.get("payloads", [])

            payload_parts = []
            if sv:
                payload_parts.append(f"{len(sv)} suggested_values")
            if sa:
                payload_parts.append(f"{len(sa)} suggested_actions")
            if cp:
                payload_parts.append(f"custom_payload: {cp.get('type', '?')}")
            if payloads:
                payload_parts.append(f"{len(payloads)} payloads")
            if payload_parts:
                print(f"  Structured output: {', '.join(payload_parts)}")

        print()
