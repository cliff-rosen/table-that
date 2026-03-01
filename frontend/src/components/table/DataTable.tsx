import { useState, useEffect, useRef } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  TableCellsIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { ColumnDefinition, TableRow, SortState } from '../../types/table';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { OpStatusIcon } from '../chat/DataProposalCard';
import type { ProposalOverlay } from '../../hooks/useTableProposal';

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

export interface CellRendererProps {
  column: ColumnDefinition;
  value: unknown;
}

const TEXT_TRUNCATE_LENGTH = 80;

function TextCellRenderer({ value }: { value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const text = value !== null && value !== undefined ? String(value) : '';
  const isLong = text.length > TEXT_TRUNCATE_LENGTH || text.includes('\n');

  if (!isLong) {
    return (
      <span className="text-sm text-gray-900 dark:text-gray-100 truncate block">
        {text}
      </span>
    );
  }

  return (
    <div className="text-sm text-gray-900 dark:text-gray-100">
      <div className={expanded ? 'whitespace-pre-wrap break-words' : 'truncate'}>
        {text}
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
        }}
        className="text-xs text-purple-600 dark:text-purple-400 hover:underline mt-0.5"
      >
        {expanded ? 'Show less' : 'Show more'}
      </button>
    </div>
  );
}

export function CellRenderer({ column, value }: CellRendererProps) {
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
      return <TextCellRenderer value={value} />;
  }
}

// =============================================================================
// Helper: describe schema changes for modify columns
// =============================================================================

