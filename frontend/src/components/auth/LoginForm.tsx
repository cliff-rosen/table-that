import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import settings from '@/config/settings';
import { useAuth } from '@/context/AuthContext';
import { authApi, type InvitationValidation } from '@/lib/api/authApi';

export default function LoginForm() {
    const [searchParams] = useSearchParams();
    const invitationToken = searchParams.get('token');

    const {
        login,
        register,
        requestLoginToken,
        isLoginLoading,
        isRegisterLoading,
        isTokenRequestLoading,
        error
    } = useAuth();

    // Local state - now managed within LoginForm
    const [isRegistering, setIsRegistering] = useState(false);
    const [formData, setFormData] = useState({
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [passwordError, setPasswordError] = useState<string | null>(null);
    const [isPasswordlessMode, setIsPasswordlessMode] = useState(false);
    const [tokenSent, setTokenSent] = useState(false);

    // Invitation validation state
    const [isValidatingInvitation, setIsValidatingInvitation] = useState(false);
    const [invitationData, setInvitationData] = useState<InvitationValidation | null>(null);

    // Validate invitation token on mount
    useEffect(() => {
        if (invitationToken) {
            setIsValidatingInvitation(true);
            authApi.validateInvitation(invitationToken)
                .then((data) => {
                    setInvitationData(data);
                    if (data.valid) {
                        setIsRegistering(true);
                        // Pre-fill email from invitation
                        if (data.email) {
                            setFormData(prev => ({ ...prev, email: data.email! }));
                        }
                    }
                })
                .catch(() => {
                    setInvitationData({ valid: false, error: 'Failed to validate invitation' });
                })
                .finally(() => {
                    setIsValidatingInvitation(false);
                });
        }
    }, [invitationToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (isRegistering) {
            if (formData.password !== formData.confirmPassword) {
                setPasswordError("Passwords don't match");
                return;
            }

            try {
                await register({
                    email: formData.email,
                    password: formData.password,
                    invitation_token: invitationToken || undefined
                });
                setPasswordError(null);
            } catch (error) {
                // Error is handled by AuthContext
            }
        } else if (isPasswordlessMode) {
            // Request login token using AuthContext
            try {
                await requestLoginToken(formData.email);
                setTokenSent(true);

            } catch (error) {
                // Error is handled by AuthContext
            }
        } else {
            // Regular login
            try {
                await login({ username: formData.email, password: formData.password });
            } catch (error) {
                // Error is handled by AuthContext
            }
        }
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
        if (e.target.name === 'password' || e.target.name === 'confirmPassword') {
            setPasswordError(null);
        }
    };

    // Show loading state while validating invitation
    if (isValidatingInvitation) {
        return (
            <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        {settings.appName}
                    </h2>
                    <div className="flex items-center justify-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    </div>
                    <p className="text-gray-600 dark:text-gray-300">
                        Validating invitation...
                    </p>
                </div>
            </div>
        );
    }

    // Show error state for invalid invitation
    if (invitationToken && invitationData && !invitationData.valid) {
        return (
            <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        {settings.appName}
                    </h2>
                    <h1 className="text-3xl font-bold dark:text-white mb-2">
                        Invalid Invitation
                    </h1>
                </div>

                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-sm text-red-800 dark:text-red-200">
                        {invitationData.error || 'This invitation is no longer valid.'}
                    </p>
                </div>

                <div className="text-center">
                    <button
                        onClick={() => window.location.href = '/'}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                    >
                        Go to login page
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
            <div className="text-center">
                <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                    {settings.appName}
                </h2>
                <h1 className="text-3xl font-bold dark:text-white mb-2">
                    {invitationData?.valid ? 'You\'re Invited!' : 'Welcome'}
                </h1>
                <p className="text-gray-600 dark:text-gray-300">
                    {isRegistering
                        ? invitationData?.valid
                            ? 'Complete your registration to join'
                            : 'Create your account'
                        : isPasswordlessMode
                            ? 'Get a login link via email'
                            : 'Sign in to your account'
                    }
                </p>
            </div>

            {invitationData?.valid && isRegistering && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="text-sm text-blue-800 dark:text-blue-200">
                        <p className="font-medium mb-2">You've been invited to join:</p>
                        <div className="space-y-1">
                            <p><span className="font-semibold">Organization:</span> {invitationData.org_name}</p>
                            <p><span className="font-semibold">Role:</span> {invitationData.role === 'org_admin' ? 'Organization Admin' : 'Member'}</p>
                        </div>
                    </div>
                </div>
            )}

            {(error || passwordError || tokenSent) && (
                <div className={`border px-4 py-3 rounded relative ${error?.includes('successful') || error?.includes('login link') || error?.includes('account with this email') || tokenSent
                    ? 'bg-green-100 border-green-400 text-green-700'
                    : 'bg-red-100 border-red-400 text-red-700'
                    }`}>
                    {tokenSent && error
                        ? error  // Show the backend's message
                        : passwordError || error
                    }
                </div>
            )}

            <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div className="rounded-md shadow-sm space-y-4">
                    <div>
                        <label htmlFor="email" className="sr-only">Email address</label>
                        <input
                            id="email"
                            name="email"
                            type="email"
                            required
                            disabled={invitationData?.valid && invitationData?.email ? true : false}
                            className={`appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm ${
                                invitationData?.valid && invitationData?.email ? 'bg-gray-100 dark:bg-gray-600 cursor-not-allowed' : ''
                            }`}
                            placeholder="Email address"
                            value={formData.email}
                            onChange={handleInputChange}
                        />
                        {invitationData?.valid && invitationData?.email && (
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Email is pre-filled from your invitation
                            </p>
                        )}
                    </div>
                    {!isPasswordlessMode && (
                        <div>
                            <label htmlFor="password" className="sr-only">Password</label>
                            <input
                                id="password"
                                name="password"
                                type="password"
                                required
                                className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="Password"
                                value={formData.password}
                                onChange={handleInputChange}
                            />
                            {!isRegistering && (
                                <div className="text-right mt-1">
                                    <Link
                                        to="/reset-password"
                                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500"
                                    >
                                        Forgot password?
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}
                    {isRegistering && (
                        <div>
                            <label htmlFor="confirmPassword" className="sr-only">Confirm Password</label>
                            <input
                                id="confirmPassword"
                                name="confirmPassword"
                                type="password"
                                required
                                className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                placeholder="Confirm Password"
                                value={formData.confirmPassword}
                                onChange={handleInputChange}
                            />
                        </div>
                    )}
                </div>

                <div>
                    <button
                        type="submit"
                        disabled={isLoginLoading || isRegisterLoading || isTokenRequestLoading}
                        className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {(isLoginLoading || isRegisterLoading || isTokenRequestLoading)
                            ? (isTokenRequestLoading ? 'Sending...' : isRegisterLoading ? 'Creating Account...' : 'Signing in...')
                            : isRegistering
                                ? 'Register'
                                : isPasswordlessMode
                                    ? 'Send Login Link'
                                    : 'Sign in'
                        }
                    </button>
                </div>
            </form>

            {/* Hide mode switching when using invitation */}
            {!invitationData?.valid && (
                <div className="text-center space-y-2">
                    {!isRegistering && (
                        <button
                            onClick={() => {
                                setIsPasswordlessMode(!isPasswordlessMode);
                                setTokenSent(false);
                                setPasswordError(null);
                            }}
                            className="block w-full text-sm text-gray-600 dark:text-gray-400 hover:text-gray-500"
                        >
                            {isPasswordlessMode
                                ? 'Use password instead'
                                : 'Get login link via email'}
                        </button>
                    )}

                    <button
                        onClick={() => {
                            setIsRegistering(!isRegistering);
                            setIsPasswordlessMode(false);
                            setTokenSent(false);
                            setFormData(prev => ({
                                ...prev,
                                password: '',
                                confirmPassword: ''
                            }));
                            setPasswordError(null);
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                    >
                        {isRegistering
                            ? 'Already have an account? Sign in'
                            : 'Need an account? Register'}
                    </button>
                </div>
            )}
        </div>
    );
}
