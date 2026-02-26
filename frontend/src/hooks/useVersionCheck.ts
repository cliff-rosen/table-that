import { useState, useEffect, useRef } from 'react';
import { getHealth } from '../lib/api/healthApi';

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const BUILD_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

/**
 * Polls /api/health and detects when the backend version changes.
 * Returns true when a newer version is available so the UI can prompt a refresh.
 */
export function useVersionCheck() {
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);
  const initialVersionRef = useRef<string | null>(null);

  useEffect(() => {
    // Don't poll in dev mode
    if (BUILD_VERSION === 'dev') return;

    let timer: ReturnType<typeof setInterval>;

    async function check() {
      try {
        const { version } = await getHealth();

        // Store the first version we see as baseline
        if (!initialVersionRef.current) {
          initialVersionRef.current = version;
          return;
        }

        // If server version changed from what we first saw, a deploy happened
        if (version !== initialVersionRef.current) {
          setNewVersionAvailable(true);
        }
      } catch {
        // Network error — skip silently
      }
    }

    // First check after a short delay (don't block page load)
    const startup = setTimeout(check, 5_000);
    timer = setInterval(check, POLL_INTERVAL_MS);

    return () => {
      clearTimeout(startup);
      clearInterval(timer);
    };
  }, []);

  return { newVersionAvailable, buildVersion: BUILD_VERSION };
}
