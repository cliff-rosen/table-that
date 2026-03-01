import { useState, useCallback, useMemo } from 'react';
import type { ColumnDefinition, ColumnType, TableRow } from '../types/table';
import type {
  DataProposalData,
  DataOperation,
  OpStatus,
  OpResult,
} from '../components/chat/DataProposalCard';
import type { SchemaProposalData } from '../lib/utils/schemaOperations';
import { generateColumnId } from '../lib/utils/schemaOperations';
import { showSuccessToast } from '../lib/errorToast';

// =============================================================================
// Types
// =============================================================================

export interface RowProposalMeta {
  action: 'add' | 'delete' | 'update';
  opIndex: number;
  oldValues?: Record<string, unknown>;
}

export interface ColumnProposalMeta {
  action: 'add' | 'remove' | 'modify' | 'reorder';
  changes?: Partial<{ name: string; type: string; required: boolean; options: string[] }>;
}

export type ProposalOverlay =
  | { kind: 'data'; rowMeta: Map<number, RowProposalMeta>; checkedOps: boolean[]; onToggleOp: (opIndex: number) => void; phase: 'idle' | 'running' | 'done'; opResults: OpResult[] }
  | { kind: 'schema'; columnMeta: Map<string, ColumnProposalMeta> };

type ProposalData =
  | { kind: 'data'; data: DataProposalData }
  | { kind: 'schema'; data: SchemaProposalData }
  | null;

// =============================================================================
// Hook
// =============================================================================

