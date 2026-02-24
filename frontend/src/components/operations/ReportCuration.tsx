/**
 * Report Curation View
 *
 * Real implementation of the curation experience for reviewing
 * and approving reports. Features:
 * - Report content editing (title, summaries)
 * - Article curation (include/exclude, categorize)
 * - Approval/rejection workflow
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeftIcon,
    CheckIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    PencilIcon,
    ArrowPathIcon,
    DocumentTextIcon,
    PlusIcon,
    MinusIcon,
    ArrowTopRightOnSquareIcon,
    ExclamationCircleIcon,
    EnvelopeIcon,
    ChatBubbleLeftIcon,
    CheckCircleIcon,
    ArrowUturnLeftIcon,
    Cog6ToothIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import { reportApi } from '../../lib/api/reportApi';
import {
    getCurationView,
    updateReportContent,
    excludeArticle,
    includeArticle,
    resetCuration,
    updateArticleInReport,
    updateWipArticleCurationNotes,
    approveReport,
    rejectReport,
    sendApprovalRequest,
    regenerateExecutiveSummary,
    regenerateCategorySummary,
    regenerateArticleSummary,
    CurationViewResponse,
    CurationIncludedArticle,
    CurationFilteredArticle,
    CurationCategory,
} from '../../lib/api/curationApi';
import RetrievalConfigModal from '../shared/RetrievalConfigModal';
import { getYearString } from '../../utils/dateUtils';

type ArticleTab = 'included' | 'filtered_out' | 'curated';

export default function ReportCuration() {
    const { reportId } = useParams<{ reportId: string }>();
    const navigate = useNavigate();

    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [approving, setApproving] = useState(false);
    const [undoing, setUndoing] = useState<number | null>(null);

    const [curationData, setCurationData] = useState<CurationViewResponse | null>(null);
    const [editedName, setEditedName] = useState<string>('');
    const [editedSummary, setEditedSummary] = useState<string>('');
    const [editedCategorySummaries, setEditedCategorySummaries] = useState<Record<string, string>>({});

    const [activeTab, setActiveTab] = useState<ArticleTab>('included');
    const [contentExpanded, setContentExpanded] = useState(false);
    const [editingTitle, setEditingTitle] = useState(false);
    const [editingSummary, setEditingSummary] = useState<string | null>(null);
    const [expandedArticle, setExpandedArticle] = useState<number | null>(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [rejectReason, setRejectReason] = useState('');
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [showEmailModal, setShowEmailModal] = useState(false);
    // Toggle between article list and full report preview in Included tab
    const [includedViewMode, setIncludedViewMode] = useState<'list' | 'preview'>('list');

    // Track which article is being processed (for loading indicators)
    const [processingArticleId, setProcessingArticleId] = useState<number | null>(null);
    // Track which article is having its category changed
    const [savingCategoryArticleId, setSavingCategoryArticleId] = useState<number | null>(null);

    // Regeneration state
    const [regeneratingExecutiveSummary, setRegeneratingExecutiveSummary] = useState(false);
    const [regeneratingCategoryId, setRegeneratingCategoryId] = useState<string | null>(null);

    // Fetch curation data
    // isInitialLoad controls whether to show loading spinner (only on first load)
    const fetchCurationData = useCallback(async (isInitialLoad = false) => {
        if (!reportId) return;

        // Only show loading spinner on initial load, not on refreshes
        if (isInitialLoad) {
            setLoading(true);
        }
        setError(null);
        try {
            const data = await getCurationView(parseInt(reportId));
            setCurationData(data);
            // Only update edited values on initial load to preserve user edits
            if (isInitialLoad) {
                setEditedName(data.report.report_name);
                setEditedSummary(data.report.executive_summary || '');
                setEditedCategorySummaries(data.report.category_summaries || {});
            }
        } catch (err) {
            console.error('Failed to fetch curation data:', err);
            if (isInitialLoad) {
                setError('Failed to load report for curation');
            }
        } finally {
            if (isInitialLoad) {
                setLoading(false);
            }
        }
    }, [reportId]);

    useEffect(() => {
        fetchCurationData(true); // Initial load - show loading spinner
    }, [fetchCurationData]);

    // Check if AI summaries have been modified (not title - that saves immediately)
    const hasSummaryChanges = curationData && (
        editedSummary !== (curationData.report.executive_summary || '') ||
        JSON.stringify(editedCategorySummaries) !== JSON.stringify(curationData.report.category_summaries || {})
    );

    // Save report title immediately
    const handleSaveTitle = async () => {
        if (!reportId || !curationData) return;

        const newName = editedName.trim();
        if (!newName) {
            alert('Title cannot be empty');
            return;
        }
        if (newName === curationData.report.report_name) {
            setEditingTitle(false);
            return;
        }

        setSaving(true);
        try {
            await updateReportContent(parseInt(reportId), {
                report_name: newName,
            });
            // Update local state to match what was saved
            setEditedName(newName);
            await fetchCurationData();
            setEditingTitle(false);
        } catch (err) {
            console.error('Failed to save title:', err);
            alert('Failed to save title');
        } finally {
            setSaving(false);
        }
    };

    // Save AI summary changes
    const handleSaveSummaries = async () => {
        if (!reportId || !curationData) return;

        setSaving(true);
        try {
            await updateReportContent(parseInt(reportId), {
                executive_summary: editedSummary !== curationData.report.executive_summary ? editedSummary : undefined,
                category_summaries: JSON.stringify(editedCategorySummaries) !== JSON.stringify(curationData.report.category_summaries || {})
                    ? editedCategorySummaries
                    : undefined,
            });
            // Refresh data
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to save summaries:', err);
            alert('Failed to save changes');
        } finally {
            setSaving(false);
        }
    };

    // Exclude an article
    const handleExcludeArticle = async (article: CurationIncludedArticle) => {
        if (!reportId || !article.article_id) return;

        setProcessingArticleId(article.article_id);
        try {
            // For curator-added articles, use resetCuration to undo the add
            // For pipeline-included articles, use excludeArticle to soft exclude
            if (article.curator_added && article.wip_article_id) {
                await resetCuration(parseInt(reportId), article.wip_article_id);
            } else {
                await excludeArticle(parseInt(reportId), article.article_id);
            }
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to exclude article:', err);
            alert('Failed to exclude article');
        } finally {
            setProcessingArticleId(null);
        }
    };

    // Include a filtered article
    const handleIncludeArticle = async (article: CurationFilteredArticle, categoryId?: string) => {
        if (!reportId) return;

        setProcessingArticleId(article.wip_article_id);
        try {
            // For curator-excluded articles (pipeline included, then manually excluded),
            // use resetCuration to restore to pipeline's original decision
            // For truly filtered articles, use includeArticle to add them
            if (article.curator_excluded) {
                await resetCuration(parseInt(reportId), article.wip_article_id);
            } else {
                await includeArticle(parseInt(reportId), article.wip_article_id, categoryId);
            }
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to include article:', err);
            alert('Failed to include article');
        } finally {
            setProcessingArticleId(null);
        }
    };

    // Reset curation - restore article to pipeline's original decision
    const handleResetCuration = async (curatedArticle: CurationFilteredArticle) => {
        if (!reportId) return;

        setUndoing(curatedArticle.wip_article_id);
        try {
            const result = await resetCuration(parseInt(reportId), curatedArticle.wip_article_id);
            if (!result.reset) {
                console.log('Nothing to reset:', result.message);
            }
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to reset curation:', err);
            alert('Failed to undo curation');
        } finally {
            setUndoing(null);
        }
    };

    // Handle category change for an article
    const handleCategoryChange = async (article: CurationIncludedArticle, newCategoryId: string) => {
        if (!reportId) return;

        setSavingCategoryArticleId(article.article_id);
        try {
            await updateArticleInReport(parseInt(reportId), article.article_id, {
                category: newCategoryId
            });
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to update article category:', err);
            alert('Failed to update article category');
        } finally {
            setSavingCategoryArticleId(null);
        }
    };

    // Handle AI summary update for an article
    const handleSaveAiSummary = async (articleId: number, aiSummary: string) => {
        if (!reportId) return;

        try {
            await updateArticleInReport(parseInt(reportId), articleId, {
                ai_summary: aiSummary
            });
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to update AI summary:', err);
            alert('Failed to update AI summary');
        }
    };

    // Handle saving curation notes (stored on WipArticle - single source of truth)
    const handleSaveCurationNotes = async (wipArticleId: number, notes: string) => {
        if (!reportId) return;

        try {
            await updateWipArticleCurationNotes(
                parseInt(reportId),
                wipArticleId,
                notes
            );
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to save notes:', err);
            alert('Failed to save notes');
        }
    };

    // Regenerate executive summary
    const handleRegenerateExecutiveSummary = async () => {
        if (!reportId) return;

        setRegeneratingExecutiveSummary(true);
        try {
            const result = await regenerateExecutiveSummary(parseInt(reportId));
            setEditedSummary(result.executive_summary);
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to regenerate executive summary:', err);
            alert('Failed to regenerate executive summary');
        } finally {
            setRegeneratingExecutiveSummary(false);
        }
    };

    // Regenerate category summary
    const handleRegenerateCategorySummary = async (categoryId: string) => {
        if (!reportId) return;

        setRegeneratingCategoryId(categoryId);
        try {
            const result = await regenerateCategorySummary(parseInt(reportId), categoryId);
            setEditedCategorySummaries(prev => ({
                ...prev,
                [categoryId]: result.category_summary
            }));
            await fetchCurationData();
        } catch (err) {
            console.error('Failed to regenerate category summary:', err);
            alert('Failed to regenerate category summary');
        } finally {
            setRegeneratingCategoryId(null);
        }
    };

    // Regenerate article AI summary
    const handleRegenerateArticleSummary = async (articleId: number) => {
        if (!reportId) return;

        try {
            const result = await regenerateArticleSummary(parseInt(reportId), articleId);
            await fetchCurationData();
            return result.ai_summary;
        } catch (err) {
            console.error('Failed to regenerate article summary:', err);
            alert('Failed to regenerate article summary');
            throw err;
        }
    };

    // Approve report
    const handleApprove = async () => {
        if (!reportId) return;

        setApproving(true);
        try {
            await approveReport(parseInt(reportId));
            navigate('/operations/approvals');
        } catch (err) {
            console.error('Failed to approve report:', err);
            alert('Failed to approve report');
        } finally {
            setApproving(false);
        }
    };

    // Reject report
    const handleReject = async () => {
        if (!reportId || !rejectReason.trim()) return;

        setApproving(true);
        try {
            await rejectReport(parseInt(reportId), rejectReason);
            navigate('/operations/approvals');
        } catch (err) {
            console.error('Failed to reject report:', err);
            alert('Failed to reject report');
        } finally {
            setApproving(false);
            setShowRejectModal(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full">
                <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
                <span className="ml-2 text-gray-500">Loading curation view...</span>
            </div>
        );
    }

    if (error || !curationData) {
        return (
            <div className="flex flex-col items-center justify-center h-full">
                <ExclamationCircleIcon className="h-12 w-12 text-red-400 mb-4" />
                <p className="text-red-600 dark:text-red-400">{error || 'Failed to load report'}</p>
                <Link
                    to="/operations/approvals"
                    className="mt-4 text-blue-600 hover:underline"
                >
                    Back to Approvals
                </Link>
            </div>
        );
    }

    const report = curationData.report;
    const categories = curationData.categories;
    const includedArticles = curationData.included_articles;
    const filteredArticles = curationData.filtered_articles;
    const stats = curationData.stats;

    // Build categories with article counts from included articles
    const categoriesWithCounts = categories.map(cat => {
        const count = includedArticles.filter(a =>
            a.presentation_categories?.includes(cat.id)
        ).length;
        return { ...cat, article_count: count };
    });

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
            {/* Header */}
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link
                            to="/operations/approvals"
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                                    Review & Curate Report
                                </h1>
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                    report.approval_status === 'awaiting_approval'
                                        ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
                                        : report.approval_status === 'approved'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                        : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                }`}>
                                    {report.approval_status === 'awaiting_approval' ? 'Awaiting Approval' :
                                     report.approval_status === 'approved' ? 'Approved' : 'Rejected'}
                                </span>
                                {report.has_curation_edits && (
                                    <span className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full">
                                        Has Edits
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {curationData.stream_name} &bull; {report.report_date || 'No date'}
                                {(curationData.start_date || curationData.end_date) && (
                                    <span className="ml-3 text-gray-400">
                                        Run period: {curationData.start_date || '?'} to {curationData.end_date || '?'}
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Utility buttons - icon only, subtle */}
                        {curationData.retrieval_config && (
                            <button
                                type="button"
                                onClick={() => setShowConfigModal(true)}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                title="View run configuration"
                            >
                                <Cog6ToothIcon className="h-5 w-5" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setShowEmailModal(true)}
                            className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            title="Email options"
                        >
                            <EnvelopeIcon className="h-5 w-5" />
                        </button>

                        {/* Primary actions - Reject and Approve (only shown when awaiting approval) */}
                        {report.approval_status === 'awaiting_approval' && (
                            <>
                                {/* Divider */}
                                <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />

                                <button
                                    type="button"
                                    onClick={() => setShowRejectModal(true)}
                                    disabled={approving}
                                    className="px-4 py-2 text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-medium disabled:opacity-50"
                                >
                                    Reject
                                </button>
                                <button
                                    type="button"
                                    onClick={handleApprove}
                                    disabled={approving}
                                    className="px-5 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center gap-2 disabled:opacity-50"
                                >
                                    {approving ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <CheckIcon className="h-4 w-4" />
                                    )}
                                    {approving ? 'Approving...' : 'Approve'}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-6 space-y-6">
                {/* Report Title - Elevated above AI Summaries */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Report Title
                        </label>
                    </div>
                    {editingTitle ? (
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editedName}
                                onChange={(e) => setEditedName(e.target.value)}
                                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveTitle();
                                    if (e.key === 'Escape') {
                                        setEditedName(report.report_name);
                                        setEditingTitle(false);
                                    }
                                }}
                            />
                            <button
                                type="button"
                                onClick={handleSaveTitle}
                                disabled={saving}
                                className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                title="Save title"
                            >
                                {saving ? (
                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                ) : (
                                    <CheckIcon className="h-4 w-4" />
                                )}
                            </button>
                        </div>
                    ) : (
                        <div
                            onClick={() => setEditingTitle(true)}
                            className="flex items-center justify-between px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-600"
                        >
                            <span className="text-lg font-medium text-gray-900 dark:text-white">{editedName || 'Untitled Report'}</span>
                            <PencilIcon className="h-4 w-4 text-gray-400" />
                        </div>
                    )}
                </div>

                {/* AI Summaries Section - Collapsible */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <button
                        type="button"
                        onClick={() => setContentExpanded(!contentExpanded)}
                        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    >
                        <div className="flex items-center gap-2">
                            <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                            <span className="font-semibold text-gray-900 dark:text-white">AI Summaries</span>
                            {hasSummaryChanges && (
                                <span className="px-2 py-0.5 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 rounded">
                                    Unsaved
                                </span>
                            )}
                        </div>
                        {contentExpanded ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                        ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                        )}
                    </button>

                    {contentExpanded && (
                        <div className="border-t border-gray-200 dark:border-gray-700 p-4 space-y-6">
                            {/* Executive Summary */}
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Executive Summary
                                    </label>
                                    <div className="flex items-center gap-2">
                                        {editedSummary !== (report.executive_summary || '') && (
                                            <span className="text-xs text-blue-600 dark:text-blue-400">Modified</span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={handleRegenerateExecutiveSummary}
                                            disabled={regeneratingExecutiveSummary}
                                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 disabled:opacity-50"
                                        >
                                            <ArrowPathIcon className={`h-3 w-3 ${regeneratingExecutiveSummary ? 'animate-spin' : ''}`} />
                                            {regeneratingExecutiveSummary ? 'Regenerating...' : 'Regenerate'}
                                        </button>
                                    </div>
                                </div>
                                {editingSummary === 'executive' ? (
                                    <div className="space-y-2">
                                        <textarea
                                            value={editedSummary}
                                            onChange={(e) => setEditedSummary(e.target.value)}
                                            rows={6}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setEditingSummary(null)}
                                            className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                        >
                                            Done
                                        </button>
                                    </div>
                                ) : (
                                    <div
                                        onClick={() => setEditingSummary('executive')}
                                        className="px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg cursor-pointer hover:border-blue-300 dark:hover:border-blue-600 group"
                                    >
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                            {editedSummary || 'No executive summary'}
                                        </p>
                                        <div className="mt-2 text-xs text-gray-400 group-hover:text-blue-500 flex items-center gap-1">
                                            <PencilIcon className="h-3 w-3" />
                                            Click to edit
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Category Summaries */}
                            {categoriesWithCounts.length > 0 && (
                                <div>
                                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 block">
                                        Category Summaries
                                    </label>
                                    <div className="space-y-3">
                                        {categoriesWithCounts.map((cat) => {
                                            const originalSummary = report.category_summaries?.[cat.id] || '';
                                            const editedCatSummary = editedCategorySummaries[cat.id] || '';
                                            const isEditing = editingSummary === cat.id;

                                            return (
                                                <div key={cat.id} className="border border-gray-200 dark:border-gray-700 rounded-lg">
                                                    <div className="flex items-center justify-between px-3 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
                                                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                            {cat.name}
                                                            <span className="ml-2 text-gray-500 font-normal">({cat.article_count} articles)</span>
                                                        </span>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRegenerateCategorySummary(cat.id)}
                                                            disabled={regeneratingCategoryId === cat.id}
                                                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1 disabled:opacity-50"
                                                        >
                                                            <ArrowPathIcon className={`h-3 w-3 ${regeneratingCategoryId === cat.id ? 'animate-spin' : ''}`} />
                                                            {regeneratingCategoryId === cat.id ? 'Regenerating...' : 'Regenerate'}
                                                        </button>
                                                    </div>
                                                    {isEditing ? (
                                                        <div className="p-3 space-y-2">
                                                            <textarea
                                                                value={editedCatSummary}
                                                                onChange={(e) => setEditedCategorySummaries(prev => ({
                                                                    ...prev,
                                                                    [cat.id]: e.target.value
                                                                }))}
                                                                rows={4}
                                                                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                                            />
                                                            <button
                                                                type="button"
                                                                onClick={() => setEditingSummary(null)}
                                                                className="px-3 py-1 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700"
                                                            >
                                                                Done
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div
                                                            onClick={() => setEditingSummary(cat.id)}
                                                            className="px-3 py-2 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                                        >
                                                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                                                {editedCatSummary || originalSummary || 'No summary - click to add'}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Save Summaries Button */}
                            {hasSummaryChanges && (
                                <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-gray-700">
                                    <button
                                        type="button"
                                        onClick={handleSaveSummaries}
                                        disabled={saving}
                                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        {saving && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                                        {saving ? 'Saving...' : 'Save Summaries'}
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Articles Section */}
                <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between">
                            <h2 className="font-semibold text-gray-900 dark:text-white">Articles</h2>
                            {/* Pipeline Stats - Original vs Current */}
                            <div className="flex items-center gap-6 text-sm">
                                {/* Original Pipeline Stats */}
                                <div className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
                                    <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500 mr-2">Pipeline:</span>
                                    <span className="font-medium text-gray-700 dark:text-gray-300" title="Total articles retrieved">
                                        {stats.pipeline_included + stats.pipeline_filtered + stats.pipeline_duplicates}
                                    </span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-gray-500" title={`${stats.pipeline_duplicates} duplicates removed`}>
                                        -{stats.pipeline_duplicates} dup
                                    </span>
                                    <span className="text-gray-400">→</span>
                                    <span className="text-gray-500" title={`${stats.pipeline_filtered} filtered out`}>
                                        -{stats.pipeline_filtered} filt
                                    </span>
                                    <span className="text-gray-400">→</span>
                                    <span className="font-medium text-gray-700 dark:text-gray-300" title="Pipeline included">
                                        {stats.pipeline_included}
                                    </span>
                                </div>
                                {/* Curator Changes */}
                                {(stats.curator_added > 0 || stats.curator_removed > 0) && (
                                    <>
                                        <div className="h-4 w-px bg-gray-300 dark:bg-gray-600" />
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-medium uppercase tracking-wide text-gray-400 dark:text-gray-500">Curated:</span>
                                            {stats.curator_added > 0 && (
                                                <span className="text-green-600 dark:text-green-400">+{stats.curator_added}</span>
                                            )}
                                            {stats.curator_removed > 0 && (
                                                <span className="text-red-600 dark:text-red-400">−{stats.curator_removed}</span>
                                            )}
                                            <span className="text-gray-300 dark:text-gray-600">→</span>
                                            <span className="font-medium text-gray-700 dark:text-gray-300">{stats.current_included} current</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex items-center gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => setActiveTab('included')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'included'
                                        ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Included
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-green-200 dark:bg-green-800 text-green-800 dark:text-green-200">
                                    {includedArticles.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('filtered_out')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'filtered_out'
                                        ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Filtered Out
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                                    {filteredArticles.length}
                                </span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('curated')}
                                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                                    activeTab === 'curated'
                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                            >
                                Curated
                                <span className="ml-2 px-1.5 py-0.5 text-xs rounded-full bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
                                    {curationData.curated_articles.length}
                                </span>
                            </button>

                            {/* View toggle for Included tab */}
                            {activeTab === 'included' && (
                                <>
                                    <div className="flex-1" />
                                    <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
                                        <button
                                            type="button"
                                            onClick={() => setIncludedViewMode('list')}
                                            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                                includedViewMode === 'list'
                                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                            }`}
                                        >
                                            List
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setIncludedViewMode('preview')}
                                            className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                                                includedViewMode === 'preview'
                                                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                                                    : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                                            }`}
                                        >
                                            Report Preview
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Article List */}
                    <div className="p-4 space-y-3">
                        {/* Included tab - List view grouped by category */}
                        {activeTab === 'included' && includedViewMode === 'list' && (() => {
                            // Group articles by category
                            const articlesByCategory = categories.map(cat => ({
                                ...cat,
                                articles: includedArticles.filter(a =>
                                    a.presentation_categories?.includes(cat.id)
                                ),
                            })).filter(cat => cat.articles.length > 0);

                            // Find uncategorized articles
                            const uncategorizedArticles = includedArticles.filter(a =>
                                !a.presentation_categories || a.presentation_categories.length === 0
                            );

                            // Track global ranking across categories
                            let globalRank = 0;

                            return (
                                <div className="space-y-6">
                                    {/* Categorized articles */}
                                    {articlesByCategory.map((cat) => (
                                        <div key={cat.id}>
                                            {/* Category header */}
                                            <div className="flex items-center gap-3 mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
                                                <h3 className="font-semibold text-gray-900 dark:text-white">
                                                    {cat.name}
                                                </h3>
                                                <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full">
                                                    {cat.articles.length} article{cat.articles.length !== 1 ? 's' : ''}
                                                </span>
                                            </div>
                                            {/* Articles in this category */}
                                            <div className="space-y-3">
                                                {cat.articles.map((article) => {
                                                    globalRank++;
                                                    return (
                                                        <IncludedArticleCard
                                                            key={article.article_id}
                                                            article={article}
                                                            ranking={globalRank}
                                                            categories={categories}
                                                            expanded={expandedArticle === article.article_id}
                                                            isProcessing={processingArticleId === article.article_id}
                                                            isSavingCategory={savingCategoryArticleId === article.article_id}
                                                            onToggleExpand={() => setExpandedArticle(expandedArticle === article.article_id ? null : article.article_id)}
                                                            onExclude={() => handleExcludeArticle(article)}
                                                            onCategoryChange={(newCat) => handleCategoryChange(article, newCat)}
                                                            onSaveNotes={article.wip_article_id ? (notes) => handleSaveCurationNotes(article.wip_article_id!, notes) : undefined}
                                                            onSaveAiSummary={(summary) => handleSaveAiSummary(article.article_id, summary)}
                                                            onRegenerateAiSummary={() => handleRegenerateArticleSummary(article.article_id)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}

                                    {/* Uncategorized articles */}
                                    {uncategorizedArticles.length > 0 && (
                                        <div>
                                            {/* Uncategorized header */}
                                            <div className="flex items-center gap-3 mb-3 pb-2 border-b border-amber-200 dark:border-amber-800">
                                                <h3 className="font-semibold text-amber-700 dark:text-amber-300">
                                                    Uncategorized
                                                </h3>
                                                <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full">
                                                    {uncategorizedArticles.length} article{uncategorizedArticles.length !== 1 ? 's' : ''} need categorization
                                                </span>
                                            </div>
                                            {/* Uncategorized articles */}
                                            <div className="space-y-3">
                                                {uncategorizedArticles.map((article) => {
                                                    globalRank++;
                                                    return (
                                                        <IncludedArticleCard
                                                            key={article.article_id}
                                                            article={article}
                                                            ranking={globalRank}
                                                            categories={categories}
                                                            expanded={expandedArticle === article.article_id}
                                                            isProcessing={processingArticleId === article.article_id}
                                                            isSavingCategory={savingCategoryArticleId === article.article_id}
                                                            onToggleExpand={() => setExpandedArticle(expandedArticle === article.article_id ? null : article.article_id)}
                                                            onExclude={() => handleExcludeArticle(article)}
                                                            onCategoryChange={(newCat) => handleCategoryChange(article, newCat)}
                                                            onSaveNotes={article.wip_article_id ? (notes) => handleSaveCurationNotes(article.wip_article_id!, notes) : undefined}
                                                            onSaveAiSummary={(summary) => handleSaveAiSummary(article.article_id, summary)}
                                                            onRegenerateAiSummary={() => handleRegenerateArticleSummary(article.article_id)}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Included tab - Report Preview */}
                        {activeTab === 'included' && includedViewMode === 'preview' && (
                            <ReportPreviewContent
                                report={report}
                                categories={categories}
                                includedArticles={includedArticles}
                                editedName={editedName}
                                editedSummary={editedSummary}
                                editedCategorySummaries={editedCategorySummaries}
                            />
                        )}

                        {activeTab === 'filtered_out' && [...filteredArticles]
                            .sort((a, b) => (b.filter_score ?? 0) - (a.filter_score ?? 0))
                            .map((article) => (
                            <FilteredArticleCard
                                key={article.wip_article_id}
                                article={article}
                                categories={categories}
                                expanded={expandedArticle === article.wip_article_id}
                                isProcessing={processingArticleId === article.wip_article_id}
                                onToggleExpand={() => setExpandedArticle(expandedArticle === article.wip_article_id ? null : article.wip_article_id)}
                                onInclude={(categoryId) => handleIncludeArticle(article, categoryId)}
                                onSaveNotes={(notes) => handleSaveCurationNotes(article.wip_article_id, notes)}
                            />
                        ))}

                        {activeTab === 'curated' && (
                            curationData.curated_articles.length === 0 ? (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <CheckCircleIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                    <p>No manual changes yet</p>
                                    <p className="text-sm mt-1">Articles you include or exclude will appear here</p>
                                </div>
                            ) : (
                                curationData.curated_articles.map((article) => {
                                    const isIncluded = article.curator_included;
                                    const isUndoing = undoing === article.wip_article_id;
                                    const pubmedUrl = article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : null;

                                    return (
                                        <div key={article.wip_article_id} className="p-4 border border-blue-200 dark:border-blue-800 rounded-lg bg-blue-50 dark:bg-blue-900/20">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                                                            isIncluded
                                                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                                : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                        }`}>
                                                            {isIncluded ? 'Manually Included' : 'Manually Excluded'}
                                                        </span>
                                                    </div>
                                                    {pubmedUrl ? (
                                                        <a
                                                            href={pubmedUrl}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1 group"
                                                        >
                                                            {article.title}
                                                            <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                                        </a>
                                                    ) : (
                                                        <h4 className="font-medium text-gray-900 dark:text-white">
                                                            {article.title}
                                                        </h4>
                                                    )}
                                                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                        {article.authors?.join(', ')} &bull; {article.journal} &bull; {getYearString(article.pub_year)}
                                                        {article.pmid && (
                                                            <span className="ml-2 text-gray-400">PMID: {article.pmid}</span>
                                                        )}
                                                    </p>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => handleResetCuration(article)}
                                                    disabled={isUndoing}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-white dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Reset to pipeline's original decision"
                                                >
                                                    {isUndoing ? (
                                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <ArrowUturnLeftIcon className="h-4 w-4" />
                                                    )}
                                                    {isUndoing ? 'Resetting...' : 'Undo'}
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })
                            )
                        )}

                        {activeTab === 'included' && includedArticles.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No articles included in this report
                            </div>
                        )}

                        {activeTab === 'filtered_out' && filteredArticles.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                No filtered articles
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Reject Modal */}
            {showRejectModal && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md">
                        <div className="p-6">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                Reject Report
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                Please provide a reason for rejecting this report.
                            </p>
                            <textarea
                                value={rejectReason}
                                onChange={(e) => setRejectReason(e.target.value)}
                                placeholder="Enter rejection reason..."
                                rows={4}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                            />
                        </div>
                        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                            <button
                                type="button"
                                onClick={() => setShowRejectModal(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleReject}
                                disabled={!rejectReason.trim() || approving}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                                {approving ? 'Rejecting...' : 'Reject Report'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Email Modal */}
            {showEmailModal && (
                <EmailModal
                    reportId={parseInt(reportId!)}
                    reportName={editedName}
                    streamName={curationData.stream_name}
                    articleCount={includedArticles.length}
                    onClose={() => setShowEmailModal(false)}
                />
            )}

            {/* Retrieval Config Modal */}
            {showConfigModal && curationData.retrieval_config && (
                <RetrievalConfigModal
                    config={curationData.retrieval_config as Record<string, unknown>}
                    startDate={curationData.start_date}
                    endDate={curationData.end_date}
                    reportId={parseInt(reportId!)}
                    enrichmentConfig={curationData.enrichment_config}
                    llmConfig={curationData.llm_config}
                    articleCurationNotes={includedArticles.map(a => ({
                        article_id: a.article_id,
                        pmid: a.pmid,
                        title: a.title,
                        curation_notes: a.curation_notes,
                        curator_added: a.curator_added
                    }))}
                    onClose={() => setShowConfigModal(false)}
                />
            )}
        </div>
    );
}

