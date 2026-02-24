import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { useResearchStream } from '../context/ResearchStreamContext';
import { reportApi } from '../lib/api/reportApi';
import { starringApi } from '../lib/api/starringApi';
import { trackEvent } from '../lib/api/trackingApi';
import { showErrorToast } from '../lib/errorToast';
import { Report } from '../types';
import { ReportArticle } from '../types/report';
import { StarIcon } from '@heroicons/react/24/solid';
import { formatArticleDate } from '../utils/dateUtils';

export default function DashboardPage() {
    const { user, isPlatformAdmin, isOrgAdmin } = useAuth();
    const { researchStreams, loadResearchStreams, isLoading } = useResearchStream();
    const [recentReports, setRecentReports] = useState<Report[]>([]);
    const [reportsLoading, setReportsLoading] = useState(true);
    const [reportsError, setReportsError] = useState(false);
    const [starredArticles, setStarredArticles] = useState<ReportArticle[]>([]);
    const [starredLoading, setStarredLoading] = useState(true);
    const navigate = useNavigate();

    const canCreateStream = isPlatformAdmin || isOrgAdmin;

    useEffect(() => {
        loadResearchStreams();
        setReportsLoading(true);
        reportApi.getRecentReports(15)
            .then(setRecentReports)
            .catch((err) => {
                showErrorToast(err, 'Failed to load recent reports');
                setReportsError(true);
            })
            .finally(() => setReportsLoading(false));

        // Load recently starred articles
        setStarredLoading(true);
        starringApi.getAllStarred(5)
            .then(response => setStarredArticles(response.articles))
            .catch(err => console.error('Failed to load starred articles:', err))
            .finally(() => setStarredLoading(false));
    }, [loadResearchStreams]);

    // Get stream name by ID
    const getStreamName = (streamId: number | null) => {
        if (streamId === null) return 'Unknown Stream';
        const stream = researchStreams.find(s => s.stream_id === streamId);
        return stream?.stream_name || 'Unknown Stream';
    };

    const handleReportClick = (report: Report) => {
        trackEvent('dashboard_report_click', { report_id: report.report_id, stream_id: report.research_stream_id });
        navigate(`/reports?stream=${report.research_stream_id}&report=${report.report_id}`);
    };

    const handleStarredArticleClick = (article: ReportArticle) => {
        trackEvent('dashboard_starred_article_click', { article_id: article.article_id, report_id: article.report_id });
        navigate(`/reports?stream=${article.stream_id}&report=${article.report_id}&article=${article.article_id}`);
    };

    return (
        <div className="h-[calc(100vh-4rem)] overflow-y-auto p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-8">
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                        Dashboard
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400 mt-2">
                        Welcome back, {user?.email}
                    </p>
                </div>

                {/* Loading state */}
                {(isLoading || reportsLoading) && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                        <div className="flex items-center justify-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                        </div>
                    </div>
                )}

                {/* Error state */}
                {reportsError && !reportsLoading && (
                    <div className="mb-6 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <div className="text-red-500 text-xl">⚠️</div>
                            <div>
                                <h3 className="font-medium text-red-800 dark:text-red-200">
                                    Unable to load reports
                                </h3>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                                >
                                    Retry
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Empty state - no streams yet */}
                {!isLoading && !reportsLoading && researchStreams.length === 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">
                        <div className="text-center py-12">
                            <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
                                Welcome to Knowledge Horizon
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                                {canCreateStream
                                    ? 'Create your first research stream to start monitoring the information that matters to your business.'
                                    : 'No research streams have been configured yet. Contact your administrator to set up research streams.'}
                            </p>
                            {canCreateStream && (
                                <button
                                    onClick={() => {
                                        trackEvent('dashboard_quick_action', { action: 'create_stream' });
                                        navigate('/new-stream');
                                    }}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                                >
                                    Create Research Stream
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* Favorites Section - always show when streams exist */}
                {!isLoading && !starredLoading && researchStreams.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow mb-6">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <div className="flex items-center gap-2">
                                <StarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                    Recent Favorites
                                </h2>
                            </div>
                        </div>
                        {starredArticles.length === 0 ? (
                            <div className="px-6 py-8 text-center">
                                <p className="text-gray-500 dark:text-gray-400">
                                    Your favorite articles will appear here. Star articles from reports to add them to your favorites.
                                </p>
                            </div>
                        ) : (
                            <div className="divide-y divide-gray-200 dark:divide-gray-700">
                                {starredArticles.map((article) => (
                                    <div
                                        key={`${article.report_id}-${article.article_id}`}
                                        onClick={() => handleStarredArticleClick(article)}
                                        className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                                    >
                                        <div className="flex items-start gap-3">
                                            <StarIcon className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" />
                                            <div className="flex-1 min-w-0">
                                                <h3 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                                    {article.title}
                                                </h3>
                                                <div className="flex flex-wrap gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                    {article.journal && <span>{article.journal}</span>}
                                                    {article.pub_year && (
                                                        <span>• {formatArticleDate(article.pub_year, article.pub_month, article.pub_day)}</span>
                                                    )}
                                                    <span>• {article.stream_name}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Recent Reports Table */}
                {!isLoading && !reportsLoading && !reportsError && researchStreams.length > 0 && (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                Recent Reports
                            </h2>
                            <button
                                onClick={() => {
                                    trackEvent('dashboard_quick_action', { action: 'view_all_reports' });
                                    navigate('/reports');
                                }}
                                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                            >
                                View All Reports
                            </button>
                        </div>

                        {recentReports.length === 0 ? (
                            <div className="text-center py-12">
                                <p className="text-gray-600 dark:text-gray-400">
                                    No reports generated yet
                                </p>
                                <button
                                    onClick={() => {
                                        trackEvent('dashboard_quick_action', { action: 'view_streams' });
                                        navigate('/streams');
                                    }}
                                    className="mt-4 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                >
                                    View Research Streams
                                </button>
                            </div>
                        ) : (
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-700">
                                        <tr>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Report
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Research Stream
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Report Date
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Coverage Period
                                            </th>
                                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                Articles
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                                        {recentReports.map((report) => {
                                            const coveragePeriod = report.coverage_start_date && report.coverage_end_date
                                                ? `${new Date(report.coverage_start_date).toLocaleDateString()} - ${new Date(report.coverage_end_date).toLocaleDateString()}`
                                                : '-';

                                            return (
                                                <tr
                                                    key={report.report_id}
                                                    onClick={() => handleReportClick(report)}
                                                    className="hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer transition-colors"
                                                >
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                                            {report.report_name || `Report ${report.report_id}`}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-600 dark:text-gray-300">
                                                            {getStreamName(report.research_stream_id)}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            {new Date(report.report_date).toLocaleDateString()}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            {coveragePeriod}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                                                            {report.article_count || 0} articles
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
