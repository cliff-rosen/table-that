import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    BeakerIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ChevronLeftIcon,
    PlayIcon,
    ArrowPathIcon,
    PlusIcon,
    XMarkIcon,
    CheckCircleIcon,
    XCircleIcon,
    FunnelIcon,
    TagIcon,
    DocumentTextIcon,
    ArrowDownIcon,
    ClockIcon,
    ArrowsRightLeftIcon,
    ChevronDoubleRightIcon,
    ChevronDoubleLeftIcon,
    ClipboardDocumentIcon,
    DocumentArrowDownIcon,
    TrashIcon
} from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { retrievalTestingApi } from '../../lib/api/retrievalTestingApi';
import { promptTestingApi } from '../../lib/api/promptTestingApi';
import { ResearchStream } from '../../types';
import { CanonicalResearchArticle } from '../../types/canonical_types';
import { copyToClipboard } from '../../lib/utils/clipboard';
import ArticleViewerModal from '../articles/ArticleViewerModal';

// ============================================================================
// Query Snapshot Types for Version History
// ============================================================================

export interface QuerySnapshot {
    id: string;
    timestamp: Date;
    stepType: 'source' | 'filter' | 'categorize';
    // Source step info
    queryExpression?: string;
    queryIndex?: number;
    startDate?: string;
    endDate?: string;
    // Filter step info
    filterCriteria?: string;
    filterThreshold?: number;
    // Results - sample for display
    articles: CanonicalResearchArticle[];
    articleCount: number;           // Number of articles in sample (returned)
    totalCount: number;             // Total matching articles (from query)
    allMatchedPmids: string[];      // ALL PMIDs matching the query (for comparison)
    // For filter results
    passedCount?: number;
    failedCount?: number;
    // Optional user label
    label?: string;
}

// Exported state interface for parent components to consume
export interface WorkbenchState {
    focused_step_type: 'source' | 'filter' | 'categorize';
    current_query?: {
        query_index: number;
        expression: string;
        is_modified: boolean;
        covered_topics?: string[];
    };
    current_filter?: {
        criteria: string;
        threshold: number;
        is_modified: boolean;
    };
    test_results?: {
        step_type: 'source' | 'filter' | 'categorize';
        article_count: number;
        total_available?: number;
        passed_count?: number;
        failed_count?: number;
    };
    result_view: 'raw' | 'compare' | 'analyze';
    articleViewerOpen?: boolean;
}

interface QueryRefinementWorkbenchProps {
    streamId: number;
    stream: ResearchStream;
    onStreamUpdate: () => void;
    canModify?: boolean;
    onStateChange?: (state: WorkbenchState) => void;
    pendingQueryUpdate?: string | null;
    onQueryUpdateApplied?: () => void;
    pendingFilterUpdate?: { criteria: string; threshold?: number } | null;
    onFilterUpdateApplied?: () => void;
}

type StepType = 'source' | 'filter' | 'categorize';
type SourceType = 'query' | 'manual' | 'previous';

interface WorkflowStep {
    id: string;
    type: StepType;
    config: any;
    results: any | null;
    expanded: boolean;
}

type ResultView = 'raw' | 'compare' | 'analyze';

