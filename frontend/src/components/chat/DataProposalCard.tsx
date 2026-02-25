import { useState } from 'react';
import { CheckIcon, XMarkIcon, PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Checkbox } from '../ui/checkbox';
import { Button } from '../ui/button';

// =============================================================================
// Types
// =============================================================================

interface DataAddOperation {
  action: 'add';
  data: Record<string, unknown>;
}

interface DataUpdateOperation {
  action: 'update';
  row_id: number;
  changes: Record<string, unknown>;
}

interface DataDeleteOperation {
  action: 'delete';
  row_id: number;
}

type DataOperation = DataAddOperation | DataUpdateOperation | DataDeleteOperation;

export interface DataProposalData {
  reasoning?: string;
  operations: DataOperation[];
}

interface DataProposalCardProps {
  data: DataProposalData;
  onAccept?: (data: DataProposalData) => void;
  onReject?: () => void;
}

// =============================================================================
// Helpers
// =============================================================================

function getActionIcon(action: string) {
  switch (action) {
    case 'add':
      return <PlusIcon className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />;
    case 'update':
      return <PencilIcon className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />;
    case 'delete':
      return <TrashIcon className="h-3.5 w-3.5 text-red-600 dark:text-red-400" />;
    default:
      return null;
  }
}

function truncate(val: unknown, maxLen = 40): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

// =============================================================================
// AddOperationRow
// =============================================================================

