import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  TableCellsIcon,
} from '@heroicons/react/24/outline';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';

import { getTable, updateTable, listRows, createRow, updateRow, deleteRow, bulkDeleteRows, searchRows, exportTableCsv } from '../lib/api/tableApi';
import { trackEvent } from '../lib/api/trackingApi';
import { useTableProposal } from '../hooks/useTableProposal';
import { useChatContext } from '../context/ChatContext';
import { useAuth } from '../context/AuthContext';

import type { TableDefinition, TableRow, SortState } from '../types/table';
import { applySchemaOperations, type SchemaProposalData } from '../types/schemaProposal';
import type { DataOperation } from '../types/dataProposal';

import ChatTray from '../components/chat/ChatTray';
import ImportModal from '../components/table/ImportModal';
import FilterBar, { applyFilters, type FilterState } from '../components/table/FilterBar';
import DataTable from '../components/table/DataTable';
import AddRecordModal from '../components/table/AddRecordModal';
import TableToolbar from '../components/table/TableToolbar';
import ProposalActionBar from '../components/table/ProposalActionBar';
import SchemaProposalStrip from '../components/table/SchemaProposalStrip';



// =============================================================================
// TableViewPage (Main)
// =============================================================================

export default function TableViewPage() {
  const { tableId: tableIdParam } = useParams<{ tableId: string }>();
  const tableId = Number(tableIdParam);
  const navigate = useNavigate();
  const location = useLocation();

  // Data state
  const [table, setTable] = useState<TableDefinition | null>(null);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);

  // Chat context
  const { setContext, updateContext, sendMessage, messages, loadForContext, chatId } = useChatContext();
  const { isGuest } = useAuth();

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: number; columnId: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(() => {
    const stored = sessionStorage.getItem('chatOpen:table');
    return stored !== null ? stored === 'true' : true;
  });
  useEffect(() => { sessionStorage.setItem('chatOpen:table', String(chatOpen)); }, [chatOpen]);
  const [filters, setFilters] = useState<FilterState>({});

  // Compute filtered rows (client-side filtering on loaded rows)
  const filteredRows = useMemo(
    () => table ? applyFilters(rows, filters, table.columns) : rows,
    [rows, filters, table]
  );

  // Refs
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  // Track which messages we've already scanned (data-tools and payloads).
  // Initialized to current length so we skip messages already in context on mount.
  const lastCheckedIndexRef = useRef(messages.length);
  const lastPayloadIndexRef = useRef(messages.length);

  // -----------------------------------------------------------------------
  // Fetch table definition
  // -----------------------------------------------------------------------

  const fetchTable = useCallback(async () => {
    if (!tableId || isNaN(tableId)) return;
    try {
      const tableDef = await getTable(tableId);
      setTable(tableDef);
    } catch (err) {
      showErrorToast(err, 'Failed to load table');
    }
  }, [tableId]);

  // -----------------------------------------------------------------------
  // Fetch rows
  // -----------------------------------------------------------------------

  const fetchRows = useCallback(async () => {
    if (!tableId || isNaN(tableId)) return;
    try {
      const response = await listRows(tableId, {
        limit: 500,
        sort_column: sort?.column_id,
        sort_direction: sort?.direction,
      });
      setRows(response.rows);
      setTotalRows(response.total);
    } catch (err) {
      showErrorToast(err, 'Failed to load rows');
    }
  }, [tableId, sort]);

  // -----------------------------------------------------------------------
  // Search rows
  // -----------------------------------------------------------------------

  const performSearch = useCallback(async (query: string) => {
    if (!tableId || isNaN(tableId)) return;
    if (!query.trim()) {
      fetchRows();
      return;
    }
    try {
      const results = await searchRows(tableId, query.trim());
      setRows(results);
      setTotalRows(results.length);
    } catch (err) {
      showErrorToast(err, 'Search failed');
    }
  }, [tableId, fetchRows]);

  // -----------------------------------------------------------------------
  // Effects
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!hasLoadedRef.current) setLoading(true);
    Promise.all([fetchTable(), fetchRows()]).finally(() => {
      setLoading(false);
      hasLoadedRef.current = true;
    });
  }, [fetchTable, fetchRows]);

  // Set base context for this page (wipes stale context from previous page)
  useEffect(() => {
    setContext({ current_page: 'table_view', table_id: tableId });
  }, [tableId, setContext]);

  // Load conversation for this table
  useEffect(() => {
    loadForContext('table_view', tableId);
  }, [tableId, loadForContext]);

  // Send post-creation message when arriving from TablesListPage proposal accept.
  // Guard with a ref so React StrictMode's double-invoked effect doesn't send twice.
  const sentCreationMsgRef = useRef(false);
  useEffect(() => {
    const state = location.state as { justCreated?: boolean; tableName?: string; includedSampleData?: boolean } | null;
    if (state?.justCreated && !sentCreationMsgRef.current) {
      sentCreationMsgRef.current = true;
      sendMessage(`[User accepted and created "${state.tableName}"${state.includedSampleData ? ' with sample data' : ''}.]`);
      window.history.replaceState({}, '', location.pathname);
    }
  }, [location.state, sendMessage, location.pathname]);

  // Debounced search
  useEffect(() => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }
    searchTimerRef.current = setTimeout(() => {
      performSearch(searchQuery);
    }, 300);
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
    };
  }, [searchQuery, performSearch]);

  // Push table context to chat whenever table/rows/filters change
  useEffect(() => {
    if (table) {
      // Build selected rows data for chat context
      const selectedRows = selectedRowIds.size > 0
        ? rows
          .filter((r) => selectedRowIds.has(r.id))
          .map((r) => ({ id: r.id, data: r.data }))
        : undefined;

      updateContext({
        current_page: 'table_view',
        table_id: table.id,
        table_name: table.name,
        table_description: table.description || '',
        columns: table.columns,
        row_count: totalRows,
        sample_rows: rows.slice(0, 20).map(r => ({ id: r.id, data: r.data })),
        active_sort: sort,
        active_filters: Object.keys(filters).length > 0 ? filters : undefined,
        selected_rows: selectedRows,
      });
    }
  }, [table, rows, totalRows, sort, filters, selectedRowIds, updateContext]);

  // When a conversation is loaded from DB, skip scanning its historical messages.
  // Resets BOTH scanning refs. Must be declared BEFORE both scanning effects
  // (React runs effects in declaration order).
  useEffect(() => {
    lastCheckedIndexRef.current = messages.length;
    lastPayloadIndexRef.current = messages.length;
  }, [chatId]);

  // Auto-refresh rows when chat executes data-modifying tools
  const DATA_TOOLS = ['create_row', 'update_row', 'delete_row'];
  useEffect(() => {
    // Reset ref when messages shrink (e.g. new conversation started)
    if (messages.length < lastCheckedIndexRef.current) {
      lastCheckedIndexRef.current = 0;
    }
    if (messages.length <= lastCheckedIndexRef.current) return;

    let needsRefresh = false;

    for (let i = lastCheckedIndexRef.current; i < messages.length; i++) {
      const msg = messages[i];
      if (msg?.role === 'assistant' && msg.tool_history) {
        const usedDataTool = msg.tool_history.some(
          (t) => DATA_TOOLS.includes(t.tool_name)
        );
        if (usedDataTool) needsRefresh = true;
      }
    }

    if (needsRefresh) fetchRows();
    lastCheckedIndexRef.current = messages.length;
  }, [messages, fetchRows]);

  // -----------------------------------------------------------------------
  // Handlers
  // -----------------------------------------------------------------------

  const handleSort = (columnId: string) => {
    setSort((prev) => {
      if (prev?.column_id === columnId) {
        if (prev.direction === 'asc') {
          return { column_id: columnId, direction: 'desc' };
        }
        // Already desc, clear sort
        return null;
      }
      return { column_id: columnId, direction: 'asc' };
    });
  };

  const handleToggleRowSelection = (rowId: number) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  const handleToggleAllSelection = () => {
    if (selectedRowIds.size === filteredRows.length) {
      setSelectedRowIds(new Set());
    } else {
      setSelectedRowIds(new Set(filteredRows.map((r) => r.id)));
    }
  };

  const handleCellClick = (rowId: number, columnId: string) => {
    setEditingCell({ rowId, columnId });
  };

  const handleCellSave = async (rowId: number, columnId: string, value: unknown) => {
    setEditingCell(null);

    // Find current row to see if value actually changed
    const currentRow = rows.find((r) => r.id === rowId);
    if (currentRow && currentRow.data[columnId] === value) return;

    try {
      const updatedRow = await updateRow(tableId, rowId, { [columnId]: value });
      setRows((prev) => prev.map((r) => (r.id === rowId ? updatedRow : r)));
    } catch (err) {
      showErrorToast(err, 'Failed to update cell');
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
  };

  const handleAddRecord = async (data: Record<string, unknown>) => {
    try {
      const newRow = await createRow(tableId, data);
      setRows((prev) => [newRow, ...prev]);
      setTotalRows((prev) => prev + 1);
      setShowAddModal(false);
      showSuccessToast('Record added successfully');
    } catch (err) {
      showErrorToast(err, 'Failed to add record');
    }
  };

  const handleExport = async () => {
    try {
      const blob = await exportTableCsv(tableId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${table?.name || 'export'}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showSuccessToast('Export downloaded');
    } catch (err) {
      showErrorToast(err, 'Export failed');
    }
  };

  const handleImportComplete = (result: { imported: number }) => {
    trackEvent('csv_import', { source: 'table_view', table_id: tableId, row_count: result.imported });
    setShowImportModal(false);
    if (result.imported > 0) {
      fetchRows();
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedRowIds.size === 0) return;

    const count = selectedRowIds.size;
    const confirmed = window.confirm(`Delete ${count} selected row${count !== 1 ? 's' : ''}? This cannot be undone.`);
    if (!confirmed) return;

    try {
      if (count === 1) {
        const rowId = Array.from(selectedRowIds)[0];
        await deleteRow(tableId, rowId);
      } else {
        await bulkDeleteRows(tableId, Array.from(selectedRowIds));
      }

      setRows((prev) => prev.filter((r) => !selectedRowIds.has(r.id)));
      setTotalRows((prev) => prev - count);
      setSelectedRowIds(new Set());
      showSuccessToast(`Deleted ${count} row${count !== 1 ? 's' : ''}`);
    } catch (err) {
      showErrorToast(err, 'Failed to delete rows');
    }
  };

  // -----------------------------------------------------------------------
  // Payload Handlers (for chat proposals)
  // -----------------------------------------------------------------------

  const executeSingleDataOperation = useCallback(async (op: DataOperation) => {
    if (op.action === 'add' && op.data) {
      await createRow(tableId, op.data);
    } else if (op.action === 'update' && op.row_id && op.changes) {
      await updateRow(tableId, op.row_id, op.changes);
    } else if (op.action === 'delete' && op.row_id) {
      await deleteRow(tableId, op.row_id);
    }
  }, [tableId]);

  const handleApplySchema = useCallback(async (data: SchemaProposalData) => {
    if (!table) throw new Error('No table');
    const columns = applySchemaOperations(table.columns, data.operations);
    const payload: Record<string, unknown> = { columns };
    if (data.table_name) payload.name = data.table_name;
    if (data.table_description) payload.description = data.table_description;
    const updated = await updateTable(tableId, payload);
    setTable(updated);
    showSuccessToast('Schema updated');
  }, [table, tableId]);

  // Unified proposal hook — one state slot, mutual exclusion by construction
  const proposal = useTableProposal(
    executeSingleDataOperation,
    handleApplySchema,
    fetchRows,
    sendMessage,
  );

  // Detect incoming payloads for inline proposal rendering
  // (Must be after useTableProposal so proposal.handlePayload is defined)
  useEffect(() => {
    // Reset ref when messages shrink (e.g. new conversation started)
    if (messages.length < lastPayloadIndexRef.current) {
      lastPayloadIndexRef.current = 0;
    }
    if (messages.length <= lastPayloadIndexRef.current) return;

    for (let i = lastPayloadIndexRef.current; i < messages.length; i++) {
      const msg = messages[i];
      if (msg?.role === 'assistant' && msg.custom_payload?.type && msg.custom_payload.data) {
        proposal.handlePayload({
          type: msg.custom_payload.type,
          data: msg.custom_payload.data,
          messageIndex: i,
        });
      }
    }

    lastPayloadIndexRef.current = messages.length;
  }, [messages, proposal.handlePayload]);

  // Push pending proposal state to chat context
  useEffect(() => {
    updateContext({
      pending_proposal: proposal.active
        ? { kind: proposal.kind }
        : undefined,
    });
  }, [proposal.active, proposal.kind, updateContext]);

  // -----------------------------------------------------------------------
  // Render: loading state
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
          <div className="h-8 w-8 border-2 border-current border-t-transparent rounded-full animate-spin" />
          <p className="text-sm">Loading table...</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: error / not found
  // -----------------------------------------------------------------------

  if (!table) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
          <TableCellsIcon className="h-10 w-10" />
          <p className="text-sm font-medium">Table not found</p>
          <p className="text-xs">The table you are looking for does not exist or could not be loaded.</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: main view
  // -----------------------------------------------------------------------

  return (
    <div className="flex-1 min-h-0 flex flex-row overflow-hidden">
      {/* Chat Tray (left side) */}
      <ChatTray
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
      />

      {/* Main content */}
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        {/* Page title */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <TableCellsIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            <div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{table.name}</h1>
              {table.description && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{table.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex-shrink-0">
          <TableToolbar
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            columnCount={table.columns.length}
            rowCount={filteredRows.length}
            selectedCount={selectedRowIds.size}
            onAddRecord={() => setShowAddModal(true)}
            onDeleteSelected={handleDeleteSelected}
            onEditSchema={!isGuest ? () => { trackEvent('edit_schema', { table_id: tableId }); navigate(`/tables/${tableId}/edit`); } : undefined}
            onImport={() => setShowImportModal(true)}
            onExport={handleExport}
          />
        </div>

        {/* Filter bar */}
        <div className="flex-shrink-0">
          <FilterBar
            columns={table.columns}
            rows={rows}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>

        {/* Schema proposal strip (when active) */}
        {proposal.schemaBar && (
          <SchemaProposalStrip
            data={proposal.schemaBar.data}
            applying={proposal.schemaBar.applying}
            onApply={proposal.schemaBar.apply}
            onDismiss={proposal.dismiss}
          />
        )}

        {/* Proposal action bar (when active) */}
        {proposal.dataBar && (
          <ProposalActionBar
            data={proposal.dataBar.data}
            checkedOps={proposal.dataBar.checkedOps}
            phase={proposal.dataBar.phase}
            opResults={proposal.dataBar.opResults}
            successCount={proposal.dataBar.successCount}
            errorCount={proposal.dataBar.errorCount}
            onToggleAll={proposal.dataBar.toggleAll}
            onApply={proposal.dataBar.apply}
            onDismiss={proposal.dismiss}
          />
        )}

        {/* Data table - scrollable */}
        <div className="flex-1 min-h-0 overflow-auto bg-white dark:bg-gray-900 pr-4">
          <DataTable
            columns={table.columns}
            rows={filteredRows}
            selectedRowIds={selectedRowIds}
            onToggleRowSelection={handleToggleRowSelection}
            onToggleAllSelection={handleToggleAllSelection}
            sort={sort}
            onSort={handleSort}
            editingCell={proposal.active ? null : editingCell}
            onCellClick={proposal.active ? () => { } : handleCellClick}
            onCellSave={handleCellSave}
            onCellCancel={handleCellCancel}
            onColumnResearch={(columnName) => {
              setChatOpen(true);
              sendMessage(`Research and fill the "${columnName}" column for all rows.`);
            }}
            proposal={proposal.proposal}
          />
        </div>

        {/* Add Record Modal */}
        {showAddModal && (
          <AddRecordModal
            columns={table.columns}
            onSave={handleAddRecord}
            onClose={() => setShowAddModal(false)}
          />
        )}

        {/* Import CSV Modal */}
        {showImportModal && (
          <ImportModal
            tableId={tableId}
            onClose={() => setShowImportModal(false)}
            onImported={handleImportComplete}
          />
        )}
      </div>
    </div>
  );
}