export default function QueryRefinementWorkbench({ streamId, stream, onStreamUpdate, canModify: _canModify = true, onStateChange, pendingQueryUpdate, onQueryUpdateApplied, pendingFilterUpdate, onFilterUpdateApplied }: QueryRefinementWorkbenchProps) {
    // Note: _canModify is currently unused as the backend enforces permissions,
    // but the prop is accepted for future UI enhancements
    const [steps, setSteps] = useState<WorkflowStep[]>([
        {
            id: 'step_1',
            type: 'source',
            config: { sourceType: 'query', selectedQuery: '', startDate: '', endDate: '' },
            results: null,
            expanded: true
        }
    ]);
    const [focusedStepId, setFocusedStepId] = useState<string>('step_1');
    const [resultView, setResultView] = useState<ResultView>('raw');
    const [resultsPaneCollapsed, setResultsPaneCollapsed] = useState(false);

    // Version History State
    const [snapshots, setSnapshots] = useState<QuerySnapshot[]>([]);
    const [historyPanelOpen, setHistoryPanelOpen] = useState(true);
    const [selectedSnapshotId, setSelectedSnapshotId] = useState<string | null>(null);
    const [compareMode, setCompareMode] = useState(false);
    const [compareSnapshots, setCompareSnapshots] = useState<[string, string] | null>(null);

    // Article Viewer State
    const [viewerArticles, setViewerArticles] = useState<CanonicalResearchArticle[] | null>(null);
    const [viewerInitialIndex, setViewerInitialIndex] = useState(0);

    // Chat context for article viewer modal - provides stream context for AI analysis
    const viewerChatContext = useMemo(() => {
        if (!viewerArticles) return undefined;
        return {
            current_page: 'workbench_article_viewer',
            stream_id: streamId,
            stream_name: stream.stream_name,
            article_count: viewerArticles.length
        };
    }, [viewerArticles, streamId, stream.stream_name]);

    // Add a snapshot to history (does NOT auto-select - user stays in live view)
    const addSnapshot = useCallback((snapshot: Omit<QuerySnapshot, 'id' | 'timestamp'>) => {
        const newSnapshot: QuerySnapshot = {
            ...snapshot,
            id: `snapshot_${Date.now()}`,
            timestamp: new Date()
        };
        setSnapshots(prev => [newSnapshot, ...prev]);
        // Don't auto-select - user should stay in live view after running a query
        // They can click on the snapshot in history if they want to view it
        return newSnapshot;
    }, []);

    // Get a snapshot by ID
    const getSnapshot = useCallback((id: string) => {
        return snapshots.find(s => s.id === id);
    }, [snapshots]);

    // Update snapshot label
    const updateSnapshotLabel = useCallback((id: string, label: string) => {
        setSnapshots(prev => prev.map(s => s.id === id ? { ...s, label } : s));
    }, []);

    // Clear all snapshots
    const clearSnapshots = useCallback(() => {
        setSnapshots([]);
        setSelectedSnapshotId(null);
        setCompareMode(false);
        setCompareSnapshots(null);
    }, []);

    // Delete a single snapshot
    const deleteSnapshot = useCallback((id: string) => {
        setSnapshots(prev => prev.filter(s => s.id !== id));
        // Clear selection if deleted snapshot was selected
        if (selectedSnapshotId === id) {
            setSelectedSnapshotId(null);
        }
        // Clear compare if deleted snapshot was in compare
        if (compareSnapshots?.includes(id)) {
            setCompareMode(false);
            setCompareSnapshots(null);
        }
    }, [selectedSnapshotId, compareSnapshots]);

    // Handle external query updates (from chat suggestions)
    useEffect(() => {
        if (!pendingQueryUpdate) return;

        // Find a source step (prefer focused if it's a source, otherwise first source step)
        const focusedStep = steps.find(s => s.id === focusedStepId);
        const sourceStep = focusedStep?.type === 'source'
            ? focusedStep
            : steps.find(s => s.type === 'source');

        if (sourceStep) {
            // Update the step's test expression
            setSteps(prev => prev.map(step =>
                step.id === sourceStep.id
                    ? { ...step, config: { ...step.config, testQueryExpression: pendingQueryUpdate } }
                    : step
            ));
            // Focus on the source step so user sees the change
            setFocusedStepId(sourceStep.id);
        }

        // Notify parent that update was applied
        if (onQueryUpdateApplied) {
            onQueryUpdateApplied();
        }
    }, [pendingQueryUpdate, focusedStepId, steps, onQueryUpdateApplied]);

    // Handle external filter updates (from chat suggestions)
    useEffect(() => {
        if (!pendingFilterUpdate) return;

        // Find the filter step (or create one if needed)
        const filterStep = steps.find(s => s.type === 'filter');
        if (filterStep) {
            // Update the filter step's criteria
            setSteps(prev => prev.map(step =>
                step.id === filterStep.id
                    ? {
                        ...step,
                        config: {
                            ...step.config,
                            testCriteria: pendingFilterUpdate.criteria,
                            ...(pendingFilterUpdate.threshold !== undefined && { testThreshold: pendingFilterUpdate.threshold })
                        }
                    }
                    : step
            ));
            // Focus on the filter step
            setFocusedStepId(filterStep.id);
        }

        // Notify parent that update was applied
        if (onFilterUpdateApplied) {
            onFilterUpdateApplied();
        }
    }, [pendingFilterUpdate, steps, onFilterUpdateApplied]);

    // Report state changes to parent for chat context
    useEffect(() => {
        if (!onStateChange) return;

        const focusedStep = steps.find(s => s.id === focusedStepId);
        if (!focusedStep) return;

        const broadQueries = stream.retrieval_config?.broad_search?.queries || [];

        // Build workbench state
        const state: WorkbenchState = {
            focused_step_type: focusedStep.type,
            result_view: resultView,
            articleViewerOpen: viewerArticles !== null,
        };

        // Extract current query info if on source step
        const sourceStep = steps.find(s => s.type === 'source' && s.config.sourceType === 'query');
        if (sourceStep && sourceStep.config.selectedQuery !== '') {
            const queryIndex = parseInt(sourceStep.config.selectedQuery);
            const savedQuery = broadQueries[queryIndex];
            const savedExpression = savedQuery?.query_expression || '';
            const testExpression = sourceStep.config.testQueryExpression || savedExpression;

            state.current_query = {
                query_index: queryIndex,
                expression: testExpression,
                is_modified: testExpression !== savedExpression,
                covered_topics: savedQuery?.covered_topics,
            };
        }

        // Extract current filter info if filter step exists
        const filterStep = steps.find(s => s.type === 'filter');
        if (filterStep && sourceStep && sourceStep.config.selectedQuery !== '') {
            const queryIndex = parseInt(sourceStep.config.selectedQuery);
            const savedFilter = broadQueries[queryIndex]?.semantic_filter;
            const savedCriteria = savedFilter?.criteria || '';
            const savedThreshold = savedFilter?.threshold || 0.7;
            const testCriteria = filterStep.config.criteria !== undefined ? filterStep.config.criteria : savedCriteria;
            const testThreshold = filterStep.config.threshold !== undefined ? filterStep.config.threshold : savedThreshold;

            state.current_filter = {
                criteria: testCriteria,
                threshold: testThreshold,
                is_modified: testCriteria !== savedCriteria || testThreshold !== savedThreshold,
            };
        }

        // Extract test results from focused step
        if (focusedStep.results) {
            state.test_results = {
                step_type: focusedStep.type,
                article_count: focusedStep.results.count || 0,
                total_available: focusedStep.results.total_count,
                passed_count: focusedStep.results.passed_count,
                failed_count: focusedStep.results.failed_count,
            };
        }

        onStateChange(state);
    }, [steps, focusedStepId, resultView, stream, onStateChange, viewerArticles]);

    const addStep = (type: StepType) => {
        const newStep: WorkflowStep = {
            id: `step_${Date.now()}`,
            type,
            config: {},
            results: null,
            expanded: true
        };
        setSteps([...steps, newStep]);
        setFocusedStepId(newStep.id);
    };

    const removeStep = (id: string) => {
        setSteps(steps.filter(s => s.id !== id));
        if (focusedStepId === id) {
            setFocusedStepId('step_1');
        }
    };

    const updateStep = (id: string, updates: Partial<WorkflowStep>) => {
        setSteps(steps.map(s => s.id === id ? { ...s, ...updates } : s));
    };

    const toggleExpanded = (id: string) => {
        setSteps(steps.map(s => s.id === id ? { ...s, expanded: !s.expanded } : s));
    };

    const canAddFilter = !steps.some(s => s.type === 'filter');
    const canAddCategorize = !steps.some(s => s.type === 'categorize');

    const focusedStep = steps.find(s => s.id === focusedStepId);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex items-start justify-between">
                    <div>
                        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                            Query Refinement Workbench
                        </h3>
                        <p className="text-sm text-blue-800 dark:text-blue-300">
                            Test queries, filters, and categorization in isolation or as a pipeline. Build and refine each step independently.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => {
                            setSteps([{
                                id: 'step_1',
                                type: 'source',
                                config: { sourceType: 'query', selectedQuery: '', startDate: '', endDate: '' },
                                results: null,
                                expanded: true
                            }]);
                            setFocusedStepId('step_1');
                            clearSnapshots();
                        }}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                    >
                        Clear All
                    </button>
                </div>
            </div>

            {/* Three-Column Layout: Steps | Results | History */}
            <div className="flex gap-4">
                {/* Left: Workflow Steps */}
                <div className={`space-y-4 ${resultsPaneCollapsed ? 'flex-1' : 'w-[35%] flex-shrink-0'}`}>
                    {steps.map((step, index) => (
                        <div key={step.id}>
                            {index > 0 && (
                                <div className="flex justify-center py-2">
                                    <ArrowDownIcon className="h-5 w-5 text-gray-400" />
                                </div>
                            )}
                            <WorkflowStepCard
                                step={step}
                                stepNumber={index + 1}
                                onUpdate={(updates) => updateStep(step.id, updates)}
                                onRemove={steps.length > 1 ? () => removeStep(step.id) : undefined}
                                onToggle={() => toggleExpanded(step.id)}
                                onFocus={() => setFocusedStepId(step.id)}
                                isFocused={focusedStepId === step.id}
                                previousSteps={steps.slice(0, index)}
                                stream={stream}
                                streamId={streamId}
                                onExpandResults={() => setResultsPaneCollapsed(false)}
                                onStreamUpdate={onStreamUpdate}
                                onSnapshot={addSnapshot}
                            />
                        </div>
                    ))}

                    {/* Add Step Buttons */}
                    <div className="flex gap-3 pt-2">
                        {canAddFilter && (
                            <button
                                type="button"
                                onClick={() => addStep('filter')}
                                className="flex items-center gap-2 px-4 py-2 text-sm border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Add Filter
                            </button>
                        )}
                        {canAddCategorize && (
                            <button
                                type="button"
                                onClick={() => addStep('categorize')}
                                className="flex items-center gap-2 px-4 py-2 text-sm border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-gray-700 dark:text-gray-300 transition-colors"
                            >
                                <PlusIcon className="h-4 w-4" />
                                Add Categorize
                            </button>
                        )}
                    </div>
                </div>

                {/* Middle: Results Pane */}
                {resultsPaneCollapsed ? (
                    <div className="flex items-start">
                        <button
                            type="button"
                            onClick={() => setResultsPaneCollapsed(false)}
                            className="flex items-center justify-center w-8 h-12 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded-l-lg border border-gray-300 dark:border-gray-600 transition-colors"
                            title="Expand results pane"
                        >
                            <ChevronLeftIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                ) : (
                    <div className="flex-1 min-w-0">
                        {compareMode && compareSnapshots ? (
                            <SnapshotCompareView
                                snapshotA={getSnapshot(compareSnapshots[0])}
                                snapshotB={getSnapshot(compareSnapshots[1])}
                                onClose={() => {
                                    setCompareMode(false);
                                    setCompareSnapshots(null);
                                }}
                                onArticleClick={(articles, index) => {
                                    setViewerArticles(articles);
                                    setViewerInitialIndex(index);
                                }}
                                onUseAsSource={async (pmids, _label) => {
                                    // Fetch the articles for these PMIDs
                                    try {
                                        const response = await retrievalTestingApi.fetchByPmids({ pmids });

                                        // Update the first source step with config AND results
                                        setSteps(prev => prev.map((step, idx) => {
                                            if (idx === 0 && step.type === 'source') {
                                                return {
                                                    ...step,
                                                    config: {
                                                        ...step.config,
                                                        sourceType: 'manual',
                                                        manualIds: pmids.join('\n')
                                                    },
                                                    results: response,
                                                    expanded: true
                                                };
                                            }
                                            return step;
                                        }));

                                        // Exit compare mode and show results
                                        setCompareMode(false);
                                        setCompareSnapshots(null);
                                        setFocusedStepId('step_1');
                                        setResultsPaneCollapsed(false);  // Show results pane
                                    } catch (err) {
                                        console.error('Error fetching PMIDs:', err);
                                        // Still set up the source step, user can run manually
                                        setSteps(prev => prev.map((step, idx) => {
                                            if (idx === 0 && step.type === 'source') {
                                                return {
                                                    ...step,
                                                    config: {
                                                        ...step.config,
                                                        sourceType: 'manual',
                                                        manualIds: pmids.join('\n')
                                                    },
                                                    results: null,
                                                    expanded: true
                                                };
                                            }
                                            return step;
                                        }));
                                        setCompareMode(false);
                                        setCompareSnapshots(null);
                                        setFocusedStepId('step_1');
                                    }
                                }}
                            />
                        ) : selectedSnapshotId && !compareMode ? (
                            <SnapshotResultsPane
                                snapshot={getSnapshot(selectedSnapshotId)}
                                onClose={() => setSelectedSnapshotId(null)}
                                onCollapse={() => setResultsPaneCollapsed(true)}
                                onArticleClick={(articles, index) => {
                                    setViewerArticles(articles);
                                    setViewerInitialIndex(index);
                                }}
                                onUseQuery={(query) => {
                                    // Find source step and update its query
                                    const sourceStep = steps.find(s => s.type === 'source');
                                    if (sourceStep) {
                                        setSteps(prev => prev.map(step =>
                                            step.id === sourceStep.id
                                                ? { ...step, config: { ...step.config, testQueryExpression: query } }
                                                : step
                                        ));
                                        setFocusedStepId(sourceStep.id);
                                    }
                                    setSelectedSnapshotId(null); // Return to live view
                                }}
                                onUseFilter={(criteria, threshold) => {
                                    // Find filter step and update its criteria
                                    const filterStep = steps.find(s => s.type === 'filter');
                                    if (filterStep) {
                                        setSteps(prev => prev.map(step =>
                                            step.id === filterStep.id
                                                ? { ...step, config: { ...step.config, testCriteria: criteria, testThreshold: threshold } }
                                                : step
                                        ));
                                        setFocusedStepId(filterStep.id);
                                    }
                                    setSelectedSnapshotId(null); // Return to live view
                                }}
                            />
                        ) : (
                            <ResultsPane
                                step={focusedStep}
                                stepNumber={steps.findIndex(s => s.id === focusedStepId) + 1}
                                view={resultView}
                                onViewChange={setResultView}
                                onCollapse={() => setResultsPaneCollapsed(true)}
                                onArticleClick={(articles, index) => {
                                    setViewerArticles(articles);
                                    setViewerInitialIndex(index);
                                }}
                            />
                        )}
                    </div>
                )}

                {/* Right: Version History Sidebar */}
                <VersionHistorySidebar
                    snapshots={snapshots}
                    selectedSnapshotId={selectedSnapshotId}
                    onSelectSnapshot={(id) => {
                        setSelectedSnapshotId(id);
                        setCompareMode(false);
                        setCompareSnapshots(null);
                    }}
                    compareMode={compareMode}
                    compareSnapshots={compareSnapshots}
                    onToggleCompareMode={() => {
                        setCompareMode(!compareMode);
                        if (!compareMode) {
                            setCompareSnapshots(null);
                        }
                    }}
                    onSelectForCompare={(id) => {
                        if (!compareSnapshots) {
                            setCompareSnapshots([id, id]);
                        } else if (compareSnapshots[0] === id) {
                            // Already selected as first, do nothing
                        } else {
                            setCompareSnapshots([compareSnapshots[0], id]);
                        }
                    }}
                    onSetCompareFirst={(id) => {
                        setCompareSnapshots([id, compareSnapshots?.[1] || id]);
                    }}
                    onUpdateLabel={updateSnapshotLabel}
                    onDeleteSnapshot={deleteSnapshot}
                    isOpen={historyPanelOpen}
                    onToggleOpen={() => setHistoryPanelOpen(!historyPanelOpen)}
                />
            </div>

            {/* Article Viewer Modal - with chat context for stream-aware AI analysis */}
            {viewerArticles && (
                <ArticleViewerModal
                    articles={viewerArticles}
                    initialIndex={viewerInitialIndex}
                    onClose={() => setViewerArticles(null)}
                    chatContext={viewerChatContext}
                />
            )}
        </div>
    );
}

// ============================================================================
// Workflow Step Card
// ============================================================================

interface WorkflowStepCardProps {
    step: WorkflowStep;
    stepNumber: number;
    onUpdate: (updates: Partial<WorkflowStep>) => void;
    onRemove?: () => void;
    onToggle: () => void;
    onFocus: () => void;
    isFocused: boolean;
    previousSteps: WorkflowStep[];
    stream: ResearchStream;
    streamId: number;
    onExpandResults: () => void;
    onStreamUpdate: () => void;
    onSnapshot: (snapshot: Omit<QuerySnapshot, 'id' | 'timestamp'>) => QuerySnapshot;
}

