import { useState, useEffect } from 'react';
import {
  EnvelopeIcon,
  XMarkIcon,
  CalendarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  PaperAirplaneIcon,
  TrashIcon,
  PlayIcon
} from '@heroicons/react/24/outline';
import {
  getEmailQueue,
  getApprovedReportsForEmail,
  getReportSubscribers,
  scheduleEmails,
  cancelEmail,
  processEmailQueue,
  type EmailQueueEntry,
  type ReportEmailQueueStatus,
  type ApprovedReportInfo,
  type SubscriberInfo
} from '../../lib/api/operationsApi';

const STATUS_COLORS: Record<ReportEmailQueueStatus, string> = {
  scheduled: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  ready: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  processing: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  sent: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
};

const STATUS_ICONS: Record<ReportEmailQueueStatus, React.ComponentType<{ className?: string }>> = {
  scheduled: CalendarIcon,
  ready: ClockIcon,
  processing: ArrowPathIcon,
  sent: CheckCircleIcon,
  failed: XCircleIcon,
};

export function EmailQueueList() {
  const [entries, setEntries] = useState<EmailQueueEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<ReportEmailQueueStatus | ''>('');
  const [offset, setOffset] = useState(0);
  const limit = 25;

  // Schedule modal state
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [reports, setReports] = useState<ApprovedReportInfo[]>([]);
  const [selectedReportId, setSelectedReportId] = useState<number | null>(null);
  const [subscribers, setSubscribers] = useState<SubscriberInfo[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [scheduledFor, setScheduledFor] = useState('');
  const [isScheduling, setIsScheduling] = useState(false);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState(false);
  const [subscriberError, setSubscriberError] = useState<string | null>(null);

  // Process queue state
  const [isProcessing, setIsProcessing] = useState(false);

  // Helper to extract error message from axios errors
  const getErrorMessage = (err: unknown, fallback: string): string => {
    const axiosError = err as { response?: { data?: { detail?: string } } };
    if (axiosError.response?.data?.detail) {
      return axiosError.response.data.detail;
    }
    if (err instanceof Error) {
      return err.message;
    }
    return fallback;
  };

  // Load queue entries
  const loadEntries = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await getEmailQueue({
        status_filter: statusFilter || undefined,
        limit,
        offset,
      });
      setEntries(response.entries);
      setTotal(response.total);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load email queue'));
    } finally {
      setIsLoading(false);
    }
  };

  // Load approved reports for modal
  const loadReports = async () => {
    try {
      const data = await getApprovedReportsForEmail();
      setReports(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
    }
  };

  // Load subscribers when report is selected
  const loadSubscribers = async (reportId: number) => {
    setIsLoadingSubscribers(true);
    setSubscriberError(null);
    try {
      const data = await getReportSubscribers(reportId);
      setSubscribers(data);
      setSelectedUserIds([]); // Reset selection
    } catch (err) {
      console.error('Failed to load subscribers:', err);
      setSubscribers([]);
      setSubscriberError(getErrorMessage(err, 'Failed to load subscribers'));
    } finally {
      setIsLoadingSubscribers(false);
    }
  };

  useEffect(() => {
    loadEntries();
  }, [statusFilter, offset]);

  // Handle opening schedule modal
  const openScheduleModal = () => {
    setShowScheduleModal(true);
    setSelectedReportId(null);
    setSubscribers([]);
    setSelectedUserIds([]);
    setScheduledFor(new Date().toISOString().split('T')[0]); // Default to today
    loadReports();
  };

  // Handle report selection
  const handleReportSelect = (reportId: number) => {
    setSelectedReportId(reportId);
    setSubscriberError(null);
    loadSubscribers(reportId);
  };

  // Handle select all subscribers
  const handleSelectAll = () => {
    if (selectedUserIds.length === subscribers.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(subscribers.map(s => s.user_id));
    }
  };

  // Handle individual subscriber toggle
  const handleToggleSubscriber = (userId: number) => {
    setSelectedUserIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  };

  // Handle schedule submission
  const handleSchedule = async () => {
    if (!selectedReportId || selectedUserIds.length === 0 || !scheduledFor) {
      return;
    }

    setIsScheduling(true);
    setError(null);
    try {
      const result = await scheduleEmails({
        report_id: selectedReportId,
        user_ids: selectedUserIds,
        scheduled_for: scheduledFor,
      });

      setShowScheduleModal(false);
      loadEntries(); // Refresh the list

      // Show success message
      alert(`Scheduled ${result.scheduled_count} emails. ${result.skipped_count > 0 ? `Skipped ${result.skipped_count} (duplicates or no email).` : ''}`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to schedule emails'));
    } finally {
      setIsScheduling(false);
    }
  };

  // Handle cancel email
  const handleCancel = async (entryId: number) => {
    if (!confirm('Are you sure you want to cancel this scheduled email?')) {
      return;
    }

    setError(null);
    try {
      await cancelEmail(entryId);
      loadEntries(); // Refresh
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to cancel email'));
    }
  };

  // Handle process queue (run now)
  const handleProcessQueue = async () => {
    if (!confirm('This will send all scheduled emails that are due. Continue?')) {
      return;
    }

    setIsProcessing(true);
    setError(null);
    try {
      const result = await processEmailQueue();
      loadEntries(); // Refresh

      // Show result
      let message = `Processed ${result.total_processed} emails: ${result.sent_count} sent, ${result.failed_count} failed.`;
      if (result.errors.length > 0) {
        message += `\n\nErrors:\n${result.errors.slice(0, 5).join('\n')}`;
        if (result.errors.length > 5) {
          message += `\n...and ${result.errors.length - 5} more`;
        }
      }
      alert(message);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to process email queue'));
    } finally {
      setIsProcessing(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString();
  };

  const formatDateTime = (dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Email Queue</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Manage scheduled report email delivery
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleProcessQueue}
            disabled={isProcessing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isProcessing ? (
              <>
                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <PlayIcon className="h-5 w-5" />
                Process Queue
              </>
            )}
          </button>
          <button
            onClick={openScheduleModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
          >
            <PaperAirplaneIcon className="h-5 w-5" />
            Schedule Emails
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Status:</label>
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value as ReportEmailQueueStatus | '');
            setOffset(0);
          }}
          className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        >
          <option value="">All Statuses</option>
          <option value="scheduled">Scheduled</option>
          <option value="ready">Ready</option>
          <option value="processing">Processing</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
        </select>

        <button
          onClick={loadEntries}
          className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-md transition-colors"
        >
          <ArrowPathIcon className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
          {error}
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        </div>
      ) : entries.length === 0 ? (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <EnvelopeIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>No email queue entries found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Report
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Recipient
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Scheduled For
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Sent At
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {entries.map((entry) => {
                const StatusIcon = STATUS_ICONS[entry.status];
                return (
                  <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[entry.status]}`}>
                        <StatusIcon className="h-3.5 w-3.5" />
                        {entry.status}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {entry.report_name || `Report #${entry.report_id}`}
                      </div>
                      {entry.stream_name && (
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {entry.stream_name}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900 dark:text-white">
                        {entry.user_full_name || 'Unknown'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {entry.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {formatDate(entry.scheduled_for)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {entry.sent_at ? formatDateTime(entry.sent_at) : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {(entry.status === 'scheduled' || entry.status === 'ready') && (
                        <button
                          onClick={() => handleCancel(entry.id)}
                          className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          title="Cancel"
                        >
                          <TrashIcon className="h-5 w-5" />
                        </button>
                      )}
                      {entry.status === 'failed' && entry.error_message && (
                        <span
                          className="text-red-600 dark:text-red-400 cursor-help"
                          title={entry.error_message}
                        >
                          <XCircleIcon className="h-5 w-5" />
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Showing {offset + 1} - {Math.min(offset + limit, total)} of {total}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={offset === 0}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={offset + limit >= total}
              className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl h-[calc(100vh-4rem)] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Schedule Report Emails
              </h3>
              <button
                onClick={() => setShowScheduleModal(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                <XMarkIcon className="h-6 w-6" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6 flex flex-col gap-6">
              {/* Report Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Select Report
                </label>
                <select
                  value={selectedReportId || ''}
                  onChange={(e) => handleReportSelect(parseInt(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                >
                  <option value="">Choose a report...</option>
                  {reports.map((report) => (
                    <option key={report.report_id} value={report.report_id}>
                      {report.report_name} {report.stream_name ? `(${report.stream_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Scheduled Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Scheduled For
                </label>
                <input
                  type="date"
                  value={scheduledFor}
                  onChange={(e) => setScheduledFor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>

              {/* Subscribers */}
              {selectedReportId && (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                      Select Recipients ({selectedUserIds.length} selected)
                    </label>
                    <button
                      onClick={handleSelectAll}
                      className="text-sm text-purple-600 hover:text-purple-700 dark:text-purple-400"
                    >
                      {selectedUserIds.length === subscribers.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  {isLoadingSubscribers ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                    </div>
                  ) : subscriberError ? (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                      {subscriberError}
                    </div>
                  ) : subscribers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                      No subscribers found for this report's stream
                    </div>
                  ) : (
                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg flex-1 overflow-y-auto">
                      {subscribers.map((sub) => (
                        <label
                          key={sub.user_id}
                          className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer border-b border-gray-100 dark:border-gray-700 last:border-0"
                        >
                          <input
                            type="checkbox"
                            checked={selectedUserIds.includes(sub.user_id)}
                            onChange={() => handleToggleSubscriber(sub.user_id)}
                            className="h-4 w-4 text-purple-600 rounded border-gray-300 focus:ring-purple-500"
                          />
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {sub.full_name || 'Unknown'}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {sub.email} {sub.org_name && `- ${sub.org_name}`}
                            </div>
                          </div>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => setShowScheduleModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSchedule}
                disabled={!selectedReportId || selectedUserIds.length === 0 || !scheduledFor || isScheduling}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isScheduling ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Scheduling...
                  </>
                ) : (
                  <>
                    <PaperAirplaneIcon className="h-4 w-4" />
                    Schedule {selectedUserIds.length} Email{selectedUserIds.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
