"""
Detailed analysis of the last chat conversation - full tool I/O and system prompt.
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
        "SELECT id FROM conversations ORDER BY updated_at DESC LIMIT 1"
    )).fetchone()

    conv_id = row[0]

    # Get all messages
    messages = conn.execute(text(
        "SELECT id, role, content, context, extras, created_at "
        "FROM messages WHERE conversation_id = :cid ORDER BY created_at ASC"
    ), {"cid": conv_id}).fetchall()

    for msg_id, role, content, context_json, extras_json, msg_created in messages:
        context = json.loads(context_json) if context_json else {}
        extras = json.loads(extras_json) if extras_json else {}

        print(f"{'='*80}")
        print(f"[{role.upper()}] msg #{msg_id}")
        print(f"{'='*80}")

        if role == "user":
            print(f"Message: {content}")
            print(f"\nContext keys: {list(context.keys())}")
            # Show article context if present
            article = context.get("current_article")
            if article:
                print(f"Current article: {article.get('title', '?')[:80]}")
                print(f"  PMID: {article.get('pmid')}")
                has_stance = bool(article.get('stance_analysis'))
                has_summary = bool(article.get('ai_summary'))
                print(f"  Has stance: {has_stance}, Has AI summary: {has_summary}")

        if role == "assistant":
            print(f"Full response:\n{content}")

            trace = extras.get("trace")
            if trace:
                # System prompt size
                sys_prompt = trace.get("system_prompt", "")
                print(f"\n--- System Prompt ({len(sys_prompt)} chars) ---")
                # Show section headers
                for line in sys_prompt.split("\n"):
                    if line.strip().startswith("==") or line.strip().startswith("##"):
                        print(f"  {line.strip()}")

                # Show available tools
                tools = trace.get("tools", [])
                print(f"\nAvailable tools ({len(tools)}): {[t['name'] for t in tools]}")

                # Detailed tool call analysis
                for it in trace.get("iterations", []):
                    it_num = it.get("iteration", "?")
                    stop = it.get("stop_reason", "?")
                    usage = it.get("usage", {})
                    print(f"\n--- Iteration {it_num} (stop: {stop}, in: {usage.get('input_tokens', 0):,}, out: {usage.get('output_tokens', 0):,}) ---")

                    for tc in it.get("tool_calls", []):
                        name = tc.get("tool_name")
                        inp = tc.get("tool_input", {})
                        out_model = tc.get("output_to_model", "")
                        exec_ms = tc.get("execution_ms", 0)

                        print(f"\n  Tool: {name}")
                        print(f"  Input: {json.dumps(inp, indent=4)[:500]}")
                        print(f"  Execution: {exec_ms}ms")
                        # Show output (truncated)
                        out_preview = out_model[:600]
                        if len(out_model) > 600:
                            out_preview += f"\n    ... ({len(out_model)} chars total)"
                        print(f"  Output to model:\n    {out_preview}")

        print()
