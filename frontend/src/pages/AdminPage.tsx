import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { ShieldCheckIcon, BuildingOfficeIcon, UsersIcon, EnvelopeIcon, ClockIcon, ChatBubbleLeftRightIcon, Cog6ToothIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../context/AuthContext';
import { OrganizationList, UserList, InvitationList, ActivityList, ConversationList, ChatConfigPanel } from '../components/admin';

type AdminTab = 'organizations' | 'users' | 'invitations' | 'activity' | 'conversations' | 'chat-config';

interface TabGroup {
    label: string;
    tabs: {
        id: AdminTab;
        label: string;
        icon: React.ComponentType<{ className?: string }>;
    }[];
}

const tabGroups: TabGroup[] = [
    {
        label: 'User Management',
        tabs: [
            { id: 'organizations', label: 'Organizations', icon: BuildingOfficeIcon },
            { id: 'users', label: 'Users', icon: UsersIcon },
            { id: 'invitations', label: 'Invitations', icon: EnvelopeIcon },
        ],
    },
    {
        label: 'Monitoring',
        tabs: [
            { id: 'activity', label: 'Activity', icon: ClockIcon },
            { id: 'conversations', label: 'Conversations', icon: ChatBubbleLeftRightIcon },
        ],
    },
    {
        label: 'System',
        tabs: [
            { id: 'chat-config', label: 'Chat Config', icon: Cog6ToothIcon },
        ],
    },
];

export default function AdminPage() {
    const { isPlatformAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<AdminTab>('organizations');

    // Redirect non-admins
    if (!isPlatformAdmin) {
        return <Navigate to="/dashboard" replace />;
    }

    return (
        <div className="h-full flex flex-col px-4 py-8">
            {/* Page Header */}
            <div className="max-w-7xl mx-auto w-full flex-shrink-0 mb-6">
                <div className="flex items-center gap-3 mb-2">
                    <ShieldCheckIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Platform Administration
                    </h1>
                </div>
                <p className="text-gray-600 dark:text-gray-400">
                    Manage organizations, global streams, and users across the platform
                </p>
            </div>

            {/* Tab Navigation - Grouped */}
            <div className="max-w-7xl mx-auto w-full flex-shrink-0 mb-4">
                <div className="border-b border-gray-200 dark:border-gray-700">
                    <nav className="-mb-px flex items-center">
                        {tabGroups.map((group, groupIndex) => (
                            <div key={group.label} className="flex items-center">
                                {/* Group divider (except first group) */}
                                {groupIndex > 0 && (
                                    <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-4" />
                                )}

                                {/* Group tabs */}
                                <div className="flex space-x-1">
                                    {group.tabs.map((tab) => {
                                        const Icon = tab.icon;
                                        const isActive = activeTab === tab.id;
                                        return (
                                            <button
                                                key={tab.id}
                                                onClick={() => setActiveTab(tab.id)}
                                                className={`
                                                    group inline-flex items-center gap-2 py-3 px-3 border-b-2 font-medium text-sm rounded-t-lg transition-colors
                                                    ${isActive
                                                        ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:text-gray-300 dark:hover:bg-gray-800'
                                                    }
                                                `}
                                                title={group.label}
                                            >
                                                <Icon className={`h-5 w-5 ${isActive ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                                {tab.label}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </nav>
                </div>
            </div>

            {/* Active Tab Content */}
            <div className="max-w-7xl mx-auto w-full">
                {activeTab === 'organizations' && <OrganizationList />}
                {activeTab === 'users' && <UserList />}
                {activeTab === 'invitations' && <InvitationList />}
                {activeTab === 'activity' && <ActivityList />}
                {activeTab === 'conversations' && <ConversationList />}
                {activeTab === 'chat-config' && <ChatConfigPanel />}
            </div>
        </div>
    );
}
