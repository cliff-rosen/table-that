"""
Dump the last 10 conversations with full trace data for analysis.
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

output = []

with engine.connect() as conn:
    convos = conn.execute(text(
        "SELECT id, user_id, app, title, created_at, updated_at "
        "FROM conversations ORDER BY updated_at DESC LIMIT 10"
    )).fetchall()

    for conv_id, user_id, app, title, created_at, updated_at in convos:
        conv_data = {
            "id": conv_id,
            "app": app,
            "title": title,
            "created_at": str(created_at),
            "updated_at": str(updated_at),
            "messages": []
        }

        messages = conn.execute(text(
            "SELECT id, role, content, context, extras, created_at "
            "FROM messages WHERE conversation_id = :cid ORDER BY created_at ASC"
        ), {"cid": conv_id}).fetchall()

        for msg_id, role, content, context_json, extras_json, msg_created in messages:
            context = json.loads(context_json) if context_json else {}
            extras = json.loads(extras_json) if extras_json else {}

            msg_data = {
                "id": msg_id,
                "role": role,
                "content": content,
                "created_at": str(msg_created),
            }

            if role == "user":
                msg_data["page"] = context.get("current_page", "?")
                msg_data["active_tab"] = context.get("active_tab")
                msg_data["stream_name"] = context.get("stream_name")
                msg_data["report_name"] = context.get("report_name")
                msg_data["user_role"] = context.get("user_role")
                article = context.get("current_article")
                if article:
                    msg_data["article_title"] = article.get("title", "")[:100]
                    msg_data["article_pmid"] = article.get("pmid")
                    msg_data["has_stance"] = bool(article.get("stance_analysis"))
                    msg_data["has_ai_summary"] = bool(article.get("ai_summary"))

            if role == "assistant":
                trace = extras.get("trace")
                if trace:
                    iterations = trace.get("iterations", [])
                    peak_in = trace.get("peak_input_tokens")
                    if peak_in is None and iterations:
                        peak_in = max(it.get("usage", {}).get("input_tokens", 0) for it in iterations)

                    msg_data["outcome"] = trace.get("outcome")
                    msg_data["total_iterations"] = len(iterations)
                    msg_data["total_input_tokens"] = trace.get("total_input_tokens", 0)
                    msg_data["total_output_tokens"] = trace.get("total_output_tokens", 0)
                    msg_data["peak_input_tokens"] = peak_in
                    msg_data["duration_ms"] = trace.get("total_duration_ms", 0)
                    msg_data["tools_available"] = [t["name"] for t in trace.get("tools", [])]
                    msg_data["system_prompt_chars"] = len(trace.get("system_prompt", ""))

                    # System prompt section headers
                    sp = trace.get("system_prompt", "")
                    sections = [l.strip() for l in sp.split("\n") if l.strip().startswith("==")]
                    msg_data["system_prompt_sections"] = sections

                    # Per-iteration details
                    msg_data["iterations"] = []
                    for it in iterations:
                        it_data = {
                            "num": it.get("iteration"),
                            "stop_reason": it.get("stop_reason"),
                            "input_tokens": it.get("usage", {}).get("input_tokens", 0),
                            "output_tokens": it.get("usage", {}).get("output_tokens", 0),
                            "tool_calls": []
                        }
                        for tc in it.get("tool_calls", []):
                            tc_data = {
                                "tool": tc.get("tool_name"),
                                "input": tc.get("tool_input", {}),
                                "output": tc.get("output_to_model", "")[:800],
                                "output_full_len": len(tc.get("output_to_model", "")),
                                "exec_ms": tc.get("execution_ms", 0),
                                "is_error": tc.get("output_to_model", "").startswith("Error:") or
                                           "error" in tc.get("output_to_model", "")[:80].lower()
                            }
                            # Check for help misses
                            out = tc.get("output_to_model", "").lower()
                            if tc.get("tool_name") == "get_help":
                                tc_data["help_miss"] = "not found" in out or "no topics" in out or "no help" in out
                            it_data["tool_calls"].append(tc_data)
                        msg_data["iterations"].append(it_data)

                # Structured output info
                msg_data["has_suggested_values"] = bool(extras.get("suggested_values"))
                msg_data["has_suggested_actions"] = bool(extras.get("suggested_actions"))
                msg_data["has_custom_payload"] = bool(extras.get("custom_payload"))
                if extras.get("custom_payload"):
                    msg_data["payload_type"] = extras["custom_payload"].get("type")
                msg_data["payload_count"] = len(extras.get("payloads", []))

            conv_data["messages"].append(msg_data)

        output.append(conv_data)

# Write to file
out_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "..", "chat_dump.json")
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(output, f, indent=2, ensure_ascii=False)

print(f"Dumped {len(output)} conversations to {os.path.abspath(out_path)}")
for c in output:
    turns = len([m for m in c["messages"] if m["role"] == "user"])
    print(f"  Conv #{c['id']}: {turns} turns, app={c['app']}, title={c['title'][:60] if c['title'] else 'None'}")
