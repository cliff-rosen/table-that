import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
    ArrowLeftIcon,
    ArrowRightIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    SparklesIcon,
    MagnifyingGlassIcon
} from '@heroicons/react/24/outline';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import { ResearchStream, Concept, SemanticSpace, InformationSource, BroadQuery } from '../types';
import { showErrorToast } from '../lib/errorToast';

// Import phase components
import ConceptProposalPhase from '../components/RetrievalWizard/ConceptProposalPhase';
import ConceptQueryPhase from '../components/RetrievalWizard/ConceptQueryPhase';
import ConceptFilterPhase from '../components/RetrievalWizard/ConceptFilterPhase';
import ConceptValidationPhase from '../components/RetrievalWizard/ConceptValidationPhase';
import BroadSearchPhase from '../components/RetrievalWizard/BroadSearchPhase';
import BroadFilterPhase from '../components/RetrievalWizard/BroadFilterPhase';

type RetrievalStrategy = 'concepts' | 'broad-search' | null;
type WizardPhase = 'strategy' | 'concepts' | 'broad-search' | 'broad-filter' | 'queries' | 'filters' | 'validation';

export default function RetrievalWizardPage() {
    const { streamId } = useParams<{ streamId: string }>();
    const navigate = useNavigate();

    // State
    const [stream, setStream] = useState<ResearchStream | null>(null);
    const [semanticSpace, setSemanticSpace] = useState<SemanticSpace | null>(null);
    const [strategy, setStrategy] = useState<RetrievalStrategy>(null);
    const [concepts, setConcepts] = useState<Concept[]>([]);
    const [broadQueries, setBroadQueries] = useState<BroadQuery[]>([]);
    const [sources, setSources] = useState<InformationSource[]>([]);
    const [currentPhase, setCurrentPhase] = useState<WizardPhase>('strategy');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Phase completion tracking
    const [phasesCompleted, setPhasesCompleted] = useState({
        strategy: false,
        concepts: false,
        'broad-search': false,
        'broad-filter': false,
        queries: false,
        filters: false,
        validation: false
    });
    const [validationReady, setValidationReady] = useState(false);

    // Load stream data
    useEffect(() => {
        loadStreamData();
        loadSources();
    }, [streamId]);

    const loadStreamData = async () => {
        try {
            setLoading(true);
            const streamData = await researchStreamApi.getResearchStream(Number(streamId));
            setStream(streamData);
            setSemanticSpace(streamData.semantic_space);

            // Detect existing strategy
            const hasConcepts = streamData.retrieval_config?.concepts && streamData.retrieval_config.concepts.length > 0;
            const hasBroadSearch = streamData.retrieval_config?.broad_search && streamData.retrieval_config.broad_search.queries.length > 0;

            if (hasBroadSearch) {
                setStrategy('broad-search');
                setBroadQueries(streamData.retrieval_config.broad_search?.queries || []);
                setPhasesCompleted(prev => ({ ...prev, strategy: true, 'broad-search': true }));
                setCurrentPhase('broad-search');
            } else if (hasConcepts) {
                setStrategy('concepts');
                const existingConcepts = streamData.retrieval_config?.concepts ?? [];
                setConcepts(existingConcepts);

                // Detect what's already configured and mark phases complete
                const newPhasesCompleted = {
                    strategy: true,
                    concepts: false,
                    'broad-search': false,
                    'broad-filter': false,
                    queries: false,
                    filters: false,
                    validation: false
                };

                // Phase 1: Concepts - complete if we have concepts with topics
                const hasValidConcepts = existingConcepts.length > 0 &&
                    existingConcepts.every(c => c.covered_topics && c.covered_topics.length > 0);
                if (hasValidConcepts) {
                    newPhasesCompleted.concepts = true;
                }

                // Phase 2: Queries - complete if concepts have queries configured
                const hasQueries = existingConcepts.some(c =>
                    c.source_queries && Object.keys(c.source_queries).length > 0
                );
                if (hasQueries) {
                    newPhasesCompleted.queries = true;
                }

                // Phase 3: Filters - complete if at least checked (not required to enable)
                const hasFilterConfig = existingConcepts.some(c =>
                    c.semantic_filter && (c.semantic_filter.enabled || c.semantic_filter.criteria)
                );
                if (hasFilterConfig || hasQueries) {
                    newPhasesCompleted.filters = true;
                }

                setPhasesCompleted(newPhasesCompleted);
                setCurrentPhase('concepts');
            } else {
                // No existing config - start with strategy selection
                setCurrentPhase('strategy');
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load stream');
        } finally {
            setLoading(false);
        }
    };

    const loadSources = async () => {
        try {
            const sourcesData = await researchStreamApi.getInformationSources();
            setSources(sourcesData);
        } catch (err) {
            showErrorToast(err, 'Failed to load sources');
        }
    };

    const handlePhaseComplete = (phase: WizardPhase, completed: boolean) => {
        setPhasesCompleted(prev => ({ ...prev, [phase]: completed }));
    };

    const canNavigateToPhase = (phase: WizardPhase): boolean => {
        switch (phase) {
            case 'strategy':
                return true;
            case 'concepts':
                return strategy === 'concepts' && phasesCompleted.strategy;
            case 'broad-search':
                return strategy === 'broad-search' && phasesCompleted.strategy;
            case 'broad-filter':
                return strategy === 'broad-search' && phasesCompleted['broad-search'] && broadQueries.length > 0;
            case 'queries':
                return strategy === 'concepts' && phasesCompleted.concepts && concepts.length > 0;
            case 'filters':
                return strategy === 'concepts' && phasesCompleted.concepts && concepts.length > 0;
            case 'validation':
                if (strategy === 'concepts') {
                    return phasesCompleted.concepts && concepts.length > 0;
                } else if (strategy === 'broad-search') {
                    return phasesCompleted['broad-search'] && broadQueries.length > 0;
                }
                return false;
            default:
                return false;
        }
    };

    const handleSaveAndFinalize = async () => {
        if (!streamId || !stream) return;

        try {
            setSaving(true);

            // Build retrieval config based on strategy
            let retrievalConfig;
            if (strategy === 'concepts') {
                retrievalConfig = {
                    concepts: concepts,
                    article_limit_per_week: stream.retrieval_config?.article_limit_per_week
                };
            } else if (strategy === 'broad-search') {
                retrievalConfig = {
                    concepts: [],
                    broad_search: {
                        queries: broadQueries,
                        strategy_rationale: '', // Already captured in phase
                        coverage_analysis: {}
                    },
                    article_limit_per_week: stream.retrieval_config?.article_limit_per_week
                };
            }

            // Update stream with new retrieval config
            await researchStreamApi.updateResearchStream(Number(streamId), {
                retrieval_config: retrievalConfig
            });

            // Navigate back to edit page
            navigate(`/streams/${streamId}/edit`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to save configuration');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="text-center">
                    <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    <p className="mt-4 text-gray-600 dark:text-gray-400">Loading wizard...</p>
                </div>
            </div>
        );
    }

    if (error || !stream || !semanticSpace) {
        return (
            <div className="max-w-7xl mx-auto px-4 py-8">
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error || 'Failed to load stream'}</p>
                </div>
            </div>
        );
    }

    // Dynamic phases based on selected strategy
    const getPhases = (): { key: WizardPhase; label: string; icon: typeof CheckCircleIcon }[] => {
        if (!strategy) {
            return [
                { key: 'strategy', label: 'Choose Strategy', icon: SparklesIcon }
            ];
        }

        if (strategy === 'broad-search') {
            return [
                { key: 'strategy', label: 'Strategy', icon: CheckCircleIcon },
                { key: 'broad-search', label: 'Generate Queries', icon: MagnifyingGlassIcon },
                { key: 'broad-filter', label: 'Configure Filters', icon: SparklesIcon },
                { key: 'validation', label: 'Finalize', icon: CheckCircleIcon }
            ];
        }

        // Concept-based flow
        return [
            { key: 'strategy', label: 'Strategy', icon: CheckCircleIcon },
            { key: 'concepts', label: 'Propose Concepts', icon: SparklesIcon },
            { key: 'queries', label: 'Configure Queries', icon: CheckCircleIcon },
            { key: 'filters', label: 'Configure Filters', icon: CheckCircleIcon },
            { key: 'validation', label: 'Validate & Finalize', icon: CheckCircleIcon }
        ];
    };

    const phases = getPhases();

    return (
        <>
            {/* Header */}
            <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <button
                                onClick={() => navigate(`/streams/${streamId}/edit`)}
                                type="button"
                                className="flex items-center gap-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 mb-2 transition-colors cursor-pointer"
                            >
                                <ArrowLeftIcon className="h-4 w-4" />
                                Back to Edit Stream
                            </button>
                            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                                Retrieval Configuration Wizard
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400 mt-1">
                                {stream.stream_name}
                            </p>
                        </div>
                    </div>

                    {/* Phase Progress */}
                    <div className="mt-8">
                        <nav aria-label="Progress">
                            <ol className="flex items-center justify-between">
                                {phases.map((phase, idx) => {
                                    const isActive = currentPhase === phase.key;
                                    const isCompleted = phasesCompleted[phase.key];
                                    const canNavigate = canNavigateToPhase(phase.key);
                                    const Icon = phase.icon;

                                    return (
                                        <li key={phase.key} className="relative flex-1">
                                            {/* Connector line */}
                                            {idx < phases.length - 1 && (
                                                <div
                                                    className={`absolute top-5 left-[50%] w-full h-0.5 ${isCompleted
                                                        ? 'bg-blue-600'
                                                        : 'bg-gray-300 dark:bg-gray-700'
                                                        }`}
                                                    style={{ left: 'calc(50% + 20px)' }}
                                                />
                                            )}

                                            <button
                                                onClick={() => canNavigate && setCurrentPhase(phase.key)}
                                                disabled={!canNavigate}
                                                className={`relative flex flex-col items-center group ${!canNavigate ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                                                    }`}
                                            >
                                                <span
                                                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${isActive
                                                        ? 'border-blue-600 bg-blue-600 text-white'
                                                        : isCompleted
                                                            ? 'border-blue-600 bg-blue-600 text-white'
                                                            : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                                                        }`}
                                                >
                                                    {isCompleted ? (
                                                        <CheckCircleIcon className="h-6 w-6" />
                                                    ) : (
                                                        <Icon className="h-5 w-5" />
                                                    )}
                                                </span>
                                                <span
                                                    className={`mt-2 text-xs font-medium ${isActive
                                                        ? 'text-blue-600 dark:text-blue-400'
                                                        : isCompleted
                                                            ? 'text-gray-900 dark:text-white'
                                                            : 'text-gray-500 dark:text-gray-400'
                                                        }`}
                                                >
                                                    {phase.label}
                                                </span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ol>
                        </nav>
                    </div>
                </div>
            </div>

            {/* Phase Content */}
            <div className="bg-gray-50 dark:bg-gray-900 pb-24">
                <div className="max-w-7xl mx-auto px-4 py-8">
                    {currentPhase === 'strategy' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">
                                    Choose Your Retrieval Strategy
                                </h2>
                                <p className="text-gray-600 dark:text-gray-400 mb-6">
                                    Select how you want to find and retrieve relevant literature for your research stream.
                                </p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {/* Concept-Based Strategy */}
                                    <button
                                        onClick={() => {
                                            setStrategy('concepts');
                                            handlePhaseComplete('strategy', true);
                                            setCurrentPhase('concepts');
                                        }}
                                        className="text-left p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                                    >
                                        <div className="flex items-start gap-4">
                                            <SparklesIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                                    Concept-Based Retrieval
                                                </h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                    Define specific entity-relationship patterns (concepts) for targeted, precise retrieval.
                                                </p>
                                                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                                    <li>• Multiple narrow, specific concepts</li>
                                                    <li>• Entity-relationship patterns</li>
                                                    <li>• Fine-grained semantic filtering</li>
                                                    <li>• Best for complex, nuanced domains</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </button>

                                    {/* Broad Search Strategy */}
                                    <button
                                        onClick={() => {
                                            setStrategy('broad-search');
                                            handlePhaseComplete('strategy', true);
                                            setCurrentPhase('broad-search');
                                        }}
                                        className="text-left p-6 border-2 border-gray-200 dark:border-gray-700 rounded-lg hover:border-green-500 dark:hover:border-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-all"
                                    >
                                        <div className="flex items-start gap-4">
                                            <MagnifyingGlassIcon className="h-8 w-8 text-green-600 dark:text-green-400 flex-shrink-0" />
                                            <div>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                                    Broad Search
                                                </h3>
                                                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                                                    Simple, wide-net queries (1-3) that capture everything with minimal complexity.
                                                </p>
                                                <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                                    <li>• 1-3 simple, general queries</li>
                                                    <li>• Cast a wide net</li>
                                                    <li>• Accept false positives</li>
                                                    <li>• Best for weekly monitoring</li>
                                                </ul>
                                            </div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentPhase === 'concepts' && semanticSpace && (
                        <ConceptProposalPhase
                            streamId={Number(streamId)}
                            semanticSpace={semanticSpace}
                            concepts={concepts}
                            onConceptsChange={setConcepts}
                            onComplete={(completed) => handlePhaseComplete('concepts', completed)}
                        />
                    )}

                    {currentPhase === 'broad-search' && semanticSpace && (
                        <BroadSearchPhase
                            streamId={Number(streamId)}
                            semanticSpace={semanticSpace}
                            queries={broadQueries}
                            onQueriesChange={setBroadQueries}
                            onComplete={(completed) => handlePhaseComplete('broad-search', completed)}
                        />
                    )}

                    {currentPhase === 'broad-filter' && (
                        <BroadFilterPhase
                            streamId={Number(streamId)}
                            queries={broadQueries}
                            onQueriesChange={setBroadQueries}
                            onComplete={(completed) => handlePhaseComplete('broad-filter', completed)}
                        />
                    )}

                    {currentPhase === 'queries' && (
                        <ConceptQueryPhase
                            streamId={Number(streamId)}
                            concepts={concepts}
                            sources={sources}
                            onConceptsChange={setConcepts}
                            onComplete={(completed) => handlePhaseComplete('queries', completed)}
                        />
                    )}

                    {currentPhase === 'filters' && (
                        <ConceptFilterPhase
                            streamId={Number(streamId)}
                            concepts={concepts}
                            onConceptsChange={setConcepts}
                            onComplete={(completed) => handlePhaseComplete('filters', completed)}
                        />
                    )}

                    {currentPhase === 'validation' && strategy === 'concepts' && (
                        <ConceptValidationPhase
                            streamId={Number(streamId)}
                            concepts={concepts}
                            onValidationReady={setValidationReady}
                        />
                    )}

                    {currentPhase === 'validation' && strategy === 'broad-search' && (
                        <div className="space-y-6">
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                <div className="flex items-start gap-4">
                                    <CheckCircleIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                                    <div>
                                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                                            Ready to Finalize
                                        </h2>
                                        <p className="text-gray-600 dark:text-gray-400">
                                            Your broad search strategy is configured with {broadQueries.length} {broadQueries.length === 1 ? 'query' : 'queries'}.
                                            Click "Finalize & Activate" to save your configuration.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Navigation Footer - Sticky */}
            <div className="sticky bottom-0 left-0 right-0 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-4 shadow-lg z-50">
                <div className="max-w-7xl mx-auto flex justify-between">
                    {/* Back Button */}
                    {currentPhase !== 'strategy' && currentPhase !== 'concepts' && currentPhase !== 'broad-search' ? (
                        <button
                            onClick={() => {
                                if (strategy === 'concepts') {
                                    if (currentPhase === 'queries') setCurrentPhase('concepts');
                                    else if (currentPhase === 'filters') setCurrentPhase('queries');
                                    else if (currentPhase === 'validation') setCurrentPhase('filters');
                                } else if (strategy === 'broad-search') {
                                    if (currentPhase === 'broad-filter') setCurrentPhase('broad-search');
                                    else if (currentPhase === 'validation') setCurrentPhase('broad-filter');
                                }
                            }}
                            className="inline-flex items-center gap-2 px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 font-medium"
                        >
                            <ArrowLeftIcon className="h-5 w-5" />
                            Back
                        </button>
                    ) : (
                        <div></div>
                    )}

                    {/* Forward/Complete Button */}
                    {currentPhase === 'validation' ? (
                        <button
                            onClick={handleSaveAndFinalize}
                            disabled={(strategy === 'concepts' && !validationReady) || saving}
                            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            {saving ? (
                                <>
                                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                    Saving Configuration...
                                </>
                            ) : (
                                <>
                                    <CheckCircleIcon className="h-5 w-5" />
                                    Finalize & Activate
                                </>
                            )}
                        </button>
                    ) : currentPhase !== 'strategy' ? (
                        <button
                            onClick={() => {
                                if (strategy === 'concepts') {
                                    if (currentPhase === 'concepts') setCurrentPhase('queries');
                                    else if (currentPhase === 'queries') setCurrentPhase('filters');
                                    else if (currentPhase === 'filters') setCurrentPhase('validation');
                                } else if (strategy === 'broad-search') {
                                    if (currentPhase === 'broad-search') setCurrentPhase('broad-filter');
                                    else if (currentPhase === 'broad-filter') setCurrentPhase('validation');
                                }
                            }}
                            disabled={
                                (currentPhase === 'concepts' && concepts.length === 0) ||
                                (currentPhase === 'broad-search' && broadQueries.length === 0)
                            }
                            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                        >
                            Continue
                            <ArrowRightIcon className="h-5 w-5" />
                        </button>
                    ) : null}
                </div>
            </div>
        </>
    );
}
