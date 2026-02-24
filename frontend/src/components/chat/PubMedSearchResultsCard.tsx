import { useState, useRef } from 'react';
import {
    MagnifyingGlassIcon,
    DocumentTextIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    ArrowTopRightOnSquareIcon,
    ClipboardDocumentIcon,
    TableCellsIcon
} from '@heroicons/react/24/outline';
import ExportMenu from '../ui/ExportMenu';
import {
    formatSearchResultsForClipboard,
    formatSearchResultsAsCSV,
    downloadCSV,
    generatePDF,
    copyWithToast,
} from '../../lib/utils/export';

export interface PubMedSearchResult {
    pmid: string;
    title: string;
    authors: string;
    journal: string;
    publication_date: string;
    abstract: string;
    has_free_full_text: boolean;
}

export interface PubMedSearchResultsData {
    query: string;
    total_results: number;
    showing: number;
    articles: PubMedSearchResult[];
}

interface PubMedSearchResultsCardProps {
    data: PubMedSearchResultsData;
}

export default function PubMedSearchResultsCard({ data }: PubMedSearchResultsCardProps) {
    const contentRef = useRef<HTMLDivElement>(null);
    const [expandedPmid, setExpandedPmid] = useState<string | null>(null);

    const toggleExpand = (pmid: string) => {
        setExpandedPmid(expandedPmid === pmid ? null : pmid);
    };

    const exportOptions = [
        {
            label: 'Copy as Table',
            icon: ClipboardDocumentIcon,
            onClick: () => copyWithToast(formatSearchResultsForClipboard(data), 'Search results'),
        },
        {
            label: 'Download CSV',
            icon: TableCellsIcon,
            onClick: () => {
                const csv = formatSearchResultsAsCSV(data);
                const safeName = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                downloadCSV(csv, `search-${safeName}.csv`);
            },
        },
        {
            label: 'Download PDF',
            icon: DocumentTextIcon,
            onClick: () => {
                if (contentRef.current) {
                    const safeName = data.query.replace(/[^a-z0-9]/gi, '_').substring(0, 30);
                    generatePDF(contentRef.current, `search-${safeName}.pdf`, { orientation: 'landscape' });
                }
            },
        },
    ];

    return (
        <div className="space-y-4" ref={contentRef}>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <MagnifyingGlassIcon className="h-5 w-5 text-blue-500" />
                    <span className="font-medium text-gray-900 dark:text-white">
                        Search: "{data.query}"
                    </span>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                        Showing {data.showing} of {data.total_results.toLocaleString()} results
                    </span>
                    <ExportMenu options={exportOptions} />
                </div>
            </div>

            {/* Results Table */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Article
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32">
                                Journal
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-16">
                                Year
                            </th>
                            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-24">
                                PMID
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                        {data.articles.map((article) => (
                            <tr key={article.pmid} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                <td className="px-4 py-3">
                                    <div className="space-y-1">
                                        <div className="flex items-start gap-2">
                                            <button
                                                onClick={() => toggleExpand(article.pmid)}
                                                className="mt-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 flex-shrink-0"
                                            >
                                                {expandedPmid === article.pmid ? (
                                                    <ChevronUpIcon className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDownIcon className="h-4 w-4" />
                                                )}
                                            </button>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-white leading-snug">
                                                    {article.title}
                                                </p>
                                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                                    {article.authors}
                                                </p>
                                            </div>
                                            {article.has_free_full_text && (
                                                <span className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200">
                                                    <DocumentTextIcon className="h-3 w-3 mr-1" />
                                                    Free
                                                </span>
                                            )}
                                        </div>

                                        {/* Expanded Abstract */}
                                        {expandedPmid === article.pmid && article.abstract && (
                                            <div className="ml-6 mt-2 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                                                {article.abstract}
                                            </div>
                                        )}
                                    </div>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 align-top">
                                    <span className="line-clamp-2">{article.journal}</span>
                                </td>
                                <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 align-top">
                                    {article.publication_date}
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <a
                                        href={`https://pubmed.ncbi.nlm.nih.gov/${article.pmid}/`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                        {article.pmid}
                                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                    </a>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* Footer */}
            {data.total_results > data.showing && (
                <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                    Showing top {data.showing} results. Ask for more specific queries to narrow down results.
                </p>
            )}
        </div>
    );
}
