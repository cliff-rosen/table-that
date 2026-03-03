import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  TableCellsIcon,
  ArrowUpTrayIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import { STARTERS } from '../config/starters';
import { listTables, createTable, deleteTable, createRow } from '../lib/api/tableApi';
import type { TableListItem, ColumnDefinition } from '../types/table';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';
import { trackEvent } from '../lib/api/trackingApi';
import ImportModal from '../components/table/ImportModal';
import CreateTableModal from '../components/table/CreateTableModal';
import DeleteConfirmModal from '../components/table/DeleteConfirmModal';
import TableCard from '../components/table/TableCard';
import { useChatContext } from '../context/ChatContext';
import ChatTray from '../components/chat/ChatTray';
import ProposedTablePreview from '../components/table/ProposedTablePreview';
import { applySchemaOperations } from '../types/schemaProposal';
import type { SchemaProposalData } from '../types/schemaProposal';

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
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={onChatClick}
          className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 rounded-md hover:from-violet-500 hover:to-blue-500 shadow-md shadow-violet-500/25 hover:shadow-lg hover:shadow-violet-500/30 transition-all"
        >
          <SparklesIcon className="h-5 w-5" />
          Build a Table with AI
        </button>
        <button
          onClick={onCreateClick}
          className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          or create one manually
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
  const { updateContext, sendMessage, chatId, messages } = useChatContext();

  const [tables, setTables] = useState<TableListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableListItem | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeProposal, setActiveProposal] = useState<SchemaProposalData | null>(null);
  const prevChatIdRef = useRef<number | null>(null);
  const lastCheckedIndexRef = useRef(0);

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

  // Clear active proposal when conversation resets
  useEffect(() => {
    if (chatId === null && prevChatIdRef.current !== null) {
      setActiveProposal(null);
    }
    prevChatIdRef.current = chatId;
  }, [chatId]);

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
      trackEvent('table_create', { method: 'manual', table_id: created.id });
      showSuccessToast(`Table "${created.name}" created.`);
      setShowCreateModal(false);
      navigate(`/tables/${created.id}`);
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

  // Detect create-mode schema proposals from chat messages
  useEffect(() => {
    if (messages.length <= lastCheckedIndexRef.current) return;

    for (let i = lastCheckedIndexRef.current; i < messages.length; i++) {
      const msg = messages[i];
      if (msg?.role === 'assistant' && msg.custom_payload?.type === 'schema_proposal' && (msg.custom_payload.data as SchemaProposalData)?.mode === 'create') {
        setActiveProposal(msg.custom_payload.data as SchemaProposalData);
      }
    }
    lastCheckedIndexRef.current = messages.length;
  }, [messages]);

  // Handle accept from ProposedTablePreview (supports optional sample data insertion)
  const handleProposalAcceptFromPreview = useCallback(async (proposal: SchemaProposalData, includeSampleData: boolean) => {
    const columns = applySchemaOperations([], proposal.operations);

    if (columns.length === 0) {
      showErrorToast('No columns in the proposal.', 'Invalid Proposal');
      return;
    }

    try {
      const created = await createTable({
        name: proposal.table_name || 'Untitled Table',
        description: proposal.table_description,
        columns,
      });
      trackEvent('table_create', { method: 'chat_preview', table_id: created.id });

      if (includeSampleData && proposal.sample_rows?.length) {
        const nameToId = new Map(created.columns.map((c: ColumnDefinition) => [c.name.toLowerCase(), c.id]));
        await Promise.all(proposal.sample_rows.map(async (row) => {
          const data: Record<string, unknown> = {};
          for (const [name, value] of Object.entries(row)) {
            const colId = nameToId.get(name.toLowerCase());
            if (colId) data[colId] = value;
          }
          if (Object.keys(data).length > 0) await createRow(created.id, data);
        }));
      }

      updateContext({
        current_page: 'table_view',
        table_id: created.id,
        table_name: created.name,
        table_description: created.description || '',
        columns: created.columns,
        row_count: includeSampleData ? (proposal.sample_rows?.length || 0) : 0,
        sample_rows: [],
      });

      sendMessage(`[User accepted and created "${created.name}"${includeSampleData ? ' with sample data' : ''}.]`);
      setActiveProposal(null);
      navigate(`/tables/${created.id}`);
    } catch (error) {
      showErrorToast(error, 'Failed to create table');
    }
  }, [navigate, updateContext, sendMessage]);

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="flex-1 min-w-0 min-h-0 overflow-auto">
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
    <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
      <ChatTray
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        initialContext={{
          current_page: 'tables_list',
        }}
      />
      <div className="flex-1 min-w-0 min-h-0 overflow-auto">
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
                onClick={() => { if (!chatOpen) trackEvent('chat_open', { page: 'tables_list' }); setChatOpen(!chatOpen); }}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-md transition-all ${
                  chatOpen
                    ? 'text-white bg-gradient-to-r from-violet-600 to-blue-600 shadow-md shadow-violet-500/25'
                    : 'text-white bg-gradient-to-r from-violet-600 to-blue-600 hover:from-violet-500 hover:to-blue-500 shadow-sm shadow-violet-500/20 hover:shadow-md hover:shadow-violet-500/30'
                }`}
              >
                <SparklesIcon className="h-5 w-5" />
                Ask AI
              </button>
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
          </div>

          {/* Content */}
          {activeProposal ? (
            <ProposedTablePreview
              proposal={activeProposal}
              onAccept={handleProposalAcceptFromPreview}
              onDismiss={() => setActiveProposal(null)}
            />
          ) : tables.length === 0 ? (
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
            trackEvent('csv_import', { source: 'tables_list', table_id: result.tableId });
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
