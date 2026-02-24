/**
 * Clipboard utilities with fallback for non-secure contexts (HTTP).
 *
 * The modern Clipboard API (navigator.clipboard) only works in secure contexts (HTTPS).
 * For HTTP development environments, we fall back to the deprecated execCommand approach.
 */

export interface CopyResult {
    success: boolean;
    error?: string;
}

/**
 * Copy text to clipboard with automatic fallback for non-secure contexts.
 *
 * @param text - The text to copy to clipboard
 * @returns Promise resolving to success/failure status
 */
export async function copyToClipboard(text: string): Promise<CopyResult> {
    // Try modern Clipboard API first (requires secure context)
    if (navigator.clipboard?.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return { success: true };
        } catch (err) {
            // Fall through to legacy approach
            console.debug('Clipboard API failed, trying fallback:', err);
        }
    }

    // Fallback for non-secure contexts (HTTP) or older browsers
    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;

        // Prevent scrolling to bottom of page
        textarea.style.position = 'fixed';
        textarea.style.left = '-999999px';
        textarea.style.top = '-999999px';
        textarea.style.opacity = '0';

        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();

        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);

        if (successful) {
            return { success: true };
        } else {
            return { success: false, error: 'execCommand copy failed' };
        }
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        console.error('Clipboard fallback failed:', err);
        return { success: false, error: message };
    }
}
