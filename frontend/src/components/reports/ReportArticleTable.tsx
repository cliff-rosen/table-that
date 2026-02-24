import { useCallback, useMemo, forwardRef } from 'react';
import { Tablizer, TableColumn, TablizerRef, AIColumnInfo } from '../tools/Tablizer';
import { ReportArticle } from '../../types';
import { CardFormat } from './ReportHeader';
import { formatArticleDate } from '../../utils/dateUtils';

// ============================================================================
// Types
// ============================================================================

export interface ReportArticleTableProps {
    articles: ReportArticle[];
    title?: string;
    /** Controls which content column is visible - syncs with report-level format toggle */
    cardFormat?: CardFormat;
    /** Called when content column visibility is toggled in Tablizer's column selector */
    onCardFormatChange?: (format: CardFormat) => void;
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;
    onRowClick?: (articles: ReportArticle[], index: number, isFiltered: boolean) => void;
}

export type { TablizerRef as ReportArticleTableRef };

// ============================================================================
// Column Definitions
// ============================================================================

const REPORT_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'ai_summary', label: 'AI Summary', accessor: 'ai_summary', type: 'text', visible: false },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
    { id: 'relevance_score', label: 'Relevance', accessor: 'relevance_score', type: 'number', visible: false, excludeFromAITemplate: true },
    { id: 'categories', label: 'Categories', accessor: 'presentation_categories', type: 'text', visible: true, excludeFromAITemplate: true },
];

// ============================================================================
// Main Component
// ============================================================================

// Extended article type with computed publication_date for display
interface DisplayArticle extends ReportArticle {
    publication_date?: string;
}

const ReportArticleTable = forwardRef<TablizerRef, ReportArticleTableProps>(function ReportArticleTable({
    articles,
    title,
    cardFormat = 'compact',
    onCardFormatChange,
    onColumnsChange,
    onRowClick
}, ref) {

    // Transform articles to add computed publication_date field for display
    const displayArticles: DisplayArticle[] = useMemo(() =>
        articles.map(article => ({
            ...article,
            publication_date: formatArticleDate(article.pub_year, article.pub_month, article.pub_day)
        })),
        [articles]
    );

    // Sync column visibility with cardFormat
    const columns = useMemo(() =>
        REPORT_COLUMNS.map(col => {
            if (col.id === 'abstract') {
                return { ...col, visible: cardFormat === 'abstract' };
            }
            if (col.id === 'ai_summary') {
                return { ...col, visible: cardFormat === 'ai_summary' };
            }
            return col;
        }),
        [cardFormat]
    );

    // Handle column visibility changes from Tablizer
    const handleColumnVisibilityChange = useCallback((columnId: string, visible: boolean) => {
        if (!onCardFormatChange) return;
        if (columnId === 'abstract') {
            onCardFormatChange(visible ? 'abstract' : 'compact');
        } else if (columnId === 'ai_summary') {
            onCardFormatChange(visible ? 'ai_summary' : 'compact');
        }
    }, [onCardFormatChange]);

    return (
        <Tablizer<DisplayArticle>
            ref={ref}
            data={displayArticles}
            idField="pmid"
            columns={columns}
            title={title}
            rowLabel="articles"
            itemType="article"
            onColumnsChange={onColumnsChange}
            onColumnVisibilityChange={handleColumnVisibilityChange}
            onRowClick={onRowClick as ((articles: DisplayArticle[], index: number, isFiltered: boolean) => void) | undefined}
        />
    );
});

export default ReportArticleTable;
