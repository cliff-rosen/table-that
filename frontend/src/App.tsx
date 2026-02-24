import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';

// contexts
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ResearchStreamProvider } from './context/ResearchStreamContext';
import { ChatProvider } from './context/ChatContext';

// utils
import { setSessionExpiredHandler } from './lib/api';
import { setStreamSessionExpiredHandler } from './lib/api/streamUtils';

// components
import TopBar from './components/layout/TopBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import PubMedRoutes from './components/pubmed/PubMedRoutes';
import TrialScoutRoutes from './components/trialscout/TrialScoutRoutes';

// pages
import LoginPage from './pages/LoginPage';
import Profile from './pages/Profile';
import TokenLogin from './pages/TokenLogin';

// Knowledge Horizon pages
import NewStreamPage from './pages/NewStreamPage';
import DashboardPage from './pages/DashboardPage';
import StreamsPage from './pages/StreamsPage';
import EditStreamPage from './pages/EditStreamPage';
import RetrievalWizardPage from './pages/RetrievalWizardPage';
import ReportsPage from './pages/ReportsPage';
import ToolsPage from './pages/ToolsPage';
import AdminPage from './pages/AdminPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import OperationsPage from './pages/OperationsPage';

// Inner component that uses auth context
function AppContent() {
  const { handleSessionExpired, isAuthenticated } = useAuth();

  // Set up session expiry handlers for both API and streaming
  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired);
    setStreamSessionExpiredHandler(handleSessionExpired);
    return () => {
      setSessionExpiredHandler(() => { });
      setStreamSessionExpiredHandler(() => { });
    };
  }, [handleSessionExpired]);

  // Main app content when authenticated
  const AuthenticatedApp = () => {
    const defaultRoute = '/dashboard';

    return (
      <div className="h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
        <TopBar />
        <main className="flex-1 overflow-y-auto pt-16">
          <Routes>
            {/* Knowledge Horizon Routes */}
            <Route path="/" element={<Navigate to={defaultRoute} />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/streams" element={<StreamsPage />} />
            <Route path="/streams/:streamId/edit" element={<EditStreamPage />} />
            <Route path="/streams/:streamId/configure-retrieval" element={<RetrievalWizardPage />} />
            <Route path="/new-stream" element={<NewStreamPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/tools" element={<ToolsPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/operations/*" element={<OperationsPage />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    );
  };

  return (
    <ThemeProvider>
      <ErrorBoundary>
        {!isAuthenticated ? (
          <Routes>
            <Route path="/auth/token-login" element={<TokenLogin />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/register" element={<LoginPage />} />
            <Route path="*" element={<LoginPage />} />
          </Routes>
        ) : (
          <ResearchStreamProvider>
            <ChatProvider>
              <AuthenticatedApp />
            </ChatProvider>
          </ResearchStreamProvider>
        )}
      </ErrorBoundary>
      <Toaster />
    </ThemeProvider>
  );
}

// Main App component that provides contexts
function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <Routes>
        {/* PubMed Tablizer standalone app - has its own auth context */}
        <Route path="/pubmed/*" element={
          <ThemeProvider>
            <PubMedRoutes />
            <Toaster />
          </ThemeProvider>
        } />

        {/* TrialScout standalone app - shares auth with Tablizer */}
        <Route path="/trialscout/*" element={
          <ThemeProvider>
            <TrialScoutRoutes />
            <Toaster />
          </ThemeProvider>
        } />

        {/* Main Knowledge Horizon app */}
        <Route path="/*" element={
          <AuthProvider>
            <AppContent />
          </AuthProvider>
        } />
      </Routes>
    </BrowserRouter>
  );
}

export default App; 