import { useState, useMemo, useCallback, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import {
    ArrowDownTrayIcon,
    ArrowsUpDownIcon,
    SparklesIcon,
    XMarkIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    ArrowPathIcon,
    TrashIcon,
    MagnifyingGlassIcon,
    CheckCircleIcon,
    XCircleIcon,
    AdjustmentsHorizontalIcon,
    PlusCircleIcon,
    ChatBubbleLeftIcon,
    ClipboardDocumentIcon,
    CheckIcon
} from '@heroicons/react/24/outline';
import AddColumnModal, { ScoreConfig } from './AddColumnModal';
import { trackEvent } from '../../../lib/api/trackingApi';
import { copyToClipboard } from '../../../lib/utils/clipboard';
import { tablizerApi } from '../../../lib/api/tablizerApi';

// Types
export interface TableColumn {
    id: string;
    label: string;
    accessor: string;
    type: 'text' | 'number' | 'date' | 'ai';
    aiConfig?: {
        promptTemplate: string;
        inputColumns: string[];
        outputType?: 'text' | 'number' | 'boolean';
        showReasoning?: boolean;  // Whether to display reasoning in cells
    };
    visible?: boolean;
    /** If true, this column won't be available as a template field in Add AI Column */
    excludeFromAITemplate?: boolean;
}

// Row type that allows dynamic AI column access
export interface TableRow {
    id: string;
    [key: string]: unknown;
}

type BooleanFilterState = 'all' | 'yes' | 'no';

export interface AIColumnInfo {
    name: string;
    type: string;
    filterActive?: boolean;
}

// Result from AI processing
export interface AIColumnResult {
    id: string;        // Row ID
    passed: boolean;   // For boolean output
    value: number;     // The evaluated value (for number output type)
    confidence: number; // Confidence score (0.0-1.0)
    reasoning: string; // Explanation
    text_value?: string; // For text output - the actual extracted answer
}

// Props passed to RowViewer component
export interface RowViewerProps<T> {
    data: T[];           // Dataset (may be filtered)
    initialIndex: number; // Which item was clicked
    onClose: () => void;
    /** If true, data represents a filtered subset of the full dataset */
    isFiltered?: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface TablizerProps<T extends object = Record<string, any>> {
    // REQUIRED: Data to display in the table
    data: T[];

    // REQUIRED: Which field is the unique ID (e.g., 'pmid' or 'nct_id')
    idField: string;

    // REQUIRED: Column definitions
    columns: TableColumn[];

    // Optional: Title shown in toolbar (default: "Tablizer")
    title?: string;

    // Optional: Label for row count (default: "rows")
    rowLabel?: string;

    // Optional: Close button handler (for modal/fullscreen mode)
    onClose?: () => void;

    // Optional: Fullscreen layout mode (default: false)
    isFullScreen?: boolean;

    // Optional: Callback when user saves filtered results to history
    onSaveToHistory?: (filteredIds: string[], filterDescription: string) => void;

    // Optional: Lazy-load more data before AI processing
    // Returns the expanded data array (parent updates its state too)
    onFetchMoreForAI?: () => Promise<T[]>;

    // REQUIRED for AI columns: Type of items being displayed (determines API endpoint)
    itemType?: 'article' | 'trial';

    // Optional: Original data for AI processing when display data is transformed
    // Use this when the displayed data (T) differs from the API data structure
    // (e.g., TrialScoutTable shows flattened TrialRowData but API needs CanonicalClinicalTrial)
    originalData?: Record<string, unknown>[];

    // Optional: Report AI column state changes to parent
    onColumnsChange?: (aiColumns: AIColumnInfo[]) => void;

    // Optional: Called when a column's visibility is toggled
    onColumnVisibilityChange?: (columnId: string, visible: boolean) => void;

    // Optional: Custom component to render when a row is clicked
    // If RowViewer is provided, Tablizer manages the modal internally
    RowViewer?: React.ComponentType<RowViewerProps<T>>;

    // Optional: Callback when a row is clicked (alternative to RowViewer)
    // If provided, parent component manages the viewer - RowViewer is ignored
    // isFiltered indicates if data is a filtered subset (for showing indicator in viewer)
    onRowClick?: (data: T[], index: number, isFiltered: boolean) => void;

    // Optional: Custom cell renderer for special columns
    renderCell?: (row: TableRow, column: TableColumn) => React.ReactNode | null;
}

export interface TablizerRef {
    addAIColumn: (name: string, criteria: string, type: 'boolean' | 'text') => void;
}

type SortDirection = 'asc' | 'desc' | null;

interface SortConfig {
    columnId: string;
    direction: SortDirection;
}

// Helper to get ID from data item
function getItemId<T extends object>(item: T, idField: string): string {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const id = (item as any)[idField];
    if (id === null || id === undefined) return '';
    return String(id);
}

// Create a generic forwardRef component
function TablizerInner<T extends object>(
    props: TablizerProps<T>,
    ref: React.ForwardedRef<TablizerRef>
) {
    const {
        data: inputData,
        idField,
        columns: inputColumns,
        title = 'Tablizer',
        rowLabel = 'rows',
        onClose,
        isFullScreen = false,
        onSaveToHistory,
        onFetchMoreForAI,
        itemType,
        originalData,
        onColumnsChange,
        onColumnVisibilityChange,
        RowViewer,
        onRowClick,
        renderCell
    } = props;

    // ==========================================================================
    // CORE DATA FLOW:
    // 1. inputData (prop) -> sortedItems -> filteredItems (all T[])
    // 2. aiColumnValues (state) -> stores AI results by columnId -> rowId -> value
    // 3. getCellValue() looks up values inline at render time
    // ==========================================================================

    // AI column values stored separately: { columnId: { rowId: value } }
    const [aiColumnValues, setAiColumnValues] = useState<Record<string, Record<string, unknown>>>({});

    // AI column reasoning stored separately: { columnId: { rowId: reasoning } }
    const [aiColumnReasoning, setAiColumnReasoning] = useState<Record<string, Record<string, string>>>({});

    // AI column confidence stored separately: { columnId: { rowId: confidence } }
    const [aiColumnConfidence, setAiColumnConfidence] = useState<Record<string, Record<string, number>>>({});

    // Helper to get cell value for any column (regular or AI)
    const getCellValue = useCallback((item: T, column: TableColumn): unknown => {
        const itemId = getItemId(item, idField);
        if (column.type === 'ai') {
            return aiColumnValues[column.id]?.[itemId];
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const value = (item as any)[column.accessor];
        // Flatten arrays for display
        return Array.isArray(value) ? value.join(', ') : value;
    }, [idField, aiColumnValues]);

    // Column definitions (base columns + AI columns)
    const [columns, setColumns] = useState<TableColumn[]>(
        inputColumns.map(c => ({ ...c }))
    );

    // UI state
    const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
    const [filterText, setFilterText] = useState('');
    const [showAddColumnModal, setShowAddColumnModal] = useState(false);
    const [showColumnsDropdown, setShowColumnsDropdown] = useState(false);
    const [processingColumn, setProcessingColumn] = useState<string | null>(null);
    const [processingProgress, setProcessingProgress] = useState({ current: 0, total: 0 });
    const [booleanFilters, setBooleanFilters] = useState<Record<string, BooleanFilterState>>({});
    const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
    const [copiedIds, setCopiedIds] = useState(false);

    // Track dataset identity for reset detection
    const prevDatasetIdRef = useRef<string>('');

    // Detect new dataset and reset AI columns
    useEffect(() => {
        // Use first 3 IDs as dataset identity fingerprint
        const datasetId = inputData.slice(0, 3).map(item => getItemId(item, idField)).join(',');

        if (prevDatasetIdRef.current && prevDatasetIdRef.current !== datasetId) {
            // New dataset - reset AI-related state
            setAiColumnValues({});
            setAiColumnReasoning({});
            setAiColumnConfidence({});
            setColumns(inputColumns.map(c => ({ ...c })));
            setSortConfig(null);
            setFilterText('');
            setBooleanFilters({});
        }

        prevDatasetIdRef.current = datasetId;
    }, [inputData, idField, inputColumns]);

    // Update columns when inputColumns change (preserve AI columns)
    useEffect(() => {
        setColumns(current => {
            const aiColumns = current.filter(c => c.type === 'ai');
            return [...inputColumns.map(c => ({ ...c })), ...aiColumns];
        });
    }, [inputColumns]);

    // Get visible columns
    const visibleColumns = useMemo(() =>
        columns.filter(c => c.visible !== false),
        [columns]
    );

    // Get boolean AI columns for quick filters
    const booleanColumns = useMemo(() =>
        columns.filter(c => c.type === 'ai' && c.aiConfig?.outputType === 'boolean'),
        [columns]
    );

    // Report AI column changes to parent
    useEffect(() => {
        if (!onColumnsChange) return;

        const aiColumns = columns
            .filter(c => c.type === 'ai')
            .map(c => ({
                name: c.label,
                type: c.aiConfig?.outputType || 'text',
                filterActive: c.aiConfig?.outputType === 'boolean' && booleanFilters[c.id] !== 'all' && booleanFilters[c.id] !== undefined
            }));

        onColumnsChange(aiColumns);
    }, [columns, booleanFilters, onColumnsChange]);

    // Sort items directly
    const sortedItems = useMemo((): T[] => {
        if (!sortConfig || !sortConfig.direction) return inputData;

        const column = columns.find(c => c.id === sortConfig.columnId);
        if (!column) return inputData;

        return [...inputData].sort((a, b) => {
            const aVal = getCellValue(a, column);
            const bVal = getCellValue(b, column);

            if (aVal === undefined || aVal === null) return 1;
            if (bVal === undefined || bVal === null) return -1;

            if (column.type === 'number' || column.aiConfig?.outputType === 'number') {
                const aNum = parseFloat(String(aVal)) || 0;
                const bNum = parseFloat(String(bVal)) || 0;
                return sortConfig.direction === 'asc' ? aNum - bNum : bNum - aNum;
            }

            const aStr = String(aVal).toLowerCase();
            const bStr = String(bVal).toLowerCase();
            const comparison = aStr.localeCompare(bStr);
            return sortConfig.direction === 'asc' ? comparison : -comparison;
        });
    }, [inputData, sortConfig, columns, getCellValue]);

    // Filter items directly
    const filteredItems = useMemo((): T[] => {
        let result = sortedItems;

        // Apply text filter - search across all visible columns
        if (filterText.trim()) {
            const searchLower = filterText.toLowerCase();
            result = result.filter(item => {
                for (const col of columns) {
                    const val = getCellValue(item, col);
                    if (String(val ?? '').toLowerCase().includes(searchLower)) {
                        return true;
                    }
                }
                return false;
            });
        }

        // Apply boolean filters
        for (const [columnId, filterState] of Object.entries(booleanFilters)) {
            if (filterState === 'all') continue;
            const column = columns.find(c => c.id === columnId);
            if (!column) continue;

            result = result.filter(item => {
                const val = getCellValue(item, column);
                const isYes = val === true || val === 'Yes' || val === 'yes' || val === 'YES';
                return filterState === 'yes' ? isYes : !isYes;
            });
        }

        return result;
    }, [sortedItems, filterText, booleanFilters, columns, getCellValue]);

    // Check if any filters are active
    const hasActiveFilters = useMemo(() => {
        if (filterText.trim()) return true;
        for (const filterState of Object.values(booleanFilters)) {
            if (filterState !== 'all') return true;
        }
        return false;
    }, [filterText, booleanFilters]);

    // Build filter description for history
    const getFilterDescription = useCallback(() => {
        const parts: string[] = [];
        if (filterText.trim()) {
            parts.push(`text: "${filterText}"`);
        }
        for (const [columnId, filterState] of Object.entries(booleanFilters)) {
            if (filterState === 'all') continue;
            const col = columns.find(c => c.id === columnId);
            if (col) {
                parts.push(`${col.label}=${filterState}`);
            }
        }
        return parts.length > 0 ? parts.join(', ') : 'Filtered';
    }, [filterText, booleanFilters, columns]);

    // Handle save to history
    const handleSaveToHistory = useCallback(() => {
        if (!onSaveToHistory) return;
        const filteredIds = filteredItems.map(item => getItemId(item, idField));
        const description = getFilterDescription();
        onSaveToHistory(filteredIds, description);
        trackEvent('tablizer_save_to_history', {
            filtered_count: filteredIds.length
        });
    }, [onSaveToHistory, filteredItems, idField, getFilterDescription]);

    // Handle copy IDs to clipboard
    const handleCopyIds = useCallback(async () => {
        const ids = filteredItems.map(item => getItemId(item, idField));
        const result = await copyToClipboard(ids.join('\n'));
        if (result.success) {
            setCopiedIds(true);
            setTimeout(() => setCopiedIds(false), 2000);
        }
        trackEvent('tablizer_copy_ids', {
            count: ids.length
        });
    }, [filteredItems, idField]);

    // Handle sort
    const handleSort = useCallback((columnId: string) => {
        setSortConfig(current => {
            if (current?.columnId !== columnId) {
                return { columnId, direction: 'asc' };
            }
            if (current.direction === 'asc') {
                return { columnId, direction: 'desc' };
            }
            return null;
        });
    }, []);

    // Toggle column visibility
    const toggleColumnVisibility = useCallback((columnId: string) => {
        setColumns(cols => {
            const updated = cols.map(c =>
                c.id === columnId ? { ...c, visible: c.visible === false } : c
            );
            // Notify parent of visibility change
            const col = updated.find(c => c.id === columnId);
            if (col && onColumnVisibilityChange) {
                onColumnVisibilityChange(columnId, col.visible !== false);
            }
            return updated;
        });
    }, [onColumnVisibilityChange]);

    // Delete AI column
    const deleteColumn = useCallback((columnId: string) => {
        const column = columns.find(c => c.id === columnId);
        if (column?.type !== 'ai') return; // Only delete AI columns

        setColumns(cols => cols.filter(c => c.id !== columnId));
        setAiColumnValues(prev => {
            const newValues = { ...prev };
            delete newValues[columnId];
            return newValues;
        });
        setAiColumnReasoning(prev => {
            const newReasoning = { ...prev };
            delete newReasoning[columnId];
            return newReasoning;
        });
        setBooleanFilters(prev => {
            const newFilters = { ...prev };
            delete newFilters[columnId];
            return newFilters;
        });
    }, [columns]);

    // Toggle show reasoning for AI column
    const toggleShowReasoning = useCallback((columnId: string) => {
        setColumns(cols => cols.map(c =>
            c.id === columnId && c.aiConfig
                ? { ...c, aiConfig: { ...c.aiConfig, showReasoning: !c.aiConfig.showReasoning } }
                : c
        ));
    }, []);

    // Add AI column
    const handleAddColumn = useCallback(async (
        columnName: string,
        promptTemplate: string,
        inputCols: string[],
        outputType: 'text' | 'number' | 'boolean',
        scoreConfig?: ScoreConfig
    ) => {
        if (!itemType) {
            console.error('Tablizer: itemType prop is required for AI columns');
            return;
        }

        const columnId = `ai_${Date.now()}`;

        // Add the column definition
        const newColumn: TableColumn = {
            id: columnId,
            label: columnName,
            accessor: columnId,
            type: 'ai',
            aiConfig: {
                promptTemplate,
                inputColumns: inputCols,
                outputType
            },
            visible: true
        };

        setColumns(cols => [...cols, newColumn]);
        setShowAddColumnModal(false);

        // Fetch more data if needed before AI processing
        // This triggers parent to expand its data, which will update inputData prop
        // We use the returned data for AI processing (inputData prop updates asynchronously)
        let aiData: T[] = inputData;
        if (onFetchMoreForAI) {
            aiData = await onFetchMoreForAI();
        }

        // Process using API directly
        setProcessingColumn(columnId);
        setProcessingProgress({ current: 0, total: aiData.length });

        try {
            // Use originalData if provided (for cases where display data differs from API data)
            // Otherwise use the display data directly
            const apiData = originalData || (aiData as unknown as Record<string, unknown>[]);

            const results = await tablizerApi.processAIColumn({
                items: apiData,
                itemType,
                criteria: promptTemplate,
                outputType,
                threshold: 0.5,
                scoreConfig
            });

            // Convert results to columnValues, columnReasoning, and columnConfidence maps
            const columnValues: Record<string, unknown> = {};
            const columnReasoning: Record<string, string> = {};
            const columnConfidence: Record<string, number> = {};
            for (const result of results) {
                let value: unknown;
                if (outputType === 'boolean') {
                    value = result.passed ? 'Yes' : 'No';
                } else if (outputType === 'number') {
                    value = result.value;
                } else {
                    // For text type, use text_value (the actual extracted answer)
                    // Fall back to reasoning if text_value is not present
                    value = result.text_value || result.reasoning;
                }
                columnValues[result.id] = value;
                columnReasoning[result.id] = result.reasoning || '';
                columnConfidence[result.id] = result.confidence;
            }

            // Store AI values, reasoning, and confidence
            // When inputData prop updates (from parent's fetchMore), sorting/filtering
            // will automatically include the new rows with their AI values
            setAiColumnValues(prev => ({
                ...prev,
                [columnId]: columnValues
            }));
            setAiColumnReasoning(prev => ({
                ...prev,
                [columnId]: columnReasoning
            }));
            setAiColumnConfidence(prev => ({
                ...prev,
                [columnId]: columnConfidence
            }));

            setProcessingProgress({ current: aiData.length, total: aiData.length });

            // Track successful completion
            trackEvent('tablizer_add_column_complete', {
                column_name: columnName,
                output_type: outputType,
                item_count: results.length
            });
        } catch (err) {
            console.error('Error processing AI column:', err);
            // Store error state for all current rows
            const errorValues: Record<string, unknown> = {};
            for (const item of inputData) {
                errorValues[getItemId(item, idField)] = 'Error';
            }
            setAiColumnValues(prev => ({
                ...prev,
                [columnId]: errorValues
            }));
        } finally {
            setProcessingColumn(null);
            setProcessingProgress({ current: 0, total: 0 });
        }
    }, [inputData, idField, onFetchMoreForAI, itemType, originalData]);

    // Export to CSV
    const handleExport = useCallback(() => {
        // Helper to escape CSV values
        const escapeCSV = (val: unknown): string => {
            const strVal = String(val ?? '');
            if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
                return `"${strVal.replace(/"/g, '""')}"`;
            }
            return strVal;
        };

        // Build headers - for AI columns, add Confidence and Reasoning columns
        const headers: string[] = [];
        for (const c of visibleColumns) {
            headers.push(c.label);
            if (c.type === 'ai') {
                headers.push(`${c.label} (Confidence)`);
                headers.push(`${c.label} (Reasoning)`);
            }
        }

        // Build rows - for AI columns, include confidence and reasoning
        const rows = filteredItems.map(item => {
            const rowValues: string[] = [];
            const itemId = getItemId(item, idField);

            for (const c of visibleColumns) {
                const val = getCellValue(item, c);
                rowValues.push(escapeCSV(val));

                if (c.type === 'ai') {
                    // Add confidence (as percentage)
                    const confidence = aiColumnConfidence[c.id]?.[itemId];
                    const confidenceStr = confidence !== undefined
                        ? `${Math.round(confidence * 100)}%`
                        : '';
                    rowValues.push(escapeCSV(confidenceStr));

                    // Add reasoning
                    const reasoning = aiColumnReasoning[c.id]?.[itemId] || '';
                    rowValues.push(escapeCSV(reasoning));
                }
            }
            return rowValues;
        });

        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${title.toLowerCase().replace(/\s+/g, '_')}_export.csv`;
        a.click();
        URL.revokeObjectURL(url);
        trackEvent('tablizer_export', {
            row_count: filteredItems.length,
            column_count: headers.length
        });
    }, [filteredItems, getCellValue, visibleColumns, title, idField, aiColumnConfidence, aiColumnReasoning]);

    // Expose addAIColumn method via ref for parent component
    useImperativeHandle(ref, () => ({
        addAIColumn: (name: string, criteria: string, type: 'boolean' | 'text') => {
            handleAddColumn(name, criteria, ['title', 'abstract'], type);
        }
    }), [handleAddColumn]);

    const containerClass = isFullScreen
        ? 'fixed inset-0 z-50 bg-white dark:bg-gray-900 flex flex-col'
        : 'border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 flex flex-col h-full';

    return (
        <div className={containerClass}>
            {/* Toolbar */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-4 py-2 flex items-center justify-between gap-4 flex-shrink-0">
                {/* Left: Search, Row Count, and Quick Filters */}
                <div className="flex items-center gap-3 flex-1">
                    {/* Search */}
                    <div className="relative flex-1 max-w-xs">
                        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <input
                            type="text"
                            value={filterText}
                            onChange={(e) => setFilterText(e.target.value)}
                            placeholder="Search all columns..."
                            className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                    </div>

                    {/* Row count */}
                    <span className="text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                        {filteredItems.length}{filteredItems.length !== inputData.length ? ` of ${inputData.length}` : ''} {rowLabel}
                    </span>

                    {/* Processing indicator */}
                    {processingColumn && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-600 dark:bg-purple-500 shadow-md animate-pulse">
                            <SparklesIcon className="h-4 w-4 text-white" />
                            <span className="text-sm font-medium text-white whitespace-nowrap">
                                AI Processing {processingProgress.current}/{processingProgress.total}
                            </span>
                        </div>
                    )}

                    {/* Quick Boolean Filters */}
                    {booleanColumns.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-gray-400">Quick filters:</span>
                            {booleanColumns.map(col => {
                                const currentFilter = booleanFilters[col.id] || 'all';
                                return (
                                    <div key={col.id} className="flex items-center rounded-md border border-gray-300 dark:border-gray-600 overflow-hidden">
                                        <span className="px-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-r border-gray-300 dark:border-gray-600">
                                            {col.label}
                                        </span>
                                        <button
                                            onClick={() => {
                                                setBooleanFilters(prev => ({ ...prev, [col.id]: 'all' }));
                                                trackEvent('tablizer_filter_boolean', { column: col.label, value: 'all' });
                                            }}
                                            className={`px-2 py-1 text-xs transition-colors ${
                                                currentFilter === 'all'
                                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            All
                                        </button>
                                        <button
                                            onClick={() => {
                                                setBooleanFilters(prev => ({ ...prev, [col.id]: 'yes' }));
                                                trackEvent('tablizer_filter_boolean', { column: col.label, value: 'yes' });
                                            }}
                                            className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${
                                                currentFilter === 'yes'
                                                    ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <CheckCircleIcon className="h-3 w-3" />
                                            Yes
                                        </button>
                                        <button
                                            onClick={() => {
                                                setBooleanFilters(prev => ({ ...prev, [col.id]: 'no' }));
                                                trackEvent('tablizer_filter_boolean', { column: col.label, value: 'no' });
                                            }}
                                            className={`px-2 py-1 text-xs flex items-center gap-1 transition-colors ${
                                                currentFilter === 'no'
                                                    ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                    : 'bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                                            }`}
                                        >
                                            <XCircleIcon className="h-3 w-3" />
                                            No
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-3">
                    {/* Copy IDs - always available */}
                    {filteredItems.length > 0 && (
                        <button
                            onClick={handleCopyIds}
                            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                            title={`Copy ${filteredItems.length} IDs to clipboard`}
                        >
                            {copiedIds ? (
                                <>
                                    <CheckIcon className="h-4 w-4 text-green-500" />
                                    <span className="text-green-600 dark:text-green-400">Copied!</span>
                                </>
                            ) : (
                                <>
                                    <ClipboardDocumentIcon className="h-4 w-4" />
                                    Copy {filteredItems.length} IDs
                                </>
                            )}
                        </button>
                    )}

                    {/* Save to History - shown when filters are active */}
                    {onSaveToHistory && hasActiveFilters && filteredItems.length > 0 && filteredItems.length < inputData.length && (
                        <button
                            onClick={handleSaveToHistory}
                            className="flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                            title={`Save ${filteredItems.length} filtered items to history`}
                        >
                            <PlusCircleIcon className="h-4 w-4" />
                            Save to History
                        </button>
                    )}

                    {/* Add AI Column - only show if itemType is provided */}
                    {itemType && (
                        <button
                            onClick={() => {
                                setShowAddColumnModal(true);
                                trackEvent('tablizer_add_column_start', {});
                            }}
                            disabled={!!processingColumn}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 text-white text-sm font-medium rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            <SparklesIcon className="h-4 w-4" />
                            Add AI Column
                        </button>
                    )}

                    {/* Separator */}
                    <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

                    {/* Column visibility dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setShowColumnsDropdown(!showColumnsDropdown)}
                            className={`flex items-center gap-1.5 px-2 py-1.5 text-sm rounded-md transition-colors ${
                                showColumnsDropdown
                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'
                                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800'
                            }`}
                        >
                            <AdjustmentsHorizontalIcon className="h-4 w-4" />
                            Columns
                        </button>
                        {showColumnsDropdown && (
                            <>
                                {/* Backdrop to close dropdown when clicking outside */}
                                <div
                                    className="fixed inset-0 z-10"
                                    onClick={() => setShowColumnsDropdown(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg z-20">
                                    <div className="p-2 space-y-1 max-h-60 overflow-y-auto">
                                        {columns.map(col => (
                                            <label key={col.id} className="flex items-center gap-2 px-2 py-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    checked={col.visible !== false}
                                                    onChange={() => toggleColumnVisibility(col.id)}
                                                    className="rounded border-gray-300 dark:border-gray-600"
                                                />
                                                <span className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                                                    {col.type === 'ai' && <SparklesIcon className="h-3 w-3 text-purple-500" />}
                                                    {col.label}
                                                </span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Export */}
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-1.5 px-2 py-1.5 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                        title="Export to CSV"
                    >
                        <ArrowDownTrayIcon className="h-4 w-4" />
                        Export
                    </button>

                    {/* Close button (for full-screen mode) */}
                    {onClose && (
                        <>
                            <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
                            <button
                                onClick={onClose}
                                className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-white rounded-md hover:bg-gray-100 dark:hover:bg-gray-800"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* Table */}
            <div className="flex-1 overflow-auto min-h-0">
                <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                            {visibleColumns.map(column => (
                                <th
                                    key={column.id}
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-700"
                                >
                                    <div className="flex items-center gap-2">
                                        {column.type === 'ai' && (
                                            <SparklesIcon className="h-4 w-4 text-purple-500" />
                                        )}
                                        <button
                                            onClick={() => handleSort(column.id)}
                                            className="flex items-center gap-1 hover:text-gray-700 dark:hover:text-gray-200"
                                        >
                                            {column.label}
                                            {sortConfig?.columnId === column.id ? (
                                                sortConfig.direction === 'asc' ? (
                                                    <ChevronUpIcon className="h-4 w-4" />
                                                ) : (
                                                    <ChevronDownIcon className="h-4 w-4" />
                                                )
                                            ) : (
                                                <ArrowsUpDownIcon className="h-4 w-4 opacity-30" />
                                            )}
                                        </button>
                                        {column.type === 'ai' && (
                                            <>
                                                <button
                                                    onClick={() => toggleShowReasoning(column.id)}
                                                    className={`p-0.5 ${column.aiConfig?.showReasoning ? 'text-purple-500' : 'text-gray-400 hover:text-purple-500'}`}
                                                    title={column.aiConfig?.showReasoning ? "Hide reasoning" : "Show reasoning"}
                                                >
                                                    <ChatBubbleLeftIcon className="h-3 w-3" />
                                                </button>
                                                <button
                                                    onClick={() => deleteColumn(column.id)}
                                                    className="p-0.5 text-gray-400 hover:text-red-500"
                                                    title="Delete column"
                                                >
                                                    <TrashIcon className="h-3 w-3" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {filteredItems.map((item, itemIdx) => {
                            const itemId = getItemId(item, idField);
                            return (
                            <tr
                                key={itemId || itemIdx}
                                className={`hover:bg-gray-50 dark:hover:bg-gray-800/50 ${(RowViewer || onRowClick) ? 'cursor-pointer' : ''}`}
                                onClick={() => {
                                    trackEvent('tablizer_row_click', { id: itemId, filtered: hasActiveFilters });

                                    // If onRowClick is provided, let parent handle the viewer
                                    if (onRowClick) {
                                        onRowClick(filteredItems, itemIdx, hasActiveFilters);
                                        return;
                                    }

                                    // Otherwise use internal RowViewer if provided
                                    if (RowViewer) {
                                        setSelectedItemIndex(itemIdx);
                                    }
                                }}
                            >
                                {visibleColumns.map(column => {
                                    const cellValue = getCellValue(item, column);

                                    // Check for custom cell renderer first
                                    if (renderCell) {
                                        // Create a TableRow-like object for backwards compatibility
                                        const row: TableRow = { id: itemId, [column.accessor]: cellValue };
                                        const customCell = renderCell(row, column);
                                        if (customCell !== null) {
                                            return (
                                                <td key={column.id} className="px-4 py-3 text-sm">
                                                    {customCell}
                                                </td>
                                            );
                                        }
                                    }

                                    const isBoolean = column.aiConfig?.outputType === 'boolean';
                                    const isBooleanYes = isBoolean && (cellValue === true || cellValue === 'Yes' || cellValue === 'yes' || cellValue === 'YES');
                                    const isBooleanNo = isBoolean && (cellValue === false || cellValue === 'No' || cellValue === 'no' || cellValue === 'NO');

                                    // Get reasoning and confidence if available and showReasoning is enabled
                                    const showReasoning = column.aiConfig?.showReasoning;
                                    const reasoning = showReasoning && column.type === 'ai'
                                        ? aiColumnReasoning[column.id]?.[itemId]
                                        : null;
                                    const confidence = showReasoning && column.type === 'ai'
                                        ? aiColumnConfidence[column.id]?.[itemId]
                                        : null;
                                    const confidencePercent = confidence != null ? Math.round(confidence * 100) : null;

                                    return (
                                        <td
                                            key={column.id}
                                            className={`px-4 py-3 text-sm text-gray-900 dark:text-gray-100 align-top ${showReasoning ? 'max-w-md' : 'max-w-xs'}`}
                                            title={!showReasoning && column.type === 'ai' ? aiColumnReasoning[column.id]?.[itemId] : undefined}
                                        >
                                            {processingColumn === column.id && cellValue === undefined ? (
                                                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 animate-pulse">
                                                    <SparklesIcon className="h-3 w-3 text-purple-500" />
                                                    <span className="text-xs text-purple-600 dark:text-purple-400">analyzing...</span>
                                                </div>
                                            ) : isBoolean ? (
                                                <div>
                                                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                                        isBooleanYes
                                                            ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300'
                                                            : isBooleanNo
                                                                ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                                                                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                                    }`}>
                                                        {isBooleanYes && <CheckCircleIcon className="h-3 w-3" />}
                                                        {isBooleanNo && <XCircleIcon className="h-3 w-3" />}
                                                        {String(cellValue ?? '-')}
                                                    </span>
                                                    {reasoning && (
                                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-normal">
                                                            {confidencePercent != null && (
                                                                <span className="font-medium text-purple-600 dark:text-purple-400 mr-1">
                                                                    {confidencePercent}%
                                                                </span>
                                                            )}
                                                            {reasoning}
                                                        </p>
                                                    )}
                                                </div>
                                            ) : (
                                                <div>
                                                    <span className={column.type === 'ai' ? 'text-purple-700 dark:text-purple-300' : ''}>
                                                        {String(cellValue ?? '-')}
                                                    </span>
                                                    {reasoning && (
                                                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 whitespace-normal">
                                                            {confidencePercent != null && (
                                                                <span className="font-medium text-purple-600 dark:text-purple-400 mr-1">
                                                                    {confidencePercent}%
                                                                </span>
                                                            )}
                                                            {reasoning}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                        })}
                    </tbody>
                </table>

                {filteredItems.length === 0 && (
                    <div className="flex items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                        <p>No data to display</p>
                    </div>
                )}
            </div>

            {/* Add Column Modal */}
            {showAddColumnModal && (
                <AddColumnModal
                    availableColumns={columns
                        .filter(c => c.type !== 'ai' && !c.excludeFromAITemplate)
                        .map(c => ({
                            id: c.accessor,
                            label: c.label
                        }))}
                    onAdd={handleAddColumn}
                    onClose={() => setShowAddColumnModal(false)}
                    sampleRow={inputData[0] as Record<string, unknown> | undefined}
                />
            )}

            {/* Row Viewer Modal - only render if RowViewer is provided and onRowClick is not */}
            {RowViewer && !onRowClick && selectedItemIndex !== null && (
                <RowViewer
                    data={filteredItems}
                    initialIndex={selectedItemIndex}
                    onClose={() => setSelectedItemIndex(null)}
                    isFiltered={hasActiveFilters}
                />
            )}
        </div>
    );
}

// Wrap with forwardRef - TypeScript workaround for generic forwardRef
const Tablizer = forwardRef(TablizerInner) as <T extends object>(
    props: TablizerProps<T> & { ref?: React.ForwardedRef<TablizerRef> }
) => ReturnType<typeof TablizerInner>;

export default Tablizer;
