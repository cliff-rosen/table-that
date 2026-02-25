import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  XMarkIcon,
  TableCellsIcon,
  ChatBubbleLeftRightIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { getTable, updateTable, listRows, createRow, updateRow, deleteRow, bulkDeleteRows, searchRows, exportTableCsv } from '../lib/api/tableApi';
import type { TableDefinition, TableRow, ColumnDefinition, SortState } from '../types/table';
import { useChatContext } from '../context/ChatContext';
import ChatTray from '../components/chat/ChatTray';
import ImportModal from '../components/table/ImportModal';
import FilterBar, { applyFilters, type FilterState } from '../components/table/FilterBar';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Label } from '../components/ui/label';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';
import SchemaProposalCard from '../components/chat/SchemaProposalCard';
import DataProposalCard from '../components/chat/DataProposalCard';

// =============================================================================
// Helper: format date for display
// =============================================================================

function formatDate(value: unknown): string {
  if (!value) return '';
  const d = new Date(String(value));
  if (isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// =============================================================================
// Helper: get default value for a column type
// =============================================================================

function getDefaultValue(col: ColumnDefinition): unknown {
  if (col.default !== undefined) return col.default;
  switch (col.type) {
    case 'text': return '';
    case 'number': return 0;
    case 'date': return '';
    case 'boolean': return false;
    case 'select': return col.options?.[0] ?? '';
    default: return '';
  }
}

// =============================================================================
// InlineEditor
// =============================================================================

interface InlineEditorProps {
  column: ColumnDefinition;
  value: unknown;
  onSave: (value: unknown) => void;
  onCancel: () => void;
}

function InlineEditor({ column, value, onSave, onCancel }: InlineEditorProps) {
  const [editValue, setEditValue] = useState<unknown>(value ?? getDefaultValue(column));
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onSave(editValue);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const handleBlur = () => {
    onSave(editValue);
  };

  switch (column.type) {
    case 'boolean':
      return (
        <div className="flex items-center justify-center p-1">
          <input
            ref={inputRef as React.RefObject<HTMLInputElement>}
            type="checkbox"
            checked={Boolean(editValue)}
            onChange={(e) => {
              setEditValue(e.target.checked);
              // Save immediately on toggle
              onSave(e.target.checked);
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
        </div>
      );

    case 'select':
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={String(editValue ?? '')}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 py-1 text-sm border-0 bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        >
          <option value="">-- Select --</option>
          {column.options?.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      );

    case 'number':
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="number"
          value={editValue === null || editValue === undefined ? '' : String(editValue)}
          onChange={(e) => setEditValue(e.target.value === '' ? null : Number(e.target.value))}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 py-1 text-sm text-right border-0 bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        />
      );

    case 'date':
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="date"
          value={String(editValue ?? '')}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 py-1 text-sm border-0 bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        />
      );

    default: // text
      return (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="text"
          value={String(editValue ?? '')}
          onChange={(e) => setEditValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="w-full h-full px-2 py-1 text-sm border-0 bg-blue-50 dark:bg-blue-900/30 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
        />
      );
  }
}

// =============================================================================
// CellRenderer
// =============================================================================

interface CellRendererProps {
  column: ColumnDefinition;
  value: unknown;
}

function CellRenderer({ column, value }: CellRendererProps) {
  switch (column.type) {
    case 'boolean':
      return (
        <div className="flex items-center justify-center">
          <span className={`inline-block h-2 w-2 rounded-full ${value ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
          <span className="ml-1.5 text-sm text-gray-700 dark:text-gray-300">
            {value ? 'Yes' : 'No'}
          </span>
        </div>
      );

    case 'number':
      return (
        <span className="text-sm text-gray-900 dark:text-gray-100 text-right block tabular-nums">
          {value !== null && value !== undefined ? String(value) : ''}
        </span>
      );

    case 'date':
      return (
        <span className="text-sm text-gray-700 dark:text-gray-300">
          {formatDate(value)}
        </span>
      );

    case 'select':
      return value ? (
        <Badge variant="secondary">
          {String(value)}
        </Badge>
      ) : (
        <span className="text-sm text-gray-400 dark:text-gray-500">--</span>
      );

    default: // text
      return (
        <span className="text-sm text-gray-900 dark:text-gray-100 truncate block">
          {value !== null && value !== undefined ? String(value) : ''}
        </span>
      );
  }
}

// =============================================================================
// DataTable
// =============================================================================

interface DataTableProps {
  columns: ColumnDefinition[];
  rows: TableRow[];
  selectedRowIds: Set<number>;
  onToggleRowSelection: (rowId: number) => void;
  onToggleAllSelection: () => void;
  sort: SortState | null;
  onSort: (columnId: string) => void;
  editingCell: { rowId: number; columnId: string } | null;
  onCellClick: (rowId: number, columnId: string) => void;
  onCellSave: (rowId: number, columnId: string, value: unknown) => void;
  onCellCancel: () => void;
}

function DataTable({
  columns,
  rows,
  selectedRowIds,
  onToggleRowSelection,
  onToggleAllSelection,
  sort,
  onSort,
  editingCell,
  onCellClick,
  onCellSave,
  onCellCancel,
}: DataTableProps) {
  const allSelected = rows.length > 0 && selectedRowIds.size === rows.length;
  const someSelected = selectedRowIds.size > 0 && selectedRowIds.size < rows.length;

  return (
    <table className="w-full border-collapse">
      {/* Header */}
      <thead className="sticky top-0 z-10">
        <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          {/* Checkbox column */}
          <th className="w-12 px-3 py-3 text-left">
            <Checkbox
              checked={allSelected}
              onCheckedChange={onToggleAllSelection}
              className={someSelected ? 'opacity-70' : ''}
            />
          </th>
          {columns.map((col) => {
            const isSorted = sort?.column_id === col.id;
            return (
              <th
                key={col.id}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                onClick={() => onSort(col.id)}
              >
                <div className={`flex items-center gap-1 ${col.type === 'number' ? 'justify-end' : ''}`}>
                  <span>{col.name}</span>
                  <span className="flex flex-col ml-1">
                    {isSorted ? (
                      sort.direction === 'asc' ? (
                        <ChevronUpIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      ) : (
                        <ChevronDownIcon className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                      )
                    ) : (
                      <ChevronUpIcon className="h-3.5 w-3.5 text-gray-300 dark:text-gray-600" />
                    )}
                  </span>
                </div>
              </th>
            );
          })}
        </tr>
      </thead>

      {/* Body */}
      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
        {rows.length === 0 ? (
          <tr>
            <td colSpan={columns.length + 1} className="px-4 py-12 text-center">
              <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                <TableCellsIcon className="h-8 w-8" />
                <p className="text-sm">No rows found</p>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const isSelected = selectedRowIds.has(row.id);
            return (
              <tr
                key={row.id}
                className={`
                  transition-colors
                  ${isSelected
                    ? 'bg-blue-50 dark:bg-blue-900/20'
                    : 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }
                `}
              >
                {/* Checkbox */}
                <td className="w-12 px-3 py-2.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => onToggleRowSelection(row.id)}
                  />
                </td>

                {/* Data cells */}
                {columns.map((col) => {
                  const isEditing = editingCell?.rowId === row.id && editingCell?.columnId === col.id;
                  const cellValue = row.data[col.id];

                  return (
                    <td
                      key={col.id}
                      className={`
                        px-4 py-2.5 cursor-pointer max-w-[300px]
                        ${isEditing ? 'p-0' : ''}
                        ${col.type === 'number' ? 'text-right' : ''}
                      `}
                      onClick={() => {
                        if (!isEditing) {
                          onCellClick(row.id, col.id);
                        }
                      }}
                    >
                      {isEditing ? (
                        <InlineEditor
                          column={col}
                          value={cellValue}
                          onSave={(val) => onCellSave(row.id, col.id, val)}
                          onCancel={onCellCancel}
                        />
                      ) : (
                        <CellRenderer column={col} value={cellValue} />
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  );
}

// =============================================================================
// AddRecordModal
// =============================================================================

interface AddRecordModalProps {
  columns: ColumnDefinition[];
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

function AddRecordModal({ columns, onSave, onClose }: AddRecordModalProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const col of columns) {
      initial[col.id] = getDefaultValue(col);
    }
    return initial;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const updateField = (columnId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [columnId]: value }));
  };

  const renderInput = (col: ColumnDefinition) => {
    const value = formData[col.id];

    switch (col.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`add-${col.id}`}
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateField(col.id, checked)}
            />
            <Label htmlFor={`add-${col.id}`} className="text-sm text-gray-700 dark:text-gray-300">
              {value ? 'Yes' : 'No'}
            </Label>
          </div>
        );

      case 'select':
        return (
          <select
            id={`add-${col.id}`}
            value={String(value ?? '')}
            onChange={(e) => updateField(col.id, e.target.value)}
            className="flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <option value="">-- Select --</option>
            {col.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'number':
        return (
          <Input
            id={`add-${col.id}`}
            type="number"
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => updateField(col.id, e.target.value === '' ? null : Number(e.target.value))}
          />
        );

      case 'date':
        return (
          <Input
            id={`add-${col.id}`}
            type="date"
            value={String(value ?? '')}
            onChange={(e) => updateField(col.id, e.target.value)}
          />
        );

      default: // text
        return (
          <Input
            id={`add-${col.id}`}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => updateField(col.id, e.target.value)}
            placeholder={`Enter ${col.name.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] h-[500px] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Record</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content - scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {columns.map((col) => (
              <div key={col.id} className="space-y-1.5">
                <Label htmlFor={`add-${col.id}`}>
                  {col.name}
                  {col.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderInput(col)}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Add Record
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// TableToolbar
// =============================================================================

interface TableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  columnCount: number;
  rowCount: number;
  selectedCount: number;
  onAddRecord: () => void;
  onDeleteSelected: () => void;
  onToggleChat?: () => void;
  onImport?: () => void;
  onExport?: () => void;
}

function TableToolbar({
  searchQuery,
  onSearchChange,
  columnCount,
  rowCount,
  selectedCount,
  onAddRecord,
  onDeleteSelected,
  onToggleChat,
  onImport,
  onExport,
}: TableToolbarProps) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      {/* Left side: search + counts */}
      <div className="flex items-center gap-4 flex-1">
        <div className="relative max-w-sm flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            type="text"
            placeholder="Search rows..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9 h-9"
          />
        </div>

        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>{columnCount} column{columnCount !== 1 ? 's' : ''}</span>
          <span className="h-3 w-px bg-gray-300 dark:bg-gray-600" />
          <span>{rowCount} row{rowCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      {/* Right side: actions */}
      <div className="flex items-center gap-2">
        {selectedCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDeleteSelected}
            className="gap-1.5"
          >
            <TrashIcon className="h-4 w-4" />
            Delete {selectedCount} selected
          </Button>
        )}

        <Button size="sm" onClick={onAddRecord} className="gap-1.5">
          <PlusIcon className="h-4 w-4" />
          Add Record
        </Button>

        {onImport && (
          <Button size="sm" variant="outline" onClick={onImport} className="gap-1.5">
            <ArrowUpTrayIcon className="h-4 w-4" />
            Import
          </Button>
        )}

        {onExport && (
          <Button size="sm" variant="outline" onClick={onExport} className="gap-1.5">
            <ArrowDownTrayIcon className="h-4 w-4" />
            Export
          </Button>
        )}

        {onToggleChat && (
          <Button size="sm" variant="outline" onClick={onToggleChat} className="gap-1.5">
            <ChatBubbleLeftRightIcon className="h-4 w-4" />
            Chat
          </Button>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// TableViewPage (Main)
// =============================================================================

export default function TableViewPage() {
  const { tableId: tableIdParam } = useParams<{ tableId: string }>();
  const tableId = Number(tableIdParam);
  const navigate = useNavigate();

  // Data state
  const [table, setTable] = useState<TableDefinition | null>(null);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);

  // Chat context
  const { updateContext, messages, isLoading } = useChatContext();

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: number; columnId: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});

  // Compute filtered rows (client-side filtering on loaded rows)
  const filteredRows = useMemo(
    () => table ? applyFilters(rows, filters, table.columns) : rows,
    [rows, filters, table]
  );

  // Search debounce ref
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track message count for auto-refresh after tool execution
  const prevMessageCountRef = useRef(messages.length);
  const wasLoadingRef = useRef(false);

  // -----------------------------------------------------------------------
  // Fetch table definition
  // -----------------------------------------------------------------------

  const fetchTable = useCallback(async () => {
    if (!tableId || isNaN(tableId)) return;
    try {
      const tableDef = await getTable(tableId);
      setTable(tableDef);
    } catch (err) {
      showErrorToast(err, 'Failed to load table');
    }
  }, [tableId]);

  // -----------------------------------------------------------------------
  // Fetch rows
  // -----------------------------------------------------------------------

  const fetchRows = useCallback(async () => {
    if (!tableId || isNaN(tableId)) return;
    try {
      const response = await listRows(tableId, {
        limit: 500,
        sort_column: sort?.column_id,
        sort_direction: sort?.direction,
      });
      setRows(response.rows);
      setTotalRows(response.total);
    } catch (err) {
      showErrorToast(err, 'Failed to load rows');
    }
  }, [tableId, sort]);

  // -----------------------------------------------------------------------
  // Search rows
  // -----------------------------------------------------------------------

  const performSearch = useCallback(async (query: string) => {
    if (!tableId || isNaN(tableId)) return;
    if (!query.trim()) {
      fetchRows();
      return;
    }
    try {
      const results = await searchRows(tableId, query.trim());
      setRows(results);
      setTotalRows(results.length);
    } catch (err) {
      showErrorToast(err, 'Search failed');
    }
  }, [tableId, fetchRows]);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchTable(), fetchRows()]).finally(() => setLoading(false));
  }, [fetchTable, fetchRows]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Push table context to chat whenever table/rows/filters change
  useEffect(() => {
    if (table) {
      updateContext({
        current_page: 'table_view',
        table_id: table.id,
        table_name: table.name,
        table_description: table.description || '',
        columns: table.columns,
        row_count: totalRows,
        sample_rows: rows.slice(0, 20).map(r => ({ id: r.id, data: r.data })),
        active_sort: sort,
        active_filters: Object.keys(filters).length > 0 ? filters : undefined,
      });
    }
  }, [table, rows, totalRows, sort, filters, updateContext]);

  // Auto-refresh rows when chat executes data-modifying tools
  const DATA_TOOLS = ['create_row', 'update_row', 'delete_row'];
  useEffect(() => {
    // Detect transition from loading → not loading (response complete)
    if (wasLoadingRef.current && !isLoading && messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.tool_history) {
        const usedDataTool = lastMsg.tool_history.some(
          (t) => DATA_TOOLS.includes(t.tool_name)
        );
        if (usedDataTool) {
          fetchRows();
        }
      }
    }
    wasLoadingRef.current = isLoading;
    prevMessageCountRef.current = messages.length;
  }, [isLoading, messages, fetchRows]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSort = (columnId: string) => {
    setSort((prev) => {
      if (prev?.column_id === columnId) {
        if (prev.direction === 'asc') {
          return { column_id: columnId, direction: 'desc' };
        }
        // Already desc, clear sort
        return null;
      }
      return { column_id: columnId, direction: 'asc' };
    });
  };

  const handleToggleRowSelection = (rowId: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleToggleAllSelection = () => {
    if (selectedRowIds.size === filteredRows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const handleCellClick = (rowId: number, columnId: string) => {
    setEditingCell({ rowId, columnId });
  };

  const handleCellSave = async (rowId: number, columnId: string, value: unknown) => {
    setEditingCell(null);

    // Find current row to see if value actually changed
    const currentRow = rows.find((r) => r.id === rowId);
    if (currentRow && currentRow.data[columnId] === value) return;

    try {
      const updatedRow = await updateRow(tableId, rowId, { [columnId]: value });
      setRows((prev) => prev.map((r) => (r.id === rowId ? updatedRow : r)));
    } catch (err) {
      showErrorToast(err, 'Failed to update cell');
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
  };

  const handleAddRecord = async (data: Record<string, unknown>) => {
    try {
      const newRow = await createRow(tableId, data);
      setRows((prev) => [newRow, ...prev]);
      setTotalRows((prev) => prev + 1);
      setShowAddModal(false);
      showSuccessToast('Record added successfully');
    } catch (err) {
      showErrorToast(err, 'Failed to add record');
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportTableCsv(tableId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${table?.name || 'export'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccessToast('Export downloaded');
    } catch (err) {
      showErrorToast(err, 'Export failed');
    }
  };

  const handleImportComplete = (result: { imported: number }) => {
    setShowImportModal(false);
    if (result.imported > 0) {
      fetchRows();
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRowIds.size === 0) return;

    const count = selectedRowIds.size;
    const confirmed = window.confirm(`Delete ${count} selected row${count !== 1 ? 's' : ''}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      if (count === 1) {
        const rowId = Array.from(selectedRowIds)[0];
        await deleteRow(tableId, rowId);
      } else {
        await bulkDeleteRows(tableId, Array.from(selectedRowIds));
      }

      setRows((prev) => prev.filter((r) => !selectedRowIds.has(r.id)));
      setTotalRows((prev) => prev - count);
      setSelectedRowIds(new Set());
      showSuccessToast(`Deleted ${count} row${count !== 1 ? 's' : ''}`);
    } catch (err) {
      showErrorToast(err, 'Failed to delete rows');
    }
  };

  // -----------------------------------------------------------------------
  // Payload Handlers (for chat proposals)
  // -----------------------------------------------------------------------

  const handleSchemaProposalAccept = useCallback(async (proposalData: any) => {
    if (!table) return;

    try {
      // Compute final columns array by applying operations
      let columns = [...table.columns];

      for (const op of proposalData.operations) {
        if (op.action === 'add' && op.column) {
          const newCol = {
            id: `col_${Math.random().toString(36).slice(2, 10)}`,
            name: op.column.name,
            type: op.column.type,
            required: op.column.required || false,
            ...(op.column.options ? { options: op.column.options } : {}),
          };

          if (op.after_column_id) {
            const afterIdx = columns.findIndex((c) => c.id === op.after_column_id);
            if (afterIdx >= 0) {
              columns.splice(afterIdx + 1, 0, newCol);
            } else {
              columns.push(newCol);
            }
          } else {
            columns.push(newCol);
          }
        } else if (op.action === 'modify' && op.column_id && op.changes) {
          const idx = columns.findIndex((c) => c.id === op.column_id);
          if (idx >= 0) {
            columns[idx] = { ...columns[idx], ...op.changes };
          }
        } else if (op.action === 'remove' && op.column_id) {
          columns = columns.filter((c) => c.id !== op.column_id);
        } else if (op.action === 'reorder' && op.column_id) {
          const colIdx = columns.findIndex((c) => c.id === op.column_id);
          if (colIdx >= 0) {
            const [col] = columns.splice(colIdx, 1);
            if (op.after_column_id) {
              const afterIdx = columns.findIndex((c) => c.id === op.after_column_id);
              columns.splice(afterIdx + 1, 0, col);
            } else {
              columns.unshift(col);
            }
          }
        }
      }

      const updateData: any = { columns };
      if (proposalData.table_name) updateData.name = proposalData.table_name;
      if (proposalData.table_description) updateData.description = proposalData.table_description;

      const updated = await updateTable(tableId, updateData);
      setTable(updated);
      showSuccessToast('Schema updated successfully');
    } catch (err) {
      showErrorToast(err, 'Failed to apply schema changes');
    }
  }, [table, tableId]);

  const handleDataProposalAccept = useCallback(async (proposalData: any) => {
    if (!table) return;

    const ops = proposalData.operations || [];
    const colNameToId = new Map<string, string>();
    for (const col of table.columns) {
      colNameToId.set(col.name.toLowerCase(), col.id);
    }

    const mapData = (data: Record<string, unknown>): Record<string, unknown> => {
      const mapped: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(data)) {
        const colId = colNameToId.get(key.toLowerCase()) || key;
        mapped[colId] = val;
      }
      return mapped;
    };

    try {
      for (const op of ops) {
        if (op.action === 'add' && op.data) {
          await createRow(tableId, mapData(op.data));
        } else if (op.action === 'update' && op.row_id && op.changes) {
          await updateRow(tableId, op.row_id, mapData(op.changes));
        } else if (op.action === 'delete' && op.row_id) {
          await deleteRow(tableId, op.row_id);
        }
      }
      await fetchRows();
      showSuccessToast(`Applied ${ops.length} data change${ops.length !== 1 ? 's' : ''}`);
    } catch (err) {
      showErrorToast(err, 'Failed to apply some data changes');
      await fetchRows(); // Refresh to see partial results
    }
  }, [table, tableId, fetchRows]);

  const payloadHandlers = useMemo(() => ({
    schema_proposal: {
      render: (payload: any, callbacks: any) => (
        <SchemaProposalCard data={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
      ),
      onAccept: handleSchemaProposalAccept,
      renderOptions: { headerTitle: 'Schema Proposal', headerIcon: '📋' },
    },
    data_proposal: {
      render: (payload: any, callbacks: any) => (
        <DataProposalCard data={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
      ),
      onAccept: handleDataProposalAccept,
      renderOptions: { headerTitle: 'Data Proposal', headerIcon: '📊' },
    },
  }), [handleSchemaProposalAccept, handleDataProposalAccept]);

  // -----------------------------------------------------------------------
  // Render: loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
          <div className="h-8 w-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading table...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: error / not found
  // -----------------------------------------------------------------------

  if (!table) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
          <TableCellsIcon className="h-10 w-10" />
          <p className="text-sm font-medium">Table not found</p>
          <p className="text-xs">The table you are looking for does not exist or could not be loaded.</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: main view
  // -----------------------------------------------------------------------

  return (
    <div className="flex-1 min-h-0 flex flex-row">
      {/* Chat Tray (left side) */}
      <ChatTray
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        initialContext={{
          current_page: 'table_view',
          table_id: table.id,
          table_name: table.name,
        }}
        payloadHandlers={payloadHandlers}
      />

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Page title */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TableCellsIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{table.name}</h1>
                {table.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{table.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/tables/${tableId}/edit`)}
                className="gap-2"
              >
                <PencilSquareIcon className="h-5 w-5" />
                Edit Schema
              </Button>
              <Button
                variant={chatOpen ? 'default' : 'outline'}
                onClick={() => setChatOpen((prev) => !prev)}
                className="gap-2"
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
                {chatOpen ? 'Hide Chat' : 'Chat'}
              </Button>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0">
          <TableToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            columnCount={table.columns.length}
            rowCount={filteredRows.length}
            selectedCount={selectedRowIds.size}
            onAddRecord={() => setShowAddModal(true)}
            onDeleteSelected={handleDeleteSelected}
            onImport={() => setShowImportModal(true)}
            onExport={handleExport}
          />
        </div>

        {/* Filter bar */}
        <div className="flex-shrink-0">
          <FilterBar
            columns={table.columns}
            rows={rows}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Data table - scrollable */}
        <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-900">
          <DataTable
            columns={table.columns}
            rows={filteredRows}
            selectedRowIds={selectedRowIds}
            onToggleRowSelection={handleToggleRowSelection}
            onToggleAllSelection={handleToggleAllSelection}
            sort={sort}
            onSort={handleSort}
            editingCell={editingCell}
            onCellClick={handleCellClick}
            onCellSave={handleCellSave}
            onCellCancel={handleCellCancel}
          />
        </div>

        {/* Add Record Modal */}
        {showAddModal && (
          <AddRecordModal
            columns={table.columns}
            onSave={handleAddRecord}
            onClose={() => setShowAddModal(false)}
          />
        )}

        {/* Import CSV Modal */}
        {showImportModal && (
          <ImportModal
            tableId={tableId}
            onClose={() => setShowImportModal(false)}
            onImported={handleImportComplete}
          />
        )}
      </div>
    </div>
  );
}
