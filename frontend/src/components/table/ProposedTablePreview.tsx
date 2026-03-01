import { useState, useMemo } from 'react';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CellRenderer } from './DataTable';
import { Badge } from '../ui/badge';
import { applySchemaOperations } from '../../lib/utils/schemaOperations';
import type { SchemaProposalData } from '../../lib/utils/schemaOperations';
import type { ColumnDefinition } from '../../types/table';

// =============================================================================
// Types
// =============================================================================

interface ProposedTablePreviewProps {
  proposal: SchemaProposalData;
  onAccept: (proposal: SchemaProposalData, includeSampleData: boolean) => void;
  onDismiss: () => void;
}

// =============================================================================
// Type badge color map
// =============================================================================

const TYPE_COLORS: Record<string, string> = {
  text: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  number: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  date: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  boolean: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  select: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
};

// =============================================================================
// ProposedTablePreview
// =============================================================================

export default function ProposedTablePreview({
  proposal,
  onAccept,
  onDismiss,
}: ProposedTablePreviewProps) {
  const [includeSampleData, setIncludeSampleData] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Generate columns from operations
  const columns: ColumnDefinition[] = useMemo(
    () => applySchemaOperations([], proposal.operations),
    [proposal.operations],
  );

  // Build name→id map for converting sample rows
  const nameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of columns) {
      map.set(col.name.toLowerCase(), col.id);
    }
    return map;
  }, [columns]);

  // Convert sample_rows (keyed by column name) → display rows (keyed by column id)
  const displayRows = useMemo(() => {
    if (!proposal.sample_rows?.length) return [];
    return proposal.sample_rows.map((row, idx) => {
      const data: Record<string, unknown> = {};
      for (const [name, value] of Object.entries(row)) {
        const colId = nameToId.get(name.toLowerCase());
        if (colId) data[colId] = value;
      }
      return { id: idx, data };
    });
  }, [proposal.sample_rows, nameToId]);

  const handleAccept = async () => {
    setIsCreating(true);
    try {
      await onAccept(proposal, includeSampleData);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-table-materialize">
      {/* Gradient border wrapper */}
      <div className="w-full p-[2px] bg-gradient-to-r from-violet-500 via-blue-500 to-cyan-500 rounded-xl">
        <div className="bg-white dark:bg-gray-900 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                  <SparklesIcon className="h-3.5 w-3.5" />
                  Proposed Table
                </span>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {proposal.table_name || 'Untitled Table'}
                </h2>
              </div>
              <button
                onClick={onDismiss}
                className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            {proposal.table_description && (
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {proposal.table_description}
              </p>
            )}
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-50 dark:bg-gray-800/50 border-b border-gray-200 dark:border-gray-700">
                  {columns.map((col) => (
                    <th
                      key={col.id}
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                    >
                      <div className="flex items-center gap-2">
                        <span>{col.name}</span>
                        <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${TYPE_COLORS[col.type] || TYPE_COLORS.text}`}>
                          {col.type}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                {displayRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={columns.length}
                      className="px-4 py-8 text-center text-sm text-gray-400 dark:text-gray-500"
                    >
                      No sample data
                    </td>
                  </tr>
                ) : (
                  displayRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      className="bg-white dark:bg-gray-900 opacity-0 animate-fade-in"
                      style={{
                        animationDelay: `${(idx + 1) * 150}ms`,
                        animationFillMode: 'forwards',
                      }}
                    >
                      {columns.map((col) => (
                        <td
                          key={col.id}
                          className={`px-4 py-2.5 max-w-[300px] ${col.type === 'number' ? 'text-right' : ''}`}
                        >
                          <CellRenderer column={col} value={row.data[col.id]} />
                        </td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Accept bar */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={includeSampleData}
                onChange={(e) => setIncludeSampleData(e.target.checked)}
                disabled={!displayRows.length}
                className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500 disabled:opacity-50"
              />
              Include sample data ({displayRows.length} {displayRows.length === 1 ? 'row' : 'rows'})
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={onDismiss}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
              >
                Dismiss
              </button>
              <button
                onClick={handleAccept}
                disabled={isCreating}
                className="inline-flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-gradient-to-r from-violet-600 to-blue-600 rounded-md hover:from-violet-500 hover:to-blue-500 shadow-md shadow-violet-500/25 hover:shadow-lg hover:shadow-violet-500/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SparklesIcon className="h-4 w-4" />
                {isCreating ? 'Creating...' : 'Create Table'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
