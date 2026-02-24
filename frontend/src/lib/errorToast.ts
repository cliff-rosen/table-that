/**
 * Error Toast Utility
 *
 * Provides a simple way to show error notifications to users.
 */

import { toast } from '@/components/ui/use-toast';
import { handleApiError } from './api';

/**
 * Show an error toast notification
 */
export function showErrorToast(error: unknown, title = 'Error') {
    const message = error instanceof Error
        ? error.message
        : typeof error === 'string'
            ? error
            : handleApiError(error);

    toast({
        variant: 'destructive',
        title,
        description: message,
    });
}

/**
 * Show a success toast notification
 */
export function showSuccessToast(message: string, title = 'Success') {
    toast({
        title,
        description: message,
    });
}

/**
 * Wrap an async function with automatic error toast on failure
 */
export async function withErrorToast<T>(
    fn: () => Promise<T>,
    errorTitle = 'Error'
): Promise<T | null> {
    try {
        return await fn();
    } catch (error) {
        showErrorToast(error, errorTitle);
        return null;
    }
}
