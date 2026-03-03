import type { DataOperation, OpResult } from './dataProposal';
import type { SchemaOperation } from './schemaProposal';

export interface DataProposal {
  kind: 'data';
  operations: DataOperation[];
  checkedOps: boolean[];
  onToggleOp: (opIndex: number) => void;
  phase: 'idle' | 'running' | 'done';
  opResults: OpResult[];
}

export interface SchemaProposal {
  kind: 'schema';
  operations: SchemaOperation[];
}

export type DataTableProposal = DataProposal | SchemaProposal;
