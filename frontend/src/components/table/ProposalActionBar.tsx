import {
  SparklesIcon,
  CheckIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { Button } from '../ui/button';
import {
  ProgressBar,
  ResearchLog,
  type DataProposalData,
} from '../chat/DataProposalCard';
import type { OpResult } from '../chat/DataProposalCard';

// =============================================================================
// Types
// =============================================================================

interface ProposalActionBarProps {
  data: DataProposalData;
  checkedOps: boolean[];
  phase: 'idle' | 'running' | 'done';
  opResults: OpResult[];
  successCount: number;
  errorCount: number;
  onToggleAll: (checked: boolean) => void;
  onApply: () => void;
  onDismiss: () => void;
  onDone: () => void;
}

// =============================================================================
// ProposalActionBar
// =============================================================================

export default function ProposalActionBar({
  data,
  checkedOps,
  phase,
  opResults,
  successCount,
  errorCount,
  onToggleAll,
  onApply,
  onDismiss,
  onDone,
}: ProposalActionBarProps) {
  const ops = data.operations;
  const selectedCount = checkedOps.filter(Boolean).length;
  const totalCount = ops.length;

  // Summary counts
  const adds = ops.filter((o) => o.action === 'add').length;
  const updates = ops.filter((o) => o.action === 'update').length;
  const deletes = ops.filter((o) => o.action === 'delete').length;

  const parts: string[] = [];
  if (adds > 0) parts.push(`${adds} addition${adds > 1 ? 's' : ''}`);
  if (updates > 0) parts.push(`${updates} update${updates > 1 ? 's' : ''}`);
  if (deletes > 0) parts.push(`${deletes} deletion${deletes > 1 ? 's' : ''}`);
  const summaryText = parts.join(', ');

  // Progress tracking
  const completedCount = opResults.filter(
    (r) => r.status === 'success' || r.status === 'error',
  ).length;
  const runningTotal = checkedOps.filter(Boolean).length;

  const hasResearchLog = data.research_log && data.research_log.length > 0;

  return (
    <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-violet-50 via-blue-50 to-cyan-50 dark:from-violet-950/30 dark:via-blue-950/30 dark:to-cyan-950/30">
      {/* Main bar */}
      <div className="px-4 py-3">
        {/* Title + summary */}
        <div className="flex items-center gap-2 mb-2">
          <SparklesIcon className="h-4 w-4 text-violet-600 dark:text-violet-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            AI Proposed Changes
          </span>
          {summaryText && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              — {summaryText}
            </span>
          )}
        </div>

        {/* Controls row */}
        {phase === 'idle' && totalCount > 0 && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onToggleAll(true)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Select All
              </button>
              <span className="text-gray-300 dark:text-gray-600">|</span>
              <button
                type="button"
                onClick={() => onToggleAll(false)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Deselect All
              </button>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={onDismiss}>
                Dismiss
              </Button>
              <Button
                size="sm"
                onClick={onApply}
                disabled={selectedCount === 0}
              >
                Apply{' '}
                {selectedCount === totalCount
                  ? `All ${totalCount}`
                  : `${selectedCount} of ${totalCount}`}
              </Button>
            </div>
          </div>
        )}

        {/* Running: progress bar */}
        {phase === 'running' && (
          <ProgressBar current={completedCount} total={runningTotal} />
        )}

        {/* Done summary */}
        {phase === 'done' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {errorCount > 0 ? (
                <>
                  <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-amber-700 dark:text-amber-300">
                    Applied {successCount} of {successCount + errorCount} —{' '}
                    {errorCount} failed
                  </span>
                </>
              ) : (
                <>
                  <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-green-700 dark:text-green-300">
                    {successCount === totalCount
                      ? `All ${successCount} changes applied`
                      : `${successCount} of ${totalCount} changes applied`}
                  </span>
                </>
              )}
            </div>
            <Button size="sm" onClick={onDone}>
              Done
            </Button>
          </div>
        )}
      </div>

      {/* Research log (collapsible) */}
      {hasResearchLog && (
        <ResearchLog log={data.research_log!} defaultExpanded={false} />
      )}
    </div>
  );
}
