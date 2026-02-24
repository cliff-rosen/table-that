import { useState, useEffect } from 'react';
import { EnvelopeIcon, PlusIcon, ClipboardDocumentIcon, XMarkIcon, CheckIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';
import { copyToClipboard } from '../../lib/utils/clipboard';
import type { Invitation, OrganizationWithStats, UserRole } from '../../types/organization';

const ROLE_OPTIONS: { value: UserRole; label: string; requiresOrg: boolean }[] = [
    { value: 'member', label: 'Member', requiresOrg: true },
    { value: 'org_admin', label: 'Org Admin', requiresOrg: true },
    { value: 'platform_admin', label: 'Platform Admin', requiresOrg: false },
];

export function InvitationList() {
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [organizations, setOrganizations] = useState<OrganizationWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    // Create invitation dialog state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newEmail, setNewEmail] = useState('');
    const [newOrgId, setNewOrgId] = useState<number | ''>('');
    const [newRole, setNewRole] = useState<UserRole>('member');
    const [expiresInDays, setExpiresInDays] = useState(7);
    const [isCreating, setIsCreating] = useState(false);

    // Created invitation (for showing the link)
    const [createdInvitation, setCreatedInvitation] = useState<Invitation | null>(null);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [invList, orgList] = await Promise.all([
                adminApi.getInvitations(),
                adminApi.getAllOrganizations()
            ]);
            setInvitations(invList);
            setOrganizations(orgList);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const selectedRoleOption = ROLE_OPTIONS.find(r => r.value === newRole);
    const requiresOrg = selectedRoleOption?.requiresOrg ?? true;

    const handleCreateInvitation = async () => {
        if (!newEmail) return;
        if (requiresOrg && newOrgId === '') return;

        setIsCreating(true);
        try {
            const invitation = await adminApi.createInvitation({
                email: newEmail,
                org_id: requiresOrg ? Number(newOrgId) : undefined,
                role: newRole,
                expires_in_days: expiresInDays
            });
            setCreatedInvitation(invitation);
            setShowCreateDialog(false);
            setNewEmail('');
            setNewOrgId('');
            setNewRole('member');
            setExpiresInDays(7);
            await loadData();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsCreating(false);
        }
    };

    const handleRevokeInvitation = async (invitationId: number) => {
        if (!confirm('Are you sure you want to revoke this invitation?')) return;

        try {
            await adminApi.revokeInvitation(invitationId);
            await loadData();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const handleCopyInviteLink = async (invitation: Invitation) => {
        const inviteUrl = `${window.location.origin}/register?token=${invitation.token}`;
        const result = await copyToClipboard(inviteUrl);
        if (result.success) {
            setCopiedToken(invitation.token);
            setTimeout(() => setCopiedToken(null), 2000);
        }
    };

    const getStatusBadge = (invitation: Invitation) => {
        if (invitation.accepted_at) {
            return (
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                    <CheckIcon className="h-3 w-3 mr-1" />
                    Accepted
                </span>
            );
        }

        const isExpired = new Date(invitation.expires_at) < new Date();
        if (isExpired) {
            return (
                <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400">
                    Expired
                </span>
            );
        }

        return (
            <span className="inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">
                Pending
            </span>
        );
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
                    Invitations ({invitations.length})
                </h2>
                <button
                    onClick={() => setShowCreateDialog(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                    <PlusIcon className="h-5 w-5" />
                    Invite User
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {/* Created Invitation Success */}
            {createdInvitation && (
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                    <div className="flex items-start justify-between">
                        <div>
                            <h4 className="font-medium text-green-800 dark:text-green-200">
                                Invitation Created
                            </h4>
                            <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                                Send this link to <strong>{createdInvitation.email}</strong>:
                            </p>
                            <div className="mt-2 flex items-center gap-2">
                                <code className="px-2 py-1 bg-white dark:bg-gray-800 border border-green-300 dark:border-green-700 rounded text-sm break-all">
                                    {window.location.origin}/register?token={createdInvitation.token}
                                </code>
                                <button
                                    onClick={() => handleCopyInviteLink(createdInvitation)}
                                    className="p-2 hover:bg-green-100 dark:hover:bg-green-800/50 rounded"
                                    title="Copy to clipboard"
                                >
                                    {copiedToken === createdInvitation.token ? (
                                        <CheckIcon className="h-5 w-5 text-green-600" />
                                    ) : (
                                        <ClipboardDocumentIcon className="h-5 w-5 text-green-600" />
                                    )}
                                </button>
                            </div>
                        </div>
                        <button
                            onClick={() => setCreatedInvitation(null)}
                            className="text-green-600 hover:text-green-800"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>
            )}

            {/* Invitations Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Organization
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Expires
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {invitations.map((invitation) => {
                            const isExpired = new Date(invitation.expires_at) < new Date();
                            const isPending = !invitation.accepted_at && !isExpired;

                            return (
                                <tr key={invitation.invitation_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                                            <span className="text-gray-900 dark:text-white">
                                                {invitation.email}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                                        {invitation.org_name || <span className="text-gray-400 italic">None</span>}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                            invitation.role === 'platform_admin'
                                                ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                                                : invitation.role === 'org_admin'
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                                : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400'
                                        }`}>
                                            {invitation.role}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {getStatusBadge(invitation)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {new Date(invitation.expires_at).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                                        {isPending && (
                                            <>
                                                <button
                                                    onClick={() => handleCopyInviteLink(invitation)}
                                                    className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
                                                    title="Copy invite link"
                                                >
                                                    {copiedToken === invitation.token ? 'Copied!' : 'Copy Link'}
                                                </button>
                                                <button
                                                    onClick={() => handleRevokeInvitation(invitation.invitation_id)}
                                                    className="text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                                                >
                                                    Revoke
                                                </button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {invitations.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No invitations found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Create Invitation Dialog */}
            {showCreateDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Invite User
                        </h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={newEmail}
                                    onChange={(e) => setNewEmail(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    placeholder="user@example.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Role
                                </label>
                                <select
                                    value={newRole}
                                    onChange={(e) => {
                                        setNewRole(e.target.value as UserRole);
                                        // Clear org selection if switching to platform_admin
                                        if (e.target.value === 'platform_admin') {
                                            setNewOrgId('');
                                        }
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                >
                                    {ROLE_OPTIONS.map(option => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                    ))}
                                </select>
                                {newRole === 'platform_admin' && (
                                    <p className="mt-1 text-xs text-purple-600 dark:text-purple-400">
                                        Platform admins have full system access
                                    </p>
                                )}
                            </div>

                            {requiresOrg && (
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Organization
                                    </label>
                                    <select
                                        value={newOrgId}
                                        onChange={(e) => setNewOrgId(e.target.value ? Number(e.target.value) : '')}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select organization...</option>
                                        {organizations.map(org => (
                                            <option key={org.org_id} value={org.org_id}>{org.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Expires In (days)
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    max="30"
                                    value={expiresInDays}
                                    onChange={(e) => setExpiresInDays(Number(e.target.value))}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>
                        </div>

                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowCreateDialog(false);
                                    setNewEmail('');
                                    setNewOrgId('');
                                    setNewRole('member');
                                }}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreateInvitation}
                                disabled={isCreating || !newEmail || (requiresOrg && newOrgId === '')}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isCreating ? 'Creating...' : 'Create Invitation'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