function WorkflowStepCard({ step, stepNumber, onUpdate, onRemove, onToggle, onFocus, isFocused, previousSteps, stream, streamId, onExpandResults, onStreamUpdate, onSnapshot }: WorkflowStepCardProps) {
    const stepConfig = {
        source: { title: 'Source', icon: BeakerIcon, color: 'blue' },
        filter: { title: 'Filter', icon: FunnelIcon, color: 'purple' },
        categorize: { title: 'Categorize', icon: TagIcon, color: 'green' }
    };

    const config = stepConfig[step.type];
    const Icon = config.icon;

    return (
        <div
            className={`border rounded-lg overflow-hidden transition-colors ${isFocused
                    ? 'border-blue-500 ring-2 ring-blue-200 dark:ring-blue-800'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
            onClick={onFocus}
        >
            {/* Header */}
            <div className={`bg-${config.color}-50 dark:bg-${config.color}-900/20 border-b border-gray-300 dark:border-gray-600 p-3`}>
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggle();
                        }}
                        className="flex items-center gap-2 flex-1 text-left"
                    >
                        {step.expanded ? (
                            <ChevronDownIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        ) : (
                            <ChevronRightIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                        )}
                        <Icon className={`h-4 w-4 text-${config.color}-600 dark:text-${config.color}-400`} />
                        <div>
                            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                                Step {stepNumber}: {config.title}
                            </h4>
                            {step.results && (
                                <p className="text-xs text-gray-600 dark:text-gray-400">
                                    {step.type === 'source' && step.results.total_count !== undefined && step.results.total_count !== step.results.count
                                        ? <><span className="font-semibold text-blue-600 dark:text-blue-400">{step.results.total_count.toLocaleString()}</span> matched (showing {step.results.count})</>
                                        : `${step.results.count} articles`}
                                </p>
                            )}
                        </div>
                    </button>
                    {onRemove && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRemove();
                            }}
                            className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                        >
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            {step.expanded && (
                <div className="p-4 bg-white dark:bg-gray-900">
                    {step.type === 'source' && (
                        <SourceStepContent step={step} onUpdate={onUpdate} stream={stream} streamId={streamId} onExpandResults={onExpandResults} onStreamUpdate={onStreamUpdate} onSnapshot={onSnapshot} />
                    )}
                    {step.type === 'filter' && (
                        <FilterStepContent step={step} onUpdate={onUpdate} previousSteps={previousSteps} streamId={streamId} stream={stream} onExpandResults={onExpandResults} onStreamUpdate={onStreamUpdate} onSnapshot={onSnapshot} />
                    )}
                    {step.type === 'categorize' && (
                        <CategorizeStepContent step={step} onUpdate={onUpdate} previousSteps={previousSteps} streamId={streamId} onExpandResults={onExpandResults} onSnapshot={onSnapshot} />
                    )}
                </div>
            )}
        </div>
    );
}

// ============================================================================
// Source Step
// ============================================================================

function SourceStepContent({ step, onUpdate, stream, streamId, onExpandResults, onStreamUpdate, onSnapshot }: { step: WorkflowStep; onUpdate: (updates: Partial<WorkflowStep>) => void; stream: ResearchStream; streamId: number; onExpandResults: () => void; onStreamUpdate: () => void; onSnapshot: (snapshot: Omit<QuerySnapshot, 'id' | 'timestamp'>) => QuerySnapshot }) {
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = step.config;

    // Get broad queries from stream
    const broadQueries = stream.retrieval_config?.broad_search?.queries || [];

    const runQuery = async () => {
        setIsRunning(true);
        setError(null);

        try {
            if (config.sourceType === 'query') {
                // Run broad query
                const queryIndex = parseInt(config.selectedQuery);
                if (isNaN(queryIndex)) {
                    throw new Error('Invalid query selection');
                }

                const savedQuery = broadQueries[queryIndex];
                const savedExpression = savedQuery?.query_expression || '';
                const testExpression = config.testQueryExpression || savedExpression;
                const hasChanges = testExpression !== savedExpression;

                let response;
                if (hasChanges) {
                    // Test custom query expression (allows testing before saving)
                    response = await retrievalTestingApi.testQuery({
                        query_expression: testExpression,
                        start_date: config.startDate,
                        end_date: config.endDate
                    });
                } else {
                    // Run saved query from stream
                    response = await retrievalTestingApi.testQuery({
                        stream_id: streamId,
                        query_index: queryIndex,
                        query_expression: testExpression,
                        start_date: config.startDate,
                        end_date: config.endDate
                    });
                }

                onUpdate({
                    results: response
                });

                // Capture snapshot for version history
                onSnapshot({
                    stepType: 'source',
                    queryExpression: testExpression,
                    queryIndex: queryIndex,
                    startDate: config.startDate,
                    endDate: config.endDate,
                    articles: response.articles || [],
                    articleCount: response.count || 0,
                    totalCount: response.total_count || response.count || 0,
                    allMatchedPmids: response.all_matched_pmids || []
                });

                // Auto-expand results pane
                onExpandResults();
            } else if (config.sourceType === 'manual') {
                // Fetch manual PMIDs
                const pmids = config.manualIds
                    .split(/[\n,]/)
                    .map((id: string) => id.trim())
                    .filter((id: string) => id.length > 0);

                if (pmids.length === 0) {
                    throw new Error('No PMIDs provided');
                }

                const response = await retrievalTestingApi.fetchByPmids({ pmids });

                onUpdate({
                    results: response
                });

                // Capture snapshot for manual PMIDs
                onSnapshot({
                    stepType: 'source',
                    queryExpression: `Manual PMIDs: ${pmids.length} articles`,
                    articles: response.articles || [],
                    articleCount: response.count || 0,
                    totalCount: response.total_count || response.count || 0,
                    allMatchedPmids: response.all_matched_pmids || pmids
                });

                // Auto-expand results pane
                onExpandResults();
            }
        } catch (err) {
            console.error('Error running source:', err);
            setError(err instanceof Error ? err.message : 'Failed to run source');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-4">
            {/* Configuration */}
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Source Type
                    </label>
                    <div className="flex gap-3">
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name={`source-${step.id}`}
                                value="query"
                                checked={config.sourceType === 'query'}
                                onChange={(e) => onUpdate({ config: { ...config, sourceType: e.target.value } })}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Run Query</span>
                        </label>
                        <label className="flex items-center">
                            <input
                                type="radio"
                                name={`source-${step.id}`}
                                value="manual"
                                checked={config.sourceType === 'manual'}
                                onChange={(e) => onUpdate({ config: { ...config, sourceType: e.target.value } })}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700 dark:text-gray-300">Manual PMIDs</span>
                        </label>
                    </div>
                </div>

                {config.sourceType === 'query' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Select Broad Query
                            </label>
                            <select
                                value={config.selectedQuery}
                                onChange={(e) => onUpdate({ config: { ...config, selectedQuery: e.target.value } })}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                            >
                                <option value="">Select a query...</option>
                                {broadQueries.map((query, index) => (
                                    <option key={index} value={index.toString()}>
                                        Broad Query {index + 1}: {query.query_expression?.substring(0, 50)}
                                    </option>
                                ))}
                            </select>
                            {broadQueries.length === 0 && (
                                <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                                    No broad queries configured in this stream
                                </p>
                            )}
                        </div>

                        {/* Query Expression Editor (when query selected) */}
                        {config.selectedQuery !== '' && (() => {
                            const queryIndex = parseInt(config.selectedQuery);
                            const savedQuery = broadQueries[queryIndex];
                            const savedExpression = savedQuery?.query_expression || '';
                            const testExpression = config.testQueryExpression || savedExpression;
                            const hasChanges = testExpression !== savedExpression;

                            return (
                                <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Query Expression
                                        </label>
                                        {hasChanges && (
                                            <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                                </svg>
                                                Modified
                                            </span>
                                        )}
                                    </div>

                                    <textarea
                                        value={testExpression}
                                        onChange={(e) => onUpdate({ config: { ...config, testQueryExpression: e.target.value } })}
                                        placeholder="Enter PubMed query expression..."
                                        rows={3}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                                    />

                                    {hasChanges && (
                                        <div className="flex gap-2">
                                            <button
                                                type="button"
                                                onClick={async () => {
                                                    try {
                                                        await researchStreamApi.updateBroadQuery(
                                                            streamId,
                                                            queryIndex,
                                                            testExpression
                                                        );
                                                        // Refresh stream data from backend
                                                        await onStreamUpdate();
                                                        // Reset test expression to match saved
                                                        onUpdate({ config: { ...config, testQueryExpression: undefined } });
                                                        alert('Query updated successfully!');
                                                    } catch (err) {
                                                        alert('Failed to update query: ' + (err instanceof Error ? err.message : 'Unknown error'));
                                                    }
                                                }}
                                                className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                                                title="Save this modified query to the stream configuration"
                                            >
                                                💾 Save to Stream
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => onUpdate({ config: { ...config, testQueryExpression: savedExpression } })}
                                                className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium"
                                                title="Discard changes and revert to saved query"
                                            >
                                                ↶ Revert
                                            </button>
                                        </div>
                                    )}

                                    {!hasChanges && (
                                        <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                                            <CheckCircleIcon className="h-3 w-3" />
                                            Using saved query from stream
                                        </p>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Date Range Selection */}
                        <div className="space-y-3">
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                                Date Range
                            </label>

                            {/* Quick Pick Buttons */}
                            <div className="flex flex-wrap gap-2">
                                {(() => {
                                    const today = new Date();
                                    const formatDate = (d: Date) => d.toISOString().split('T')[0];

                                    // Last full week (Monday to Sunday)
                                    const lastSunday = new Date(today);
                                    lastSunday.setDate(today.getDate() - today.getDay());
                                    const lastMonday = new Date(lastSunday);
                                    lastMonday.setDate(lastSunday.getDate() - 6);

                                    // Last full month
                                    const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                                    const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);

                                    // This week so far (Monday to today)
                                    const thisMonday = new Date(today);
                                    const dayOfWeek = today.getDay();
                                    const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                                    thisMonday.setDate(today.getDate() - daysFromMonday);

                                    // This month so far
                                    const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);

                                    const presets = [
                                        { label: 'Last Week', start: formatDate(lastMonday), end: formatDate(lastSunday) },
                                        { label: 'Last Month', start: formatDate(lastMonthStart), end: formatDate(lastMonthEnd) },
                                        { label: 'This Week', start: formatDate(thisMonday), end: formatDate(today) },
                                        { label: 'This Month', start: formatDate(thisMonthStart), end: formatDate(today) },
                                        { label: 'Last 7 Days', start: formatDate(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)), end: formatDate(today) },
                                        { label: 'Last 30 Days', start: formatDate(new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)), end: formatDate(today) },
                                    ];

                                    return presets.map((preset) => {
                                        const isActive = config.startDate === preset.start && config.endDate === preset.end;
                                        return (
                                            <button
                                                key={preset.label}
                                                type="button"
                                                onClick={() => onUpdate({ config: { ...config, startDate: preset.start, endDate: preset.end } })}
                                                className={`px-3 py-1.5 text-xs rounded-md font-medium transition-colors ${
                                                    isActive
                                                        ? 'bg-blue-600 text-white'
                                                        : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                                }`}
                                            >
                                                {preset.label}
                                            </button>
                                        );
                                    });
                                })()}
                            </div>

                            {/* Custom Date Inputs */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        Start Date
                                    </label>
                                    <input
                                        type="date"
                                        value={config.startDate}
                                        onChange={(e) => onUpdate({ config: { ...config, startDate: e.target.value } })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                                        End Date
                                    </label>
                                    <input
                                        type="date"
                                        value={config.endDate}
                                        onChange={(e) => onUpdate({ config: { ...config, endDate: e.target.value } })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                    />
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {config.sourceType === 'manual' && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            PubMed IDs
                        </label>
                        <textarea
                            value={config.manualIds || ''}
                            onChange={(e) => onUpdate({ config: { ...config, manualIds: e.target.value } })}
                            placeholder="Enter PubMed IDs (one per line or comma-separated)&#10;38123456&#10;38123457"
                            rows={6}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                        />
                    </div>
                )}
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
            )}

            {/* Run Button */}
            <button
                type="button"
                onClick={runQuery}
                disabled={isRunning || (config.sourceType === 'query' && (!config.selectedQuery || !config.startDate || !config.endDate)) || (config.sourceType === 'manual' && !config.manualIds)}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${isRunning || (config.sourceType === 'query' && !config.selectedQuery)
                        ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
            >
                {isRunning ? (
                    <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Running...
                    </>
                ) : (
                    <>
                        <PlayIcon className="h-5 w-5" />
                        Run Source
                    </>
                )}
            </button>

        </div>
    );
}

// ============================================================================
// Filter Step
// ============================================================================

function FilterStepContent({ step, onUpdate, previousSteps, streamId, stream, onExpandResults, onStreamUpdate, onSnapshot }: { step: WorkflowStep; onUpdate: (updates: Partial<WorkflowStep>) => void; previousSteps: WorkflowStep[]; streamId: number; stream: ResearchStream; onExpandResults: () => void; onStreamUpdate: () => void; onSnapshot: (snapshot: Omit<QuerySnapshot, 'id' | 'timestamp'>) => QuerySnapshot }) {
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = step.config;

    const availableInputs = previousSteps.filter(s => s.results);

    const runFilter = async () => {
        setIsRunning(true);
        setError(null);

        try {
            // Get input articles from selected step
            const inputStep = previousSteps.find(s => s.id === config.inputStep);
            if (!inputStep || !inputStep.results) {
                throw new Error('No input articles selected');
            }

            // Get filter criteria - determine which query's filter to use
            const broadQueries = stream.retrieval_config?.broad_search?.queries || [];
            const sourceStep = previousSteps.find(s => s.type === 'source' && s.config.sourceType === 'query');

            // Priority: explicit filterSourceQuery > source step query > first query
            let queryIndex = config.filterSourceQuery !== undefined
                ? parseInt(config.filterSourceQuery)
                : (sourceStep?.config.selectedQuery !== undefined
                    ? parseInt(sourceStep.config.selectedQuery)
                    : 0);

            if (isNaN(queryIndex) || queryIndex < 0 || queryIndex >= broadQueries.length) {
                queryIndex = broadQueries.length > 0 ? 0 : -1;
            }

            const savedFilter = queryIndex >= 0 ? broadQueries[queryIndex]?.semantic_filter : null;

            const testCriteria = config.criteria !== undefined ? config.criteria : (savedFilter?.criteria || '');
            const testThreshold = config.threshold !== undefined ? config.threshold : (savedFilter?.threshold || 0.7);

            if (!testCriteria || testCriteria.trim() === '') {
                throw new Error('Filter criteria is required');
            }

            const articles: CanonicalResearchArticle[] = inputStep.results.articles;

            const response = await retrievalTestingApi.testFilter({
                articles,
                filter_criteria: testCriteria,
                threshold: testThreshold
            });

            onUpdate({
                results: response
            });

            // Note: Filter results are not captured to version history
            // Version history is for comparing query results across runs

            // Auto-expand results pane
            onExpandResults();
        } catch (err) {
            console.error('Error running filter:', err);
            setError(err instanceof Error ? err.message : 'Failed to run filter');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="space-y-3">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Input Source
                    </label>
                    <select
                        value={config.inputStep || ''}
                        onChange={(e) => onUpdate({ config: { ...config, inputStep: e.target.value } })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                    >
                        <option value="">Select input...</option>
                        {availableInputs.map((s, idx) => (
                            <option key={s.id} value={s.id}>
                                Step {idx + 1} - {s.results.count} articles
                            </option>
                        ))}
                    </select>
                </div>

                {/* Filter Configuration with Diff Tracking */}
                {(() => {
                    const broadQueries = stream.retrieval_config?.broad_search?.queries || [];

                    // Determine which query's filter to use:
                    // 1. If user explicitly selected one via filterSourceQuery, use that
                    // 2. If source step is query-based, use that query's filter
                    // 3. Otherwise default to first query (index 0)
                    const sourceStep = previousSteps.find(s => s.type === 'source' && s.config.sourceType === 'query');
                    let queryIndex = config.filterSourceQuery !== undefined
                        ? parseInt(config.filterSourceQuery)
                        : (sourceStep?.config.selectedQuery !== undefined
                            ? parseInt(sourceStep.config.selectedQuery)
                            : 0);

                    // Ensure queryIndex is valid
                    if (isNaN(queryIndex) || queryIndex < 0 || queryIndex >= broadQueries.length) {
                        queryIndex = broadQueries.length > 0 ? 0 : -1;
                    }

                    const savedFilter = queryIndex >= 0 ? broadQueries[queryIndex]?.semantic_filter : null;

                    const testCriteria = config.criteria !== undefined ? config.criteria : (savedFilter?.criteria || '');
                    const testThreshold = config.threshold !== undefined ? config.threshold : (savedFilter?.threshold || 0.7);
                    const testEnabled = config.enabled !== undefined ? config.enabled : (savedFilter?.enabled ?? true);

                    const hasChanges = savedFilter && (
                        testCriteria !== savedFilter.criteria ||
                        testThreshold !== savedFilter.threshold ||
                        testEnabled !== savedFilter.enabled
                    );

                    return (
                        <div className="border border-gray-300 dark:border-gray-600 rounded-md p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Filter Configuration
                                </label>
                                {hasChanges && (
                                    <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                        </svg>
                                        Modified
                                    </span>
                                )}
                            </div>

                            {/* Filter Source Selector - show when source is not query-based or multiple queries exist */}
                            {broadQueries.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                        Load filter from query
                                    </label>
                                    <select
                                        value={queryIndex}
                                        onChange={(e) => {
                                            const newIndex = parseInt(e.target.value);
                                            const newFilter = broadQueries[newIndex]?.semantic_filter;
                                            // Update both the source query and reset criteria to match
                                            onUpdate({
                                                config: {
                                                    ...config,
                                                    filterSourceQuery: e.target.value,
                                                    criteria: newFilter?.criteria || '',
                                                    threshold: newFilter?.threshold || 0.7,
                                                    enabled: newFilter?.enabled ?? true
                                                }
                                            });
                                        }}
                                        className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    >
                                        {broadQueries.map((q: any, idx: number) => (
                                            <option key={idx} value={idx}>
                                                Query {idx + 1}: {q.query_expression?.substring(0, 40)}...
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div>
                                <label className="flex items-center mb-2">
                                    <input
                                        type="checkbox"
                                        checked={testEnabled}
                                        onChange={(e) => onUpdate({ config: { ...config, enabled: e.target.checked } })}
                                        className="mr-2"
                                    />
                                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                        Enable Semantic Filter
                                    </span>
                                </label>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Filter Criteria
                                </label>
                                <textarea
                                    value={testCriteria}
                                    onChange={(e) => onUpdate({ config: { ...config, criteria: e.target.value } })}
                                    placeholder="Describe what should pass/fail..."
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                    Threshold: {testThreshold.toFixed(2)}
                                </label>
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={testThreshold}
                                    onChange={(e) => onUpdate({ config: { ...config, threshold: parseFloat(e.target.value) } })}
                                    className="w-full"
                                />
                            </div>

                            {hasChanges && queryIndex >= 0 && (
                                <div className="flex gap-2">
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            try {
                                                await researchStreamApi.updateSemanticFilter(
                                                    streamId,
                                                    queryIndex,
                                                    {
                                                        enabled: testEnabled,
                                                        criteria: testCriteria,
                                                        threshold: testThreshold
                                                    }
                                                );
                                                // Refresh stream data from backend
                                                await onStreamUpdate();
                                                // Reset to match saved
                                                onUpdate({ config: { ...config, enabled: undefined, criteria: undefined, threshold: undefined } });
                                                alert('Filter updated successfully!');
                                            } catch (err) {
                                                alert('Failed to update filter: ' + (err instanceof Error ? err.message : 'Unknown error'));
                                            }
                                        }}
                                        className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                                    >
                                        Update Stream
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onUpdate({ config: { ...config, enabled: savedFilter.enabled, criteria: savedFilter.criteria, threshold: savedFilter.threshold } })}
                                        className="px-3 py-1.5 text-sm bg-gray-600 hover:bg-gray-700 text-white rounded-md font-medium"
                                    >
                                        Revert
                                    </button>
                                </div>
                            )}

                            {!hasChanges && savedFilter && (
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Matches saved filter configuration
                                </p>
                            )}
                        </div>
                    );
                })()}
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
            )}

            {(() => {
                // Use same logic as filter config section - check filterSourceQuery first
                const broadQueries = stream.retrieval_config?.broad_search?.queries || [];
                const sourceStep = previousSteps.find(s => s.type === 'source' && s.config.sourceType === 'query');

                let queryIndex = config.filterSourceQuery !== undefined
                    ? parseInt(config.filterSourceQuery)
                    : (sourceStep?.config.selectedQuery !== undefined
                        ? parseInt(sourceStep.config.selectedQuery)
                        : 0);

                if (isNaN(queryIndex) || queryIndex < 0 || queryIndex >= broadQueries.length) {
                    queryIndex = broadQueries.length > 0 ? 0 : -1;
                }

                const savedFilter = queryIndex >= 0 ? broadQueries[queryIndex]?.semantic_filter : null;
                const testCriteria = config.criteria !== undefined ? config.criteria : (savedFilter?.criteria || '');
                const hasValidCriteria = testCriteria && testCriteria.trim() !== '';

                return (
                    <button
                        type="button"
                        onClick={runFilter}
                        disabled={isRunning || !config.inputStep || !hasValidCriteria}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${isRunning || !config.inputStep || !hasValidCriteria
                                ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                : 'bg-purple-600 hover:bg-purple-700 text-white'
                            }`}
                    >
                        {isRunning ? (
                            <>
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                Running...
                            </>
                        ) : (
                            <>
                                <PlayIcon className="h-5 w-5" />
                                Run Filter
                            </>
                        )}
                    </button>
                );
            })()}
        </div>
    );
}

