# Utility helpers for consistent string manipulation across the codebase

import re

__all__ = ["canonical_key"]


def canonical_key(name: str) -> str:
    """Return a canonical key for asset names / local variable names.

    The goal is to create keys that are:
      * lower-cased
      * whitespace condensed to a single underscore
      * hyphens converted to underscores
      * leading/trailing whitespace removed
      * non-alphanumeric characters (except underscore) stripped

    This helps ensure that the same asset name is referenced consistently
    across input_mapping, output_mapping, hop.state and tool mappings.
    """
    if not isinstance(name, str):
        raise TypeError("canonical_key expects a string input")

    # Trim and lowercase
    key = name.strip().lower()

    # Replace hyphens and whitespace groups with single underscore
    key = re.sub(r"[\s\-]+", "_", key)

    # Remove any character that is not alphanumeric or underscore
    key = re.sub(r"[^a-z0-9_]", "", key)

    return key 