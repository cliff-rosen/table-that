/**
 * Apply to Report Modal - Review current content and apply new AI-generated content
 *
 * Handles all four prompt types:
 * - article_summary: Multiple articles, select which to apply
 * - category_summary: Multiple categories, select which to apply
 * - executive_summary: Single summary, apply or cancel
 * - stance_analysis: Multiple articles, select which stance analyses to apply
 *
 * Flow:
 * 1. Loading - Fetches current content
 * 2. Review - Shows current content in clean card format
 * 3. Generating - User clicks generate, AI creates new content
 * 4. Compare - Side-by-side comparison, user selects which to apply
 * 5. Saving - Applies selected content to the report
 * 6. Success - Shows completion message
 */

import { useState, useEffect } from 'react';
import {
    XMarkIcon,
    ArrowPathIcon,
    CheckIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
    CheckCircleIcon,
    MinusCircleIcon,
    DocumentTextIcon,
    DocumentMagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import {
    getCurrentArticleSummaries,
    getCurrentCategorySummaries,
    getCurrentExecutiveSummary,
    previewArticleSummaries,
    batchUpdateArticleSummaries,
    previewExecutiveSummary,
    saveExecutiveSummary,
    previewCategorySummaries,
    saveCategorySummaries,
    getCurrentStanceAnalysis,
    previewStanceAnalysis,
    batchUpdateStanceAnalysis,
    CurrentArticleSummaryItem,
    CurrentCategorySummaryItem,
    ArticleSummaryPreviewItem,
    CategorySummaryPreviewItem,
    CurrentStanceAnalysisItem,
    StanceAnalysisPreviewItem,
    RegenerateSummariesLLMConfig
} from '../../lib/api/curationApi';
import { PromptTemplate } from '../../types/research-stream';
import { showErrorToast } from '../../lib/errorToast';
import StanceAnalysisDisplay from '../ui/StanceAnalysisDisplay';
import { StanceAnalysisResult } from '../../types/document_analysis';
import { getYearString } from '../../utils/dateUtils';

type PromptType = 'article_summary' | 'category_summary' | 'executive_summary' | 'stance_analysis';

interface ApplyToReportModalProps {
    isOpen: boolean;
    onClose: () => void;
    reportId: number;
    promptType: PromptType;
    prompt: PromptTemplate;
    llmConfig?: RegenerateSummariesLLMConfig;
}

type ModalStage = 'loading' | 'review' | 'generating' | 'compare' | 'saving' | 'success';

// Type for executive summary preview
interface ExecutivePreview {
    current: string | null;
    new: string | null;
    error: string | null;
}

export default function ApplyToReportModal({
    isOpen,
    onClose,
    reportId,
    promptType,
    prompt,
    llmConfig
}: ApplyToReportModalProps) {
    const [stage, setStage] = useState<ModalStage>('loading');
    const [reportName, setReportName] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [updateCount, setUpdateCount] = useState<number>(0);

    // Article summary state
    const [currentArticles, setCurrentArticles] = useState<CurrentArticleSummaryItem[]>([]);
    const [articlePreviews, setArticlePreviews] = useState<ArticleSummaryPreviewItem[]>([]);
    const [selectedArticleIds, setSelectedArticleIds] = useState<Set<number>>(new Set());

    // Category summary state
    const [currentCategories, setCurrentCategories] = useState<CurrentCategorySummaryItem[]>([]);
    const [categoryPreviews, setCategoryPreviews] = useState<CategorySummaryPreviewItem[]>([]);
    const [selectedCategoryIds, setSelectedCategoryIds] = useState<Set<string>>(new Set());

    // Executive summary state
    const [currentExecutiveSummary, setCurrentExecutiveSummary] = useState<string | null>(null);
    const [executivePreview, setExecutivePreview] = useState<ExecutivePreview | null>(null);

    // Stance analysis state
    const [currentStances, setCurrentStances] = useState<CurrentStanceAnalysisItem[]>([]);
    const [stancePreviews, setStancePreviews] = useState<StanceAnalysisPreviewItem[]>([]);
    const [selectedStanceIds, setSelectedStanceIds] = useState<Set<number>>(new Set());

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setStage('loading');
            setReportName('');
            setError(null);
            setUpdateCount(0);
            setCurrentArticles([]);
            setArticlePreviews([]);
            setSelectedArticleIds(new Set());
            setCurrentCategories([]);
            setCategoryPreviews([]);
            setSelectedCategoryIds(new Set());
            setCurrentExecutiveSummary(null);
            setExecutivePreview(null);
            setCurrentStances([]);
            setStancePreviews([]);
            setSelectedStanceIds(new Set());

            // Fetch current data based on prompt type
            if (promptType === 'article_summary') {
                fetchCurrentArticleSummaries();
            } else if (promptType === 'category_summary') {
                fetchCurrentCategorySummaries();
            } else if (promptType === 'executive_summary') {
                fetchCurrentExecutiveSummary();
            } else if (promptType === 'stance_analysis') {
                fetchCurrentStanceAnalysis();
            }
        }
    }, [isOpen, reportId, promptType]);

    const fetchCurrentArticleSummaries = async () => {
        try {
            const response = await getCurrentArticleSummaries(reportId);
            setReportName(response.report_name);
            setCurrentArticles(response.articles);
            setStage('review');
        } catch (err: any) {
            console.error('Error fetching current summaries:', err);
            setError(err.message || 'Failed to load current summaries');
            setStage('review');
        }
    };

    const fetchCurrentCategorySummaries = async () => {
        try {
            const response = await getCurrentCategorySummaries(reportId);
            setReportName(response.report_name);
            setCurrentCategories(response.categories);
            setStage('review');
        } catch (err: any) {
            console.error('Error fetching current category summaries:', err);
            setError(err.message || 'Failed to load current category summaries');
            setStage('review');
        }
    };

    const fetchCurrentExecutiveSummary = async () => {
        try {
            const response = await getCurrentExecutiveSummary(reportId);
            setReportName(response.report_name);
            setCurrentExecutiveSummary(response.current_summary);
            setStage('review');
        } catch (err: any) {
            console.error('Error fetching current executive summary:', err);
            setError(err.message || 'Failed to load current executive summary');
            setStage('review');
        }
    };

    const fetchCurrentStanceAnalysis = async () => {
        try {
            const response = await getCurrentStanceAnalysis(reportId);
            setReportName(response.report_name);
            setCurrentStances(response.articles);
            setStage('review');
        } catch (err: any) {
            console.error('Error fetching current stance analysis:', err);
            setError(err.message || 'Failed to load current stance analysis');
            setStage('review');
        }
    };

    const handleGeneratePreview = async () => {
        setStage('generating');
        setError(null);

        try {
            const requestBody = { prompt, llm_config: llmConfig };

            if (promptType === 'article_summary') {
                const response = await previewArticleSummaries(reportId, requestBody);
                setArticlePreviews(response.previews);
                const allSuccessful = new Set(
                    response.previews
                        .filter(p => p.new_summary && !p.error)
                        .map(p => p.article_id)
                );
                setSelectedArticleIds(allSuccessful);
                setStage('compare');

            } else if (promptType === 'category_summary') {
                const response = await previewCategorySummaries(reportId, requestBody);
                setReportName(response.report_name);
                setCategoryPreviews(response.previews);
                const allSuccessful = new Set(
                    response.previews
                        .filter(p => p.new_summary && !p.error)
                        .map(p => p.category_id)
                );
                setSelectedCategoryIds(allSuccessful);
                setStage('compare');

            } else if (promptType === 'executive_summary') {
                const response = await previewExecutiveSummary(reportId, requestBody);
                setReportName(response.report_name);
                setExecutivePreview({
                    current: response.current_summary,
                    new: response.new_summary,
                    error: response.error,
                });
                setStage('compare');

            } else if (promptType === 'stance_analysis') {
                const response = await previewStanceAnalysis(reportId, requestBody);
                setStancePreviews(response.previews);
                const allSuccessful = new Set(
                    response.previews
                        .filter(p => p.new_stance && !p.error)
                        .map(p => p.article_id)
                );
                setSelectedStanceIds(allSuccessful);
                setStage('compare');
            }
        } catch (err: any) {
            console.error('Error generating preview:', err);
            setError(err.message || 'Failed to generate preview');
            setStage('review');
        }
    };

    const handleApplySelected = async () => {
        setStage('saving');
        setError(null);

        try {
            if (promptType === 'article_summary') {
                if (selectedArticleIds.size === 0) {
                    showErrorToast(new Error('No articles selected'), 'Please select at least one article');
                    setStage('compare');
                    return;
                }

                const updates = articlePreviews
                    .filter(p => selectedArticleIds.has(p.article_id) && p.new_summary)
                    .map(p => ({
                        article_id: p.article_id,
                        ai_summary: p.new_summary!
                    }));

                const result = await batchUpdateArticleSummaries(reportId, { updates });
                setUpdateCount(result.updated_count);

            } else if (promptType === 'category_summary') {
                if (selectedCategoryIds.size === 0) {
                    showErrorToast(new Error('No categories selected'), 'Please select at least one category');
                    setStage('compare');
                    return;
                }

                const updates = categoryPreviews
                    .filter(p => selectedCategoryIds.has(p.category_id) && p.new_summary)
                    .map(p => ({
                        category_id: p.category_id,
                        summary: p.new_summary!
                    }));

                const result = await saveCategorySummaries(reportId, { updates });
                setUpdateCount(result.updated_count);

            } else if (promptType === 'executive_summary') {
                if (!executivePreview?.new) {
                    showErrorToast(new Error('No summary generated'), 'Please generate a new summary first');
                    setStage('compare');
                    return;
                }

                await saveExecutiveSummary(reportId, { summary: executivePreview.new });
                setUpdateCount(1);

            } else if (promptType === 'stance_analysis') {
                if (selectedStanceIds.size === 0) {
                    showErrorToast(new Error('No articles selected'), 'Please select at least one article');
                    setStage('compare');
                    return;
                }

                const updates = stancePreviews
                    .filter(p => selectedStanceIds.has(p.article_id) && p.new_stance)
                    .map(p => ({
                        article_id: p.article_id,
                        stance_analysis: p.new_stance!
                    }));

                const result = await batchUpdateStanceAnalysis(reportId, { updates });
                setUpdateCount(result.updated_count);
            }

            setStage('success');
        } catch (err: any) {
            console.error('Error applying changes:', err);
            setError(err.message || 'Failed to apply changes');
            setStage('compare');
        }
    };

    const handleToggleArticleSelection = (articleId: number) => {
        setSelectedArticleIds(prev => {
            const next = new Set(prev);
            if (next.has(articleId)) {
                next.delete(articleId);
            } else {
                next.add(articleId);
            }
            return next;
        });
    };

    const handleToggleCategorySelection = (categoryId: string) => {
        setSelectedCategoryIds(prev => {
            const next = new Set(prev);
            if (next.has(categoryId)) {
                next.delete(categoryId);
            } else {
                next.add(categoryId);
            }
            return next;
        });
    };

    const handleSelectAllArticles = () => {
        const allSuccessful = new Set(
            articlePreviews
                .filter(p => p.new_summary && !p.error)
                .map(p => p.article_id)
        );
        setSelectedArticleIds(allSuccessful);
    };

    const handleSelectNoneArticles = () => {
        setSelectedArticleIds(new Set());
    };

    const handleSelectAllCategories = () => {
        const allSuccessful = new Set(
            categoryPreviews
                .filter(p => p.new_summary && !p.error)
                .map(p => p.category_id)
        );
        setSelectedCategoryIds(allSuccessful);
    };

    const handleSelectNoneCategories = () => {
        setSelectedCategoryIds(new Set());
    };

    const handleToggleStanceSelection = (articleId: number) => {
        setSelectedStanceIds(prev => {
            const next = new Set(prev);
            if (next.has(articleId)) {
                next.delete(articleId);
            } else {
                next.add(articleId);
            }
            return next;
        });
    };

    const handleSelectAllStances = () => {
        const allSuccessful = new Set(
            stancePreviews
                .filter(p => p.new_stance && !p.error)
                .map(p => p.article_id)
        );
        setSelectedStanceIds(allSuccessful);
    };

    const handleSelectNoneStances = () => {
        setSelectedStanceIds(new Set());
    };

    if (!isOpen) return null;

    const getTitle = () => {
        switch (promptType) {
            case 'article_summary': return 'Apply Article Summaries';
            case 'category_summary': return 'Apply Category Summaries';
            case 'executive_summary': return 'Apply Executive Summary';
            case 'stance_analysis': return 'Apply Stance Analysis';
        }
    };

    const getItemLabel = () => {
        switch (promptType) {
            case 'article_summary': return 'article';
            case 'category_summary': return 'category';
            case 'executive_summary': return 'executive';
            case 'stance_analysis': return 'stance analysis';
        }
    };

    const articlesWithSummaries = currentArticles.filter(a => a.current_summary).length;
    const articleSuccessCount = articlePreviews.filter(p => p.new_summary && !p.error).length;
    const articleErrorCount = articlePreviews.filter(p => p.error).length;
    const categorySuccessCount = categoryPreviews.filter(p => p.new_summary && !p.error).length;
    const categoryErrorCount = categoryPreviews.filter(p => p.error).length;
    const stancesWithAnalysis = currentStances.filter(s => s.current_stance).length;
    const stanceSuccessCount = stancePreviews.filter(p => p.new_stance && !p.error).length;
    const stanceErrorCount = stancePreviews.filter(p => p.error).length;

    return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                    <div className="flex items-center gap-3">
                        <SparklesIcon className="h-6 w-6 text-purple-500" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                {getTitle()}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {reportName || `Report #${reportId}`}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                    >
                        <XMarkIcon className="h-5 w-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Loading Stage */}
                    {stage === 'loading' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <ArrowPathIcon className="h-16 w-16 text-blue-500 mx-auto mb-4 animate-spin" />
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Loading...
                            </h4>
                            <p className="text-gray-600 dark:text-gray-400">
                                Fetching current data from the report.
                            </p>
                        </div>
                    )}

                    {/* Review Stage - Article Summary */}
                    {stage === 'review' && promptType === 'article_summary' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{currentArticles.length}</span> articles
                                    </span>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <DocumentTextIcon className="h-4 w-4 inline mr-1" />
                                        {articlesWithSummaries} with summaries
                                    </span>
                                </div>
                                <button
                                    onClick={handleGeneratePreview}
                                    disabled={currentArticles.length === 0}
                                    className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    <SparklesIcon className="h-5 w-5" />
                                    Generate New Summaries
                                </button>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {currentArticles.length === 0 && !error && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No articles found in this report.
                                </div>
                            )}

                            <div className="space-y-3">
                                {currentArticles.map((article) => (
                                    <div
                                        key={article.article_id}
                                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                                    >
                                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {article.title}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                        {article.pmid && <span>PMID: {article.pmid}</span>}
                                                        {article.journal && <span>{article.journal}</span>}
                                                        {article.pub_year && <span>{getYearString(article.pub_year)}</span>}
                                                    </div>
                                                </div>
                                                {article.current_summary ? (
                                                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex-shrink-0">
                                                        Has Summary
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded flex-shrink-0">
                                                        No Summary
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            {article.current_summary ? (
                                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                    {article.current_summary}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                                                    No summary available.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Review Stage - Category Summary */}
                    {stage === 'review' && promptType === 'category_summary' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{currentCategories.length}</span> categories
                                    </span>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <DocumentTextIcon className="h-4 w-4 inline mr-1" />
                                        {currentCategories.filter(c => c.current_summary).length} with summaries
                                    </span>
                                </div>
                                <button
                                    onClick={handleGeneratePreview}
                                    disabled={currentCategories.length === 0}
                                    className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    <SparklesIcon className="h-5 w-5" />
                                    Generate New Summaries
                                </button>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {currentCategories.length === 0 && !error && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No categories configured for this stream.
                                </div>
                            )}

                            <div className="space-y-3">
                                {currentCategories.map((category) => (
                                    <div
                                        key={category.category_id}
                                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                                    >
                                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {category.category_name}
                                                    </p>
                                                </div>
                                                {category.current_summary ? (
                                                    <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded flex-shrink-0">
                                                        Has Summary
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded flex-shrink-0">
                                                        No Summary
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            {category.current_summary ? (
                                                <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                    {category.current_summary}
                                                </p>
                                            ) : (
                                                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                                                    No summary available.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Review Stage - Executive Summary */}
                    {stage === 'review' && promptType === 'executive_summary' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <DocumentTextIcon className="h-4 w-4 inline mr-1" />
                                        {currentExecutiveSummary ? 'Has executive summary' : 'No executive summary'}
                                    </span>
                                </div>
                                <button
                                    onClick={handleGeneratePreview}
                                    className="px-5 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors flex items-center gap-2"
                                >
                                    <SparklesIcon className="h-5 w-5" />
                                    Generate New Summary
                                </button>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                                    <div className="flex items-center justify-between">
                                        <p className="font-medium text-gray-900 dark:text-white">
                                            Current Executive Summary
                                        </p>
                                        {currentExecutiveSummary ? (
                                            <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">
                                                Has Summary
                                            </span>
                                        ) : (
                                            <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
                                                No Summary
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="p-4">
                                    {currentExecutiveSummary ? (
                                        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                            {currentExecutiveSummary}
                                        </p>
                                    ) : (
                                        <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                                            No executive summary available yet.
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Review Stage - Stance Analysis */}
                    {stage === 'review' && promptType === 'stance_analysis' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{currentStances.length}</span> articles
                                    </span>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <DocumentMagnifyingGlassIcon className="h-4 w-4 inline mr-1" />
                                        {stancesWithAnalysis} with stance analysis
                                    </span>
                                </div>
                                <button
                                    onClick={handleGeneratePreview}
                                    disabled={currentStances.length === 0}
                                    className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                >
                                    <SparklesIcon className="h-5 w-5" />
                                    Generate Stance Analysis
                                </button>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {currentStances.length === 0 && !error && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    No articles found in this report.
                                </div>
                            )}

                            <div className="space-y-3">
                                {currentStances.map((article) => (
                                    <div
                                        key={article.article_id}
                                        className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden"
                                    >
                                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="font-medium text-gray-900 dark:text-white">
                                                        {article.title}
                                                    </p>
                                                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                        {article.pmid && <span>PMID: {article.pmid}</span>}
                                                        {article.journal && <span>{article.journal}</span>}
                                                        {article.pub_year && <span>{getYearString(article.pub_year)}</span>}
                                                    </div>
                                                </div>
                                                {article.current_stance ? (
                                                    <span className="px-2 py-1 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded flex-shrink-0">
                                                        {(article.current_stance as unknown as StanceAnalysisResult)?.stance || 'Has Analysis'}
                                                    </span>
                                                ) : (
                                                    <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded flex-shrink-0">
                                                        No Analysis
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            {article.current_stance ? (
                                                <StanceAnalysisDisplay
                                                    result={article.current_stance as unknown as StanceAnalysisResult}
                                                    compact={true}
                                                />
                                            ) : (
                                                <p className="text-sm text-gray-400 dark:text-gray-500 italic">
                                                    No stance analysis available.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Generating Stage */}
                    {stage === 'generating' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <ArrowPathIcon className="h-16 w-16 text-purple-500 mx-auto mb-4 animate-spin" />
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Generating...
                            </h4>
                            <p className="text-gray-600 dark:text-gray-400">
                                {promptType === 'article_summary' && `Processing ${currentArticles.length} articles.`}
                                {promptType === 'category_summary' && `Processing ${currentCategories.length} categories.`}
                                {promptType === 'executive_summary' && 'Processing executive summary.'}
                                {promptType === 'stance_analysis' && `Analyzing ${currentStances.length} articles.`}
                                {' '}This may take a moment.
                            </p>
                        </div>
                    )}

                    {/* Compare Stage - Article Summary */}
                    {stage === 'compare' && promptType === 'article_summary' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{articlePreviews.length}</span> articles
                                    </span>
                                    <span className="text-sm text-green-600 dark:text-green-400">
                                        <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                                        {articleSuccessCount} generated
                                    </span>
                                    {articleErrorCount > 0 && (
                                        <span className="text-sm text-red-600 dark:text-red-400">
                                            <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
                                            {articleErrorCount} errors
                                        </span>
                                    )}
                                    <span className="text-sm text-purple-600 dark:text-purple-400">
                                        <CheckIcon className="h-4 w-4 inline mr-1" />
                                        {selectedArticleIds.size} selected
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSelectAllArticles} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                        Select All
                                    </button>
                                    <span className="text-gray-300 dark:text-gray-600">|</span>
                                    <button onClick={handleSelectNoneArticles} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                        Select None
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                {articlePreviews.map((preview) => (
                                    <div
                                        key={preview.article_id}
                                        className={`border rounded-lg overflow-hidden ${
                                            selectedArticleIds.has(preview.article_id)
                                                ? 'border-purple-500 dark:border-purple-400'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        <div
                                            className={`px-4 py-3 flex items-center gap-3 cursor-pointer ${
                                                selectedArticleIds.has(preview.article_id)
                                                    ? 'bg-purple-50 dark:bg-purple-900/20'
                                                    : 'bg-gray-50 dark:bg-gray-800'
                                            }`}
                                            onClick={() => preview.new_summary && !preview.error && handleToggleArticleSelection(preview.article_id)}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                                                preview.error
                                                    ? 'bg-red-100 dark:bg-red-900/30'
                                                    : !preview.new_summary
                                                        ? 'bg-gray-100 dark:bg-gray-700'
                                                        : selectedArticleIds.has(preview.article_id)
                                                            ? 'bg-purple-600'
                                                            : 'border-2 border-gray-300 dark:border-gray-600'
                                            }`}>
                                                {preview.error ? (
                                                    <ExclamationTriangleIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
                                                ) : !preview.new_summary ? (
                                                    <MinusCircleIcon className="h-3 w-3 text-gray-400" />
                                                ) : selectedArticleIds.has(preview.article_id) ? (
                                                    <CheckIcon className="h-3 w-3 text-white" />
                                                ) : null}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 dark:text-white truncate">{preview.title}</p>
                                                {preview.pmid && <p className="text-xs text-gray-500 dark:text-gray-400">PMID: {preview.pmid}</p>}
                                            </div>
                                            {preview.error ? (
                                                <span className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">Error</span>
                                            ) : !preview.new_summary ? (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">No Change</span>
                                            ) : preview.current_summary === preview.new_summary ? (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">Same</span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">New</span>
                                            )}
                                        </div>
                                        {preview.error && (
                                            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-300">{preview.error}</div>
                                        )}
                                        {!preview.error && preview.new_summary && (
                                            <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                                                <div className="p-4">
                                                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Current</h5>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                        {preview.current_summary || <span className="italic text-gray-400">No current summary</span>}
                                                    </p>
                                                </div>
                                                <div className="p-4 bg-green-50/50 dark:bg-green-900/10">
                                                    <h5 className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">New</h5>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{preview.new_summary}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Compare Stage - Category Summary */}
                    {stage === 'compare' && promptType === 'category_summary' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{categoryPreviews.length}</span> categories
                                    </span>
                                    <span className="text-sm text-green-600 dark:text-green-400">
                                        <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                                        {categorySuccessCount} generated
                                    </span>
                                    {categoryErrorCount > 0 && (
                                        <span className="text-sm text-red-600 dark:text-red-400">
                                            <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
                                            {categoryErrorCount} errors
                                        </span>
                                    )}
                                    <span className="text-sm text-purple-600 dark:text-purple-400">
                                        <CheckIcon className="h-4 w-4 inline mr-1" />
                                        {selectedCategoryIds.size} selected
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSelectAllCategories} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                        Select All
                                    </button>
                                    <span className="text-gray-300 dark:text-gray-600">|</span>
                                    <button onClick={handleSelectNoneCategories} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                        Select None
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                {categoryPreviews.map((preview) => (
                                    <div
                                        key={preview.category_id}
                                        className={`border rounded-lg overflow-hidden ${
                                            selectedCategoryIds.has(preview.category_id)
                                                ? 'border-purple-500 dark:border-purple-400'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        <div
                                            className={`px-4 py-3 flex items-center gap-3 cursor-pointer ${
                                                selectedCategoryIds.has(preview.category_id)
                                                    ? 'bg-purple-50 dark:bg-purple-900/20'
                                                    : 'bg-gray-50 dark:bg-gray-800'
                                            }`}
                                            onClick={() => preview.new_summary && !preview.error && handleToggleCategorySelection(preview.category_id)}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                                                preview.error
                                                    ? 'bg-red-100 dark:bg-red-900/30'
                                                    : !preview.new_summary
                                                        ? 'bg-gray-100 dark:bg-gray-700'
                                                        : selectedCategoryIds.has(preview.category_id)
                                                            ? 'bg-purple-600'
                                                            : 'border-2 border-gray-300 dark:border-gray-600'
                                            }`}>
                                                {preview.error ? (
                                                    <ExclamationTriangleIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
                                                ) : !preview.new_summary ? (
                                                    <MinusCircleIcon className="h-3 w-3 text-gray-400" />
                                                ) : selectedCategoryIds.has(preview.category_id) ? (
                                                    <CheckIcon className="h-3 w-3 text-white" />
                                                ) : null}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 dark:text-white">{preview.category_name}</p>
                                            </div>
                                            {preview.error ? (
                                                <span className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">Error</span>
                                            ) : !preview.new_summary ? (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">No Change</span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded">New</span>
                                            )}
                                        </div>
                                        {preview.error && (
                                            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-300">{preview.error}</div>
                                        )}
                                        {!preview.error && preview.new_summary && (
                                            <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                                                <div className="p-4">
                                                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Current</h5>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                        {preview.current_summary || <span className="italic text-gray-400">No current summary</span>}
                                                    </p>
                                                </div>
                                                <div className="p-4 bg-green-50/50 dark:bg-green-900/10">
                                                    <h5 className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide mb-2">New</h5>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{preview.new_summary}</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Compare Stage - Executive Summary */}
                    {stage === 'compare' && promptType === 'executive_summary' && executivePreview && (
                        <div className="space-y-4">
                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            {executivePreview.error ? (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg">
                                    <p className="font-medium">Error generating executive summary:</p>
                                    <p className="text-sm mt-1">{executivePreview.error}</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-6">
                                    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800">
                                            <h5 className="font-medium text-gray-900 dark:text-white">Current Executive Summary</h5>
                                        </div>
                                        <div className="p-4">
                                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                {executivePreview.current || <span className="italic text-gray-400">No current summary</span>}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="border border-green-300 dark:border-green-700 rounded-lg overflow-hidden">
                                        <div className="px-4 py-3 bg-green-50 dark:bg-green-900/20">
                                            <h5 className="font-medium text-green-700 dark:text-green-300">New Executive Summary</h5>
                                        </div>
                                        <div className="p-4 bg-green-50/50 dark:bg-green-900/10">
                                            <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                                {executivePreview.new || <span className="italic text-gray-400">Failed to generate</span>}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Compare Stage - Stance Analysis */}
                    {stage === 'compare' && promptType === 'stance_analysis' && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between pb-4 border-b border-gray-200 dark:border-gray-700">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        <span className="font-medium text-gray-900 dark:text-white">{stancePreviews.length}</span> articles
                                    </span>
                                    <span className="text-sm text-green-600 dark:text-green-400">
                                        <CheckCircleIcon className="h-4 w-4 inline mr-1" />
                                        {stanceSuccessCount} analyzed
                                    </span>
                                    {stanceErrorCount > 0 && (
                                        <span className="text-sm text-red-600 dark:text-red-400">
                                            <ExclamationTriangleIcon className="h-4 w-4 inline mr-1" />
                                            {stanceErrorCount} errors
                                        </span>
                                    )}
                                    <span className="text-sm text-indigo-600 dark:text-indigo-400">
                                        <CheckIcon className="h-4 w-4 inline mr-1" />
                                        {selectedStanceIds.size} selected
                                    </span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button onClick={handleSelectAllStances} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                        Select All
                                    </button>
                                    <span className="text-gray-300 dark:text-gray-600">|</span>
                                    <button onClick={handleSelectNoneStances} className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                                        Select None
                                    </button>
                                </div>
                            </div>

                            {error && (
                                <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <div className="space-y-4">
                                {stancePreviews.map((preview) => (
                                    <div
                                        key={preview.article_id}
                                        className={`border rounded-lg overflow-hidden ${
                                            selectedStanceIds.has(preview.article_id)
                                                ? 'border-indigo-500 dark:border-indigo-400'
                                                : 'border-gray-200 dark:border-gray-700'
                                        }`}
                                    >
                                        <div
                                            className={`px-4 py-3 flex items-center gap-3 cursor-pointer ${
                                                selectedStanceIds.has(preview.article_id)
                                                    ? 'bg-indigo-50 dark:bg-indigo-900/20'
                                                    : 'bg-gray-50 dark:bg-gray-800'
                                            }`}
                                            onClick={() => preview.new_stance && !preview.error && handleToggleStanceSelection(preview.article_id)}
                                        >
                                            <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 ${
                                                preview.error
                                                    ? 'bg-red-100 dark:bg-red-900/30'
                                                    : !preview.new_stance
                                                        ? 'bg-gray-100 dark:bg-gray-700'
                                                        : selectedStanceIds.has(preview.article_id)
                                                            ? 'bg-indigo-600'
                                                            : 'border-2 border-gray-300 dark:border-gray-600'
                                            }`}>
                                                {preview.error ? (
                                                    <ExclamationTriangleIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
                                                ) : !preview.new_stance ? (
                                                    <MinusCircleIcon className="h-3 w-3 text-gray-400" />
                                                ) : selectedStanceIds.has(preview.article_id) ? (
                                                    <CheckIcon className="h-3 w-3 text-white" />
                                                ) : null}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-gray-900 dark:text-white truncate">{preview.title}</p>
                                                {preview.pmid && <p className="text-xs text-gray-500 dark:text-gray-400">PMID: {preview.pmid}</p>}
                                            </div>
                                            {preview.error ? (
                                                <span className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded">Error</span>
                                            ) : !preview.new_stance ? (
                                                <span className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">No Result</span>
                                            ) : (
                                                <span className="px-2 py-1 text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded">
                                                    {(preview.new_stance as unknown as StanceAnalysisResult)?.stance || 'New'}
                                                </span>
                                            )}
                                        </div>
                                        {preview.error && (
                                            <div className="px-4 py-2 bg-red-50 dark:bg-red-900/10 text-sm text-red-700 dark:text-red-300">{preview.error}</div>
                                        )}
                                        {!preview.error && preview.new_stance && (
                                            <div className="grid grid-cols-2 divide-x divide-gray-200 dark:divide-gray-700">
                                                <div className="p-4">
                                                    <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Current</h5>
                                                    {preview.current_stance ? (
                                                        <StanceAnalysisDisplay
                                                            result={preview.current_stance as unknown as StanceAnalysisResult}
                                                            compact={true}
                                                        />
                                                    ) : (
                                                        <span className="text-sm italic text-gray-400">No current analysis</span>
                                                    )}
                                                </div>
                                                <div className="p-4 bg-indigo-50/50 dark:bg-indigo-900/10">
                                                    <h5 className="text-xs font-medium text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-2">New</h5>
                                                    <StanceAnalysisDisplay
                                                        result={preview.new_stance as unknown as StanceAnalysisResult}
                                                        compact={true}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Saving Stage */}
                    {stage === 'saving' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <ArrowPathIcon className="h-16 w-16 text-purple-500 mx-auto mb-4 animate-spin" />
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Applying Changes...
                            </h4>
                            <p className="text-gray-600 dark:text-gray-400">
                                {promptType === 'article_summary' && `Saving ${selectedArticleIds.size} article summaries.`}
                                {promptType === 'category_summary' && `Saving ${selectedCategoryIds.size} category summaries.`}
                                {promptType === 'executive_summary' && 'Saving executive summary.'}
                                {promptType === 'stance_analysis' && `Saving ${selectedStanceIds.size} stance analyses.`}
                            </p>
                        </div>
                    )}

                    {/* Success Stage */}
                    {stage === 'success' && (
                        <div className="max-w-xl mx-auto text-center py-12">
                            <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto mb-4" />
                            <h4 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
                                Update Complete
                            </h4>
                            <p className="text-gray-600 dark:text-gray-400 mb-2">
                                {promptType === 'executive_summary' ? (
                                    'Successfully updated the executive summary.'
                                ) : promptType === 'stance_analysis' ? (
                                    <>Successfully updated <span className="font-semibold text-green-600 dark:text-green-400">{updateCount}</span> stance {updateCount === 1 ? 'analysis' : 'analyses'}.</>
                                ) : (
                                    <>Successfully updated <span className="font-semibold text-green-600 dark:text-green-400">{updateCount}</span> {getItemLabel()} {updateCount === 1 ? 'summary' : 'summaries'}.</>
                                )}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                The changes have been saved to the report.
                            </p>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {stage === 'review' && promptType === 'article_summary' && currentArticles.length > 0 && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click "Generate New Summaries" to create AI summaries using your custom prompt
                        </p>
                    </div>
                )}

                {stage === 'review' && promptType === 'category_summary' && currentCategories.length > 0 && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click "Generate New Summaries" to create AI summaries using your custom prompt
                        </p>
                    </div>
                )}

                {stage === 'review' && promptType === 'executive_summary' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click "Generate New Summary" to create an AI summary using your custom prompt
                        </p>
                    </div>
                )}

                {stage === 'review' && promptType === 'stance_analysis' && currentStances.length > 0 && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                            Click "Generate Stance Analysis" to analyze articles using your custom prompt
                        </p>
                    </div>
                )}

                {stage === 'compare' && promptType === 'article_summary' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleApplySelected}
                            disabled={selectedArticleIds.size === 0}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            <CheckIcon className="h-5 w-5" />
                            Apply {selectedArticleIds.size} Selected
                        </button>
                    </div>
                )}

                {stage === 'compare' && promptType === 'category_summary' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleApplySelected}
                            disabled={selectedCategoryIds.size === 0}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            <CheckIcon className="h-5 w-5" />
                            Apply {selectedCategoryIds.size} Selected
                        </button>
                    </div>
                )}

                {stage === 'compare' && promptType === 'executive_summary' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleApplySelected}
                            disabled={!executivePreview?.new || !!executivePreview?.error}
                            className="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            <CheckIcon className="h-5 w-5" />
                            Apply New Summary
                        </button>
                    </div>
                )}

                {stage === 'compare' && promptType === 'stance_analysis' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between flex-shrink-0">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors">
                            Cancel
                        </button>
                        <button
                            onClick={handleApplySelected}
                            disabled={selectedStanceIds.size === 0}
                            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                        >
                            <CheckIcon className="h-5 w-5" />
                            Apply {selectedStanceIds.size} Selected
                        </button>
                    </div>
                )}

                {stage === 'success' && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-center flex-shrink-0">
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                        >
                            <CheckIcon className="h-5 w-5" />
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
