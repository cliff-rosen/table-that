/**
 * Tracking API
 *
 * Fire-and-forget event tracking to backend.
 */

import { api } from './index';

export interface TrackEventData {
    [key: string]: string | number | boolean | null | undefined;
}

export interface TrackEventRequest {
    event_type: string;
    event_data?: TrackEventData;
}

/**
 * Track a frontend event.
 * Fire-and-forget - errors are logged but don't throw.
 */
export async function trackEvent(eventType: string, eventData?: TrackEventData): Promise<void> {
    try {
        await api.post('/api/tracking/events', {
            event_type: eventType,
            event_data: eventData
        });
    } catch (error) {
        // Silent fail - don't let tracking errors affect the app
        console.debug('Tracking event failed:', error);
    }
}

/**
 * Event types tracked in table.that
 */
export const EventTypes = {
    // Auth
    LOGIN: 'login',                  // { method: 'password' | 'token' }
    REGISTRATION: 'registration',    // { invited: boolean }
    LOGOUT: 'logout',

    // Navigation
    NAV_CLICK: 'nav_click',          // { destination: 'tables' | 'admin' | 'profile' }

    // Table lifecycle
    TABLE_CREATE: 'table_create',    // { method: 'manual' | 'chat', table_id: number }
    CSV_IMPORT: 'csv_import',        // { source: 'tables_list' | 'table_view', table_id, row_count? }

    // Chat
    CHAT_OPEN: 'chat_open',          // { page: 'tables_list' | 'table_view' | 'table_edit', table_id? }
    CHAT_MESSAGE_SEND: 'chat_message_send', // { page: string }

    // Page navigation
    EDIT_SCHEMA: 'edit_schema',      // { table_id: number }
    VIEW_DATA: 'view_data',          // { table_id: number }
} as const;
