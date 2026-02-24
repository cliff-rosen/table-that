import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { authApi, type LoginCredentials, type RegisterCredentials } from '../lib/api/authApi'
import { setTokenRefreshedHandler, type TokenPayload } from '../lib/api'
import { setAuthToken, getAuthToken, getUserData, setUserData, clearAuthData } from '../lib/authStorage'
import { setStreamTokenRefreshedHandler } from '../lib/api/streamUtils'
import { trackEvent } from '../lib/api/trackingApi'
import type { AuthUser, UserRole } from '../types/user'

interface AuthContextType {
    isAuthenticated: boolean
    user: AuthUser | null

    // Role helpers
    isPlatformAdmin: boolean
    isOrgAdmin: boolean

    // Auth methods
    login: (credentials: LoginCredentials) => Promise<void>
    loginWithToken: (token: string) => Promise<void>
    requestLoginToken: (email: string) => Promise<void>
    register: (credentials: RegisterCredentials) => Promise<void>
    logout: () => void

    // Loading states
    isLoginLoading: boolean
    isTokenLoginLoading: boolean
    isTokenRequestLoading: boolean
    isRegisterLoading: boolean

    // Error handling
    error: string | null
    handleSessionExpired: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false)
    const [user, setUser] = useState<AuthUser | null>(null)
    const [error, setError] = useState<string | null>(null)

    // Role helper computed values
    const isPlatformAdmin = user?.role === 'platform_admin'
    const isOrgAdmin = user?.role === 'org_admin' || user?.role === 'platform_admin'

    // Loading states
    const [isLoginLoading, setIsLoginLoading] = useState(false)
    const [isTokenLoginLoading, setIsTokenLoginLoading] = useState(false)
    const [isTokenRequestLoading, setIsTokenRequestLoading] = useState(false)
    const [isRegisterLoading, setIsRegisterLoading] = useState(false)

    useEffect(() => {
        const token = getAuthToken()
        const userData = getUserData<AuthUser>()
        if (token && userData) {
            setIsAuthenticated(true)
            setUser(userData)
        }
    }, [])

    const extractErrorMessage = (error: any, defaultMessage: string): string => {
        if (error.response?.data) {
            // Handle FastAPI validation errors
            if (error.response.data.detail && Array.isArray(error.response.data.detail)) {
                // FastAPI validation errors with detail array
                const validationErrors = error.response.data.detail.map((err: any) => err.msg).join(', ')
                return validationErrors
            } else if (Array.isArray(error.response.data)) {
                // Direct array of validation errors
                const validationErrors = error.response.data.map((err: any) => err.msg).join(', ')
                return validationErrors
            } else if (error.response.data.detail) {
                return error.response.data.detail
            } else if (error.response.data.message) {
                return error.response.data.message
            } else if (typeof error.response.data === 'string') {
                return error.response.data
            }
        } else if (error.message) {
            return error.message
        }
        return defaultMessage
    }

    const handleAuthSuccess = (data: any) => {
        setError(null)

        const authUser: AuthUser = {
            id: data.user_id,
            username: data.username,
            email: data.email,
            role: data.role as UserRole,
            org_id: data.org_id
        }

        setAuthToken(data.access_token)
        setUserData(authUser)
        setUser(authUser)
        setIsAuthenticated(true)
    }

    const login = async (credentials: LoginCredentials): Promise<void> => {
        try {
            setIsLoginLoading(true)
            setError(null)

            const authResponse = await authApi.login(credentials)
            handleAuthSuccess(authResponse)
            // Track login after auth is successful
            trackEvent('login', { method: 'password' })
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Login failed. Please try again.')
            setError(errorMessage)
            throw error
        } finally {
            setIsLoginLoading(false)
        }
    }

    const loginWithToken = async (token: string): Promise<void> => {
        try {
            setIsTokenLoginLoading(true)
            setError(null)

            const authResponse = await authApi.loginWithToken(token)
            handleAuthSuccess(authResponse)
            // Track passwordless login after auth is successful
            trackEvent('login', { method: 'token' })
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Token login failed. The token may be invalid or expired.')
            setError(errorMessage)
            throw error
        } finally {
            setIsTokenLoginLoading(false)
        }
    }

    const requestLoginToken = async (email: string): Promise<void> => {
        try {
            setIsTokenRequestLoading(true)
            setError(null)

            const response = await authApi.requestLoginToken(email)
            // Set the backend's message as a success message
            setError(response.message)
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Failed to send login token. Please try again.')
            setError(errorMessage)
            throw error
        } finally {
            setIsTokenRequestLoading(false)
        }
    }

    const register = async (credentials: RegisterCredentials): Promise<void> => {
        try {
            setIsRegisterLoading(true)
            setError(null)

            const authResponse = await authApi.register(credentials)
            // Registration now returns Token response and automatically logs user in
            handleAuthSuccess(authResponse)
            // Track registration after auth is successful
            trackEvent('registration', { invited: !!credentials.invitation_token })
            setError(null)
        } catch (error: any) {
            const errorMessage = extractErrorMessage(error, 'Registration failed. Please try again.')
            setError(errorMessage)
            throw error
        } finally {
            setIsRegisterLoading(false)
        }
    }

    const logout = () => {
        // Track logout before clearing credentials
        trackEvent('logout')

        clearAuthData()
        setIsAuthenticated(false)
        setUser(null)
    }

    const handleSessionExpired = () => {
        logout()
        setError('Your session has expired. Please login again.')
    }

    /**
     * Handle token refresh - update user state if role or other info changed
     */
    const handleTokenRefreshed = useCallback((payload: TokenPayload) => {
        setUser(prevUser => {
            if (!prevUser) return prevUser

            const newUser: AuthUser = {
                id: payload.user_id,
                username: payload.username,
                email: payload.sub,
                role: payload.role as UserRole,
                org_id: payload.org_id ?? undefined
            }

            // Check if anything actually changed
            const changed = prevUser.role !== newUser.role ||
                           prevUser.org_id !== newUser.org_id ||
                           prevUser.email !== newUser.email

            if (changed) {
                setUserData(newUser)
                return newUser
            }

            return prevUser
        })
    }, [])

    // Register token refresh handlers (axios and streaming)
    useEffect(() => {
        setTokenRefreshedHandler(handleTokenRefreshed)
        setStreamTokenRefreshedHandler(handleTokenRefreshed)
    }, [handleTokenRefreshed])

    return (
        <AuthContext.Provider value={{
            isAuthenticated,
            user,

            // Role helpers
            isPlatformAdmin,
            isOrgAdmin,

            // Auth methods
            login,
            loginWithToken,
            requestLoginToken,
            register,
            logout,

            // Loading states
            isLoginLoading,
            isTokenLoginLoading,
            isTokenRequestLoading,
            isRegisterLoading,

            // Error handling
            error,
            handleSessionExpired
        }}>
            {children}
        </AuthContext.Provider>
    )
}

export const useAuth = () => {
    const context = useContext(AuthContext)
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider')
    }
    return context
} 