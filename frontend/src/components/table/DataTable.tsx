import { useState, useEffect, useRef } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import type { ColumnDefinition, TableRow, SortState } from '../../types/table';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';

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

export function getDefaultValue(col: ColumnDefinition): unknown {
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

export interface DataTableProps {
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

export default function DataTable({
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
