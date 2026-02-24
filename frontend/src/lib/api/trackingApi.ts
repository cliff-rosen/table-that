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
    console.log("eventData", eventData)
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
 * Common event types and their expected data
 */
export const EventTypes = {
    // Page views
    PAGE_VIEW: 'page_view',

    // Report page events
    VIEW_CHANGE: 'view_change',      // { from: 'list', to: 'grid' }
    ARTICLE_CLICK: 'article_click',  // { pmid: '12345', report_id: 123 }
    ARTICLE_STAR: 'article_star',    // { pmid: '12345', starred: true }

    // Article modal events
    TAB_CLICK: 'tab_click',          // { tab: 'notes', pmid: '12345' }
    MODAL_OPEN: 'modal_open',        // { pmid: '12345' }
    MODAL_CLOSE: 'modal_close',      // { pmid: '12345' }

    // Stream events
    STREAM_VIEW: 'stream_view',      // { stream_id: 5 }
    PIPELINE_RUN: 'pipeline_run',    // { stream_id: 5 }

    // Search events
    SEARCH: 'search',                // { query: '...' }

    // Chat events
    CHAT_OPEN: 'chat_open',          // { page: 'reports' }
    CHAT_CLOSE: 'chat_close',        // { page: 'reports' }
    CHAT_MESSAGE: 'chat_message',    // { page: 'reports' }

    // Tablizer events
    TABLIZER_SEARCH: 'tablizer_search',                    // { query: '...', has_date_filter: true, result_count: 50 }
    TABLIZER_CLEAR: 'tablizer_clear',                      // { had_results: true, snapshot_count: 3 }
    TABLIZER_DATE_PRESET: 'tablizer_date_preset',          // { preset: 'last_week' | 'last_month' }
    TABLIZER_SNAPSHOT_VIEW: 'tablizer_snapshot_view',      // { snapshot_type: 'search' | 'filter' | 'compare' }
    TABLIZER_COMPARE_START: 'tablizer_compare_start',      // {}
    TABLIZER_COMPARE_COMPLETE: 'tablizer_compare_complete', // { only_a: 10, both: 5, only_b: 8 }
    TABLIZER_COPY_QUERY: 'tablizer_copy_query',            // {}
    TABLIZER_ADD_COLUMN_START: 'tablizer_add_column_start', // {}
    TABLIZER_ADD_COLUMN_COMPLETE: 'tablizer_add_column_complete', // { column_name: '...', output_type: 'boolean', article_count: 50 }
    TABLIZER_FILTER_BOOLEAN: 'tablizer_filter_boolean',    // { column: '...', value: 'yes' | 'no' | 'all' }
    TABLIZER_FILTER_TEXT: 'tablizer_filter_text',          // { has_text: true }
    TABLIZER_SAVE_TO_HISTORY: 'tablizer_save_to_history',  // { filtered_count: 20 }
    TABLIZER_EXPORT: 'tablizer_export',                    // { row_count: 50, column_count: 6 }
    TABLIZER_ARTICLE_CLICK: 'tablizer_article_click',      // { pmid: '12345' }
    TABLIZER_HELP_OPEN: 'tablizer_help_open',              // {}
} as const;
