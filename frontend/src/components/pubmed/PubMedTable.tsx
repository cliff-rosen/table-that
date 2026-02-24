import { forwardRef, useMemo } from 'react';
import { Tablizer, TableColumn, RowViewerProps, TablizerRef } from '../tools/Tablizer';
import ArticleViewerModal from '../articles/ArticleViewerModal';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { formatArticleDate } from '../../utils/dateUtils';

// ============================================================================
// Types
// ============================================================================

export interface PubMedTableProps {
    articles: CanonicalResearchArticle[];
    onSaveToHistory?: (filteredIds: string[], filterDescription: string) => void;
    onFetchMoreForAI?: () => Promise<CanonicalResearchArticle[]>;
    onColumnsChange?: (aiColumns: Array<{ name: string; type: string; filterActive?: boolean }>) => void;
}

// ============================================================================
// Column Definitions
// ============================================================================

const PUBMED_COLUMNS: TableColumn[] = [
    { id: 'pmid', label: 'PMID', accessor: 'pmid', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'abstract', label: 'Abstract', accessor: 'abstract', type: 'text', visible: false },
    { id: 'authors', label: 'Authors', accessor: 'authors', type: 'text', visible: false },
    { id: 'journal', label: 'Journal', accessor: 'journal', type: 'text', visible: true },
    { id: 'publication_date', label: 'Date', accessor: 'publication_date', type: 'date', visible: true },
];

// ============================================================================
// Adapter Components
// ============================================================================

// Adapter component for ArticleViewerModal to match RowViewer interface
function ArticleRowViewer({ data, initialIndex, onClose }: RowViewerProps<CanonicalResearchArticle>) {
    return (
        <ArticleViewerModal
            articles={data}
            initialIndex={initialIndex}
            onClose={onClose}
        />
    );
}

// ============================================================================
// Display Article Type
// ============================================================================

// Extended article type with computed publication_date for display
interface DisplayArticle extends CanonicalResearchArticle {
    publication_date?: string;
}

// ============================================================================
// Main Component
// ============================================================================

const PubMedTable = forwardRef<TablizerRef, PubMedTableProps>(function PubMedTable({
    articles,
    onSaveToHistory,
    onFetchMoreForAI,
    onColumnsChange
}, ref) {
    // Transform articles to add computed publication_date field for display
    const displayArticles: DisplayArticle[] = useMemo(() =>
        articles.map(article => ({
            ...article,
            publication_date: formatArticleDate(article.pub_year, article.pub_month, article.pub_day)
        })),
        [articles]
    );

    return (
        <Tablizer<DisplayArticle>
            ref={ref}
            data={displayArticles}
            idField="pmid"
            columns={PUBMED_COLUMNS}
            rowLabel="articles"
            RowViewer={ArticleRowViewer as (props: RowViewerProps<DisplayArticle>) => React.ReactElement}
            itemType="article"
            onSaveToHistory={onSaveToHistory}
            onFetchMoreForAI={onFetchMoreForAI as (() => Promise<DisplayArticle[]>) | undefined}
            onColumnsChange={onColumnsChange}
        />
    );
});

export default PubMedTable;
