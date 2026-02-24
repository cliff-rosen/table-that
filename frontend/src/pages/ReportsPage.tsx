import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { DocumentTextIcon, ChevronDownIcon, ChevronRightIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

import { Report, ReportWithArticles, ReportArticle } from '../types';
import { ResearchStream, Category } from '../types';
import { PayloadHandler } from '../types/chat';

import { reportApi } from '../lib/api/reportApi';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { starringApi } from '../lib/api/starringApi';
import { getReportConfig, type ReportConfigResponse } from '../lib/api/curationApi';
import { showErrorToast } from '../lib/errorToast';
import {
    formatReportArticlesAsCSV,
    downloadCSV,
    generateReportPDF,
} from '../lib/utils/export';
import { useResearchStream } from '../context/ResearchStreamContext';
import { useAuth } from '../context/AuthContext';
import { useTracking } from '../hooks/useTracking';

import PipelineAnalyticsModal from '../components/stream/PipelineAnalyticsModal';
import RetrievalConfigModal from '../components/shared/RetrievalConfigModal';
import ArticleViewerModal from '../components/articles/ArticleViewerModal';
import ChatTray from '../components/chat/ChatTray';
import PubMedArticleCard, { PubMedArticleData } from '../components/chat/PubMedArticleCard';

import {
    ReportArticleTable,
    ReportStreamSelector,
    ReportSidebar,
    ReportHeader,
    ReportArticleCard,
    ReportView,
    CardFormat
} from '../components/reports';
import { getStanceInfo } from '../components/ui/StanceAnalysisDisplay';

export default function ReportsPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { researchStreams, loadResearchStreams } = useResearchStream();
    const { isPlatformAdmin, isOrgAdmin } = useAuth();
    const { track, trackViewChange, trackChatOpen, trackChatClose } = useTracking({ defaultContext: { page: 'reports' } });

    // Stream and report state
    const [selectedStream, setSelectedStream] = useState('');
    const [reports, setReports] = useState<Report[]>([]);
    const [selectedReport, setSelectedReport] = useState<ReportWithArticles | null>(null);
    const [streamDetails, setStreamDetails] = useState<ResearchStream | null>(null);

    // Loading state
    const [loadingReports, setLoadingReports] = useState(false);
    const [loadingReportDetails, setLoadingReportDetails] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // UI state
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const isAdmin = isPlatformAdmin || isOrgAdmin;
    const [reportView, setReportView] = useState<ReportView>(() => {
        const saved = localStorage.getItem('reportView');
        return (saved === 'all' || saved === 'by-category' || saved === 'tablizer') ? saved : 'by-category';
    });
    const [cardFormat, setCardFormat] = useState<CardFormat>('compact');

    // Reset tablizer view if user is not an admin (e.g., role was demoted)
    useEffect(() => {
        if (reportView === 'tablizer' && !isAdmin) {
            setReportView('by-category');
            localStorage.setItem('reportView', 'by-category');
        }
    }, [reportView, isAdmin]);
    const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
    const [collapsedSummaries, setCollapsedSummaries] = useState<Set<string>>(new Set());
    const [executiveSummaryCollapsed, setExecutiveSummaryCollapsed] = useState(false);

    // Modal state
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [showExecutionConfig, setShowExecutionConfig] = useState(false);
    const [configData, setConfigData] = useState<ReportConfigResponse | null>(null);
    const [configLoading, setConfigLoading] = useState(false);

    // Function to open config modal and fetch data
    const openConfigModal = async () => {
        if (!selectedReport?.report_id) return;

        setConfigLoading(true);
        setShowExecutionConfig(true);

        try {
            const data = await getReportConfig(selectedReport.report_id);
            setConfigData(data);
        } catch (err) {
            console.error('Failed to load config:', err);
        } finally {
            setConfigLoading(false);
        }
    };

    // Chat state
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Article viewer modal state
    const [articleViewerOpen, setArticleViewerOpen] = useState(false);
    const [articleViewerArticles, setArticleViewerArticles] = useState<ReportArticle[]>([]);
    const [articleViewerInitialIndex, setArticleViewerInitialIndex] = useState(0);
    const [articleViewerIsFiltered, setArticleViewerIsFiltered] = useState(false);

    // Favorites view state
    const [showingFavorites, setShowingFavorites] = useState(false);
    const [streamFavorites, setStreamFavorites] = useState<ReportArticle[]>([]);
    const [streamFavoritesCount, setStreamFavoritesCount] = useState(0);
    const [loadingFavorites, setLoadingFavorites] = useState(false);
  
    const hasStreams = researchStreams.length > 0;
    const hasPipelineData = selectedReport?.pipeline_execution_id != null;

    // Load favorites for the current stream
    const loadStreamFavorites = useCallback(async (streamId: number) => {
        setLoadingFavorites(true);
        try {
            const response = await starringApi.getStarredForStream(streamId);
            setStreamFavorites(response.articles);
            setStreamFavoritesCount(response.articles.length); // Update count
        } catch (err) {
            console.error('Failed to load favorites:', err);
            setStreamFavorites([]);
        } finally {
            setLoadingFavorites(false);
        }
    }, []);

    // Handle selecting the favorites view
    const handleSelectFavorites = useCallback(() => {
        if (!selectedStream) return;
        track('favorites_view', { stream_id: parseInt(selectedStream, 10) });
        setShowingFavorites(true);
        setSelectedReport(null);
        loadStreamFavorites(parseInt(selectedStream, 10));
    }, [selectedStream, track, loadStreamFavorites]);

    // Handle toggling star for an article
    const handleToggleStar = useCallback(async (articleId: number, reportIdOverride?: number) => {
        // Use override (for favorites view) or selected report
        const reportId = reportIdOverride || selectedReport?.report_id;
        if (!reportId) return;

        try {
            const response = await starringApi.toggleStar(reportId, articleId);

            // Update is_starred on the article in selectedReport
            if (selectedReport) {
                setSelectedReport(prev => prev ? {
                    ...prev,
                    articles: prev.articles?.map(article =>
                        article.article_id === articleId
                            ? { ...article, is_starred: response.is_starred }
                            : article
                    )
                } : null);
            }

            // Update is_starred in articleViewerArticles (for modal)
            setArticleViewerArticles(prev => prev.map(article =>
                article.article_id === articleId
                    ? { ...article, is_starred: response.is_starred }
                    : article
            ));

            // Update favorites count
            setStreamFavoritesCount(prev => response.is_starred ? prev + 1 : Math.max(0, prev - 1));

            // If in favorites view and unstarred, remove from list
            if (showingFavorites && !response.is_starred) {
                setStreamFavorites(prev => prev.filter(a => a.article_id !== articleId));
            }

            track('article_star_toggle', {
                article_id: articleId,
                report_id: reportId,
                is_starred: response.is_starred
            });
        } catch (err) {
            showErrorToast(err, 'Failed to update favorite');
        }
    }, [selectedReport, showingFavorites, track]);

    // Handle article updates from the modal (notes, enrichments)
    const handleArticleUpdate = useCallback((articleId: number, updates: { notes?: string; ai_enrichments?: any }) => {
        setArticleViewerArticles(prev => prev.map(article =>
            article.article_id === articleId ? { ...article, ...updates } : article
        ));

        if (selectedReport) {
            setSelectedReport(prev => prev ? {
                ...prev,
                articles: prev.articles?.map(article =>
                    article.article_id === articleId ? { ...article, ...updates } : article
                )
            } : null);
        }
    }, [selectedReport]);

    // Chat context for the general chat system
    // Only include report info if a stream is also selected (report belongs to stream)
    const chatContext = useMemo(() => {
        const context: Record<string, any> = { current_page: 'reports' };
        if (selectedStream) {
            context.stream_id = parseInt(selectedStream, 10);
            if (streamDetails) {
                context.stream_name = streamDetails.stream_name;
            }
            // Only include report info when we have a stream context
            if (selectedReport) {
                context.report_id = selectedReport.report_id;
                context.report_name = selectedReport.report_name;
                context.article_count = selectedReport.articles?.length || 0;
                // Include the current view mode so the LLM knows how the user is viewing the report
                context.report_view = reportView; // 'all', 'by-category', or 'tablizer'
            }
        }
        return context;
    }, [selectedReport, selectedStream, streamDetails, reportView]);

    // Payload handlers for ChatTray
    const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
        pubmed_article: {
            render: (data: PubMedArticleData) => <PubMedArticleCard article={data} />,
            renderOptions: {
                panelWidth: '550px',
                headerTitle: 'PubMed Article',
                headerIcon: '📄'
            }
        }
    }), []);

    // Load research streams on mount
    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    // Set selected stream from URL parameter
    useEffect(() => {
        const streamParam = searchParams.get('stream');
        if (streamParam) {
            setSelectedStream(streamParam);
        }
    }, [searchParams]);

    // Load stream details and reports when stream is selected
    useEffect(() => {
        if (selectedStream) {
            const loadStreamAndReports = async () => {
                setLoadingReports(true);
                setError(null);
                setReports([]);
                setSelectedReport(null);
                setStreamDetails(null);
                setShowingFavorites(false);
                setStreamFavoritesCount(0);
                try {
                    const stream = await researchStreamApi.getResearchStream(Number(selectedStream));
                    setStreamDetails(stream);

                    const streamReports = await reportApi.getReportsForStream(Number(selectedStream));
                    setReports(streamReports);

                    // Load favorites count for the stream
                    starringApi.getStarredCountForStream(Number(selectedStream))
                        .then(response => setStreamFavoritesCount(response.count))
                        .catch(() => setStreamFavoritesCount(0));

                    const reportParam = searchParams.get('report');
                    if (reportParam) {
                        const reportId = Number(reportParam);
                        const report = streamReports.find(r => r.report_id === reportId);
                        if (report) {
                            loadReportDetails(reportId);
                        } else if (streamReports.length > 0) {
                            loadReportDetails(streamReports[0].report_id);
                        }
                    } else if (streamReports.length > 0) {
                        loadReportDetails(streamReports[0].report_id);
                    }
                } catch (err: any) {
                    if (err.response?.status === 404) {
                        setError('no_reports');
                    } else {
                        setError('error');
                        showErrorToast(err, 'Failed to load reports');
                    }
                } finally {
                    setLoadingReports(false);
                }
            };
            loadStreamAndReports();
        }
    }, [selectedStream, searchParams]);

    const loadReportDetails = async (reportId: number) => {
        setLoadingReportDetails(true);
        setCollapsedCategories(new Set());
        setExecutiveSummaryCollapsed(false);
        try {
            const reportDetails = await reportApi.getReportWithArticles(reportId);
            setSelectedReport(reportDetails);
        } catch (err) {
            showErrorToast(err, 'Failed to load report');
        } finally {
            setLoadingReportDetails(false);
        }
    };

    // Handle article deep-link from URL parameter (only on initial load)
    const [articleDeepLinkHandled, setArticleDeepLinkHandled] = useState(false);
    useEffect(() => {
        // Only handle deep-link once per page load, not on every report change
        if (articleDeepLinkHandled) return;

        const articleParam = searchParams.get('article');
        if (articleParam && selectedReport?.articles) {
            const articleId = Number(articleParam);
            const articleIndex = selectedReport.articles.findIndex(a => a.article_id === articleId);
            if (articleIndex !== -1) {
                // Open article viewer modal with this article
                setArticleViewerArticles(selectedReport.articles);
                setArticleViewerInitialIndex(articleIndex);
                setArticleViewerIsFiltered(false);
                setArticleViewerOpen(true);
            }
            // Mark as handled and clear the URL param
            setArticleDeepLinkHandled(true);
            const newParams = new URLSearchParams(searchParams);
            newParams.delete('article');
            window.history.replaceState({}, '', `${window.location.pathname}?${newParams.toString()}`);
        }
    }, [selectedReport, searchParams, articleDeepLinkHandled]);

    const handleReportClick = (report: Report) => {
        track('report_select', { report_id: report.report_id, report_name: report.report_name });
        setShowingFavorites(false);
        setArticleViewerOpen(false); // Close modal when switching reports
        loadReportDetails(report.report_id);
    };

    const handleDeleteReport = async (reportId: number, reportName: string) => {
        if (!confirm(`Are you sure you want to delete "${reportName}"? This action cannot be undone.`)) {
            return;
        }

        track('report_delete', { report_id: reportId, report_name: reportName });

        try {
            await reportApi.deleteReport(reportId);
            const updatedReports = reports.filter(r => r.report_id !== reportId);
            setReports(updatedReports);

            if (selectedReport?.report_id === reportId) {
                if (updatedReports.length > 0) {
                    loadReportDetails(updatedReports[0].report_id);
                } else {
                    setSelectedReport(null);
                }
            }
        } catch (err) {
            showErrorToast(err, 'Failed to delete report');
        }
    };

    const handleStreamChange = (streamId: string) => {
        setSelectedStream(streamId);
        if (streamId) {
            const stream = researchStreams.find(s => s.stream_id.toString() === streamId);
            track('stream_select', { stream_id: parseInt(streamId, 10), stream_name: stream?.stream_name });
        }
    };

    const handleViewChange = (view: ReportView) => {
        if (reportView !== view) {
            trackViewChange(reportView, view, 'reports');
            setReportView(view);
            localStorage.setItem('reportView', view);
        }
    };

    const handleCardFormatChange = (format: CardFormat) => {
        if (cardFormat !== format) {
            track('card_format_change', { from: cardFormat, to: format });
            setCardFormat(format);
        }
    };

    const openArticleViewer = (articles: ReportArticle[], clickedIndex: number, isFiltered = false) => {
        const article = articles[clickedIndex];
        track('article_open', {
            pmid: article.pmid || undefined,
            article_id: article.article_id,
            report_id: selectedReport?.report_id,
            is_filtered: isFiltered
        });
        setArticleViewerArticles(articles);
        setArticleViewerInitialIndex(clickedIndex);
        setArticleViewerIsFiltered(isFiltered);
        setArticleViewerOpen(true);
    };

    const toggleCategory = (categoryId: string) => {
        setCollapsedCategories(prev => {
            const newSet = new Set(prev);
            const willCollapse = !newSet.has(categoryId);
            if (newSet.has(categoryId)) {
                newSet.delete(categoryId);
            } else {
                newSet.add(categoryId);
            }
            track('category_toggle', { category: categoryId, collapsed: willCollapse });
            return newSet;
        });
    };

    // Helper function to organize articles by category
    const getArticlesByCategory = () => {
        if (!selectedReport || !streamDetails) return {};

        const categories = streamDetails.presentation_config?.categories || [];
        const categoryMap: Record<string, { category: Category; articles: ReportArticle[] }> = {};

        categories.forEach(cat => {
            categoryMap[cat.id] = { category: cat, articles: [] };
        });

        categoryMap['uncategorized'] = {
            category: { id: 'uncategorized', name: 'Uncategorized', topics: [], specific_inclusions: [] },
            articles: []
        };

        selectedReport.articles?.forEach(article => {
            if (!article.presentation_categories || article.presentation_categories.length === 0) {
                categoryMap['uncategorized'].articles.push(article);
            } else {
                const catId = article.presentation_categories[0];
                if (categoryMap[catId]) {
                    categoryMap[catId].articles.push(article);
                }
            }
        });

        return Object.fromEntries(
            Object.entries(categoryMap).filter(([_, data]) => data.articles.length > 0)
        );
    };

    // Render empty states
    const renderEmptyState = () => {
        if (!hasStreams) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Research Streams Created
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-2xl mx-auto">
                        You need to create a research stream before reports can be generated.
                    </p>
                </div>
            );
        }

        if (!selectedStream) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Select a Research Stream
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        Choose a research stream above to view its reports.
                    </p>
                </div>
            );
        }

        if (loadingReports) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                    <p className="text-gray-600 dark:text-gray-400">Loading reports...</p>
                </div>
            );
        }

        if (error === 'error') {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <div className="text-red-500 text-5xl mb-4">⚠️</div>
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Unable to Load Reports
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400 mb-6">
                        We couldn't connect to the server. Please check your connection and try again.
                    </p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            );
        }

        if (error === 'no_reports' || reports.length === 0) {
            return (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        No Reports Yet
                    </h3>
                    <p className="text-gray-600 dark:text-gray-400">
                        No reports have been generated for this research stream yet.
                    </p>
                </div>
            );
        }

        return null;
    };

    // Render Tablizer (always mounted to preserve state, hidden when not active)
    const renderTablizer = () => {
        if (!selectedReport?.articles || selectedReport.articles.length === 0) return null;

        return (
            <div className={reportView !== 'tablizer' ? 'hidden' : ''}>
                <ReportArticleTable
                    articles={selectedReport.articles}
                    title={selectedReport.report_name}
                    cardFormat={cardFormat}
                    onCardFormatChange={setCardFormat}
                    onRowClick={(articles, index, isFiltered) => openArticleViewer(articles, index, isFiltered)}
                />
            </div>
        );
    };

    // Render other report views (conditionally rendered - state not preserved)
    const renderReportContent = () => {
        if (!selectedReport?.articles || selectedReport.articles.length === 0) return null;

        // Tablizer is rendered separately to preserve state
        if (reportView === 'tablizer') {
            return null;
        }

        if (reportView === 'by-category') {
            return (
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        Articles by Category ({selectedReport.articles.length})
                    </h3>
                    <div className="space-y-6">
                        {Object.entries(getArticlesByCategory()).map(([categoryId, data]) => {
                            const isCollapsed = collapsedCategories.has(categoryId);
                            return (
                                <div key={categoryId} className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                    <button
                                        onClick={() => toggleCategory(categoryId)}
                                        className="w-full bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                {isCollapsed ? (
                                                    <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                ) : (
                                                    <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                )}
                                                <h4 className="font-semibold text-gray-900 dark:text-white">
                                                    {data.category.name}
                                                </h4>
                                            </div>
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                {data.articles.length} article{data.articles.length !== 1 ? 's' : ''}
                                            </span>
                                        </div>
                                    </button>
                                    {!isCollapsed && (
                                        <div className="bg-white dark:bg-gray-900">
                                            {selectedReport.enrichments?.category_summaries?.[categoryId] && (
                                                <div className="border-b border-gray-200 dark:border-gray-700">
                                                    <button
                                                        onClick={() => setCollapsedSummaries(prev => {
                                                            const next = new Set(prev);
                                                            next.has(categoryId) ? next.delete(categoryId) : next.add(categoryId);
                                                            return next;
                                                        })}
                                                        className="w-full flex items-center gap-1.5 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                                                    >
                                                        {collapsedSummaries.has(categoryId) ? (
                                                            <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                                        ) : (
                                                            <ChevronDownIcon className="h-3.5 w-3.5 text-gray-400 dark:text-gray-500 flex-shrink-0" />
                                                        )}
                                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                            Category Summary
                                                        </span>
                                                    </button>
                                                    {!collapsedSummaries.has(categoryId) && (
                                                        <div className="px-4 pb-3">
                                                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 ml-5">
                                                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                                    {selectedReport.enrichments.category_summaries[categoryId]}
                                                                </p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="p-4 space-y-3">
                                                {data.articles.map((article) => {
                                                    // Find the article's index in the full list so navigation works across all articles
                                                    const fullIndex = selectedReport.articles.findIndex(a => a.article_id === article.article_id);
                                                    return (
                                                        <ReportArticleCard
                                                            key={article.article_id}
                                                            article={article}
                                                            cardFormat={cardFormat}
                                                            onClick={() => openArticleViewer(selectedReport.articles, fullIndex)}
                                                            isStarred={article.is_starred ?? false}
                                                            onToggleStar={() => handleToggleStar(article.article_id)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }

        // Default: 'all' view
        return (
            <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                    Articles ({selectedReport.articles.length})
                </h3>
                <div className="space-y-3">
                    {selectedReport.articles.map((article, idx) => (
                        <ReportArticleCard
                            key={article.article_id}
                            article={article}
                            cardFormat={cardFormat}
                            onClick={() => openArticleViewer(selectedReport.articles, idx)}
                            isStarred={article.is_starred ?? false}
                            onToggleStar={() => handleToggleStar(article.article_id)}
                        />
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex">
            {/* Chat Tray */}
            <ChatTray
                initialContext={chatContext}
                payloadHandlers={payloadHandlers}
                hidden={articleViewerOpen}
                isOpen={isChatOpen}
                onOpenChange={(open) => {
                    if (!open) trackChatClose('reports');
                    setIsChatOpen(open);
                }}
            />

            {/* Main Content */}
            <div className="flex-1 overflow-y-auto p-6 relative">
                {/* Chat toggle button */}
                {!isChatOpen && !articleViewerOpen && (
                    <button
                        onClick={() => {
                            trackChatOpen('reports');
                            setIsChatOpen(true);
                        }}
                        className="fixed bottom-6 left-6 z-40 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                        title="Open chat"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}

                {/* Page Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Reports
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-2">
                            Generated reports from your research streams
                        </p>
                    </div>
                </div>

                {/* Stream Selector */}
                {hasStreams && (
                    <ReportStreamSelector
                        researchStreams={researchStreams}
                        selectedStream={selectedStream}
                        onStreamChange={handleStreamChange}
                        onRunPipeline={() => {
                            track('pipeline_run_click', { stream_id: parseInt(selectedStream, 10) });
                            navigate(`/streams/${selectedStream}/edit?tab=execute&subtab=pipeline`);
                        }}
                        showRunPipeline={!!selectedStream && (isPlatformAdmin || isOrgAdmin)}
                    />
                )}

                {/* Empty States or Report Content */}
                {renderEmptyState() || (
                    <div className="flex gap-6">
                        {/* Report List Sidebar */}
                        <ReportSidebar
                            reports={reports}
                            selectedReportId={selectedReport?.report_id || null}
                            collapsed={sidebarCollapsed}
                            onToggleCollapse={() => {
                                track('sidebar_toggle', { collapsed: !sidebarCollapsed });
                                setSidebarCollapsed(!sidebarCollapsed);
                            }}
                            onSelectReport={handleReportClick}
                            onDeleteReport={isAdmin ? handleDeleteReport : undefined}
                            starredCount={streamFavoritesCount}
                            showStarredSelected={showingFavorites}
                            onSelectStarred={handleSelectFavorites}
                        />

                        {/* Report Details or Favorites */}
                        <div className="flex-1 min-w-0">
                            {showingFavorites ? (
                                /* Favorites View */
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                                    <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                            Favorites
                                        </h2>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            Your favorite articles from this stream
                                        </p>
                                    </div>
                                    <div className="p-6">
                                        {loadingFavorites ? (
                                            <div className="text-center py-8">
                                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                                <p className="text-gray-600 dark:text-gray-400">Loading favorites...</p>
                                            </div>
                                        ) : streamFavorites.length === 0 ? (
                                            <div className="text-center py-8">
                                                <p className="text-gray-600 dark:text-gray-400">
                                                    No favorites yet. Star articles from reports to add them here.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {streamFavorites.map((article, idx) => (
                                                    <div
                                                        key={`${article.report_id}-${article.article_id}`}
                                                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-md transition-all"
                                                        onClick={() => {
                                                            // FavoriteArticle is a superset of ReportArticle, use directly
                                                            setArticleViewerArticles(streamFavorites);
                                                            setArticleViewerInitialIndex(idx);
                                                            setArticleViewerIsFiltered(false);
                                                            setArticleViewerOpen(true);
                                                        }}
                                                    >
                                                        <div className="flex items-start gap-4">
                                                            <div className="flex-1 min-w-0">
                                                                <h4 className="font-medium text-blue-600 dark:text-blue-400 mb-1">
                                                                    {article.title}
                                                                </h4>
                                                                {article.authors && article.authors.length > 0 && (
                                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                                                        {article.authors.slice(0, 3).join(', ')}
                                                                        {article.authors.length > 3 && ` et al.`}
                                                                    </p>
                                                                )}
                                                                <div className="flex flex-wrap gap-2 text-xs text-gray-500 dark:text-gray-500">
                                                                    {article.journal && <span>{article.journal}</span>}
                                                                    {article.pub_year && <span>• {article.pub_year}</span>}
                                                                    {article.pmid && <span>• PMID: {article.pmid}</span>}
                                                                </div>
                                                                {/* Show AI summary preview if available */}
                                                                {article.ai_summary && (
                                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                                                                        {article.ai_summary}
                                                                    </p>
                                                                )}
                                                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                                                    <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded">
                                                                        {article.report_name}
                                                                    </span>
                                                                    {/* Show stance badge if available */}
                                                                    {article.ai_enrichments?.stance_analysis && (() => {
                                                                        const stanceInfo = getStanceInfo(article.ai_enrichments.stance_analysis.stance);
                                                                        const StanceIcon = stanceInfo.icon;
                                                                        return (
                                                                            <span className={`text-xs px-2 py-0.5 rounded flex items-center gap-1 ${stanceInfo.bgColor} ${stanceInfo.color}`}>
                                                                                <StanceIcon className="h-3 w-3" />
                                                                                {stanceInfo.label}
                                                                            </span>
                                                                        );
                                                                    })()}
                                                                </div>
                                                            </div>
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleStar(article.article_id, article.report_id);
                                                                }}
                                                                className="p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                                                                title="Remove from favorites"
                                                            >
                                                                <svg className="h-5 w-5 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 24 24">
                                                                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
                                                                </svg>
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : loadingReportDetails ? (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                    <p className="text-gray-600 dark:text-gray-400">Loading report details...</p>
                                </div>
                            ) : selectedReport ? (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                                    {/* Report Header */}
                                    <ReportHeader
                                        report={selectedReport}
                                        reportView={reportView}
                                        cardFormat={cardFormat}
                                        hasPipelineData={hasPipelineData}
                                        showAdminControls={isPlatformAdmin}
                                        showTablizer={isAdmin}
                                        showDelete={isAdmin}
                                        onViewChange={handleViewChange}
                                        onCardFormatChange={handleCardFormatChange}
                                        onShowExecutionConfig={() => {
                                            track('execution_config_open', { report_id: selectedReport.report_id });
                                            openConfigModal();
                                        }}
                                        onShowAnalytics={() => {
                                            track('analytics_open', { report_id: selectedReport.report_id });
                                            setShowAnalytics(true);
                                        }}
                                        onDeleteReport={() => handleDeleteReport(selectedReport.report_id, selectedReport.report_name)}
                                        onExportCSV={() => {
                                            track('export_csv', { report_id: selectedReport.report_id });
                                            const csv = formatReportArticlesAsCSV(selectedReport.articles);
                                            const safeName = selectedReport.report_name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                                            downloadCSV(csv, `report-${safeName}.csv`);
                                        }}
                                        onExportPDF={() => {
                                            track('export_pdf', { report_id: selectedReport.report_id });
                                            const safeName = selectedReport.report_name.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                                            generateReportPDF(selectedReport, `report-${safeName}.pdf`);
                                        }}
                                    />

                                    {/* Report Content */}
                                    <div className="p-6 space-y-6">
                                        {/* Executive Summary */}
                                        {selectedReport.enrichments?.executive_summary && (
                                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                                <button
                                                    onClick={() => {
                                                        track('executive_summary_toggle', { collapsed: !executiveSummaryCollapsed });
                                                        setExecutiveSummaryCollapsed(!executiveSummaryCollapsed);
                                                    }}
                                                    className="w-full bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-750 transition-colors text-left"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {executiveSummaryCollapsed ? (
                                                            <ChevronRightIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                        ) : (
                                                            <ChevronDownIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                                                        )}
                                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                            Executive Summary
                                                        </h3>
                                                    </div>
                                                </button>
                                                {!executiveSummaryCollapsed && (
                                                    <div className="bg-gray-50 dark:bg-gray-700 p-4">
                                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                            {selectedReport.enrichments.executive_summary}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Key Highlights */}
                                        {selectedReport.key_highlights && selectedReport.key_highlights.length > 0 && (
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                    Key Highlights
                                                </h3>
                                                <ul className="list-disc list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                                                    {selectedReport.key_highlights.map((highlight, idx) => (
                                                        <li key={idx}>{highlight}</li>
                                                    ))}
                                                </ul>
                                            </div>
                                        )}

                                        {/* Thematic Analysis */}
                                        {selectedReport.thematic_analysis && (
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                                    Thematic Analysis
                                                </h3>
                                                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                        {selectedReport.thematic_analysis}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Articles */}
                                        {renderTablizer()}
                                        {renderReportContent()}
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                                    <DocumentTextIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                                    <p className="text-gray-600 dark:text-gray-400">
                                        Select a report from the list to view details
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Pipeline Analytics Modal */}
                {showAnalytics && selectedReport && (
                    <PipelineAnalyticsModal
                        reportId={selectedReport.report_id}
                        onClose={() => setShowAnalytics(false)}
                    />
                )}

                {/* Execution Config Modal */}
                {showExecutionConfig && selectedReport && (
                    <RetrievalConfigModal
                        subtitle={selectedReport.report_name}
                        config={configData?.retrieval_config || {}}
                        startDate={configData?.start_date}
                        endDate={configData?.end_date}
                        reportId={selectedReport.report_id}
                        enrichmentConfig={configData?.enrichment_config}
                        llmConfig={configData?.llm_config}
                        loading={configLoading}
                        onClose={() => {
                            setShowExecutionConfig(false);
                            setConfigData(null);
                        }}
                    />
                )}

                {/* Article Viewer Modal */}
                {articleViewerOpen && articleViewerArticles.length > 0 && (
                    <ArticleViewerModal
                        articles={articleViewerArticles}
                        initialIndex={articleViewerInitialIndex}
                        onClose={() => setArticleViewerOpen(false)}
                        chatContext={chatContext}
                        chatPayloadHandlers={payloadHandlers}
                        onArticleUpdate={handleArticleUpdate}
                        isFiltered={articleViewerIsFiltered}
                        reportTitle={selectedReport?.report_name}
                        onToggleStar={handleToggleStar}
                    />
                )}
            </div>
        </div>
    );
}
