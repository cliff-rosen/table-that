import { useState, useEffect } from 'react';
import { ArrowPathIcon, DocumentTextIcon, CheckCircleIcon, XCircleIcon, ArrowTopRightOnSquareIcon, ClipboardIcon, ArrowDownTrayIcon, CheckIcon } from '@heroicons/react/24/outline';
import { researchStreamApi, CurationNoteItem } from '../../lib/api/researchStreamApi';
import { copyToClipboard } from '../../lib/utils/clipboard';

interface CurationNotesTabProps {
    streamId: number;
}

export default function CurationNotesTab({ streamId }: CurationNotesTabProps) {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [notes, setNotes] = useState<CurationNoteItem[]>([]);
    const [totalCount, setTotalCount] = useState(0);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        loadCurationNotes();
    }, [streamId]);

    const loadCurationNotes = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await researchStreamApi.getCurationNotes(streamId);
            setNotes(response.notes);
            setTotalCount(response.total_count);
        } catch (err) {
            console.error('Failed to load curation notes:', err);
            setError('Failed to load curation notes');
        } finally {
            setLoading(false);
        }
    };

    const formatDate = (dateStr: string | null): string => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleString();
    };

    const formatNotesForExport = (): string => {
        if (notes.length === 0) return '';

        const lines: string[] = [
            `# Curation Notes (${totalCount} total)`,
            `Exported: ${new Date().toLocaleString()}`,
            '',
            '---',
            ''
        ];

        notes.forEach((note, index) => {
            const action = note.curator_included ? '[INCLUDED]' : note.curator_excluded ? '[EXCLUDED]' : '';
            lines.push(`## ${index + 1}. ${note.title}`);
            if (action) lines.push(`**Action:** ${action}`);
            if (note.pmid) lines.push(`**PMID:** ${note.pmid} (https://pubmed.ncbi.nlm.nih.gov/${note.pmid})`);
            if (note.curator_name) lines.push(`**Curator:** ${note.curator_name}`);
            if (note.curated_at) lines.push(`**Date:** ${formatDate(note.curated_at)}`);
            if (note.report_id) lines.push(`**Report:** #${note.report_id}`);
            lines.push('');
            lines.push('**Note:**');
            lines.push(note.curation_notes);
            lines.push('');
            lines.push('---');
            lines.push('');
        });

        return lines.join('\n');
    };

    const handleCopyToClipboard = async () => {
        const text = formatNotesForExport();
        const result = await copyToClipboard(text);
        if (result.success) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } else {
            console.error('Failed to copy to clipboard:', result.error);
        }
    };

    const handleExport = () => {
        const text = formatNotesForExport();
        const blob = new Blob([text], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `curation-notes-stream-${streamId}.md`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center py-12">
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <button
                    onClick={loadCurationNotes}
                    className="mt-4 px-4 py-2 text-sm text-blue-600 hover:underline"
                >
                    Try again
                </button>
            </div>
        );
    }

    if (notes.length === 0) {
        return (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>No curation notes recorded</p>
                <p className="text-sm mt-1">Notes will appear here when curators add them to articles</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Header - fixed */}
            <div className="flex-shrink-0 flex items-center justify-between pb-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Curation Notes ({totalCount})
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleCopyToClipboard}
                        className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Copy to clipboard"
                    >
                        {copied ? (
                            <>
                                <CheckIcon className="h-4 w-4 text-green-600" />
                                <span className="text-green-600">Copied!</span>
                            </>
                        ) : (
                            <>
                                <ClipboardIcon className="h-4 w-4" />
                                Copy
                            </>
                        )}
                    </button>
                    <button
                        onClick={handleExport}
                        className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"
                        title="Export as Markdown"
                    >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Export
                    </button>
                    <button
                        onClick={loadCurationNotes}
                        className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20"
                    >
                        <ArrowPathIcon className="h-4 w-4" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Notes List - scrollable */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-3">
                {notes.map((note) => (
                    <div
                        key={note.wip_article_id}
                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                    >
                        {/* Article Header */}
                        <div className="flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                    {/* Action badge */}
                                    {note.curator_included && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">
                                            <CheckCircleIcon className="h-3 w-3" />
                                            Included
                                        </span>
                                    )}
                                    {note.curator_excluded && (
                                        <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300">
                                            <XCircleIcon className="h-3 w-3" />
                                            Excluded
                                        </span>
                                    )}
                                    {/* PMID link */}
                                    {note.pmid && (
                                        <a
                                            href={`https://pubmed.ncbi.nlm.nih.gov/${note.pmid}`}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-xs text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1"
                                        >
                                            PMID: {note.pmid}
                                            <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                        </a>
                                    )}
                                </div>

                                {/* Article title */}
                                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                    {note.title}
                                </h4>

                                {/* Curation note */}
                                <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded border-l-2 border-blue-400 dark:border-blue-600">
                                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {note.curation_notes}
                                    </p>
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="flex-shrink-0 text-right">
                                {note.curator_name && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {note.curator_name}
                                    </p>
                                )}
                                {note.curated_at && (
                                    <p className="text-xs text-gray-400 dark:text-gray-500">
                                        {formatDate(note.curated_at)}
                                    </p>
                                )}
                                {note.report_id && (
                                    <a
                                        href={`/curation/${note.report_id}`}
                                        className="text-xs text-blue-600 hover:underline dark:text-blue-400"
                                    >
                                        Report #{note.report_id}
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
