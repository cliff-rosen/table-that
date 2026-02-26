import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from './components/ui/toaster';

// contexts
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ChatProvider } from './context/ChatContext';

// utils
import { setSessionExpiredHandler } from './lib/api';
import { setStreamSessionExpiredHandler } from './lib/api/streamUtils';
import { useVersionCheck } from './hooks/useVersionCheck';

// components
import TopBar from './components/layout/TopBar';
import { ErrorBoundary } from './components/ErrorBoundary';

// pages
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import Profile from './pages/Profile';
import TokenLogin from './pages/TokenLogin';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AdminPage from './pages/AdminPage';
import TablesListPage from './pages/TablesListPage';
import TableViewPage from './pages/TableViewPage';
import TableEditPage from './pages/TableEditPage';

// Inner component that uses auth context
function AppContent() {
  const { handleSessionExpired, isAuthenticated } = useAuth();

  useEffect(() => {
    setSessionExpiredHandler(handleSessionExpired);
    setStreamSessionExpiredHandler(handleSessionExpired);
    return () => {
      setSessionExpiredHandler(() => { });
      setStreamSessionExpiredHandler(() => { });
    };
  }, [handleSessionExpired]);

  const { newVersionAvailable } = useVersionCheck();

  const AuthenticatedApp = () => {
    return (
      <div className="h-screen flex flex-col dark:bg-gray-900 bg-gray-50">
        <TopBar newVersionAvailable={newVersionAvailable} />
        <main className={`flex-1 min-h-0 flex flex-col overflow-hidden ${newVersionAvailable ? 'pt-[100px]' : 'pt-16'}`}>
          <Routes>
            <Route path="/" element={<Navigate to="/tables" />} />
            <Route path="/tables" element={<TablesListPage />} />
            <Route path="/tables/:tableId" element={<TableViewPage />} />
            <Route path="/tables/:tableId/edit" element={<TableEditPage />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/settings" element={<Navigate to="/profile" replace />} />
            <Route path="/admin" element={<AdminPage />} />
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
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<LoginPage />} />
            <Route path="/auth/token-login" element={<TokenLogin />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <ChatProvider>
            <AuthenticatedApp />
          </ChatProvider>
        )}
      </ErrorBoundary>
      <Toaster />
    </ThemeProvider>
  );
}

function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }}
    >
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
