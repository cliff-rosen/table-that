import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TableCellsIcon,
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
import { useAuth } from '../context/AuthContext';
import ChatTray from '../components/chat/ChatTray';
import ProposedTablePreview from '../components/table/ProposedTablePreview';
import { applySchemaOperations } from '../types/schemaProposal';
import type { SchemaProposalData } from '../types/schemaProposal';

// =============================================================================
// Prompt Hero (centered prompt input for empty state, mirrors landing page)
// =============================================================================

const HERO_STARTERS = STARTERS.filter(s =>
  ['Find a Dentist', 'Compare Laptops', 'Track Job Applications', 'Research Competitors'].includes(s.title)
);

interface PromptHeroProps {
  onSubmit: (prompt: string) => void;
  onManualCreate: () => void;
}

function PromptHero({ onSubmit, onManualCreate }: PromptHeroProps) {
  const [prompt, setPrompt] = useState('');

  const handleSubmit = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl w-full text-center space-y-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900 dark:text-white">
            What do you want to track?
          </h1>
          <p className="text-base text-gray-500 dark:text-gray-400">
            Describe a table and AI will build it for you — schema, data, and all.
          </p>
        </div>

        {/* Describe your table */}
        <div className="space-y-3">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(prompt);
              }
            }}
            placeholder="Describe your table..."
            rows={3}
            className="w-full px-4 py-3 text-base border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
          />
          <button
            onClick={() => handleSubmit(prompt)}
            disabled={!prompt.trim()}
            className="w-full sm:w-auto px-8 py-3 text-base font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Create Table
          </button>
        </div>

        {/* Or choose one of these */}
        <div className="space-y-2">
          <p className="text-sm text-gray-400 dark:text-gray-500">or choose one of these</p>
          <div className="space-y-2 text-left">
            {HERO_STARTERS.map((starter) => (
              <button
                key={starter.title}
                onClick={() => handleSubmit(starter.prompt)}
                className="w-full px-4 py-2.5 text-left text-sm text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-300 dark:hover:border-blue-600 hover:text-blue-600 dark:hover:text-blue-400 hover:shadow-sm transition-all"
              >
                {starter.example}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={onManualCreate}
          className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
        >
          or create a table manually
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
  const { isGuest } = useAuth();

  const [tables, setTables] = useState<TableListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TableListItem | null>(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [activeProposal, setActiveProposal] = useState<SchemaProposalData | null>(null);
  const prevChatIdRef = useRef<number | null>(null);
  // Start from current length so we only react to NEW messages, not history
  const lastCheckedIndexRef = useRef(messages.length);

  const handleStarterClick = useCallback((prompt: string) => {
    setChatOpen(true);
    sendMessage(prompt, undefined, undefined, { newConversation: true });
  }, [sendMessage]);

  // Bridge: pick up initial prompt from landing page guest flow
  const guestPromptHandled = useRef(false);
  useEffect(() => {
    if (guestPromptHandled.current) return;
    const initialPrompt = sessionStorage.getItem('guestInitialPrompt');
    if (initialPrompt) {
      guestPromptHandled.current = true;
      sessionStorage.removeItem('guestInitialPrompt');
      setChatOpen(true);
      setTimeout(() => {
        sendMessage(initialPrompt, undefined, undefined, { newConversation: true });
      }, 100);
    }
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

  // Push context to chat whenever tables list or active proposal changes
  useEffect(() => {
    updateContext({
      current_page: 'tables_list',
      existing_tables: tables.map((t) => ({
        name: t.name,
        description: t.description,
        column_count: t.column_count,
        row_count: t.row_count,
      })),
      pending_proposal: activeProposal
        ? { kind: 'schema_create', table_name: activeProposal.table_name }
        : undefined,
    });
  }, [tables, activeProposal, updateContext]);

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

  // Detect create-mode schema proposals from chat messages (new messages only, not history)
  useEffect(() => {
    if (messages.length < lastCheckedIndexRef.current) {
      lastCheckedIndexRef.current = 0;
    }
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

  // Show centered prompt hero when no tables, chat closed, no active proposal, and not a guest
  const showPromptHero = tables.length === 0 && !chatOpen && !activeProposal && !isGuest;

  return (
    <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
      <ChatTray
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        scope="tables_list"
        initialContext={{
          current_page: 'tables_list',
        }}
      />
      {showPromptHero ? (
        <PromptHero
          onSubmit={handleStarterClick}
          onManualCreate={() => setShowCreateModal(true)}
        />
      ) : (
      <div className="flex-1 min-w-0 min-h-0 overflow-auto flex flex-col">
        <div className="max-w-6xl mx-auto w-full px-6 py-8 flex-1 flex flex-col">
          {/* Page header */}
          <div className="flex-shrink-0 flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
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
            </div>
            {!isGuest && (
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowImportModal(true)}
                className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Import CSV
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
              >
                Create Table
              </button>
            </div>
            )}
          </div>

          {/* Content */}
          {activeProposal ? (
            <ProposedTablePreview
              proposal={activeProposal}
              onAccept={handleProposalAcceptFromPreview}
              onDismiss={() => setActiveProposal(null)}
            />
          ) : tables.length === 0 ? (
            /* Empty state — "your table will appear here" */
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <TableCellsIcon className="h-16 w-16 text-gray-200 dark:text-gray-700 mb-4" />
              <h2 className="text-xl font-semibold text-gray-400 dark:text-gray-500">
                Your table will appear here
              </h2>
              <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                Describe what you need in the chat and we&rsquo;ll build it.
              </p>
            </div>
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

          {/* Starter prompts — hidden for guests */}
          {!isGuest && (
          <StarterGrid
            onStarterClick={handleStarterClick}
            compact={tables.length > 0}
          />
          )}
        </div>
      </div>
      )}

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
