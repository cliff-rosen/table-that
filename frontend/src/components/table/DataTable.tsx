import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronUpIcon,
  ChevronDownIcon,
  TableCellsIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import type { ColumnDefinition, ColumnType, TableRow, SortState } from '../../types/table';
import type { DataOperation } from '../../types/dataProposal';
import type { SchemaOperation } from '../../types/schemaProposal';
import { generateColumnId } from '../../types/schemaProposal';
import { Checkbox } from '../ui/checkbox';
import { Badge } from '../ui/badge';
import { OpStatusIcon } from './ProposalWidgets';
import type { DataTableProposal } from '../../types/proposalOverlay';

// =============================================================================
// Internal display types (not exported)
// =============================================================================

interface RowProposalMeta {
  action: 'add' | 'delete' | 'update';
  opIndex: number;
  oldValues?: Record<string, unknown>;
}

interface ColumnProposalMeta {
  action: 'add' | 'remove' | 'modify' | 'reorder';
  changes?: Partial<{ name: string; type: string; required: boolean; options: string[] }>;
}

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
// Internal display computation hooks
// =============================================================================

function useDataProposalDisplay(
  operations: DataOperation[] | undefined,
  rows: TableRow[],
  tableId: number,
) {
  const phantomRows = useMemo(() => {
    if (!operations) return [];
    const addRows: TableRow[] = [];
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (op.action === 'add' && op.data) {
        addRows.push({
          id: -(i + 1),
          table_id: tableId,
          data: op.data,
          created_at: '',
          updated_at: '',
        });
      }
    }
    return addRows;
  }, [operations, tableId]);

  const updatePatches = useMemo(() => {
    const patches = new Map<number, Record<string, unknown>>();
    if (!operations) return patches;
    for (const op of operations) {
      if (op.action === 'update' && op.row_id && op.changes) {
        patches.set(op.row_id, op.changes);
      }
    }
    return patches;
  }, [operations]);

  const rowMeta = useMemo(() => {
    const map = new Map<number, RowProposalMeta>();
    if (!operations) return map;

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      if (op.action === 'add') {
        map.set(-(i + 1), { action: 'add', opIndex: i });
      } else if (op.action === 'delete' && op.row_id) {
        map.set(op.row_id, { action: 'delete', opIndex: i });
      } else if (op.action === 'update' && op.row_id && op.changes) {
        const originalRow = rows.find((r) => r.id === op.row_id);
        const oldValues: Record<string, unknown> = {};
        for (const colId of Object.keys(op.changes)) {
          oldValues[colId] = originalRow?.data[colId] ?? null;
        }
        map.set(op.row_id, { action: 'update', opIndex: i, oldValues });
      }
    }

    return map;
  }, [operations, rows]);

  return { phantomRows, updatePatches, rowMeta };
}

