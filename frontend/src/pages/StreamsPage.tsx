import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlusIcon, BeakerIcon, PencilIcon, UserIcon, BuildingOfficeIcon, GlobeAltIcon } from '@heroicons/react/24/outline';

import { useResearchStream } from '../context/ResearchStreamContext';
import { useAuth } from '../context/AuthContext';
import type { ResearchStream } from '../types';

// Scope badge component
const ScopeBadge = ({ scope }: { scope: string }) => {
    const config = {
        personal: {
            icon: UserIcon,
            label: 'Personal',
            className: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
        },
        organization: {
            icon: BuildingOfficeIcon,
            label: 'Organization',
            className: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
        },
        global: {
            icon: GlobeAltIcon,
            label: 'Global',
            className: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
        }
    };

    const { icon: Icon, label, className } = config[scope as keyof typeof config] || config.personal;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${className}`}>
            <Icon className="h-3 w-3" />
            {label}
        </span>
    );
};

export default function StreamsPage() {
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams, isLoading, error, clearError } = useResearchStream();
    const { user, isPlatformAdmin, isOrgAdmin } = useAuth();

    // Only admins can create new streams
    const canCreateStream = isPlatformAdmin || isOrgAdmin;

    // Check if user can modify a stream (edit/delete/run)
    const canModifyStream = (stream: ResearchStream): boolean => {
        const scope = stream.scope || 'personal';

        if (scope === 'global') {
            // Only platform admins can modify global streams
            return isPlatformAdmin;
        } else if (scope === 'organization') {
            // Platform admins and org admins of the same org can modify
            if (isPlatformAdmin) return true;
            return isOrgAdmin && user?.org_id === stream.org_id;
        } else {
            // Personal streams: only creator or platform admins
            if (isPlatformAdmin) return true;
            return stream.user_id === user?.id;
        }
    };

    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    return (
        <div className="h-[calc(100vh-4rem)] overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
                    <div className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                Research Streams
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-2">
                                Monitor specific topics, competitors, or therapeutic areas
                            </p>
                        </div>

                        {canCreateStream && (
                            <button
                                onClick={() => navigate('/new-stream')}
                                className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                <PlusIcon className="h-5 w-5 mr-2" />
                                New Stream
                            </button>
                        )}
                    </div>

            {error && (
                <div className="mb-6 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error}</p>
                    <button
                        onClick={clearError}
                        className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {isLoading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : researchStreams.length === 0 ? (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <BeakerIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Research Streams Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                        {canCreateStream
                            ? 'Create your first research stream to start monitoring the information that matters to your business.'
                            : 'No research streams are available yet. Contact your administrator to create one.'}
                    </p>
                    {canCreateStream && (
                        <button
                            onClick={() => navigate('/new-stream')}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                        >
                            Create Your First Stream
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {researchStreams.map((stream) => (
                        <div
                            key={stream.stream_id}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow hover:shadow-lg transition-shadow"
                        >
                            <div className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-2">
                                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                {stream.stream_name}
                                            </h3>
                                            <ScopeBadge scope={stream.scope || 'personal'} />
                                        </div>
                                        {stream.purpose && (
                                            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                {stream.purpose}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {canModifyStream(stream) && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    navigate(`/streams/${stream.stream_id}/edit`);
                                                }}
                                                className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                                title="Edit stream"
                                            >
                                                <PencilIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                        <div className={`w-3 h-3 rounded-full ${stream.is_active ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium mr-2">Frequency:</span>
                                        <span className="capitalize">{stream.schedule_config?.frequency || 'weekly'}</span>
                                    </div>
                                    {stream.presentation_config.categories && stream.presentation_config.categories.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-3">
                                            {stream.presentation_config.categories.slice(0, 3).map((category, idx) => (
                                                <span
                                                    key={idx}
                                                    className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded"
                                                >
                                                    {category.name}
                                                </span>
                                            ))}
                                            {stream.presentation_config.categories.length > 3 && (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                    +{stream.presentation_config.categories.length - 3} more
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                                    <div className="text-xs text-gray-500 dark:text-gray-400">
                                        Created {new Date(stream.created_at).toLocaleDateString()}
                                    </div>
                                    <button
                                        onClick={() => navigate(`/reports?stream=${stream.stream_id}`)}
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        View Reports →
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
            </div>
        </div>
    );
}
