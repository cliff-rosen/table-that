import { useState, useEffect } from 'react';
import { GlobeAltIcon, TrashIcon, ArrowUpIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';

interface ResearchStream {
    stream_id: number;
    stream_name: string;
    purpose: string;
    scope: string;
    org_id?: number;
    user_id?: number;
    created_by?: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export function GlobalStreamList() {
    const [streams, setStreams] = useState<ResearchStream[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        loadStreams();
    }, []);

    const loadStreams = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const streamList = await adminApi.getGlobalStreams();
            setStreams(streamList);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (streamId: number) => {
        if (!confirm('Are you sure you want to delete this global stream? This action cannot be undone.')) {
            return;
        }

        try {
            await adminApi.deleteGlobalStream(streamId);
            await loadStreams();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Global Streams ({streams.length})
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    To create a global stream, first create a regular stream and then promote it here.
                </p>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {/* Streams Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Stream
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Purpose
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Created
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {streams.map((stream) => (
                            <tr key={stream.stream_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <GlobeAltIcon className="h-5 w-5 text-purple-500" />
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {stream.stream_name}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                ID: {stream.stream_id}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <div className="text-sm text-gray-900 dark:text-white max-w-xs truncate">
                                        {stream.purpose}
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        stream.is_active
                                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                                    }`}>
                                        {stream.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(stream.created_at).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                    <button
                                        onClick={() => handleDelete(stream.stream_id)}
                                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                        title="Delete"
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {streams.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No global streams found. Global streams can be created by promoting existing streams.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Info Card */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <div className="flex gap-3">
                    <ArrowUpIcon className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
                    <div>
                        <h3 className="font-medium text-purple-900 dark:text-purple-300">
                            Promoting Streams to Global
                        </h3>
                        <p className="text-sm text-purple-700 dark:text-purple-400 mt-1">
                            To make a stream available platform-wide, create it as a personal stream first,
                            then use the API endpoint PUT /api/admin/streams/{'{stream_id}'}/scope to promote it to global scope.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