function useSchemaProposalDisplay(
  operations: SchemaOperation[] | undefined,
  columns: ColumnDefinition[],
) {
  const addedColumnIds = useMemo(() => {
    if (!operations) return new Map<number, string>();
    const map = new Map<number, string>();
    operations.forEach((op, i) => {
      if (op.action === 'add') {
        map.set(i, generateColumnId());
      }
    });
    return map;
  }, [operations]);

  const { effectiveColumns, columnMeta } = useMemo(() => {
    if (!operations) {
      return {
        effectiveColumns: columns,
        columnMeta: new Map<string, ColumnProposalMeta>(),
      };
    }

    const meta = new Map<string, ColumnProposalMeta>();
    let cols = [...columns];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];

      switch (op.action) {
        case 'add': {
          if (!op.column) break;
          const newId = addedColumnIds.get(i)!;
          const newCol: ColumnDefinition = {
            id: newId,
            name: op.column.name,
            type: (op.column.type as ColumnType) || 'text',
            required: op.column.required || false,
            ...(op.column.options ? { options: op.column.options } : {}),
          };
          meta.set(newId, { action: 'add' });

          if (op.after_column_id) {
            const afterIdx = cols.findIndex((c) => c.id === op.after_column_id);
            if (afterIdx >= 0) {
              cols.splice(afterIdx + 1, 0, newCol);
            } else {
              cols.push(newCol);
            }
          } else {
            cols.push(newCol);
          }
          break;
        }

        case 'remove': {
          if (!op.column_id) break;
          meta.set(op.column_id, { action: 'remove' });
          break;
        }

        case 'modify': {
          if (!op.column_id || !op.changes) break;
          meta.set(op.column_id, { action: 'modify', changes: op.changes });
          break;
        }

        case 'reorder': {
          if (!op.column_id) break;
          meta.set(op.column_id, { action: 'reorder' });
          const colIdx = cols.findIndex((c) => c.id === op.column_id);
          if (colIdx >= 0) {
            const [col] = cols.splice(colIdx, 1);
            if (op.after_column_id) {
              const afterIdx = cols.findIndex((c) => c.id === op.after_column_id);
              cols.splice(afterIdx + 1, 0, col);
            } else {
              cols.unshift(col);
            }
          }
          break;
        }
      }
    }

    return { effectiveColumns: cols, columnMeta: meta };
  }, [operations, columns, addedColumnIds]);

  return { effectiveColumns, columnMeta };
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
  proposal?: DataTableProposal;
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
  proposal,
}: DataTableProps) {
  const dataProposal = proposal?.kind === 'data' ? proposal : undefined;
  const schemaProposal = proposal?.kind === 'schema' ? proposal : undefined;

  // Compute display data from raw operations
  const { phantomRows, updatePatches, rowMeta } = useDataProposalDisplay(
    dataProposal?.operations,
    rows,
    rows[0]?.table_id ?? 0,
  );

  const { effectiveColumns, columnMeta } = useSchemaProposalDisplay(
    schemaProposal?.operations,
    columns,
  );

  const displayColumns = schemaProposal ? effectiveColumns : columns;

  const effectiveRows = useMemo(() => {
    if (!dataProposal) return rows;
    const patchedRows = rows.map((row) => {
      const patch = updatePatches.get(row.id);
      if (!patch) return row;
      return { ...row, data: { ...row.data, ...patch } };
    });
    return [...phantomRows, ...patchedRows];
  }, [rows, dataProposal, updatePatches, phantomRows]);

  // allSelected uses rows.length (real rows only — phantom rows can't be selected)
  const allSelected = rows.length > 0 && selectedRowIds.size === rows.length;
  const someSelected = selectedRowIds.size > 0 && selectedRowIds.size < rows.length;
  const hasProposal = !!proposal;

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
          {displayColumns.map((col) => {
            const isSorted = sort?.column_id === col.id;
            const schemaMeta = columnMeta.get(col.id);
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
        {effectiveRows.length === 0 ? (
          <tr>
            <td colSpan={displayColumns.length + 1} className="px-4 py-12 text-center">
              <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
                <TableCellsIcon className="h-8 w-8" />
                <p className="text-sm">No rows yet</p>
              </div>
            </td>
          </tr>
        ) : (
          effectiveRows.map((row) => {
            const isSelected = selectedRowIds.has(row.id);
            const meta = rowMeta.get(row.id);

            // Row background classes based on proposal meta
            let rowBg: string;
            if (meta?.action === 'add') {
              rowBg = 'bg-green-50 dark:bg-green-900/20 border-l-4 border-l-green-400';
            } else if (meta?.action === 'delete') {
              rowBg = 'bg-red-50 dark:bg-red-900/15 opacity-60 border-l-4 border-l-red-400';
            } else if (meta?.action === 'update') {
              rowBg = 'border-l-4 border-l-amber-400 bg-white dark:bg-gray-900';
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
                  {meta && dataProposal ? (
                    // Proposal row: show op checkbox or status icon
                    dataProposal.phase !== 'idle' ? (
                      <OpStatusIcon result={dataProposal.opResults[meta.opIndex]} />
                    ) : (
                      <Checkbox
                        checked={dataProposal.checkedOps[meta.opIndex]}
                        onCheckedChange={() => dataProposal.onToggleOp(meta.opIndex)}
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
                {displayColumns.map((col) => {
                  const isEditing = !hasProposal && editingCell?.rowId === row.id && editingCell?.columnId === col.id;
                  const cellValue = row.data[col.id];
                  const schemaMeta = columnMeta.get(col.id);

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
                    isChangedCell ? 'bg-amber-100/60 dark:bg-amber-800/20' : '',
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
