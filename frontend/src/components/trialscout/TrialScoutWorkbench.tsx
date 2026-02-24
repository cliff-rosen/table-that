import { useState, useCallback } from 'react';
import { BeakerIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CanonicalClinicalTrial } from '../../types/canonical_types';
import { tablizerApi } from '../../lib/api/tablizerApi';
import { trackEvent } from '../../lib/api/trackingApi';
import TrialScoutTable from './TrialScoutTable';
import TrialScoutSearchForm from './TrialScoutSearchForm';

// Fetch limits - initial search is fast, AI processing gets more
const INITIAL_FETCH_LIMIT = 50;   // Initial trials to fetch (fast)
const AI_FETCH_LIMIT = 500;       // Max trials to fetch for AI processing

export default function TrialScoutWorkbench() {
    // Search form state
    const [condition, setCondition] = useState('');
    const [intervention, setIntervention] = useState('');
    const [sponsor, setSponsor] = useState('');
    const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
    const [selectedPhase, setSelectedPhase] = useState<string[]>([]);
    const [studyType, setStudyType] = useState('');
    const [location, setLocation] = useState('');

    // Results state
    const [trials, setTrials] = useState<CanonicalClinicalTrial[]>([]);
    const [totalResults, setTotalResults] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasSearched, setHasSearched] = useState(false);

    // AI fetch state - track if we've fetched the expanded set
    const [hasFetchedFullSet, setHasFetchedFullSet] = useState(false);
    const [fetchingMore, setFetchingMore] = useState(false);
    const [lastSearchParams, setLastSearchParams] = useState<{
        condition?: string;
        intervention?: string;
        sponsor?: string;
        status?: string[];
        phase?: string[];
        studyType?: string;
        location?: string;
    } | null>(null);

    // UI state
    const [showHelp, setShowHelp] = useState(false);

    // Handle search
    const handleSearch = async () => {
        if (!condition.trim() && !intervention.trim() && !sponsor.trim()) {
            setError('Please enter at least one search term (condition, intervention, or sponsor)');
            return;
        }

        setLoading(true);
        setError(null);

        // Save search params for potential expanded fetch later
        const searchParams = {
            condition: condition || undefined,
            intervention: intervention || undefined,
            sponsor: sponsor || undefined,
            status: selectedStatus.length > 0 ? selectedStatus : undefined,
            phase: selectedPhase.length > 0 ? selectedPhase : undefined,
            studyType: studyType || undefined,
            location: location || undefined,
        };
        setLastSearchParams(searchParams);
        setHasFetchedFullSet(false);

        try {
            const response = await tablizerApi.searchTrials({
                ...searchParams,
                max_results: INITIAL_FETCH_LIMIT
            });

            setTrials(response.trials);
            setTotalResults(response.total_results);
            setHasSearched(true);

            trackEvent('trialscout_search', {
                has_condition: !!condition,
                has_intervention: !!intervention,
                has_sponsor: !!sponsor,
                result_count: response.total_results
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Search failed');
        } finally {
            setLoading(false);
        }
    };

    // Fetch more trials for AI processing (up to 500)
    const fetchMoreForAI = useCallback(async (): Promise<CanonicalClinicalTrial[]> => {
        // If we already have the full set, return current trials
        if (hasFetchedFullSet || !lastSearchParams) {
            return trials;
        }

        setFetchingMore(true);
        try {
            const response = await tablizerApi.searchTrials({
                ...lastSearchParams,
                max_results: AI_FETCH_LIMIT
            });
            setTrials(response.trials);
            setHasFetchedFullSet(true);
            return response.trials;
        } catch (err) {
            console.error('Failed to fetch more trials:', err);
            return trials; // Return what we have on error
        } finally {
            setFetchingMore(false);
        }
    }, [hasFetchedFullSet, lastSearchParams, trials]);

    // Handle clear
    const handleClear = () => {
        setCondition('');
        setIntervention('');
        setSponsor('');
        setSelectedStatus([]);
        setSelectedPhase([]);
        setStudyType('');
        setLocation('');
        setTrials([]);
        setTotalResults(0);
        setHasSearched(false);
        setError(null);
        setHasFetchedFullSet(false);
        setLastSearchParams(null);
    };

    return (
        <div className="flex flex-col h-full gap-6">
            {/* Search Form */}
            <div className="flex-shrink-0">
                <TrialScoutSearchForm
                    condition={condition}
                    intervention={intervention}
                    sponsor={sponsor}
                    selectedStatus={selectedStatus}
                    selectedPhase={selectedPhase}
                    studyType={studyType}
                    location={location}
                    onConditionChange={setCondition}
                    onInterventionChange={setIntervention}
                    onSponsorChange={setSponsor}
                    onStatusChange={setSelectedStatus}
                    onPhaseChange={setSelectedPhase}
                    onStudyTypeChange={setStudyType}
                    onLocationChange={setLocation}
                    onSearch={handleSearch}
                    onClear={handleClear}
                    onHelpClick={() => {
                        setShowHelp(true);
                        trackEvent('trialscout_help_open', {});
                    }}
                    loading={loading}
                    showClearButton={hasSearched || !!condition || !!intervention || !!sponsor}
                    error={error}
                />
            </div>

            {/* Results */}
            {hasSearched && (
                <div className="flex-1 flex flex-col min-h-0">
                    {/* Results header */}
                    <div className="flex-shrink-0 mb-2 flex items-center gap-4">
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-gray-500 dark:text-gray-400">Total matches: </span>
                            <span className="font-medium text-gray-900 dark:text-white">{totalResults.toLocaleString()}</span>
                        </div>
                        <div className="text-sm text-gray-600 dark:text-gray-400">
                            <span className="text-gray-500 dark:text-gray-400">Fetched: </span>
                            <span className="font-medium text-gray-900 dark:text-white">{trials.length}</span>
                            {!hasFetchedFullSet && totalResults > trials.length && (
                                <span className="text-gray-400 dark:text-gray-500 ml-1">(up to {AI_FETCH_LIMIT} fetched for AI)</span>
                            )}
                        </div>
                        {fetchingMore && (
                            <span className="text-sm text-purple-600 dark:text-purple-400">
                                Fetching more for AI processing...
                            </span>
                        )}
                    </div>

                    {/* Results table with AI columns */}
                    {trials.length > 0 ? (
                        <div className="flex-1 min-h-0">
                            <TrialScoutTable
                                trials={trials}
                                onFetchMoreForAI={fetchMoreForAI}
                            />
                        </div>
                    ) : (
                        <div className="p-8 text-center text-gray-500 dark:text-gray-400 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            No trials found matching your search criteria.
                        </div>
                    )}
                </div>
            )}

            {/* Initial state */}
            {!hasSearched && (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center text-gray-500 dark:text-gray-400">
                    <BeakerIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Search ClinicalTrials.gov to explore clinical trials.</p>
                    <p className="text-sm mt-1">Filter by condition, intervention, sponsor, phase, and status.</p>
                </div>
            )}

            {/* Help Modal */}
            {showHelp && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div className="absolute inset-0 bg-black/50" onClick={() => setShowHelp(false)} />
                    <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">TrialScout Help</h2>
                            <button onClick={() => setShowHelp(false)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">What is TrialScout?</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm">
                                    TrialScout lets you search and explore clinical trials from ClinicalTrials.gov.
                                    Find trials by condition, intervention, sponsor, and more.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Search Tips</h3>
                                <ul className="text-gray-600 dark:text-gray-400 text-sm space-y-1 list-disc list-inside">
                                    <li>Enter at least one search term (condition, intervention, or sponsor)</li>
                                    <li>Use filters to narrow results by status, phase, or study type</li>
                                    <li>Click any row to see full trial details</li>
                                    <li>Export results to CSV for further analysis</li>
                                </ul>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">AI Columns</h3>
                                <p className="text-gray-600 dark:text-gray-400 text-sm mb-2">
                                    Add AI-powered columns to analyze trials with natural language prompts:
                                </p>
                                <ul className="text-gray-600 dark:text-gray-400 text-sm space-y-1 list-disc list-inside">
                                    <li>Click "Add AI Column" to create a new analysis column</li>
                                    <li>Use Yes/No output type to filter trials by criteria</li>
                                    <li>Quick filters appear for boolean columns</li>
                                    <li>Example: "Does this trial involve gene therapy?"</li>
                                </ul>
                                <p className="text-gray-500 dark:text-gray-500 text-xs mt-2 italic">
                                    Initial search fetches {INITIAL_FETCH_LIMIT} trials for fast display. When you add an AI column,
                                    up to {AI_FETCH_LIMIT} trials are automatically fetched for processing.
                                </p>
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900 dark:text-white mb-2">Status Meanings</h3>
                                <ul className="text-gray-600 dark:text-gray-400 text-sm space-y-1">
                                    <li><span className="font-medium">Recruiting:</span> Currently enrolling participants</li>
                                    <li><span className="font-medium">Active, Not Recruiting:</span> Ongoing but not enrolling</li>
                                    <li><span className="font-medium">Completed:</span> Study has ended</li>
                                    <li><span className="font-medium">Terminated:</span> Stopped early</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
