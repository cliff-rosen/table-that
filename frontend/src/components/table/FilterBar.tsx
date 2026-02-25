import { useState, useRef, useEffect } from 'react';
import type { ColumnDefinition, TableRow } from '../../types/table';

// =============================================================================
// Types
// =============================================================================

export interface FilterState {
  [columnId: string]: string[] | boolean | undefined;
  // For select columns: string[] of selected option values (empty = all)
  // For boolean columns: true | false | undefined (undefined = all)
}

interface FilterBarProps {
  columns: ColumnDefinition[];
  rows: TableRow[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

// =============================================================================
// Helpers
// =============================================================================

function getFilterableColumns(columns: ColumnDefinition[]): ColumnDefinition[] {
  return columns.filter((c) => c.type === 'select' || c.type === 'boolean');
}

function countValues(rows: TableRow[], columnId: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const val = row.data[columnId];
    const key = val === null || val === undefined ? '' : String(val);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/** Apply filters to rows (client-side) */
export function applyFilters(rows: TableRow[], filters: FilterState, columns: ColumnDefinition[]): TableRow[] {
  if (Object.keys(filters).length === 0) return rows;

  return rows.filter((row) => {
    for (const [columnId, filterValue] of Object.entries(filters)) {
      if (filterValue === undefined) continue;

      const col = columns.find((c) => c.id === columnId);
      if (!col) continue;

      const cellValue = row.data[columnId];

      if (col.type === 'boolean') {
        const boolFilter = filterValue as boolean;
        const cellBool = Boolean(cellValue);
        if (cellBool !== boolFilter) return false;
      }

      if (col.type === 'select' && Array.isArray(filterValue)) {
        if (filterValue.length === 0) continue; // empty = all
        const cellStr = cellValue === null || cellValue === undefined ? '' : String(cellValue);
        if (!filterValue.includes(cellStr)) return false;
      }
    }
    return true;
  });
}

// =============================================================================
// BooleanChip
// =============================================================================

function BooleanChip({
  column,
  rows,
  value,
  onChange,
}: {
  column: ColumnDefinition;
  rows: TableRow[];
  value: boolean | undefined;
  onChange: (val: boolean | undefined) => void;
}) {
  const counts = countValues(rows, column.id);
  const trueCount = counts.get('true') || 0;
  const falseCount = counts.get('false') || 0;

  const isActive = value !== undefined;

  const cycle = () => {
    if (value === undefined) onChange(true);
    else if (value === true) onChange(false);
    else onChange(undefined);
  };

  const label = value === undefined ? column.name : value ? `${column.name}: Yes` : `${column.name}: No`;

  return (
    <button
      type="button"
      onClick={cycle}
      className={`
        inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
        border transition-colors select-none
        ${isActive
          ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
          : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
        }
      `}
      title={`Yes: ${trueCount}, No: ${falseCount}. Click to cycle: All → Yes → No → All`}
    >
      <span>{label}</span>
      {isActive && (
        <span
          onClick={(e) => {
            e.stopPropagation();
            onChange(undefined);
          }}
          className="ml-0.5 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer"
        >
          ×
        </span>
      )}
    </button>
  );
}

// =============================================================================
// SelectChip
// =============================================================================

function SelectChip({
  column,
  rows,
  selected,
  onChange,
}: {
  column: ColumnDefinition;
  rows: TableRow[];
  selected: string[];
  onChange: (val: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const counts = countValues(rows, column.id);
  const options = column.options || [];
  const isActive = selected.length > 0;

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const toggleOption = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((s) => s !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const selectAll = () => onChange([]);
  const label = isActive
    ? selected.length === 1
      ? `${column.name}: ${selected[0]}`
      : `${column.name}: ${selected.length} selected`
    : column.name;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`
          inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium
          border transition-colors select-none
          ${isActive
            ? 'bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-800 dark:text-blue-200'
            : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
          }
        `}
      >
        <span>{label}</span>
        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        {isActive && (
          <span
            onClick={(e) => {
              e.stopPropagation();
              selectAll();
            }}
            className="ml-0.5 hover:text-blue-600 dark:hover:text-blue-300 cursor-pointer"
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px]">
          {/* "All" option */}
          <button
            type="button"
            onClick={selectAll}
            className={`
              w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
              ${!isActive ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-300'}
            `}
          >
            All
          </button>

          <div className="h-px bg-gray-200 dark:bg-gray-700 my-1" />

          {options.map((opt) => {
            const count = counts.get(opt) || 0;
            const checked = selected.length === 0 || selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleOption(opt)}
                className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center gap-2"
              >
                <input
                  type="checkbox"
                  checked={checked && isActive ? selected.includes(opt) : !isActive}
                  readOnly
                  className="h-3 w-3 rounded border-gray-300 text-blue-600"
                />
                <span className="flex-1 text-gray-700 dark:text-gray-300">{opt}</span>
                <span className="text-gray-400 dark:text-gray-500 tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// FilterBar
// =============================================================================

export default function FilterBar({ columns, rows, filters, onFiltersChange }: FilterBarProps) {
  const filterableColumns = getFilterableColumns(columns);

  if (filterableColumns.length === 0) return null;

  const activeCount = Object.values(filters).filter((v) => v !== undefined && (!Array.isArray(v) || v.length > 0)).length;

  const clearAll = () => onFiltersChange({});

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/50 flex-wrap">
      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Filters:</span>

      {filterableColumns.map((col) => {
        if (col.type === 'boolean') {
          return (
            <BooleanChip
              key={col.id}
              column={col}
              rows={rows}
              value={filters[col.id] as boolean | undefined}
              onChange={(val) => {
                const next = { ...filters };
                if (val === undefined) {
                  delete next[col.id];
                } else {
                  next[col.id] = val;
                }
                onFiltersChange(next);
              }}
            />
          );
        }

        if (col.type === 'select') {
          return (
            <SelectChip
              key={col.id}
              column={col}
              rows={rows}
              selected={(filters[col.id] as string[]) || []}
              onChange={(val) => {
                const next = { ...filters };
                if (val.length === 0) {
                  delete next[col.id];
                } else {
                  next[col.id] = val;
                }
                onFiltersChange(next);
              }}
            />
          );
        }

        return null;
      })}

      {activeCount > 0 && (
        <button
          type="button"
          onClick={clearAll}
          className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 underline ml-2"
        >
          Clear all
        </button>
      )}
    </div>
  );
}
