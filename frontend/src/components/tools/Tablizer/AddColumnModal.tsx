import { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, SparklesIcon, ClockIcon, ChevronDownIcon, ChevronRightIcon, InformationCircleIcon, EyeIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon } from '@heroicons/react/24/outline';

const RECENT_TEMPLATES_KEY = 'tablizer_recent_templates';
const MAX_RECENT_TEMPLATES = 10;
const INSTRUCTIONS_COLLAPSED_KEY = 'tablizer_instructions_collapsed';

// Example template shown when history has fewer than 5 items
const EXAMPLE_TEMPLATE: RecentTemplate = {
    name: 'Is Clinical Trial?',
    prompt: 'Based on the title and abstract, is this article describing a clinical trial study?\n\nTitle: {title}\n\nAbstract: {abstract}',
    outputType: 'boolean',
    timestamp: 0
};

interface RecentTemplate {
    name: string;
    prompt: string;
    outputType: 'text' | 'number' | 'boolean';
    timestamp: number;
}

interface AvailableColumn {
    id: string;
    label: string;
}

export interface ScoreConfig {
    minValue: number;
    maxValue: number;
    interval?: number;
}

interface AddColumnModalProps {
    availableColumns: AvailableColumn[];
    onAdd: (
        columnName: string,
        promptTemplate: string,
        inputColumns: string[],
        outputType: 'text' | 'number' | 'boolean',
        scoreConfig?: ScoreConfig
    ) => void;
    onClose: () => void;
    /** Optional sample row data for preview - when provided, shows hover preview of populated prompt */
    sampleRow?: Record<string, unknown>;
}

