import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  PlusIcon,
  TrashIcon,
  TableCellsIcon,
  ChatBubbleLeftRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  EyeIcon,
  Bars3Icon,
} from '@heroicons/react/24/outline';
import { getTable, updateTable } from '../lib/api/tableApi';
import type { TableDefinition, ColumnDefinition, ColumnType } from '../types/table';
import { useChatContext } from '../context/ChatContext';
import ChatTray from '../components/chat/ChatTray';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Checkbox } from '../components/ui/checkbox';
import { Label } from '../components/ui/label';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';
import SchemaProposalCard from '../components/chat/SchemaProposalCard';

// =============================================================================
// Constants
// =============================================================================

const COLUMN_TYPES: { value: ColumnType; label: string; description: string }[] = [
  { value: 'text', label: 'Text', description: 'Free-form text' },
  { value: 'number', label: 'Number', description: 'Numeric values' },
  { value: 'date', label: 'Date', description: 'Date values' },
  { value: 'boolean', label: 'Boolean', description: 'Yes/No toggle' },
  { value: 'select', label: 'Select', description: 'Pick from options' },
];

function generateColumnId(): string {
  return `col_${Math.random().toString(36).substring(2, 10)}`;
}

// =============================================================================
// Column Editor Row
// =============================================================================

interface ColumnEditorRowProps {
  column: ColumnDefinition;
  index: number;
  totalColumns: number;
  onChange: (updated: ColumnDefinition) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function ColumnEditorRow({
  column,
  index,
  totalColumns,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
}: ColumnEditorRowProps) {
  const [showOptions, setShowOptions] = useState(column.type === 'select');
  const [optionsText, setOptionsText] = useState(
    column.options?.join('\n') ?? ''
  );

  useEffect(() => {
    setShowOptions(column.type === 'select');
  }, [column.type]);

  const handleTypeChange = (type: ColumnType) => {
    const updated = { ...column, type };
    if (type !== 'select') {
      delete updated.options;
    } else if (!updated.options) {
      updated.options = [];
    }
    onChange(updated);
  };

  const handleOptionsBlur = () => {
    const options = optionsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    onChange({ ...column, options });
  };

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
      <div className="flex items-start gap-3">
        {/* Reorder buttons */}
        <div className="flex flex-col gap-0.5 pt-1">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={index === 0}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move up"
          >
            <ChevronUpIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={index === totalColumns - 1}
            className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Move down"
          >
            <ChevronDownIcon className="h-4 w-4" />
          </button>
        </div>

        {/* Drag handle visual */}
        <div className="pt-2 text-gray-300 dark:text-gray-600">
          <Bars3Icon className="h-5 w-5" />
        </div>

        {/* Main fields */}
        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            {/* Column name */}
            <div className="flex-1">
              <Input
                value={column.name}
                onChange={(e) => onChange({ ...column, name: e.target.value })}
                placeholder="Column name"
                className="font-medium"
              />
            </div>

            {/* Column type */}
            <select
              value={column.type}
              onChange={(e) => handleTypeChange(e.target.value as ColumnType)}
              className="w-32 h-10 px-3 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {COLUMN_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>

            {/* Required toggle */}
            <div className="flex items-center gap-2">
              <Checkbox
                id={`req-${column.id}`}
                checked={column.required}
                onCheckedChange={(checked) =>
                  onChange({ ...column, required: Boolean(checked) })
                }
              />
              <Label htmlFor={`req-${column.id}`} className="text-sm whitespace-nowrap">
                Required
              </Label>
            </div>

            {/* Remove button */}
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded transition-colors"
              title="Remove column"
            >
              <TrashIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Select options editor */}
          {showOptions && (
            <div className="ml-0 space-y-2">
              <Label className="text-xs text-gray-500 dark:text-gray-400 mb-1 block">
                Options (one per line)
              </Label>
              <textarea
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                onBlur={handleOptionsBlur}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                placeholder="Option 1&#10;Option 2&#10;Option 3"
              />
              <div className="flex items-center gap-3">
                <Label className="text-xs text-gray-500 dark:text-gray-400">Filter style:</Label>
                <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-700 rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => onChange({ ...column, filterDisplay: undefined })}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      column.filterDisplay !== 'dropdown'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Tabs
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange({ ...column, filterDisplay: 'dropdown' })}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      column.filterDisplay === 'dropdown'
                        ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    Dropdown
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// TableEditPage
// =============================================================================

export default function TableEditPage() {
  const { tableId: tableIdParam } = useParams<{ tableId: string }>();
  const tableId = Number(tableIdParam);
  const navigate = useNavigate();

  // Data state
  const [table, setTable] = useState<TableDefinition | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<ColumnDefinition[]>([]);

  // Track if there are unsaved changes
  const [hasChanges, setHasChanges] = useState(false);

  // Chat
  const { updateContext } = useChatContext();
  const [chatOpen, setChatOpen] = useState(true);

  // -----------------------------------------------------------------------
  // Fetch table
  // -----------------------------------------------------------------------

  const fetchTable = useCallback(async () => {
    if (!tableId || isNaN(tableId)) return;
    try {
      const tableDef = await getTable(tableId);
      setTable(tableDef);
      setName(tableDef.name);
      setDescription(tableDef.description || '');
      setColumns(tableDef.columns.map((c) => ({ ...c })));
      setHasChanges(false);
    } catch (err) {
      showErrorToast(err, 'Failed to load table');
    } finally {
      setLoading(false);
    }
  }, [tableId]);

  useEffect(() => {
    fetchTable();
  }, [fetchTable]);

  // Push context to chat
  useEffect(() => {
    if (table) {
      updateContext({
        current_page: 'table_edit',
        table_id: table.id,
        table_name: name,
        table_description: description,
        columns: columns,
      });
    }
  }, [table, name, description, columns, updateContext]);

  // -----------------------------------------------------------------------
  // Column manipulation
  // -----------------------------------------------------------------------

  const markChanged = () => setHasChanges(true);

  const handleColumnChange = (index: number, updated: ColumnDefinition) => {
    setColumns((prev) => {
      const next = [...prev];
      next[index] = updated;
      return next;
    });
    markChanged();
  };

  const handleAddColumn = () => {
    setColumns((prev) => [
      ...prev,
      { id: generateColumnId(), name: '', type: 'text', required: false },
    ]);
    markChanged();
  };

  const handleRemoveColumn = (index: number) => {
    setColumns((prev) => prev.filter((_, i) => i !== index));
    markChanged();
  };

  const handleMoveColumn = (index: number, direction: 'up' | 'down') => {
    setColumns((prev) => {
      const next = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= next.length) return prev;
      [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
      return next;
    });
    markChanged();
  };

  // -----------------------------------------------------------------------
  // Save
  // -----------------------------------------------------------------------

  const handleSave = async () => {
    // Validate
    if (!name.trim()) {
      showErrorToast('Table name is required.', 'Validation Error');
      return;
    }
    const validColumns = columns.filter((c) => c.name.trim());
    if (validColumns.length === 0) {
      showErrorToast('Add at least one column with a name.', 'Validation Error');
      return;
    }

    setSaving(true);
    try {
      const updated = await updateTable(tableId, {
        name: name.trim(),
        description: description.trim() || undefined,
        columns: validColumns,
      });
      setTable(updated);
      setColumns(updated.columns.map((c) => ({ ...c })));
      setHasChanges(false);
      showSuccessToast('Table saved successfully');
    } catch (err) {
      showErrorToast(err, 'Failed to save table');
    } finally {
      setSaving(false);
    }
  };

  // -----------------------------------------------------------------------
  // Payload Handlers
  // -----------------------------------------------------------------------

  const handleSchemaProposalAccept = useCallback(async (proposalData: any) => {
    // Apply schema operations to the current local columns state
    let updatedColumns = [...columns];

    for (const op of proposalData.operations) {
      if (op.action === 'add' && op.column) {
        const newCol: ColumnDefinition = {
          id: generateColumnId(),
          name: op.column.name,
          type: op.column.type,
          required: op.column.required || false,
          ...(op.column.options ? { options: op.column.options } : {}),
          ...(op.column.filterDisplay ? { filterDisplay: op.column.filterDisplay } : {}),
        };

        if (op.after_column_id) {
          const afterIdx = updatedColumns.findIndex((c) => c.id === op.after_column_id);
          if (afterIdx >= 0) {
            updatedColumns.splice(afterIdx + 1, 0, newCol);
          } else {
            updatedColumns.push(newCol);
          }
        } else {
          updatedColumns.push(newCol);
        }
      } else if (op.action === 'modify' && op.column_id && op.changes) {
        const idx = updatedColumns.findIndex((c) => c.id === op.column_id);
        if (idx >= 0) {
          updatedColumns[idx] = { ...updatedColumns[idx], ...op.changes };
        }
      } else if (op.action === 'remove' && op.column_id) {
        updatedColumns = updatedColumns.filter((c) => c.id !== op.column_id);
      } else if (op.action === 'reorder' && op.column_id) {
        const colIdx = updatedColumns.findIndex((c) => c.id === op.column_id);
        if (colIdx >= 0) {
          const [col] = updatedColumns.splice(colIdx, 1);
          if (op.after_column_id) {
            const afterIdx = updatedColumns.findIndex((c) => c.id === op.after_column_id);
            updatedColumns.splice(afterIdx + 1, 0, col);
          } else {
            updatedColumns.unshift(col);
          }
        }
      }
    }

    // Update local state
    setColumns(updatedColumns);
    if (proposalData.table_name) setName(proposalData.table_name);
    if (proposalData.table_description) setDescription(proposalData.table_description);
    setHasChanges(true);

    // Auto-save the changes
    try {
      const updateData: any = {
        columns: updatedColumns,
        name: proposalData.table_name || name.trim(),
        description: (proposalData.table_description || description.trim()) || undefined,
      };
      const updated = await updateTable(tableId, updateData);
      setTable(updated);
      setColumns(updated.columns.map((c) => ({ ...c })));
      setHasChanges(false);
      showSuccessToast('Schema updated successfully');
    } catch (err) {
      showErrorToast(err, 'Failed to apply schema changes (changes shown but not saved)');
    }
  }, [columns, name, description, tableId]);

  const payloadHandlers = useMemo(() => ({
    schema_proposal: {
      render: (payload: any, callbacks: any) => (
        <SchemaProposalCard data={payload} onAccept={callbacks.onAccept} onReject={callbacks.onReject} />
      ),
      onAccept: handleSchemaProposalAccept,
      renderOptions: { headerTitle: 'Schema Proposal', headerIcon: '📋' },
    },
  }), [handleSchemaProposalAccept]);

  // -----------------------------------------------------------------------
  // Render: loading
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

  if (!table) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-gray-400 dark:text-gray-500">
          <TableCellsIcon className="h-10 w-10" />
          <p className="text-sm font-medium">Table not found</p>
        </div>
      </div>
    );
  }

  // -----------------------------------------------------------------------
  // Render: main
  // -----------------------------------------------------------------------

  return (
    <div className="flex-1 min-h-0 flex flex-row">
      {/* Chat Tray */}
      <ChatTray
        isOpen={chatOpen}
        onOpenChange={setChatOpen}
        initialContext={{
          current_page: 'table_edit',
          table_id: table.id,
          table_name: name,
        }}
        payloadHandlers={payloadHandlers}
      />

      {/* Main content */}
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <TableCellsIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Edit Table
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Modify schema for <span className="font-medium">{table.name}</span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* View Data toggle */}
              <Button
                variant="outline"
                onClick={() => navigate(`/tables/${tableId}`)}
                className="gap-2"
              >
                <EyeIcon className="h-5 w-5" />
                View Data
              </Button>
              {/* Chat toggle */}
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

        {/* Edit form - scrollable */}
        <div className="flex-1 min-h-0 overflow-auto bg-gray-50 dark:bg-gray-900">
          <div className="max-w-4xl mx-auto px-6 py-6 space-y-6">
            {/* Table name & description */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
              <div>
                <Label htmlFor="edit-table-name" className="text-sm font-medium">
                  Table Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="edit-table-name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    markChanged();
                  }}
                  placeholder="e.g., Customer Feedback"
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="edit-table-desc" className="text-sm font-medium">
                  Description
                </Label>
                <Input
                  id="edit-table-desc"
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    markChanged();
                  }}
                  placeholder="Optional description"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Columns section */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Columns ({columns.length})
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAddColumn}
                  className="gap-1.5"
                >
                  <PlusIcon className="h-4 w-4" />
                  Add Column
                </Button>
              </div>

              {columns.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-gray-500">
                  <TableCellsIcon className="h-10 w-10 mx-auto mb-2" />
                  <p className="text-sm">No columns defined. Add your first column above.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {columns.map((col, index) => (
                    <ColumnEditorRow
                      key={col.id}
                      column={col}
                      index={index}
                      totalColumns={columns.length}
                      onChange={(updated) => handleColumnChange(index, updated)}
                      onRemove={() => handleRemoveColumn(index)}
                      onMoveUp={() => handleMoveColumn(index, 'up')}
                      onMoveDown={() => handleMoveColumn(index, 'down')}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Column type reference */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Column Types
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {COLUMN_TYPES.map((ct) => (
                  <div key={ct.value} className="flex items-center gap-2">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 text-xs font-mono font-bold text-gray-500 dark:text-gray-400">
                      {ct.label[0]}
                    </span>
                    <div>
                      <span className="font-medium text-gray-800 dark:text-gray-200">{ct.label}</span>
                      <span className="text-gray-500 dark:text-gray-400 ml-1">
                        — {ct.description}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Save bar - sticky at bottom */}
        <div className="flex-shrink-0 px-6 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <div className="max-w-4xl mx-auto flex items-center justify-between">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {hasChanges ? (
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  Unsaved changes
                </span>
              ) : (
                <span>No changes</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate(`/tables/${tableId}`)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving || !hasChanges}
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