function AddOperationRow({ op, checked, onToggle }: { op: DataAddOperation; checked: boolean; onToggle: () => void }) {
  const entries = Object.entries(op.data);
  // Pick key columns for display (first 3)
  const displayEntries = entries.slice(0, 3);
  const moreCount = entries.length - displayEntries.length;

  return (
    <div className="flex items-start gap-2 py-2 px-3 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      {getActionIcon('add')}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {displayEntries.map(([key, val]) => (
            <span key={key} className="text-xs">
              <span className="text-gray-500 dark:text-gray-400">{key}:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">{truncate(val, 30)}</span>
            </span>
          ))}
          {moreCount > 0 && (
            <span className="text-xs text-gray-400 dark:text-gray-500">+{moreCount} more</span>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UpdateOperationRow
// =============================================================================

function UpdateOperationRow({ op, checked, onToggle }: { op: DataUpdateOperation; checked: boolean; onToggle: () => void }) {
  const changes = Object.entries(op.changes);

  return (
    <div className="flex items-start gap-2 py-2 px-3 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      {getActionIcon('update')}
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-gray-700 dark:text-gray-300">
          Row #{op.row_id}
        </div>
        <div className="space-y-0.5 mt-0.5">
          {changes.map(([key, val]) => (
            <div key={key} className="text-xs">
              <span className="text-gray-500 dark:text-gray-400">{key}</span>
              <span className="text-gray-400 dark:text-gray-500"> → </span>
              <span className="text-amber-700 dark:text-amber-300 font-medium">{truncate(val)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// DeleteOperationRow
// =============================================================================

function DeleteOperationRow({ op, checked, onToggle }: { op: DataDeleteOperation; checked: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start gap-2 py-2 px-3 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" />
      {getActionIcon('delete')}
      <div className="flex-1 min-w-0">
        <span className="text-xs text-red-700 dark:text-red-400 line-through">
          Row #{op.row_id}
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// Progress Bar
// =============================================================================

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
        <span>Applying changes...</span>
        <span>{current} / {total}</span>
      </div>
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
        <div
          className="bg-blue-600 dark:bg-blue-400 h-1.5 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// DataProposalCard
// =============================================================================

export default function DataProposalCard({ data, onAccept, onReject }: DataProposalCardProps) {
  const [checkedOps, setCheckedOps] = useState<boolean[]>(
    () => data.operations.map(() => true)
  );
  const [status, setStatus] = useState<'pending' | 'applying' | 'applied' | 'rejected'>('pending');
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const selectedCount = checkedOps.filter(Boolean).length;
  const totalCount = data.operations.length;

  // Group operations by type
  const adds = data.operations.filter((op): op is DataAddOperation => op.action === 'add');
  const updates = data.operations.filter((op): op is DataUpdateOperation => op.action === 'update');
  const deletes = data.operations.filter((op): op is DataDeleteOperation => op.action === 'delete');

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

    setStatus('applying');
    setProgress({ current: 0, total: selectedOps.length });

    const acceptData: DataProposalData = {
      ...data,
      operations: selectedOps,
    };

    // Simulate progress (the parent handles actual execution)
    let tick = 0;
    const interval = setInterval(() => {
      tick++;
      if (tick >= selectedOps.length) {
        clearInterval(interval);
        setProgress({ current: selectedOps.length, total: selectedOps.length });
        setStatus('applied');
      } else {
        setProgress({ current: tick, total: selectedOps.length });
      }
    }, 200);

    onAccept?.(acceptData);
  };

  const handleReject = () => {
    setStatus('rejected');
    onReject?.();
  };

  // Summary line
  const parts: string[] = [];
  if (adds.length > 0) parts.push(`${adds.length} addition${adds.length > 1 ? 's' : ''}`);
  if (updates.length > 0) parts.push(`${updates.length} update${updates.length > 1 ? 's' : ''}`);
  if (deletes.length > 0) parts.push(`${deletes.length} deletion${deletes.length > 1 ? 's' : ''}`);
  const summaryText = parts.join(', ');

  if (status === 'applied') {
    return (
      <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-400 text-sm">
          <CheckIcon className="h-4 w-4" />
          <span>
            {selectedCount === totalCount
              ? `${totalCount} changes applied`
              : `${selectedCount} of ${totalCount} changes applied`
            }
          </span>
        </div>
      </div>
    );
  }

  if (status === 'rejected') {
    return (
      <div className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
          <XMarkIcon className="h-4 w-4" />
          <span>Data proposal cancelled</span>
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
            Data Proposal
          </h3>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {summaryText}
          </span>
        </div>
        {data.reasoning && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 italic">
            {data.reasoning}
          </div>
        )}
      </div>

      {/* Operations grouped by type */}
      <div className="max-h-[300px] overflow-y-auto">
        {adds.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-green-50/50 dark:bg-green-900/10 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-green-700 dark:text-green-400 uppercase tracking-wider">
                Additions ({adds.length})
              </span>
            </div>
            {adds.map((op, i) => {
              const globalIndex = data.operations.indexOf(op);
              return (
                <AddOperationRow
                  key={i}
                  op={op}
                  checked={checkedOps[globalIndex]}
                  onToggle={() => toggleOp(globalIndex)}
                />
              );
            })}
          </div>
        )}

        {updates.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-amber-50/50 dark:bg-amber-900/10 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                Updates ({updates.length})
              </span>
            </div>
            {updates.map((op, i) => {
              const globalIndex = data.operations.indexOf(op);
              return (
                <UpdateOperationRow
                  key={i}
                  op={op}
                  checked={checkedOps[globalIndex]}
                  onToggle={() => toggleOp(globalIndex)}
                />
              );
            })}
          </div>
        )}

        {deletes.length > 0 && (
          <div>
            <div className="px-4 py-1.5 bg-red-50/50 dark:bg-red-900/10 border-b border-gray-100 dark:border-gray-800">
              <span className="text-xs font-semibold text-red-700 dark:text-red-400 uppercase tracking-wider">
                Deletions ({deletes.length})
              </span>
            </div>
            {deletes.map((op, i) => {
              const globalIndex = data.operations.indexOf(op);
              return (
                <DeleteOperationRow
                  key={i}
                  op={op}
                  checked={checkedOps[globalIndex]}
                  onToggle={() => toggleOp(globalIndex)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Progress bar (when applying) */}
      {status === 'applying' && (
        <ProgressBar current={progress.current} total={progress.total} />
      )}

      {/* Actions */}
      {status === 'pending' && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={handleReject}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleApply}
            disabled={selectedCount === 0}
          >
            Apply {selectedCount === totalCount
              ? `All ${totalCount} ${parts.length === 1 ? parts[0].replace(/^\d+ /, '') : 'Changes'}`
              : `${selectedCount} of ${totalCount} Changes`
            }
          </Button>
        </div>
      )}
    </div>
  );
}
