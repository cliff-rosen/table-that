/**
 * Execution Queue - View and manage pipeline executions and report approvals
 *
 * Route: /operations
 * Features:
 * - Filter by execution status (pending/running/completed/failed)
 * - Filter by approval status (awaiting_approval/approved/rejected)
 * - Filter by stream
 * - Search
 */

import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    FunnelIcon,
    MagnifyingGlassIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ArrowPathIcon,
} from '@heroicons/react/24/outline';
import { getExecutionQueue } from '../../lib/api/operationsApi';
import type { ExecutionStatus, StreamOption, ExecutionQueueItem } from '../../types/research-stream';
import type { ApprovalStatus } from '../../types/report';

export default function ReportQueue() {
    const [searchParams, setSearchParams] = useSearchParams();
    const executionStatusFilter = (searchParams.get('execution_status') as ExecutionStatus | null) || null;
    const approvalStatusFilter = (searchParams.get('approval_status') as ApprovalStatus | null) || null;
    const streamFilter = searchParams.get('stream') || 'all';
    const [searchQuery, setSearchQuery] = useState('');

    const [executions, setExecutions] = useState<ExecutionQueueItem[]>([]);
    const [streams, setStreams] = useState<StreamOption[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch executions
    useEffect(() => {
        async function fetchExecutions() {
            setLoading(true);
            setError(null);
            try {
                const response = await getExecutionQueue({
                    execution_status: executionStatusFilter || undefined,
                    approval_status: approvalStatusFilter || undefined,
                    stream_id: streamFilter !== 'all' ? parseInt(streamFilter) : undefined,
                });
                setExecutions(response.executions);
                setStreams(response.streams);
                setTotal(response.total);
            } catch (err) {
                setError('Failed to load executions');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchExecutions();
    }, [executionStatusFilter, approvalStatusFilter, streamFilter]);

    // Filter by search query (client-side)
    const filteredExecutions = executions.filter((exec) => {
        if (searchQuery && !exec.stream_name.toLowerCase().includes(searchQuery.toLowerCase())) {
            return false;
        }
        return true;
    });

    const setFilter = (key: string, value: string | null) => {
        const newParams = new URLSearchParams(searchParams);
        if (!value || value === 'all') {
            newParams.delete(key);
        } else {
            newParams.set(key, value);
        }
        setSearchParams(newParams);
    };

    const awaitingCount = executions.filter(
        (e) => e.execution_status === 'completed' && e.approval_status === 'awaiting_approval'
    ).length;
    const runningCount = executions.filter((e) => e.execution_status === 'running').length;
    const pendingCount = executions.filter((e) => e.execution_status === 'pending').length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Execution Queue</h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-1">
                        Monitor pipeline executions and approve reports
                        {awaitingCount > 0 && ` · ${awaitingCount} awaiting approval`}
                        {runningCount > 0 && ` · ${runningCount} running`}
                        {pendingCount > 0 && ` · ${pendingCount} pending`}
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                <div className="flex flex-wrap items-center gap-4">
                    {/* Execution Status Filter */}
                    <div className="flex items-center gap-2">
                        <FunnelIcon className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-600 dark:text-gray-400">Execution:</span>
                        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                            {([null, 'pending', 'running', 'completed', 'failed'] as const).map((status) => (
                                <button
                                    key={status || 'all'}
                                    onClick={() => setFilter('execution_status', status)}
                                    className={`px-3 py-1.5 text-sm ${
                                        executionStatusFilter === status
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'}
                                    {status === 'running' && runningCount > 0 && (
                                        <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-purple-500 text-white">
                                            {runningCount}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Approval Status Filter (only relevant for completed) */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Approval:</span>
                        <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden">
                            {([null, 'awaiting_approval', 'approved', 'rejected'] as const).map((status) => (
                                <button
                                    key={status || 'all'}
                                    onClick={() => setFilter('approval_status', status)}
                                    className={`px-3 py-1.5 text-sm ${
                                        approvalStatusFilter === status
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    {status === 'awaiting_approval' ? 'Awaiting' : status ? status.charAt(0).toUpperCase() + status.slice(1) : 'All'}
                                    {status === 'awaiting_approval' && awaitingCount > 0 && (
                                        <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500 text-white">
                                            {awaitingCount}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Stream Filter */}
                    <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">Stream:</span>
                        <select
                            value={streamFilter}
                            onChange={(e) => setFilter('stream', e.target.value)}
                            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="all">All Streams</option>
                            {streams.map((stream) => (
                                <option key={stream.stream_id} value={stream.stream_id}>
                                    {stream.stream_name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Search */}
                    <div className="flex-1 min-w-[200px]">
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search streams..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Loading / Error States */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
                </div>
            )}

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Executions Table */}
            {!loading && !error && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    {filteredExecutions.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                            No executions found
                        </div>
                    ) : (
                        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead className="bg-gray-50 dark:bg-gray-900">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Stream / Report
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Run Type
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Articles
                                    </th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                        Created
                                    </th>
                                    <th className="px-4 py-3"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {filteredExecutions.map((exec) => (
                                    <tr key={exec.execution_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                                        <td className="px-4 py-4">
                                            <div className="flex flex-col gap-1">
                                                <ExecutionStatusBadge status={exec.execution_status} />
                                                {exec.execution_status === 'completed' && exec.approval_status && (
                                                    <ApprovalStatusBadge status={exec.approval_status} />
                                                )}
                                                {exec.execution_status === 'failed' && exec.error && (
                                                    <span className="text-xs text-red-600 dark:text-red-400 truncate max-w-[150px]" title={exec.error}>
                                                        {exec.error}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <div>
                                                <button
                                                    onClick={() => setFilter('stream', String(exec.stream_id))}
                                                    className="font-medium text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 hover:underline text-left"
                                                    title={`Filter by ${exec.stream_name}`}
                                                >
                                                    {exec.stream_name}
                                                </button>
                                                {exec.report_name && (
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">{exec.report_name}</p>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="capitalize text-sm text-gray-700 dark:text-gray-300">{exec.run_type}</span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="text-sm text-gray-900 dark:text-white">
                                                {exec.article_count ?? '-'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                {new Date(exec.created_at).toLocaleDateString()}
                                            </span>
                                        </td>
                                        <td className="px-4 py-4">
                                            <Link
                                                to={`/operations/executions/${exec.execution_id}`}
                                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                            >
                                                Run Detail →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}

                    {/* Pagination */}
                    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Showing {filteredExecutions.length} of {total} executions
                        </p>
                        <div className="flex items-center gap-2">
                            <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50" disabled>
                                <ChevronLeftIcon className="h-5 w-5 text-gray-400" />
                            </button>
                            <span className="text-sm text-gray-600 dark:text-gray-400">Page 1 of 1</span>
                            <button className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50" disabled>
                                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
    const config: Record<ExecutionStatus, { bg: string; text: string; label: string }> = {
        pending: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', label: 'Pending' },
        running: { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-700 dark:text-purple-300', label: 'Running' },
        completed: { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-700 dark:text-blue-300', label: 'Completed' },
        failed: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-300', label: 'Failed' },
    };
    const { bg, text, label } = config[status];
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${bg} ${text}`}>{label}</span>;
}

function ApprovalStatusBadge({ status }: { status: string }) {
    const config: Record<string, { bg: string; text: string; label: string }> = {
        awaiting_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-700 dark:text-yellow-300', label: 'Awaiting Approval' },
        approved: { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-700 dark:text-green-300', label: 'Approved' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-700 dark:text-red-300', label: 'Rejected' },
    };
    const entry = config[status];
    if (!entry) return null;
    const { bg, text, label } = entry;
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${bg} ${text}`}>{label}</span>;
}
