/**
 * ActivityList Component
 *
 * Displays user activity events for platform admins.
 */

import { useState, useEffect } from 'react';
import { ClockIcon, FunnelIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { showErrorToast } from '@/lib/errorToast';

interface UserEvent {
    id: number;
    user_id: number;
    user_email: string;
    user_name?: string;
    event_source: 'backend' | 'frontend';
    event_type: string;
    event_data?: Record<string, unknown>;
    created_at: string;
}

interface EventsResponse {
    events: UserEvent[];
    total: number;
    limit: number;
    offset: number;
}

interface UserOption {
    user_id: number;
    email: string;
    full_name?: string;
}

export function ActivityList() {
    const [events, setEvents] = useState<UserEvent[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [hours, setHours] = useState(24);
    const [eventSource, setEventSource] = useState<string>('');
    const [eventType, setEventType] = useState<string>('');
    const [eventTypes, setEventTypes] = useState<string[]>([]);
    const [userId, setUserId] = useState<number | ''>('');
    const [users, setUsers] = useState<UserOption[]>([]);

    // Pagination
    const [offset, setOffset] = useState(0);
    const limit = 50;

    const fetchEvents = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = {
                hours,
                limit,
                offset
            };
            if (eventSource) params.event_source = eventSource;
            if (eventType) params.event_type = eventType;
            if (userId) params.user_id = userId;

            const response = await api.get<EventsResponse>('/api/tracking/admin/events', { params });
            setEvents(response.data.events);
            setTotal(response.data.total);
        } catch (err) {
            setError('Failed to load events');
            showErrorToast(err, 'Failed to load activity');
        } finally {
            setLoading(false);
        }
    };

    const fetchEventTypes = async () => {
        try {
            const response = await api.get<string[]>('/api/tracking/admin/event-types');
            setEventTypes(response.data);
        } catch (err) {
            console.error('Error loading event types:', err);
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await api.get<{ users: UserOption[] }>('/api/admin/users');
            setUsers(response.data.users);
        } catch (err) {
            console.error('Error loading users:', err);
        }
    };

    useEffect(() => {
        fetchEvents();
    }, [hours, eventSource, eventType, userId, offset]);

    useEffect(() => {
        fetchEventTypes();
        fetchUsers();
    }, []);

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        return date.toLocaleString();
    };

    const formatEventData = (data?: Record<string, unknown>) => {
        if (!data || Object.keys(data).length === 0) return null;
        return JSON.stringify(data, null, 2);
    };

    return (
        <div className="space-y-4">
            {/* Header with filters */}
            <div className="flex flex-wrap items-center gap-4 mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                    <ClockIcon className="h-5 w-5" />
                    User Activity
                </h2>

                <div className="flex items-center gap-2 ml-auto">
                    <FunnelIcon className="h-4 w-4 text-gray-500" />

                    {/* Time filter */}
                    <select
                        value={hours}
                        onChange={(e) => { setOffset(0); setHours(Number(e.target.value)); }}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                        <option value={1}>Last hour</option>
                        <option value={6}>Last 6 hours</option>
                        <option value={24}>Last 24 hours</option>
                        <option value={72}>Last 3 days</option>
                        <option value={168}>Last week</option>
                    </select>

                    {/* User filter */}
                    <select
                        value={userId}
                        onChange={(e) => { setOffset(0); setUserId(e.target.value ? Number(e.target.value) : ''); }}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                        <option value="">All users</option>
                        {users.map(user => (
                            <option key={user.user_id} value={user.user_id}>
                                {user.full_name || user.email}
                            </option>
                        ))}
                    </select>

                    {/* Source filter */}
                    <select
                        value={eventSource}
                        onChange={(e) => { setOffset(0); setEventSource(e.target.value); }}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                        <option value="">All sources</option>
                        <option value="frontend">Frontend</option>
                        <option value="backend">Backend</option>
                    </select>

                    {/* Event type filter */}
                    <select
                        value={eventType}
                        onChange={(e) => { setOffset(0); setEventType(e.target.value); }}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                        <option value="">All types</option>
                        {eventTypes.map(type => (
                            <option key={type} value={type}>{type}</option>
                        ))}
                    </select>

                    {/* Refresh button */}
                    <button
                        onClick={fetchEvents}
                        disabled={loading}
                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        title="Refresh"
                    >
                        <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* Results summary */}
            <div className="text-sm text-gray-600 dark:text-gray-400">
                Showing {events.length} of {total} events
            </div>

            {/* Error state */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Loading state */}
            {loading && events.length === 0 && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
                    Loading events...
                </div>
            )}

            {/* Events table */}
            {events.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Time
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    User
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Source
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Event Type
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                    Details
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {events.map((event) => (
                                <tr key={event.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400 whitespace-nowrap">
                                        {formatTime(event.created_at)}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {event.user_name || event.user_email}
                                        </div>
                                        {event.user_name && (
                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                {event.user_email}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded-full ${
                                            event.event_source === 'frontend'
                                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300'
                                                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                        }`}>
                                            {event.event_source}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-900 dark:text-white font-mono">
                                        {event.event_type}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                                        {formatEventData(event.event_data) && (
                                            <pre className="text-xs bg-gray-100 dark:bg-gray-900 p-2 rounded max-w-md overflow-x-auto">
                                                {formatEventData(event.event_data)}
                                            </pre>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Empty state */}
            {!loading && events.length === 0 && !error && (
                <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    No events found for the selected filters
                </div>
            )}

            {/* Pagination */}
            {total > limit && (
                <div className="flex justify-between items-center mt-4">
                    <button
                        onClick={() => setOffset(Math.max(0, offset - limit))}
                        disabled={offset === 0 || loading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Previous
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                        Page {Math.floor(offset / limit) + 1} of {Math.ceil(total / limit)}
                    </span>
                    <button
                        onClick={() => setOffset(offset + limit)}
                        disabled={offset + limit >= total || loading}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
