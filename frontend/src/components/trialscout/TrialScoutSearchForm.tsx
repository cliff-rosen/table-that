import {
    PlayIcon,
    BeakerIcon,
    TrashIcon,
    QuestionMarkCircleIcon
} from '@heroicons/react/24/outline';
import { trackEvent } from '../../lib/api/trackingApi';

// Status options for filter
const STATUS_OPTIONS = [
    { value: 'RECRUITING', label: 'Recruiting' },
    { value: 'NOT_YET_RECRUITING', label: 'Not Yet Recruiting' },
    { value: 'ACTIVE_NOT_RECRUITING', label: 'Active, Not Recruiting' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'TERMINATED', label: 'Terminated' },
    { value: 'WITHDRAWN', label: 'Withdrawn' },
    { value: 'SUSPENDED', label: 'Suspended' },
];

// Phase options for filter
const PHASE_OPTIONS = [
    { value: 'EARLY_PHASE1', label: 'Early Phase 1' },
    { value: 'PHASE1', label: 'Phase 1' },
    { value: 'PHASE2', label: 'Phase 2' },
    { value: 'PHASE3', label: 'Phase 3' },
    { value: 'PHASE4', label: 'Phase 4' },
    { value: 'NA', label: 'Not Applicable' },
];

// Study type options
const STUDY_TYPE_OPTIONS = [
    { value: '', label: 'Any' },
    { value: 'INTERVENTIONAL', label: 'Interventional' },
    { value: 'OBSERVATIONAL', label: 'Observational' },
];

export interface TrialScoutSearchFormProps {
    // Form values
    condition: string;
    intervention: string;
    sponsor: string;
    selectedStatus: string[];
    selectedPhase: string[];
    studyType: string;
    location: string;

    // Change handlers
    onConditionChange: (value: string) => void;
    onInterventionChange: (value: string) => void;
    onSponsorChange: (value: string) => void;
    onStatusChange: (values: string[]) => void;
    onPhaseChange: (values: string[]) => void;
    onStudyTypeChange: (value: string) => void;
    onLocationChange: (value: string) => void;

    // Actions
    onSearch: () => void;
    onClear: () => void;
    onHelpClick: () => void;

    // State
    loading: boolean;
    showClearButton: boolean;
    error?: string | null;
}

export default function TrialScoutSearchForm({
    condition,
    intervention,
    sponsor,
    selectedStatus,
    selectedPhase,
    studyType,
    location,
    onConditionChange,
    onInterventionChange,
    onSponsorChange,
    onStatusChange,
    onPhaseChange,
    onStudyTypeChange,
    onLocationChange,
    onSearch,
    onClear,
    onHelpClick,
    loading,
    showClearButton,
    error
}: TrialScoutSearchFormProps) {

    // Toggle multi-select options
    const toggleOption = (value: string, selected: string[], onChange: (v: string[]) => void) => {
        if (selected.includes(value)) {
            onChange(selected.filter(v => v !== value));
        } else {
            onChange([...selected, value]);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            onSearch();
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <BeakerIcon className="h-5 w-5 text-purple-500" />
                    Search Clinical Trials
                </h3>
                <button
                    onClick={onHelpClick}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                >
                    <QuestionMarkCircleIcon className="h-5 w-5" />
                    Help
                </button>
            </div>

            <div className="space-y-4">
                {/* Main search fields */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Condition / Disease
                        </label>
                        <input
                            type="text"
                            value={condition}
                            onChange={(e) => onConditionChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g., diabetes, lung cancer"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Intervention / Treatment
                        </label>
                        <input
                            type="text"
                            value={intervention}
                            onChange={(e) => onInterventionChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g., pembrolizumab, immunotherapy"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Sponsor
                        </label>
                        <input
                            type="text"
                            value={sponsor}
                            onChange={(e) => onSponsorChange(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g., Pfizer, NIH"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                        />
                    </div>
                </div>

                {/* Filters row */}
                <div className="flex flex-wrap items-end gap-4">
                    {/* Status multi-select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Status
                        </label>
                        <div className="flex flex-wrap gap-1">
                            {STATUS_OPTIONS.slice(0, 4).map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleOption(opt.value, selectedStatus, onStatusChange)}
                                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                                        selectedStatus.includes(opt.value)
                                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-500 text-purple-700 dark:text-purple-300'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Phase multi-select */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Phase
                        </label>
                        <div className="flex flex-wrap gap-1">
                            {PHASE_OPTIONS.filter(p => ['PHASE1', 'PHASE2', 'PHASE3', 'PHASE4'].includes(p.value)).map(opt => (
                                <button
                                    key={opt.value}
                                    type="button"
                                    onClick={() => toggleOption(opt.value, selectedPhase, onPhaseChange)}
                                    className={`px-2 py-1 text-xs rounded border transition-colors ${
                                        selectedPhase.includes(opt.value)
                                            ? 'bg-purple-100 dark:bg-purple-900/30 border-purple-500 text-purple-700 dark:text-purple-300'
                                            : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Study type */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Study Type
                        </label>
                        <select
                            value={studyType}
                            onChange={(e) => onStudyTypeChange(e.target.value)}
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            {STUDY_TYPE_OPTIONS.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* Location */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Country
                        </label>
                        <input
                            type="text"
                            value={location}
                            onChange={(e) => onLocationChange(e.target.value)}
                            placeholder="e.g., United States"
                            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 w-40"
                        />
                    </div>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Search + Clear buttons */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onSearch}
                            disabled={loading}
                            className="px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        >
                            {loading ? (
                                <>
                                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                    </svg>
                                    Searching...
                                </>
                            ) : (
                                <>
                                    <PlayIcon className="h-4 w-4" />
                                    Search
                                </>
                            )}
                        </button>
                        {showClearButton && (
                            <button
                                onClick={onClear}
                                className="px-3 py-2 text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 border border-gray-300 dark:border-gray-600 rounded-md hover:border-red-300 dark:hover:border-red-600 flex items-center gap-1.5"
                            >
                                <TrashIcon className="h-4 w-4" />
                                Clear
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-red-700 dark:text-red-300 text-sm">
                    {error}
                </div>
            )}
        </div>
    );
}
