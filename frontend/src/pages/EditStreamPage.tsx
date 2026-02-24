import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftIcon, UserIcon, BuildingOfficeIcon, GlobeAltIcon, ArrowUpIcon, ChatBubbleLeftRightIcon } from '@heroicons/react/24/outline';

import {
    ReportFrequency,
    Category,
    SemanticSpace,
    Topic,
    Entity,
    RetrievalConfig,
    Concept,
    ResearchStream,
    ScheduleConfig,
    BroadQuery,
    SemanticFilter
} from '../types';

import { useResearchStream } from '../context/ResearchStreamContext';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../lib/api/adminApi';
import { showErrorToast, showSuccessToast } from '../lib/errorToast';

// Scope badge component (same as in StreamsPage)
const ScopeBadge = ({ scope }: { scope: string }) => {
    const config = {
        personal: {
            icon: UserIcon,
            label: 'Personal',
            className: 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
        },
        organization: {
            icon: BuildingOfficeIcon,
            label: 'Organization',
            className: 'bg-purple-100 dark:bg-purple-900/50 text-purple-700 dark:text-purple-300'
        },
        global: {
            icon: GlobeAltIcon,
            label: 'Global',
            className: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
        }
    };

    const { icon: Icon, label, className } = config[scope as keyof typeof config] || config.personal;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-sm font-medium ${className}`}>
            <Icon className="h-4 w-4" />
            {label}
        </span>
    );
};
import SemanticSpaceForm from '../components/stream/SemanticSpaceForm';
import PresentationForm from '../components/stream/PresentationForm';
import RetrievalConfigForm from '../components/stream/RetrievalConfigForm';
import TestRefineTab, { ExecuteSubTab } from '../components/stream/TestRefineTab';
import { WorkbenchState } from '../components/stream/QueryRefinementWorkbench';
import ContentEnrichmentForm from '../components/stream/ContentEnrichmentForm';
import CategorizationPromptForm from '../components/stream/CategorizationPromptForm';
import StanceAnalysisPromptForm from '../components/stream/StanceAnalysisPromptForm';
import ChatTray from '../components/chat/ChatTray';
import { promptTestingApi, PromptTemplate, SlugInfo } from '../lib/api/promptTestingApi';
import { researchStreamApi } from '../lib/api/researchStreamApi';
import SchemaProposalCard from '../components/chat/SchemaProposalCard';
import PresentationCategoriesCard from '../components/chat/PresentationCategoriesCard';
import PromptSuggestionsCard from '../components/chat/PromptSuggestionsCard';
import RetrievalProposalCard from '../components/chat/RetrievalProposalCard';
import QuerySuggestionCard from '../components/chat/QuerySuggestionCard';
import FilterSuggestionCard from '../components/chat/FilterSuggestionCard';

type TabType = 'semantic' | 'retrieval' | 'presentation' | 'enrichment' | 'article-analysis' | 'execute';
type PresentationSubTab = 'categories' | 'categorization-prompt';

interface PromptSuggestion {
    target: 'system_prompt' | 'user_prompt_template';
    current_issue: string;
    suggested_text: string;
    reasoning: string;
}

interface AppliedPromptSuggestions {
    prompt_type: 'executive_summary' | 'category_summary';
    suggestions: PromptSuggestion[];
}

interface RetrievalProposalQuery {
    query_id: string;
    query_string: string;
    rationale?: string;
    covered_topics?: string[];
}

interface RetrievalProposalFilter {
    target_id: string;
    semantic_filter: SemanticFilter;
}

interface RetrievalProposal {
    update_type?: 'queries_only' | 'filters_only' | 'both';
    queries?: RetrievalProposalQuery[];
    filters?: RetrievalProposalFilter[];
}

interface SchemaProposal {
    proposed_changes?: Record<string, unknown>;
}

interface PresentationCategoriesProposal {
    categories?: Category[];
}

interface QuerySuggestionData {
    query_expression: string;
}

interface FilterSuggestionData {
    criteria: string;
    threshold?: number;
}

export default function EditStreamPage() {
    const { streamId } = useParams<{ streamId: string }>();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { researchStreams, loadResearchStreams, loadResearchStream, updateResearchStream, deleteResearchStream, isLoading, error, clearError } = useResearchStream();
    const { user, isPlatformAdmin, isOrgAdmin } = useAuth();

    const [stream, setStream] = useState<ResearchStream | null>(null);
    const formInitializedRef = useRef(false);

    // Check if user can modify this stream (edit/delete/run)
    const canModifyStream = (streamToCheck: ResearchStream | null): boolean => {
        if (!streamToCheck) return false;
        const scope = streamToCheck.scope || 'personal';

        if (scope === 'global') {
            // Only platform admins can modify global streams
            return isPlatformAdmin;
        } else if (scope === 'organization') {
            // Platform admins and org admins of the same org can modify
            if (isPlatformAdmin) return true;
            return isOrgAdmin && user?.org_id === streamToCheck.org_id;
        } else {
            // Personal streams: only creator or platform admins
            if (isPlatformAdmin) return true;
            return streamToCheck.user_id === user?.id;
        }
    };

    const canModify = canModifyStream(stream);
    const [isPromoting, setIsPromoting] = useState(false);
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Enrichment config state for chat context
    const [enrichmentConfig, setEnrichmentConfig] = useState<{
        prompts: Record<string, PromptTemplate>;
        defaults: Record<string, PromptTemplate>;
        availableSlugs: Record<string, SlugInfo[]>;
        isUsingDefaults: boolean;
    } | null>(null);

    // State for prompt suggestions from chat
    const [appliedPromptSuggestions, setAppliedPromptSuggestions] = useState<AppliedPromptSuggestions | null>(null);

    // State for workbench context (used when on execute tab)
    const [workbenchState, setWorkbenchState] = useState<WorkbenchState | null>(null);

    // State for execute tab's sub-tab (workbench vs pipeline)
    const [executeSubTab, setExecuteSubTab] = useState<ExecuteSubTab>('workbench');

    // State for pending query/filter updates (from chat suggestions to workbench)
    const [pendingQueryUpdate, setPendingQueryUpdate] = useState<string | null>(null);
    const [pendingFilterUpdate, setPendingFilterUpdate] = useState<FilterSuggestionData | null>(null);

    // Check URL params for initial tab
    const initialTab = (searchParams.get('tab') as TabType) || 'semantic';
    const [activeTab, setActiveTab] = useState<TabType>(initialTab);
    const [presentationSubTab, setPresentationSubTab] = useState<PresentationSubTab>('categories');
    const [form, setForm] = useState({
        stream_name: '',
        schedule_config: {
            enabled: false,
            frequency: ReportFrequency.WEEKLY,
            anchor_day: null,
            preferred_time: '08:00',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            send_day: null,
            send_time: null,
        } as ScheduleConfig,
        is_active: true,

        // === LAYER 1: SEMANTIC SPACE ===
        semantic_space: {
            domain: {
                name: '',
                description: ''
            },
            topics: [] as Topic[],
            entities: [] as Entity[],
            relationships: [],
            context: {
                business_context: '',
                decision_types: [''],
                stakeholders: [''],
                time_sensitivity: 'Weekly review'
            },
            coverage: {
                signal_types: [],
                temporal_scope: {
                    start_date: undefined,
                    end_date: 'present',
                    focus_periods: [],
                    recency_weight: 0.7,
                    rationale: 'Recent research prioritized'
                },
                quality_criteria: {
                    peer_review_required: true,
                    minimum_citation_count: undefined,
                    journal_quality: [],
                    study_types: [],
                    exclude_predatory: true,
                    language_restrictions: ['English'],
                    other_criteria: []
                },
                completeness_requirement: 'Comprehensive coverage'
            },
            boundaries: {
                inclusions: [],
                exclusions: [],
                edge_cases: []
            },
            extraction_metadata: {
                extracted_from: 'manual_entry',
                extracted_at: new Date().toISOString(),
                human_reviewed: true,
                derivation_method: 'manual' as const
            }
        } as SemanticSpace,

        // === LAYER 2: RETRIEVAL CONFIG ===
        retrieval_config: {
            concepts: [] as Concept[],
            article_limit_per_week: 10
        } as RetrievalConfig,

        // === LAYER 3: PRESENTATION TAXONOMY ===
        categories: [
            {
                id: '',
                name: '',
                topics: [] as string[],
                specific_inclusions: [] as string[]
            }
        ] as Category[],

    });

    useEffect(() => {
        loadResearchStreams();
    }, [loadResearchStreams]);

    // Reset form initialization flag when streamId changes (navigating to different stream)
    useEffect(() => {
        formInitializedRef.current = false;
    }, [streamId]);

    useEffect(() => {
        if (streamId && researchStreams.length > 0) {
            const foundStream = researchStreams.find(s => s.stream_id === Number(streamId));
            if (foundStream) {
                // Always update the stream reference for permission checks
                setStream(foundStream);

                // Only initialize form once to avoid overwriting user edits after save
                if (!formInitializedRef.current) {
                    formInitializedRef.current = true;
                    setForm({
                        stream_name: foundStream.stream_name,
                        schedule_config: foundStream.schedule_config || {
                            enabled: false,
                            frequency: ReportFrequency.WEEKLY,
                            anchor_day: null,
                            preferred_time: '08:00',
                            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                            send_day: null,
                            send_time: null,
                        },
                        is_active: foundStream.is_active,
                        semantic_space: foundStream.semantic_space,
                        retrieval_config: foundStream.retrieval_config || {
                            concepts: [],
                            article_limit_per_week: 10
                        },
                        categories: foundStream.presentation_config.categories.length > 0
                            ? foundStream.presentation_config.categories
                            : [{
                                id: '',
                                name: '',
                                topics: [],
                                specific_inclusions: []
                            }]
                    });
                }
            }
        }
    }, [streamId, researchStreams]);

    // Load enrichment config for chat context when on enrichment tab
    useEffect(() => {
        const loadEnrichmentConfig = async () => {
            if (!streamId || activeTab !== 'enrichment') return;

            try {
                const [defaultsResponse, configResponse] = await Promise.all([
                    promptTestingApi.getDefaults(),
                    researchStreamApi.getEnrichmentConfig(Number(streamId))
                ]);

                const currentPrompts = configResponse.enrichment_config?.prompts
                    ? { ...defaultsResponse.prompts, ...configResponse.enrichment_config.prompts }
                    : defaultsResponse.prompts;

                setEnrichmentConfig({
                    prompts: currentPrompts,
                    defaults: defaultsResponse.prompts,
                    availableSlugs: defaultsResponse.available_slugs,
                    isUsingDefaults: configResponse.is_using_defaults
                });
            } catch (err) {
                showErrorToast(err, 'Failed to load enrichment config');
            }
        };

        loadEnrichmentConfig();
    }, [streamId, activeTab]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!streamId) return;

        // Filter out empty categories (ones that haven't been filled out)
        const filledCategories = form.categories.filter(cat =>
            cat.id || cat.name
        );

        // Check if any filled category is incomplete (only id and name are required)
        const incompleteCategory = filledCategories.find(cat =>
            !cat.id || !cat.name
        );

        if (incompleteCategory) {
            alert('Please complete all category fields before submitting');
            return;
        }

        const updates = {
            stream_name: form.stream_name,
            schedule_config: form.schedule_config,
            is_active: form.is_active,
            // Layer 1: Semantic space (ground truth)
            semantic_space: form.semantic_space,
            // Layer 2: Retrieval config (edited via wizard)
            retrieval_config: form.retrieval_config,
            // Layer 3: Presentation config
            presentation_config: {
                categories: filledCategories
            }
        };

        try {
            await updateResearchStream(Number(streamId), updates);
            showSuccessToast('Changes saved successfully');
        } catch (err) {
            showErrorToast(err, 'Failed to save changes');
        }
    };

    const handleDelete = async () => {
        if (!streamId) return;

        const confirmDelete = window.confirm(
            `Are you sure you want to delete "${form.stream_name}"? This action cannot be undone.`
        );

        if (confirmDelete) {
            try {
                await deleteResearchStream(Number(streamId));
                navigate('/streams');
            } catch (err) {
                showErrorToast(err, 'Failed to delete stream');
            }
        }
    };

    const handlePromoteToGlobal = async () => {
        if (!streamId || !stream) return;

        const confirmPromote = window.confirm(
            `Are you sure you want to promote "${form.stream_name}" to a global stream? ` +
            `This will make it available for all organizations to subscribe to.`
        );

        if (confirmPromote) {
            setIsPromoting(true);
            try {
                await adminApi.setStreamScopeGlobal(Number(streamId));
                // Reload stream to get updated scope
                await loadResearchStream(Number(streamId));
                // Update local stream state
                setStream((prev) => prev ? { ...prev, scope: 'global' as const } : null);
            } catch (err) {
                showErrorToast(err, 'Failed to promote stream');
            } finally {
                setIsPromoting(false);
            }
        }
    };

    // Payload handlers for chat
    const handleSchemaProposalAccept = (proposalData: SchemaProposal) => {
        const changes = proposalData.proposed_changes || {};

        console.log('Applying schema proposal changes:', changes);

        // Create a new form object with the proposed changes applied
        const updatedForm = { ...form };

        // Apply each proposed change
        Object.entries(changes).forEach(([key, value]) => {
            if (key === 'stream_name') {
                updatedForm.stream_name = value as string;
            } else if (key === 'purpose') {
                // Purpose is on the stream level, not in semantic_space
                console.log('Purpose change proposed:', value);
            } else if (key.startsWith('semantic_space.')) {
                // Handle nested semantic_space fields
                const path = key.replace('semantic_space.', '').split('.');
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let target: Record<string, any> = updatedForm.semantic_space as Record<string, any>;

                // Navigate to the nested property
                for (let i = 0; i < path.length - 1; i++) {
                    if (!target[path[i]]) {
                        target[path[i]] = {};
                    }
                    target = target[path[i]] as Record<string, unknown>;
                }

                // Set the value
                target[path[path.length - 1]] = value;
            }
        });

        // Update the form state
        setForm(updatedForm);

        // Show a success message
        alert('Schema changes have been applied to the form. Click "Save Changes" to persist them.');
    };

    const handleSchemaProposalReject = () => {
        console.log('Schema proposal rejected');
    };

    const handlePresentationCategoriesAccept = (proposalData: PresentationCategoriesProposal) => {
        const categories = proposalData.categories || [];

        console.log('Applying presentation categories:', categories);

        // Update the form with the proposed categories
        setForm({
            ...form,
            categories: categories
        });

        // Show a success message
        alert('Presentation categories have been applied to the form. Click "Save Changes" to persist them.');
    };

    const handlePresentationCategoriesReject = () => {
        console.log('Presentation categories proposal rejected');
    };

    const handlePromptSuggestionsAccept = (payload: AppliedPromptSuggestions) => {
        console.log('Applying prompt suggestions:', payload);
        setAppliedPromptSuggestions(payload);
        // Switch to enrichment tab if not already there
        if (activeTab !== 'enrichment') {
            setActiveTab('enrichment');
        }
    };

    const handlePromptSuggestionsReject = () => {
        console.log('Prompt suggestions rejected');
    };

    const handlePromptSuggestionsApplied = () => {
        // Clear the applied suggestions after they've been applied
        setAppliedPromptSuggestions(null);
    };

    const handleRetrievalProposalAccept = (proposalData: RetrievalProposal) => {
        console.log('Applying retrieval proposal:', proposalData);

        const updateType = proposalData.update_type || 'both';
        const hasQueries = proposalData.queries && proposalData.queries.length > 0;
        const hasFilters = proposalData.filters && proposalData.filters.length > 0;

        setForm(prev => {
            const newConfig = { ...prev.retrieval_config };

            // Apply query updates
            if ((updateType === 'queries_only' || updateType === 'both') && hasQueries && proposalData.queries) {
                // Determine if we're working with broad_search or concepts
                if (newConfig.broad_search) {
                    // Update broad search queries
                    const existingQueries = newConfig.broad_search.queries || [];
                    const updatedQueries = [...existingQueries];

                    for (const q of proposalData.queries) {
                        const existingIndex = updatedQueries.findIndex((eq: BroadQuery) => eq.query_id === q.query_id);
                        const existingQuery = existingIndex >= 0 ? updatedQueries[existingIndex] : null;

                        const newQuery: BroadQuery = {
                            query_id: q.query_id,
                            source_id: existingQuery?.source_id ?? 0,
                            search_terms: existingQuery?.search_terms || [],
                            query_expression: q.query_string,
                            rationale: q.rationale || '',
                            covered_topics: q.covered_topics || [],
                            estimated_weekly_volume: existingQuery?.estimated_weekly_volume || null,
                            semantic_filter: existingQuery?.semantic_filter || { enabled: false, criteria: '', threshold: 0.7 }
                        };

                        if (existingIndex >= 0) {
                            updatedQueries[existingIndex] = newQuery;
                        } else {
                            updatedQueries.push(newQuery);
                        }
                    }

                    newConfig.broad_search = {
                        ...newConfig.broad_search,
                        queries: updatedQueries
                    };
                } else {
                    // Create new broad_search config
                    newConfig.broad_search = {
                        queries: proposalData.queries.map((q: RetrievalProposalQuery): BroadQuery => ({
                            query_id: q.query_id,
                            source_id: 0,
                            search_terms: [],
                            query_expression: q.query_string,
                            rationale: q.rationale || '',
                            covered_topics: q.covered_topics || [],
                            estimated_weekly_volume: null,
                            semantic_filter: { enabled: false, criteria: '', threshold: 0.7 }
                        })),
                        strategy_rationale: 'Created from chat proposal',
                        coverage_analysis: {}
                    };
                }
            }

            // Apply filter updates
            if ((updateType === 'filters_only' || updateType === 'both') && hasFilters && proposalData.filters) {
                if (newConfig.broad_search?.queries) {
                    const updatedQueries = newConfig.broad_search.queries.map((q: BroadQuery) => {
                        const filterUpdate = proposalData.filters!.find((f: RetrievalProposalFilter) => f.target_id === q.query_id);
                        if (filterUpdate) {
                            return {
                                ...q,
                                semantic_filter: filterUpdate.semantic_filter
                            };
                        }
                        return q;
                    });
                    newConfig.broad_search = {
                        ...newConfig.broad_search,
                        queries: updatedQueries
                    };
                } else if (newConfig.concepts) {
                    const updatedConcepts = newConfig.concepts.map((c: Concept) => {
                        const filterUpdate = proposalData.filters!.find((f: RetrievalProposalFilter) => f.target_id === c.concept_id);
                        if (filterUpdate) {
                            return {
                                ...c,
                                semantic_filter: filterUpdate.semantic_filter
                            };
                        }
                        return c;
                    });
                    newConfig.concepts = updatedConcepts;
                }
            }

            return {
                ...prev,
                retrieval_config: newConfig
            };
        });

        alert('Retrieval configuration has been applied to the form. Click "Save Changes" to persist.');
    };

    const handleRetrievalProposalReject = () => {
        console.log('Retrieval proposal rejected');
    };

    if (isLoading) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            </div>
        );
    }

    if (!stream) {
        return (
            <div className="max-w-7xl mx-auto p-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                    <h3 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                        Stream Not Found
                    </h3>
                    <button
                        onClick={() => navigate('/streams')}
                        className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Back to Streams
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-4rem)] flex">
            {/* Chat Tray - inline on left side, hidden when workbench article viewer is open */}
            <ChatTray
                key={`${activeTab}-${executeSubTab}`}  // Force re-mount when tab or subtab changes
                hidden={workbenchState?.articleViewerOpen}
                initialContext={{
                    current_page: "edit_research_stream",
                    entity_type: "research_stream",
                    entity_id: stream?.stream_id,
                    stream_name: stream?.stream_name,
                    active_tab: activeTab,
                    active_subtab: activeTab === 'execute' ? executeSubTab : undefined,
                    // Tab-specific context
                    current_schema: activeTab === 'semantic' ? {
                        stream_name: form.stream_name,
                        purpose: stream?.purpose || "",
                        semantic_space: form.semantic_space
                    } : activeTab === 'retrieval' ? {
                        stream_name: form.stream_name,
                        retrieval_config: form.retrieval_config,
                        semantic_space: {
                            topics: form.semantic_space.topics  // Include topics for reference
                        }
                    } : activeTab === 'presentation' ? {
                        stream_name: form.stream_name,
                        semantic_space: {
                            topics: form.semantic_space.topics  // Include topics for reference
                        },
                        categories: form.categories
                    } : activeTab === 'enrichment' ? {
                        // Enrichment tab - include prompts and context
                        stream_name: form.stream_name,
                        purpose: stream?.purpose || "",
                        enrichment: enrichmentConfig ? {
                            is_using_defaults: enrichmentConfig.isUsingDefaults,
                            executive_summary: {
                                system_prompt: enrichmentConfig.prompts.executive_summary?.system_prompt,
                                user_prompt_template: enrichmentConfig.prompts.executive_summary?.user_prompt_template,
                                available_slugs: enrichmentConfig.availableSlugs.executive_summary
                            },
                            category_summary: {
                                system_prompt: enrichmentConfig.prompts.category_summary?.system_prompt,
                                user_prompt_template: enrichmentConfig.prompts.category_summary?.user_prompt_template,
                                available_slugs: enrichmentConfig.availableSlugs.category_summary
                            },
                            defaults: enrichmentConfig.defaults
                        } : null,
                        // Include stream context for prompt suggestions
                        semantic_space: {
                            topics: form.semantic_space.topics,
                            domain: form.semantic_space.domain
                        },
                        categories: form.categories
                    } : {
                        // Execute tab (workbench or pipeline) - lightweight semantic space
                        stream_name: form.stream_name,
                        semantic_space: {
                            domain: form.semantic_space.domain,
                            topics: form.semantic_space.topics
                        },
                        execute_subtab: executeSubTab,
                        workbench: executeSubTab === 'workbench' ? workbenchState : undefined
                    }
                }}
                payloadHandlers={{
                    schema_proposal: {
                        render: (payload, callbacks) => (
                            <SchemaProposalCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handleSchemaProposalAccept,
                        onReject: handleSchemaProposalReject,
                        renderOptions: {
                            panelWidth: '500px',
                            headerTitle: 'Schema Proposal',
                            headerIcon: '📋'
                        }
                    },
                    presentation_categories: {
                        render: (payload, callbacks) => (
                            <PresentationCategoriesCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handlePresentationCategoriesAccept,
                        onReject: handlePresentationCategoriesReject,
                        renderOptions: {
                            panelWidth: '600px',
                            headerTitle: 'Presentation Categories',
                            headerIcon: '📊'
                        }
                    },
                    prompt_suggestions: {
                        render: (payload, callbacks) => (
                            <PromptSuggestionsCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handlePromptSuggestionsAccept,
                        onReject: handlePromptSuggestionsReject,
                        renderOptions: {
                            panelWidth: '550px',
                            headerTitle: 'Prompt Suggestions',
                            headerIcon: '✨'
                        }
                    },
                    retrieval_proposal: {
                        render: (payload, callbacks) => (
                            <RetrievalProposalCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: handleRetrievalProposalAccept,
                        onReject: handleRetrievalProposalReject,
                        renderOptions: {
                            panelWidth: '600px',
                            headerTitle: 'Retrieval Proposal',
                            headerIcon: '🔍'
                        }
                    },
                    query_suggestion: {
                        render: (payload, callbacks) => (
                            <QuerySuggestionCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: async (data: QuerySuggestionData) => {
                            // Update the workbench with the new query expression
                            setPendingQueryUpdate(data.query_expression);
                        },
                        onReject: () => {},
                        renderOptions: {
                            panelWidth: '500px',
                            headerTitle: 'Query Suggestion',
                            headerIcon: '🔎'
                        }
                    },
                    filter_suggestion: {
                        render: (payload, callbacks) => (
                            <FilterSuggestionCard
                                proposal={payload}
                                onAccept={callbacks.onAccept}
                                onReject={callbacks.onReject}
                            />
                        ),
                        onAccept: async (data: FilterSuggestionData) => {
                            // Update the workbench with the new filter criteria
                            setPendingFilterUpdate({ criteria: data.criteria, threshold: data.threshold });
                        },
                        onReject: () => {},
                        renderOptions: {
                            panelWidth: '500px',
                            headerTitle: 'Filter Suggestion',
                            headerIcon: '🎯'
                        }
                    }
                }}
                isOpen={isChatOpen}
                onOpenChange={setIsChatOpen}
            />

            {/* Main Content - takes remaining space */}
            <div className="flex-1 flex flex-col overflow-hidden relative">
                {/* Chat toggle button - fixed to lower left */}
                {!isChatOpen && !workbenchState?.articleViewerOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-6 left-6 z-40 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                        title="Open chat"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}
                {/* Header - Fixed */}
                <div className="p-6 pb-0 max-w-7xl">
                    <button
                        onClick={() => navigate('/streams')}
                        className="flex items-center text-sm text-blue-600 dark:text-blue-400 hover:underline mb-4"
                    >
                        <ArrowLeftIcon className="h-4 w-4 mr-1" />
                        Back to Streams
                    </button>
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                            Edit Research Stream
                        </h1>
                        {stream && <ScopeBadge scope={stream.scope || 'personal'} />}
                    </div>
                    {/* Promote to Global button - only for platform admins on non-global streams */}
                    {isPlatformAdmin && stream && stream.scope !== 'global' && (
                        <button
                            onClick={handlePromoteToGlobal}
                            disabled={isPromoting}
                            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                            <ArrowUpIcon className="h-4 w-4" />
                            {isPromoting ? 'Promoting...' : 'Promote to Global'}
                        </button>
                    )}
                </div>
            </div>

            {/* Read-only warning for streams user can't modify */}
            {stream && !canModify && (
                <div className="mx-6 mt-4 bg-blue-50 dark:bg-blue-900/50 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
                    <p className="text-blue-800 dark:text-blue-200">
                        <strong>View Only:</strong> This {stream.scope === 'global' ? 'global' : stream.scope === 'organization' ? 'organization' : 'personal'} stream can only be {stream.scope === 'global' ? 'modified by platform administrators' : stream.scope === 'organization' ? 'modified by organization administrators' : 'modified by its creator'}.
                    </p>
                </div>
            )}

            {error && (
                <div className="mx-6 mt-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error}</p>
                    <button
                        onClick={clearError}
                        className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 min-h-0 flex flex-col px-6 py-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 flex-1 min-h-0 flex flex-col">
                    {/* Tabs */}
                    <div className="border-b border-gray-200 dark:border-gray-700 mb-4 flex-shrink-0">
                        <nav className="-mb-px flex space-x-6">
                            <button
                                type="button"
                                onClick={() => setActiveTab('semantic')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'semantic'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>Layer 1: Semantic Space</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">What information matters</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('retrieval')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'retrieval'
                                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>Layer 2: Retrieval Config</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">How to find & filter</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('presentation')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'presentation'
                                    ? 'border-green-500 text-green-600 dark:text-green-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>Layer 3: Presentation</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">How to organize results</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('enrichment')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'enrichment'
                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>Layer 4: Content Enrichment</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Customize summary prompts</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('article-analysis')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'article-analysis'
                                    ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>AI Settings</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Stance analysis & chat assistant</span>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setActiveTab('execute')}
                                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${activeTab === 'execute'
                                    ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>Control Panel</span>
                                    <span className="text-xs font-normal text-gray-500 dark:text-gray-400">Refine queries, models & run pipeline</span>
                                </div>
                            </button>
                        </nav>
                    </div>

                    {/* Form for Layers 1-3 */}
                    {(activeTab === 'semantic' || activeTab === 'retrieval' || activeTab === 'presentation') && (
                    <form id="edit-stream-form" onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                        {/* Layer 1: Semantic Space Tab */}
                        {activeTab === 'semantic' && (
                            <div className="flex-1 min-h-0 overflow-y-auto space-y-6">
                                {/* Stream Name - only shown on Semantic Space tab */}
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                        Stream Name *
                                    </label>
                                    <input
                                        type="text"
                                        value={form.stream_name}
                                        onChange={(e) => setForm({ ...form, stream_name: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        required
                                    />
                                </div>

                                <SemanticSpaceForm
                                    semanticSpace={form.semantic_space}
                                    onChange={(updated) => setForm({ ...form, semantic_space: updated })}
                                />
                            </div>
                        )}

                        {/* Layer 2: Retrieval Configuration Tab */}
                        {activeTab === 'retrieval' && (
                            <div className="flex-1 min-h-0 flex flex-col">
                                <RetrievalConfigForm
                                    retrievalConfig={form.retrieval_config}
                                    onChange={(updated) => setForm({ ...form, retrieval_config: updated })}
                                />
                            </div>
                        )}

                        {/* Layer 3: Presentation Taxonomy Tab */}
                        {activeTab === 'presentation' && (
                            <div className="flex-1 min-h-0 flex flex-col">
                                {/* Presentation Subtabs */}
                                <div className="flex gap-4 border-b border-gray-200 dark:border-gray-700 mb-4 flex-shrink-0">
                                    <button
                                        type="button"
                                        onClick={() => setPresentationSubTab('categories')}
                                        className={`pb-2 text-sm font-medium transition-colors ${
                                            presentationSubTab === 'categories'
                                                ? 'text-green-600 dark:text-green-400 border-b-2 border-green-500'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                    >
                                        Categories
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPresentationSubTab('categorization-prompt')}
                                        className={`pb-2 text-sm font-medium transition-colors ${
                                            presentationSubTab === 'categorization-prompt'
                                                ? 'text-green-600 dark:text-green-400 border-b-2 border-green-500'
                                                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                    >
                                        Categorization Prompt
                                    </button>
                                </div>

                                {/* Subtab Content */}
                                {presentationSubTab === 'categories' && (
                                    <div className="flex-1 min-h-0 overflow-y-auto">
                                        <PresentationForm
                                            categories={form.categories}
                                            onChange={(updated) => setForm({ ...form, categories: updated })}
                                        />
                                    </div>
                                )}
                                {presentationSubTab === 'categorization-prompt' && streamId && (
                                    <CategorizationPromptForm streamId={parseInt(streamId)} stream={stream} />
                                )}
                            </div>
                        )}

                    </form>
                    )}

                    {/* Layer 4: Content Enrichment Tab - outside form, has own save */}
                    {activeTab === 'enrichment' && stream && (
                        <div className="flex-1 min-h-0 flex flex-col">
                            <ContentEnrichmentForm
                                streamId={parseInt(streamId!)}
                                stream={stream}
                                appliedSuggestions={appliedPromptSuggestions}
                                onSuggestionsApplied={handlePromptSuggestionsApplied}
                            />
                        </div>
                    )}

                    {/* AI Settings Tab - outside form, has own save */}
                    {activeTab === 'article-analysis' && stream && (
                        <div className="flex-1 min-h-0 flex flex-col">
                            <StanceAnalysisPromptForm
                                streamId={parseInt(streamId!)}
                                stream={stream}
                            />
                        </div>
                    )}

                    {/* Control Panel Tab - outside form, has own controls */}
                    {activeTab === 'execute' && stream && (
                        <div className="flex-1 min-h-0 flex flex-col">
                            <TestRefineTab
                            streamId={parseInt(streamId!)}
                            stream={stream}
                            onStreamUpdate={() => loadResearchStream(parseInt(streamId!))}
                            canModify={canModify}
                            onWorkbenchStateChange={setWorkbenchState}
                            onSubTabChange={setExecuteSubTab}
                            pendingQueryUpdate={pendingQueryUpdate}
                            onQueryUpdateApplied={() => setPendingQueryUpdate(null)}
                            pendingFilterUpdate={pendingFilterUpdate}
                            onFilterUpdateApplied={() => setPendingFilterUpdate(null)}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Pinned Footer Actions - hide completely when on Control Panel tab */}
            {activeTab !== 'execute' && (
            <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-between">
                    {/* Only show delete button if user can modify this stream */}
                    {canModify ? (
                        <button
                            type="button"
                            onClick={handleDelete}
                            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                        >
                            Delete Stream
                        </button>
                    ) : (
                        <div /> // Empty div to maintain flex layout
                    )}
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => navigate('/streams')}
                            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            {canModify ? 'Cancel' : 'Back to Streams'}
                        </button>
                        {/* Hide main save button on enrichment/AI settings tabs and categorization prompt subtab - they have their own controls */}
                        {/* Also hide save button if user can't modify this stream */}
                        {canModify && activeTab !== 'enrichment' && activeTab !== 'article-analysis' && !(activeTab === 'presentation' && presentationSubTab === 'categorization-prompt') && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSubmit(e as any);
                                }}
                                disabled={isLoading}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                            >
                                {isLoading ? 'Saving...' : 'Save Changes'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
            )}
            </div>
        </div>
    );
}