function loadRecentTemplates(): RecentTemplate[] {
    try {
        const stored = localStorage.getItem(RECENT_TEMPLATES_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch {
        return [];
    }
}

function saveRecentTemplate(template: RecentTemplate): boolean {
    try {
        const existing = loadRecentTemplates();
        // Check if this exact prompt already exists (skip if duplicate)
        if (existing.some(t => t.prompt.trim() === template.prompt.trim())) {
            return false; // Don't save duplicate
        }
        // Add new at front, limit to max
        const updated = [template, ...existing].slice(0, MAX_RECENT_TEMPLATES);
        localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(updated));
        return true;
    } catch {
        return false;
    }
}

function deleteRecentTemplate(prompt: string): RecentTemplate[] {
    try {
        const existing = loadRecentTemplates();
        const updated = existing.filter(t => t.prompt !== prompt);
        localStorage.setItem(RECENT_TEMPLATES_KEY, JSON.stringify(updated));
        return updated;
    } catch {
        return [];
    }
}

export default function AddColumnModal({ availableColumns, onAdd, onClose, sampleRow }: AddColumnModalProps) {
    const [columnName, setColumnName] = useState('');
    const [promptTemplate, setPromptTemplate] = useState('');
    const [outputType, setOutputType] = useState<'text' | 'number' | 'boolean'>('boolean');
    const [recentTemplates, setRecentTemplates] = useState<RecentTemplate[]>([]);
    const [showRecentDropdown, setShowRecentDropdown] = useState(false);
    const [showPreview, setShowPreview] = useState(false);
    const [instructionsCollapsed, setInstructionsCollapsed] = useState(() => {
        try {
            return localStorage.getItem(INSTRUCTIONS_COLLAPSED_KEY) === 'true';
        } catch {
            return false;
        }
    });
    const [isMaximized, setIsMaximized] = useState(false);
    // Score config (only used when outputType === 'number')
    const [scoreMin, setScoreMin] = useState(1);
    const [scoreMax, setScoreMax] = useState(10);
    const [scoreInterval, setScoreInterval] = useState<number | undefined>(1);

    useEffect(() => {
        const saved = loadRecentTemplates();
        // Add example template if fewer than 5 saved templates
        if (saved.length < 5) {
            setRecentTemplates([...saved, { ...EXAMPLE_TEMPLATE, name: '📋 Example: ' + EXAMPLE_TEMPLATE.name }]);
        } else {
            setRecentTemplates(saved);
        }
    }, []);

    // Save instructions collapsed preference
    const toggleInstructions = () => {
        const newValue = !instructionsCollapsed;
        setInstructionsCollapsed(newValue);
        try {
            localStorage.setItem(INSTRUCTIONS_COLLAPSED_KEY, String(newValue));
        } catch {
            // Ignore storage errors
        }
    };

    // Delete a template from history
    const handleDeleteTemplate = (e: React.MouseEvent, prompt: string) => {
        e.stopPropagation(); // Don't trigger the select
        const updated = deleteRecentTemplate(prompt);
        // Re-add example if fewer than 5 saved templates
        if (updated.length < 5) {
            setRecentTemplates([...updated, { ...EXAMPLE_TEMPLATE, name: '📋 Example: ' + EXAMPLE_TEMPLATE.name }]);
        } else {
            setRecentTemplates(updated);
        }
    };

    // Populate template with sample row data
    const populatedPrompt = useMemo(() => {
        if (!sampleRow || !promptTemplate) return promptTemplate;

        let result = promptTemplate;
        for (const [key, value] of Object.entries(sampleRow)) {
            if (value != null) {
                const stringValue = Array.isArray(value)
                    ? value.join(', ')
                    : String(value);
                // Truncate long values for preview
                const truncated = stringValue.length > 200
                    ? stringValue.substring(0, 200) + '...'
                    : stringValue;
                result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), truncated);
            }
        }
        return result;
    }, [promptTemplate, sampleRow]);

    // Extract which columns are used in the template
    const usedColumns = availableColumns
        .filter(col => promptTemplate.includes(`{${col.id}}`))
        .map(col => col.id);

    const handleInsertField = (columnId: string) => {
        setPromptTemplate(prev => prev + `{${columnId}}`);
    };

    const handleSelectRecentTemplate = (template: RecentTemplate) => {
        setColumnName(template.name);
        setPromptTemplate(template.prompt);
        setOutputType(template.outputType);
        setShowRecentDropdown(false);
    };

    const handleSubmit = () => {
        if (!columnName.trim() || !promptTemplate.trim()) return;

        // Save to recent templates
        saveRecentTemplate({
            name: columnName,
            prompt: promptTemplate,
            outputType,
            timestamp: Date.now()
        });

        // Build score config if using number/score type
        const scoreConfig = outputType === 'number' ? {
            minValue: scoreMin,
            maxValue: scoreMax,
            interval: scoreInterval
        } : undefined;

        onAdd(columnName, promptTemplate, usedColumns, outputType, scoreConfig);
    };

    const isValid = columnName.trim() && promptTemplate.trim();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className={`bg-white dark:bg-gray-800 shadow-2xl overflow-hidden flex flex-col transition-all duration-200 ${
                isMaximized
                    ? 'w-full h-full rounded-none'
                    : 'w-full max-w-4xl mx-4 max-h-[90vh] rounded-xl'
            }`}>
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="h-5 w-5 text-purple-500" />
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                            Add AI Column
                        </h3>
                    </div>
                    <div className="flex items-center gap-1">
                        <button
                            onClick={() => setIsMaximized(!isMaximized)}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title={isMaximized ? 'Restore' : 'Maximize'}
                        >
                            {isMaximized ? (
                                <ArrowsPointingInIcon className="h-5 w-5" />
                            ) : (
                                <ArrowsPointingOutIcon className="h-5 w-5" />
                            )}
                        </button>
                        <button
                            onClick={onClose}
                            className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                            title="Close"
                        >
                            <XMarkIcon className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* Body - Two Column Layout */}
                <div className="flex-1 overflow-hidden flex">
                    {/* Left Column - Main Form */}
                    <div className={`flex-1 overflow-y-auto p-6 ${isMaximized ? 'flex flex-col' : 'space-y-5'}`}>
                        {/* Instructions Box - Collapsible */}
                        <div className={`bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden ${isMaximized ? 'flex-shrink-0 mb-5' : ''}`}>
                            <button
                                type="button"
                                onClick={toggleInstructions}
                                className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                            >
                                {instructionsCollapsed ? (
                                    <ChevronRightIcon className="h-4 w-4 text-blue-500" />
                                ) : (
                                    <ChevronDownIcon className="h-4 w-4 text-blue-500" />
                                )}
                                <InformationCircleIcon className="h-5 w-5 text-blue-500" />
                                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                                    How to Create an AI Column
                                </span>
                            </button>
                            {!instructionsCollapsed && (
                                <div className="px-4 pb-4 pt-1">
                                    <ol className="list-decimal list-inside text-sm text-blue-700 dark:text-blue-300 space-y-1.5 ml-6">
                                        <li>Enter a brief <strong>column name</strong></li>
                                        <li>Choose the <strong>answer type</strong> — this determines how results are displayed and filtered</li>
                                        <li>Write your <strong>prompt</strong> and insert fields from the right panel as inputs</li>
                                        <li>Click <strong>Add Column</strong> — AI will analyze each row and populate values</li>
                                    </ol>
                                    <div className="mt-3 ml-6 space-y-1 text-xs text-blue-600 dark:text-blue-400">
                                        <p>💡 Yes/No columns automatically get quick filter buttons in the toolbar</p>
                                        <p>💡 Use the <strong>recent templates</strong> dropdown below to reuse a previous prompt</p>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Recent Templates Dropdown */}
                        {recentTemplates.length > 0 && (
                            <div className={`relative ${isMaximized ? 'flex-shrink-0 mb-5' : ''}`}>
                                <button
                                    type="button"
                                    onClick={() => setShowRecentDropdown(!showRecentDropdown)}
                                    className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                                >
                                    <ClockIcon className="h-4 w-4" />
                                    Use a recent template
                                    <ChevronDownIcon className={`h-4 w-4 transition-transform ${showRecentDropdown ? 'rotate-180' : ''}`} />
                                </button>

                                {showRecentDropdown && (
                                    <div className="absolute top-full left-0 mt-1 w-[28rem] bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg z-10 max-h-64 overflow-y-auto">
                                        {recentTemplates.map((template, idx) => {
                                            const isExample = template.timestamp === 0;
                                            return (
                                                <div
                                                    key={idx}
                                                    className="flex items-start border-b border-gray-100 dark:border-gray-600 last:border-0"
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => handleSelectRecentTemplate(template)}
                                                        className="flex-1 text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-600"
                                                    >
                                                        <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                                                            {template.name}
                                                        </div>
                                                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                                                            {template.prompt.substring(0, 60)}...
                                                        </div>
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                                                                template.outputType === 'boolean'
                                                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                                    : template.outputType === 'number'
                                                                    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                                    : 'bg-gray-100 text-gray-700 dark:bg-gray-600 dark:text-gray-300'
                                                            }`}>
                                                                {template.outputType === 'number' ? 'score' : template.outputType}
                                                            </span>
                                                        </div>
                                                    </button>
                                                    {!isExample && (
                                                        <button
                                                            type="button"
                                                            onClick={(e) => handleDeleteTemplate(e, template.prompt)}
                                                            className="p-3 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                                                            title="Remove from history"
                                                        >
                                                            <XMarkIcon className="h-4 w-4" />
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Column Name */}
                        <div className={isMaximized ? 'flex-shrink-0 mb-5' : ''}>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                Column Name
                            </label>
                            <input
                                type="text"
                                value={columnName}
                                onChange={(e) => setColumnName(e.target.value)}
                                placeholder="e.g., Is Clinical Trial, Study Design, Sample Size"
                                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        {/* Output Type */}
                        <div className={isMaximized ? 'flex-shrink-0 mb-5' : ''}>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                                What type of answer do you want?
                            </label>
                            <div className="grid grid-cols-3 gap-3">
                                <button
                                    type="button"
                                    onClick={() => setOutputType('boolean')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        outputType === 'boolean'
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                >
                                    <div className="font-medium text-sm text-gray-900 dark:text-white">Yes / No</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Binary questions</div>
                                    <div className="text-xs text-green-600 dark:text-green-400 mt-1 font-medium">
                                        ✓ Creates quick filter buttons
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOutputType('number')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        outputType === 'number'
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                >
                                    <div className="font-medium text-sm text-gray-900 dark:text-white">Score</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Rating on a scale</div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setOutputType('text')}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        outputType === 'text'
                                            ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                >
                                    <div className="font-medium text-sm text-gray-900 dark:text-white">Text</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Classifications, extractions</div>
                                </button>
                            </div>

                            {/* Score range configuration */}
                            {outputType === 'number' && (
                                <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                    <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
                                        Score Range
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-xs text-gray-500 dark:text-gray-400">Min</label>
                                            <input
                                                type="number"
                                                value={scoreMin}
                                                onChange={(e) => setScoreMin(Number(e.target.value))}
                                                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                        <span className="text-gray-400">—</span>
                                        <div className="flex items-center gap-1.5">
                                            <label className="text-xs text-gray-500 dark:text-gray-400">Max</label>
                                            <input
                                                type="number"
                                                value={scoreMax}
                                                onChange={(e) => setScoreMax(Number(e.target.value))}
                                                className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5 ml-2">
                                            <label className="text-xs text-gray-500 dark:text-gray-400">Step</label>
                                            <select
                                                value={scoreInterval ?? ''}
                                                onChange={(e) => setScoreInterval(e.target.value ? Number(e.target.value) : undefined)}
                                                className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                            >
                                                <option value="">Any</option>
                                                <option value="1">1</option>
                                                <option value="0.5">0.5</option>
                                                <option value="0.1">0.1</option>
                                            </select>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                                        AI will rate each item from {scoreMin} to {scoreMax}
                                        {scoreInterval ? ` in steps of ${scoreInterval}` : ''}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Prompt Template */}
                        <div className={isMaximized ? 'flex-1 flex flex-col min-h-0' : ''}>
                            <div className="flex items-center justify-between mb-1.5 flex-shrink-0">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Your Prompt
                                </label>

                                {/* Preview toggle - only show if we have sample data and a prompt */}
                                {sampleRow && promptTemplate && (
                                    <div
                                        onMouseEnter={() => setShowPreview(true)}
                                        onMouseLeave={() => setShowPreview(false)}
                                        className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 cursor-default select-none"
                                    >
                                        <EyeIcon className="h-3.5 w-3.5" />
                                        <span>Hover to preview</span>
                                    </div>
                                )}
                            </div>

                            {/* Textarea with preview overlay */}
                            <div className={`relative ${isMaximized ? 'flex-1 min-h-0' : ''}`}>
                                <textarea
                                    value={promptTemplate}
                                    onChange={(e) => setPromptTemplate(e.target.value)}
                                    placeholder={outputType === 'boolean'
                                        ? "Example: Is this article about a randomized controlled trial (RCT)?"
                                        : outputType === 'number'
                                        ? "Example: How relevant is this article to cardiovascular disease research? Consider methodology, findings, and clinical applicability."
                                        : "Example: What is the study design? Classify as: RCT, Cohort, Case-Control, Cross-sectional, Review, or Other."
                                    }
                                    rows={isMaximized ? undefined : 10}
                                    className={`w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm ${isMaximized ? 'h-full resize-none' : ''}`}
                                />

                                {/* Preview overlay - shows populated prompt with dimmed effect */}
                                {showPreview && sampleRow && populatedPrompt && (
                                    <div className="absolute inset-0 rounded-lg bg-purple-950/90 dark:bg-purple-950/95 border border-purple-500 overflow-auto pointer-events-none">
                                        <div className="px-4 py-3">
                                            <div className="text-purple-300 text-[10px] uppercase tracking-wide mb-2 font-medium">
                                                Preview with sample data
                                            </div>
                                            <div className="text-purple-100 text-sm whitespace-pre-wrap leading-relaxed">
                                                {populatedPrompt}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                                Click fields on the right to insert them into your prompt →
                            </p>
                        </div>

                        {/* Validation message */}
                        {promptTemplate && usedColumns.length === 0 && (
                            <p className={`text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 rounded-lg ${isMaximized ? 'flex-shrink-0 mt-3' : ''}`}>
                                💡 Tip: Insert at least one field (like title or abstract) so the AI has data to analyze.
                            </p>
                        )}
                    </div>

                    {/* Right Column - Available Fields */}
                    <div className="w-64 border-l border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-4 overflow-y-auto">
                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                            Available Fields
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                            Click to insert into your prompt. These will be replaced with actual values for each row.
                        </p>
                        <div className="space-y-2">
                            {availableColumns.map(col => (
                                <button
                                    key={col.id}
                                    type="button"
                                    onClick={() => handleInsertField(col.id)}
                                    className={`w-full text-left px-3 py-2 text-sm rounded-lg border transition-colors ${
                                        promptTemplate.includes(`{${col.id}}`)
                                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300'
                                            : 'bg-white dark:bg-gray-700 border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-600'
                                    }`}
                                >
                                    <div className="font-medium">{col.label}</div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                        {`{${col.id}}`}
                                    </div>
                                </button>
                            ))}
                        </div>

                        {/* Quick Insert All */}
                        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <button
                                type="button"
                                onClick={() => {
                                    const allFields = availableColumns
                                        .filter(col => ['title', 'abstract'].includes(col.id))
                                        .map(col => `${col.label}: {${col.id}}`)
                                        .join('\n');
                                    setPromptTemplate(prev => prev + (prev ? '\n\n' : '') + allFields);
                                }}
                                className="w-full px-3 py-2 text-sm rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors"
                            >
                                + Insert Title & Abstract
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSubmit}
                        disabled={!isValid}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        <SparklesIcon className="h-4 w-4" />
                        Add Column
                    </button>
                </div>
            </div>
        </div>
    );
}
