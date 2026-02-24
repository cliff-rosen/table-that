/**
 * Report Approval Queue
 *
 * Focused view for approving reports. Shows reports awaiting approval
 * with key metrics and quick actions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
    CheckCircleIcon,
    ClockIcon,
    DocumentTextIcon,
    PencilSquareIcon,
    FunnelIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    ChevronRightIcon,
    UserCircleIcon,
} from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { getExecutionQueue } from '../../lib/api/operationsApi';
import { approveReport } from '../../lib/api/curationApi';
import type { ExecutionQueueItem } from '../../types/research-stream';

// Helper to calculate time ago
function getTimeAgo(dateStr: string): { text: string; hours: number } {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
        return { text: `${diffDays} day${diffDays > 1 ? 's' : ''} ago`, hours: diffHours };
    } else if (diffHours > 0) {
        return { text: `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`, hours: diffHours };
    } else {
        const diffMins = Math.floor(diffMs / (1000 * 60));
        return { text: `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`, hours: 0 };
    }
}

type SortField = 'waiting' | 'articles' | 'stream' | 'created';
type SortDirection = 'asc' | 'desc';

export default function ReportApprovalQueue() {
    const [executions, setExecutions] = useState<ExecutionQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [sortField, setSortField] = useState<SortField>('waiting');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [filterStream, setFilterStream] = useState<string>('all');
    const [approving, setApproving] = useState<number | null>(null);

    // Load pending reports
    const fetchPendingReports = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await getExecutionQueue({
                approval_status: 'awaiting_approval',
            });
            setExecutions(response.executions);
        } catch (err) {
            console.error('Failed to fetch pending reports:', err);
            setError('Failed to load pending reports');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchPendingReports();
    }, [fetchPendingReports]);

    // Get unique streams for filter
    const streams = [...new Set(executions.map(e => e.stream_name))];

    // Add computed fields to executions
    const executionsWithTime = executions.map(e => {
        const timeAgo = getTimeAgo(e.created_at);
        return {
            ...e,
            waiting_since: timeAgo.text,
            waiting_hours: timeAgo.hours,
        };
    });

    // Filter and sort
    const filteredExecutions = executionsWithTime
        .filter(e => filterStream === 'all' || e.stream_name === filterStream)
        .sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'waiting':
                    comparison = a.waiting_hours - b.waiting_hours;
                    break;
                case 'articles':
                    comparison = (a.article_count || 0) - (b.article_count || 0);
                    break;
                case 'stream':
                    comparison = a.stream_name.localeCompare(b.stream_name);
                    break;
                case 'created':
                    comparison = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
                    break;
            }
            return sortDirection === 'desc' ? -comparison : comparison;
        });

    // Stats
    const totalPending = executions.length;
    const urgentCount = executionsWithTime.filter(e => e.waiting_hours > 24).length;
    const curatedCount = executions.filter(e => e.has_curation_edits).length;

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(d => d === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const handleQuickApprove = async (execution: ExecutionQueueItem & { waiting_since: string; waiting_hours: number }) => {
        if (!execution.report_id) {
            console.error('No report_id for execution:', execution.execution_id);
            return;
        }

        setApproving(execution.report_id);
        try {
            await approveReport(execution.report_id);
            // Remove from list after successful approval
            setExecutions(prev => prev.filter(e => e.execution_id !== execution.execution_id));
        } catch (err) {
            console.error('Failed to approve report:', err);
            alert(`Failed to approve report: ${execution.report_name}`);
        } finally {
            setApproving(null);
        }
    };


    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
                <span className="ml-2 text-gray-500">Loading pending reports...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <ExclamationTriangleIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                        Report Approval Queue
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Review and approve reports before they're published
                    </p>
                </div>
                <button
                    onClick={() => fetchPendingReports()}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                    <ArrowPathIcon className="h-4 w-4" />
                    Refresh
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                            <DocumentTextIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{totalPending}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Awaiting Approval</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                            <ClockIcon className="h-6 w-6 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{urgentCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">Waiting &gt; 24 hours</p>
                        </div>
                    </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                            <PencilSquareIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-gray-900 dark:text-white">{curatedCount}</p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">With Curation Edits</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                    <FunnelIcon className="h-4 w-4 text-gray-400" />
                    <select
                        value={filterStream}
                        onChange={(e) => setFilterStream(e.target.value)}
                        className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    >
                        <option value="all">All Streams</option>
                        {streams.map(stream => (
                            <option key={stream} value={stream}>{stream}</option>
                        ))}
                    </select>
                </div>

                <div className="flex items-center gap-2 ml-auto text-sm text-gray-500 dark:text-gray-400">
                    Sort by:
                    <button
                        onClick={() => handleSort('waiting')}
                        className={`px-2 py-1 rounded ${sortField === 'waiting' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                        Wait Time {sortField === 'waiting' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </button>
                    <button
                        onClick={() => handleSort('articles')}
                        className={`px-2 py-1 rounded ${sortField === 'articles' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                        Articles {sortField === 'articles' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </button>
                    <button
                        onClick={() => handleSort('stream')}
                        className={`px-2 py-1 rounded ${sortField === 'stream' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                    >
                        Stream {sortField === 'stream' && (sortDirection === 'desc' ? '↓' : '↑')}
                    </button>
                </div>
            </div>

            {/* Reports List */}
            {filteredExecutions.length === 0 ? (
                <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <CheckCircleSolidIcon className="h-12 w-12 text-green-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-900 dark:text-white">All caught up!</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        No reports awaiting approval
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    {filteredExecutions.map((execution) => (
                        <div
                            key={execution.execution_id}
                            className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                        >
                            <div className="flex items-start justify-between">
                                {/* Left: Report Info */}
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-3">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                                            {execution.report_name || 'Unnamed Report'}
                                        </h3>
                                        {execution.has_curation_edits && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full">
                                                <PencilSquareIcon className="h-3 w-3" />
                                                Curated
                                            </span>
                                        )}
                                        {execution.waiting_hours > 24 && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded-full">
                                                <ClockIcon className="h-3 w-3" />
                                                Urgent
                                            </span>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 dark:text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <span className="font-medium text-gray-700 dark:text-gray-300">{execution.stream_name}</span>
                                        </span>
                                        <span>•</span>
                                        <span>{execution.article_count ?? 0} articles</span>
                                        {execution.filtered_out_count != null && execution.filtered_out_count > 0 && (
                                            <>
                                                <span>•</span>
                                                <span className="text-gray-400">{execution.filtered_out_count} filtered out</span>
                                            </>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-4 mt-2 text-sm">
                                        <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                            <ClockIcon className="h-4 w-4" />
                                            Waiting {execution.waiting_since}
                                        </span>
                                        {execution.last_curated_by && (
                                            <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400">
                                                <UserCircleIcon className="h-4 w-4" />
                                                Last curated by {execution.last_curated_by}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* Right: Actions */}
                                <div className="flex items-center gap-2 ml-4">
                                    <button
                                        onClick={() => handleQuickApprove(execution)}
                                        disabled={approving === execution.report_id}
                                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {approving === execution.report_id ? (
                                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                        ) : (
                                            <CheckCircleIcon className="h-4 w-4" />
                                        )}
                                        {approving === execution.report_id ? 'Approving...' : 'Quick Approve'}
                                    </button>
                                    <Link
                                        to={execution.report_id ? `/operations/reports/${execution.report_id}/curate` : `/operations/executions/${execution.execution_id}`}
                                        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                                    >
                                        <PencilSquareIcon className="h-4 w-4" />
                                        Review & Curate
                                        <ChevronRightIcon className="h-4 w-4" />
                                    </Link>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
