import { ArrowPathIcon, DocumentMagnifyingGlassIcon } from '@heroicons/react/24/outline';

interface DocumentInputProps {
    documentText: string;
    documentTitle: string;
    onTextChange: (text: string) => void;
    onTitleChange: (title: string) => void;
    onAnalyze: () => void;
    isAnalyzing: boolean;
    error: string | null;
}

export function DocumentInput({
    documentText,
    documentTitle,
    onTextChange,
    onTitleChange,
    onAnalyze,
    isAnalyzing,
    error
}: DocumentInputProps) {
    const charCount = documentText.length;
    const isValid = charCount >= 50;

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Document Title <span className="text-gray-400">(optional)</span>
                </label>
                <input
                    type="text"
                    value={documentTitle}
                    onChange={(e) => onTitleChange(e.target.value)}
                    placeholder="Enter document title..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
                />
            </div>

            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Document Text *
                </label>
                <textarea
                    value={documentText}
                    onChange={(e) => onTextChange(e.target.value)}
                    placeholder="Paste your document text here for analysis..."
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white font-mono text-sm"
                    rows={12}
                />
                <div className="mt-1 flex justify-between">
                    <p className={`text-xs ${isValid ? 'text-gray-500 dark:text-gray-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        {charCount} characters {!isValid && `(minimum 50 required)`}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        Plain text supported
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-3">
                <button
                    onClick={onAnalyze}
                    disabled={isAnalyzing || !isValid}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                >
                    {isAnalyzing ? (
                        <>
                            <ArrowPathIcon className="h-5 w-5 animate-spin" />
                            Analyzing...
                        </>
                    ) : (
                        <>
                            <DocumentMagnifyingGlassIcon className="h-5 w-5" />
                            Analyze Document
                        </>
                    )}
                </button>
            </div>

            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-red-800 dark:text-red-200 text-sm">{error}</p>
                </div>
            )}
        </div>
    );
}
