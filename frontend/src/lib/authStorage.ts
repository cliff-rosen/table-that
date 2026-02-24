/**
 * Auth Storage Utilities
 *
 * Shared storage functions for authentication data.
 * Used by both AuthContext (React state) and API layer (axios interceptors).
 */

/**
 * Determine the current app context based on URL path.
 */
function getAppContext(): 'pubmed' | 'trialscout' | 'main' {
  if (typeof window === 'undefined') return 'main';
  if (window.location.pathname.startsWith('/pubmed')) return 'pubmed';
  if (window.location.pathname.startsWith('/trialscout')) return 'trialscout';
  return 'main';
}

/**
 * Get the localStorage key for the auth token in the current app context.
 */
export function getTokenStorageKey(): string {
  const context = getAppContext();
  if (context === 'pubmed') return 'pubmed_token';
  if (context === 'trialscout') return 'trialscout_token';
  return 'authToken';
}

/**
 * Get the localStorage key for user data in the current app context.
 */
export function getUserStorageKey(): string {
  const context = getAppContext();
  if (context === 'pubmed') return 'pubmed_user';
  if (context === 'trialscout') return 'trialscout_user';
  return 'user';
}

/**
 * Get the login path for the current app context.
 */
export function getLoginPath(): string {
  const context = getAppContext();
  if (context === 'pubmed') return '/pubmed/login';
  if (context === 'trialscout') return '/trialscout/login';
  return '/login';
}

/**
 * Check if current context is a standalone app (not main app).
 */
export function isStandaloneApp(): boolean {
  return getAppContext() !== 'main';
}

/**
 * Get the auth token for the current app context.
 */
export function getAuthToken(): string | null {
  return localStorage.getItem(getTokenStorageKey());
}

/**
 * Store the auth token for the current app context.
 */
export function setAuthToken(token: string): void {
  localStorage.setItem(getTokenStorageKey(), token);
}

/**
 * Get the user data for the current app context.
 */
export function getUserData<T = unknown>(): T | null {
  const data = localStorage.getItem(getUserStorageKey());
  if (!data) return null;
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Store the user data for the current app context.
 */
export function setUserData<T>(user: T): void {
  localStorage.setItem(getUserStorageKey(), JSON.stringify(user));
}

/**
 * Clear auth data (token and user) for the current app context.
 */
export function clearAuthData(): void {
  localStorage.removeItem(getTokenStorageKey());
  localStorage.removeItem(getUserStorageKey());
}
