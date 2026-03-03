import { PencilSquareIcon, TrashIcon } from '@heroicons/react/24/outline';
import type { TableListItem } from '../../types/table';

function formatRelativeDate(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return date.toLocaleDateString();
}

interface TableCardProps {
  table: TableListItem;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function TableCard({ table, onClick, onEdit, onDelete }: TableCardProps) {
  return (
    <div
      onClick={onClick}
      className="group relative bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-5 cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all"
    >
      {/* Action buttons */}
      <div className="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="p-1.5 rounded text-gray-400 hover:text-blue-500 dark:text-gray-500 dark:hover:text-blue-400"
          title="Edit table schema"
        >
          <PencilSquareIcon className="h-4 w-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1.5 rounded text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400"
          title="Delete table"
        >
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Table name */}
      <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1 pr-8 truncate">
        {table.name}
      </h3>

      {/* Description */}
      {table.description && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-3 line-clamp-2">
          {table.description}
        </p>
      )}
      {!table.description && <div className="mb-3" />}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>
          {table.column_count} {table.column_count === 1 ? 'column' : 'columns'}
        </span>
        <span>
          {table.row_count} {table.row_count === 1 ? 'row' : 'rows'}
        </span>
      </div>

      {/* Last updated */}
      <div className="mt-2 text-xs text-gray-400 dark:text-gray-500">
        Updated {formatRelativeDate(table.updated_at)}
      </div>
    </div>
  );
}
