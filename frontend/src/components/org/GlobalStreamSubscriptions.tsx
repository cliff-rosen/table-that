import { useEffect, useState } from 'react';
import { GlobeAltIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { useOrganization } from '../../context/OrganizationContext';

export function GlobalStreamSubscriptions() {
    const {
        globalStreams,
        isStreamsLoading,
        error,
        loadGlobalStreams,
        subscribeToGlobalStream,
        unsubscribeFromGlobalStream,
        clearError
    } = useOrganization();

    const [processingIds, setProcessingIds] = useState<Set<number>>(new Set());

    useEffect(() => {
        loadGlobalStreams();
    }, [loadGlobalStreams]);

    const handleToggleSubscription = async (streamId: number, isSubscribed: boolean) => {
        setProcessingIds(prev => new Set(prev).add(streamId));
        clearError();

        try {
            if (isSubscribed) {
                await unsubscribeFromGlobalStream(streamId);
            } else {
                await subscribeToGlobalStream(streamId);
            }
        } catch {
            // Error handled by context
        } finally {
            setProcessingIds(prev => {
                const next = new Set(prev);
                next.delete(streamId);
                return next;
            });
        }
    };

    if (isStreamsLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    const subscribedStreams = globalStreams.filter(s => s.is_org_subscribed);
    const availableStreams = globalStreams.filter(s => !s.is_org_subscribed);

    return (
        <div className="space-y-8">
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {/* Subscribed Streams */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                    Subscribed Streams ({subscribedStreams.length})
                </h2>

                {subscribedStreams.length === 0 ? (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                        Your organization is not subscribed to any global streams yet.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {subscribedStreams.map(stream => (
                            <div
                                key={stream.stream_id}
                                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 border-l-4 border-green-500"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <GlobeAltIcon className="h-5 w-5 text-green-500 mt-0.5" />
                                        <div>
                                            <h3 className="font-medium text-gray-900 dark:text-white">
                                                {stream.stream_name}
                                            </h3>
                                            {stream.purpose && (
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                    {stream.purpose}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleToggleSubscription(stream.stream_id, true)}
                                        disabled={processingIds.has(stream.stream_id)}
                                        className="px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                    >
                                        {processingIds.has(stream.stream_id) ? 'Processing...' : 'Unsubscribe'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Available Streams */}
            <div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <GlobeAltIcon className="h-5 w-5 text-gray-400" />
                    Available Global Streams ({availableStreams.length})
                </h2>

                {availableStreams.length === 0 ? (
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center text-gray-500 dark:text-gray-400">
                        All global streams have been subscribed to.
                    </div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2">
                        {availableStreams.map(stream => (
                            <div
                                key={stream.stream_id}
                                className="bg-white dark:bg-gray-800 rounded-lg shadow p-4"
                            >
                                <div className="flex items-start justify-between">
                                    <div className="flex items-start gap-3">
                                        <GlobeAltIcon className="h-5 w-5 text-gray-400 mt-0.5" />
                                        <div>
                                            <h3 className="font-medium text-gray-900 dark:text-white">
                                                {stream.stream_name}
                                            </h3>
                                            {stream.purpose && (
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                    {stream.purpose}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleToggleSubscription(stream.stream_id, false)}
                                        disabled={processingIds.has(stream.stream_id)}
                                        className="px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors disabled:opacity-50"
                                    >
                                        {processingIds.has(stream.stream_id) ? 'Processing...' : 'Subscribe'}
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                <p className="text-sm text-blue-700 dark:text-blue-400">
                    <strong>Note:</strong> When you subscribe to a global stream, all members of your organization
                    will have access to that stream's reports. Individual members can opt out of specific streams
                    if they wish.
                </p>
            </div>
        </div>
    );
}
