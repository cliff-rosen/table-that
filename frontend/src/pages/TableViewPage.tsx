import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  TableCellsIcon,
  ChatBubbleLeftRightIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import { getTable, updateTable, listRows, createRow, updateRow, deleteRow, bulkDeleteRows, searchRows, exportTableCsv } from '../lib/api/tableApi';
import type { TableDefinition, TableRow, SortState } from '../types/table';
import { useChatContext } from '../context/ChatContext';
import ChatTray from '../components/chat/ChatTray';
import ImportModal from '../components/table/ImportModal';
import FilterBar, { applyFilters, type FilterState } from '../components/table/FilterBar';
import DataTable from '../components/table/DataTable';
import AddRecordModal from '../components/table/AddRecordModal';
import TableToolbar from '../components/table/TableToolbar';
import { Button } from '../components/ui/button';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';
import SchemaProposalCard from '../components/chat/SchemaProposalCard';
import DataProposalCard, { type DataOperation } from '../components/chat/DataProposalCard';
import { applySchemaOperations } from '../lib/utils/schemaOperations';
import type { SchemaProposalData } from '../lib/utils/schemaOperations';

// =============================================================================
// TableViewPage (Main)
// =============================================================================

export default function TableViewPage() {
  const { tableId: tableIdParam } = useParams<{ tableId: string }>();
  const tableId = Number(tableIdParam);
  const navigate = useNavigate();
  const location = useLocation();
  const fromProposal = (location.state as any)?.fromProposal === true;

  // Data state
  const [table, setTable] = useState<TableDefinition | null>(null);
  const [rows, setRows] = useState<TableRow[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [loading, setLoading] = useState(true);

  // Chat context
  const { updateContext, sendMessage, messages, isLoading } = useChatContext();

  // UI state
  const [searchQuery, setSearchQuery] = useState('');
  const [sort, setSort] = useState<SortState | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<number>>(new Set());
  const [editingCell, setEditingCell] = useState<{ rowId: number; columnId: string } | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [chatOpen, setChatOpen] = useState(true);
  const [filters, setFilters] = useState<FilterState>({});

  // Compute filtered rows (client-side filtering on loaded rows)
  const filteredRows = useMemo(
    () => table ? applyFilters(rows, filters, table.columns) : rows,
    [rows, filters, table]
  );

  // Refs
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoadedRef = useRef(false);

  // Track message count for auto-refresh after tool execution
  const prevMessageCountRef = useRef(messages.length);
  const wasLoadingRef = useRef(false);

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

  // Continue chat after arriving from a schema proposal acceptance
  const proposalContinuedRef = useRef(false);
  useEffect(() => {
    if (fromProposal && table && !proposalContinuedRef.current) {
      proposalContinuedRef.current = true;
      // Clear the navigation state so a page refresh doesn't re-trigger
      window.history.replaceState({}, '');
      sendMessage(`[User accepted the schema proposal and created the table "${table.name}".]`);
    }
  }, [fromProposal, table, sendMessage]);

  // Auto-refresh rows when chat executes data-modifying tools
  const DATA_TOOLS = ['create_row', 'update_row', 'delete_row'];
  useEffect(() => {
    // Detect transition from loading → not loading (response complete)
    if (wasLoadingRef.current && !isLoading && messages.length > prevMessageCountRef.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.tool_history) {
        const usedDataTool = lastMsg.tool_history.some(
          (t) => DATA_TOOLS.includes(t.tool_name)
        );
        if (usedDataTool) {
          fetchRows();
        }
      }
    }
    wasLoadingRef.current = isLoading;
    prevMessageCountRef.current = messages.length;
  }, [isLoading, messages, fetchRows]);

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

  const handleSchemaProposalAccept = useCallback(async (proposalData: SchemaProposalData) => {
    if (!table) return;

    try {
      const columns = applySchemaOperations(table.columns, proposalData.operations);
      const updateData: Record<string, unknown> = { columns };
      if (proposalData.table_name) updateData.name = proposalData.table_name;
      if (proposalData.table_description) updateData.description = proposalData.table_description;

      const updated = await updateTable(tableId, updateData);
      setTable(updated);
      showSuccessToast('Schema updated successfully');
      // Tell chat the schema was applied so it can continue the workflow
      sendMessage(`[User accepted the schema proposal and applied changes to "${updated.name}".]`);
    } catch (err) {
      showErrorToast(err, 'Failed to apply schema changes');
    }
  }, [table, tableId, sendMessage]);

  const executeSingleDataOperation = useCallback(async (op: DataOperation) => {
    if (!table) throw new Error('No table loaded');

    const colNameToId = new Map<string, string>();
    for (const col of table.columns) {
      colNameToId.set(col.name.toLowerCase(), col.id);
    }

    const mapData = (data: Record<string, unknown>): Record<string, unknown> => {
      const mapped: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(data)) {
        const colId = colNameToId.get(key.toLowerCase()) || key;
        mapped[colId] = val;
      }
      return mapped;
    };

    if (op.action === 'add' && op.data) {
      await createRow(tableId, mapData(op.data));
    } else if (op.action === 'update' && op.row_id && op.changes) {
      await updateRow(tableId, op.row_id, mapData(op.changes));
    } else if (op.action === 'delete' && op.row_id) {
      await deleteRow(tableId, op.row_id);
    }
  }, [table, tableId]);

  const handleDataProposalAccept = useCallback(async () => {
    // Called when the user clicks "Done" after all operations complete
    await fetchRows();
    // Tell chat the data was applied so it can continue the workflow
    sendMessage('[User accepted the data proposal and applied all changes.]');
  }, [fetchRows, sendMessage]);

  const payloadHandlers = useMemo(() => ({
    schema_proposal: {
      render: (payload: any, callbacks: any) => (
        <SchemaProposalCard data={payload} columns={table?.columns} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
      ),
      onAccept: handleSchemaProposalAccept,
      renderOptions: { headerTitle: 'Schema Proposal', headerIcon: '📋' },
    },
    data_proposal: {
      render: (payload: any, callbacks: any) => (
        <DataProposalCard
          data={payload}
          onAccept={callbacks.onAccept}
          onReject={callbacks.onReject}
          onExecuteOperation={executeSingleDataOperation}
        />
      ),
      onAccept: handleDataProposalAccept,
      renderOptions: { headerTitle: 'Data Proposal', headerIcon: '📊' },
    },
  }), [handleSchemaProposalAccept, handleDataProposalAccept, executeSingleDataOperation, table?.columns]);

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
    <div className="flex-1 min-h-0 flex flex-row">
      {/* Chat Tray (left side) */}
      <ChatTray
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        initialContext={{
          current_page: 'table_view',
          table_id: table.id,
          table_name: table.name,
        }}
        payloadHandlers={payloadHandlers}
      />

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Page title */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TableCellsIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">{table.name}</h1>
                {table.description && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{table.description}</p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => navigate(`/tables/${tableId}/edit`)}
                className="gap-2"
              >
                <PencilSquareIcon className="h-5 w-5" />
                Edit Schema
              </Button>
              <Button
                variant={chatOpen ? 'default' : 'outline'}
                onClick={() => setChatOpen((prev) => !prev)}
                className="gap-2"
              >
                <ChatBubbleLeftRightIcon className="h-5 w-5" />
                {chatOpen ? 'Hide Chat' : 'Chat'}
              </Button>
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
            editingCell={editingCell}
            onCellClick={handleCellClick}
            onCellSave={handleCellSave}
            onCellCancel={handleCellCancel}
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
