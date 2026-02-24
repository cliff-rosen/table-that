import { useMemo, useCallback } from 'react';
import { Tablizer, TableColumn, TableRow, RowViewerProps } from '../tools/Tablizer';
import TrialViewerModal from './TrialViewerModal';
import { CanonicalClinicalTrial } from '../../types/canonical_types';

// ============================================================================
// Types
// ============================================================================

export interface TrialScoutTableProps {
    trials: CanonicalClinicalTrial[];
    onFetchMoreForAI?: () => Promise<CanonicalClinicalTrial[]>;
}

// ============================================================================
// Column Definitions
// ============================================================================

// Standard columns for trials - all fields from CanonicalClinicalTrial
// Most are hidden by default, users can enable them via Columns dropdown
const TRIAL_COLUMNS: TableColumn[] = [
    // Core identification - visible by default
    { id: 'nct_id', label: 'NCT ID', accessor: 'nct_id', type: 'text', visible: true },
    { id: 'title', label: 'Title', accessor: 'title', type: 'text', visible: true },
    { id: 'status', label: 'Status', accessor: 'status', type: 'text', visible: true },
    { id: 'phase', label: 'Phase', accessor: 'phase', type: 'text', visible: true },
    { id: 'sponsor', label: 'Lead Sponsor', accessor: 'sponsor', type: 'text', visible: true },
    { id: 'enrollment', label: 'Enrollment', accessor: 'enrollment', type: 'number', visible: true },
    { id: 'start_date', label: 'Start Date', accessor: 'start_date', type: 'date', visible: true },

    // Study info - hidden by default
    { id: 'org_study_id', label: 'Org Study ID', accessor: 'org_study_id', type: 'text', visible: false },
    { id: 'study_type', label: 'Study Type', accessor: 'study_type', type: 'text', visible: false },
    { id: 'completion_date', label: 'Completion Date', accessor: 'completion_date', type: 'date', visible: false },
    { id: 'last_update_date', label: 'Last Updated', accessor: 'last_update_date', type: 'date', visible: false },
    { id: 'enrollment_type', label: 'Enrollment Type', accessor: 'enrollment_type', type: 'text', visible: false },

    // Study design
    { id: 'allocation', label: 'Allocation', accessor: 'allocation', type: 'text', visible: false },
    { id: 'intervention_model', label: 'Intervention Model', accessor: 'intervention_model', type: 'text', visible: false },
    { id: 'masking', label: 'Masking', accessor: 'masking', type: 'text', visible: false },
    { id: 'primary_purpose', label: 'Primary Purpose', accessor: 'primary_purpose', type: 'text', visible: false },

    // Conditions & interventions
    { id: 'conditions', label: 'Conditions', accessor: 'conditions', type: 'text', visible: false },
    { id: 'interventions', label: 'Interventions', accessor: 'interventions', type: 'text', visible: false },
    { id: 'primary_outcomes', label: 'Primary Outcomes', accessor: 'primary_outcomes', type: 'text', visible: false },
    { id: 'secondary_outcomes', label: 'Secondary Outcomes', accessor: 'secondary_outcomes', type: 'text', visible: false },

    // Eligibility
    { id: 'sex', label: 'Sex', accessor: 'sex', type: 'text', visible: false },
    { id: 'min_age', label: 'Min Age', accessor: 'min_age', type: 'text', visible: false },
    { id: 'max_age', label: 'Max Age', accessor: 'max_age', type: 'text', visible: false },
    { id: 'healthy_volunteers', label: 'Healthy Volunteers', accessor: 'healthy_volunteers', type: 'text', visible: false },

    // Sponsors
    { id: 'sponsor_type', label: 'Sponsor Type', accessor: 'sponsor_type', type: 'text', visible: false },
    { id: 'collaborators', label: 'Collaborators', accessor: 'collaborators', type: 'text', visible: false },

    // Locations
    { id: 'location_countries', label: 'Countries', accessor: 'location_countries', type: 'text', visible: false },
    { id: 'location_count', label: 'Site Count', accessor: 'location_count', type: 'number', visible: false },

    // Text content
    { id: 'brief_summary', label: 'Summary', accessor: 'brief_summary', type: 'text', visible: false },
    { id: 'keywords', label: 'Keywords', accessor: 'keywords', type: 'text', visible: false },
];

// ============================================================================
// Helper Functions
// ============================================================================

// Format status for display
function formatStatus(status: string): string {
    return status.split('_').map(word =>
        word.charAt(0) + word.slice(1).toLowerCase()
    ).join(' ');
}

// ============================================================================
// Adapter Components
// ============================================================================

// Trial data type with flattened fields for Tablizer
interface TrialRowData extends Record<string, unknown> {
    nct_id: string;
    title: string;
    status: string;
    phase: string;
    sponsor: string;
    enrollment: number;
    start_date: string;
    // ... other fields
}

// ============================================================================
// Main Component
// ============================================================================

