import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  TrashIcon,
  TableCellsIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { listTables, createTable, deleteTable } from '../lib/api/tableApi';
import type { TableListItem, ColumnDefinition, ColumnType } from '../types/table';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';
import ImportModal from '../components/table/ImportModal';

// =============================================================================
// Constants
// =============================================================================

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'select', label: 'Select' },
];

function generateColumnId(): string {
  return `col_${Math.random().toString(36).substring(2, 10)}`;
}

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

// =============================================================================
// Schema Editor (inline in modal)
// =============================================================================

interface SchemaEditorProps {
  columns: ColumnDefinition[];
  onChange: (columns: ColumnDefinition[]) => void;
}

function SchemaEditor({ columns, onChange }: SchemaEditorProps) {
  function handleAddColumn() {
    onChange([
      ...columns,
      {
        id: generateColumnId(),
        name: '',
        type: 'text',
        required: false,
      },
    ]);
  }

  function handleRemoveColumn(index: number) {
    onChange(columns.filter((_, i) => i !== index));
  }

  function handleColumnNameChange(index: number, name: string) {
    const updated = [...columns];
    updated[index] = { ...updated[index], name };
    onChange(updated);
  }

  function handleColumnTypeChange(index: number, type: ColumnType) {
    const updated = [...columns];
    updated[index] = { ...updated[index], type };
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Columns
        </label>
        <button
          type="button"
          onClick={handleAddColumn}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <PlusIcon className="h-4 w-4" />
          Add Column
        </button>
      </div>

      {columns.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
          No columns yet. Add at least one column to define your table schema.
        </p>
      )}

      <div className="space-y-2">
        {columns.map((col, index) => (
          <div key={col.id} className="flex items-center gap-2">
            <input
              type="text"
              value={col.name}
              onChange={(e) => handleColumnNameChange(index, e.target.value)}
              placeholder="Column name"
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={col.type}
              onChange={(e) =>
                handleColumnTypeChange(index, e.target.value as ColumnType)
              }
              className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {COLUMN_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleRemoveColumn(index)}
              className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded"
              title="Remove column"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// Create Table Modal
// =============================================================================

interface CreateTableModalProps {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    description?: string;
    columns: ColumnDefinition[];
  }) => Promise<void>;
}

function CreateTableModal({ onClose, onCreate }: CreateTableModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<ColumnDefinition[]>([
    { id: generateColumnId(), name: '', type: 'text', required: false },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      showErrorToast('Table name is required.', 'Validation Error');
      return;
    }

    const validColumns = columns.filter((c) => c.name.trim());
    if (validColumns.length === 0) {
      showErrorToast(
        'Add at least one column with a name.',
        'Validation Error'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        columns: validColumns,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] h-[500px] flex flex-col">
        {/* Header - fixed */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Create New Table
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content - scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {/* Table name */}
            <div>
              <label
                htmlFor="table-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Table Name <span className="text-red-500">*</span>
              </label>
              <input
                id="table-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Customer Feedback"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="table-description"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Description
              </label>
              <input
                id="table-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Schema editor */}
            <SchemaEditor columns={columns} onChange={setColumns} />
          </div>

          {/* Footer - fixed */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// =============================================================================
// Delete Confirmation Modal
// =============================================================================

interface DeleteConfirmModalProps {
  tableName: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

function DeleteConfirmModal({
  tableName,
  onClose,
  onConfirm,
}: DeleteConfirmModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleConfirm() {
    setIsDeleting(true);
    try {
      await onConfirm();
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Delete Table
        </h2>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
          Are you sure you want to delete{' '}
          <span className="font-medium text-gray-900 dark:text-white">
            {tableName}
          </span>
          ? This action cannot be undone. All rows and data in this table will be
          permanently deleted.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Table Card
// =============================================================================

interface TableCardProps {
  table: TableListItem;
  onClick: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

function TableCard({ table, onClick, onEdit, onDelete }: TableCardProps) {
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

// =============================================================================
// Empty State
// =============================================================================

interface EmptyStateProps {
  onCreateClick: () => void;
}

function EmptyState({ onCreateClick }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <TableCellsIcon className="h-16 w-16 text-gray-300 dark:text-gray-600 mb-4" />
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        No tables yet
      </h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 text-center max-w-md">
        Create your first table to start organizing and managing your data.
        Tables let you define custom columns and store structured information.
      </p>
      <button
        onClick={onCreateClick}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
      >
        <PlusIcon className="h-5 w-5" />
        Create Your First Table
      </button>
    </div>
  );
}

// =============================================================================
// TablesListPage (main export)
// =============================================================================

export default function TablesListPage() {
  const navigate = useNavigate();

  const [tables, setTables] = useState<TableListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableListItem | null>(null);

  const fetchTables = useCallback(async () => {
    try {
      const data = await listTables();
      setTables(data);
    } catch (error) {
      showErrorToast(error, 'Failed to load tables');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTables();
  }, [fetchTables]);

  async function handleCreate(data: {
    name: string;
    description?: string;
    columns: ColumnDefinition[];
  }) {
    try {
      const created = await createTable(data);
      showSuccessToast(`Table "${created.name}" created.`);
      setShowCreateModal(false);
      await fetchTables();
    } catch (error) {
      showErrorToast(error, 'Failed to create table');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteTable(deleteTarget.id);
      showSuccessToast(`Table "${deleteTarget.name}" deleted.`);
      setDeleteTarget(null);
      await fetchTables();
    } catch (error) {
      showErrorToast(error, 'Failed to delete table');
    }
  }

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex-1 min-h-0 overflow-auto">
        <div className="max-w-6xl mx-auto w-full px-6 py-8">
          <div className="flex items-center justify-between mb-8">
            <div className="h-8 w-40 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-10 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-36 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto">
      <div className="max-w-6xl mx-auto w-full px-6 py-8">
          {/* Page header */}
          <div className="flex-shrink-0 flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Tables
              </h1>
              {tables.length > 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  {tables.length} {tables.length === 1 ? 'table' : 'tables'}
                </p>
              )}
            </div>
            {tables.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowImportModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  <ArrowUpTrayIcon className="h-5 w-5" />
                  Import CSV
                </button>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  <PlusIcon className="h-5 w-5" />
                  Create Table
                </button>
              </div>
            )}
          </div>

          {/* Content */}
          {tables.length === 0 ? (
            <EmptyState onCreateClick={() => setShowCreateModal(true)} />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  onClick={() => navigate(`/tables/${table.id}`)}
                  onEdit={() => navigate(`/tables/${table.id}/edit`)}
                  onDelete={() => setDeleteTarget(table)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Create modal */}
        {showCreateModal && (
          <CreateTableModal
            onClose={() => setShowCreateModal(false)}
            onCreate={handleCreate}
          />
        )}

        {/* Import CSV modal (creates new table from CSV) */}
        {showImportModal && (
          <ImportModal
            onClose={() => setShowImportModal(false)}
            onImported={(result) => {
              setShowImportModal(false);
              if (result.tableId) {
                navigate(`/tables/${result.tableId}`);
              } else {
                fetchTables();
              }
            }}
          />
        )}

        {/* Delete confirmation modal */}
        {deleteTarget && (
          <DeleteConfirmModal
            tableName={deleteTarget.name}
            onClose={() => setDeleteTarget(null)}
            onConfirm={handleDelete}
          />
        )}
      </div>
  );
}
