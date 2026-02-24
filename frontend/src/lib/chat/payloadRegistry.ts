/**
 * Global Payload Registry
 *
 * Maps payload types to render components. This replaces per-page payloadHandlers
 * with a global registry for common payload types.
 *
 * Pages can still provide page-specific callbacks (onAccept, onReject) via
 * local overrides when using ChatTray.
 */

import { PayloadHandler } from '../../types/chat';

// Global registry of payload handlers
const payloadRegistry: Map<string, PayloadHandler> = new Map();

/**
 * Register a payload handler for a payload type
 */
export function registerPayloadHandler(type: string, handler: PayloadHandler): void {
    payloadRegistry.set(type, handler);
}

/**
 * Get a payload handler by type
 */
export function getPayloadHandler(type: string): PayloadHandler | null {
    return payloadRegistry.get(type) || null;
}

/**
 * Get all registered payload types
 */
export function getRegisteredPayloadTypes(): string[] {
    return Array.from(payloadRegistry.keys());
}

/**
 * Check if a payload type has a registered handler
 */
export function hasPayloadHandler(type: string): boolean {
    return payloadRegistry.has(type);
}

// Export for use in tests and debugging
export function _getRegistry(): Map<string, PayloadHandler> {
    return payloadRegistry;
}
