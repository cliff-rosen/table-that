import { useState } from 'react';
import { ClipboardDocumentIcon } from '@heroicons/react/24/outline';
import {
    formatCitationAMA,
    formatCitationAPA,
    formatCitationNLM,
    formatCitationBibTeX,
    copyWithToast,
} from '../../lib/utils/export';

interface CitationArticle {
    title: string;
    authors: string | string[];
    journal?: string;
    pub_year?: number;
    pub_month?: number;
    pmid?: string;
    doi?: string;
}

interface CitationMenuProps {
    article: CitationArticle;
}

const FORMATS = [
    { label: 'AMA', fn: formatCitationAMA },
    { label: 'APA', fn: formatCitationAPA },
    { label: 'NLM', fn: formatCitationNLM },
    { label: 'BibTeX', fn: formatCitationBibTeX },
] as const;

export default function CitationMenu({ article }: CitationMenuProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="p-2 rounded-md transition-colors bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
                title="Copy citation"
            >
                <ClipboardDocumentIcon className="h-5 w-5" />
            </button>

            {isOpen && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
                    <div className="absolute top-full mt-1 right-0 w-52 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-20 py-1">
                        <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                            Copy Citation
                        </div>
                        {FORMATS.map(({ label, fn }) => (
                            <button
                                key={label}
                                type="button"
                                onClick={() => {
                                    setIsOpen(false);
                                    copyWithToast(fn(article), `${label} citation`);
                                }}
                                className="w-full flex items-center gap-3 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
