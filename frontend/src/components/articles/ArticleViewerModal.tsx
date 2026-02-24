import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    XMarkIcon,
    ArrowTopRightOnSquareIcon,
    BeakerIcon,
    PencilSquareIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronDownIcon,
    LinkIcon,
    ScaleIcon,
    FunnelIcon
} from '@heroicons/react/24/outline';
import { ChatBubbleLeftRightIcon, CheckBadgeIcon } from '@heroicons/react/24/solid';
import { documentAnalysisApi } from '../../lib/api/documentAnalysisApi';
import { articleApi, FullTextLink, FullTextContentResponse } from '../../lib/api/articleApi';
import { reportApi } from '../../lib/api/reportApi';
import { trackEvent } from '../../lib/api/trackingApi';
import { ReportArticle } from '../../types/report';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { StanceAnalysisResult } from '../../types/document_analysis';
import ChatTray from '../chat/ChatTray';
import { PayloadHandler } from '../../types/chat';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import StanceAnalysisDisplay, { getStanceInfo } from '../ui/StanceAnalysisDisplay';
import ArticleNotes from './ArticleNotes';
import StarButton from './StarButton';
import CitationMenu from './CitationMenu';
import { formatArticleDate, getYearString } from '../../utils/dateUtils';

type WorkspaceTab = 'analysis' | 'notes' | 'links';

// Union type for articles from different sources
type ViewerArticle = ReportArticle | CanonicalResearchArticle;

// Helper to check if article is database-backed
function isDbBackedArticle(article: ViewerArticle): article is ReportArticle {
    return 'article_id' in article && typeof article.article_id === 'number';
}

// Helper to normalize article data for display
function normalizeArticle(article: ViewerArticle) {
    if (isDbBackedArticle(article)) {
        return {
            id: article.article_id,
            title: article.title,
            authors: article.authors,
            journal: article.journal,
            pmid: article.pmid,
            doi: article.doi,
            abstract: article.abstract,
            url: article.url,
            pub_year: article.pub_year,
            pub_month: article.pub_month,
            pub_day: article.pub_day,
            ai_summary: article.ai_summary,
            ai_enrichments: article.ai_enrichments,
            relevance_score: article.relevance_score,
            relevance_rationale: article.relevance_rationale,
        };
    }
    // CanonicalResearchArticle
    return {
        id: article.id,
        title: article.title,
        authors: article.authors,
        journal: article.journal,
        pmid: article.pmid,
        doi: article.doi,
        abstract: article.abstract,
        url: article.url,
        pub_year: article.pub_year,
        pub_month: article.pub_month,
        pub_day: article.pub_day,
        ai_summary: undefined,
        ai_enrichments: article.ai_enrichments,
        relevance_score: article.relevance_score,
        relevance_rationale: undefined,
    };
}

interface ArticleViewerModalProps {
    articles: ViewerArticle[];
    initialIndex?: number;
    onClose: () => void;
    /** Chat context to pass to the embedded chat tray */
    chatContext?: Record<string, any>;
    /** Payload handlers for chat */
    chatPayloadHandlers?: Record<string, PayloadHandler>;
    /** Callback when article data is updated (notes, enrichments) */
    onArticleUpdate?: (articleId: number, updates: { notes?: string; ai_enrichments?: any }) => void;
    /** If true, articles list is a filtered subset */
    isFiltered?: boolean;
    /** Report title to display in the header (when viewing from a report) */
    reportTitle?: string;
    /** Callback when star is toggled - receives article_id */
    onToggleStar?: (articleId: number) => void;
}

