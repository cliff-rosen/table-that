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
from typing import Any, Dict, Optional

from services.chat_page_config import PageLocation, get_all_payloads_for_page

logger = logging.getLogger(__name__)


def parse_llm_response(
    response_text: str, page: PageLocation
) -> Dict[str, Any]:
    """Parse LLM response to extract structured components.

    Returns a dict with keys:
      message          — cleaned text with markers stripped
      suggested_values — parsed JSON array or None
      suggested_actions — parsed JSON array or None
      custom_payload   — parsed payload dict or None
    """
    message = response_text.strip()
    result: Dict[str, Any] = {
        "message": message,
        "suggested_values": None,
        "suggested_actions": None,
        "custom_payload": None,
    }

    # Parse SUGGESTED_VALUES marker
    message = _extract_marker_array(
        message, "SUGGESTED_VALUES:", "suggested_values", result
    )

    # Parse SUGGESTED_ACTIONS marker
    message = _extract_marker_array(
        message, "SUGGESTED_ACTIONS:", "suggested_actions", result
    )

    # Parse custom payloads (page-specific structured responses)
    message = _extract_custom_payload(message, page, result)

    result["message"] = message
    return result


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _extract_marker_array(
    message: str, marker: str, result_key: str, result: Dict[str, Any]
) -> str:
    """Find a marker like SUGGESTED_VALUES: [...] in message, extract the
    JSON array, store it in result[result_key], and return the message
    with the marker+JSON removed."""
    if marker not in message:
        return message

    marker_pos = message.find(marker)
    after_marker = message[marker_pos + len(marker) :]
    after_marker_stripped = after_marker.lstrip()
    json_content = _extract_json_array(after_marker_stripped)
    if not json_content:
        return message

    try:
        parsed = json.loads(json_content)
        if isinstance(parsed, list):
            result[result_key] = parsed
            # Calculate whitespace between marker and JSON
            whitespace_len = len(after_marker) - len(after_marker_stripped)
            # Remove everything from marker through end of JSON
            end_pos = marker_pos + len(marker) + whitespace_len + len(json_content)
            return (message[:marker_pos] + message[end_pos:]).strip()
    except json.JSONDecodeError:
        logger.warning(f"Failed to parse {marker} JSON: {json_content[:100]}")

    return message


def _extract_custom_payload(
    message: str, page: PageLocation, result: Dict[str, Any]
) -> str:
    """Find a custom payload marker (e.g. SCHEMA_PROPOSAL: {...}) in message,
    parse it via the registered payload config, and return cleaned message."""
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
            after_marker = after_marker_raw.strip()
            json_content = _extract_json_object(after_marker)
            if json_content:
                parsed = config.parser(json_content)
                if parsed:
                    result["custom_payload"] = parsed
                    # Find where JSON starts in the raw after_marker (preserving whitespace)
                    json_start_in_raw = after_marker_raw.find(json_content)
                    # Calculate full payload text: from marker start through end of JSON
                    end_pos = match.end() + json_start_in_raw + len(json_content)
                    payload_text = message[marker_pos:end_pos]
                    message = message.replace(payload_text, "").strip()
                    break

    return message


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
