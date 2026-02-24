import React, { createContext, useContext, useState, useEffect } from 'react';
import { authApi, type LoginCredentials, type RegisterCredentials } from '../lib/api/authApi';
import { trackEvent } from '../lib/api/trackingApi';
import type { AuthUser, UserRole } from '../types/user';

interface TrialScoutAuthContextType {
    isAuthenticated: boolean;
    user: AuthUser | null;
    login: (credentials: LoginCredentials) => Promise<void>;
    register: (credentials: RegisterCredentials) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    error: string | null;
    clearError: () => void;
}

const TrialScoutAuthContext = createContext<TrialScoutAuthContextType | undefined>(undefined);

// Storage keys - separate from main app and Tablizer
const STORAGE_KEYS = {
    token: 'trialscout_token',
    user: 'trialscout_user',
};

export const TrialScoutAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [user, setUser] = useState<AuthUser | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isInitialized, setIsInitialized] = useState(false);

    // Restore auth state on mount
    useEffect(() => {
        const token = localStorage.getItem(STORAGE_KEYS.token);
        const userData = localStorage.getItem(STORAGE_KEYS.user);
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
            trackEvent('trialscout_login', { method: 'password' });
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
            trackEvent('trialscout_register', {});
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Registration failed. Please try again.');
            setError(errorMessage);
            throw error;
        } finally {
            setIsLoading(false);
        }
    };

    const logout = () => {
        trackEvent('trialscout_logout', {});
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
        <TrialScoutAuthContext.Provider value={{
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
        </TrialScoutAuthContext.Provider>
    );
};

export const useTrialScoutAuth = () => {
    const context = useContext(TrialScoutAuthContext);
    if (!context) {
        throw new Error('useTrialScoutAuth must be used within a TrialScoutAuthProvider');
    }
    return context;
};

// Export storage keys for API interceptor
export { STORAGE_KEYS as TRIALSCOUT_STORAGE_KEYS };
