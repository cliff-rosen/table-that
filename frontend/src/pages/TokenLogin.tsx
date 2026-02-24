import { useEffect, useState } from 'react';
import { useSearchParams, Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import settings from '../config/settings';

export default function TokenLogin() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { isAuthenticated, loginWithToken, error } = useAuth();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    
    const token = searchParams.get('token');

    useEffect(() => {
        if (!token) {
            setStatus('error');
            return;
        }

        // Attempt login with token using AuthContext
        const attemptLogin = async () => {
            try {
                setStatus('loading');
                await loginWithToken(token);
                setStatus('success');
                // Redirect after a brief delay
                setTimeout(() => {
                    navigate('/');
                }, 1500);
            } catch (error) {
                setStatus('error');
            }
        };

        attemptLogin();
    }, [token]); // Removed loginWithToken and navigate from deps to prevent loops

    // If already authenticated, redirect to home
    if (isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    return (
        <div className="min-h-screen flex items-center justify-center dark:bg-gray-900 bg-gray-50">
            <div className="max-w-md w-full space-y-8 p-8 bg-white dark:bg-gray-800 rounded-lg shadow-md">
                <div className="text-center">
                    <h2 className="text-xl font-semibold text-gray-600 dark:text-gray-400 mb-2">
                        {settings.appName}
                    </h2>
                    <h1 className="text-3xl font-bold dark:text-white mb-2">
                        {status === 'loading' && 'Signing you in...'}
                        {status === 'success' && 'Welcome back!'}
                        {status === 'error' && 'Login Failed'}
                    </h1>
                </div>

                {status === 'loading' && (
                    <div className="text-center">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                        <p className="text-gray-600 dark:text-gray-300">
                            Processing your login token...
                        </p>
                    </div>
                )}

                {status === 'success' && (
                    <div className="text-center">
                        <div className="text-green-600 mb-4">
                            <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                        </div>
                        <p className="text-gray-600 dark:text-gray-300 mb-4">
                            Successfully logged in! Redirecting...
                        </p>
                    </div>
                )}

                {status === 'error' && (
                    <div>
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                            {!token ? 'No login token provided.' : (error || 'Login failed. The token may be invalid or expired.')}
                        </div>
                        <div className="text-center">
                            <a
                                href="/"
                                className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded"
                            >
                                Go to Login
                            </a>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}