export function useTableProposal(
  columns: ColumnDefinition[],
  realRows: TableRow[],
  tableId: number,
  onExecuteDataOp: (op: DataOperation) => Promise<void>,
  onApplySchema: (data: SchemaProposalData) => Promise<void>,
  fetchRows: () => Promise<void>,
  sendMessage: (msg: string) => void,
) {
  // One slot — discriminated union
  const [proposal, setProposal] = useState<ProposalData>(null);

  // Data-specific auxiliary state
  const [checkedOps, setCheckedOps] = useState<boolean[]>([]);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [opResults, setOpResults] = useState<OpResult[]>([]);
  const [successCount, setSuccessCount] = useState(0);
  const [errorCount, setErrorCount] = useState(0);

  // Schema-specific auxiliary state
  const [applying, setApplying] = useState(false);

  // ---------------------------------------------------------------------------
  // Data-proposal memoized computations (only when kind === 'data')
  // ---------------------------------------------------------------------------

  const dataProposal = proposal?.kind === 'data' ? proposal.data : null;

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

  const displayRows = useMemo(() => {
    if (!dataProposal) return realRows;

    // After apply completes and fetchRows has run, real data is up to date
    if (phase === 'done') return realRows;

    const addRows: TableRow[] = [];
    const updatePatches = new Map<number, Record<string, unknown>>();

    for (let i = 0; i < dataProposal.operations.length; i++) {
      const op = dataProposal.operations[i];
      if (op.action === 'add' && op.data) {
        addRows.push({
          id: -(i + 1),
          table_id: tableId,
          data: mapData(op.data),
          created_at: '',
          updated_at: '',
        });
      } else if (op.action === 'update' && op.row_id && op.changes) {
        updatePatches.set(op.row_id, mapData(op.changes));
      }
    }

    const patchedRows = realRows.map((row) => {
      const patch = updatePatches.get(row.id);
      if (!patch) return row;
      return { ...row, data: { ...row.data, ...patch } };
    });

    return [...addRows, ...patchedRows];
  }, [dataProposal, realRows, tableId, mapData, phase]);

  const rowMeta = useMemo(() => {
    const map = new Map<number, RowProposalMeta>();
    if (!dataProposal) return map;

    for (let i = 0; i < dataProposal.operations.length; i++) {
      const op = dataProposal.operations[i];
      if (op.action === 'add') {
        map.set(-(i + 1), { action: 'add', opIndex: i });
      } else if (op.action === 'delete' && op.row_id) {
        map.set(op.row_id, { action: 'delete', opIndex: i });
      } else if (op.action === 'update' && op.row_id && op.changes) {
        const originalRow = realRows.find((r) => r.id === op.row_id);
        const mappedChanges = mapData(op.changes);
        const oldValues: Record<string, unknown> = {};
        for (const colId of Object.keys(mappedChanges)) {
          oldValues[colId] = originalRow?.data[colId] ?? null;
        }
        map.set(op.row_id, { action: 'update', opIndex: i, oldValues });
      }
    }

    return map;
  }, [dataProposal, realRows, mapData]);

  // ---------------------------------------------------------------------------
  // Schema-proposal memoized computations (only when kind === 'schema')
  // ---------------------------------------------------------------------------

  const schemaData = proposal?.kind === 'schema' ? proposal.data : null;

  const addedColumnIds = useMemo(() => {
    if (!schemaData) return new Map<number, string>();
    const map = new Map<number, string>();
    schemaData.operations.forEach((op, i) => {
      if (op.action === 'add') {
        map.set(i, generateColumnId());
      }
    });
    return map;
  }, [schemaData]);

  const { displayColumns, columnMeta } = useMemo(() => {
    if (!schemaData) {
      return {
        displayColumns: columns,
        columnMeta: new Map<string, ColumnProposalMeta>(),
      };
    }

    const meta = new Map<string, ColumnProposalMeta>();
    let cols = [...columns];

    for (let i = 0; i < schemaData.operations.length; i++) {
      const op = schemaData.operations[i];

      switch (op.action) {
        case 'add': {
          if (!op.column) break;
          const newId = addedColumnIds.get(i)!;
          const newCol: ColumnDefinition = {
            id: newId,
            name: op.column.name,
            type: (op.column.type as ColumnType) || 'text',
            required: op.column.required || false,
            ...(op.column.options ? { options: op.column.options } : {}),
          };
          meta.set(newId, { action: 'add' });

          if (op.after_column_id) {
            const afterIdx = cols.findIndex((c) => c.id === op.after_column_id);
            if (afterIdx >= 0) {
              cols.splice(afterIdx + 1, 0, newCol);
            } else {
              cols.push(newCol);
            }
          } else {
            cols.push(newCol);
          }
          break;
        }

        case 'remove': {
          if (!op.column_id) break;
          meta.set(op.column_id, { action: 'remove' });
          break;
        }

        case 'modify': {
          if (!op.column_id || !op.changes) break;
          meta.set(op.column_id, { action: 'modify', changes: op.changes });
          break;
        }

        case 'reorder': {
          if (!op.column_id) break;
          meta.set(op.column_id, { action: 'reorder' });
          const colIdx = cols.findIndex((c) => c.id === op.column_id);
          if (colIdx >= 0) {
            const [col] = cols.splice(colIdx, 1);
            if (op.after_column_id) {
              const afterIdx = cols.findIndex((c) => c.id === op.after_column_id);
              cols.splice(afterIdx + 1, 0, col);
            } else {
              cols.unshift(col);
            }
          }
          break;
        }
      }
    }

    return { displayColumns: cols, columnMeta: meta };
  }, [schemaData, columns, addedColumnIds]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const resetDataState = useCallback(() => {
    setCheckedOps([]);
    setOpResults([]);
    setPhase('idle');
    setSuccessCount(0);
    setErrorCount(0);
  }, []);

  const resetSchemaState = useCallback(() => {
    setApplying(false);
  }, []);

  const dismiss = useCallback(() => {
    setProposal(null);
    resetDataState();
    resetSchemaState();
  }, [resetDataState, resetSchemaState]);

  const handlePayload = useCallback((payload: { type: string; data: any; messageIndex: number }): boolean => {
    if (payload.type === 'data_proposal') {
      resetSchemaState();
      resetDataState();
      const d = payload.data as DataProposalData;
      setProposal({ kind: 'data', data: d });
      setCheckedOps(d.operations.map(() => true));
      setOpResults(d.operations.map(() => ({ status: 'pending' as OpStatus })));
      return true;
    }
    if (payload.type === 'schema_proposal' && payload.data?.mode === 'update') {
      resetDataState();
      resetSchemaState();
      setProposal({ kind: 'schema', data: payload.data as SchemaProposalData });
      return true;
    }
    return false;
  }, [resetDataState, resetSchemaState]);

  // Data actions
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

  const applyData = useCallback(async () => {
    if (!dataProposal) return;

    const selectedIndices = dataProposal.operations
      .map((_, i) => i)
      .filter((i) => checkedOps[i]);

    if (selectedIndices.length === 0) return;

    setPhase('running');
    let successes = 0;
    let errors = 0;

    for (const idx of selectedIndices) {
      const op = dataProposal.operations[idx];

      setOpResults((prev) => {
        const next = [...prev];
        next[idx] = { status: 'running' };
        return next;
      });

      try {
        await onExecuteDataOp(op);
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

    // Auto-dismiss after a brief pause so user sees the result
    const total = successes + errors;
    if (errors === 0) {
      showSuccessToast(`All ${successes} changes applied`);
    } else {
      showSuccessToast(`Applied ${successes} of ${total} — ${errors} failed`);
    }
    sendMessage(`[User accepted the data proposal and applied all changes.]`);
    // Short delay so the toast is visible before the bar disappears
    await new Promise((r) => setTimeout(r, 600));
    dismiss();
  }, [dataProposal, checkedOps, onExecuteDataOp, fetchRows, sendMessage, dismiss]);

  // Schema actions
  const applySchema = useCallback(async () => {
    if (!schemaData) return;

    setApplying(true);
    try {
      await onApplySchema(schemaData);
      await fetchRows();
      sendMessage(`[User accepted the schema proposal and applied changes.]`);
      dismiss();
    } catch {
      setApplying(false);
    }
  }, [schemaData, onApplySchema, fetchRows, sendMessage, dismiss]);

  // ---------------------------------------------------------------------------
  // Build return value
  // ---------------------------------------------------------------------------

  const active = proposal !== null;
  const kind = proposal?.kind ?? null;

  // ProposalOverlay for DataTable
  // During 'done' phase for data, table shows real data without annotations
  const proposalOverlay: ProposalOverlay | undefined = (() => {
    if (proposal?.kind === 'data' && phase !== 'done') {
      return { kind: 'data' as const, rowMeta, checkedOps, onToggleOp: toggleOp, phase, opResults };
    }
    if (proposal?.kind === 'schema') {
      return { kind: 'schema' as const, columnMeta };
    }
    return undefined;
  })();

  // dataBar for ProposalActionBar
  const dataBar = proposal?.kind === 'data' ? {
    data: proposal.data,
    checkedOps,
    phase,
    opResults,
    successCount,
    errorCount,
    toggleAll,
    apply: applyData,
  } : null;

  // schemaBar for SchemaProposalStrip
  const schemaBar = proposal?.kind === 'schema' ? {
    data: proposal.data,
    applying,
    apply: applySchema,
  } : null;

  return {
    active,
    kind,
    dismiss,
    handlePayload,

    // For DataTable
    displayColumns,
    displayRows: dataProposal ? displayRows : realRows,
    proposalOverlay,

    // For ProposalActionBar
    dataBar,

    // For SchemaProposalStrip
    schemaBar,
  };
}