// ============================================================================
// Categorize Step
// ============================================================================

function CategorizeStepContent({ step, onUpdate, previousSteps, streamId, onExpandResults, onSnapshot }: { step: WorkflowStep; onUpdate: (updates: Partial<WorkflowStep>) => void; previousSteps: WorkflowStep[]; streamId: number; onExpandResults: () => void; onSnapshot: (snapshot: Omit<QuerySnapshot, 'id' | 'timestamp'>) => QuerySnapshot }) {
    const [isRunning, setIsRunning] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const config = step.config;

    const availableInputs = previousSteps.filter(s => s.results);

    const runCategorize = async () => {
        setIsRunning(true);
        setError(null);

        try {
            // Get input articles from selected step
            const inputStep = previousSteps.find(s => s.id === config.inputStep);
            if (!inputStep || !inputStep.results) {
                throw new Error('No input articles selected');
            }

            const articles: CanonicalResearchArticle[] = inputStep.results.articles;

            const response = await promptTestingApi.testCategorization({
                stream_id: streamId,
                articles
            });

            onUpdate({
                results: response
            });

            // Note: Categorization results are not captured to version history
            // Version history is for comparing query results across runs

            // Auto-expand results pane
            onExpandResults();
        } catch (err) {
            console.error('Error running categorization:', err);
            setError(err instanceof Error ? err.message : 'Failed to run categorization');
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <div className="space-y-4">
            <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Input Source
                </label>
                <select
                    value={config.inputStep || ''}
                    onChange={(e) => onUpdate({ config: { ...config, inputStep: e.target.value } })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                >
                    <option value="">Select input...</option>
                    {availableInputs.map((s, idx) => (
                        <option key={s.id} value={s.id}>
                            Step {idx + 1} - {s.results.count} articles
                        </option>
                    ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Using categories from Layer 3 configuration
                </p>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-3">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                </div>
            )}

            <button
                type="button"
                onClick={runCategorize}
                disabled={isRunning || !config.inputStep}
                className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md font-medium transition-colors ${isRunning || !config.inputStep
                        ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
            >
                {isRunning ? (
                    <>
                        <ArrowPathIcon className="h-5 w-5 animate-spin" />
                        Running...
                    </>
                ) : (
                    <>
                        <PlayIcon className="h-5 w-5" />
                        Run Categorize
                    </>
                )}
            </button>

        </div>
    );
}

// ============================================================================
// Results Pane (Right Side)
// ============================================================================

interface ResultsPaneProps {
    step: WorkflowStep | undefined;
    stepNumber: number;
    view: ResultView;
    onViewChange: (view: ResultView) => void;
    onCollapse: () => void;
    onArticleClick?: (articles: CanonicalResearchArticle[], index: number) => void;
}

function ResultsPane({ step, stepNumber, view, onViewChange, onCollapse, onArticleClick }: ResultsPaneProps) {
    const [compareIds, setCompareIds] = useState('');

    if (!step) {
        return (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-8 bg-gray-50 dark:bg-gray-900">
                <div className="text-center text-gray-500 dark:text-gray-400">
                    <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>No step selected</p>
                </div>
            </div>
        );
    }

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
            {/* Header */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900 dark:text-white">
                        Step {stepNumber} Results
                    </h3>
                    <div className="flex items-center gap-3">
                        {step.results && (
                            <span className="text-sm text-gray-600 dark:text-gray-400">
                                {step.type === 'source' && step.results.total_count !== undefined && step.results.total_count !== step.results.count
                                    ? <><span className="font-semibold text-blue-600 dark:text-blue-400">{step.results.total_count.toLocaleString()}</span> matched (showing {step.results.count})</>
                                    : `${step.results.count} articles`}
                            </span>
                        )}
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Collapse results pane"
                        >
                            <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* View Mode Tabs */}
                {step.results && (
                    <div className="flex gap-2">
                        <button
                            type="button"
                            onClick={() => onViewChange('raw')}
                            className={`px-3 py-1 text-sm rounded ${view === 'raw'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                        >
                            Raw
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewChange('compare')}
                            className={`px-3 py-1 text-sm rounded ${view === 'compare'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                        >
                            Compare
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewChange('analyze')}
                            className={`px-3 py-1 text-sm rounded ${view === 'analyze'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                }`}
                        >
                            Analyze
                        </button>
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
                {!step.results ? (
                    <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                        <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                        <p>Run this step to see results</p>
                    </div>
                ) : view === 'raw' ? (
                    <RawResultsView step={step} onArticleClick={onArticleClick} />
                ) : view === 'compare' ? (
                    <CompareResultsView step={step} compareIds={compareIds} onCompareIdsChange={setCompareIds} />
                ) : (
                    <AnalyzeResultsView step={step} />
                )}
            </div>
        </div>
    );
}

// Raw Results View
interface RawResultsViewProps {
    step: WorkflowStep;
    onArticleClick?: (articles: CanonicalResearchArticle[], index: number) => void;
}

function RawResultsView({ step, onArticleClick }: RawResultsViewProps) {
    // Filter toggle state for filter step results
    const [filterView, setFilterView] = useState<'all' | 'passed' | 'failed'>('all');
    // Inline text search filter
    const [searchFilter, setSearchFilter] = useState('');

    if (step.type === 'categorize') {
        // CategorizeResponse: { results: CategoryAssignment[], count, category_distribution }
        const categoryDist = step.results.category_distribution || {};
        const categoryCount = Object.keys(categoryDist).length;

        return (
            <div className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                    {step.results.count} articles across {categoryCount} categories
                </p>
                {Object.entries(categoryDist).map(([categoryId, count]: [string, any]) => (
                    <div key={categoryId} className="border border-gray-200 dark:border-gray-700 rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                                <TagIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                                <span className="font-medium text-gray-900 dark:text-white">{categoryId}</span>
                            </div>
                            <span className="text-sm text-gray-600 dark:text-gray-400">{count} articles</span>
                        </div>
                        <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div
                                className="bg-green-500 h-2 rounded-full"
                                style={{ width: `${(count / step.results.count) * 100}%` }}
                            />
                        </div>
                    </div>
                ))}

                {/* Show articles with their categories */}
                <div className="mt-6 space-y-2">
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Articles</h4>
                    {step.results.results?.slice(0, 10).map((result: any, idx: number) => (
                        <div key={idx} className="border border-gray-200 dark:border-gray-700 rounded p-3 text-sm">
                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mb-1">
                                PMID: {result.article.pmid || result.article.id}
                            </p>
                            <p className="text-gray-900 dark:text-white mb-2">{result.article.title}</p>
                            <div className="flex gap-1 flex-wrap">
                                {result.assigned_category && (
                                    <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 text-xs rounded">
                                        {result.assigned_category}
                                    </span>
                                )}
                            </div>
                        </div>
                    ))}
                    {step.results.results && step.results.results.length > 10 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                            Showing 10 of {step.results.results.length} articles
                        </p>
                    )}
                </div>
            </div>
        );
    }

    if (step.type === 'filter') {
        // FilterResponse: { results: FilterResult[], count, passed, failed }
        // Filter results based on toggle selection
        const allResults = step.results.results || [];
        const viewFilteredResults = filterView === 'all'
            ? allResults
            : filterView === 'passed'
                ? allResults.filter((r: any) => r.passed)
                : allResults.filter((r: any) => !r.passed);

        // Apply text search filter
        const filteredResults = searchFilter.trim()
            ? viewFilteredResults.filter((r: any) => {
                const searchLower = searchFilter.toLowerCase();
                return (
                    r.article.title?.toLowerCase().includes(searchLower) ||
                    r.article.abstract?.toLowerCase().includes(searchLower) ||
                    (r.article.pmid || r.article.id || '').toLowerCase().includes(searchLower) ||
                    r.reasoning?.toLowerCase().includes(searchLower)
                );
            })
            : viewFilteredResults;

        return (
            <div className="space-y-4">
                {/* Summary Stats */}
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-center">
                        <p className="text-2xl font-bold text-gray-900 dark:text-white">{step.results.count}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Total</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/20 rounded p-3 text-center">
                        <p className="text-2xl font-bold text-green-600 dark:text-green-400">{step.results.passed}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Passed</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/20 rounded p-3 text-center">
                        <p className="text-2xl font-bold text-red-600 dark:text-red-400">{step.results.failed}</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">Failed</p>
                    </div>
                </div>

                {/* Filter Toggle */}
                <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 pb-3">
                    <button
                        type="button"
                        onClick={() => setFilterView('all')}
                        className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                            filterView === 'all'
                                ? 'bg-gray-700 text-white dark:bg-gray-200 dark:text-gray-900'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        All ({step.results.count})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterView('passed')}
                        className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                            filterView === 'passed'
                                ? 'bg-green-600 text-white'
                                : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/40'
                        }`}
                    >
                        Passed ({step.results.passed})
                    </button>
                    <button
                        type="button"
                        onClick={() => setFilterView('failed')}
                        className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                            filterView === 'failed'
                                ? 'bg-red-600 text-white'
                                : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40'
                        }`}
                    >
                        Failed ({step.results.failed})
                    </button>
                </div>

                {/* Inline Search Filter */}
                <div>
                    <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filter by title, abstract, PMID, or reasoning..."
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {searchFilter && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Showing {filteredResults.length} of {viewFilteredResults.length} articles
                        </p>
                    )}
                </div>

                {/* Filtered Results */}
                <div className="space-y-2">
                    {filteredResults.slice(0, 20).map((result: any, idx: number) => {
                        // Get all articles for navigation (from the filtered view)
                        const articlesForViewer = filteredResults.map((r: any) => r.article);
                        return (
                            <div
                                key={idx}
                                onClick={() => onArticleClick?.(articlesForViewer, idx)}
                                className={`border border-gray-200 dark:border-gray-700 rounded p-3 text-sm ${
                                    onArticleClick ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors' : ''
                                }`}
                            >
                                <div className="flex items-center gap-2 mb-1">
                                    {result.passed ? (
                                        <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                    ) : (
                                        <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                                    )}
                                    <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                        PMID: {result.article.pmid || result.article.id}
                                    </p>
                                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                        Score: {result.score.toFixed(2)}
                                    </span>
                                </div>
                                <p className="text-gray-900 dark:text-white mb-1">{result.article.title}</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 italic">{result.reasoning}</p>
                            </div>
                        );
                    })}
                    {filteredResults.length > 20 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                            Showing 20 of {filteredResults.length} articles
                        </p>
                    )}
                    {filteredResults.length === 0 && searchFilter && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                            No articles match your filter
                        </p>
                    )}
                    {filteredResults.length === 0 && !searchFilter && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                            No {filterView === 'passed' ? 'passed' : filterView === 'failed' ? 'failed' : ''} articles
                        </p>
                    )}
                </div>
            </div>
        );
    }

    // Source step - SourceResponse: { articles: CanonicalResearchArticle[], count, metadata }
    const articles = step.results.articles || [];

    // Filter articles by search term
    const filteredArticles = searchFilter.trim()
        ? articles.filter((article: any) => {
            const searchLower = searchFilter.toLowerCase();
            return (
                article.title?.toLowerCase().includes(searchLower) ||
                article.abstract?.toLowerCase().includes(searchLower) ||
                (article.pmid || article.id || '').toLowerCase().includes(searchLower)
            );
        })
        : articles;

    return (
        <div className="space-y-3">
            {/* Inline Search Filter */}
            <div>
                <input
                    type="text"
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder="Filter by title, abstract, or PMID..."
                    className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {searchFilter && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Showing {filteredArticles.length} of {articles.length} articles
                    </p>
                )}
            </div>

            {/* Article List */}
            <div className="space-y-2">
                {filteredArticles.slice(0, 20).map((article: any, idx: number) => (
                    <div
                        key={idx}
                        onClick={() => onArticleClick?.(filteredArticles, idx)}
                        className={`border border-gray-200 dark:border-gray-700 rounded p-3 text-sm ${
                            onArticleClick ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors' : ''
                        }`}
                    >
                        <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mb-1">
                            PMID: {article.pmid || article.id}
                        </p>
                        <p className="text-gray-900 dark:text-white">{article.title}</p>
                        {article.abstract && (
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                                {article.abstract}
                            </p>
                        )}
                    </div>
                ))}
                {filteredArticles.length > 20 && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                        Showing 20 of {filteredArticles.length} articles
                    </p>
                )}
                {filteredArticles.length === 0 && searchFilter && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                        No articles match your filter
                    </p>
                )}
            </div>
        </div>
    );
}

