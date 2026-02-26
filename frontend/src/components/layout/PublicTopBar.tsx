import { Link } from 'react-router-dom';
import { MoonIcon, SunIcon } from '@heroicons/react/24/outline';
import { useTheme } from '../../context/ThemeContext';
import settings from '../../config/settings';

export default function PublicTopBar() {
    const { isDarkMode, toggleTheme } = useTheme();

    return (
        <header className="fixed top-0 left-0 right-0 h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 z-50 flex items-center justify-between px-6">
            <Link to="/" className="flex items-center">
                <span className="text-lg font-semibold text-gray-900 dark:text-white">{settings.appName}</span>
            </Link>

            <div className="flex items-center gap-4">
                <button onClick={toggleTheme} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white">
                    {isDarkMode ? <SunIcon className="h-6 w-6" /> : <MoonIcon className="h-6 w-6" />}
                </button>
                <Link
                    to="/login"
                    className="text-sm font-medium text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
                >
                    Log in
                </Link>
                <Link
                    to="/register"
                    className="text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md"
                >
                    Get Started
                </Link>
            </div>
        </header>
    );
}