function describeChanges(changes: Partial<{ name: string; type: string; required: boolean; options: string[] }>): string {
  const parts: string[] = [];
  if (changes.name) parts.push(`renamed: ${changes.name}`);
  if (changes.type) parts.push(`type: ${changes.type}`);
  if (changes.required !== undefined) parts.push(changes.required ? 'required' : 'optional');
  if (changes.options) parts.push(`options: ${changes.options.join(', ')}`);
  return parts.length > 0 ? `→ ${parts.join(', ')}` : '';
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
  /** Called when user clicks the sparkle icon on a column header */
  onColumnResearch?: (columnName: string) => void;
  /** When present, enables inline proposal rendering (color-coded rows/columns) */
  proposalOverlay?: ProposalOverlay;
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
  onColumnResearch,
  proposalOverlay,
}: DataTableProps) {
  const allSelected = rows.length > 0 && selectedRowIds.size === rows.length;
  const someSelected = selectedRowIds.size > 0 && selectedRowIds.size < rows.length;
  const hasProposal = !!proposalOverlay;
  const dataOverlay = proposalOverlay?.kind === 'data' ? proposalOverlay : undefined;
  const schemaOverlay = proposalOverlay?.kind === 'schema' ? proposalOverlay : undefined;

  return (
    <table className="w-full border-collapse">
      {/* Header */}
      <thead className="sticky top-0 z-10">
        <tr className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          {/* Checkbox column */}
          <th className="w-12 px-3 py-3 text-left">
            {!hasProposal && (
              <Checkbox
                checked={allSelected}
                onCheckedChange={onToggleAllSelection}
                className={someSelected ? 'opacity-70' : ''}
              />
            )}
          </th>
          {columns.map((col) => {
            const isSorted = sort?.column_id === col.id;
            const schemaMeta = schemaOverlay?.columnMeta.get(col.id);
            const isSortDisabled = schemaMeta?.action === 'add' || schemaMeta?.action === 'remove';

            // Schema-proposal header classes
            let schemaThClasses = '';
            if (schemaMeta?.action === 'add') {
              schemaThClasses = 'bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-400';
            } else if (schemaMeta?.action === 'remove') {
              schemaThClasses = 'bg-red-50 dark:bg-red-900/15 border-l-4 border-l-red-400';
            } else if (schemaMeta?.action === 'modify') {
              schemaThClasses = 'bg-amber-50 dark:bg-amber-900/20 border-l-4 border-l-amber-400';
            }

            return (
              <th
                key={col.id}
                className={`group/th px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none transition-colors ${
                  isSortDisabled ? '' : 'cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700'
                } ${schemaThClasses}`}
                onClick={() => !isSortDisabled && onSort(col.id)}
              >
                <div className={`flex items-center gap-1 ${col.type === 'number' ? 'justify-end' : ''}`}>
                  <span className={schemaMeta?.action === 'remove' ? 'line-through opacity-60' : ''}>
                    {col.name}
                  </span>
                  {schemaMeta?.action === 'add' && (
                    <span className="text-[10px] text-green-600 dark:text-green-400 font-normal normal-case ml-1">
                      {col.type}
                    </span>
                  )}
                  {!isSortDisabled && (
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
                  )}
                  {!schemaMeta && onColumnResearch && rows.length > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onColumnResearch(col.name);
                      }}
                      className="ml-1 opacity-0 group-hover/th:opacity-100 transition-opacity p-0.5 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30"
                      title={`AI Research: fill "${col.name}" for all rows`}
                    >
                      <SparklesIcon className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400" />
                    </button>
                  )}
                </div>
                {schemaMeta?.action === 'remove' && (
                  <span className="text-[10px] text-red-600 dark:text-red-400 font-normal normal-case block mt-0.5">
                    Data will be lost
                  </span>
                )}
                {schemaMeta?.action === 'modify' && schemaMeta.changes && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-normal normal-case block mt-0.5">
                    {describeChanges(schemaMeta.changes)}
                  </span>
                )}
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
                <p className="text-sm">No rows yet</p>
              </div>
            </td>
          </tr>
        ) : (
          rows.map((row) => {
            const isSelected = selectedRowIds.has(row.id);
            const meta = dataOverlay?.rowMeta.get(row.id);

            // Row background classes based on proposal meta
            let rowBg: string;
            if (meta?.action === 'add') {
              rowBg = 'bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-400';
            } else if (meta?.action === 'delete') {
              rowBg = 'bg-red-50 dark:bg-red-900/15 opacity-60 border-l-4 border-l-red-400';
            } else if (meta?.action === 'update') {
              rowBg = 'border-l-4 border-l-green-400 bg-white dark:bg-gray-900';
            } else if (isSelected) {
              rowBg = 'bg-blue-50 dark:bg-blue-900/20';
            } else {
              rowBg = 'bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50';
            }

            return (
              <tr
                key={row.id}
                className={`transition-colors ${rowBg}`}
              >
                {/* Checkbox / Proposal status */}
                <td className="w-12 px-3 py-2.5">
                  {meta && dataOverlay ? (
                    // Proposal row: show op checkbox or status icon
                    dataOverlay.phase !== 'idle' ? (
                      <OpStatusIcon result={dataOverlay.opResults[meta.opIndex]} />
                    ) : (
                      <Checkbox
                        checked={dataOverlay.checkedOps[meta.opIndex]}
                        onCheckedChange={() => dataOverlay.onToggleOp(meta.opIndex)}
                      />
                    )
                  ) : !hasProposal ? (
                    // Normal mode: selection checkbox
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => onToggleRowSelection(row.id)}
                    />
                  ) : null}
                </td>

                {/* Data cells */}
                {columns.map((col) => {
                  const isEditing = !hasProposal && editingCell?.rowId === row.id && editingCell?.columnId === col.id;
                  const cellValue = row.data[col.id];
                  const schemaMeta = schemaOverlay?.columnMeta.get(col.id);

                  // Determine if this cell was changed (for update rows)
                  const isChangedCell = meta?.action === 'update' && meta.oldValues && col.id in meta.oldValues;
                  const oldValue = isChangedCell ? meta!.oldValues![col.id] : undefined;

                  // Schema proposal cell classes
                  let schemaCellClass = '';
                  if (schemaMeta?.action === 'add') {
                    schemaCellClass = 'bg-green-50/40 dark:bg-green-900/10';
                  } else if (schemaMeta?.action === 'remove') {
                    schemaCellClass = 'bg-red-50/40 dark:bg-red-900/10 opacity-60';
                  }

                  // Build cell classes
                  const cellClasses = [
                    'px-4 py-2.5 max-w-[300px]',
                    isEditing ? 'p-0' : '',
                    col.type === 'number' ? 'text-right' : '',
                    !hasProposal ? 'cursor-pointer' : '',
                    isChangedCell ? 'bg-green-100/60 dark:bg-green-800/20' : '',
                    schemaCellClass,
                  ].filter(Boolean).join(' ');

                  // Tooltip for changed cells
                  const titleAttr = isChangedCell
                    ? `Was: ${oldValue !== null && oldValue !== undefined ? String(oldValue) : '(empty)'}`
                    : undefined;

                  return (
                    <td
                      key={col.id}
                      className={cellClasses}
                      title={titleAttr}
                      onClick={() => {
                        if (!isEditing && !hasProposal) {
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
                      ) : schemaMeta?.action === 'add' ? (
                        <span className="text-sm text-gray-400 dark:text-gray-500">—</span>
                      ) : (
                        <span className={`${meta?.action === 'delete' ? 'line-through' : ''} ${schemaMeta?.action === 'remove' ? 'line-through' : ''}`}>
                          <CellRenderer column={col} value={cellValue} />
                        </span>
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
