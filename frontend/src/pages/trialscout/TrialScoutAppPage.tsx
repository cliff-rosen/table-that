import { Link } from 'react-router-dom';
import {
    BeakerIcon,
    ArrowRightOnRectangleIcon
} from '@heroicons/react/24/outline';
import { useTrialScoutAuth } from '../../context/TrialScoutAuthContext';
import TrialScoutWorkbench from '../../components/trialscout/TrialScoutWorkbench';

export default function TrialScoutAppPage() {
    const { user, logout } = useTrialScoutAuth();

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col">
            {/* Header */}
            <header className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
                <div className="container mx-auto flex items-center justify-between">
                    <Link to="/trialscout" className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-violet-600 rounded-lg flex items-center justify-center">
                            <BeakerIcon className="h-5 w-5 text-white" />
                        </div>
                        <span className="text-lg font-bold bg-gradient-to-r from-purple-600 to-violet-600 bg-clip-text text-transparent">
                            TrialScout
                        </span>
                    </Link>

                    <div className="flex items-center gap-4">
                        {user && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                {user.email}
                            </span>
                        )}
                        <button
                            onClick={logout}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 rounded-md hover:border-red-300 dark:hover:border-red-600 transition-colors"
                        >
                            <ArrowRightOnRectangleIcon className="h-4 w-4" />
                            Sign Out
                        </button>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="flex-1 min-h-0 container mx-auto px-4 py-6 flex flex-col">
                <TrialScoutWorkbench />
            </main>

            {/* Footer */}
            <footer className="flex-shrink-0 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 px-4 py-3">
                <div className="container mx-auto text-center text-sm text-gray-500 dark:text-gray-400">
                    Data from ClinicalTrials.gov
                </div>
            </footer>
        </div>
    );
}
