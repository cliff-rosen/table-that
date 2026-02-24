import { Link } from 'react-router-dom';
import {
    ArrowRightOnRectangleIcon,
    TableCellsIcon,
    UserCircleIcon,
    SunIcon,
    MoonIcon
} from '@heroicons/react/24/outline';
import { usePubMedAuth } from '../../context/PubMedAuthContext';
import { useTheme } from '../../context/ThemeContext';

interface PubMedLayoutProps {
    children: React.ReactNode;
    /** Hide footer for full-height app views */
    hideFooter?: boolean;
}

export default function PubMedLayout({ children, hideFooter = false }: PubMedLayoutProps) {
    const { user, logout, isAuthenticated } = usePubMedAuth();
    const { isDarkMode, toggleTheme } = useTheme();

    return (
        <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
            {/* Header */}
            <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 z-50">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        {/* Logo */}
                        <Link to="/pubmed" className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg flex items-center justify-center">
                                <TableCellsIcon className="h-5 w-5 text-white" />
                            </div>
                            <span className="text-xl font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                                PubMed Tablizer
                            </span>
                        </Link>

                        {/* Right side */}
                        <div className="flex items-center gap-4">
                            {/* Dark mode toggle */}
                            <button
                                onClick={toggleTheme}
                                className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
                            >
                                {isDarkMode ? <SunIcon className="h-5 w-5" /> : <MoonIcon className="h-5 w-5" />}
                            </button>

                            {isAuthenticated ? (
                                <>
                                    {/* User info */}
                                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300">
                                        <UserCircleIcon className="h-5 w-5" />
                                        <span className="hidden sm:inline">{user?.email}</span>
                                    </div>

                                    {/* Logout */}
                                    <button
                                        onClick={logout}
                                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                                    >
                                        <ArrowRightOnRectangleIcon className="h-4 w-4" />
                                        <span className="hidden sm:inline">Logout</span>
                                    </button>
                                </>
                            ) : (
                                <>
                                    <Link
                                        to="/pubmed/login"
                                        className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                                    >
                                        Sign In
                                    </Link>
                                    <Link
                                        to="/pubmed/register"
                                        className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
                                    >
                                        Get Started
                                    </Link>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="flex-1 overflow-hidden">
                {children}
            </main>

            {/* Footer */}
            {!hideFooter && (
                <footer className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 py-6 flex-shrink-0">
                    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
                            <div className="flex items-center gap-2">
                                <div className="w-5 h-5 bg-gradient-to-br from-purple-500 to-violet-600 rounded flex items-center justify-center">
                                    <TableCellsIcon className="h-3 w-3 text-white" />
                                </div>
                                <span>PubMed Tablizer</span>
                            </div>
                            <div>
                                Powered by AI
                            </div>
                        </div>
                    </div>
                </footer>
            )}
        </div>
    );
}
