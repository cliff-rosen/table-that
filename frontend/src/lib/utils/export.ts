/**
 * Export utilities: clipboard formatters, CSV download, and PDF generation.
 */

import { copyToClipboard } from './clipboard';
import { showSuccessToast, showErrorToast } from '../errorToast';

import type { PubMedArticleData } from '../../components/chat/PubMedArticleCard';
import type { PubMedSearchResultsData } from '../../components/chat/PubMedSearchResultsCard';
import type { DeepResearchResultData } from '../../components/chat/DeepResearchResultCard';
import type { ReportWithArticles, ReportArticle } from '../../types/report';

// ---------------------------------------------------------------------------
// CSV helpers
// ---------------------------------------------------------------------------

export function escapeCSV(val: unknown): string {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export function downloadCSV(csv: string, filename: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Clipboard helper with toast
// ---------------------------------------------------------------------------

export async function copyWithToast(text: string, label: string) {
    const result = await copyToClipboard(text);
    if (result.success) {
        showSuccessToast(`${label} copied to clipboard`);
    } else {
        showErrorToast(`Failed to copy: ${result.error || 'unknown error'}`);
    }
}

// ---------------------------------------------------------------------------
// PDF generation (lazy-loaded html2pdf.js)
// ---------------------------------------------------------------------------

export async function generatePDF(
    element: HTMLElement,
    filename: string,
    options?: { orientation?: 'portrait' | 'landscape' }
) {
    const html2pdf = (await import('html2pdf.js')).default;

    // Clone element so we can force light-mode styling
    const clone = element.cloneNode(true) as HTMLElement;

    // Force light background and color on the clone
    clone.style.backgroundColor = '#ffffff';
    clone.style.color = '#111827';
    clone.style.width = '800px';

    // Render off-screen inside a wrapper that does NOT have the dark class,
    // so Tailwind dark: variants won't activate for the clone.
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '800px';
    container.style.zIndex = '-1';
    container.className = ''; // explicitly no 'dark' class
    container.appendChild(clone);

    // Temporarily remove 'dark' from <html> so html2canvas computes light-mode styles
    const htmlEl = document.documentElement;
    const wasDark = htmlEl.classList.contains('dark');
    if (wasDark) htmlEl.classList.remove('dark');

    document.body.appendChild(container);

    try {
        await html2pdf()
            .set({
                margin: [10, 10, 10, 10] as [number, number, number, number],
                filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, width: 800 },
                jsPDF: {
                    unit: 'mm',
                    format: 'a4',
                    orientation: options?.orientation || 'portrait',
                },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
            } as any)
            .from(clone)
            .save();

        showSuccessToast(`PDF downloaded as ${filename}`);
    } catch (err) {
        console.error('PDF generation failed:', err);
        showErrorToast('Failed to generate PDF');
    } finally {
        document.body.removeChild(container);
        // Restore dark mode if it was active
        if (wasDark) htmlEl.classList.add('dark');
    }
}

// ---------------------------------------------------------------------------
// PubMed Article formatters
// ---------------------------------------------------------------------------

export function formatPubMedArticleForClipboard(article: PubMedArticleData): string {
    const lines: string[] = [];

    lines.push(article.title);
    lines.push('');
    lines.push(`Authors: ${article.authors}`);
    lines.push(`Journal: ${article.journal}`);
    lines.push(`Date: ${article.publication_date}`);
    if (article.volume) {
        lines.push(`Volume: ${article.volume}${article.issue ? `, Issue ${article.issue}` : ''}${article.pages ? `, Pages ${article.pages}` : ''}`);
    }
    lines.push('');
    lines.push(`PMID: ${article.pmid}`);
    if (article.pmc_id) lines.push(`PMC: ${article.pmc_id}`);
    if (article.doi) lines.push(`DOI: ${article.doi}`);

    if (article.abstract) {
        lines.push('');
        lines.push('--- Abstract ---');
        lines.push(article.abstract);
    }

    if (article.full_text) {
        lines.push('');
        lines.push('--- Full Text ---');
        lines.push(article.full_text);
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// PubMed Search Results formatters
// ---------------------------------------------------------------------------

export function formatSearchResultsForClipboard(data: PubMedSearchResultsData): string {
    const lines: string[] = [];

    lines.push(`Search: "${data.query}"`);
    lines.push(`Showing ${data.showing} of ${data.total_results} results`);
    lines.push('');

    // Tab-separated header
    lines.push('PMID\tTitle\tAuthors\tJournal\tDate\tFree Full Text');

    for (const a of data.articles) {
        lines.push([
            a.pmid,
            a.title,
            a.authors,
            a.journal,
            a.publication_date,
            a.has_free_full_text ? 'Yes' : 'No',
        ].join('\t'));
    }

    return lines.join('\n');
}

export function formatSearchResultsAsCSV(data: PubMedSearchResultsData): string {
    const headers = ['PMID', 'Title', 'Authors', 'Journal', 'Date', 'Has Free Full Text', 'Abstract'];
    const rows = data.articles.map(a => [
        escapeCSV(a.pmid),
        escapeCSV(a.title),
        escapeCSV(a.authors),
        escapeCSV(a.journal),
        escapeCSV(a.publication_date),
        escapeCSV(a.has_free_full_text ? 'Yes' : 'No'),
        escapeCSV(a.abstract),
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Deep Research formatters
// ---------------------------------------------------------------------------

export function formatDeepResearchForClipboard(data: DeepResearchResultData): string {
    const lines: string[] = [];

    lines.push(`Question: ${data.question}`);
    if (data.refined_question && data.refined_question !== data.question) {
        lines.push(`Refined: ${data.refined_question}`);
    }
    lines.push('');
    lines.push('--- Answer ---');
    lines.push(data.answer);

    if (data.sources.length > 0) {
        lines.push('');
        lines.push('--- Sources ---');
        data.sources.forEach((s, i) => {
            lines.push(`[${i + 1}] ${s.title} (${s.type}) - ${s.url}`);
        });
    }

    if (data.limitations.length > 0) {
        lines.push('');
        lines.push('--- Limitations ---');
        data.limitations.forEach(l => lines.push(`- ${l}`));
    }

    return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Report formatters
// ---------------------------------------------------------------------------

export function formatReportForClipboard(report: ReportWithArticles): string {
    const lines: string[] = [];

    lines.push(report.report_name);
    lines.push(`Generated: ${new Date(report.created_at).toLocaleDateString()}`);
    lines.push(`Articles: ${report.articles.length}`);

    if (report.enrichments?.executive_summary) {
        lines.push('');
        lines.push('--- Executive Summary ---');
        lines.push(report.enrichments.executive_summary);
    }

    if (report.key_highlights && report.key_highlights.length > 0) {
        lines.push('');
        lines.push('--- Key Highlights ---');
        report.key_highlights.forEach(h => lines.push(`- ${h}`));
    }

    if (report.thematic_analysis) {
        lines.push('');
        lines.push('--- Thematic Analysis ---');
        lines.push(report.thematic_analysis);
    }

    if (report.articles.length > 0) {
        lines.push('');
        lines.push('--- Articles ---');
        report.articles.forEach((a, i) => {
            const authors = Array.isArray(a.authors) ? a.authors.join(', ') : a.authors;
            lines.push(`${i + 1}. ${a.title} - ${authors} (${a.journal || 'N/A'}, ${a.pub_year || 'N/A'})`);
        });
    }

    return lines.join('\n');
}

/**
 * Build a clean HTML element for PDF rendering from report data.
 * Uses inline styles only — no Tailwind, no dark mode, no interactive elements.
 */
function buildReportPDFElement(report: ReportWithArticles): HTMLElement {
    const root = document.createElement('div');
    root.style.cssText = 'font-family: system-ui, -apple-system, sans-serif; padding: 24px; color: #111827; background: #fff; width: 800px; line-height: 1.5;';

    const h = (tag: string, text: string, styles: string) => {
        const el = document.createElement(tag);
        el.textContent = text;
        el.style.cssText = styles;
        return el;
    };

    // Title
    root.appendChild(h('h1', report.report_name, 'font-size: 22px; font-weight: 700; margin: 0 0 6px 0;'));

    // Date + article count
    const dateLine = report.retrieval_params?.end_date
        ? `Generated: ${(() => { const [y, m, d] = report.retrieval_params.end_date.split('-').map(Number); return new Date(y, m - 1, d + 1).toLocaleDateString(); })()}`
        : `Generated: ${new Date(report.created_at).toLocaleDateString()}`;
    root.appendChild(h('p', `${dateLine}  •  ${report.articles.length} articles`, 'font-size: 13px; color: #6b7280; margin: 0 0 20px 0;'));

    // Executive Summary
    if (report.enrichments?.executive_summary) {
        root.appendChild(h('h2', 'Executive Summary', 'font-size: 16px; font-weight: 600; margin: 0 0 6px 0; padding-top: 12px; border-top: 1px solid #e5e7eb;'));
        root.appendChild(h('p', report.enrichments.executive_summary, 'font-size: 13px; white-space: pre-wrap; margin: 0 0 16px 0;'));
    }

    // Key Highlights
    if (report.key_highlights && report.key_highlights.length > 0) {
        root.appendChild(h('h2', 'Key Highlights', 'font-size: 16px; font-weight: 600; margin: 0 0 6px 0; padding-top: 12px; border-top: 1px solid #e5e7eb;'));
        const ul = document.createElement('ul');
        ul.style.cssText = 'font-size: 13px; margin: 0 0 16px 0; padding-left: 20px;';
        for (const hl of report.key_highlights) {
            const li = document.createElement('li');
            li.textContent = hl;
            li.style.cssText = 'margin-bottom: 4px;';
            ul.appendChild(li);
        }
        root.appendChild(ul);
    }

    // Thematic Analysis
    if (report.thematic_analysis) {
        root.appendChild(h('h2', 'Thematic Analysis', 'font-size: 16px; font-weight: 600; margin: 0 0 6px 0; padding-top: 12px; border-top: 1px solid #e5e7eb;'));
        root.appendChild(h('p', report.thematic_analysis, 'font-size: 13px; white-space: pre-wrap; margin: 0 0 16px 0;'));
    }

    // Articles
    if (report.articles.length > 0) {
        root.appendChild(h('h2', 'Articles', 'font-size: 16px; font-weight: 600; margin: 0 0 10px 0; padding-top: 12px; border-top: 1px solid #e5e7eb;'));
        for (const a of report.articles) {
            const card = document.createElement('div');
            card.style.cssText = 'margin-bottom: 12px; padding: 10px 12px; border: 1px solid #e5e7eb; border-radius: 6px;';

            card.appendChild(h('p', a.title, 'font-size: 13px; font-weight: 600; margin: 0 0 3px 0;'));

            const authors = Array.isArray(a.authors) ? a.authors.join(', ') : a.authors;
            card.appendChild(h('p', authors, 'font-size: 11px; color: #6b7280; margin: 0 0 3px 0;'));

            const meta = [a.journal, a.pub_year, a.pmid ? `PMID: ${a.pmid}` : ''].filter(Boolean).join('  •  ');
            card.appendChild(h('p', meta, 'font-size: 11px; color: #9ca3af; margin: 0 0 3px 0;'));

            if (a.ai_summary) {
                card.appendChild(h('p', a.ai_summary, 'font-size: 11px; color: #4b5563; margin: 4px 0 0 0; line-height: 1.4;'));
            }

            root.appendChild(card);
        }
    }

    return root;
}

/**
 * Generate a report PDF from structured data (not DOM clone).
 */
export async function generateReportPDF(report: ReportWithArticles, filename: string) {
    const html2pdf = (await import('html2pdf.js')).default;
    const element = buildReportPDFElement(report);

    // Place off-screen for html2canvas to measure
    const container = document.createElement('div');
    container.style.cssText = 'position: fixed; left: -9999px; top: 0; width: 800px; z-index: -1;';
    container.appendChild(element);
    document.body.appendChild(container);

    try {
        await html2pdf()
            .set({
                margin: [10, 10, 10, 10] as [number, number, number, number],
                filename,
                image: { type: 'jpeg', quality: 0.98 },
                html2canvas: { scale: 2, useCORS: true, width: 800 },
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' as const },
                pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
            } as any)
            .from(element)
            .save();
        showSuccessToast(`PDF downloaded as ${filename}`);
    } catch (err) {
        console.error('PDF generation failed:', err);
        showErrorToast('Failed to generate PDF');
    } finally {
        document.body.removeChild(container);
    }
}

export function formatReportArticlesAsCSV(articles: ReportArticle[]): string {
    const headers = [
        'Title', 'Authors', 'Journal', 'Year', 'PMID', 'DOI',
        'Relevance Score', 'AI Summary', 'Starred', 'Categories', 'Abstract'
    ];

    const rows = articles.map(a => [
        escapeCSV(a.title),
        escapeCSV(Array.isArray(a.authors) ? a.authors.join('; ') : a.authors),
        escapeCSV(a.journal),
        escapeCSV(a.pub_year),
        escapeCSV(a.pmid),
        escapeCSV(a.doi),
        escapeCSV(a.relevance_score),
        escapeCSV(a.ai_summary),
        escapeCSV(a.is_starred ? 'Yes' : 'No'),
        escapeCSV(a.presentation_categories?.join('; ')),
        escapeCSV(a.abstract),
    ].join(','));

    return [headers.join(','), ...rows].join('\n');
}

// ---------------------------------------------------------------------------
// Citation formatters (for ArticleViewerModal)
// ---------------------------------------------------------------------------

interface CitationArticle {
    title: string;
    authors: string | string[];
    journal?: string;
    pub_year?: number;
    pub_month?: number;
    pmid?: string;
    doi?: string;
}

const MONTH_ABBREV = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function joinAuthors(authors: string | string[], limit?: number): string {
    const arr = Array.isArray(authors) ? authors : [authors];
    if (limit && arr.length > limit) {
        return arr.slice(0, limit).join(', ') + ', et al';
    }
    return arr.join(', ');
}

/** AMA (American Medical Association) */
export function formatCitationAMA(a: CitationArticle): string {
    const authors = joinAuthors(a.authors, 6);
    const parts = [authors + '.', a.title + '.'];
    if (a.journal) parts.push(`${a.journal}.`);
    if (a.pub_year) parts.push(`${a.pub_year}.`);
    if (a.doi) parts.push(`doi:${a.doi}`);
    return parts.join(' ');
}

/** APA 7th edition */
export function formatCitationAPA(a: CitationArticle): string {
    const arr = Array.isArray(a.authors) ? a.authors : [a.authors];
    let authors: string;
    if (arr.length === 1) {
        authors = arr[0];
    } else if (arr.length <= 20) {
        authors = arr.slice(0, -1).join(', ') + ', & ' + arr[arr.length - 1];
    } else {
        authors = arr.slice(0, 19).join(', ') + ', ... ' + arr[arr.length - 1];
    }
    const year = a.pub_year ? `(${a.pub_year})` : '(n.d.)';
    const parts = [`${authors} ${year}.`, `${a.title}.`];
    if (a.journal) parts.push(`${a.journal}.`);
    if (a.doi) parts.push(`https://doi.org/${a.doi}`);
    return parts.join(' ');
}

/** NLM (National Library of Medicine / Vancouver) */
export function formatCitationNLM(a: CitationArticle): string {
    const authors = joinAuthors(a.authors, 6);
    const parts = [authors + '.', a.title + '.'];
    if (a.journal) parts.push(`${a.journal}.`);
    if (a.pub_year) {
        const month = a.pub_month ? ` ${MONTH_ABBREV[a.pub_month - 1]}` : '';
        parts.push(`${a.pub_year}${month}.`);
    }
    if (a.doi) parts.push(`doi: ${a.doi}.`);
    if (a.pmid) parts.push(`PMID: ${a.pmid}.`);
    return parts.join(' ');
}

/** BibTeX */
export function formatCitationBibTeX(a: CitationArticle): string {
    const arr = Array.isArray(a.authors) ? a.authors : [a.authors];
    const firstAuthorLast = arr[0]?.split(/\s+/)[0]?.replace(/[^a-zA-Z]/g, '') || 'unknown';
    const key = `${firstAuthorLast}${a.pub_year || ''}`;
    const authors = arr.join(' and ');
    const lines = [
        `@article{${key},`,
        `  title = {${a.title}},`,
        `  author = {${authors}},`,
    ];
    if (a.journal) lines.push(`  journal = {${a.journal}},`);
    if (a.pub_year) lines.push(`  year = {${a.pub_year}},`);
    if (a.doi) lines.push(`  doi = {${a.doi}},`);
    if (a.pmid) lines.push(`  pmid = {${a.pmid}},`);
    lines.push('}');
    return lines.join('\n');
}
