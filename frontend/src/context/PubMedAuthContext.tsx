import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, type LoginCredentials, type RegisterCredentials } from '../lib/api/authApi';
import { trackEvent } from '../lib/api/trackingApi';
import type { AuthUser, UserRole } from '../types/user';

interface PubMedAuthContextType {
    isAuthenticated: boolean;
    user: AuthUser | null;
    login: (credentials: LoginCredentials) => Promise<void>;
    register: (credentials: RegisterCredentials) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    error: string | null;
    clearError: () => void;
}

const PubMedAuthContext = createContext<PubMedAuthContextType | undefined>(undefined);

// Storage keys - separate from main app
// Note: Using 'pubmed_' prefix but checking for legacy 'tablizer_' keys for backwards compatibility
const STORAGE_KEYS = {
    token: 'pubmed_token',
    user: 'pubmed_user',
};

const LEGACY_STORAGE_KEYS = {
    token: 'tablizer_token',
    user: 'tablizer_user',
};

export const PubMedAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Restore auth state on mount (check new keys first, then legacy)
    useEffect(() => {
        let token = localStorage.getItem(STORAGE_KEYS.token);
        let userData = localStorage.getItem(STORAGE_KEYS.user);

        // Check legacy keys if new keys not found
        if (!token || !userData) {
            token = localStorage.getItem(LEGACY_STORAGE_KEYS.token);
            userData = localStorage.getItem(LEGACY_STORAGE_KEYS.user);

            // Migrate to new keys if found
            if (token && userData) {
                localStorage.setItem(STORAGE_KEYS.token, token);
                localStorage.setItem(STORAGE_KEYS.user, userData);
                localStorage.removeItem(LEGACY_STORAGE_KEYS.token);
                localStorage.removeItem(LEGACY_STORAGE_KEYS.user);
            }
        }

        if (token && userData) {
            try {
                setUser(JSON.parse(userData));
                setIsAuthenticated(true);
            } catch (e) {
                // Invalid stored data, clear it
                localStorage.removeItem(STORAGE_KEYS.token);
                localStorage.removeItem(STORAGE_KEYS.user);
            }
        }
        setIsInitialized(true);
    }, []);

    const extractErrorMessage = (error: any, defaultMessage: string): string => {
        if (error.response?.data) {
            if (error.response.data.detail && Array.isArray(error.response.data.detail)) {
                return error.response.data.detail.map((err: any) => err.msg).join(', ');
            } else if (error.response.data.detail) {
                return error.response.data.detail;
            } else if (error.response.data.message) {
                return error.response.data.message;
            }
        }
        return error.message || defaultMessage;
    };

    const handleAuthSuccess = (data: any) => {
        setError(null);

        const authUser: AuthUser = {
            id: data.user_id,
            username: data.username,
            email: data.email,
            role: data.role as UserRole,
            org_id: data.org_id
        };

        localStorage.setItem(STORAGE_KEYS.token, data.access_token);
        localStorage.setItem(STORAGE_KEYS.user, JSON.stringify(authUser));
        setUser(authUser);
        setIsAuthenticated(true);
    };

    const login = async (credentials: LoginCredentials): Promise<void> => {
        try {
            setIsLoading(true);
            setError(null);

            const authResponse = await authApi.login(credentials);
            handleAuthSuccess(authResponse);
            trackEvent('pubmed_login', { method: 'password' });
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Login failed. Please try again.');
            setError(errorMessage);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (credentials: RegisterCredentials): Promise<void> => {
        try {
            setIsLoading(true);
            setError(null);

            const authResponse = await authApi.register(credentials);
            handleAuthSuccess(authResponse);
            trackEvent('pubmed_register', {});
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Registration failed. Please try again.');
            setError(errorMessage);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        trackEvent('pubmed_logout', {});
        localStorage.removeItem(STORAGE_KEYS.token);
        localStorage.removeItem(STORAGE_KEYS.user);
        setIsAuthenticated(false);
        setUser(null);
    };

    const clearError = () => setError(null);

    // Don't render children until we've checked localStorage
    if (!isInitialized) {
        return null;
    }

    return (
        <PubMedAuthContext.Provider value={{
            isAuthenticated,
            user,
            login,
            register,
            logout,
            isLoading,
            error,
            clearError
        }}>
            {children}
        </PubMedAuthContext.Provider>
    );
};

export const usePubMedAuth = () => {
    const context = useContext(PubMedAuthContext);
    if (!context) {
        throw new Error('usePubMedAuth must be used within a PubMedAuthProvider');
    }
    return context;
};

// Export storage keys for API interceptor
export { STORAGE_KEYS as PUBMED_STORAGE_KEYS };
