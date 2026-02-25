import { useState } from 'react';
import { CheckIcon, XMarkIcon, PlusIcon, PencilIcon, TrashIcon, ArrowsUpDownIcon } from '@heroicons/react/24/outline';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';

// =============================================================================
// Types
// =============================================================================

interface ColumnDef {
  name: string;
  type: string;
  required?: boolean;
  options?: string[];
  filterDisplay?: string;
}

interface SchemaOperation {
  action: 'add' | 'modify' | 'remove' | 'reorder';
  column?: ColumnDef;
  column_id?: string;
  after_column_id?: string;
  changes?: Partial<ColumnDef>;
}

export interface SchemaProposalData {
  reasoning?: string;
  table_name?: string;
  table_description?: string;
  operations: SchemaOperation[];
}

interface SchemaProposalCardProps {
  data: SchemaProposalData;
  onAccept?: (data: SchemaProposalData) => void;
  onReject?: () => void;
}

// =============================================================================
// Action Icons & Colors
// =============================================================================

function getActionIcon(action: string) {
  switch (action) {
    case 'add':
      return <PlusIcon className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case 'modify':
      return <PencilIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />;
    case 'remove':
      return <TrashIcon className="h-4 w-4 text-red-600 dark:text-red-400" />;
    case 'reorder':
      return <ArrowsUpDownIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />;
    default:
      return null;
  }
}

function getActionBadgeVariant(action: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (action) {
    case 'add':
      return 'default';
    case 'remove':
      return 'destructive';
    default:
      return 'secondary';
  }
}

// =============================================================================
// OperationRow
// =============================================================================

function OperationRow({
  op,
  checked,
  onToggle,
}: {
  op: SchemaOperation;
  checked: boolean;
  onToggle: () => void;
}) {
  const renderDetails = () => {
    switch (op.action) {
      case 'add': {
        const col = op.column;
        if (!col) return null;
        return (
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm text-gray-900 dark:text-white">{col.name}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">{col.type}</Badge>
              {col.required && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">required</Badge>}
            </div>
            {col.type === 'select' && col.options && (
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                {col.options.join(', ')}
              </div>
            )}
            {op.after_column_id && (
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                after column {op.after_column_id}
              </div>
            )}
          </div>
        );
      }

      case 'modify': {
        const changes = op.changes || {};
        return (
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-gray-900 dark:text-white">
              Column {op.column_id}
            </div>
            <div className="space-y-0.5 mt-0.5">
              {changes.name && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  name → <span className="text-gray-800 dark:text-gray-200">{changes.name}</span>
                </div>
              )}
              {changes.type && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  type → <span className="text-gray-800 dark:text-gray-200">{changes.type}</span>
                </div>
              )}
              {changes.required !== undefined && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  required: <span className="text-gray-800 dark:text-gray-200">{changes.required ? 'true' : 'false'}</span>
                </div>
              )}
              {changes.options && (
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  options: <span className="text-gray-800 dark:text-gray-200">{changes.options.join(', ')}</span>
                </div>
              )}
            </div>
          </div>
        );
      }

      case 'remove':
        return (
          <div className="flex-1 min-w-0">
            <span className="text-sm font-medium text-red-700 dark:text-red-400 line-through">
              Column {op.column_id}
            </span>
          </div>
        );

      case 'reorder':
        return (
          <div className="flex-1 min-w-0">
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Move {op.column_id} after {op.after_column_id || 'start'}
            </span>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex items-start gap-3 py-2 px-3 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
      <Checkbox
        checked={checked}
        onCheckedChange={onToggle}
        className="mt-0.5"
      />
      <div className="flex items-center gap-1.5 mt-0.5">
        {getActionIcon(op.action)}
      </div>
      <Badge variant={getActionBadgeVariant(op.action)} className="text-[10px] px-1.5 py-0 mt-0.5">
        {op.action}
      </Badge>
      {renderDetails()}
    </div>
  );
}

// =============================================================================
// SchemaProposalCard
// =============================================================================

export default function SchemaProposalCard({ data, onAccept, onReject }: SchemaProposalCardProps) {
  const [checkedOps, setCheckedOps] = useState<boolean[]>(
    () => data.operations.map(() => true)
  );
  const [applied, setApplied] = useState(false);
  const [rejected, setRejected] = useState(false);

  const selectedCount = checkedOps.filter(Boolean).length;
  const totalCount = data.operations.length;

  const toggleOp = (index: number) => {
    setCheckedOps((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleApply = () => {
    const selectedOps = data.operations.filter((_, i) => checkedOps[i]);
    if (selectedOps.length === 0) return;

    const acceptData: SchemaProposalData = {
      ...data,
      operations: selectedOps,
    };

    setApplied(true);
    onAccept?.(acceptData);
  };

  const handleReject = () => {
    setRejected(true);
    onReject?.();
  };

  if (applied) {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
          <CheckIcon className="h-4 w-4" />
          <span>
            Schema applied
            {selectedCount < totalCount && ` (${selectedCount} of ${totalCount} changes)`}
          </span>
        </div>
      </div>
    );
  }

  if (rejected) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
          <XMarkIcon className="h-4 w-4" />
          <span>Schema proposal cancelled</span>
        </div>
      </div>
    );
  }

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Schema Proposal
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {totalCount} change{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
        {data.table_name && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Table: "{data.table_name}"
            {data.table_description && ` — ${data.table_description}`}
          </div>
        )}
        {data.reasoning && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
            {data.reasoning}
          </div>
        )}
      </div>

      {/* Operations */}
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {data.operations.map((op, i) => (
          <OperationRow
            key={i}
            op={op}
            checked={checkedOps[i]}
            onToggle={() => toggleOp(i)}
          />
        ))}
      </div>

      {/* Actions */}
      <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={handleReject}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={selectedCount === 0}
        >
          Apply {selectedCount === totalCount ? `All ${totalCount} Changes` : `${selectedCount} of ${totalCount} Changes`}
        </Button>
      </div>
    </div>
  );
}
