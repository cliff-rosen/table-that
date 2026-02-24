import { useState, useEffect } from 'react';
import { PlusIcon, PencilIcon, TrashIcon, BuildingOfficeIcon, SignalIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';
import type { OrganizationWithStats, StreamSubscriptionStatus } from '../../types/organization';

export function OrganizationList() {
    const [organizations, setOrganizations] = useState<OrganizationWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Create dialog state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newOrgName, setNewOrgName] = useState('');
    const [isCreating, setIsCreating] = useState(false);

    // Edit dialog state
    const [editingOrg, setEditingOrg] = useState<OrganizationWithStats | null>(null);
    const [editName, setEditName] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Stream subscription dialog state
    const [streamSubOrg, setStreamSubOrg] = useState<OrganizationWithStats | null>(null);
    const [globalStreams, setGlobalStreams] = useState<StreamSubscriptionStatus[]>([]);
    const [isLoadingStreams, setIsLoadingStreams] = useState(false);
    const [isTogglingStream, setIsTogglingStream] = useState<number | null>(null);

    useEffect(() => {
        loadOrganizations();
    }, []);

    const loadOrganizations = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const orgs = await adminApi.getAllOrganizations();
            setOrganizations(orgs);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleCreate = async () => {
        if (!newOrgName.trim()) return;

        setIsCreating(true);
        try {
            await adminApi.createOrganization(newOrgName.trim());
            setNewOrgName('');
            setShowCreateDialog(false);
            await loadOrganizations();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdate = async () => {
        if (!editingOrg || !editName.trim()) return;

        setIsUpdating(true);
        try {
            await adminApi.updateOrganization(editingOrg.org_id, { name: editName.trim() });
            setEditingOrg(null);
            await loadOrganizations();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleDelete = async (orgId: number) => {
        if (!confirm('Are you sure you want to delete this organization? This action cannot be undone.')) {
            return;
        }

        try {
            await adminApi.deleteOrganization(orgId);
            await loadOrganizations();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const startEdit = (org: OrganizationWithStats) => {
        setEditingOrg(org);
        setEditName(org.name);
    };

    const openStreamSubscriptions = async (org: OrganizationWithStats) => {
        setStreamSubOrg(org);
        setIsLoadingStreams(true);
        try {
            const streams = await adminApi.getOrgGlobalStreams(org.org_id);
            setGlobalStreams(streams);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoadingStreams(false);
        }
    };

    const toggleStreamSubscription = async (stream: StreamSubscriptionStatus) => {
        if (!streamSubOrg) return;

        setIsTogglingStream(stream.stream_id);
        try {
            if (stream.is_org_subscribed) {
                await adminApi.unsubscribeOrgFromGlobalStream(streamSubOrg.org_id, stream.stream_id);
            } else {
                await adminApi.subscribeOrgToGlobalStream(streamSubOrg.org_id, stream.stream_id);
            }
            // Refresh streams list
            const streams = await adminApi.getOrgGlobalStreams(streamSubOrg.org_id);
            setGlobalStreams(streams);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsTogglingStream(null);
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
            {/* Header with Create Button */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Organizations ({organizations.length})
                </h2>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                >
                    <PlusIcon className="h-5 w-5" />
                    Create Organization
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {/* Organizations Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Organization
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Members / Pending
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Streams
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {organizations.map((org) => (
                            <tr key={org.org_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <BuildingOfficeIcon className="h-5 w-5 text-gray-400" />
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {org.name}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                ID: {org.org_id}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm">
                                    <span className="text-gray-900 dark:text-white">{org.member_count}</span>
                                    {org.pending_invitation_count > 0 && (
                                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                                            +{org.pending_invitation_count} pending
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                    {org.stream_count}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        org.is_active
                                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                                    }`}>
                                        {org.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                    <button
                                        onClick={() => openStreamSubscriptions(org)}
                                        className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 mr-3"
                                        title="Manage Stream Subscriptions"
                                    >
                                        <SignalIcon className="h-5 w-5" />
                                    </button>
                                    <button
                                        onClick={() => startEdit(org)}
                                        className="text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 mr-3"
                                        title="Edit"
                                    >
                                        <PencilIcon className="h-5 w-5" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(org.org_id)}
                                        className={`${
                                            org.member_count > 0
                                                ? 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                                : 'text-gray-400 hover:text-red-600 dark:hover:text-red-400'
                                        }`}
                                        title={org.member_count > 0 ? `Cannot delete: ${org.member_count} members` : 'Delete'}
                                        disabled={org.member_count > 0}
                                    >
                                        <TrashIcon className="h-5 w-5" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {organizations.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No organizations found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Dialog */}
            {showCreateDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Create Organization
                        </h3>
                        <input
                            type="text"
                            value={newOrgName}
                            onChange={(e) => setNewOrgName(e.target.value)}
                            placeholder="Organization name"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowCreateDialog(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={isCreating || !newOrgName.trim()}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isCreating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Dialog */}
            {editingOrg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Edit Organization
                        </h3>
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder="Organization name"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
                            autoFocus
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setEditingOrg(null)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdate}
                                disabled={isUpdating || !editName.trim()}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Stream Subscriptions Dialog */}
            {streamSubOrg && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[80vh] flex flex-col">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                            Global Stream Subscriptions
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                            Manage which global streams <strong>{streamSubOrg.name}</strong> is subscribed to.
                        </p>

                        {isLoadingStreams ? (
                            <div className="flex items-center justify-center py-8">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                            </div>
                        ) : globalStreams.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                No global streams available. Create a global stream first.
                            </div>
                        ) : (
                            <div className="flex-1 overflow-y-auto space-y-2 mb-4">
                                {globalStreams.map((stream) => (
                                    <div
                                        key={stream.stream_id}
                                        className={`flex items-center justify-between p-3 rounded-lg border ${
                                            stream.is_org_subscribed
                                                ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        <div className="flex-1">
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {stream.stream_name}
                                            </div>
                                            {stream.purpose && (
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {stream.purpose}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => toggleStreamSubscription(stream)}
                                            disabled={isTogglingStream === stream.stream_id}
                                            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                                                stream.is_org_subscribed
                                                    ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400'
                                                    : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400'
                                            } disabled:opacity-50`}
                                        >
                                            {isTogglingStream === stream.stream_id
                                                ? '...'
                                                : stream.is_org_subscribed
                                                    ? 'Unsubscribe'
                                                    : 'Subscribe'
                                            }
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="flex justify-end">
                            <button
                                onClick={() => setStreamSubOrg(null)}
                                className="px-4 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
