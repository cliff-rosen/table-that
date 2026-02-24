import { useState, useRef } from 'react';
import { XMarkIcon, ArrowUpTrayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { showErrorToast, showSuccessToast } from '../../lib/errorToast';
import { importCsv, importWithSchema } from '../../lib/api/tableApi';

interface ImportModalProps {
  /** If provided, import into this existing table. Otherwise create a new table from CSV. */
  tableId?: number;
  onClose: () => void;
  onImported: (result: { imported: number; tableId?: number }) => void;
}

export default function ImportModal({ tableId, onClose, onImported }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [tableName, setTableName] = useState('');
  const [tableDescription, setTableDescription] = useState('');
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState<string[][] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isNewTable = !tableId;

  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);

    // Auto-set table name from file name (for new tables)
    if (isNewTable && !tableName) {
      const name = selectedFile.name.replace(/\.csv$/i, '').replace(/[_-]/g, ' ');
      setTableName(name);
    }

    // Parse preview (first 5 rows)
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;
      const lines = text.split('\n').filter((l) => l.trim());
      const rows = lines.slice(0, 6).map((line) => {
        // Simple CSV parse (handles basic cases)
        const result: string[] = [];
        let current = '';
        let inQuotes = false;
        for (const char of line) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        result.push(current.trim());
        return result;
      });
      setPreview(rows);
    };
    reader.readAsText(selectedFile);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.name.toLowerCase().endsWith('.csv')) {
      handleFileSelect(droppedFile);
    } else {
      showErrorToast('Please drop a CSV file');
    }
  };

  const handleImport = async () => {
    if (!file) return;

    if (isNewTable && !tableName.trim()) {
      showErrorToast('Please enter a table name');
      return;
    }

    setImporting(true);
    try {
      if (isNewTable) {
        const table = await importWithSchema(
          file,
          tableName.trim(),
          tableDescription.trim() || undefined
        );
        showSuccessToast(`Created table "${table.name}" with ${table.row_count ?? 0} rows`);
        onImported({ imported: table.row_count ?? 0, tableId: table.id });
      } else {
        const result = await importCsv(tableId!, file);
        showSuccessToast(`Imported ${result.imported} rows`);
        onImported({ imported: result.imported });
      }
    } catch (err) {
      showErrorToast(err, 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[700px] h-[calc(100vh-4rem)] max-h-[600px] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isNewTable ? 'Import CSV as New Table' : 'Import CSV'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* File drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${file
                ? 'border-green-300 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10'
              }
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFileSelect(f);
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <DocumentTextIcon className="h-8 w-8 text-green-500" />
                <div className="text-left">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{file.name}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {(file.size / 1024).toFixed(1)} KB - Click to change
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <ArrowUpTrayIcon className="h-8 w-8 text-gray-400" />
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Drop a CSV file here, or click to browse
                </p>
              </div>
            )}
          </div>

          {/* Table name/description (for new table) */}
          {isNewTable && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="import-table-name">
                  Table Name <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="import-table-name"
                  value={tableName}
                  onChange={(e) => setTableName(e.target.value)}
                  placeholder="Enter table name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="import-table-desc">Description (optional)</Label>
                <Input
                  id="import-table-desc"
                  value={tableDescription}
                  onChange={(e) => setTableDescription(e.target.value)}
                  placeholder="Brief description of this table"
                />
              </div>
            </div>
          )}

          {/* Preview */}
          {preview && preview.length > 0 && (
            <div className="space-y-2">
              <Label>Preview (first {Math.min(preview.length - 1, 5)} rows)</Label>
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-auto max-h-48">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-800">
                      {preview[0].map((header, i) => (
                        <th
                          key={i}
                          className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 whitespace-nowrap border-b border-gray-200 dark:border-gray-700"
                        >
                          {header || `Column ${i + 1}`}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
                    {preview.slice(1).map((row, rowIdx) => (
                      <tr key={rowIdx}>
                        {row.map((cell, cellIdx) => (
                          <td
                            key={cellIdx}
                            className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[200px] truncate"
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={!file || importing || (isNewTable && !tableName.trim())}
            className="gap-1.5"
          >
            {importing ? (
              <>
                <div className="h-4 w-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Importing...
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className="h-4 w-4" />
                {isNewTable ? 'Create Table & Import' : 'Import'}
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