export default function ArticleViewerModal({
    articles,
    initialIndex = 0,
    onClose,
    chatContext,
    chatPayloadHandlers,
    onArticleUpdate,
    isFiltered = false,
    reportTitle,
    onToggleStar
}: ArticleViewerModalProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const rawArticle = articles[currentIndex];
    const article = rawArticle ? normalizeArticle(rawArticle) : null;
    const isDbBacked = rawArticle ? isDbBackedArticle(rawArticle) : false;
    const articleId = isDbBacked && rawArticle ? (rawArticle as ReportArticle).article_id : undefined;

    // Chat state
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Article details collapsed state
    const [detailsExpanded, setDetailsExpanded] = useState(false);

    // Workspace state
    const [activeTab, setActiveTab] = useState<WorkspaceTab>('analysis');

    // Full text links state - keyed by pmid to cache results
    const [fullTextLinksCache, setFullTextLinksCache] = useState<Record<string, FullTextLink[]>>({});
    const [loadingLinks, setLoadingLinks] = useState(false);

    // Full text content state - keyed by pmid to cache results
    const [fullTextContentCache, setFullTextContentCache] = useState<Record<string, FullTextContentResponse>>({});
    const [loadingFullText, setLoadingFullText] = useState(false);

    // Stance analysis state - keyed by article id to preserve results when navigating
    const [stanceCache, setStanceCache] = useState<Record<string, StanceAnalysisResult>>({});
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [analysisError, setAnalysisError] = useState<string | null>(null);

    // Cache key for stance results (works for both DB and non-DB articles)
    const cacheKey = article?.id?.toString();

    // Memoize chat context to include full current article info
    // Must be after stanceCache declaration since it depends on it
    // Override current_page to 'article_viewer' for article-specific chat behavior
    const articleChatContext = useMemo(() => {
        if (!chatContext) return undefined;

        // Use cached stance result if available, otherwise fall back to article's ai_enrichments
        const currentStance = cacheKey ? stanceCache[cacheKey] : null;
        const stanceAnalysis = currentStance || article?.ai_enrichments?.stance_analysis;

        return {
            ...chatContext,
            current_page: 'article_viewer',  // Override to use article_viewer page config
            current_article: article ? {
                // Pass full article data (everything except full text)
                article_id: article.id,
                pmid: article.pmid,
                doi: article.doi,
                title: article.title,
                authors: article.authors,
                journal: article.journal,
                pub_year: article.pub_year,
                pub_month: article.pub_month,
                pub_day: article.pub_day,
                url: article.url,
                abstract: article.abstract,
                ai_summary: article.ai_summary,
                ai_enrichments: article.ai_enrichments,
                relevance_score: article.relevance_score,
                relevance_rationale: article.relevance_rationale,
                // Override stance with cached result if available
                stance_analysis: stanceAnalysis ? {
                    stance: stanceAnalysis.stance,
                    confidence: stanceAnalysis.confidence,
                    analysis: stanceAnalysis.analysis,
                    key_factors: stanceAnalysis.key_factors,
                } : undefined,
            } : undefined
        };
    }, [chatContext, article, cacheKey, stanceCache]);

    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < articles.length - 1;

    const prevArticle = hasPrevious ? normalizeArticle(articles[currentIndex - 1]) : null;
    const nextArticle = hasNext ? normalizeArticle(articles[currentIndex + 1]) : null;

    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) {
            const prevArticle = normalizeArticle(articles[currentIndex - 1]);
            trackEvent('article_navigate', { direction: 'prev', pmid: prevArticle.pmid, article_id: prevArticle.id });
            setCurrentIndex(currentIndex - 1);
        }
    }, [currentIndex, articles]);

    const handleNext = useCallback(() => {
        if (currentIndex < articles.length - 1) {
            const nextArticle = normalizeArticle(articles[currentIndex + 1]);
            trackEvent('article_navigate', { direction: 'next', pmid: nextArticle.pmid, article_id: nextArticle.id });
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, articles]);

    const stanceResult = cacheKey ? stanceCache[cacheKey] : null;
    const streamId = chatContext?.stream_id as number | undefined;
    const reportId = chatContext?.report_id as number | undefined;

    // Initialize caches from article data when article changes
    useEffect(() => {
        if (!article || !cacheKey) return;

        // Initialize stance from article data if not already cached
        if (stanceCache[cacheKey] === undefined && article.ai_enrichments?.stance_analysis) {
            setStanceCache(prev => ({ ...prev, [cacheKey]: article.ai_enrichments!.stance_analysis! }));
        }
    }, [cacheKey]);

    // Reset error state when switching articles (cache is preserved)
    useEffect(() => {
        setAnalysisError(null);
    }, [currentIndex]);

    // Fetch full text links when article changes (on demand, cached)
    const currentLinks = article?.pmid ? fullTextLinksCache[article.pmid] : undefined;

    const fetchFullTextLinks = useCallback(async () => {
        if (!article?.pmid || fullTextLinksCache[article.pmid]) return;

        setLoadingLinks(true);
        try {
            const response = await articleApi.getFullTextLinks(article.pmid);
            setFullTextLinksCache(prev => ({
                ...prev,
                [article.pmid as string]: response.links
            }));
        } catch (error) {
            console.error('Failed to fetch full text links:', error);
            // Cache empty array to prevent repeated failed requests
            setFullTextLinksCache(prev => ({
                ...prev,
                [article.pmid as string]: []
            }));
        } finally {
            setLoadingLinks(false);
        }
    }, [article?.pmid, fullTextLinksCache]);

    // Fetch full text content from PMC
    const currentFullText = article?.pmid ? fullTextContentCache[article.pmid] : undefined;

    const fetchFullTextContent = useCallback(async () => {
        if (!article?.pmid || fullTextContentCache[article.pmid]) return;

        setLoadingFullText(true);
        try {
            const response = await articleApi.getFullTextContent(article.pmid);
            setFullTextContentCache(prev => ({
                ...prev,
                [article.pmid as string]: response
            }));
        } catch (error) {
            console.error('Failed to fetch full text content:', error);
            // Cache error response to prevent repeated failed requests
            setFullTextContentCache(prev => ({
                ...prev,
                [article.pmid as string]: {
                    pmid: article.pmid as string,
                    pmc_id: null,
                    full_text: null,
                    source: null,
                    links: null,
                    error: 'Failed to fetch full text'
                }
            }));
        } finally {
            setLoadingFullText(false);
        }
    }, [article?.pmid, fullTextContentCache]);

    // Auto-fetch full text when switching to the links tab
    useEffect(() => {
        if (activeTab === 'links' && article?.pmid && !fullTextContentCache[article.pmid]) {
            fetchFullTextContent();
        }
    }, [activeTab, article?.pmid, fullTextContentCache, fetchFullTextContent]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                trackEvent('article_close', { pmid: article?.pmid, article_id: article?.id });
                onClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose, article]);


    const runAnalysis = async () => {
        if (!article?.abstract) {
            setAnalysisError('No abstract available for analysis');
            return;
        }

        if (!streamId) {
            setAnalysisError('No research stream context available');
            return;
        }

        trackEvent('article_ai_analysis', { pmid: article.pmid, article_id: article.id });
        setIsAnalyzing(true);
        setAnalysisError(null);

        try {
            const result = await documentAnalysisApi.analyzeStance({
                article: {
                    title: article.title,
                    abstract: article.abstract,
                    authors: article.authors,
                    journal: article.journal,
                    pub_year: article.pub_year,
                    pub_month: article.pub_month,
                    pub_day: article.pub_day,
                    pmid: article.pmid,
                    doi: article.doi
                },
                stream_id: streamId
            });

            // Update local cache
            setStanceCache(prev => ({ ...prev, [cacheKey!]: result }));
            setActiveTab('analysis');

            // Persist to backend if we have a report context AND article is DB-backed
            if (reportId && articleId && isDbBacked) {
                try {
                    const enrichments = { stance_analysis: result };
                    await reportApi.updateArticleEnrichments(reportId, articleId, enrichments);
                    // Notify parent of the update
                    onArticleUpdate?.(articleId, { ai_enrichments: enrichments });
                } catch (saveErr) {
                    console.error('Failed to save stance analysis:', saveErr);
                    // Don't fail the operation - the analysis is still visible locally
                }
            }
        } catch (err) {
            setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
        } finally {
            setIsAnalyzing(false);
        }
    };

    const formatAuthors = (authors: string[]) => {
        if (!authors || authors.length === 0) return 'Unknown authors';
        return authors.join(', ');
    };

    const truncateTitle = (title: string, maxLength: number = 80) => {
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength).trim() + '...';
    };

    const tabs = [
        { id: 'analysis' as WorkspaceTab, label: 'Analysis', icon: BeakerIcon },
        { id: 'notes' as WorkspaceTab, label: 'Notes', icon: PencilSquareIcon },
        { id: 'links' as WorkspaceTab, label: 'Full Text', icon: LinkIcon }
    ];

    const handleClose = useCallback(() => {
        trackEvent('article_close', { pmid: article?.pmid, article_id: article?.id });
        onClose();
    }, [article, onClose]);

    if (!article) {
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/50"
                onClick={handleClose}
            />

            {/* Modal */}
            <div
                className="relative w-[95vw] h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-4">
                        {/* Navigation arrows */}
                        {articles.length > 1 && (
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={handlePrevious}
                                    disabled={!hasPrevious}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={prevArticle ? `Previous: ${prevArticle.title.substring(0, 50)}${prevArticle.title.length > 50 ? '...' : ''}` : 'Previous article'}
                                >
                                    <ChevronLeftIcon className="h-5 w-5" />
                                </button>
                                <span className="text-sm text-gray-500 min-w-[60px] text-center">
                                    {currentIndex + 1} / {articles.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    disabled={!hasNext}
                                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={nextArticle ? `Next: ${nextArticle.title.substring(0, 50)}${nextArticle.title.length > 50 ? '...' : ''}` : 'Next article'}
                                >
                                    <ChevronRightIcon className="h-5 w-5" />
                                </button>
                            </div>
                        )}
                        <div>
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Article Viewer
                            </h2>
                            {reportTitle && (
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {reportTitle}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Star button - only show if we have starring callback and a DB-backed article */}
                        {onToggleStar && articleId && isDbBacked && (
                            <StarButton
                                isStarred={(rawArticle as ReportArticle).is_starred ?? false}
                                onToggle={() => onToggleStar(articleId)}
                                size="md"
                            />
                        )}
                        <CitationMenu article={article} />
                        <button
                            type="button"
                            onClick={handleClose}
                            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                            title="Close (Escape)"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Main content */}
                <div className="flex-1 flex overflow-hidden relative">
                    {/* Chat toggle button - fixed to lower left of modal */}
                    {articleChatContext && !isChatOpen && (
                        <button
                            type="button"
                            onClick={() => {
                                trackEvent('chat_open', { page: 'article_modal', pmid: article.pmid, article_id: article.id });
                                setIsChatOpen(true);
                            }}
                            className="absolute bottom-6 left-6 z-40 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                            title="Open chat"
                        >
                            <ChatBubbleLeftRightIcon className="h-6 w-6" />
                        </button>
                    )}
                    {/* Inline Chat Tray */}
                    {articleChatContext && (
                        <ChatTray
                            isOpen={isChatOpen}
                            onOpenChange={(open) => {
                                if (!open) {
                                    trackEvent('chat_close', { page: 'article_modal', pmid: article.pmid, article_id: article.id });
                                }
                                setIsChatOpen(open);
                            }}
                            initialContext={articleChatContext}
                            payloadHandlers={chatPayloadHandlers}
                        />
                    )}

                    {/* Left sidebar - Article list (only if multiple articles) */}
                    {articles.length > 1 && (
                        <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto">
                                <div className="p-2">
                                    <div className="flex items-center justify-between px-2 py-1">
                                        <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                                            Articles ({articles.length})
                                        </h3>
                                        {isFiltered && (
                                            <span className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400" title="Showing filtered results">
                                                <FunnelIcon className="h-3 w-3" />
                                                Filtered
                                            </span>
                                        )}
                                    </div>
                                    <div className="space-y-1">
                                        {articles.map((art, idx) => {
                                            const normalized = normalizeArticle(art);
                                            return (
                                                <button
                                                    type="button"
                                                    key={normalized.id}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        setCurrentIndex(idx);
                                                    }}
                                                    className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${idx === currentIndex
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-100'
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                        }`}
                                                >
                                                    <div className="font-medium leading-tight line-clamp-2">
                                                        {truncateTitle(normalized.title, 50)}
                                                    </div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                        {getYearString(normalized.pub_year)} {normalized.journal && `• ${normalized.journal.substring(0, 15)}`}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main panel */}
                    <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-gray-800">
                        {/* Article header section */}
                        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-6 py-4">
                            {/* Title */}
                            <h1 className="text-xl font-bold text-gray-900 dark:text-white leading-tight">
                                {article.title}
                            </h1>

                            {/* Authors */}
                            <p className="mt-1.5 text-sm text-gray-600 dark:text-gray-400">
                                {formatAuthors(article.authors)}
                            </p>

                            {/* Journal, Date, PMID row */}
                            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                                {article.journal && (
                                    <span className="text-gray-700 dark:text-gray-300 font-medium">{article.journal}</span>
                                )}
                                {article.pub_year && (
                                    <span className="text-gray-500 dark:text-gray-400">
                                        {formatArticleDate(article.pub_year, article.pub_month, article.pub_day)}
                                    </span>
                                )}
                                {article.pmid && (
                                    <a
                                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => trackEvent('article_link_click', { type: 'pubmed', pmid: article.pmid })}
                                        className="text-blue-600 dark:text-blue-400 font-mono hover:underline flex items-center gap-1"
                                    >
                                        PMID: {article.pmid}
                                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                    </a>
                                )}
                                {article.doi && (
                                    <a
                                        href={`https://doi.org/${article.doi}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        onClick={() => trackEvent('article_link_click', { type: 'doi', pmid: article.pmid, doi: article.doi })}
                                        className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                                    >
                                        DOI: {article.doi}
                                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                    </a>
                                )}
                            </div>

                            {/* Collapsible details: Why This Article, AI Summary, Abstract */}
                            {(article.relevance_rationale || article.ai_summary || article.abstract) && (
                                <div className="mt-3">
                                    <button
                                        type="button"
                                        onClick={() => setDetailsExpanded(!detailsExpanded)}
                                        className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                                    >
                                        <ChevronDownIcon className={`h-4 w-4 transition-transform ${detailsExpanded ? '' : '-rotate-90'}`} />
                                        <span>
                                            {detailsExpanded ? 'Hide' : 'Show'} details
                                            {article.relevance_rationale && !detailsExpanded && (
                                                <span className="ml-2 text-xs text-blue-500">relevance</span>
                                            )}
                                            {article.ai_summary && !detailsExpanded && (
                                                <span className="ml-2 text-xs text-purple-500">summary</span>
                                            )}
                                            {article.abstract && !detailsExpanded && (
                                                <span className="ml-2 text-xs text-gray-400">abstract</span>
                                            )}
                                        </span>
                                    </button>

                                    {detailsExpanded && (
                                        <div className="mt-3 space-y-3 max-h-[40vh] overflow-y-auto">
                                            {/* Relevance Rationale */}
                                            {article.relevance_rationale && (
                                                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border-l-4 border-blue-400 dark:border-blue-600">
                                                    <p className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide mb-1">
                                                        Why This Article
                                                    </p>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                                        {article.relevance_rationale}
                                                    </p>
                                                </div>
                                            )}

                                            {/* AI Summary */}
                                            {article.ai_summary && (
                                                <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border-l-4 border-purple-400 dark:border-purple-600">
                                                    <p className="text-xs font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wide mb-1">
                                                        AI Summary
                                                    </p>
                                                    <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                                                        {article.ai_summary}
                                                    </p>
                                                </div>
                                            )}

                                            {/* Abstract */}
                                            <div>
                                                <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">
                                                    Abstract
                                                </p>
                                                {article.abstract ? (
                                                    <MarkdownRenderer
                                                        content={article.abstract}
                                                        className="text-sm"
                                                        compact
                                                    />
                                                ) : (
                                                    <p className="text-gray-500 dark:text-gray-400 italic text-sm">
                                                        No abstract available
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Tab bar */}
                        <div className="flex-shrink-0 flex items-center gap-1 px-4 pt-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                            {tabs.map(({ id, label, icon: Icon }) => (
                                <button
                                    type="button"
                                    key={id}
                                    onClick={() => {
                                        if (activeTab !== id) {
                                            trackEvent('article_tab_click', { tab: id, pmid: article.pmid, article_id: article.id });
                                        }
                                        setActiveTab(id);
                                    }}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-colors ${activeTab === id
                                        ? 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white'
                                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800'
                                        }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                    {id === 'analysis' && stanceResult && (
                                        <span className={`ml-1 px-1.5 py-0.5 ${getStanceInfo(stanceResult.stance).bgColor} ${getStanceInfo(stanceResult.stance).color} rounded text-xs`}>
                                            {getStanceInfo(stanceResult.stance).label}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>

                        {/* Tab content */}
                        <div className="flex-1 overflow-y-auto">
                            {/* Analysis Tab */}
                            {activeTab === 'analysis' && (
                                <div className="h-full flex flex-col">
                                    {/* Empty state - no analysis yet */}
                                    {!stanceResult && !isAnalyzing && !analysisError && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center max-w-md">
                                                <ScaleIcon className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                                                <p className="text-gray-600 dark:text-gray-400 mb-4">
                                                    {!streamId
                                                        ? 'No research stream context available for stance analysis'
                                                        : article.abstract
                                                            ? 'Run AI analysis to evaluate this article\'s stance'
                                                            : 'No abstract available for analysis'}
                                                </p>
                                                {article.abstract && streamId && (
                                                    <button
                                                        type="button"
                                                        onClick={runAnalysis}
                                                        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                                                    >
                                                        <BeakerIcon className="h-5 w-5" />
                                                        Run AI Analysis
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Loading state */}
                                    {isAnalyzing && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center">
                                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                                <p className="text-gray-600 dark:text-gray-400">
                                                    Analyzing article stance...
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Error state */}
                                    {analysisError && (
                                        <div className="p-4">
                                            <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                                                <p className="text-red-800 dark:text-red-200">{analysisError}</p>
                                                {streamId && article.abstract && (
                                                    <button
                                                        type="button"
                                                        onClick={runAnalysis}
                                                        className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700"
                                                    >
                                                        Try Again
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Results state */}
                                    {stanceResult && (
                                        <div className="p-6">
                                            <StanceAnalysisDisplay result={stanceResult} />

                                            {/* Re-analyze button */}
                                            <div className="pt-4 mt-6 border-t border-gray-200 dark:border-gray-700">
                                                <button
                                                    type="button"
                                                    onClick={runAnalysis}
                                                    className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                                                >
                                                    <BeakerIcon className="h-4 w-4" />
                                                    Re-analyze
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Notes Tab */}
                            {activeTab === 'notes' && (
                                <div className="h-full p-4">
                                    {reportId && articleId && isDbBacked ? (
                                        <ArticleNotes reportId={reportId} articleId={articleId} />
                                    ) : (
                                        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                            {!isDbBacked
                                                ? 'Notes are not available for workbench articles (not saved to database)'
                                                : 'Notes require a report context'}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Full Text Tab */}
                            {activeTab === 'links' && (
                                <div className="h-full flex flex-col">
                                    {/* Loading state */}
                                    {loadingFullText && (
                                        <div className="flex-1 flex items-center justify-center">
                                            <div className="text-center">
                                                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                                                <p className="text-gray-600 dark:text-gray-400">
                                                    Fetching full text...
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Full text content available */}
                                    {!loadingFullText && currentFullText?.full_text && (
                                        <div className="flex-1 flex flex-col min-h-0">
                                            <div className="flex-shrink-0 px-6 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700 bg-green-50 dark:bg-green-900/20">
                                                <div className="flex items-center gap-2">
                                                    <CheckBadgeIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                                                    <span className="font-medium text-green-700 dark:text-green-300">
                                                        {currentFullText.source === 'database'
                                                            ? 'Full text (cached)'
                                                            : 'Full text from PubMed Central'}
                                                    </span>
                                                    {currentFullText.pmc_id && (
                                                        <span className="text-sm text-green-600 dark:text-green-400">
                                                            ({currentFullText.pmc_id})
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-6">
                                                <MarkdownRenderer
                                                    content={currentFullText.full_text}
                                                    className="prose dark:prose-invert max-w-none"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* No full text - show links */}
                                    {!loadingFullText && currentFullText && !currentFullText.full_text && (
                                        <div className="p-6">
                                            {/* Info about no full text */}
                                            <div className="mb-4 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                                                <p className="text-amber-700 dark:text-amber-300 text-sm">
                                                    {currentFullText.error || 'Full text is not available.'}
                                                </p>
                                            </div>

                                            {/* Links from API response */}
                                            {currentFullText.links && currentFullText.links.length > 0 && (
                                                <>
                                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                                        Alternative Full Text Sources
                                                    </h2>
                                                    <div className="space-y-3 max-w-xl">
                                                        {currentFullText.links.map((link, idx) => (
                                                            <a
                                                                key={`${link.provider}-${idx}`}
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={() => trackEvent('article_link_click', { type: 'fulltext', provider: link.provider, pmid: article.pmid, is_free: link.is_free })}
                                                                className={`block px-4 py-3 rounded-lg ${link.is_free
                                                                    ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
                                                                    : 'bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                                                                    }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        {link.is_free && <CheckBadgeIcon className="h-5 w-5 text-green-600 dark:text-green-400" />}
                                                                        <span className={`font-medium ${link.is_free ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                                                            {link.provider}
                                                                        </span>
                                                                    </div>
                                                                    <ArrowTopRightOnSquareIcon className={`h-5 w-5 ${link.is_free ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
                                                                </div>
                                                                {link.categories.length > 0 && (
                                                                    <p className={`text-sm mt-1 ${link.is_free ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                        {link.is_free ? 'Free full text' : link.categories.join(', ')}
                                                                    </p>
                                                                )}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </>
                                            )}

                                            {/* No links in response - offer to fetch separately (fallback) */}
                                            {(!currentFullText.links || currentFullText.links.length === 0) && (
                                                <div className="space-y-3 max-w-xl">
                                                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                                                        Alternative Full Text Sources
                                                    </h2>

                                                    {/* Button to fetch links if not already fetched */}
                                                    {currentLinks === undefined && (
                                                        <button
                                                            type="button"
                                                            onClick={fetchFullTextLinks}
                                                            disabled={loadingLinks}
                                                            className="w-full px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-left"
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    <LinkIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                                                    <span className="font-medium text-blue-700 dark:text-blue-300">
                                                                        {loadingLinks ? 'Searching...' : 'Search for full text options'}
                                                                    </span>
                                                                </div>
                                                                {loadingLinks && (
                                                                    <svg className="animate-spin h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24">
                                                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                                                    </svg>
                                                                )}
                                                            </div>
                                                            <p className="text-sm text-blue-600 dark:text-blue-400 mt-1">
                                                                Check PubMed LinkOut for additional sources
                                                            </p>
                                                        </button>
                                                    )}

                                                    {/* Links from separate fetch */}
                                                    {currentLinks && currentLinks.length > 0 && currentLinks.map((link, idx) => (
                                                        <a
                                                            key={`${link.provider}-${idx}`}
                                                            href={link.url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            onClick={() => trackEvent('article_link_click', { type: 'fulltext', provider: link.provider, pmid: article.pmid, is_free: link.is_free })}
                                                            className={`block px-4 py-3 rounded-lg ${link.is_free
                                                                ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/30'
                                                                : 'bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                                                                }`}
                                                        >
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center gap-2">
                                                                    {link.is_free && <CheckBadgeIcon className="h-5 w-5 text-green-600 dark:text-green-400" />}
                                                                    <span className={`font-medium ${link.is_free ? 'text-green-700 dark:text-green-300' : 'text-gray-700 dark:text-gray-300'}`}>
                                                                        {link.provider}
                                                                    </span>
                                                                </div>
                                                                <ArrowTopRightOnSquareIcon className={`h-5 w-5 ${link.is_free ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`} />
                                                            </div>
                                                            {link.categories.length > 0 && (
                                                                <p className={`text-sm mt-1 ${link.is_free ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                                                    {link.is_free ? 'Free full text' : link.categories.join(', ')}
                                                                </p>
                                                            )}
                                                        </a>
                                                    ))}

                                                    {/* No links found message */}
                                                    {currentLinks !== undefined && currentLinks.length === 0 && (
                                                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
                                                            <p className="text-gray-500 dark:text-gray-400">
                                                                No full text sources found in PubMed LinkOut
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* DOI link - always show as last resort */}
                                            {article.doi && (
                                                <div className="mt-4 max-w-xl">
                                                    <a
                                                        href={`https://doi.org/${article.doi}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={() => trackEvent('article_link_click', { type: 'doi', pmid: article.pmid, doi: article.doi })}
                                                        className="block px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                                    >
                                                        <div className="flex items-center justify-between">
                                                            <span className="font-medium text-amber-700 dark:text-amber-300">Publisher (via DOI)</span>
                                                            <ArrowTopRightOnSquareIcon className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                                                        </div>
                                                        <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
                                                            May require subscription or purchase
                                                        </p>
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}
