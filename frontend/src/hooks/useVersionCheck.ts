import { useState, useEffect, useCallback } from 'react';
import { getHealth } from '../lib/api/healthApi';

const POLL_INTERVAL_MS = 60_000; // 60 seconds
const BUILD_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

/**
 * Polls /api/health and detects when the backend reports a newer version
 * than what this frontend was built with (VITE_APP_VERSION).
 */
export function useVersionCheck() {
  const [latestVersion, setLatestVersion] = useState('');
  const [newVersionAvailable, setNewVersionAvailable] = useState(false);

  const isProduction = BUILD_VERSION && BUILD_VERSION !== 'dev';

  const checkVersion = useCallback(async () => {
    try {
      const { version } = await getHealth();
      if (version && version !== 'dev') {
        setLatestVersion(version);
        if (BUILD_VERSION && version !== BUILD_VERSION) {
          setNewVersionAvailable(true);
        }
      }
    } catch {
      // Network error — skip silently
    }
  }, []);

  useEffect(() => {
    if (!isProduction) return;
    checkVersion();
    const interval = setInterval(checkVersion, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isProduction, checkVersion]);

  return { newVersionAvailable, latestVersion, buildVersion: BUILD_VERSION };
}
