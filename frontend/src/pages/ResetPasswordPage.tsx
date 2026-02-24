import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline';
import settings from '@/config/settings';
import { authApi } from '@/lib/api/authApi';
import { handleApiError } from '@/lib/api';

export default function ResetPasswordPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    // Request reset form state
    const [email, setEmail] = useState('');
    const [isRequesting, setIsRequesting] = useState(false);
    const [requestSent, setRequestSent] = useState(false);

    // Reset password form state
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isResetting, setIsResetting] = useState(false);
    const [resetSuccess, setResetSuccess] = useState(false);

    // Shared state
    const [error, setError] = useState<string | null>(null);

    const handleRequestReset = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsRequesting(true);

        try {
            await authApi.requestPasswordReset(email);
            setRequestSent(true);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsRequesting(false);
        }
    };

    const handleResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }

        setIsResetting(true);

        try {
            await authApi.resetPassword(token!, newPassword);
            setResetSuccess(true);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsResetting(false);
        }
    };

    // Success state after password reset
    if (resetSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                            {settings.appName}
                        </h2>
                        <h1 className="text-3xl font-bold dark:text-white mb-2">
                            Password Reset Complete
                        </h1>
                        <p className="text-gray-600 dark:text-gray-300">
                            Your password has been successfully reset.
                        </p>
                    </div>

                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <p className="text-sm text-green-800 dark:text-green-200">
                            You can now log in with your new password.
                        </p>
                    </div>

                    <button
                        onClick={() => navigate('/')}
                        className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    // Request sent confirmation
    if (requestSent) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                            {settings.appName}
                        </h2>
                        <h1 className="text-3xl font-bold dark:text-white mb-2">
                            Check Your Email
                        </h1>
                        <p className="text-gray-600 dark:text-gray-300">
                            If an account exists for {email}, you'll receive a password reset link.
                        </p>
                    </div>

                    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <p className="text-sm text-blue-800 dark:text-blue-200">
                            The link will expire in 1 hour. Check your spam folder if you don't see it.
                        </p>
                    </div>

                    <div className="text-center space-y-2">
                        <button
                            onClick={() => {
                                setRequestSent(false);
                                setEmail('');
                            }}
                            className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-500"
                        >
                            Try a different email
                        </button>
                        <br />
                        <button
                            onClick={() => navigate('/')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                        >
                            Back to login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // If we have a token, show the reset password form
    if (token) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
                <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                    <div className="text-center">
                        <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                            {settings.appName}
                        </h2>
                        <h1 className="text-3xl font-bold dark:text-white mb-2">
                            Set New Password
                        </h1>
                        <p className="text-gray-600 dark:text-gray-300">
                            Enter your new password below
                        </p>
                    </div>

                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                            {error}
                        </div>
                    )}

                    <form className="mt-8 space-y-6" onSubmit={handleResetPassword}>
                        <div className="space-y-4">
                            <div>
                                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    New Password
                                </label>
                                <div className="relative">
                                    <input
                                        id="newPassword"
                                        type={showPassword ? 'text' : 'password'}
                                        required
                                        minLength={8}
                                        className="appearance-none rounded relative block w-full px-3 py-2 pr-10 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                        placeholder="Minimum 8 characters"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                    >
                                        {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Confirm New Password
                                </label>
                                <input
                                    id="confirmPassword"
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                    placeholder="Confirm your new password"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isResetting}
                            className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isResetting ? 'Resetting...' : 'Reset Password'}
                        </button>
                    </form>

                    <div className="text-center">
                        <button
                            onClick={() => navigate('/')}
                            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                        >
                            Back to login
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // No token - show request reset form
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        {settings.appName}
                    </h2>
                    <h1 className="text-3xl font-bold dark:text-white mb-2">
                        Reset Password
                    </h1>
                    <p className="text-gray-600 dark:text-gray-300">
                        Enter your email to receive a reset link
                    </p>
                </div>

                {error && (
                    <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
                        {error}
                    </div>
                )}

                <form className="mt-8 space-y-6" onSubmit={handleRequestReset}>
                    <div>
                        <label htmlFor="email" className="sr-only">Email address</label>
                        <input
                            id="email"
                            type="email"
                            required
                            className="appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            placeholder="Email address"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isRequesting}
                        className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isRequesting ? 'Sending...' : 'Send Reset Link'}
                    </button>
                </form>

                <div className="text-center">
                    <button
                        onClick={() => navigate('/')}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-500"
                    >
                        Back to login
                    </button>
                </div>
            </div>
        </div>
    );
}
