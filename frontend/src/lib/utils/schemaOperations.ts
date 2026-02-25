/**
 * Shared schema operations utility
 *
 * Single source of truth for schema proposal types and the logic
 * to apply schema operations to a column list.
 */

import type { ColumnDefinition, ColumnType } from '../../types/table';

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

export interface SchemaOperation {
  action: 'add' | 'modify' | 'remove' | 'reorder';
  column?: ColumnDef;
  column_id?: string;
  after_column_id?: string;
  changes?: Partial<ColumnDef>;
}

export interface SchemaProposalData {
  mode: 'create' | 'update';
  reasoning?: string;
  table_name?: string;
  table_description?: string;
  operations: SchemaOperation[];
}

// =============================================================================
// Helpers
// =============================================================================

/** Generate a unique column ID (col_xxxxxxxx). */
export function generateColumnId(): string {
  return `col_${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Build a map from column ID to column name for display purposes.
 */
export function buildColumnNameMap(columns: ColumnDefinition[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const col of columns) {
    map.set(col.id, col.name);
  }
  return map;
}

/**
 * Apply a list of schema operations to an existing column array,
 * returning the new column array. Works for both create (empty start)
 * and update (existing columns) flows.
 */
export function applySchemaOperations(
  existingColumns: ColumnDefinition[],
  operations: SchemaOperation[],
): ColumnDefinition[] {
  let columns = [...existingColumns];

  for (const op of operations) {
    switch (op.action) {
      case 'add': {
        if (!op.column) break;
        const newCol: ColumnDefinition = {
          id: generateColumnId(),
          name: op.column.name,
          type: (op.column.type as ColumnType) || 'text',
          required: op.column.required || false,
          ...(op.column.options ? { options: op.column.options } : {}),
          ...(op.column.filterDisplay
            ? { filterDisplay: op.column.filterDisplay as 'tab' | 'dropdown' }
            : {}),
        };

        if (op.after_column_id) {
          const afterIdx = columns.findIndex((c) => c.id === op.after_column_id);
          if (afterIdx >= 0) {
            columns.splice(afterIdx + 1, 0, newCol);
          } else {
            columns.push(newCol);
          }
        } else {
          columns.push(newCol);
        }
        break;
      }

      case 'modify': {
        if (!op.column_id || !op.changes) break;
        const idx = columns.findIndex((c) => c.id === op.column_id);
        if (idx >= 0) {
          // Strip null values so they don't overwrite existing values
          const cleanChanges = Object.fromEntries(
            Object.entries(op.changes).filter(([, v]) => v !== null),
          );
          columns[idx] = { ...columns[idx], ...cleanChanges };
        }
        break;
      }

      case 'remove': {
        if (!op.column_id) break;
        columns = columns.filter((c) => c.id !== op.column_id);
        break;
      }

      case 'reorder': {
        if (!op.column_id) break;
        const colIdx = columns.findIndex((c) => c.id === op.column_id);
        if (colIdx >= 0) {
          const [col] = columns.splice(colIdx, 1);
          if (op.after_column_id) {
            const afterIdx = columns.findIndex((c) => c.id === op.after_column_id);
            columns.splice(afterIdx + 1, 0, col);
          } else {
            columns.unshift(col);
          }
        }
        break;
      }
    }
  }

  return columns;
}
