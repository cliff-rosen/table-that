import { useTheme } from '../../context/ThemeContext';
import { NavLink, useLocation } from 'react-router-dom';
import { MoonIcon, SunIcon, UserCircleIcon, HomeIcon, DocumentTextIcon, BeakerIcon, WrenchScrewdriverIcon, ShieldCheckIcon, Cog8ToothIcon } from '@heroicons/react/24/outline';
import settings from '../../config/settings';
import { HelpGuide } from '@/components/help';
import { useAuth } from '../../context/AuthContext';
import { trackEvent } from '../../lib/api/trackingApi';


export default function TopBar() {
    const { isDarkMode, toggleTheme } = useTheme();
    const location = useLocation();
    const { logout, isPlatformAdmin, isOrgAdmin } = useAuth();

    const getLinkClass = (path: string, matchPrefix = false) => {
        const isActive = matchPrefix ? location.pathname.startsWith(path) : location.pathname === path;
        return `flex items-center px-3 py-2 text-sm font-medium rounded-md ${isActive
            ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
            : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white'
            }`;
    };


    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50 flex items-center justify-between px-6">
            <div className="flex items-center gap-6">
                {/* Logo */}
                <div className="flex items-center">
                    <img src={settings.logoUrl} alt="Logo" className="h-8 w-auto" />
                    <span className="ml-3 text-lg font-semibold text-gray-900 dark:text-white">{settings.appName}</span>
                </div>

                {/* Navigation */}
                <nav className="flex items-center gap-2">
                    {/* Knowledge Horizon Navigation */}
                    <NavLink to="/dashboard" className={getLinkClass('/dashboard')} onClick={() => trackEvent('nav_click', { destination: 'dashboard' })}>
                        <HomeIcon className="h-5 w-5 mr-2" />
                        Dashboard
                    </NavLink>
                    <NavLink to="/streams" className={getLinkClass('/streams')} onClick={() => trackEvent('nav_click', { destination: 'streams' })}>
                        <BeakerIcon className="h-5 w-5 mr-2" />
                        Streams
                    </NavLink>
                    <NavLink to="/reports" className={getLinkClass('/reports')} onClick={() => trackEvent('nav_click', { destination: 'reports' })}>
                        <DocumentTextIcon className="h-5 w-5 mr-2" />
                        Reports
                    </NavLink>
                    {(isPlatformAdmin || isOrgAdmin) && (
                        <NavLink to="/tools" className={getLinkClass('/tools')} onClick={() => trackEvent('nav_click', { destination: 'tools' })}>
                            <WrenchScrewdriverIcon className="h-5 w-5 mr-2" />
                            Tools
                        </NavLink>
                    )}
                    {isPlatformAdmin && (
                        <>
                            <NavLink to="/operations" className={getLinkClass('/operations', true)} onClick={() => trackEvent('nav_click', { destination: 'operations' })}>
                                <Cog8ToothIcon className="h-5 w-5 mr-2" />
                                Operations
                            </NavLink>
                            <NavLink to="/admin" className={getLinkClass('/admin')} onClick={() => trackEvent('nav_click', { destination: 'admin' })}>
                                <ShieldCheckIcon className="h-5 w-5 mr-2" />
                                Admin
                            </NavLink>
                        </>
                    )}
                </nav>
            </div>

            <div className="flex items-center gap-6">
                <button onClick={toggleTheme} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                    {isDarkMode ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
                </button>
                <HelpGuide />
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
    );
} 