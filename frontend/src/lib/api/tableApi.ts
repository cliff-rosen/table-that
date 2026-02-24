/**
 * Table API client for CRUD operations on tables and rows.
 */

import api from './index';
import type {
  TableDefinition,
  TableListItem,
  TableRow,
  RowsListResponse,
  ColumnDefinition,
} from '../../types/table';

// =============================================================================
// Table CRUD
// =============================================================================

export async function listTables(): Promise<TableListItem[]> {
  const response = await api.get('/api/tables');
  return response.data;
}

export async function createTable(data: {
  name: string;
  description?: string;
  columns: ColumnDefinition[];
}): Promise<TableDefinition> {
  const response = await api.post('/api/tables', data);
  return response.data;
}

export async function getTable(tableId: number): Promise<TableDefinition> {
  const response = await api.get(`/api/tables/${tableId}`);
  return response.data;
}

export async function updateTable(
  tableId: number,
  data: {
    name?: string;
    description?: string;
    columns?: ColumnDefinition[];
  }
): Promise<TableDefinition> {
  const response = await api.put(`/api/tables/${tableId}`, data);
  return response.data;
}

export async function deleteTable(tableId: number): Promise<void> {
  await api.delete(`/api/tables/${tableId}`);
}

// =============================================================================
// Row CRUD
// =============================================================================

export async function listRows(
  tableId: number,
  params?: {
    offset?: number;
    limit?: number;
    sort_column?: string;
    sort_direction?: 'asc' | 'desc';
  }
): Promise<RowsListResponse> {
  const response = await api.get(`/api/tables/${tableId}/rows`, { params });
  return response.data;
}

export async function createRow(
  tableId: number,
  data: Record<string, unknown>
): Promise<TableRow> {
  const response = await api.post(`/api/tables/${tableId}/rows`, { data });
  return response.data;
}

export async function getRow(
  tableId: number,
  rowId: number
): Promise<TableRow> {
  const response = await api.get(`/api/tables/${tableId}/rows/${rowId}`);
  return response.data;
}

export async function updateRow(
  tableId: number,
  rowId: number,
  data: Record<string, unknown>
): Promise<TableRow> {
  const response = await api.put(`/api/tables/${tableId}/rows/${rowId}`, { data });
  return response.data;
}

export async function deleteRow(
  tableId: number,
  rowId: number
): Promise<void> {
  await api.delete(`/api/tables/${tableId}/rows/${rowId}`);
}

export async function bulkDeleteRows(
  tableId: number,
  rowIds: number[]
): Promise<{ ok: boolean; deleted: number }> {
  const response = await api.post(`/api/tables/${tableId}/rows/bulk-delete`, {
    row_ids: rowIds,
  });
  return response.data;
}

export async function searchRows(
  tableId: number,
  query: string,
  limit?: number
): Promise<TableRow[]> {
  const response = await api.post(`/api/tables/${tableId}/rows/search`, {
    query,
    limit: limit || 50,
  });
  return response.data;
}

// =============================================================================
// Import / Export
// =============================================================================

export async function importCsv(
  tableId: number,
  file: File
): Promise<{ ok: boolean; imported: number }> {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post(`/api/tables/${tableId}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function importWithSchema(
  file: File,
  tableName: string,
  tableDescription?: string
): Promise<TableDefinition> {
  const formData = new FormData();
  formData.append('file', file);
  const params = new URLSearchParams({ table_name: tableName });
  if (tableDescription) {
    params.set('table_description', tableDescription);
  }
  const response = await api.post(
    `/api/tables/import-with-schema?${params.toString()}`,
    formData,
    { headers: { 'Content-Type': 'multipart/form-data' } }
  );
  return response.data;
}

export function getExportUrl(tableId: number): string {
  return `/api/tables/${tableId}/export`;
}

export async function exportTableCsv(tableId: number): Promise<Blob> {
  const response = await api.get(`/api/tables/${tableId}/export`, {
    responseType: 'blob',
  });
  return response.data;
}
