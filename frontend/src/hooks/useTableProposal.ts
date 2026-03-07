import { useState, useCallback } from 'react';
import type {
  DataProposalData,
  DataOperation,
  OpStatus,
  OpResult,
} from '../types/dataProposal';
import type { SchemaProposalData } from '../types/schemaProposal';
import { showSuccessToast } from '../lib/errorToast';
import type { DataTableProposal } from '../types/proposalOverlay';

type ProposalData =
  | { kind: 'data'; data: DataProposalData }
  | { kind: 'schema'; data: SchemaProposalData }
  | null;

// =============================================================================
// Hook
// =============================================================================

export function useTableProposal(
  onExecuteDataOp: (op: DataOperation) => Promise<void>,
  onApplySchema: (data: SchemaProposalData) => Promise<void>,
  fetchRows: () => Promise<void>,
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

  const dataProposal = proposal?.kind === 'data' ? proposal.data : null;
  const schemaData = proposal?.kind === 'schema' ? proposal.data : null;

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
    // Don't replace an active proposal — the user must accept or dismiss it first.
    // This prevents chat messages (and their AI responses) from clobbering pending changes.
    if (proposal !== null) return false;

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
  }, [proposal, resetDataState, resetSchemaState]);

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

    const total = successes + errors;
    if (errors === 0) {
      showSuccessToast(`All ${successes} changes applied`);
    } else {
      showSuccessToast(`Applied ${successes} of ${total} — ${errors} failed`);
    }
    dismiss();
  }, [dataProposal, checkedOps, onExecuteDataOp, fetchRows, dismiss]);

  // Schema actions
  const applySchema = useCallback(async () => {
    if (!schemaData) return;

    setApplying(true);
    try {
      await onApplySchema(schemaData);
      await fetchRows();
      dismiss();
    } catch {
      setApplying(false);
    }
  }, [schemaData, onApplySchema, fetchRows, dismiss]);

  // ---------------------------------------------------------------------------
  // Build return value
  // ---------------------------------------------------------------------------

  const active = proposal !== null;
  const kind = proposal?.kind ?? null;

  // DataTableProposal for DataTable — raw operations, DataTable computes display
  const dataTableProposal: DataTableProposal | undefined = (() => {
    if (proposal?.kind === 'data' && phase !== 'done') {
      return {
        kind: 'data' as const,
        operations: proposal.data.operations,
        checkedOps,
        onToggleOp: toggleOp,
        phase,
        opResults,
      };
    }
    if (schemaData) {
      return {
        kind: 'schema' as const,
        operations: schemaData.operations,
      };
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
    proposal: dataTableProposal,

    // For ProposalActionBar
    dataBar,

    // For SchemaProposalStrip
    schemaBar,
  };
}
