import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  TrashIcon,
  TableCellsIcon,
  XMarkIcon,
  ArrowUpTrayIcon,
  PencilSquareIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { STARTERS } from '../config/starters';
import { listTables, createTable, deleteTable } from '../lib/api/tableApi';
import type { TableListItem, ColumnDefinition, ColumnType } from '../types/table';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';
import ImportModal from '../components/table/ImportModal';
import { useChatContext } from '../context/ChatContext';
import ChatTray from '../components/chat/ChatTray';
import SchemaProposalCard from '../components/chat/SchemaProposalCard';
import { applySchemaOperations, generateColumnId } from '../lib/utils/schemaOperations';
import type { SchemaProposalData } from '../lib/utils/schemaOperations';

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
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            Don't want to set up columns manually? Close this and use the{' '}
            <span className="font-medium text-blue-600 dark:text-blue-400">AI Chat</span>{' '}
            button instead — just describe the table you need and AI will design it for you.
          </p>
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
  onChatClick: () => void;
}

function EmptyState({ onCreateClick, onChatClick }: EmptyStateProps) {
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
      <div className="flex items-center gap-3">
        <button
          onClick={onCreateClick}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          <PlusIcon className="h-5 w-5" />
          Create Your First Table
        </button>
        <button
          onClick={onChatClick}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
        >
          <SparklesIcon className="h-5 w-5" />
          Design with AI
        </button>
      </div>
    </div>
  );
}

// =============================================================================
// Starter Grid
// =============================================================================

interface StarterGridProps {
  onStarterClick: (prompt: string) => void;
  compact?: boolean;
}

function StarterGrid({ onStarterClick, compact }: StarterGridProps) {
  return (
    <div className={compact ? 'mt-10' : 'mt-12'}>
      <h3 className={`text-sm font-medium text-gray-500 dark:text-gray-400 mb-4 ${compact ? '' : 'text-center'}`}>
        {compact ? 'Build a new table with AI' : 'Or try a starter'}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {STARTERS.map((starter) => (
          <button
            key={starter.title}
            onClick={() => onStarterClick(starter.prompt)}
            className="flex items-start gap-3 p-4 text-left bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 hover:shadow-sm transition-all"
          >
            <starter.icon className="h-5 w-5 mt-0.5 flex-shrink-0 text-blue-500 dark:text-blue-400" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 dark:text-white">
                {starter.title}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {starter.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// TablesListPage (main export)
// =============================================================================

export default function TablesListPage() {
  const navigate = useNavigate();
  const { updateContext, sendMessage } = useChatContext();

  const [tables, setTables] = useState<TableListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableListItem | null>(null);
  const [chatOpen, setChatOpen] = useState(false);

  const handleStarterClick = useCallback((prompt: string) => {
    setChatOpen(true);
    sendMessage(prompt, undefined, undefined, { newConversation: true });
  }, [sendMessage]);

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

  // Push context to chat whenever tables list changes
  useEffect(() => {
    updateContext({
      current_page: 'tables_list',
      existing_tables: tables.map((t) => ({
        name: t.name,
        description: t.description,
        column_count: t.column_count,
        row_count: t.row_count,
      })),
    });
  }, [tables, updateContext]);

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

  // Handle accepted schema proposal — create a new table, then continue the conversation.
  // Sequence: create → update context (ref writes synchronously) → send message → navigate.
  // Messages and streaming persist in the shared ChatContext across the navigation.
  const handleSchemaProposalAccept = useCallback(async (proposalData: SchemaProposalData) => {
    const columns = applySchemaOperations([], proposalData.operations);

    if (columns.length === 0) {
      showErrorToast('No columns in the proposal.', 'Invalid Proposal');
      return;
    }

    try {
      const created = await createTable({
        name: proposalData.table_name || 'Untitled Table',
        description: proposalData.table_description,
        columns,
      });
      showSuccessToast(`Table "${created.name}" created.`);

      // Set table context so the AI can operate on it (contextRef updates synchronously)
      updateContext({
        current_page: 'table_view',
        table_id: created.id,
        table_name: created.name,
        table_description: created.description || '',
        columns: created.columns,
        row_count: 0,
        sample_rows: [],
      });

      // Continue the conversation — sendMessage reads contextRef, which already has table info
      sendMessage(`[User accepted the schema proposal and created the table "${created.name}".]`);

      // Navigate — messages + streaming persist in shared ChatContext
      navigate(`/tables/${created.id}`);
    } catch (error) {
      showErrorToast(error, 'Failed to create table');
    }
  }, [navigate, updateContext, sendMessage]);

  const payloadHandlers = useMemo(() => ({
    schema_proposal: {
      render: (payload: any, callbacks: any) => (
        <SchemaProposalCard data={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
      ),
      onAccept: handleSchemaProposalAccept,
      renderOptions: { headerTitle: 'Schema Proposal', headerIcon: '📋' },
    },
  }), [handleSchemaProposalAccept]);

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
    <div className="flex-1 min-h-0 flex flex-row">
      <ChatTray
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        initialContext={{
          current_page: 'tables_list',
        }}
        payloadHandlers={payloadHandlers}
      />
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
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChatOpen(!chatOpen)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border ${
                  chatOpen
                    ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-600'
                    : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
                AI Chat
              </button>
              {tables.length > 0 && (
                <>
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
                </>
              )}
            </div>
          </div>

          {/* Content */}
          {tables.length === 0 ? (
            <EmptyState
              onCreateClick={() => setShowCreateModal(true)}
              onChatClick={() => setChatOpen(true)}
            />
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

          {/* Starter prompts — always visible */}
          <StarterGrid
            onStarterClick={handleStarterClick}
            compact={tables.length > 0}
          />
        </div>
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
