import { PlusIcon, XMarkIcon } from '@heroicons/react/24/outline';
import type { ColumnDefinition, ColumnType } from '../../types/table';
import { generateColumnId } from '../../types/schemaProposal';

const COLUMN_TYPES: { value: ColumnType; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'select', label: 'Select' },
];

interface SchemaEditorProps {
  columns: ColumnDefinition[];
  onChange: (columns: ColumnDefinition[]) => void;
}

export default function SchemaEditor({ columns, onChange }: SchemaEditorProps) {
  function handleAddColumn() {
    onChange([
      ...columns,
      {
        id: generateColumnId(),
        name: '',
        type: 'text',
        required: false,
      },
    ]);
  }

  function handleRemoveColumn(index: number) {
    onChange(columns.filter((_, i) => i !== index));
  }

  function handleColumnNameChange(index: number, name: string) {
    const updated = [...columns];
    updated[index] = { ...updated[index], name };
    onChange(updated);
  }

  function handleColumnTypeChange(index: number, type: ColumnType) {
    const updated = [...columns];
    updated[index] = { ...updated[index], type };
    onChange(updated);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Columns
        </label>
        <button
          type="button"
          onClick={handleAddColumn}
          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
        >
          <PlusIcon className="h-4 w-4" />
          Add Column
        </button>
      </div>

      {columns.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 italic py-2">
          No columns yet. Add at least one column to define your table schema.
        </p>
      )}

      <div className="space-y-2">
        {columns.map((col, index) => (
          <div key={col.id} className="flex items-center gap-2">
            <input
              type="text"
              value={col.name}
              onChange={(e) => handleColumnNameChange(index, e.target.value)}
              placeholder="Column name"
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={col.type}
              onChange={(e) =>
                handleColumnTypeChange(index, e.target.value as ColumnType)
              }
              className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {COLUMN_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleRemoveColumn(index)}
              className="p-1 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 rounded"
              title="Remove column"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
