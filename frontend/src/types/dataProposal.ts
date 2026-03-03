/**
 * Data proposal types — structured operations for row-level changes
 * proposed by the AI chat system.
 *
 * Used by: useTableProposal, ProposalActionBar, DataTable, TableViewPage
 */

// =============================================================================
// Data Operations
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

// =============================================================================
// Research Log (enrichment traces)
// =============================================================================

export interface ResearchStep {
  action: 'search' | 'fetch' | 'thinking' | 'error' | 'answer'
    | 'extract' | 'compute' | 'skip' | 'lookup' | 'coverage';
  query?: string;
  url?: string;
  text?: string;
  detail?: string;
  formula?: string;
  field?: string;
  result?: string;
  value?: string;
  level?: string;
}

export interface ResearchLogEntry {
  row_id: number;
  label: string;
  status: 'found' | 'not_found';
  value: string | null;
  steps: ResearchStep[];
  strategy?: string;
  confidence?: string;
  raw_value?: string;
  thoroughness?: 'exploratory' | 'comprehensive';
}

// =============================================================================
// Proposal Data
// =============================================================================

export interface DataProposalData {
  reasoning?: string;
  operations: DataOperation[];
  research_log?: ResearchLogEntry[];
}

// =============================================================================
// Operation Execution State
// =============================================================================

export type OpStatus = 'pending' | 'running' | 'success' | 'error';

export interface OpResult {
  status: OpStatus;
  error?: string;
}
