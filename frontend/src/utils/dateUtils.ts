/**
 * Date formatting utilities for article publication dates.
 *
 * These utilities handle the honest pub_year/pub_month/pub_day format,
 * displaying dates with only the precision actually available from the source.
 */

const MONTH_NAMES = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

const MONTH_NAMES_FULL = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

/**
 * Format a publication date with only the precision actually available.
 *
 * @param year - Publication year (1-9999)
 * @param month - Publication month (1-12, optional)
 * @param day - Publication day (1-31, optional)
 * @param format - 'short' for "Jan 2024", 'long' for "January 15, 2024"
 * @returns Formatted date string, or empty string if no year provided
 */
export function formatPubDate(
    year?: number | null,
    month?: number | null,
    day?: number | null,
    format: 'short' | 'long' = 'short'
): string {
    if (!year) return '';

    const monthNames = format === 'long' ? MONTH_NAMES_FULL : MONTH_NAMES;

    if (!month) {
        return `${year}`;
    }

    const monthName = monthNames[month - 1] || '';

    if (!day) {
        return `${monthName} ${year}`;
    }

    if (format === 'long') {
        return `${monthName} ${day}, ${year}`;
    }

    return `${monthName} ${day}, ${year}`;
}

/**
 * Format a publication date for display in article tables/cards.
 * Uses short format by default.
 */
export function formatArticleDate(
    year?: number | null,
    month?: number | null,
    day?: number | null
): string {
    return formatPubDate(year, month, day, 'short');
}

/**
 * Get just the year as a string, or empty string if not available.
 */
export function getYearString(year?: number | null): string {
    return year ? `${year}` : '';
}
