import { useState, useEffect } from 'react';
import { UserIcon, BuildingOfficeIcon, TrashIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';
import type { UserRole, OrganizationWithStats } from '../../types/organization';
import type { User } from '../../types/user';
import { useAuth } from '../../context/AuthContext';

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
    { value: 'platform_admin', label: 'Platform Admin', description: 'Full platform access' },
    { value: 'org_admin', label: 'Org Admin', description: 'Manage organization' },
    { value: 'member', label: 'Member', description: 'Regular user' },
];

export function UserList() {
    const { user: currentUser } = useAuth();
    const [users, setUsers] = useState<User[]>([]);
    const [totalUsers, setTotalUsers] = useState(0);
    const [organizations, setOrganizations] = useState<OrganizationWithStats[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [filterOrgId, setFilterOrgId] = useState<number | undefined>(undefined);

    // Edit role dialog state
    const [editingUser, setEditingUser] = useState<User | null>(null);
    const [selectedRole, setSelectedRole] = useState<UserRole>('member');
    const [isUpdating, setIsUpdating] = useState(false);

    // Assign org dialog state
    const [assigningUser, setAssigningUser] = useState<User | null>(null);
    const [selectedOrgId, setSelectedOrgId] = useState<number | ''>('');
    const [isAssigning, setIsAssigning] = useState(false);

    useEffect(() => {
        loadData();
    }, [filterOrgId]);

    const loadData = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const [userListResponse, orgList] = await Promise.all([
                adminApi.getAllUsers({ org_id: filterOrgId }),
                adminApi.getAllOrganizations()
            ]);
            setUsers(userListResponse.users);
            setTotalUsers(userListResponse.total);
            setOrganizations(orgList);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    const handleUpdateRole = async () => {
        if (!editingUser) return;

        setIsUpdating(true);
        try {
            await adminApi.updateUserRole(editingUser.user_id, selectedRole);
            setEditingUser(null);
            await loadData();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsUpdating(false);
        }
    };

    const handleAssignOrg = async () => {
        if (!assigningUser || selectedOrgId === '') return;

        setIsAssigning(true);
        try {
            await adminApi.assignUserToOrg(Number(selectedOrgId), assigningUser.user_id);
            setAssigningUser(null);
            setSelectedOrgId('');
            await loadData();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsAssigning(false);
        }
    };

    const handleDeleteUser = async (user: User) => {
        if (!confirm(`Are you sure you want to delete ${user.email}? This action cannot be undone.`)) {
            return;
        }

        try {
            await adminApi.deleteUser(user.user_id);
            await loadData();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const canDeleteUser = (user: User) => {
        // Can't delete yourself
        if (currentUser && user.user_id === Number(currentUser.id)) return false;
        // Can't delete other platform admins
        if (user.role === 'platform_admin') return false;
        return true;
    };

    const startEditRole = (user: User) => {
        setEditingUser(user);
        setSelectedRole(user.role);
    };

    const startAssignOrg = (user: User) => {
        setAssigningUser(user);
        setSelectedOrgId(user.org_id || '');
    };

    const getOrgName = (orgId?: number) => {
        if (!orgId) return 'None';
        const org = organizations.find(o => o.org_id === orgId);
        return org?.name || `Org ${orgId}`;
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

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header with Filter */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Users ({totalUsers})
                </h2>
                <div className="flex items-center gap-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400">Filter by org:</label>
                    <select
                        value={filterOrgId || ''}
                        onChange={(e) => setFilterOrgId(e.target.value ? Number(e.target.value) : undefined)}
                        className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                        <option value="">All organizations</option>
                        {organizations.map(org => (
                            <option key={org.org_id} value={org.org_id}>{org.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                    {error}
                </div>
            )}

            {/* Users Table */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                User
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Organization
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Role
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Registered
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {users.map((user) => (
                            <tr key={user.user_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="flex items-center gap-3">
                                        <UserIcon className="h-5 w-5 text-gray-400" />
                                        <div>
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {user.full_name || user.email.split('@')[0]}
                                            </div>
                                            <div className="text-sm text-gray-500 dark:text-gray-400">
                                                {user.email}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                        onClick={() => startAssignOrg(user)}
                                        className="flex items-center gap-2 text-sm text-gray-900 dark:text-white hover:text-purple-600 dark:hover:text-purple-400"
                                    >
                                        <BuildingOfficeIcon className="h-4 w-4" />
                                        {getOrgName(user.org_id)}
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <button
                                        onClick={() => startEditRole(user)}
                                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full hover:ring-2 hover:ring-purple-500 ${getRoleBadgeColor(user.role)}`}
                                    >
                                        {user.role}
                                    </button>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                    {new Date(user.registration_date).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm space-x-3">
                                    <button
                                        onClick={() => startEditRole(user)}
                                        className="text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300"
                                    >
                                        Edit Role
                                    </button>
                                    <button
                                        onClick={() => handleDeleteUser(user)}
                                        disabled={!canDeleteUser(user)}
                                        className={`${
                                            canDeleteUser(user)
                                                ? 'text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300'
                                                : 'text-gray-300 dark:text-gray-600 cursor-not-allowed'
                                        }`}
                                        title={!canDeleteUser(user) ? "Cannot delete this user" : "Delete user"}
                                    >
                                        <TrashIcon className="h-4 w-4 inline" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && (
                            <tr>
                                <td colSpan={5} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                    No users found
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Edit Role Dialog */}
            {editingUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Change Role for {editingUser.email}
                        </h3>
                        <div className="space-y-2 mb-4">
                            {ROLE_OPTIONS.map(option => (
                                <label
                                    key={option.value}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        selectedRole === option.value
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="role"
                                        value={option.value}
                                        checked={selectedRole === option.value}
                                        onChange={() => setSelectedRole(option.value)}
                                        className="text-purple-600"
                                    />
                                    <div>
                                        <div className="font-medium text-gray-900 dark:text-white">
                                            {option.label}
                                        </div>
                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                            {option.description}
                                        </div>
                                    </div>
                                </label>
                            ))}
                        </div>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setEditingUser(null)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleUpdateRole}
                                disabled={isUpdating}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isUpdating ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Assign Organization Dialog */}
            {assigningUser && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Assign Organization for {assigningUser.email}
                        </h3>
                        <select
                            value={selectedOrgId}
                            onChange={(e) => setSelectedOrgId(e.target.value ? Number(e.target.value) : '')}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white mb-4"
                        >
                            <option value="">Select organization...</option>
                            {organizations.map(org => (
                                <option key={org.org_id} value={org.org_id}>{org.name}</option>
                            ))}
                        </select>
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setAssigningUser(null)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAssignOrg}
                                disabled={isAssigning || selectedOrgId === ''}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isAssigning ? 'Assigning...' : 'Assign'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
