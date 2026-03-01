import { useState, useCallback, useMemo } from 'react';
import type { ColumnDefinition, TableRow } from '../types/table';
import type {
  DataProposalData,
  DataOperation,
  OpStatus,
  OpResult,
} from '../components/chat/DataProposalCard';

// =============================================================================
// Types
// =============================================================================

export interface RowProposalMeta {
  action: 'add' | 'delete' | 'update';
  opIndex: number;
  oldValues?: Record<string, unknown>;
}

export interface ProposalState {
  rowMeta: Map<number, RowProposalMeta>;
  checkedOps: boolean[];
  onToggleOp: (opIndex: number) => void;
  phase: 'idle' | 'running' | 'done';
  opResults: OpResult[];
}

export interface InlineProposal {
  active: boolean;
  data: DataProposalData | null;
  proposalState: ProposalState | null;
  displayRows: TableRow[];
  activate: (data: DataProposalData) => void;
  dismiss: () => void;
  toggleOp: (opIndex: number) => void;
  toggleAll: (checked: boolean) => void;
  apply: () => Promise<void>;
  done: () => void;
  checkedOps: boolean[];
  phase: 'idle' | 'running' | 'done';
  opResults: OpResult[];
  successCount: number;
  errorCount: number;
}

// =============================================================================
// Hook
// =============================================================================

export function useInlineProposal(
  columns: ColumnDefinition[],
  realRows: TableRow[],
  tableId: number,
  onExecuteOperation: (op: DataOperation) => Promise<void>,
  fetchRows: () => Promise<void>,
  sendMessage: (msg: string) => void,
): InlineProposal {
  const [data, setData] = useState<DataProposalData | null>(null);
  const [checkedOps, setCheckedOps] = useState<boolean[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [opResults, setOpResults] = useState<OpResult[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // Column name → ID mapping
  const colNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const col of columns) {
      map.set(col.name.toLowerCase(), col.id);
    }
    return map;
  }, [columns]);

  const mapData = useCallback(
    (rawData: Record<string, unknown>): Record<string, unknown> => {
      const mapped: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(rawData)) {
        const colId = colNameToId.get(key.toLowerCase()) || key;
        mapped[colId] = val;
      }
      return mapped;
    },
    [colNameToId],
  );

  // -------------------------------------------------------------------------
  // Memoized: merge virtual rows + patch updates into display rows
  // -------------------------------------------------------------------------

  const displayRows = useMemo(() => {
    if (!data) return realRows;

    // After apply completes and fetchRows has run, real data is up to date —
    // no virtual rows or patches needed (avoids duplicate row bug)
    if (phase === 'done') return realRows;

    // Build virtual add rows (prepend)
    const addRows: TableRow[] = [];
    // Build a map of row_id → patched data for updates
    const updatePatches = new Map<number, Record<string, unknown>>();

    for (let i = 0; i < data.operations.length; i++) {
      const op = data.operations[i];
      if (op.action === 'add' && op.data) {
        addRows.push({
          id: -(i + 1), // negative IDs for virtual rows
          table_id: tableId,
          data: mapData(op.data),
          created_at: '',
          updated_at: '',
        });
      } else if (op.action === 'update' && op.row_id && op.changes) {
        updatePatches.set(op.row_id, mapData(op.changes));
      }
    }

    // Patch existing rows with update data
    const patchedRows = realRows.map((row) => {
      const patch = updatePatches.get(row.id);
      if (!patch) return row;
      return { ...row, data: { ...row.data, ...patch } };
    });

    return [...addRows, ...patchedRows];
  }, [data, realRows, tableId, mapData, phase]);

  // -------------------------------------------------------------------------
  // Memoized: row ID → proposal meta map
  // -------------------------------------------------------------------------

  const rowMeta = useMemo(() => {
    const map = new Map<number, RowProposalMeta>();
    if (!data) return map;

    for (let i = 0; i < data.operations.length; i++) {
      const op = data.operations[i];
      if (op.action === 'add') {
        map.set(-(i + 1), { action: 'add', opIndex: i });
      } else if (op.action === 'delete' && op.row_id) {
        map.set(op.row_id, { action: 'delete', opIndex: i });
      } else if (op.action === 'update' && op.row_id && op.changes) {
        // Store old values from the original row data for tooltip
        const originalRow = realRows.find((r) => r.id === op.row_id);
        const mappedChanges = mapData(op.changes);
        const oldValues: Record<string, unknown> = {};
        // Track ALL changed columns (even if original was undefined/null)
        for (const colId of Object.keys(mappedChanges)) {
          oldValues[colId] = originalRow?.data[colId] ?? null;
        }
        map.set(op.row_id, { action: 'update', opIndex: i, oldValues });
      }
    }

    return map;
  }, [data, realRows, mapData]);

  // -------------------------------------------------------------------------
  // Actions
  // -------------------------------------------------------------------------

  const activate = useCallback((proposalData: DataProposalData) => {
    setData(proposalData);
    setCheckedOps(proposalData.operations.map(() => true));
    setOpResults(proposalData.operations.map(() => ({ status: 'pending' as OpStatus })));
    setPhase('idle');
    setSuccessCount(0);
    setErrorCount(0);
  }, []);

  const dismiss = useCallback(() => {
    setData(null);
    setCheckedOps([]);
    setOpResults([]);
    setPhase('idle');
    setSuccessCount(0);
    setErrorCount(0);
  }, []);

  const toggleOp = useCallback(
    (opIndex: number) => {
      if (phase !== 'idle') return;
      setCheckedOps((prev) => {
        const next = [...prev];
        next[opIndex] = !next[opIndex];
        return next;
      });
    },
    [phase],
  );

  const toggleAll = useCallback(
    (checked: boolean) => {
      if (phase !== 'idle') return;
      setCheckedOps((prev) => prev.map(() => checked));
    },
    [phase],
  );

  const apply = useCallback(async () => {
    if (!data) return;

    const selectedIndices = data.operations
      .map((_, i) => i)
      .filter((i) => checkedOps[i]);

    if (selectedIndices.length === 0) return;

    setPhase('running');
    let successes = 0;
    let errors = 0;

    for (const idx of selectedIndices) {
      const op = data.operations[idx];

      setOpResults((prev) => {
        const next = [...prev];
        next[idx] = { status: 'running' };
        return next;
      });

      try {
        await onExecuteOperation(op);
        setOpResults((prev) => {
          const next = [...prev];
          next[idx] = { status: 'success' };
          return next;
        });
        successes++;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setOpResults((prev) => {
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

    if (successes > 0) {
      await fetchRows();
    }
  }, [data, checkedOps, onExecuteOperation, fetchRows]);

  const done = useCallback(() => {
    sendMessage('[User accepted the data proposal and applied all changes.]');
    dismiss();
  }, [sendMessage, dismiss]);

  // -------------------------------------------------------------------------
  // Build proposalState for DataTable
  // -------------------------------------------------------------------------

  // During 'done' phase, table shows real data without annotations —
  // the action bar handles the done summary UI
  const proposalState: ProposalState | null = data && phase !== 'done'
    ? {
        rowMeta,
        checkedOps,
        onToggleOp: toggleOp,
        phase,
        opResults,
      }
    : null;

  return {
    active: data !== null,
    data,
    proposalState,
    displayRows: data ? displayRows : realRows,
    activate,
    dismiss,
    toggleOp,
    toggleAll,
    apply,
    done,
    checkedOps,
    phase,
    opResults,
    successCount,
    errorCount,
  };
}
