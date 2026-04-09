"""
LLM Response Parser

Parses structured markers out of raw LLM response text:
- SUGGESTED_VALUES: [...] — quick-reply suggestions for the user
- SUGGESTED_ACTIONS: [...] — UI actions (close chat, navigate, etc.)
- Custom payloads (SCHEMA_PROPOSAL:, DATA_PROPOSAL:, etc.) — page-specific
  structured responses registered via the payload system

All functions are stateless and have no dependency on ChatStreamService.
"""

import json
import logging
import re
import uuid
from collections import defaultdict
from dataclasses import dataclass
from typing import Any, Dict, List, Optional

from schemas.payloads import summarize_payload
from services.chat_page_config import PageLocation, get_all_payloads_for_page

logger = logging.getLogger(__name__)


@dataclass
class ParsedResponse:
    """Result of parsing structured markers from LLM response text."""
    message_text: str
    suggested_values: Optional[List[Dict[str, Any]]] = None
    suggested_actions: Optional[List[Dict[str, Any]]] = None
    custom_payload: Optional[Dict[str, Any]] = None


def parse_llm_response(
    response_text: str, page: PageLocation
) -> ParsedResponse:
    """Parse LLM response to extract structured components."""
    text = response_text.strip()
    result = ParsedResponse(message_text=text)

    # Parse SUGGESTED_VALUES marker
    text, values = _extract_marker_array(text, "SUGGESTED_VALUES:")
    result.suggested_values = values

    # Parse SUGGESTED_ACTIONS marker
    text, actions = _extract_marker_array(text, "SUGGESTED_ACTIONS:")
    result.suggested_actions = actions

    # Parse custom payloads (page-specific structured responses)
    text, payload = _extract_custom_payload(text, page)
    result.custom_payload = payload

    result.message_text = text
    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_marker_array(
    message: str, marker: str
) -> tuple[str, Optional[List[Dict[str, Any]]]]:
    """Find a marker like SUGGESTED_VALUES: [...] in message, extract the
    JSON array, and return (cleaned_message, parsed_array).

    Handles optional markdown bold/italic wrapping around the marker,
    e.g. **SUGGESTED_VALUES:** or *SUGGESTED_VALUES:*
    """
    marker_text = marker.rstrip(":")
    marker_pattern = re.compile(
        r"\*{0,2}" + re.escape(marker_text) + r"\*{0,2}\s*:"
    )
    match = marker_pattern.search(message)
    if not match:
        return message, None

    marker_pos = match.start()
    after_marker_raw = message[match.end():]
    # Strip whitespace and any trailing bold/italic markers before the JSON
    after_marker_stripped = after_marker_raw.lstrip().lstrip("*").lstrip()
    json_content = _extract_json_array(after_marker_stripped)
    if not json_content:
        return message, None

    try:
        parsed = json.loads(json_content)
        if isinstance(parsed, list):
            # Find where JSON starts in the raw text after the marker
            json_start_in_raw = after_marker_raw.find(json_content)
            end_pos = match.end() + json_start_in_raw + len(json_content)
            cleaned = (message[:marker_pos] + message[end_pos:]).strip()
            return cleaned, parsed
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse {marker} JSON: {json_content[:100]}")

    return message, None


def _extract_custom_payload(
    message: str, page: PageLocation
) -> tuple[str, Optional[Dict[str, Any]]]:
    """Find a custom payload marker (e.g. SCHEMA_PROPOSAL: {...}) in message,
    parse it via the registered payload config, and return (cleaned_message, payload)."""
    payload_configs = get_all_payloads_for_page(page)
    for config in payload_configs:
        marker = config.parse_marker
        # Skip payloads without a parse_marker (tool payloads don't need parsing)
        if not marker:
            continue
        # Build regex that handles optional markdown bold/italic around the marker.
        # e.g. marker "DATA_PROPOSAL:" also matches "**DATA_PROPOSAL**:" or
        # "*DATA_PROPOSAL*:" which LLMs sometimes produce.
        marker_text = marker.rstrip(":")
        marker_pattern = re.compile(
            r"\*{0,2}" + re.escape(marker_text) + r"\*{0,2}\s*:"
        )
        match = marker_pattern.search(message)
        if match:
            marker_pos = match.start()
            after_marker_raw = message[match.end() :]
            after_marker = after_marker_raw.lstrip().lstrip("*").lstrip()
            json_content = _extract_json_object(after_marker)
            if json_content:
                parsed = config.parser(json_content)
                if parsed:
                    # Find where JSON starts in the raw after_marker (preserving whitespace)
                    json_start_in_raw = after_marker_raw.find(json_content)
                    # Calculate full payload text: from marker start through end of JSON
                    end_pos = match.end() + json_start_in_raw + len(json_content)
                    payload_text = message[marker_pos:end_pos]
                    cleaned = message.replace(payload_text, "").strip()
                    return cleaned, parsed

    return message, None


