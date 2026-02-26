import { useState, useCallback } from 'react';
import { CheckIcon, XMarkIcon, PlusIcon, PencilIcon, TrashIcon, ExclamationTriangleIcon, ChevronRightIcon, MagnifyingGlassIcon, GlobeAltIcon } from '@heroicons/react/24/outline';
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

export type DataOperation = DataAddOperation | DataUpdateOperation | DataDeleteOperation;

interface ResearchStep {
  action: 'search' | 'fetch' | 'thinking' | 'error' | 'answer';
  query?: string;
  url?: string;
  text?: string;
  detail?: string;
}

interface ResearchLogEntry {
  row_id: number;
  label: string;
  status: 'found' | 'not_found';
  value: string | null;
  steps: ResearchStep[];
}

export interface DataProposalData {
  reasoning?: string;
  operations: DataOperation[];
  research_log?: ResearchLogEntry[];
}

type OpStatus = 'pending' | 'running' | 'success' | 'error';

interface OpResult {
  status: OpStatus;
  error?: string;
}

interface DataProposalCardProps {
  data: DataProposalData;
  onAccept?: (data: DataProposalData) => void;
  onReject?: () => void;
  onExecuteOperation?: (op: DataOperation) => Promise<void>;
  /** Called when all operations finish — use to refresh table immediately */
  onOperationsComplete?: () => void;
  /** When true, uses larger text, no truncation, expanded rows */
  isMaximized?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

function getActionIcon(action: string, large?: boolean) {
  const cls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (action) {
    case 'add':
      return <PlusIcon className={`${cls} text-green-600 dark:text-green-400`} />;
    case 'update':
      return <PencilIcon className={`${cls} text-amber-600 dark:text-amber-400`} />;
    case 'delete':
      return <TrashIcon className={`${cls} text-red-600 dark:text-red-400`} />;
    default:
      return null;
  }
}

function truncate(val: unknown, maxLen = 40): string {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (maxLen <= 0) return s; // no truncation
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s;
}

function OpStatusIcon({ result, large }: { result: OpResult; large?: boolean }) {
  const cls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (result.status) {
    case 'running':
      return <div className={`${cls} border-2 border-blue-500 border-t-transparent rounded-full animate-spin flex-shrink-0`} />;
    case 'success':
      return <CheckIcon className={`${cls} text-green-600 dark:text-green-400 flex-shrink-0`} />;
    case 'error':
      return (
        <span title={result.error || 'Failed'}>
          <XMarkIcon className={`${cls} text-red-600 dark:text-red-400 flex-shrink-0`} />
        </span>
      );
    default:
      return null;
  }
}

// =============================================================================
// AddOperationRow
// =============================================================================

function AddOperationRow({ op, checked, onToggle, result, disabled, large }: {
  op: DataAddOperation; checked: boolean; onToggle: () => void; result?: OpResult; disabled?: boolean; large?: boolean;
}) {
  const entries = Object.entries(op.data);
  const displayEntries = large ? entries : entries.slice(0, 3);
  const moreCount = entries.length - displayEntries.length;
  const textCls = large ? 'text-sm' : 'text-xs';

  return (
    <div className="flex items-start gap-2 py-2 px-3 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors">
      {result ? <OpStatusIcon result={result} large={large} /> : (
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" disabled={disabled} />
      )}
      {getActionIcon('add', large)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {displayEntries.map(([key, val]) => (
            <span key={key} className={textCls}>
              <span className="text-gray-500 dark:text-gray-400">{key}:</span>{' '}
              <span className="text-gray-900 dark:text-gray-100">{truncate(val, large ? 0 : 30)}</span>
            </span>
          ))}
          {moreCount > 0 && (
            <span className={`${textCls} text-gray-400 dark:text-gray-500`}>+{moreCount} more</span>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// UpdateOperationRow
// =============================================================================

function UpdateOperationRow({ op, checked, onToggle, result, disabled, large }: {
  op: DataUpdateOperation; checked: boolean; onToggle: () => void; result?: OpResult; disabled?: boolean; large?: boolean;
}) {
  const changes = Object.entries(op.changes);
  const textCls = large ? 'text-sm' : 'text-xs';

  return (
    <div className="flex items-start gap-2 py-2 px-3 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-colors">
      {result ? <OpStatusIcon result={result} large={large} /> : (
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" disabled={disabled} />
      )}
      {getActionIcon('update', large)}
      <div className="flex-1 min-w-0">
        <div className={`${textCls} font-medium text-gray-700 dark:text-gray-300`}>
          Row #{op.row_id}
        </div>
        <div className="space-y-0.5 mt-0.5">
          {changes.map(([key, val]) => (
            <div key={key} className={textCls}>
              <span className="text-gray-500 dark:text-gray-400">{key}</span>
              <span className="text-gray-400 dark:text-gray-500"> → </span>
              <span className={`text-amber-700 dark:text-amber-300 font-medium ${large ? 'whitespace-pre-wrap break-words' : ''}`}>{truncate(val, large ? 0 : 40)}</span>
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

function DeleteOperationRow({ op, checked, onToggle, result, disabled, large }: {
  op: DataDeleteOperation; checked: boolean; onToggle: () => void; result?: OpResult; disabled?: boolean; large?: boolean;
}) {
  const textCls = large ? 'text-sm' : 'text-xs';
  return (
    <div className="flex items-start gap-2 py-2 px-3 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors">
      {result ? <OpStatusIcon result={result} large={large} /> : (
        <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-1" disabled={disabled} />
      )}
      {getActionIcon('delete', large)}
      <div className="flex-1 min-w-0">
        <span className={`${textCls} text-red-700 dark:text-red-400 line-through`}>
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
// ResearchStepRow — a single step in the research trace
// =============================================================================

function ResearchStepRow({ step, large }: { step: ResearchStep; large?: boolean }) {
  const textCls = large ? 'text-sm' : 'text-xs';
  const iconCls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';
  switch (step.action) {
    case 'search':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <MagnifyingGlassIcon className={`${iconCls} text-blue-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <div>
              <span className="text-gray-500 dark:text-gray-400">Search: </span>
              <span className="text-gray-700 dark:text-gray-300">{step.query}</span>
            </div>
            {step.detail && (
              <div className="text-gray-400 dark:text-gray-500 mt-0.5 pl-1 border-l-2 border-gray-200 dark:border-gray-700">
                {step.detail}
              </div>
            )}
          </div>
        </div>
      );
    case 'fetch':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <GlobeAltIcon className={`${iconCls} text-purple-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-gray-500 dark:text-gray-400">Fetch: </span>
            <span className="text-gray-700 dark:text-gray-300 break-all">{step.url}</span>
            {step.detail && (
              <span className="text-gray-400 dark:text-gray-500"> — {step.detail}</span>
            )}
          </div>
        </div>
      );
    case 'thinking':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <span className="text-gray-400 flex-shrink-0 mt-0.5">💭</span>
          <span className="text-gray-500 dark:text-gray-400 italic">{step.text}</span>
        </div>
      );
    case 'error':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <ExclamationTriangleIcon className={`${iconCls} text-red-500 flex-shrink-0 mt-0.5`} />
          <span className="text-red-600 dark:text-red-400">{step.detail}</span>
        </div>
      );
    case 'answer':
      return (
        <div className={`flex items-start gap-1.5 ${textCls}`}>
          <CheckIcon className={`${iconCls} text-green-500 flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <span className="text-gray-500 dark:text-gray-400">Result: </span>
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              {step.text || 'No answer'}
            </span>
          </div>
        </div>
      );
    default:
      return null;
  }
}

// =============================================================================
// ResearchLogRow — expandable row showing research trace for one table row
// =============================================================================

function ResearchLogRow({ entry, large, defaultExpanded = false }: { entry: ResearchLogEntry; large?: boolean; defaultExpanded?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isFound = entry.status === 'found';
  const textCls = large ? 'text-sm' : 'text-xs';
  const iconCls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className="border-b border-gray-100 dark:border-gray-800 last:border-b-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <ChevronRightIcon className={`${iconCls} text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <span className={`${textCls} font-medium ${
          isFound
            ? 'text-green-700 dark:text-green-400'
            : 'text-gray-500 dark:text-gray-400'
        }`}>
          {isFound ? '✓' : '✗'}
        </span>
        <span className={`${textCls} text-gray-700 dark:text-gray-300 font-medium ${large ? '' : 'truncate'}`}>
          {entry.label}
        </span>
        {isFound && entry.value && !large && (
          <span className={`${textCls} text-gray-500 dark:text-gray-400 truncate ml-auto`}>
            → {entry.value.length > 50 ? entry.value.slice(0, 50) + '...' : entry.value}
          </span>
        )}
        <span className={`${textCls} text-gray-400 dark:text-gray-500 flex-shrink-0`}>
          {entry.steps.length} step{entry.steps.length !== 1 ? 's' : ''}
        </span>
      </button>
      {expanded && (
        <div className="pl-8 pr-3 pb-2 space-y-1.5">
          {large && isFound && entry.value && (
            <div className={`${textCls} bg-green-50 dark:bg-green-900/20 rounded p-2 mb-2 text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words`}>
              <span className="font-medium text-green-700 dark:text-green-400">Answer: </span>
              {entry.value}
            </div>
          )}
          {entry.steps.map((step, i) => (
            <ResearchStepRow key={i} step={step} large={large} />
          ))}
          {entry.steps.length === 0 && (
            <span className={`${textCls} text-gray-400 italic`}>No research steps recorded</span>
          )}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// ResearchLog — the full research trace section
// =============================================================================

function ResearchLog({ log, defaultExpanded = false, large }: { log: ResearchLogEntry[]; defaultExpanded?: boolean; large?: boolean }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const foundCount = log.filter(e => e.status === 'found').length;
  const notFoundCount = log.filter(e => e.status === 'not_found').length;
  const textCls = large ? 'text-sm' : 'text-xs';
  const iconCls = large ? 'h-4 w-4' : 'h-3.5 w-3.5';

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 flex flex-col min-h-0">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left flex-shrink-0"
      >
        <ChevronRightIcon className={`${iconCls} text-gray-400 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        <MagnifyingGlassIcon className={`${iconCls} text-gray-500 flex-shrink-0`} />
        <span className={`${textCls} font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider`}>
          Research Log
        </span>
        <span className={`${textCls} text-gray-400 dark:text-gray-500 ml-auto`}>
          {foundCount} found, {notFoundCount} not found
        </span>
      </button>
      {expanded && (
        <div className={large ? 'flex-1 min-h-0 overflow-y-auto' : 'max-h-[400px] overflow-y-auto'}>
          {log.map((entry, i) => (
            <ResearchLogRow key={i} entry={entry} large={large} defaultExpanded={large} />
          ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// DataProposalCard
// =============================================================================

export default function DataProposalCard({ data, onAccept, onReject, onExecuteOperation, onOperationsComplete, isMaximized }: DataProposalCardProps) {
  const [checkedOps, setCheckedOps] = useState<boolean[]>(
    () => data.operations.map(() => true)
  );
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [opResults, setOpResults] = useState<OpResult[]>(
    () => data.operations.map(() => ({ status: 'pending' as OpStatus }))
  );
  const [rejected, setRejected] = useState(false);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  const selectedCount = checkedOps.filter(Boolean).length;
  const totalCount = data.operations.length;

  // Group operations by type
  const adds = data.operations.filter((op): op is DataAddOperation => op.action === 'add');
  const updates = data.operations.filter((op): op is DataUpdateOperation => op.action === 'update');
  const deletes = data.operations.filter((op): op is DataDeleteOperation => op.action === 'delete');

  const completedCount = opResults.filter(r => r.status === 'success' || r.status === 'error').length;
  const runningTotal = opResults.filter(r => r.status !== 'pending').length > 0
    ? checkedOps.filter(Boolean).length
    : 0;

  const toggleOp = (index: number) => {
    if (phase !== 'idle') return;
    setCheckedOps((prev) => {
      const next = [...prev];
      next[index] = !next[index];
      return next;
    });
  };

  const handleApply = useCallback(async () => {
    const selectedIndices = data.operations
      .map((_, i) => i)
      .filter(i => checkedOps[i]);

    if (selectedIndices.length === 0) return;

    setPhase('running');

    let successes = 0;
    let errors = 0;

    for (const idx of selectedIndices) {
      const op = data.operations[idx];

      // Mark running
      setOpResults(prev => {
        const next = [...prev];
        next[idx] = { status: 'running' };
        return next;
      });

      try {
        if (onExecuteOperation) {
          await onExecuteOperation(op);
        }
        // Mark success
        setOpResults(prev => {
          const next = [...prev];
          next[idx] = { status: 'success' };
          return next;
        });
        successes++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setOpResults(prev => {
          const next = [...prev];
          next[idx] = { status: 'error', error: errorMsg };
          return next;
        });
        errors++;
      }
    }

    setSuccessCount(successes);
    setErrorCount(errors);
    setPhase('done');

    // Refresh table immediately so user sees changes
    if (successes > 0) {
      onOperationsComplete?.();
    }
  }, [data.operations, checkedOps, onExecuteOperation, onOperationsComplete]);

  const handleDone = useCallback(() => {
    // Build data with only successful ops for the refresh callback
    const successfulOps = data.operations.filter((_, i) => opResults[i].status === 'success');
    onAccept?.({ ...data, operations: successfulOps });
  }, [data, opResults, onAccept]);

  const handleReject = () => {
    setRejected(true);
    onReject?.();
  };

  const hasResearchLog = data.research_log && data.research_log.length > 0;

  // Summary line
  const parts: string[] = [];
  if (adds.length > 0) parts.push(`${adds.length} addition${adds.length > 1 ? 's' : ''}`);
  if (updates.length > 0) parts.push(`${updates.length} update${updates.length > 1 ? 's' : ''}`);
  if (deletes.length > 0) parts.push(`${deletes.length} deletion${deletes.length > 1 ? 's' : ''}`);
  const summaryText = parts.length > 0
    ? parts.join(', ')
    : hasResearchLog
      ? 'No results found'
      : '';

  // Result for a given global index (only shown during/after execution)
  const getOpResult = (globalIndex: number): OpResult | undefined => {
    if (phase === 'idle') return undefined;
    return opResults[globalIndex];
  };

  if (rejected) {
    return (
      <div className="border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-sm">
          <XMarkIcon className="h-4 w-4" />
          <span>Proposal cancelled</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 ${isMaximized ? '' : 'overflow-hidden'}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            {totalCount === 0 && hasResearchLog ? 'AI Research Results' : hasResearchLog ? 'AI Research Results' : 'Data Proposal'}
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
      <div className={isMaximized ? 'overflow-y-auto' : 'max-h-[300px] overflow-y-auto'}>
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
                  result={getOpResult(globalIndex)}
                  disabled={phase !== 'idle'}
                  large={isMaximized}
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
                  result={getOpResult(globalIndex)}
                  disabled={phase !== 'idle'}
                  large={isMaximized}
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
                  result={getOpResult(globalIndex)}
                  disabled={phase !== 'idle'}
                  large={isMaximized}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Research log (when present) */}
      {hasResearchLog && (
        <ResearchLog log={data.research_log!} defaultExpanded large={isMaximized} />
      )}

      {/* Progress bar (when running) */}
      {phase === 'running' && (
        <ProgressBar current={completedCount} total={runningTotal} />
      )}

      {/* Done summary banner */}
      {phase === 'done' && (
        <div className={`px-4 py-3 border-t ${
          errorCount > 0
            ? 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'
            : 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20'
        }`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              {errorCount > 0 ? (
                <>
                  <ExclamationTriangleIcon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                  <span className="text-amber-700 dark:text-amber-300">
                    Applied {successCount} of {successCount + errorCount} — {errorCount} failed
                  </span>
                </>
              ) : (
                <>
                  <CheckIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                  <span className="text-green-700 dark:text-green-300">
                    {successCount === totalCount
                      ? `All ${successCount} changes applied`
                      : `${successCount} of ${totalCount} changes applied`
                    }
                  </span>
                </>
              )}
            </div>
            <Button size="sm" onClick={handleDone}>
              Done
            </Button>
          </div>
        </div>
      )}

      {/* Actions (only when idle) */}
      {phase === 'idle' && totalCount > 0 && (
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

      {/* Dismiss button when no operations but research log exists */}
      {phase === 'idle' && totalCount === 0 && hasResearchLog && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-end">
          <Button variant="outline" size="sm" onClick={handleReject}>
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}
