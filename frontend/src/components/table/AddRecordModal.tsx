import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ColumnDefinition } from '../../types/table';
import { getDefaultValue } from './DataTable';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';

// =============================================================================
// AddRecordModal
// =============================================================================

export interface AddRecordModalProps {
  columns: ColumnDefinition[];
  onSave: (data: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function AddRecordModal({ columns, onSave, onClose }: AddRecordModalProps) {
  const [formData, setFormData] = useState<Record<string, unknown>>(() => {
    const initial: Record<string, unknown> = {};
    for (const col of columns) {
      initial[col.id] = getDefaultValue(col);
    }
    return initial;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  const updateField = (columnId: string, value: unknown) => {
    setFormData((prev) => ({ ...prev, [columnId]: value }));
  };

  const renderInput = (col: ColumnDefinition) => {
    const value = formData[col.id];

    switch (col.type) {
      case 'boolean':
        return (
          <div className="flex items-center gap-2">
            <Checkbox
              id={`add-${col.id}`}
              checked={Boolean(value)}
              onCheckedChange={(checked) => updateField(col.id, checked)}
            />
            <Label htmlFor={`add-${col.id}`} className="text-sm text-gray-700 dark:text-gray-300">
              {value ? 'Yes' : 'No'}
            </Label>
          </div>
        );

      case 'select':
        return (
          <select
            id={`add-${col.id}`}
            value={String(value ?? '')}
            onChange={(e) => updateField(col.id, e.target.value)}
            className="flex h-10 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            <option value="">-- Select --</option>
            {col.options?.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );

      case 'number':
        return (
          <Input
            id={`add-${col.id}`}
            type="number"
            value={value === null || value === undefined ? '' : String(value)}
            onChange={(e) => updateField(col.id, e.target.value === '' ? null : Number(e.target.value))}
          />
        );

      case 'date':
        return (
          <Input
            id={`add-${col.id}`}
            type="date"
            value={String(value ?? '')}
            onChange={(e) => updateField(col.id, e.target.value)}
          />
        );

      default: // text
        return (
          <Input
            id={`add-${col.id}`}
            type="text"
            value={String(value ?? '')}
            onChange={(e) => updateField(col.id, e.target.value)}
            placeholder={`Enter ${col.name.toLowerCase()}`}
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] h-[500px] flex flex-col">
        {/* Header */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Add Record</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content - scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {columns.map((col) => (
              <div key={col.id} className="space-y-1.5">
                <Label htmlFor={`add-${col.id}`}>
                  {col.name}
                  {col.required && <span className="text-red-500 ml-1">*</span>}
                </Label>
                {renderInput(col)}
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit">
              Add Record
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
