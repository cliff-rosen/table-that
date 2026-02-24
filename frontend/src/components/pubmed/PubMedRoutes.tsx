import { Routes, Route, Navigate } from 'react-router-dom';
import { PubMedAuthProvider, usePubMedAuth } from '../../context/PubMedAuthContext';
import { ChatProvider } from '../../context/ChatContext';
import PubMedLandingPage from '../../pages/pubmed/PubMedLandingPage';
import PubMedLoginPage from '../../pages/pubmed/PubMedLoginPage';
import PubMedRegisterPage from '../../pages/pubmed/PubMedRegisterPage';
import PubMedAppPage from '../../pages/pubmed/PubMedAppPage';

// Protected route component for PubMed app
function PubMedProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = usePubMedAuth();

    if (!isAuthenticated) {
        return <Navigate to="/pubmed/login" replace />;
    }

    return <>{children}</>;
}

// Redirect authenticated users away from login/register
function PubMedPublicRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = usePubMedAuth();

    if (isAuthenticated) {
        return <Navigate to="/pubmed/app" replace />;
    }

    return <>{children}</>;
}

// Inner routes component (uses auth context)
function PubMedRoutesInner() {
    return (
        <Routes>
            {/* Public routes */}
            <Route path="/" element={<PubMedLandingPage />} />
            <Route
                path="/login"
                element={
                    <PubMedPublicRoute>
                        <PubMedLoginPage />
                    </PubMedPublicRoute>
                }
            />
            <Route
                path="/register"
                element={
                    <PubMedPublicRoute>
                        <PubMedRegisterPage />
                    </PubMedPublicRoute>
                }
            />

            {/* Protected routes */}
            <Route
                path="/app"
                element={
                    <PubMedProtectedRoute>
                        <ChatProvider app="tablizer">
                            <PubMedAppPage />
                        </ChatProvider>
                    </PubMedProtectedRoute>
                }
            />

            {/* Catch-all redirect */}
            <Route path="*" element={<Navigate to="/pubmed" replace />} />
        </Routes>
    );
}

// Main component that provides auth context
export default function PubMedRoutes() {
    return (
        <PubMedAuthProvider>
            <PubMedRoutesInner />
        </PubMedAuthProvider>
    );
}
