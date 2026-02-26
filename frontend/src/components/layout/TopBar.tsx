import { useTheme } from '../../context/ThemeContext';
import { NavLink, useLocation } from 'react-router-dom';
import { MoonIcon, SunIcon, UserCircleIcon, TableCellsIcon, ShieldCheckIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import settings from '../../config/settings';
import { useAuth } from '../../context/AuthContext';
import { trackEvent } from '../../lib/api/trackingApi';
interface TopBarProps {
    newVersionAvailable?: boolean;
}

export default function TopBar({ newVersionAvailable }: TopBarProps) {
    const { isDarkMode, toggleTheme } = useTheme();
    const location = useLocation();
    const { logout, isPlatformAdmin } = useAuth();

    const getLinkClass = (path: string, matchPrefix = false) => {
        const isActive = matchPrefix ? location.pathname.startsWith(path) : location.pathname === path;
        return `flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive
            ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`;
    };


    return (
        <>
        {newVersionAvailable && (
            <div className="fixed top-0 left-0 right-0 z-[60] bg-blue-600 text-white text-sm text-center py-1.5 px-4 flex items-center justify-center gap-2">
                <span>A new version is available.</span>
                <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center gap-1 underline font-medium hover:text-blue-100 transition-colors"
                >
                    <ArrowPathIcon className="h-3.5 w-3.5" />
                    Refresh now
                </button>
            </div>
        )}
        <header className={`fixed left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50 flex items-center justify-between px-6 ${newVersionAvailable ? 'top-9' : 'top-0'}`}>
            <div className="flex items-center gap-6">
                <div className="flex items-center">
                    <span className="text-lg font-semibold text-gray-900 dark:text-white">{settings.appName}</span>
                </div>

                <nav className="flex items-center gap-2">
                    <NavLink to="/tables" className={getLinkClass('/tables', true)} onClick={() => trackEvent('nav_click', { destination: 'tables' })}>
                        <TableCellsIcon className="h-5 w-5 mr-2" />
                        Tables
                    </NavLink>
                    {isPlatformAdmin && (
                        <NavLink to="/admin" className={getLinkClass('/admin')} onClick={() => trackEvent('nav_click', { destination: 'admin' })}>
                            <ShieldCheckIcon className="h-5 w-5 mr-2" />
                            Admin
                        </NavLink>
                    )}
                </nav>
            </div>

            <div className="flex items-center gap-6">
                <button onClick={toggleTheme} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                    {isDarkMode ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
                </button>
                <NavLink to="/profile" className={getLinkClass('/profile')} onClick={() => trackEvent('nav_click', { destination: 'profile' })}>
                    <UserCircleIcon className="h-6 w-6" />
                </NavLink>
                <button
                    onClick={logout}
                    className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white"
                >
                    Logout
                </button>
            </div>
        </header>
        </>
    );
}
