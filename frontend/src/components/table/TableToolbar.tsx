import {
  MagnifyingGlassIcon,
  PlusIcon,
  TrashIcon,
  ChatBubbleLeftRightIcon,
  ArrowUpTrayIcon,
  ArrowDownTrayIcon,
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
  onToggleChat?: () => void;
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
