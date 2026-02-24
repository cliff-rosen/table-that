"""
Date formatting utilities for article publication dates.

Mirrors frontend/src/utils/dateUtils.ts — same logic, same output.
Single source of truth for backend date string formatting.
"""

from typing import Optional

MONTH_NAMES_SHORT = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

MONTH_NAMES_FULL = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]


def format_pub_date(
    year: Optional[int] = None,
    month: Optional[int] = None,
    day: Optional[int] = None,
    fmt: str = "short",
) -> str:
    """Format a publication date with only the precision actually available.

    Args:
        year: Publication year (e.g. 2025)
        month: Publication month (1-12, or None if unknown)
        day: Publication day (1-31, or None if unknown)
        fmt: 'short' for "Jan 2025", 'long' for "January 15, 2025"

    Returns:
        Formatted date string, or empty string if no year.

    Examples:
        >>> format_pub_date(2025)
        '2025'
        >>> format_pub_date(2025, 11)
        'Nov 2025'
        >>> format_pub_date(2025, 11, 3)
        'Nov 3, 2025'
        >>> format_pub_date(2025, 11, 3, fmt='long')
        'November 3, 2025'
    """
    if not year:
        return ""

    if not month:
        return str(year)

    names = MONTH_NAMES_FULL if fmt == "long" else MONTH_NAMES_SHORT
    month_name = names[month - 1] if 1 <= month <= 12 else ""

    if not day:
        return f"{month_name} {year}"

    return f"{month_name} {day}, {year}"
