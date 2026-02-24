import { useState, useEffect } from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useOrganization } from '../../context/OrganizationContext';

export function OrgDetailsForm() {
    const { organization, isLoading, error, updateOrganization, clearError } = useOrganization();
    const [name, setName] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    useEffect(() => {
        if (organization) {
            setName(organization.name);
        }
    }, [organization]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim() || name === organization?.name) return;

        setIsSaving(true);
        clearError();
        try {
            await updateOrganization({ name: name.trim() });
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 3000);
        } catch {
            // Error is handled by context
        } finally {
            setIsSaving(false);
        }
    };

    if (isLoading && !organization) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="max-w-2xl">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
                    Organization Details
                </h2>

                {error && (
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                        {error}
                    </div>
                )}

                {showSuccess && (
                    <div className="mb-4 p-4 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 rounded-lg flex items-center gap-2">
                        <CheckIcon className="h-5 w-5" />
                        Organization updated successfully
                    </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label
                            htmlFor="org-name"
                            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
                        >
                            Organization Name
                        </label>
                        <input
                            id="org-name"
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Enter organization name"
                        />
                    </div>

                    <div className="flex items-center gap-4 pt-4">
                        <button
                            type="submit"
                            disabled={isSaving || !name.trim() || name === organization?.name}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {isSaving ? 'Saving...' : 'Save Changes'}
                        </button>
                        {name !== organization?.name && (
                            <button
                                type="button"
                                onClick={() => setName(organization?.name || '')}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                        )}
                    </div>
                </form>

                {/* Organization Info */}
                {organization && (
                    <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
                        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-4">
                            Organization Information
                        </h3>
                        <dl className="grid grid-cols-2 gap-4 text-sm">
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Organization ID</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">{organization.org_id}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Status</dt>
                                <dd>
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                        organization.is_active
                                            ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                            : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                                    }`}>
                                        {organization.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500 dark:text-gray-400">Created</dt>
                                <dd className="font-medium text-gray-900 dark:text-white">
                                    {new Date(organization.created_at).toLocaleDateString()}
                                </dd>
                            </div>
                        </dl>
                    </div>
                )}
            </div>
        </div>
    );
}