# ---------------------------------------------------------------------------
# JSON extraction utilities
# ---------------------------------------------------------------------------


def _extract_json_object(text: str) -> Optional[str]:
    """Extract a JSON object from the start of text, handling nested braces."""
    if not text.startswith("{"):
        return None
    return _extract_balanced(text, "{", "}")


def _extract_json_array(text: str) -> Optional[str]:
    """Extract a JSON array from the start of text, handling nested brackets."""
    if not text.startswith("["):
        return None
    return _extract_balanced(text, "[", "]")


def _extract_balanced(
    text: str, open_char: str, close_char: str
) -> Optional[str]:
    """Extract balanced content between open and close characters."""
    if not text or text[0] != open_char:
        return None

    depth = 0
    in_string = False
    escape_next = False

    for i, char in enumerate(text):
        if escape_next:
            escape_next = False
            continue

        if char == "\\":
            escape_next = True
            continue

        if char == '"' and not escape_next:
            in_string = not in_string
            continue

        if in_string:
            continue

        if char == open_char:
            depth += 1
        elif char == close_char:
            depth -= 1
            if depth == 0:
                return text[: i + 1]

    return None


# ---------------------------------------------------------------------------
# Payload processing utilities
# ---------------------------------------------------------------------------


def merge_payloads(
    tool_payloads: List[Dict[str, Any]],
    text_payload: Optional[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge tool-emitted and text-parsed payloads, dedup, and assign IDs.

    Tool-emitted payloads take priority.  Same-type payloads are combined
    (e.g. multiple data_proposal operations become one).  Each result gets
    a unique payload_id and summary.
    """
    all_payloads = list(tool_payloads)

    if text_payload:
        tool_types = {p.get("type") for p in tool_payloads if p}
        if text_payload.get("type") not in tool_types:
            all_payloads.append(text_payload)
        else:
            logger.info(
                f"Dropping text-parsed {text_payload.get('type')} payload — "
                f"tool already emitted one"
            )

    merged = _merge_same_type(all_payloads)
    return _assign_ids(merged)


def _merge_same_type(
    payloads: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Merge multiple payloads of the same type into one."""
    groups: dict[str, list[Dict[str, Any]]] = defaultdict(list)
    order: list[str] = []
    for p in payloads:
        if not p:
            continue
        t = p.get("type", "")
        if t not in groups:
            order.append(t)
        groups[t].append(p)

    merged: list[Dict[str, Any]] = []
    for t in order:
        items = groups[t]
        if len(items) == 1:
            merged.append(items[0])
            continue

        if t == "data_proposal":
            combined_ops: list = []
            combined_log: list = []
            reasoning_parts: list[str] = []
            for item in items:
                data = item.get("data", {})
                combined_ops.extend(data.get("operations", []))
                combined_log.extend(data.get("research_log", []))
                if data.get("reasoning"):
                    reasoning_parts.append(data["reasoning"])
            merged.append(
                {
                    "type": "data_proposal",
                    "data": {
                        "reasoning": (
                            " | ".join(reasoning_parts) if reasoning_parts else None
                        ),
                        "operations": combined_ops,
                        "research_log": combined_log if combined_log else None,
                    },
                }
            )
        elif t == "schema_proposal":
            combined_ops = []
            reasoning_parts = []
            for item in items:
                data = item.get("data", {})
                combined_ops.extend(data.get("operations", []))
                if data.get("reasoning"):
                    reasoning_parts.append(data["reasoning"])
            merged.append(
                {
                    "type": "schema_proposal",
                    "data": {
                        "reasoning": (
                            " | ".join(reasoning_parts) if reasoning_parts else None
                        ),
                        "operations": combined_ops,
                    },
                }
            )
        else:
            merged.append(items[-1])

    return merged


def _assign_ids(payloads: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Assign unique IDs and summaries to payloads."""
    processed = []
    for payload in payloads:
        if not payload:
            continue
        payload_type = payload.get("type", "unknown")
        payload_data = payload.get("data", {})
        payload_id = str(uuid.uuid4())[:8]
        summary = summarize_payload(payload_type, payload_data)
        processed.append(
            {
                "payload_id": payload_id,
                "type": payload_type,
                "data": payload_data,
                "summary": summary,
            }
        )
    return processed