export default function TrialScoutTable({
    trials,
    onFetchMoreForAI
}: TrialScoutTableProps) {
    // Convert trials to flat row data for Tablizer
    const trialData = useMemo((): TrialRowData[] =>
        trials.map((trial) => ({
            // Row ID
            nct_id: trial.nct_id,

            // Core identification
            org_study_id: trial.org_study_id || '',
            title: trial.brief_title || trial.title,

            // Status & dates
            status: trial.status,
            start_date: trial.start_date || '',
            completion_date: trial.completion_date || '',
            last_update_date: trial.last_update_date || '',

            // Study design
            study_type: trial.study_type || '',
            phase: trial.phase || 'N/A',
            allocation: trial.allocation || '',
            intervention_model: trial.intervention_model || '',
            masking: trial.masking || '',
            primary_purpose: trial.primary_purpose || '',

            // Enrollment
            enrollment: trial.enrollment_count || 0,
            enrollment_type: trial.enrollment_type || '',

            // Conditions & interventions (flattened to strings)
            conditions: trial.conditions.join(', '),
            interventions: trial.interventions.map(i => `${i.name} (${i.type})`).join('; '),
            primary_outcomes: trial.primary_outcomes.map(o => o.measure).join('; '),
            secondary_outcomes: trial.secondary_outcomes?.map(o => o.measure).join('; ') || '',

            // Eligibility
            sex: trial.sex || '',
            min_age: trial.min_age || '',
            max_age: trial.max_age || '',
            healthy_volunteers: trial.healthy_volunteers ? 'Yes' : trial.healthy_volunteers === false ? 'No' : '',

            // Sponsors
            sponsor: trial.lead_sponsor?.name || 'Unknown',
            sponsor_type: trial.lead_sponsor?.type || '',
            collaborators: trial.collaborators?.map(c => c.name).join(', ') || '',

            // Locations
            location_countries: trial.location_countries.join(', '),
            location_count: trial.locations.length,

            // Text content
            brief_summary: trial.brief_summary || '',
            keywords: trial.keywords.join(', '),

            // Link
            url: trial.url
        })),
        [trials]
    );

    // Custom cell renderer for status/phase formatting
    const renderCell = useCallback((row: TableRow, column: TableColumn) => {
        if (column.id === 'status') {
            const status = String(row.status);
            return (
                <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    status === 'RECRUITING' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    status === 'COMPLETED' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                    status === 'ACTIVE_NOT_RECRUITING' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                }`}>
                    {formatStatus(status)}
                </span>
            );
        }

        if (column.id === 'phase') {
            const phase = String(row.phase);
            return (
                <span className="text-gray-600 dark:text-gray-400">
                    {phase.replace('PHASE', 'Phase ').replace('NA', 'N/A')}
                </span>
            );
        }

        return null; // Use default rendering
    }, []);

    // Create a RowViewer that has access to original trials via closure
    const TrialViewer = useMemo(() => {
        return function TrialViewerWrapper({ data, initialIndex, onClose }: RowViewerProps<TrialRowData>) {
            // Map row data back to original trials
            const nctId = data[initialIndex]?.nct_id;
            const trialIndex = trials.findIndex(t => t.nct_id === nctId);
            return (
                <TrialViewerModal
                    trials={trials}
                    initialIndex={trialIndex >= 0 ? trialIndex : 0}
                    onClose={onClose}
                />
            );
        };
    }, [trials]);

    return (
        <Tablizer<TrialRowData>
            data={trialData}
            idField="nct_id"
            columns={TRIAL_COLUMNS}
            rowLabel="trials"
            RowViewer={TrialViewer}
            itemType="trial"
            originalData={trials as unknown as Record<string, unknown>[]}
            onFetchMoreForAI={onFetchMoreForAI ? async () => {
                const moreTrials = await onFetchMoreForAI();
                // Convert to row data format
                return moreTrials.map((trial) => ({
                    nct_id: trial.nct_id,
                    org_study_id: trial.org_study_id || '',
                    title: trial.brief_title || trial.title,
                    status: trial.status,
                    start_date: trial.start_date || '',
                    completion_date: trial.completion_date || '',
                    last_update_date: trial.last_update_date || '',
                    study_type: trial.study_type || '',
                    phase: trial.phase || 'N/A',
                    allocation: trial.allocation || '',
                    intervention_model: trial.intervention_model || '',
                    masking: trial.masking || '',
                    primary_purpose: trial.primary_purpose || '',
                    enrollment: trial.enrollment_count || 0,
                    enrollment_type: trial.enrollment_type || '',
                    conditions: trial.conditions.join(', '),
                    interventions: trial.interventions.map(i => `${i.name} (${i.type})`).join('; '),
                    primary_outcomes: trial.primary_outcomes.map(o => o.measure).join('; '),
                    secondary_outcomes: trial.secondary_outcomes?.map(o => o.measure).join('; ') || '',
                    sex: trial.sex || '',
                    min_age: trial.min_age || '',
                    max_age: trial.max_age || '',
                    healthy_volunteers: trial.healthy_volunteers ? 'Yes' : trial.healthy_volunteers === false ? 'No' : '',
                    sponsor: trial.lead_sponsor?.name || 'Unknown',
                    sponsor_type: trial.lead_sponsor?.type || '',
                    collaborators: trial.collaborators?.map(c => c.name).join(', ') || '',
                    location_countries: trial.location_countries.join(', '),
                    location_count: trial.locations.length,
                    brief_summary: trial.brief_summary || '',
                    keywords: trial.keywords.join(', '),
                    url: trial.url
                }));
            } : undefined}
            renderCell={renderCell}
        />
    );
}
