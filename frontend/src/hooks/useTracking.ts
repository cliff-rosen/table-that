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

    const track = useCallback((eventType: string, eventData?: TrackEventData) => {
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

        const mergedData = {
            ...defaultContext,
            ...eventData
        };

        trackEvent(eventType, Object.keys(mergedData).length > 0 ? mergedData : undefined);
    }, [defaultContext, debounceMs]);

    return { track, EventTypes };
}

export default useTracking;
