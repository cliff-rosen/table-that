import { useState, useRef } from 'react';
import {
    DocumentTextIcon,
    LinkIcon,
    UserGroupIcon,
    BookOpenIcon,
    CalendarIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ClipboardDocumentIcon,
    CheckIcon,
    ExclamationCircleIcon,
    DocumentDuplicateIcon
} from '@heroicons/react/24/outline';
import { MarkdownRenderer } from '../ui/MarkdownRenderer';
import { copyToClipboard } from '../../lib/utils/clipboard';
import ExportMenu from '../ui/ExportMenu';
import { formatPubMedArticleForClipboard, generatePDF, copyWithToast } from '../../lib/utils/export';

export interface PubMedArticleData {
    pmid: string;
    title: string;
    authors: string;
    journal: string;
    publication_date: string;
    volume?: string;
    issue?: string;
    pages?: string;
    abstract?: string;
    pmc_id?: string;
    doi?: string;
    full_text?: string;
}

interface PubMedArticleCardProps {
    article: PubMedArticleData;
}

export default function PubMedArticleCard({ article }: PubMedArticleCardProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [showFullText, setShowFullText] = useState(false);
    const [copiedField, setCopiedField] = useState<string | null>(null);
    const [copyError, setCopyError] = useState(false);

    const handleCopy = async (text: string, field: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        setCopyError(false);

        const result = await copyToClipboard(text);
        if (result.success) {
            setCopiedField(field);
            setTimeout(() => setCopiedField(null), 2000);
        } else {
            setCopyError(true);
            setTimeout(() => setCopyError(false), 2000);
        }
    };

    const pubmedUrl = `https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`;
    const pmcUrl = article.pmc_id ? `https://www.ncbi.nlm.nih.gov/pmc/articles/${article.pmc_id}/` : null;
    const doiUrl = article.doi ? `https://doi.org/${article.doi}` : null;

    const exportOptions = [
        {
            label: 'Copy All Fields',
            icon: DocumentDuplicateIcon,
            onClick: () => copyWithToast(formatPubMedArticleForClipboard(article), 'Article'),
        },
        {
            label: 'Download PDF',
            icon: DocumentTextIcon,
            onClick: () => {
                if (contentRef.current) {
                    generatePDF(contentRef.current, `pubmed-${article.pmid}.pdf`);
                }
            },
        },
    ];

    return (
        <div className="space-y-4" ref={contentRef}>
            {/* Export + Title */}
            <div className="flex items-start justify-between gap-2">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                    {article.title}
                </h3>
                <div className="flex-shrink-0">
                    <ExportMenu options={exportOptions} />
                </div>
            </div>

            {/* Authors */}
            <div className="flex items-start gap-2">
                <UserGroupIcon className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-gray-600 dark:text-gray-300">
                    {article.authors}
                </p>
            </div>

            {/* Journal & Date */}
            <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                    <BookOpenIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">{article.journal}</span>
                </div>
                <div className="flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4 text-gray-400" />
                    <span className="text-gray-700 dark:text-gray-300">{article.publication_date}</span>
                </div>
                {article.volume && (
                    <span className="text-gray-500 dark:text-gray-400">
                        Vol. {article.volume}{article.issue && `, Issue ${article.issue}`}{article.pages && `, pp. ${article.pages}`}
                    </span>
                )}
            </div>

            {/* IDs & Links */}
            <div className="flex flex-wrap gap-2">
                {/* PMID Badge */}
                <a
                    href={pubmedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                    <LinkIcon className="h-3.5 w-3.5" />
                    PMID: {article.pmid}
                </a>

                {/* PMC Badge (if available) */}
                {article.pmc_id && pmcUrl && (
                    <a
                        href={pmcUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded-full text-xs font-medium hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
                    >
                        <DocumentTextIcon className="h-3.5 w-3.5" />
                        {article.pmc_id} (Free Full Text)
                    </a>
                )}

                {/* DOI Badge (if available) */}
                {article.doi && doiUrl && (
                    <a
                        href={doiUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded-full text-xs font-medium hover:bg-purple-200 dark:hover:bg-purple-900/50 transition-colors"
                    >
                        <LinkIcon className="h-3.5 w-3.5" />
                        DOI
                    </a>
                )}
            </div>

            {/* Abstract Section */}
            {article.abstract && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                            Abstract
                        </h4>
                        <button
                            type="button"
                            onClick={(e) => handleCopy(article.abstract!, 'abstract', e)}
                            className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                        >
                            {copiedField === 'abstract' ? (
                                <>
                                    <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                                    Copied!
                                </>
                            ) : copyError ? (
                                <>
                                    <ExclamationCircleIcon className="h-3.5 w-3.5 text-red-500" />
                                    Failed
                                </>
                            ) : (
                                <>
                                    <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                    Copy
                                </>
                            )}
                        </button>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed whitespace-pre-wrap">
                        {article.abstract}
                    </p>
                </div>
            )}

            {/* Full Text Section (collapsible) */}
            {article.full_text && (
                <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                    <button
                        type="button"
                        onClick={() => setShowFullText(!showFullText)}
                        className="flex items-center justify-between w-full text-left"
                    >
                        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide flex items-center gap-2">
                            <DocumentTextIcon className="h-4 w-4 text-green-500" />
                            Full Text Available
                        </h4>
                        {showFullText ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                        ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                        )}
                    </button>

                    {showFullText && (
                        <div className="mt-3">
                            <div className="flex justify-end mb-2">
                                <button
                                    type="button"
                                    onClick={(e) => handleCopy(article.full_text!, 'fulltext', e)}
                                    className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                                >
                                    {copiedField === 'fulltext' ? (
                                        <>
                                            <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                                            Copied!
                                        </>
                                    ) : copyError ? (
                                        <>
                                            <ExclamationCircleIcon className="h-3.5 w-3.5 text-red-500" />
                                            Failed
                                        </>
                                    ) : (
                                        <>
                                            <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                            Copy Full Text
                                        </>
                                    )}
                                </button>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg p-4 max-h-[600px] overflow-y-auto border border-gray-200 dark:border-gray-700">
                                <MarkdownRenderer content={article.full_text!} className="text-sm" />
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Citation */}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
                <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Citation
                    </h4>
                    <button
                        type="button"
                        onClick={(e) => {
                            const citation = `${article.authors}. ${article.title}. ${article.journal}. ${article.publication_date};${article.volume || ''}(${article.issue || ''}):${article.pages || ''}. PMID: ${article.pmid}${article.doi ? `. doi: ${article.doi}` : ''}`;
                            handleCopy(citation, 'citation', e);
                        }}
                        className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 flex items-center gap-1"
                    >
                        {copiedField === 'citation' ? (
                            <>
                                <CheckIcon className="h-3.5 w-3.5 text-green-500" />
                                Copied!
                            </>
                        ) : copyError ? (
                            <>
                                <ExclamationCircleIcon className="h-3.5 w-3.5 text-red-500" />
                                Failed
                            </>
                        ) : (
                            <>
                                <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                                Copy Citation
                            </>
                        )}
                    </button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                    {article.authors}. {article.title}. <em>{article.journal}</em>. {article.publication_date}
                    {article.volume && `;${article.volume}`}
                    {article.issue && `(${article.issue})`}
                    {article.pages && `:${article.pages}`}
                    . PMID: {article.pmid}
                    {article.doi && `. doi: ${article.doi}`}
                </p>
            </div>
        </div>
    );
}
