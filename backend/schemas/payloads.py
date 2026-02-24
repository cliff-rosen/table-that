"""
Payload Schema Registry

Central definitions for all payload types used in the chat system.
This is the SINGLE SOURCE OF TRUTH for payload definitions.

Tools reference payloads by name (payload_type field).
Pages declare which payloads they use (in their TabConfig/page config).

Payloads can be:
- Global (is_global=True): Automatically available on all pages
- Non-global (is_global=False): Must be explicitly added to a page

For LLM payloads (source="llm"), this also defines:
- parse_marker: Text marker to look for in LLM output
- parser: Function to extract JSON from LLM output
- llm_instructions: Instructions for the LLM on when/how to use this payload
"""

import json
import logging
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Callable

logger = logging.getLogger(__name__)


# =============================================================================
# Parser Factory
# =============================================================================

def make_json_parser(payload_type: str) -> Callable[[str], Optional[Dict[str, Any]]]:
    """Create a standard JSON parser for a payload type."""
    def parser(text: str) -> Optional[Dict[str, Any]]:
        try:
            data = json.loads(text.strip())
            return {"type": payload_type, "data": data}
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse {payload_type} JSON: {e}")
            return None
    return parser


# =============================================================================
# PayloadType Definition
# =============================================================================

@dataclass
class PayloadType:
    """Complete definition of a payload type."""
    name: str                               # e.g., "search_results"
    description: str                        # Human-readable description
    schema: Dict[str, Any]                  # JSON schema for the data field
    source: str = "tool"                    # "tool" or "llm"
    is_global: bool = False                 # If True, available on all pages

    # For LLM payloads (source="llm"):
    parse_marker: Optional[str] = None      # e.g., "SCHEMA_PROPOSAL:"
    parser: Optional[Callable[[str], Optional[Dict[str, Any]]]] = None
    llm_instructions: Optional[str] = None  # Instructions for LLM

    # For payload manifest (summarize for LLM context):
    summarize: Optional[Callable[[Dict[str, Any]], str]] = None  # Returns brief summary


# =============================================================================
# Payload Type Registry
# =============================================================================

_payload_types: Dict[str, PayloadType] = {}


def register_payload_type(payload_type: PayloadType) -> None:
    """Register a payload type."""
    _payload_types[payload_type.name] = payload_type


def get_payload_type(name: str) -> Optional[PayloadType]:
    """Get a payload type by name."""
    return _payload_types.get(name)


def get_all_payload_types() -> List[PayloadType]:
    """Get all registered payload types."""
    return list(_payload_types.values())


def get_payload_schema(name: str) -> Optional[Dict[str, Any]]:
    """Get the JSON schema for a payload type."""
    payload_type = _payload_types.get(name)
    return payload_type.schema if payload_type else None


def get_global_payload_types() -> List[PayloadType]:
    """Get all global payload types."""
    return [p for p in _payload_types.values() if p.is_global]


def get_payload_types_by_source(source: str) -> List[PayloadType]:
    """Get payload types by source ('tool' or 'llm')."""
    return [p for p in _payload_types.values() if p.source == source]


def get_payload_types_by_names(names: List[str]) -> List[PayloadType]:
    """Get payload types by a list of names."""
    return [_payload_types[name] for name in names if name in _payload_types]


def summarize_payload(payload_type: str, data: Dict[str, Any]) -> str:
    """
    Generate a brief summary of a payload for the LLM context manifest.

    Args:
        payload_type: The type name of the payload
        data: The payload data

    Returns:
        A brief summary string (1-2 sentences max)
    """
    pt = _payload_types.get(payload_type)
    if not pt:
        return f"Unknown payload type: {payload_type}"

    if pt.summarize:
        try:
            return pt.summarize(data)
        except Exception as e:
            logger.warning(f"Failed to summarize payload {payload_type}: {e}")
            return pt.description

    # Default: just return the description
    return pt.description


# =============================================================================
# table.that Payload Registrations
# =============================================================================
# (Payloads will be registered here as features are built)