// Compare Results View
function CompareResultsView({ step, compareIds, onCompareIdsChange }: { step: WorkflowStep; compareIds: string; onCompareIdsChange: (ids: string) => void }) {
    const [comparisonResult, setComparisonResult] = useState<any>(null);
    const [isComparing, setIsComparing] = useState(false);

    const runComparison = async () => {
        setIsComparing(true);
        try {
            // Parse expected PMIDs from textarea
            const expectedPmids = compareIds
                .split(/[\n,]/)
                .map(id => id.trim())
                .filter(id => id.length > 0);

            // Get retrieved PMIDs from step results
            let retrievedPmids: string[] = [];
            if (step.type === 'source') {
                retrievedPmids = step.results.articles
                    .map((a: any) => a.pmid || a.id)
                    .filter((id: string) => id);
            } else if (step.type === 'filter') {
                retrievedPmids = step.results.results
                    .map((r: any) => r.article.pmid || r.article.id)
                    .filter((id: string) => id);
            } else if (step.type === 'categorize') {
                retrievedPmids = step.results.results
                    .map((r: any) => r.article.pmid || r.article.id)
                    .filter((id: string) => id);
            }

            const result = await retrievalTestingApi.comparePmids({
                retrieved_pmids: retrievedPmids,
                expected_pmids: expectedPmids
            });

            setComparisonResult(result);
        } catch (error) {
            console.error('Comparison failed:', error);
        } finally {
            setIsComparing(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded p-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Expected PMIDs (one per line or comma-separated)
                </label>
                <textarea
                    value={compareIds}
                    onChange={(e) => onCompareIdsChange(e.target.value)}
                    placeholder="38123456&#10;38123457&#10;38123458"
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white font-mono text-sm"
                />
                <button
                    type="button"
                    onClick={runComparison}
                    disabled={isComparing || !compareIds.trim()}
                    className={`mt-3 px-4 py-2 text-sm rounded ${isComparing || !compareIds.trim()
                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                            : 'bg-yellow-600 text-white hover:bg-yellow-700'
                        }`}
                >
                    {isComparing ? 'Comparing...' : 'Run Comparison'}
                </button>
            </div>

            {comparisonResult && (
                <div className="space-y-4">
                    {/* Metrics Summary */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded p-3 text-center">
                            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                {(comparisonResult.recall * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Recall</p>
                        </div>
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded p-3 text-center">
                            <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                {(comparisonResult.precision * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Precision</p>
                        </div>
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-3 text-center">
                            <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                {(comparisonResult.f1_score * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">F1 Score</p>
                        </div>
                    </div>

                    {/* Details */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Matched ({comparisonResult.matched_count})
                                </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto font-mono">
                                {comparisonResult.matched.join(', ') || 'None'}
                            </div>
                        </div>
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Missed ({comparisonResult.missed_count})
                                </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto font-mono">
                                {comparisonResult.missed.join(', ') || 'None'}
                            </div>
                        </div>
                        <div className="border border-gray-200 dark:border-gray-700 rounded p-3">
                            <div className="flex items-center gap-2 mb-2">
                                <PlusIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                                <span className="text-sm font-medium text-gray-900 dark:text-white">
                                    Extra ({comparisonResult.extra_count})
                                </span>
                            </div>
                            <div className="text-xs text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto font-mono">
                                {comparisonResult.extra.join(', ') || 'None'}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Analyze Results View
function AnalyzeResultsView({ step }: { step: WorkflowStep }) {
    return (
        <div className="space-y-4">
            <div className="border border-gray-200 dark:border-gray-700 rounded p-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">Analysis</h4>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    Statistical analysis and visualizations will appear here
                </p>
            </div>
        </div>
    );
}

// ============================================================================
// Version History Sidebar
// ============================================================================

interface VersionHistorySidebarProps {
    snapshots: QuerySnapshot[];
    selectedSnapshotId: string | null;
    onSelectSnapshot: (id: string) => void;
    compareMode: boolean;
    compareSnapshots: [string, string] | null;
    onToggleCompareMode: () => void;
    onSelectForCompare: (id: string) => void;
    onSetCompareFirst: (id: string) => void;
    onUpdateLabel: (id: string, label: string) => void;
    onDeleteSnapshot: (id: string) => void;
    isOpen: boolean;
    onToggleOpen: () => void;
}

function VersionHistorySidebar({
    snapshots,
    selectedSnapshotId,
    onSelectSnapshot,
    compareMode,
    compareSnapshots,
    onToggleCompareMode,
    onSelectForCompare,
    onSetCompareFirst,
    onUpdateLabel,
    onDeleteSnapshot,
    isOpen,
    onToggleOpen
}: VersionHistorySidebarProps) {
    const [editingLabelId, setEditingLabelId] = useState<string | null>(null);
    const [editingLabelValue, setEditingLabelValue] = useState('');

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getStepIcon = (stepType: 'source' | 'filter' | 'categorize') => {
        switch (stepType) {
            case 'source': return <BeakerIcon className="h-4 w-4 text-blue-500" />;
            case 'filter': return <FunnelIcon className="h-4 w-4 text-purple-500" />;
            case 'categorize': return <TagIcon className="h-4 w-4 text-green-500" />;
        }
    };

    const getSnapshotSummary = (snapshot: QuerySnapshot) => {
        if (snapshot.stepType === 'source') {
            return snapshot.queryExpression?.substring(0, 40) + (snapshot.queryExpression && snapshot.queryExpression.length > 40 ? '...' : '');
        } else if (snapshot.stepType === 'filter') {
            return `Filter: ${snapshot.filterCriteria?.substring(0, 30)}...`;
        }
        return 'Categorization';
    };

    if (!isOpen) {
        return (
            <div className="flex-shrink-0">
                <button
                    type="button"
                    onClick={onToggleOpen}
                    className="flex items-center justify-center w-8 h-24 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-l-lg border border-r-0 border-gray-300 dark:border-gray-600 transition-colors"
                    title="Open version history"
                >
                    <div className="flex flex-col items-center gap-1">
                        <ClockIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        <ChevronDoubleLeftIcon className="h-3 w-3 text-gray-500 dark:text-gray-500" />
                        {snapshots.length > 0 && (
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{snapshots.length}</span>
                        )}
                    </div>
                </button>
            </div>
        );
    }

    return (
        <div className="w-64 flex-shrink-0 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
            {/* Header */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-3">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                        <h3 className="font-medium text-sm text-gray-900 dark:text-white">Version History</h3>
                    </div>
                    <button
                        type="button"
                        onClick={onToggleOpen}
                        className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        title="Close history panel"
                    >
                        <ChevronDoubleRightIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                    </button>
                </div>
                {snapshots.length > 1 && (
                    <button
                        type="button"
                        onClick={onToggleCompareMode}
                        className={`w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded transition-colors ${
                            compareMode
                                ? 'bg-blue-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        <ArrowsRightLeftIcon className="h-3 w-3" />
                        {compareMode ? 'Exit Compare' : 'Compare Versions'}
                    </button>
                )}
            </div>

            {/* Snapshot List */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {snapshots.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <ClockIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p className="text-xs">Run queries to build version history</p>
                    </div>
                ) : (
                    snapshots.map((snapshot, index) => {
                        const isSelected = selectedSnapshotId === snapshot.id;
                        const isCompareA = compareSnapshots?.[0] === snapshot.id;
                        const isCompareB = compareSnapshots?.[1] === snapshot.id && compareSnapshots[0] !== compareSnapshots[1];
                        const versionNumber = snapshots.length - index;

                        return (
                            <div
                                key={snapshot.id}
                                className={`border rounded-lg p-2 cursor-pointer transition-colors ${
                                    isSelected && !compareMode
                                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                        : isCompareA
                                        ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
                                        : isCompareB
                                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                                        : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'
                                }`}
                                onClick={() => {
                                    if (compareMode) {
                                        onSelectForCompare(snapshot.id);
                                    } else {
                                        onSelectSnapshot(snapshot.id);
                                    }
                                }}
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-1.5">
                                        {getStepIcon(snapshot.stepType)}
                                        <span className="text-xs font-medium text-gray-900 dark:text-white">
                                            v{versionNumber}
                                        </span>
                                        {compareMode && isCompareA && (
                                            <span className="px-1 py-0.5 text-[10px] bg-orange-500 text-white rounded">A</span>
                                        )}
                                        {compareMode && isCompareB && (
                                            <span className="px-1 py-0.5 text-[10px] bg-green-500 text-white rounded">B</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                        <span className="text-[10px] text-gray-500 dark:text-gray-400">
                                            {formatTime(snapshot.timestamp)}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteSnapshot(snapshot.id);
                                            }}
                                            className="p-0.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
                                            title="Delete snapshot"
                                        >
                                            <TrashIcon className="h-3 w-3" />
                                        </button>
                                    </div>
                                </div>

                                {/* Label (editable) */}
                                {editingLabelId === snapshot.id ? (
                                    <input
                                        type="text"
                                        value={editingLabelValue}
                                        onChange={(e) => setEditingLabelValue(e.target.value)}
                                        onBlur={() => {
                                            onUpdateLabel(snapshot.id, editingLabelValue);
                                            setEditingLabelId(null);
                                        }}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                onUpdateLabel(snapshot.id, editingLabelValue);
                                                setEditingLabelId(null);
                                            }
                                            if (e.key === 'Escape') {
                                                setEditingLabelId(null);
                                            }
                                        }}
                                        autoFocus
                                        className="w-full px-1 py-0.5 text-xs border border-blue-500 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                        placeholder="Add label..."
                                        onClick={(e) => e.stopPropagation()}
                                    />
                                ) : snapshot.label ? (
                                    <p
                                        className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate cursor-text"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingLabelId(snapshot.id);
                                            setEditingLabelValue(snapshot.label || '');
                                        }}
                                    >
                                        {snapshot.label}
                                    </p>
                                ) : (
                                    <p
                                        className="text-[10px] text-gray-400 dark:text-gray-500 italic cursor-text hover:text-gray-600 dark:hover:text-gray-400"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingLabelId(snapshot.id);
                                            setEditingLabelValue('');
                                        }}
                                    >
                                        + Add label
                                    </p>
                                )}

                                {/* Summary */}
                                <p className="text-[10px] text-gray-600 dark:text-gray-400 truncate mt-1">
                                    {getSnapshotSummary(snapshot)}
                                </p>

                                {/* Article count - show total matched */}
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px]">
                                        {snapshot.totalCount !== snapshot.articleCount ? (
                                            <><span className="font-semibold text-blue-600 dark:text-blue-400">{snapshot.totalCount.toLocaleString()}</span> <span className="text-gray-500 dark:text-gray-400">matched</span></>
                                        ) : (
                                            <span className="text-gray-500 dark:text-gray-400">{snapshot.articleCount} articles</span>
                                        )}
                                    </span>
                                    {snapshot.passedCount !== undefined && (
                                        <span className="text-[10px] text-green-600 dark:text-green-400">
                                            {snapshot.passedCount} passed
                                        </span>
                                    )}
                                </div>

                                {/* Compare mode: Set as A button */}
                                {compareMode && !isCompareA && (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onSetCompareFirst(snapshot.id);
                                        }}
                                        className="mt-1 text-[10px] text-orange-600 dark:text-orange-400 hover:underline"
                                    >
                                        Set as A
                                    </button>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ============================================================================
// Snapshot Results Pane (displays a single snapshot)
// ============================================================================

interface SnapshotResultsPaneProps {
    snapshot: QuerySnapshot | undefined;
    onClose: () => void;
    onCollapse: () => void;
    onArticleClick?: (articles: CanonicalResearchArticle[], index: number) => void;
    onUseQuery?: (query: string) => void;
    onUseFilter?: (criteria: string, threshold: number) => void;
}

function SnapshotResultsPane({ snapshot, onClose, onCollapse, onArticleClick, onUseQuery, onUseFilter }: SnapshotResultsPaneProps) {
    const [searchFilter, setSearchFilter] = useState('');

    if (!snapshot) {
        return null;
    }

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // Filter articles by search term
    const filteredArticles = searchFilter.trim()
        ? snapshot.articles.filter(article => {
            const searchLower = searchFilter.toLowerCase();
            return (
                article.title?.toLowerCase().includes(searchLower) ||
                article.abstract?.toLowerCase().includes(searchLower) ||
                (article.pmid || article.id || '').toLowerCase().includes(searchLower)
            );
        })
        : snapshot.articles;

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
            {/* Header */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-4">
                <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                        <ClockIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-medium text-gray-900 dark:text-white">
                            Snapshot: {snapshot.label || formatTime(snapshot.timestamp)}
                        </h3>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                        >
                            Back to Live
                        </button>
                        <button
                            type="button"
                            onClick={onCollapse}
                            className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                            title="Collapse"
                        >
                            <ChevronRightIcon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                        </button>
                    </div>
                </div>

                {/* Snapshot metadata */}
                <div className="text-xs text-gray-600 dark:text-gray-400 space-y-1">
                    <p><strong>Type:</strong> {snapshot.stepType}</p>
                    {snapshot.queryExpression && (
                        <div className="flex items-start gap-2">
                            <p className="flex-1"><strong>Query:</strong> {snapshot.queryExpression}</p>
                            {onUseQuery && (
                                <button
                                    type="button"
                                    onClick={() => onUseQuery(snapshot.queryExpression!)}
                                    className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-800 rounded transition-colors whitespace-nowrap"
                                >
                                    Use Query
                                </button>
                            )}
                        </div>
                    )}
                    {snapshot.filterCriteria && (
                        <div className="flex items-start gap-2">
                            <p className="flex-1"><strong>Filter:</strong> {snapshot.filterCriteria} (threshold: {snapshot.filterThreshold})</p>
                            {onUseFilter && snapshot.filterThreshold !== undefined && (
                                <button
                                    type="button"
                                    onClick={() => onUseFilter(snapshot.filterCriteria!, snapshot.filterThreshold!)}
                                    className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300 hover:bg-purple-200 dark:hover:bg-purple-800 rounded transition-colors whitespace-nowrap"
                                >
                                    Use Filter
                                </button>
                            )}
                        </div>
                    )}
                    <p>
                        <strong>Total Matched:</strong> {snapshot.totalCount.toLocaleString()} articles
                        {snapshot.totalCount !== snapshot.articleCount && (
                            <span className="text-gray-400"> (showing {snapshot.articleCount})</span>
                        )}
                    </p>
                    {snapshot.passedCount !== undefined && (
                        <p><strong>Filter Results:</strong> {snapshot.passedCount} passed, {snapshot.failedCount} failed</p>
                    )}
                </div>

                {/* Inline Search Filter */}
                <div className="mt-3">
                    <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filter by title, abstract, or PMID..."
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {searchFilter && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Showing {filteredArticles.length} of {snapshot.articles.length} articles
                        </p>
                    )}
                </div>
            </div>

            {/* Articles List */}
            <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-2">
                    {filteredArticles.slice(0, 50).map((article, idx) => (
                        <div
                            key={idx}
                            onClick={() => onArticleClick?.(filteredArticles, idx)}
                            className={`border border-gray-200 dark:border-gray-700 rounded p-3 text-sm ${
                                onArticleClick ? 'cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors' : ''
                            }`}
                        >
                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400 mb-1">
                                PMID: {article.pmid || article.id}
                            </p>
                            <p className="text-gray-900 dark:text-white">{article.title}</p>
                            {article.abstract && (
                                <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                                    {article.abstract}
                                </p>
                            )}
                        </div>
                    ))}
                    {filteredArticles.length > 50 && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                            Showing 50 of {filteredArticles.length} articles
                        </p>
                    )}
                    {filteredArticles.length === 0 && searchFilter && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
                            No articles match your filter
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Snapshot Compare View
// ============================================================================

interface SnapshotCompareViewProps {
    snapshotA: QuerySnapshot | undefined;
    snapshotB: QuerySnapshot | undefined;
    onClose: () => void;
    onUseAsSource: (pmids: string[], label: string) => void;
    onArticleClick?: (articles: CanonicalResearchArticle[], index: number) => void;
}

function SnapshotCompareView({ snapshotA, snapshotB, onClose, onUseAsSource, onArticleClick }: SnapshotCompareViewProps) {
    const [activeTab, setActiveTab] = useState<'only_a' | 'both' | 'only_b'>('only_a');
    const [copiedGroup, setCopiedGroup] = useState<string | null>(null);
    const [copyError, setCopyError] = useState(false);
    const [searchFilter, setSearchFilter] = useState('');

    // Semantic filter preview state
    const [showFilterPreview, setShowFilterPreview] = useState(false);
    const [filterCriteria, setFilterCriteria] = useState('');
    const [filterThreshold, setFilterThreshold] = useState(0.7);
    const [isRunningFilter, setIsRunningFilter] = useState(false);
    const [filterResults, setFilterResults] = useState<Map<string, { passed: boolean; score: number; reasoning: string }> | null>(null);
    const [filterError, setFilterError] = useState<string | null>(null);

    // Copy to clipboard handler
    const handleCopy = async (text: string, group: string) => {
        setCopyError(false);
        const result = await copyToClipboard(text);
        if (result.success) {
            setCopiedGroup(group);
            setTimeout(() => setCopiedGroup(null), 2000);
        } else {
            setCopyError(true);
            setTimeout(() => setCopyError(false), 2000);
        }
    };

    // Run semantic filter preview on displayed articles
    const runFilterPreview = async (articles: CanonicalResearchArticle[]) => {
        if (!filterCriteria.trim()) {
            setFilterError('Please enter filter criteria');
            return;
        }

        setIsRunningFilter(true);
        setFilterError(null);

        try {
            const response = await retrievalTestingApi.testFilter({
                articles,
                filter_criteria: filterCriteria,
                threshold: filterThreshold
            });

            // Build a map of PMID -> result for quick lookup
            const resultsMap = new Map<string, { passed: boolean; score: number; reasoning: string }>();
            for (const result of response.results || []) {
                const pmid = result.article.pmid || result.article.id || '';
                resultsMap.set(pmid, {
                    passed: result.passed,
                    score: result.score,
                    reasoning: result.reasoning
                });
            }
            setFilterResults(resultsMap);
        } catch (err) {
            console.error('Filter preview error:', err);
            setFilterError(err instanceof Error ? err.message : 'Failed to run filter');
        } finally {
            setIsRunningFilter(false);
        }
    };

    if (!snapshotA || !snapshotB) {
        return (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 p-8">
                <div className="text-center text-gray-500 dark:text-gray-400">
                    <ArrowsRightLeftIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>Select two versions to compare</p>
                </div>
            </div>
        );
    }

    // Compare using ALL matched PMIDs (not just the sample articles)
    // This ensures we're comparing the full query results, not just what was returned
    const aIds = new Set(snapshotA.allMatchedPmids);
    const bIds = new Set(snapshotB.allMatchedPmids);

    const onlyInAPmids = snapshotA.allMatchedPmids.filter(id => !bIds.has(id));
    const onlyInBPmids = snapshotB.allMatchedPmids.filter(id => !aIds.has(id));
    const inBothPmids = snapshotA.allMatchedPmids.filter(id => bIds.has(id));

    // Get article data for display (only for PMIDs we have full data for)
    const getArticleId = (article: CanonicalResearchArticle) => article.pmid || article.id || '';
    const aArticleMap = new Map(snapshotA.articles.map(a => [getArticleId(a), a]));
    const bArticleMap = new Map(snapshotB.articles.map(a => [getArticleId(a), a]));

    // Get displayable articles (ones we have full data for)
    const onlyInA = onlyInAPmids
        .map(id => aArticleMap.get(id))
        .filter((a): a is CanonicalResearchArticle => a !== undefined);
    const onlyInB = onlyInBPmids
        .map(id => bArticleMap.get(id))
        .filter((a): a is CanonicalResearchArticle => a !== undefined);
    const inBoth = inBothPmids
        .map(id => aArticleMap.get(id) || bArticleMap.get(id))
        .filter((a): a is CanonicalResearchArticle => a !== undefined);

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };

    const getDisplayArticles = () => {
        switch (activeTab) {
            case 'only_a': return onlyInA;
            case 'only_b': return onlyInB;
            case 'both': return inBoth;
        }
    };

    const getPmidCount = () => {
        switch (activeTab) {
            case 'only_a': return onlyInAPmids.length;
            case 'only_b': return onlyInBPmids.length;
            case 'both': return inBothPmids.length;
        }
    };

    return (
        <div className="border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 flex flex-col" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
            {/* Header */}
            <div className="border-b border-gray-300 dark:border-gray-600 p-4">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <ArrowsRightLeftIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        <h3 className="font-medium text-gray-900 dark:text-white">
                            Comparing Versions
                        </h3>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
                    >
                        Exit Compare
                    </button>
                </div>

                {/* Version badges - show TOTAL matched counts */}
                <div className="flex items-center gap-4 mb-3 text-sm">
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-orange-500 text-white rounded text-xs font-medium">A</span>
                        <span className="text-gray-700 dark:text-gray-300">
                            {snapshotA.label || formatTime(snapshotA.timestamp)} ({snapshotA.totalCount.toLocaleString()} total)
                        </span>
                    </div>
                    <ArrowsRightLeftIcon className="h-4 w-4 text-gray-400" />
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-green-500 text-white rounded text-xs font-medium">B</span>
                        <span className="text-gray-700 dark:text-gray-300">
                            {snapshotB.label || formatTime(snapshotB.timestamp)} ({snapshotB.totalCount.toLocaleString()} total)
                        </span>
                    </div>
                </div>

                {/* Summary stats - use PMID counts (the full comparison) */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                    {/* Only in A */}
                    <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded p-2">
                        <div className="text-center mb-2">
                            <p className="text-lg font-bold text-orange-600 dark:text-orange-400">{onlyInAPmids.length.toLocaleString()}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Only in A</p>
                        </div>
                        {onlyInAPmids.length > 0 && (
                            <div className="flex gap-1 justify-center">
                                <button
                                    type="button"
                                    onClick={() => handleCopy(onlyInAPmids.join('\n'), 'only_a')}
                                    className="px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-orange-300 dark:border-orange-600 rounded hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors flex items-center gap-1"
                                    title="Copy PMIDs to clipboard"
                                >
                                    <ClipboardDocumentIcon className="h-3 w-3" />
                                    {copiedGroup === 'only_a' ? 'Copied!' : copyError ? 'Failed' : 'Copy'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onUseAsSource(onlyInAPmids, 'Only in A')}
                                    className="px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-orange-300 dark:border-orange-600 rounded hover:bg-orange-100 dark:hover:bg-orange-900/50 transition-colors flex items-center gap-1"
                                    title="Use these PMIDs as source for testing"
                                >
                                    <DocumentArrowDownIcon className="h-3 w-3" />
                                    Use
                                </button>
                            </div>
                        )}
                    </div>
                    {/* In Both */}
                    <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-2">
                        <div className="text-center mb-2">
                            <p className="text-lg font-bold text-gray-600 dark:text-gray-400">{inBothPmids.length.toLocaleString()}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">In Both</p>
                        </div>
                        {inBothPmids.length > 0 && (
                            <div className="flex gap-1 justify-center">
                                <button
                                    type="button"
                                    onClick={() => handleCopy(inBothPmids.join('\n'), 'both')}
                                    className="px-2 py-1 text-xs bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors flex items-center gap-1"
                                    title="Copy PMIDs to clipboard"
                                >
                                    <ClipboardDocumentIcon className="h-3 w-3" />
                                    {copiedGroup === 'both' ? 'Copied!' : copyError ? 'Failed' : 'Copy'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onUseAsSource(inBothPmids, 'In Both')}
                                    className="px-2 py-1 text-xs bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-500 rounded hover:bg-gray-100 dark:hover:bg-gray-500 transition-colors flex items-center gap-1"
                                    title="Use these PMIDs as source for testing"
                                >
                                    <DocumentArrowDownIcon className="h-3 w-3" />
                                    Use
                                </button>
                            </div>
                        )}
                    </div>
                    {/* Only in B */}
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded p-2">
                        <div className="text-center mb-2">
                            <p className="text-lg font-bold text-green-600 dark:text-green-400">{onlyInBPmids.length.toLocaleString()}</p>
                            <p className="text-xs text-gray-600 dark:text-gray-400">Only in B</p>
                        </div>
                        {onlyInBPmids.length > 0 && (
                            <div className="flex gap-1 justify-center">
                                <button
                                    type="button"
                                    onClick={() => handleCopy(onlyInBPmids.join('\n'), 'only_b')}
                                    className="px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-green-300 dark:border-green-600 rounded hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors flex items-center gap-1"
                                    title="Copy PMIDs to clipboard"
                                >
                                    <ClipboardDocumentIcon className="h-3 w-3" />
                                    {copiedGroup === 'only_b' ? 'Copied!' : copyError ? 'Failed' : 'Copy'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onUseAsSource(onlyInBPmids, 'Only in B')}
                                    className="px-2 py-1 text-xs bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-green-300 dark:border-green-600 rounded hover:bg-green-100 dark:hover:bg-green-900/50 transition-colors flex items-center gap-1"
                                    title="Use these PMIDs as source for testing"
                                >
                                    <DocumentArrowDownIcon className="h-3 w-3" />
                                    Use
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs - show PMID count vs displayable count */}
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('only_a')}
                        className={`px-3 py-1 text-sm rounded ${
                            activeTab === 'only_a'
                                ? 'bg-orange-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        Only in A ({onlyInAPmids.length.toLocaleString()})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('both')}
                        className={`px-3 py-1 text-sm rounded ${
                            activeTab === 'both'
                                ? 'bg-gray-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        In Both ({inBothPmids.length.toLocaleString()})
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('only_b')}
                        className={`px-3 py-1 text-sm rounded ${
                            activeTab === 'only_b'
                                ? 'bg-green-600 text-white'
                                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                        }`}
                    >
                        Only in B ({onlyInBPmids.length.toLocaleString()})
                    </button>
                </div>

                {/* Inline Search Filter */}
                <div className="mt-3">
                    <input
                        type="text"
                        value={searchFilter}
                        onChange={(e) => setSearchFilter(e.target.value)}
                        placeholder="Filter by title, abstract, or PMID..."
                        className="w-full px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                </div>

                {/* Semantic Filter Preview */}
                <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
                    <button
                        type="button"
                        onClick={() => {
                            setShowFilterPreview(!showFilterPreview);
                            if (!showFilterPreview) {
                                setFilterResults(null); // Clear results when collapsing
                            }
                        }}
                        className="flex items-center gap-2 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                    >
                        <FunnelIcon className="h-4 w-4" />
                        {showFilterPreview ? 'Hide' : 'Preview'} Semantic Filter
                        {showFilterPreview ? (
                            <ChevronDownIcon className="h-4 w-4" />
                        ) : (
                            <ChevronRightIcon className="h-4 w-4" />
                        )}
                    </button>

                    {showFilterPreview && (
                        <div className="mt-2 space-y-2 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3">
                            <p className="text-xs text-purple-700 dark:text-purple-300">
                                Test how a semantic filter would classify these articles without adding a formal filter step.
                            </p>
                            <textarea
                                value={filterCriteria}
                                onChange={(e) => setFilterCriteria(e.target.value)}
                                placeholder="Describe what articles should pass (e.g., 'Studies with clinical trial data on human subjects')"
                                rows={2}
                                className="w-full px-3 py-2 text-sm border border-purple-300 dark:border-purple-700 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                            <div className="flex items-center gap-3">
                                <label className="text-xs text-gray-600 dark:text-gray-400 flex items-center gap-2">
                                    Threshold:
                                    <input
                                        type="number"
                                        value={filterThreshold}
                                        onChange={(e) => setFilterThreshold(parseFloat(e.target.value) || 0.7)}
                                        min="0"
                                        max="1"
                                        step="0.1"
                                        className="w-16 px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </label>
                                <button
                                    type="button"
                                    onClick={() => runFilterPreview(getDisplayArticles())}
                                    disabled={isRunningFilter || !filterCriteria.trim()}
                                    className={`px-3 py-1.5 text-xs font-medium rounded transition-colors flex items-center gap-1 ${
                                        isRunningFilter || !filterCriteria.trim()
                                            ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                                            : 'bg-purple-600 text-white hover:bg-purple-700'
                                    }`}
                                >
                                    {isRunningFilter ? (
                                        <>
                                            <ArrowPathIcon className="h-3 w-3 animate-spin" />
                                            Running...
                                        </>
                                    ) : (
                                        <>
                                            <PlayIcon className="h-3 w-3" />
                                            Preview
                                        </>
                                    )}
                                </button>
                                {filterResults && (
                                    <button
                                        type="button"
                                        onClick={() => setFilterResults(null)}
                                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                                    >
                                        Clear
                                    </button>
                                )}
                            </div>
                            {filterError && (
                                <p className="text-xs text-red-600 dark:text-red-400">{filterError}</p>
                            )}
                            {filterResults && (
                                <div className="flex gap-4 text-xs">
                                    <span className="text-green-600 dark:text-green-400 flex items-center gap-1">
                                        <CheckCircleIcon className="h-4 w-4" />
                                        {Array.from(filterResults.values()).filter(r => r.passed).length} passed
                                    </span>
                                    <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                                        <XCircleIcon className="h-4 w-4" />
                                        {Array.from(filterResults.values()).filter(r => !r.passed).length} failed
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Article List */}
            <div className="flex-1 overflow-y-auto p-4">
                {(() => {
                    const displayArticles = getDisplayArticles();
                    const filteredArticles = searchFilter.trim()
                        ? displayArticles.filter(article => {
                            const searchLower = searchFilter.toLowerCase();
                            return (
                                article.title?.toLowerCase().includes(searchLower) ||
                                article.abstract?.toLowerCase().includes(searchLower) ||
                                (article.pmid || article.id || '').toLowerCase().includes(searchLower)
                            );
                        })
                        : displayArticles;

                    return (
                        <div className="space-y-2">
                            {searchFilter && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                    Showing {filteredArticles.length} of {displayArticles.length} articles
                                </p>
                            )}
                            {filteredArticles.slice(0, 50).map((article, idx) => {
                                const pmid = article.pmid || article.id || '';
                                const filterResult = filterResults?.get(pmid);

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => onArticleClick?.(filteredArticles, idx)}
                                        className={`border rounded p-3 text-sm transition-colors ${
                                            filterResult
                                                ? filterResult.passed
                                                    ? 'border-green-400 dark:border-green-600 bg-green-50 dark:bg-green-900/20'
                                                    : 'border-red-400 dark:border-red-600 bg-red-50 dark:bg-red-900/20'
                                                : activeTab === 'only_a'
                                                ? 'border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-900/10'
                                                : activeTab === 'only_b'
                                                ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10'
                                                : 'border-gray-200 dark:border-gray-700'
                                        } ${onArticleClick ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 dark:hover:ring-blue-500' : ''}`}
                                    >
                                        <div className="flex items-center gap-2 mb-1">
                                            {filterResult && (
                                                filterResult.passed ? (
                                                    <CheckCircleIcon className="h-4 w-4 text-green-600 dark:text-green-400 flex-shrink-0" />
                                                ) : (
                                                    <XCircleIcon className="h-4 w-4 text-red-600 dark:text-red-400 flex-shrink-0" />
                                                )
                                            )}
                                            <p className="font-mono text-xs text-gray-500 dark:text-gray-400">
                                                PMID: {pmid}
                                            </p>
                                            {filterResult && (
                                                <span className={`text-xs font-medium ${filterResult.passed ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                                    Score: {filterResult.score.toFixed(2)}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-gray-900 dark:text-white">{article.title}</p>
                                        {filterResult && filterResult.reasoning && (
                                            <p className="text-xs text-purple-600 dark:text-purple-400 mt-1 italic">
                                                {filterResult.reasoning}
                                            </p>
                                        )}
                                        {article.abstract && !filterResult && (
                                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2 line-clamp-2">
                                                {article.abstract}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                            {/* Show info about what we're displaying vs total count */}
                            {getPmidCount() > displayArticles.length && !searchFilter && (
                                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded p-3 text-center">
                                    <p className="text-xs text-blue-800 dark:text-blue-200">
                                        <strong>{getPmidCount().toLocaleString()} PMIDs</strong> in this category.
                                        {displayArticles.length > 0 ? (
                                            <> Showing {Math.min(50, displayArticles.length)} articles with full metadata.</>
                                        ) : (
                                            <> Full article data not available for display (PMIDs not in sample).</>
                                        )}
                                    </p>
                                </div>
                            )}
                            {filteredArticles.length > 50 && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 text-center py-2">
                                    Showing 50 of {filteredArticles.length} articles with full data
                                </p>
                            )}
                            {filteredArticles.length === 0 && searchFilter && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <p className="text-sm">No articles match your filter</p>
                                </div>
                            )}
                            {displayArticles.length === 0 && getPmidCount() === 0 && !searchFilter && (
                                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                    <p className="text-sm">No articles in this category</p>
                                </div>
                            )}
                        </div>
                    );
                })()}
            </div>
        </div>
    );
}
