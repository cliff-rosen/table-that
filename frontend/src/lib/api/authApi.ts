import { api } from './index';

export interface LoginCredentials {
    username: string;
    password: string;
}

export interface RegisterCredentials {
    email: string;
    password: string;
    invitation_token?: string;
}

export interface InvitationValidation {
    valid: boolean;
    email?: string;
    org_name?: string;
    role?: string;
    expires_at?: string;
    error?: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    username: string;
    role: string;
    user_id?: string;
    email?: string;
    org_id?: number;
}

export const authApi = {
    /**
     * Login with username/email and password
     */
    async login(credentials: LoginCredentials): Promise<AuthResponse> {
        const params = new URLSearchParams();
        params.append('username', credentials.username);
        params.append('password', credentials.password);

        const response = await api.post('/api/auth/login', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        return response.data;
    },

    /**
     * Login with one-time token
     */
    async loginWithToken(token: string): Promise<AuthResponse> {
        const params = new URLSearchParams();
        params.append('token', token);

        const response = await api.post('/api/auth/login-with-token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        return response.data;
    },

    /**
     * Request a login token to be sent via email
     */
    async requestLoginToken(email: string): Promise<{ message: string }> {
        const params = new URLSearchParams();
        params.append('email', email);

        const response = await api.post('/api/auth/request-login-token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        return response.data;
    },

    /**
     * Register a new user and automatically log them in
     */
    async register(credentials: RegisterCredentials): Promise<AuthResponse> {
        const response = await api.post('/api/auth/register', credentials);
        return response.data;
    },

    /**
     * Validate an invitation token (public endpoint)
     */
    async validateInvitation(token: string): Promise<InvitationValidation> {
        const response = await api.get(`/api/auth/validate-invitation/${token}`);
        return response.data;
    },

    /**
     * Request a password reset email
     */
    async requestPasswordReset(email: string): Promise<{ message: string }> {
        const response = await api.post('/api/auth/request-password-reset', { email });
        return response.data;
    },

    /**
     * Reset password using token from email
     */
    async resetPassword(token: string, newPassword: string): Promise<{ message: string }> {
        const response = await api.post('/api/auth/reset-password', {
            token,
            new_password: newPassword
        });
        return response.data;
    }
};