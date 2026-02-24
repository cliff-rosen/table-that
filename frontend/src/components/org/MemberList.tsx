import { useState } from 'react';
import { UserIcon, TrashIcon } from '@heroicons/react/24/outline';
import { useOrganization } from '../../context/OrganizationContext';
import { useAuth } from '../../context/AuthContext';
import type { OrgMember, UserRole } from '../../types/organization';

const ROLE_OPTIONS: { value: UserRole; label: string }[] = [
    { value: 'org_admin', label: 'Org Admin' },
    { value: 'member', label: 'Member' },
];

export function MemberList() {
    const { members, isMembersLoading, error, updateMemberRole, removeMember, clearError } = useOrganization();
    const { user } = useAuth();

    const [editingMember, setEditingMember] = useState<OrgMember | null>(null);
    const [selectedRole, setSelectedRole] = useState<UserRole>('member');
    const [isUpdating, setIsUpdating] = useState(false);

    const handleUpdateRole = async () => {
        if (!editingMember) return;

        setIsUpdating(true);
        clearError();
        try {
            await updateMemberRole(editingMember.user_id, selectedRole);
            setEditingMember(null);
        } catch {
            // Error handled by context
        } finally {
            setIsUpdating(false);
        }
    };

    const handleRemove = async (member: OrgMember) => {
        if (member.user_id === Number(user?.id)) {
            alert('You cannot remove yourself from the organization.');
            return;
        }

        if (!confirm(`Are you sure you want to remove ${member.email} from the organization?`)) {
            return;
        }

        clearError();
        try {
            await removeMember(member.user_id);
        } catch {
            // Error handled by context
        }
    };

    const startEditRole = (member: OrgMember) => {
        setEditingMember(member);
        setSelectedRole(member.role);
    };

    const getRoleBadgeColor = (role: UserRole) => {
        switch (role) {
            case 'platform_admin':
                return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
            case 'org_admin':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400';
        }
    };

    if (isMembersLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Members ({members.length})
                </h2>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {/* Members Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Member
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Joined
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {members.map((member) => {
                            const isCurrentUser = member.user_id === Number(user?.id);
                            const isPlatformAdmin = member.role === 'platform_admin';

                            return (
                                <tr key={member.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <UserIcon className="h-5 w-5 text-gray-400" />
                                            <div>
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {member.full_name || member.email.split('@')[0]}
                                                    {isCurrentUser && (
                                                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">(you)</span>
                                                    )}
                                                </div>
                                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                                    {member.email}
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        {!isPlatformAdmin && !isCurrentUser ? (
                                            <button
                                                onClick={() => startEditRole(member)}
                                                className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full hover:ring-2 hover:ring-blue-500 ${getRoleBadgeColor(member.role)}`}
                                            >
                                                {member.role}
                                            </button>
                                        ) : (
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getRoleBadgeColor(member.role)}`}>
                                                {member.role}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {member.joined_at
                                            ? new Date(member.joined_at).toLocaleDateString()
                                            : '-'
                                        }
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                                        {!isCurrentUser && !isPlatformAdmin && (
                                            <button
                                                onClick={() => handleRemove(member)}
                                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                                title="Remove member"
                                            >
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                        {members.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No members found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Edit Role Dialog */}
            {editingMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Change Role for {editingMember.email}
                        </h3>
                        <div className="space-y-2 mb-4">
                            {ROLE_OPTIONS.map(option => (
                                <label
                                    key={option.value}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        selectedRole === option.value
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="role"
                                        value={option.value}
                                        checked={selectedRole === option.value}
                                        onChange={() => setSelectedRole(option.value)}
                                        className="text-blue-600"
                                    />
                                    <span className="font-medium text-gray-900 dark:text-white">
                                        {option.label}
                                    </span>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setEditingMember(null)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateRole}
                                disabled={isUpdating}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                            >
                                {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
