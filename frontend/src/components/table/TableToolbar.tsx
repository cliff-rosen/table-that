import {
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

// =============================================================================
// TableToolbar
// =============================================================================

export interface TableToolbarProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  columnCount: number;
  rowCount: number;
  selectedCount: number;
  onAddRecord: () => void;
  onDeleteSelected: () => void;
  onEditSchema?: () => void;
  onImport?: () => void;
  onExport?: () => void;
}

export default function TableToolbar({
  searchQuery,
  onSearchChange,
  columnCount,
  rowCount,
  selectedCount,
  onAddRecord,
  onDeleteSelected,
  onEditSchema,
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
      <div className="flex items-center gap-3">
        {selectedCount > 0 && (
          <Button
            variant="destructive"
            size="sm"
            onClick={onDeleteSelected}
            className="gap-1.5"
          >
            <TrashIcon className="h-4 w-4" />
            Delete {selectedCount}
          </Button>
        )}

        <Button size="sm" onClick={onAddRecord} className="gap-1.5">
          <PlusIcon className="h-4 w-4" />
          Add Record
        </Button>

        {/* Secondary actions — subtle text links */}
        <span className="h-4 w-px bg-gray-200 dark:bg-gray-700" />
        {onEditSchema && (
          <button onClick={onEditSchema} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors whitespace-nowrap">
            Edit Schema
          </button>
        )}
        {onImport && (
          <button onClick={onImport} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors whitespace-nowrap">
            Import
          </button>
        )}
        {onExport && (
          <button onClick={onExport} className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors whitespace-nowrap">
            Export
          </button>
        )}
      </div>
    </div>
  );
}
