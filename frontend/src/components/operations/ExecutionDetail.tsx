/**
 * Execution Detail - Read-only view of a pipeline execution and its results
 *
 * Route: /operations/executions/:executionId
 * Features:
 * - View execution details (when ran, duration, filtering stats)
 * - View report output: executive summary, articles by category with summaries
 * - View pipeline details: filtered articles, duplicates, retrieval config
 * - Link to Curation for editing
 * - Email report functionality
 *
 * Note: Approval/rejection is done in the Curation screen, not here.
 */

import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    ArrowLeftIcon,
    CheckIcon,
    XMarkIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    FunnelIcon,
    DocumentTextIcon,
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    EnvelopeIcon,
    PaperAirplaneIcon,
    PencilSquareIcon,
    Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import RetrievalConfigModal from '../shared/RetrievalConfigModal';
import {
    getExecutionDetail,
} from '../../lib/api/operationsApi';
import { getReportConfig, type ReportConfigResponse } from '../../lib/api/curationApi';
import { reportApi } from '../../lib/api/reportApi';
import type { ExecutionStatus, WipArticle, ExecutionDetail } from '../../types/research-stream';
import type { ReportArticle } from '../../types/report';
import { getYearString } from '../../utils/dateUtils';

export default function ExecutionDetail() {
    const { executionId } = useParams<{ executionId: string }>();
    const [execution, setExecution] = useState<ExecutionDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<string[]>([]);
    const [showPipelineDetails, setShowPipelineDetails] = useState(false);

    // Email state
    const [showEmailModal, setShowEmailModal] = useState(false);
    const [emailHtml, setEmailHtml] = useState<string | null>(null);
    const [emailStored, setEmailStored] = useState(false);
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState<string | null>(null);
    const [emailRecipient, setEmailRecipient] = useState('');
    const [sendingEmail, setSendingEmail] = useState(false);
    const [emailSendResult, setEmailSendResult] = useState<{ success: string[]; failed: string[] } | null>(null);

    // Config modal state
    const [showConfigModal, setShowConfigModal] = useState(false);
    const [configData, setConfigData] = useState<ReportConfigResponse | null>(null);
    const [configLoading, setConfigLoading] = useState(false);

    // Function to open config modal and fetch data
    const openConfigModal = async () => {
        if (!execution?.report_id) return;

        setConfigLoading(true);
        setShowConfigModal(true);

        try {
            const data = await getReportConfig(execution.report_id);
            setConfigData(data);
        } catch (err) {
            console.error('Failed to load config:', err);
        } finally {
            setConfigLoading(false);
        }
    };

    // Fetch execution data
    useEffect(() => {
        async function fetchExecution() {
            if (!executionId) return;
            setLoading(true);
            setError(null);
            try {
                const data = await getExecutionDetail(executionId);
                setExecution(data);
            } catch (err) {
                setError('Failed to load execution details');
                console.error(err);
            } finally {
                setLoading(false);
            }
        }
        fetchExecution();
    }, [executionId]);

    // Compute article counts for pipeline sections from WIP articles
    // Articles in the final report (includes curator_included overrides)
    const includedArticles = execution?.wip_articles.filter(a => a.included_in_report) || [];
    // Duplicates detected
    const duplicateArticles = execution?.wip_articles.filter(a => a.is_duplicate) || [];
    // Filtered out by pipeline AND stayed out (not curator_included)
    const filteredOutArticles = execution?.wip_articles.filter(a =>
        !a.is_duplicate && a.passed_semantic_filter === false && !a.included_in_report
    ) || [];
    // Passed pipeline filter but curator removed them
    const curatorRemovedArticles = execution?.wip_articles.filter(a => a.curator_excluded) || [];

    // Create lookup map from PMID to WipArticle for cross-referencing
    const wipArticleByPmid = new Map<string, WipArticle>();
    execution?.wip_articles.forEach(wip => {
        if (wip.pmid) {
            wipArticleByPmid.set(wip.pmid, wip);
        }
    });

    const toggleCategory = (categoryId: string) => {
        setExpandedCategories((prev) =>
            prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId]
        );
    };

    // Group report articles by category
    const getArticlesByCategory = () => {
        if (!execution?.articles) return {};

        const categoryMap: Record<string, ReportArticle[]> = {};

        execution.articles.forEach(article => {
            const catId = article.presentation_categories?.[0] || 'uncategorized';
            if (!categoryMap[catId]) {
                categoryMap[catId] = [];
            }
            categoryMap[catId].push(article);
        });

        return categoryMap;
    };

    // Email handlers
    const handleGenerateEmail = async () => {
        if (!execution?.report_id) return;
        setEmailLoading(true);
        setEmailError(null);
        try {
            const result = await reportApi.generateReportEmail(execution.report_id);
            setEmailHtml(result.html);
            setEmailStored(false);
        } catch (err) {
            console.error('Failed to generate email:', err);
            setEmailError('Failed to generate email');
        } finally {
            setEmailLoading(false);
        }
    };

    const handleStoreEmail = async () => {
        if (!execution?.report_id || !emailHtml) return;
        setEmailLoading(true);
        setEmailError(null);
        try {
            await reportApi.storeReportEmail(execution.report_id, emailHtml);
            setEmailStored(true);
        } catch (err) {
            console.error('Failed to store email:', err);
            setEmailError('Failed to store email');
        } finally {
            setEmailLoading(false);
        }
    };

    const handleLoadStoredEmail = async () => {
        if (!execution?.report_id) return;
        setEmailLoading(true);
        setEmailError(null);
        try {
            const result = await reportApi.getReportEmail(execution.report_id);
            setEmailHtml(result.html);
            setEmailStored(true);
        } catch (err: any) {
            if (err?.response?.status === 404) {
                setEmailError('No stored email found. Generate one first.');
            } else {
                console.error('Failed to load email:', err);
                setEmailError('Failed to load email');
            }
        } finally {
            setEmailLoading(false);
        }
    };

    const handleSendEmail = async () => {
        if (!execution?.report_id || !emailRecipient.trim() || !emailStored) return;
        setSendingEmail(true);
        setEmailSendResult(null);
        try {
            const result = await reportApi.sendReportEmail(execution.report_id, [emailRecipient.trim()]);
            setEmailSendResult(result);
            if (result.success.length > 0) {
                setEmailRecipient('');
            }
        } catch (err) {
            console.error('Failed to send email:', err);
            setEmailError('Failed to send email');
        } finally {
            setSendingEmail(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="h-8 w-8 text-gray-400 animate-spin" />
            </div>
        );
    }

    if (error || !execution) {
        return (
            <div className="space-y-4">
                <Link to="/operations" className="flex items-center gap-2 text-blue-600 hover:underline">
                    <ArrowLeftIcon className="h-4 w-4" />
                    Back to Execution Queue
                </Link>
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                    {error || 'Execution not found'}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow px-6 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Link to="/operations" className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                            <ArrowLeftIcon className="h-5 w-5 text-gray-500" />
                        </Link>
                        <div>
                            <div className="flex items-center gap-3">
                                <h1 className="text-xl font-bold text-gray-900 dark:text-white">
                                    {execution.report_name || `Execution: ${execution.stream_name}`}
                                </h1>
                                <ExecutionStatusBadge status={execution.execution_status} />
                                {execution.report_id && execution.approval_status && (
                                    <ApprovalStatusBadge status={execution.approval_status} />
                                )}
                            </div>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                {execution.stream_name} · {execution.article_count} articles · {execution.run_type}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Utility buttons - icon only, subtle (matching ReportCuration layout) */}
                        {execution.report_id && (
                            <button
                                type="button"
                                onClick={openConfigModal}
                                disabled={configLoading}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg disabled:opacity-50"
                                title="View run configuration"
                            >
                                <Cog6ToothIcon className={`h-5 w-5 ${configLoading ? 'animate-spin' : ''}`} />
                            </button>
                        )}
                        {execution.report_id && (
                            <button
                                type="button"
                                onClick={() => setShowEmailModal(true)}
                                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                title="Email report"
                            >
                                <EnvelopeIcon className="h-5 w-5" />
                            </button>
                        )}

                        {/* Divider */}
                        {execution.report_id && (
                            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-2" />
                        )}

                        {/* Go to Curation button */}
                        {execution.report_id && (
                            <Link
                                to={`/operations/reports/${execution.report_id}/curate`}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
                            >
                                <PencilSquareIcon className="h-5 w-5" />
                                Review & Curate
                            </Link>
                        )}
                    </div>
                </div>
            </div>

            {/* Execution Details - Organized Layout */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                {/* Top Row: Timing, Metrics, Approval Info */}
                <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-4 border-b border-gray-200 dark:border-gray-700">
                    {/* Run Type & Approval Info */}
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Run Info</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                            {execution.run_type} run
                        </p>
                        {execution.approved_by && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                {execution.approval_status === 'approved' ? 'Approved' : 'Rejected'} by {execution.approved_by}
                                {execution.approved_at && ` on ${new Date(execution.approved_at).toLocaleDateString()}`}
                            </p>
                        )}
                    </div>

                    {/* Date Range */}
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Search Period</p>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                            {execution.start_date && execution.end_date
                                ? `${execution.start_date} → ${execution.end_date}`
                                : 'N/A'}
                        </p>
                    </div>

                    {/* Completed */}
                    <div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Completed</p>
                        {execution.completed_at ? (
                            <>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                    {new Date(execution.completed_at).toLocaleString()}
                                </p>
                                {execution.started_at && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        ({Math.round((new Date(execution.completed_at).getTime() - new Date(execution.started_at).getTime()) / 60000)} min duration)
                                    </p>
                                )}
                            </>
                        ) : execution.started_at ? (
                            <p className="text-sm font-medium text-yellow-600 dark:text-yellow-400">In progress...</p>
                        ) : (
                            <p className="text-sm text-gray-400">N/A</p>
                        )}
                    </div>

                    {/* Pipeline Metrics - Enhanced Funnel */}
                    <div className="col-span-2 md:col-span-1">
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Article Funnel</p>
                        {(() => {
                            // Compute stats from WIP articles
                            const wip = execution?.wip_articles || [];
                            const retrieved = wip.length;
                            const duplicates = wip.filter(a => a.is_duplicate).length;
                            const filtered = wip.filter(a => !a.is_duplicate && a.passed_semantic_filter === false).length;
                            const pipelineIncluded = wip.filter(a => !a.is_duplicate && a.passed_semantic_filter === true).length;
                            const curatorAdded = wip.filter(a => a.curator_included).length;
                            const curatorRemoved = wip.filter(a => a.curator_excluded).length;
                            const finalCount = includedArticles.length;

                            return (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-1 text-sm flex-wrap">
                                        <span className="text-gray-500 dark:text-gray-400">Pipeline:</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300" title="Retrieved">
                                            {retrieved}
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="text-gray-500" title={`${duplicates} duplicates removed`}>
                                            -{duplicates} dup
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="text-gray-500" title={`${filtered} filtered out`}>
                                            -{filtered} filt
                                        </span>
                                        <span className="text-gray-400">→</span>
                                        <span className="font-medium text-gray-700 dark:text-gray-300" title="Pipeline included">
                                            {pipelineIncluded}
                                        </span>
                                    </div>
                                    {(curatorAdded > 0 || curatorRemoved > 0) && (
                                        <div className="flex items-center gap-2 text-sm">
                                            <span className="text-gray-500 dark:text-gray-400">Curation:</span>
                                            {curatorAdded > 0 && (
                                                <span className="text-green-600 dark:text-green-400" title="Curator added">
                                                    +{curatorAdded}
                                                </span>
                                            )}
                                            {curatorRemoved > 0 && (
                                                <span className="text-red-600 dark:text-red-400" title="Curator removed">
                                                    -{curatorRemoved}
                                                </span>
                                            )}
                                            <span className="text-gray-400">→</span>
                                            <span className="font-bold text-blue-600 dark:text-blue-400" title="Final count">
                                                {finalCount} final
                                            </span>
                                        </div>
                                    )}
                                    {curatorAdded === 0 && curatorRemoved === 0 && (
                                        <div className="text-sm">
                                            <span className="font-bold text-blue-600 dark:text-blue-400">
                                                {finalCount} articles in report
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {/* Error display */}
                {execution.execution_status === 'failed' && execution.error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800">
                        <div className="flex items-start gap-2">
                            <ExclamationTriangleIcon className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5" />
                            <p className="text-sm text-red-700 dark:text-red-300">{execution.error}</p>
                        </div>
                    </div>
                )}

                {/* Rejection reason */}
                {execution.rejection_reason && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
                        <p className="text-sm text-red-700 dark:text-red-300">
                            <span className="font-medium">Rejection Reason:</span> {execution.rejection_reason}
                        </p>
                    </div>
                )}
            </div>

            {/* Section 1: Report Output (Primary) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                        <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                        Report Output
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        What will be sent to subscribers - verify summaries are correct
                    </p>
                </div>

                <div className="p-4">
                    {!execution.report_id ? (
                        <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                            No report available for this execution
                        </p>
                    ) : (
                        <div className="space-y-6">

                            {/* Executive Summary */}
                            {execution.executive_summary && (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                        <DocumentTextIcon className="h-5 w-5 text-gray-400" />
                                        Executive Summary
                                    </h3>
                                    <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                            {execution.executive_summary}
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Articles by Category */}
                            {execution.articles && execution.articles.length > 0 ? (
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                                        Articles ({execution.articles.length})
                                    </h3>
                                    {Object.entries(getArticlesByCategory()).map(([categoryId, articles]) => {
                                        const isExpanded = expandedCategories.includes(categoryId);
                                        const categoryName = categoryId === 'uncategorized'
                                            ? 'Uncategorized'
                                            : categoryId.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                                        const categorySummary = execution.category_summaries?.[categoryId];

                                        return (
                                            <div key={categoryId} className="border border-gray-200 dark:border-gray-700 rounded-lg mb-3 overflow-hidden">
                                                <button
                                                    onClick={() => toggleCategory(categoryId)}
                                                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 bg-gray-50 dark:bg-gray-800"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {isExpanded ? (
                                                            <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                                                        ) : (
                                                            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                                                        )}
                                                        <span className="font-medium text-gray-900 dark:text-white">{categoryName}</span>
                                                        <span className="text-sm text-gray-500 dark:text-gray-400">
                                                            ({articles.length} article{articles.length !== 1 ? 's' : ''})
                                                        </span>
                                                    </div>
                                                </button>

                                                {isExpanded && (
                                                    <div className="bg-white dark:bg-gray-900">
                                                        {/* Category Summary */}
                                                        {categorySummary && (
                                                            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                                                                <h5 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                                                                    Category Summary
                                                                </h5>
                                                                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                                                                        {categorySummary}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {/* Articles */}
                                                        <div className="p-4 space-y-3">
                                                            {articles.map((article) => (
                                                                <ReportArticleCard
                                                                    key={article.article_id}
                                                                    article={article}
                                                                    wipArticle={article.pmid ? wipArticleByPmid.get(article.pmid) : undefined}
                                                                />
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                                    No articles in this report
                                </p>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Section 2: Pipeline Details (Collapsible) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <button
                    onClick={() => setShowPipelineDetails(!showPipelineDetails)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700 rounded-lg"
                >
                    <div className="flex items-center gap-2">
                        <FunnelIcon className="h-5 w-5 text-gray-400" />
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Pipeline Details
                        </h2>
                        <span className="text-sm text-gray-500 dark:text-gray-400">
                            ({filteredOutArticles.length} filtered, {duplicateArticles.length} duplicates{curatorRemovedArticles.length > 0 ? `, ${curatorRemovedArticles.length} curator removed` : ''})
                        </span>
                    </div>
                    {showPipelineDetails ? (
                        <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-5 w-5 text-gray-400" />
                    )}
                </button>

                {showPipelineDetails && (
                    <div className="border-t border-gray-200 dark:border-gray-700">
                        {/* Filtered Out Articles */}
                        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                <span className="px-2 py-0.5 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                    {filteredOutArticles.length}
                                </span>
                                Filtered Out
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                Articles that did not pass the semantic filter
                            </p>
                            {filteredOutArticles.length > 0 ? (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {filteredOutArticles.map((article) => (
                                        <WipArticleCard key={article.id} article={article} type="filtered" />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic">No articles filtered out</p>
                            )}
                        </div>

                        {/* Duplicate Articles */}
                        <div className="p-4">
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                                    {duplicateArticles.length}
                                </span>
                                Duplicates
                            </h3>
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                Articles detected as duplicates of existing articles
                            </p>
                            {duplicateArticles.length > 0 ? (
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {duplicateArticles.map((article) => (
                                        <WipArticleCard key={article.id} article={article} type="duplicate" />
                                    ))}
                                </div>
                            ) : (
                                <p className="text-sm text-gray-400 italic">No duplicates detected</p>
                            )}
                        </div>

                        {/* Curator Removed Articles */}
                        {curatorRemovedArticles.length > 0 && (
                            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
                                    <span className="px-2 py-0.5 text-xs rounded-full bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">
                                        {curatorRemovedArticles.length}
                                    </span>
                                    Curator Removed
                                </h3>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                                    Articles that passed the filter but were manually removed by a curator
                                </p>
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {curatorRemovedArticles.map((article) => (
                                        <WipArticleCard key={article.id} article={article} type="curator_removed" />
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Email Modal */}
            {showEmailModal && (
                <div className="fixed inset-0 bg-black/50 z-50 flex flex-col">
                    <div className="bg-white dark:bg-gray-800 w-screen h-screen flex flex-col">
                        {/* Modal Header with Controls */}
                        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        <EnvelopeIcon className="h-5 w-5" />
                                        Email Report
                                    </h2>
                                    {emailStored && (
                                        <span className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                                            <CheckCircleIcon className="h-4 w-4" />
                                            Stored
                                        </span>
                                    )}
                                </div>
                                <button
                                    onClick={() => setShowEmailModal(false)}
                                    className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                                >
                                    <XMarkIcon className="h-5 w-5 text-gray-500" />
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex flex-wrap items-center gap-3 mt-4">
                                <button
                                    onClick={handleLoadStoredEmail}
                                    disabled={emailLoading}
                                    className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {emailLoading ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <EnvelopeIcon className="h-4 w-4" />
                                    )}
                                    Load Stored
                                </button>
                                <button
                                    onClick={handleGenerateEmail}
                                    disabled={emailLoading}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                                >
                                    {emailLoading ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <ArrowPathIcon className="h-4 w-4" />
                                    )}
                                    Generate Email
                                </button>
                                {emailHtml && !emailStored && (
                                    <button
                                        onClick={handleStoreEmail}
                                        disabled={emailLoading}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 flex items-center gap-2"
                                    >
                                        <CheckIcon className="h-4 w-4" />
                                        Store Email
                                    </button>
                                )}

                                {/* Divider */}
                                {emailStored && <div className="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2" />}

                                {/* Send Email Form */}
                                {emailStored && (
                                    <>
                                        <input
                                            type="email"
                                            value={emailRecipient}
                                            onChange={(e) => setEmailRecipient(e.target.value)}
                                            placeholder="recipient@example.com"
                                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white w-64"
                                        />
                                        <button
                                            onClick={handleSendEmail}
                                            disabled={sendingEmail || !emailRecipient.trim()}
                                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                                        >
                                            {sendingEmail ? (
                                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <PaperAirplaneIcon className="h-4 w-4" />
                                            )}
                                            Send
                                        </button>
                                    </>
                                )}

                                {/* Send Result */}
                                {emailSendResult && (
                                    <span className="text-sm">
                                        {emailSendResult.success.length > 0 && (
                                            <span className="text-green-600 dark:text-green-400">
                                                Sent to {emailSendResult.success.join(', ')}
                                            </span>
                                        )}
                                        {emailSendResult.failed.length > 0 && (
                                            <span className="text-red-600 dark:text-red-400">
                                                Failed: {emailSendResult.failed.join(', ')}
                                            </span>
                                        )}
                                    </span>
                                )}
                            </div>

                            {/* Error Display */}
                            {emailError && (
                                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                                    {emailError}
                                </div>
                            )}
                        </div>

                        {/* Email Preview Area */}
                        <div className="flex-1 overflow-hidden">
                            {emailHtml ? (
                                <iframe
                                    srcDoc={emailHtml}
                                    title="Email Preview"
                                    className="w-full h-full bg-white"
                                    sandbox="allow-same-origin"
                                />
                            ) : (
                                <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
                                    <div className="text-center">
                                        <EnvelopeIcon className="h-16 w-16 mx-auto mb-4 opacity-50" />
                                        <p className="text-lg">No email preview</p>
                                        <p className="text-sm mt-1">Click "Load Stored" to load existing email or "Generate Email" to create a new one</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Config Modal */}
            {showConfigModal && (
                <RetrievalConfigModal
                    subtitle={execution.report_name || execution.stream_name}
                    config={configData?.retrieval_config || {}}
                    startDate={configData?.start_date}
                    endDate={configData?.end_date}
                    reportId={execution.report_id || undefined}
                    enrichmentConfig={configData?.enrichment_config}
                    llmConfig={configData?.llm_config}
                    loading={configLoading}
                    onClose={() => {
                        setShowConfigModal(false);
                        setConfigData(null);
                    }}
                />
            )}
        </div>
    );
}

// Card for displaying articles in report preview
function ReportArticleCard({ article, wipArticle }: { article: ReportArticle; wipArticle?: WipArticle }) {
    const [expanded, setExpanded] = useState(false);

    // Get filter score from WIP article if available
    const filterScore = wipArticle?.filter_score;
    const curatorAdded = wipArticle?.curator_included;

    return (
        <div className={`p-3 border rounded-lg ${
            curatorAdded
                ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
                : 'border-gray-200 dark:border-gray-700'
        }`}>
            <div className="flex items-start gap-2">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-0.5 text-gray-400 hover:text-gray-600"
                >
                    {expanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                    )}
                </button>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                        <a
                            href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                            {article.title}
                        </a>
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {article.authors.join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {article.journal} · {getYearString(article.pub_year)} · PMID: {article.pmid}
                    </p>
                    {/* Status badges */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {curatorAdded && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                Curator added
                            </span>
                        )}
                    </div>

                    {/* AI Summary - shown by default */}
                    {article.ai_summary && (
                        <div className="mt-2 p-2 bg-purple-50 dark:bg-purple-900/20 rounded border-l-2 border-purple-400 dark:border-purple-600">
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                {article.ai_summary}
                            </p>
                        </div>
                    )}
                </div>

                {/* Score display */}
                {filterScore != null && (
                    <span className="text-sm font-medium text-green-600 dark:text-green-400" title="Filter score">
                        {filterScore.toFixed(2)}
                    </span>
                )}
            </div>

            {/* Expanded content */}
            {expanded && (
                <div className="mt-3 ml-6 space-y-3">
                    {/* Filter Score Reason */}
                    {wipArticle?.filter_score_reason && (
                        <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded border-l-2 border-green-400 dark:border-green-600">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Filter Reasoning</p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                {wipArticle.filter_score_reason}
                            </p>
                        </div>
                    )}

                    {/* Curation Notes */}
                    {wipArticle?.curation_notes && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border-l-2 border-blue-400 dark:border-blue-600">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Curation Notes</p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                {wipArticle.curation_notes}
                            </p>
                        </div>
                    )}

                    {/* Abstract */}
                    {article.abstract && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Abstract</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {article.abstract}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ExecutionStatusBadge({ status }: { status: ExecutionStatus }) {
    const config: Record<ExecutionStatus, { bg: string; text: string; label: string }> = {
        pending: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', label: 'Pending' },
        running: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'Running' },
        completed: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'Completed' },
        failed: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'Failed' },
    };
    const { bg, text, label } = config[status];
    return <span className={`inline-flex items-center px-2 py-1 text-sm font-medium rounded ${bg} ${text}`}>{label}</span>;
}

function ApprovalStatusBadge({ status }: { status: string | null }) {
    const config: Record<string, { bg: string; text: string; icon: typeof CheckCircleIcon | null; label: string }> = {
        awaiting_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: null, label: 'Awaiting Approval' },
        approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircleIcon, label: 'Approved' },
        rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: XCircleIcon, label: 'Rejected' },
    };
    if (!status || !config[status]) {
        return <span className="inline-flex items-center px-2 py-1 text-sm font-medium rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">Unknown</span>;
    }
    const { bg, text, icon: Icon, label } = config[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 text-sm font-medium rounded ${bg} ${text}`}>
            {Icon && <Icon className="h-4 w-4" />}
            {label}
        </span>
    );
}

// Card for displaying WIP articles in pipeline tabs
function WipArticleCard({ article, type }: { article: WipArticle; type: 'included' | 'duplicate' | 'filtered' | 'curator_removed' }) {
    const [expanded, setExpanded] = useState(false);

    // Determine score color based on type
    const getScoreColor = () => {
        if (type === 'filtered') return 'text-red-600 dark:text-red-400';
        if (type === 'included') return 'text-green-600 dark:text-green-400';
        if (type === 'curator_removed') return 'text-orange-600 dark:text-orange-400';
        return 'text-gray-600 dark:text-gray-400';
    };

    return (
        <div className={`p-3 border rounded-lg ${
            article.curator_included
                ? 'border-green-300 dark:border-green-700 bg-green-50/50 dark:bg-green-900/10'
                : article.curator_excluded
                ? 'border-red-300 dark:border-red-700 bg-red-50/50 dark:bg-red-900/10'
                : 'border-gray-200 dark:border-gray-700'
        }`}>
            <div className="flex items-start gap-2">
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-0.5 text-gray-400 hover:text-gray-600"
                >
                    {expanded ? (
                        <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4" />
                    )}
                </button>
                <div className="flex-1 min-w-0">
                    <h4 className="font-medium text-gray-900 dark:text-white text-sm">
                        <a
                            href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                        >
                            {article.title}
                        </a>
                    </h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {article.authors.join(', ')}
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">
                        {article.journal} · {getYearString(article.pub_year)} · PMID: {article.pmid}
                    </p>

                    {/* Status indicator */}
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                        {type === 'duplicate' && (
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                Duplicate of article #{article.duplicate_of_id}
                            </span>
                        )}
                        {/* Curator override badges */}
                        {article.curator_included && (
                            <span className="text-xs px-1.5 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                Curator added
                            </span>
                        )}
                        {article.curator_excluded && (
                            <span className="text-xs px-1.5 py-0.5 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">
                                Curator removed
                            </span>
                        )}
                    </div>
                </div>

                {/* Score display */}
                {article.filter_score != null && (
                    <span className={`text-sm font-medium ${getScoreColor()}`} title="Filter score">
                        {article.filter_score.toFixed(2)}
                    </span>
                )}
            </div>

            {/* Expanded content */}
            {expanded && (
                <div className="mt-3 ml-6 space-y-3">
                    {/* Filter Score Reason */}
                    {article.filter_score_reason && (
                        <div className={`p-3 rounded border-l-2 ${
                            type === 'filtered'
                                ? 'bg-red-50 dark:bg-red-900/20 border-red-400 dark:border-red-600'
                                : type === 'curator_removed'
                                ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-400 dark:border-orange-600'
                                : 'bg-green-50 dark:bg-green-900/20 border-green-400 dark:border-green-600'
                        }`}>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                {type === 'curator_removed' ? 'Filter Reasoning (Passed)' : 'Filter Reasoning'}
                            </p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                {article.filter_score_reason}
                            </p>
                        </div>
                    )}

                    {/* Curation Notes */}
                    {article.curation_notes && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded border-l-2 border-blue-400 dark:border-blue-600">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Curation Notes</p>
                            <p className="text-sm text-gray-700 dark:text-gray-300">
                                {article.curation_notes}
                            </p>
                        </div>
                    )}

                    {/* Abstract */}
                    {article.abstract && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-900 rounded">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Abstract</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {article.abstract}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
