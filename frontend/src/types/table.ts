/**
 * Table and Row types for table.that
 */

export type ColumnType = 'text' | 'number' | 'date' | 'boolean' | 'select';

export interface ColumnDefinition {
  id: string;        // Stable ID like "col_xxx"
  name: string;      // Display name
  type: ColumnType;
  required: boolean;
  default?: unknown;
  options?: string[]; // For select type
  filterDisplay?: 'tab' | 'dropdown'; // 'tab' for inline filter buttons, 'dropdown' (default) for dropdown chip
}

export interface TableDefinition {
  id: number;
  user_id: number;
  name: string;
  description?: string;
  columns: ColumnDefinition[];
  row_count?: number;
  created_at: string;
  updated_at: string;
}

export interface TableListItem {
  id: number;
  name: string;
  description?: string;
  column_count: number;
  row_count: number;
  created_at: string;
  updated_at: string;
}

export interface TableRow {
  id: number;
  table_id: number;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RowsListResponse {
  rows: TableRow[];
  total: number;
  offset: number;
  limit: number;
}

export interface FilterState {
  column_id: string;
  operator: string;
  value: unknown;
}

export interface SortState {
  column_id: string;
  direction: 'asc' | 'desc';
}
