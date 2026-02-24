/**
 * useTracking Hook
 *
 * Provides easy tracking of user events.
 * Fire-and-forget - never blocks UI or throws errors.
 */

import { useCallback, useRef } from 'react';
import { trackEvent, TrackEventData, EventTypes } from '@/lib/api/trackingApi';

export { EventTypes };

export interface UseTrackingOptions {
    /** Default context to include in all events */
    defaultContext?: TrackEventData;
    /** Debounce time in ms for rapid events (default: 0) */
    debounceMs?: number;
}

export function useTracking(options: UseTrackingOptions = {}) {
    const { defaultContext = {}, debounceMs = 0 } = options;
    const lastEventRef = useRef<{ type: string; time: number }>({ type: '', time: 0 });

    /**
     * Track an event with optional data.
     * Merges defaultContext with provided data.
     */
    const track = useCallback((eventType: string, eventData?: TrackEventData) => {
        // Simple debounce for same event type
        if (debounceMs > 0) {
            const now = Date.now();
            if (
                lastEventRef.current.type === eventType &&
                now - lastEventRef.current.time < debounceMs
            ) {
                return;
            }
            lastEventRef.current = { type: eventType, time: now };
        }

        // Merge default context with event data
        const mergedData = {
            ...defaultContext,
            ...eventData
        };

        // Fire and forget
        trackEvent(eventType, Object.keys(mergedData).length > 0 ? mergedData : undefined);
    }, [defaultContext, debounceMs]);

    /**
     * Pre-built tracking functions for common events
     */
    const trackPageView = useCallback((page: string, extraData?: TrackEventData) => {
        track(EventTypes.PAGE_VIEW, { page, ...extraData });
    }, [track]);

    const trackViewChange = useCallback((from: string, to: string, page?: string) => {
        track(EventTypes.VIEW_CHANGE, { from, to, page });
    }, [track]);

    const trackArticleClick = useCallback((pmid: string, reportId?: number) => {
        track(EventTypes.ARTICLE_CLICK, { pmid, report_id: reportId });
    }, [track]);

    const trackTabClick = useCallback((tab: string, pmid?: string) => {
        track(EventTypes.TAB_CLICK, { tab, pmid });
    }, [track]);

    const trackModalOpen = useCallback((pmid: string) => {
        track(EventTypes.MODAL_OPEN, { pmid });
    }, [track]);

    const trackModalClose = useCallback((pmid: string) => {
        track(EventTypes.MODAL_CLOSE, { pmid });
    }, [track]);

    const trackSearch = useCallback((query: string) => {
        track(EventTypes.SEARCH, { query });
    }, [track]);

    const trackChatOpen = useCallback((page: string) => {
        track(EventTypes.CHAT_OPEN, { page });
    }, [track]);

    const trackChatClose = useCallback((page: string) => {
        track(EventTypes.CHAT_CLOSE, { page });
    }, [track]);

    return {
        track,
        trackPageView,
        trackViewChange,
        trackArticleClick,
        trackTabClick,
        trackModalOpen,
        trackModalClose,
        trackSearch,
        trackChatOpen,
        trackChatClose,
        EventTypes
    };
}

export default useTracking;
