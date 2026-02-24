import { Routes, Route, Navigate } from 'react-router-dom';
import { TrialScoutAuthProvider, useTrialScoutAuth } from '../../context/TrialScoutAuthContext';
import TrialScoutLandingPage from '../../pages/trialscout/TrialScoutLandingPage';
import TrialScoutAppPage from '../../pages/trialscout/TrialScoutAppPage';
import TrialScoutLoginPage from '../../pages/trialscout/TrialScoutLoginPage';
import TrialScoutRegisterPage from '../../pages/trialscout/TrialScoutRegisterPage';

// Protected route wrapper
function TrialScoutProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useTrialScoutAuth();

    if (!isAuthenticated) {
        return <Navigate to="/trialscout/login" replace />;
    }

    return <>{children}</>;
}

// Public route wrapper (redirects to app if already authenticated)
function TrialScoutPublicRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = useTrialScoutAuth();

    if (isAuthenticated) {
        return <Navigate to="/trialscout/app" replace />;
    }

    return <>{children}</>;
}

export default function TrialScoutRoutes() {
    return (
        <TrialScoutAuthProvider>
            <Routes>
                {/* Public landing page */}
                <Route path="/" element={<TrialScoutLandingPage />} />

                {/* Auth pages */}
                <Route path="/login" element={
                    <TrialScoutPublicRoute>
                        <TrialScoutLoginPage />
                    </TrialScoutPublicRoute>
                } />
                <Route path="/register" element={
                    <TrialScoutPublicRoute>
                        <TrialScoutRegisterPage />
                    </TrialScoutPublicRoute>
                } />

                {/* Protected app */}
                <Route path="/app" element={
                    <TrialScoutProtectedRoute>
                        <TrialScoutAppPage />
                    </TrialScoutProtectedRoute>
                } />

                {/* Catch-all redirect to landing */}
                <Route path="*" element={<Navigate to="/trialscout" replace />} />
            </Routes>
        </TrialScoutAuthProvider>
    );
}
