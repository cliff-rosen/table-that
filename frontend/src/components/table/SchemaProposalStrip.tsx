import { TableCellsIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/button';
import type { SchemaProposalData } from '../../lib/utils/schemaOperations';

// =============================================================================
// Types
// =============================================================================

interface SchemaProposalStripProps {
  data: SchemaProposalData;
  applying: boolean;
  onApply: () => void;
  onDismiss: () => void;
}

// =============================================================================
// SchemaProposalStrip
// =============================================================================

export default function SchemaProposalStrip({
  data,
  applying,
  onApply,
  onDismiss,
}: SchemaProposalStripProps) {
  const ops = data.operations;

  // Build summary text
  const adds = ops.filter((o) => o.action === 'add').length;
  const removes = ops.filter((o) => o.action === 'remove').length;
  const modifies = ops.filter((o) => o.action === 'modify').length;
  const reorders = ops.filter((o) => o.action === 'reorder').length;

  const parts: string[] = [];
  if (adds > 0) parts.push(`${adds} new column${adds > 1 ? 's' : ''}`);
  if (modifies > 0) parts.push(`${modifies} modification${modifies > 1 ? 's' : ''}`);
  if (removes > 0) parts.push(`${removes} removal${removes > 1 ? 's' : ''}`);
  if (reorders > 0) parts.push(`${reorders} reorder${reorders > 1 ? 's' : ''}`);
  const summaryText = parts.join(', ');

  return (
    <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-blue-50 via-indigo-50 to-violet-50 dark:from-blue-950/30 dark:via-indigo-950/30 dark:to-violet-950/30">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <TableCellsIcon className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
            <span className="text-sm font-semibold text-gray-900 dark:text-white">
              Schema changes proposed
            </span>
            {summaryText && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                — {summaryText}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button variant="outline" size="sm" onClick={onDismiss} disabled={applying}>
              Dismiss
            </Button>
            <Button size="sm" onClick={onApply} disabled={applying}>
              {applying ? 'Applying...' : 'Apply'}
            </Button>
          </div>
        </div>
        {data.table_name && (
          <div className="mt-1 ml-6 text-xs text-gray-500 dark:text-gray-400">
            Also renaming to: <span className="font-medium text-gray-700 dark:text-gray-300">{data.table_name}</span>
          </div>
        )}
      </div>
    </div>
  );
}