// Inline Report Preview Content (for Included tab preview mode)
function ReportPreviewContent({
    report,
    categories,
    includedArticles,
    editedName,
    editedSummary,
    editedCategorySummaries,
}: {
    report: { report_name: string; report_date: string | null };
    categories: CurationCategory[];
    includedArticles: CurationIncludedArticle[];
    editedName: string;
    editedSummary: string;
    editedCategorySummaries: Record<string, string>;
}) {
    // Group articles by category
    const articlesByCategory = categories.map(cat => ({
        ...cat,
        articles: includedArticles.filter(a => a.presentation_categories?.includes(cat.id)),
        summary: editedCategorySummaries[cat.id] || '',
    })).filter(cat => cat.articles.length > 0);

    // Find uncategorized articles
    const uncategorizedArticles = includedArticles.filter(a =>
        !a.presentation_categories || a.presentation_categories.length === 0
    );

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {/* Report Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-600 to-blue-700 rounded-t-lg">
                <h1 className="text-xl font-bold text-white">
                    {editedName || report.report_name}
                </h1>
                <p className="text-blue-100 text-sm mt-1">
                    {report.report_date || 'No date'}
                </p>
            </div>

            {/* Executive Summary */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    Executive Summary
                </h2>
                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                    {editedSummary || 'No executive summary'}
                </p>
            </div>

            {/* Categories with Articles */}
            {articlesByCategory.map((cat) => (
                <div key={cat.id} className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                        {cat.name}
                        <span className="ml-2 text-sm font-normal text-gray-500">
                            ({cat.articles.length} articles)
                        </span>
                    </h2>
                    {cat.summary && (
                        <p className="text-gray-600 dark:text-gray-400 mb-3 text-sm">
                            {cat.summary}
                        </p>
                    )}
                    <div className="space-y-3">
                        {cat.articles.map((article, idx) => (
                            <div key={article.article_id} className="pl-3 border-l-2 border-blue-200 dark:border-blue-800">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                    {idx + 1}. {article.title}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {article.authors?.join(', ')} &bull; {article.journal} &bull; {getYearString(article.pub_year)}
                                </p>
                                {article.ai_summary && (
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        {article.ai_summary}
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* Uncategorized Articles */}
            {uncategorizedArticles.length > 0 && (
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-amber-50 dark:bg-amber-900/10">
                    <h2 className="text-base font-semibold text-amber-800 dark:text-amber-200 mb-2">
                        Uncategorized
                        <span className="ml-2 text-sm font-normal text-amber-600 dark:text-amber-400">
                            ({uncategorizedArticles.length} articles need categorization)
                        </span>
                    </h2>
                    <div className="space-y-3">
                        {uncategorizedArticles.map((article, idx) => (
                            <div key={article.article_id} className="pl-3 border-l-2 border-amber-300 dark:border-amber-700">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                    {idx + 1}. {article.title}
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                    {article.authors?.join(', ')} &bull; {article.journal} &bull; {getYearString(article.pub_year)}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Footer */}
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-900/50 text-center text-xs text-gray-500 dark:text-gray-400 rounded-b-lg">
                Generated by Knowledge Horizon Research Platform
            </div>
        </div>
    );
}

// Email Modal Component
function EmailModal({
    reportId,
    reportName,
    streamName,
    articleCount,
    onClose,
}: {
    reportId: number;
    reportName: string;
    streamName: string | null;
    articleCount: number;
    onClose: () => void;
}) {
    const [activeTab, setActiveTab] = useState<'preview' | 'send' | 'approval'>('preview');
    const [emailHtml, setEmailHtml] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [testEmail, setTestEmail] = useState('');
    const [sending, setSending] = useState(false);
    const [sendSuccess, setSendSuccess] = useState<string | null>(null);
    const [isMaximized, setIsMaximized] = useState(false);

    // Load email preview when modal opens or tab changes to preview
    useEffect(() => {
        if (activeTab === 'preview' && !emailHtml) {
            loadEmailPreview();
        }
    }, [activeTab]);

    const loadEmailPreview = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await reportApi.generateReportEmail(reportId);
            setEmailHtml(response.html);
        } catch (err) {
            console.error('Failed to generate email preview:', err);
            setError('Failed to generate email preview');
        } finally {
            setLoading(false);
        }
    };

    const handleSendTestEmail = async () => {
        if (!testEmail.trim()) return;
        setSending(true);
        setError(null);
        setSendSuccess(null);
        try {
            await reportApi.sendReportEmail(reportId, [testEmail.trim()]);
            setSendSuccess(`Email sent to ${testEmail}`);
            setTestEmail('');
        } catch (err) {
            console.error('Failed to send test email:', err);
            setError('Failed to send email');
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            {/* Modal - fixed size or maximized */}
            <div className={`bg-white dark:bg-gray-800 rounded-lg shadow-xl flex flex-col transition-all duration-200 ${
                isMaximized
                    ? 'w-[calc(100vw-2rem)] h-[calc(100vh-2rem)]'
                    : 'w-[900px] h-[700px]'
            }`}>
                {/* Modal Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-3">
                        <EnvelopeIcon className="h-5 w-5 text-gray-400" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Email Options
                        </h2>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            title={isMaximized ? 'Restore' : 'Maximize'}
                        >
                            {isMaximized ? (
                                <ArrowsPointingInIcon className="h-5 w-5 text-gray-500" />
                            ) : (
                                <ArrowsPointingOutIcon className="h-5 w-5 text-gray-500" />
                            )}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <XMarkIcon className="h-5 w-5 text-gray-500" />
                        </button>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex-shrink-0 flex gap-4 px-6 pt-4 border-b border-gray-200 dark:border-gray-700">
                    <button
                        onClick={() => setActiveTab('preview')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            activeTab === 'preview'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Preview Email
                    </button>
                    <button
                        onClick={() => setActiveTab('send')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            activeTab === 'send'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Send Test Email
                    </button>
                    <button
                        onClick={() => setActiveTab('approval')}
                        className={`pb-3 px-2 font-medium transition-colors border-b-2 ${
                            activeTab === 'approval'
                                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                        }`}
                    >
                        Request Approval
                    </button>
                </div>

                {/* Content - fixed height, scrolls internally */}
                <div className="flex-1 overflow-auto p-6">
                    {/* Preview Tab */}
                    {activeTab === 'preview' && (
                        <div className="h-full flex flex-col">
                            {loading ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                                </div>
                            ) : error ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="text-center">
                                        <p className="text-red-600 dark:text-red-400">{error}</p>
                                        <button
                                            onClick={loadEmailPreview}
                                            className="mt-4 px-4 py-2 text-sm text-blue-600 hover:underline"
                                        >
                                            Try again
                                        </button>
                                    </div>
                                </div>
                            ) : emailHtml ? (
                                <iframe
                                    srcDoc={emailHtml}
                                    className="flex-1 w-full border border-gray-200 dark:border-gray-700 rounded-lg bg-white"
                                    title="Email Preview"
                                />
                            ) : null}
                        </div>
                    )}

                    {/* Send Test Email Tab */}
                    {activeTab === 'send' && (
                        <div className="max-w-md mx-auto space-y-4">
                            <div>
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                                    Send Test Email
                                </h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                                    Send the report email to any address to preview how it looks in an email client.
                                    This works even before the report is approved.
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Email Address
                                </label>
                                <input
                                    type="email"
                                    value={testEmail}
                                    onChange={(e) => setTestEmail(e.target.value)}
                                    placeholder="test@example.com"
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                />
                            </div>

                            {error && (
                                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                            )}

                            {sendSuccess && (
                                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                    <CheckCircleIcon className="h-4 w-4" />
                                    {sendSuccess}
                                </div>
                            )}

                            <button
                                onClick={handleSendTestEmail}
                                disabled={!testEmail.trim() || sending}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                {sending ? (
                                    <>
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                        Sending...
                                    </>
                                ) : (
                                    <>
                                        <EnvelopeIcon className="h-4 w-4" />
                                        Send Test Email
                                    </>
                                )}
                            </button>
                        </div>
                    )}

                    {/* Request Approval Tab */}
                    {activeTab === 'approval' && (
                        <ApprovalRequestSection
                            reportId={reportId}
                            reportName={reportName}
                            streamName={streamName}
                            articleCount={articleCount}
                        />
                    )}
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

// Approval Request Section Component
function ApprovalRequestSection({
    reportId,
    reportName,
    streamName,
    articleCount,
}: {
    reportId: number;
    reportName: string;
    streamName: string | null;
    articleCount: number;
}) {
    const [admins, setAdmins] = useState<{ user_id: number; email: string; display_name: string }[]>([]);
    const [selectedAdmin, setSelectedAdmin] = useState<number | null>(null);
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        loadAdmins();
    }, []);

    const loadAdmins = async () => {
        setLoading(true);
        try {
            const adminList = await reportApi.getAdminUsers();
            setAdmins(adminList);
            if (adminList.length > 0) {
                setSelectedAdmin(adminList[0].user_id);
            }
        } catch (err) {
            console.error('Failed to load admins:', err);
            setError('Failed to load admin users');
        } finally {
            setLoading(false);
        }
    };

    const handleSendApprovalRequest = async () => {
        if (!selectedAdmin) return;
        setSending(true);
        setError(null);
        setSuccess(null);
        try {
            await sendApprovalRequest(reportId, selectedAdmin);
            const admin = admins.find(a => a.user_id === selectedAdmin);
            setSuccess(`Approval request sent to ${admin?.display_name || admin?.email}`);
        } catch (err) {
            console.error('Failed to send approval request:', err);
            setError('Failed to send approval request');
        } finally {
            setSending(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-32">
                <ArrowPathIcon className="h-6 w-6 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto space-y-4">
            <div>
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                    Request Approval
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Send a notification to an admin with a link to review and approve this report.
                </p>
            </div>

            {/* Report Summary */}
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                    <span className="text-gray-500 dark:text-gray-400">Report:</span>
                    <span className="text-gray-900 dark:text-white font-medium">{reportName}</span>
                    <span className="text-gray-500 dark:text-gray-400">Stream:</span>
                    <span className="text-gray-900 dark:text-white">{streamName || 'N/A'}</span>
                    <span className="text-gray-500 dark:text-gray-400">Articles:</span>
                    <span className="text-gray-900 dark:text-white">{articleCount}</span>
                </div>
            </div>

            {/* Admin Selector */}
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Send to Admin
                </label>
                {admins.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400 italic">No admin users found</p>
                ) : (
                    <select
                        value={selectedAdmin || ''}
                        onChange={(e) => setSelectedAdmin(parseInt(e.target.value))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {admins.map((admin) => (
                            <option key={admin.user_id} value={admin.user_id}>
                                {admin.display_name || admin.email}
                            </option>
                        ))}
                    </select>
                )}
            </div>

            {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}

            {success && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                    <CheckCircleIcon className="h-4 w-4" />
                    {success}
                </div>
            )}

            <button
                onClick={handleSendApprovalRequest}
                disabled={!selectedAdmin || sending || admins.length === 0}
                className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
                {sending ? (
                    <>
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Sending...
                    </>
                ) : (
                    <>
                        <EnvelopeIcon className="h-4 w-4" />
                        Send Approval Request
                    </>
                )}
            </button>
        </div>
    );
}

// Included Article Card Component
function IncludedArticleCard({
    article,
    ranking,
    categories,
    expanded,
    isProcessing,
    isSavingCategory,
    onToggleExpand,
    onExclude,
    onCategoryChange,
    onSaveNotes,
    onSaveAiSummary,
    onRegenerateAiSummary,
}: {
    article: CurationIncludedArticle;
    ranking: number;
    categories: CurationCategory[];
    expanded: boolean;
    isProcessing: boolean;
    isSavingCategory: boolean;
    onToggleExpand: () => void;
    onExclude: () => void;
    onCategoryChange: (categoryId: string) => void;
    onSaveNotes?: (notes: string) => void;
    onSaveAiSummary: (aiSummary: string) => void;
    onRegenerateAiSummary: () => Promise<string | undefined>;
}) {
    const [notes, setNotes] = useState(article.curation_notes || '');
    const [savingNotes, setSavingNotes] = useState(false);
    const [editingAiSummary, setEditingAiSummary] = useState(false);
    const [editedAiSummary, setEditedAiSummary] = useState(article.ai_summary || '');
    const [savingAiSummary, setSavingAiSummary] = useState(false);
    const [regeneratingAiSummary, setRegeneratingAiSummary] = useState(false);

    const handleSaveAiSummary = async () => {
        setSavingAiSummary(true);
        try {
            await onSaveAiSummary(editedAiSummary);
            setEditingAiSummary(false);
        } finally {
            setSavingAiSummary(false);
        }
    };

    const handleRegenerateAiSummary = async () => {
        setRegeneratingAiSummary(true);
        try {
            const newSummary = await onRegenerateAiSummary();
            if (newSummary) {
                setEditedAiSummary(newSummary);
            }
        } finally {
            setRegeneratingAiSummary(false);
        }
    };

    const pubmedUrl = article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : null;
    const currentCategory = article.presentation_categories?.[0] || '';
    const notesModified = notes !== (article.curation_notes || '');
    const canSaveNotes = !!onSaveNotes;

    const handleSaveNotes = async () => {
        if (!onSaveNotes) return;
        setSavingNotes(true);
        try {
            await onSaveNotes(notes);
        } finally {
            setSavingNotes(false);
        }
    };

    return (
        <div className={`border rounded-lg overflow-hidden ${
            article.curator_added
                ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
                : 'border-gray-200 dark:border-gray-700'
        }`}>
            {/* Main content */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 text-gray-400">
                                <span className="text-sm font-medium">#{ranking}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                {pubmedUrl ? (
                                    <a
                                        href={pubmedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1 group"
                                    >
                                        {article.title}
                                        <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                    </a>
                                ) : (
                                    <h4 className="font-medium text-gray-900 dark:text-white">
                                        {article.title}
                                    </h4>
                                )}
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {article.authors?.join(', ')} &bull; {article.journal} &bull; {getYearString(article.pub_year)}
                                    {article.pmid && (
                                        <span className="ml-2 text-gray-400">PMID: {article.pmid}</span>
                                    )}
                                </p>
                                {/* Category selector - always visible */}
                                <div className="flex items-center gap-2 mt-2">
                                    <span className="text-xs text-gray-500 dark:text-gray-400">Category:</span>
                                    <select
                                        value={currentCategory}
                                        onChange={(e) => onCategoryChange(e.target.value)}
                                        disabled={isSavingCategory}
                                        className={`text-xs border rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white disabled:opacity-50 ${
                                            isSavingCategory
                                                ? 'border-blue-300 dark:border-blue-600'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        <option value="">None</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                    {isSavingCategory && (
                                        <ArrowPathIcon className="h-3 w-3 animate-spin text-blue-600" />
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Expanded content */}
                        {expanded && (
                            <div className="mt-4 space-y-4 ml-10">
                                {/* AI Summary */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">AI Summary</span>
                                        {!editingAiSummary && (
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleRegenerateAiSummary}
                                                    disabled={regeneratingAiSummary}
                                                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    <ArrowPathIcon className={`h-3 w-3 ${regeneratingAiSummary ? 'animate-spin' : ''}`} />
                                                    {regeneratingAiSummary ? 'Regenerating...' : 'Regenerate'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditedAiSummary(article.ai_summary || '');
                                                        setEditingAiSummary(true);
                                                    }}
                                                    disabled={regeneratingAiSummary}
                                                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex items-center gap-1 disabled:opacity-50"
                                                >
                                                    <PencilIcon className="h-3 w-3" />
                                                    {article.ai_summary ? 'Edit' : 'Add'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                    {editingAiSummary ? (
                                        <div className="space-y-2">
                                            <textarea
                                                value={editedAiSummary}
                                                onChange={(e) => setEditedAiSummary(e.target.value)}
                                                rows={4}
                                                className="w-full text-sm px-3 py-2 border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                                placeholder="Enter AI summary..."
                                                disabled={savingAiSummary}
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={handleSaveAiSummary}
                                                    disabled={savingAiSummary}
                                                    className="px-3 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                                                >
                                                    {savingAiSummary ? 'Saving...' : 'Save'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setEditedAiSummary(article.ai_summary || '');
                                                        setEditingAiSummary(false);
                                                    }}
                                                    disabled={savingAiSummary}
                                                    className="px-3 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : article.ai_summary ? (
                                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-purple-50 dark:bg-purple-900/20 p-3 rounded border-l-2 border-purple-400 dark:border-purple-600">
                                            {article.ai_summary}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                                            No AI summary available
                                        </p>
                                    )}
                                </div>

                                {/* Filter Score Reason */}
                                {article.filter_score_reason && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filter Reasoning</span>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 bg-green-50 dark:bg-green-900/20 p-3 rounded mt-1 border-l-2 border-green-400 dark:border-green-600">
                                            {article.filter_score_reason}
                                        </p>
                                    </div>
                                )}

                                {/* Abstract */}
                                {article.abstract && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Abstract</span>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded mt-1">
                                            {article.abstract}
                                        </p>
                                    </div>
                                )}

                                {/* Curation Notes */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <ChatBubbleLeftIcon className="h-4 w-4 text-gray-400" />
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                Curation Notes
                                            </span>
                                            <span className="text-xs text-gray-400">(for retrieval improvement)</span>
                                        </div>
                                        {canSaveNotes && notesModified && (
                                            <button
                                                type="button"
                                                onClick={handleSaveNotes}
                                                disabled={savingNotes}
                                                className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                                            >
                                                {savingNotes ? 'Saving...' : 'Save Notes'}
                                            </button>
                                        )}
                                    </div>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => canSaveNotes && setNotes(e.target.value)}
                                        readOnly={!canSaveNotes}
                                        placeholder={canSaveNotes ? "Add notes about why this article should or shouldn't be included..." : "Notes unavailable (no WipArticle linked)"}
                                        rows={2}
                                        className={`w-full text-sm px-3 py-2 border rounded text-gray-900 dark:text-white ${
                                            !canSaveNotes
                                                ? 'bg-gray-100 dark:bg-gray-900 border-gray-200 dark:border-gray-700 cursor-not-allowed'
                                                : notesModified
                                                    ? 'bg-white dark:bg-gray-800 border-blue-300 dark:border-blue-600'
                                                    : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                                        }`}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        {/* Score display */}
                        {article.filter_score != null && (
                            <span className="text-sm text-green-600 dark:text-green-400" title="Filter score">
                                {article.filter_score.toFixed(2)}
                            </span>
                        )}
                        {isProcessing ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                <span>{article.curator_added ? 'Undoing...' : 'Removing...'}</span>
                            </div>
                        ) : article.curator_added ? (
                            /* Curator-added article: show "Added" badge with Undo button */
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300 rounded">
                                    Added
                                </span>
                                <button
                                    type="button"
                                    onClick={onExclude}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                    title="Undo - remove from report"
                                >
                                    <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                                    Undo
                                </button>
                            </div>
                        ) : (
                            /* Pipeline-included article: show minus button */
                            <button
                                type="button"
                                onClick={onExclude}
                                className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg"
                                title="Exclude from report"
                            >
                                <MinusIcon className="h-5 w-5" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            disabled={isProcessing}
                            className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                        >
                            {expanded ? (
                                <ChevronUpIcon className="h-5 w-5" />
                            ) : (
                                <ChevronDownIcon className="h-5 w-5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Filtered Article Card Component
function FilteredArticleCard({
    article,
    categories,
    expanded,
    isProcessing,
    onToggleExpand,
    onInclude,
    onSaveNotes,
}: {
    article: CurationFilteredArticle;
    categories: CurationCategory[];
    expanded: boolean;
    isProcessing: boolean;
    onToggleExpand: () => void;
    onInclude: (categoryId?: string) => void;
    onSaveNotes: (notes: string) => void;
}) {
    const [selectedCategory, setSelectedCategory] = useState<string>('');
    const [notes, setNotes] = useState(article.curation_notes || '');
    const [savingNotes, setSavingNotes] = useState(false);
    const pubmedUrl = article.pmid ? `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/` : null;
    const notesModified = notes !== (article.curation_notes || '');

    const handleSaveNotes = async () => {
        setSavingNotes(true);
        try {
            await onSaveNotes(notes);
        } finally {
            setSavingNotes(false);
        }
    };

    return (
        <div className={`border rounded-lg overflow-hidden ${
            article.curator_excluded
                ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10'
                : 'border-gray-200 dark:border-gray-700'
        }`}>
            {/* Main content */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                                {pubmedUrl ? (
                                    <a
                                        href={pubmedUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 hover:underline inline-flex items-center gap-1 group"
                                    >
                                        {article.title}
                                        <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                                    </a>
                                ) : (
                                    <h4 className="font-medium text-gray-900 dark:text-white">
                                        {article.title}
                                    </h4>
                                )}
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                    {article.authors?.join(', ')} &bull; {article.journal} &bull; {getYearString(article.pub_year)}
                                    {article.pmid && (
                                        <span className="ml-2 text-gray-400">PMID: {article.pmid}</span>
                                    )}
                                </p>
                            </div>
                        </div>

                        {/* Expanded content */}
                        {expanded && (
                            <div className="mt-4 space-y-4">
                                {/* Filter Score Reason */}
                                {article.filter_score_reason && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Filter Reasoning</span>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 bg-red-50 dark:bg-red-900/20 p-3 rounded mt-1 border-l-2 border-red-400 dark:border-red-600">
                                            {article.filter_score_reason}
                                        </p>
                                    </div>
                                )}

                                {/* Abstract */}
                                {article.abstract && (
                                    <div>
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Abstract</span>
                                        <p className="text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900/50 p-3 rounded mt-1">
                                            {article.abstract}
                                        </p>
                                    </div>
                                )}

                                {/* Curation Notes */}
                                <div>
                                    <div className="flex items-center justify-between mb-1">
                                        <div className="flex items-center gap-2">
                                            <ChatBubbleLeftIcon className="h-4 w-4 text-gray-400" />
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                                Curation Notes
                                            </span>
                                        </div>
                                        {notesModified && (
                                            <button
                                                type="button"
                                                onClick={handleSaveNotes}
                                                disabled={savingNotes}
                                                className="px-2 py-1 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50"
                                            >
                                                {savingNotes ? 'Saving...' : 'Save Notes'}
                                            </button>
                                        )}
                                    </div>
                                    <textarea
                                        value={notes}
                                        onChange={(e) => setNotes(e.target.value)}
                                        placeholder="Add notes about why this article should or shouldn't be included..."
                                        rows={2}
                                        className={`w-full text-sm px-3 py-2 border rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white ${
                                            notesModified
                                                ? 'border-blue-300 dark:border-blue-600'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    />
                                </div>

                                {/* Category selection for including */}
                                <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Include in category:</span>
                                    <select
                                        value={selectedCategory}
                                        onChange={(e) => setSelectedCategory(e.target.value)}
                                        className="text-sm border border-gray-200 dark:border-gray-700 rounded px-2 py-1 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    >
                                        <option value="">Select category...</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 flex items-center gap-2">
                        {/* Score display */}
                        {article.filter_score != null && (
                            <span className="text-sm text-red-600 dark:text-red-400" title="Filter score">
                                {article.filter_score.toFixed(2)}
                            </span>
                        )}
                        {isProcessing ? (
                            <div className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400">
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                <span>{article.curator_excluded ? 'Undoing...' : 'Adding...'}</span>
                            </div>
                        ) : article.curator_excluded ? (
                            /* Curator-excluded article: show "Excluded" badge with Undo button */
                            <div className="flex items-center gap-2">
                                <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300 rounded">
                                    Excluded
                                </span>
                                <button
                                    type="button"
                                    onClick={() => onInclude()}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-700"
                                    title="Undo - restore to report"
                                >
                                    <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
                                    Undo
                                </button>
                            </div>
                        ) : (
                            /* Pipeline-filtered article: show plus button */
                            <button
                                type="button"
                                onClick={() => onInclude(selectedCategory || undefined)}
                                className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg"
                                title="Include in report"
                            >
                                <PlusIcon className="h-5 w-5" />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={onToggleExpand}
                            disabled={isProcessing}
                            className="p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                        >
                            {expanded ? (
                                <ChevronUpIcon className="h-5 w-5" />
                            ) : (
                                <ChevronDownIcon className="h-5 w-5" />
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
