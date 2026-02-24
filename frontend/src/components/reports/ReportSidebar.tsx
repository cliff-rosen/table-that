import { ChevronLeftIcon, ChevronRightIcon, TrashIcon } from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { Report } from '../../types';

export interface ReportSidebarProps {
    reports: Report[];
    selectedReportId: number | null;
    collapsed: boolean;
    onToggleCollapse: () => void;
    onSelectReport: (report: Report) => void;
    onDeleteReport?: (reportId: number, reportName: string) => void;
    starredCount?: number;
    showStarredSelected?: boolean;
    onSelectStarred?: () => void;
}

export default function ReportSidebar({
    reports,
    selectedReportId,
    collapsed,
    onToggleCollapse,
    onSelectReport,
    onDeleteReport,
    starredCount = 0,
    showStarredSelected = false,
    onSelectStarred
}: ReportSidebarProps) {
    return (
        <div className={`transition-all duration-300 ${collapsed ? 'w-12' : 'w-80'} flex-shrink-0`}>
            <div className="sticky top-6">
                {/* Collapse/Expand Button */}
                <button
                    onClick={onToggleCollapse}
                    className="w-full mb-4 flex items-center justify-center p-2 bg-white dark:bg-gray-800 rounded-lg shadow hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    {collapsed ? (
                        <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    ) : (
                        <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                    )}
                </button>

                {/* Reports List */}
                {!collapsed && (
                    <div className="space-y-4">
                        {/* Favorites Link - at top */}
                        {onSelectStarred && (
                            <div
                                onClick={onSelectStarred}
                                className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer transition-all group ${
                                    showStarredSelected
                                        ? 'ring-2 ring-blue-600'
                                        : 'hover:shadow-md'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <StarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                    <h3 className="font-semibold text-gray-900 dark:text-white">
                                        Favorites
                                    </h3>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                    {starredCount} article{starredCount !== 1 ? 's' : ''}
                                </p>
                            </div>
                        )}

                        {/* Reports */}
                        {reports.map((report) => (
                            <div
                                key={report.report_id}
                                className={`bg-white dark:bg-gray-800 rounded-lg shadow p-4 cursor-pointer transition-all group ${
                                    selectedReportId === report.report_id && !showStarredSelected
                                        ? 'ring-2 ring-blue-600'
                                        : 'hover:shadow-md'
                                }`}
                            >
                                <div
                                    onClick={() => onSelectReport(report)}
                                    className="flex-1"
                                >
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-gray-900 dark:text-white">
                                                {report.report_name}
                                            </h3>
                                            {report.approval_status !== 'approved' && (
                                                <span className={`inline-flex items-center mt-1 px-1.5 py-0.5 text-[10px] font-semibold rounded ${
                                                    report.approval_status === 'awaiting_approval'
                                                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                                }`}>
                                                    {report.approval_status === 'awaiting_approval' ? 'Awaiting Approval' : 'Rejected'}
                                                </span>
                                            )}
                                        </div>
                                        {onDeleteReport && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onDeleteReport(report.report_id, report.report_name);
                                                }}
                                                className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-all"
                                                title="Delete report"
                                            >
                                                <TrashIcon className="h-4 w-4" />
                                            </button>
                                        )}
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {report.article_count || 0} articles
                                    </p>
                                    {report.retrieval_params?.start_date && report.retrieval_params?.end_date && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                            {new Date(report.retrieval_params.start_date).toLocaleDateString()} - {new Date(report.retrieval_params.end_date).toLocaleDateString()}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
