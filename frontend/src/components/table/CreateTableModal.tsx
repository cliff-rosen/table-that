import { useState } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ColumnDefinition } from '../../types/table';
import { generateColumnId } from '../../lib/utils/schemaOperations';
import { showErrorToast } from '../../lib/errorToast';
import SchemaEditor from './SchemaEditor';

interface CreateTableModalProps {
  onClose: () => void;
  onCreate: (data: {
    name: string;
    description?: string;
    columns: ColumnDefinition[];
  }) => Promise<void>;
}

export default function CreateTableModal({ onClose, onCreate }: CreateTableModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<ColumnDefinition[]>([
    { id: generateColumnId(), name: '', type: 'text', required: false },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) {
      showErrorToast('Table name is required.', 'Validation Error');
      return;
    }

    const validColumns = columns.filter((c) => c.name.trim());
    if (validColumns.length === 0) {
      showErrorToast(
        'Add at least one column with a name.',
        'Validation Error'
      );
      return;
    }

    setIsSubmitting(true);
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim() || undefined,
        columns: validColumns,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[600px] h-[500px] flex flex-col">
        {/* Header - fixed */}
        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Manual Table Builder
            </h2>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
          <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
              Honestly? You probably don't want to be here.
            </p>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              Defining columns by hand is very 2025. Close this and hit{' '}
              <span className="font-semibold">Ask AI</span>{' '}
              — just describe what you're building and the AI handles the rest.
            </p>
          </div>
        </div>

        {/* Content - scrollable */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4">
            {/* Table name */}
            <div>
              <label
                htmlFor="table-name"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Table Name <span className="text-red-500">*</span>
              </label>
              <input
                id="table-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Customer Feedback"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                autoFocus
              />
            </div>

            {/* Description */}
            <div>
              <label
                htmlFor="table-description"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Description
              </label>
              <input
                id="table-description"
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Schema editor */}
            <SchemaEditor columns={columns} onChange={setColumns} />
          </div>

          {/* Footer - fixed */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Table'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
