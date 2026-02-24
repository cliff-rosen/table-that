import { useState, useEffect } from 'react';
import { useResearchStream } from '../context/ResearchStreamContext';
import { useAuth } from '../context/AuthContext';
import {
    ReportFrequency,
    Category,
    SemanticSpace,
    RetrievalConfig,
    PresentationConfig,
    Topic,
    Entity,
    ScheduleConfig
} from '../types';
import { useNavigate } from 'react-router-dom';
import SemanticSpaceForm from '../components/stream/SemanticSpaceForm';
import PresentationForm from '../components/stream/PresentationForm';
import RetrievalConfigForm from '../components/stream/RetrievalConfigForm';
import { showErrorToast } from '../lib/errorToast';

// Stream scope type
type StreamScope = 'personal' | 'organization' | 'global';

interface CreateStreamPageProps {
    onCancel?: () => void;
}

type TabType = 'semantic' | 'retrieval' | 'presentation';

export default function CreateStreamPage({ onCancel }: CreateStreamPageProps) {
    const { createResearchStream, isLoading, error, clearError, loadAvailableSources } = useResearchStream();
    const { user, isPlatformAdmin, isOrgAdmin } = useAuth();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState<TabType>('semantic');

    // Determine available scopes based on user role
    const availableScopes: { value: StreamScope; label: string; description: string }[] = [
        { value: 'personal', label: 'Personal', description: 'Only you can see this stream' },
        ...(isOrgAdmin && !isPlatformAdmin && user?.org_id ? [
            { value: 'organization' as StreamScope, label: 'Organization', description: 'All org members can subscribe' }
        ] : []),
        ...(isPlatformAdmin ? [
            { value: 'organization' as StreamScope, label: 'Organization', description: 'All org members can subscribe' },
            { value: 'global' as StreamScope, label: 'Global', description: 'Platform-wide, orgs can subscribe' }
        ] : [])
    ];

    const [form, setForm] = useState({
        stream_name: '',
        scope: 'personal' as StreamScope,
        schedule_config: {
            enabled: false,
            frequency: ReportFrequency.WEEKLY,
            anchor_day: null,
            preferred_time: '08:00',
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
            send_day: null,
            send_time: null,
        } as ScheduleConfig,

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
            concepts: null,
            broad_search: null,
            article_limit_per_week: 10
        } as RetrievalConfig,

        // === LAYER 3: PRESENTATION CONFIG ===
        presentation_config: {
            categories: [
                {
                    id: '',
                    name: '',
                    topics: [] as string[],
                    specific_inclusions: [] as string[]
                }
            ] as Category[]
        } as PresentationConfig
    });

    useEffect(() => {
        loadAvailableSources();
    }, [loadAvailableSources]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Filter out empty categories (ones that haven't been filled out)
        const filledCategories = form.presentation_config.categories.filter(cat =>
            cat.id || cat.name || cat.topics.length > 0
        );

        // Validate that all filled categories are complete
        const incompleteCategory = filledCategories.find(cat =>
            !cat.id || !cat.name || cat.topics.length === 0
        );

        if (incompleteCategory) {
            alert('Please complete all category fields before submitting');
            return;
        }

        // Derive purpose from semantic space
        const purpose = form.semantic_space.domain.description || form.semantic_space.context.business_context;

        // Prepare clean data for submission (new three-layer structure)
        const cleanedForm = {
            stream_name: form.stream_name,
            purpose: purpose,
            schedule_config: form.schedule_config,
            scope: form.scope,  // Stream visibility scope
            // Three-layer architecture
            semantic_space: form.semantic_space,
            retrieval_config: form.retrieval_config,
            presentation_config: {
                categories: filledCategories
            }
        };

        console.log('Submitting form data:', cleanedForm);

        try {
            const newStream = await createResearchStream(cleanedForm);
            // Navigate directly to implementation configuration (Workflow 2)
            navigate(`/streams/${newStream.stream_id}/configure`);
        } catch (err) {
            showErrorToast(err, 'Failed to create stream');
        }
    };

    return (
        <div className="h-[calc(100vh-4rem)] flex flex-col overflow-hidden">
            <div className="max-w-7xl mx-auto w-full flex-1 flex flex-col overflow-hidden">
                {/* Header - Fixed */}
                <div className="p-6 pb-0">
                    <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                        Create Research Stream
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400">
                        Define a comprehensive research scope with categories and inclusion criteria.
                    </p>
                </div>

            {error && (
                <div className="mx-6 mt-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-700 rounded-lg p-4">
                    <p className="text-red-800 dark:text-red-200">{error}</p>
                    <button
                        type="button"
                        onClick={clearError}
                        className="mt-2 text-sm text-red-600 dark:text-red-400 hover:underline"
                    >
                        Dismiss
                    </button>
                </div>
            )}

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto px-6 py-6">
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8">

            {/* Basic Stream Info - Outside tabs */}
            <div className="space-y-4 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Stream Name *
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Asbestos (Non-Talc) Literature"
                        value={form.stream_name}
                        onChange={(e) => setForm({ ...form, stream_name: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        required
                    />
                </div>

                {/* Scope selector - only show if user has options */}
                {availableScopes.length > 1 && (
                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Stream Visibility *
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            {availableScopes.map((scope) => (
                                <button
                                    key={scope.value}
                                    type="button"
                                    onClick={() => setForm({ ...form, scope: scope.value })}
                                    className={`p-3 rounded-lg border-2 text-left transition-all ${
                                        form.scope === scope.value
                                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
                                    }`}
                                >
                                    <div className={`font-medium ${
                                        form.scope === scope.value
                                            ? 'text-blue-700 dark:text-blue-300'
                                            : 'text-gray-900 dark:text-white'
                                    }`}>
                                        {scope.label}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                        {scope.description}
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Report Frequency *
                    </label>
                    <select
                        value={form.schedule_config.frequency}
                        onChange={(e) => setForm({
                            ...form,
                            schedule_config: { ...form.schedule_config, frequency: e.target.value as ReportFrequency }
                        })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value={ReportFrequency.DAILY}>Daily</option>
                        <option value={ReportFrequency.WEEKLY}>Weekly</option>
                        <option value={ReportFrequency.BIWEEKLY}>Bi-weekly</option>
                        <option value={ReportFrequency.MONTHLY}>Monthly</option>
                    </select>
                </div>
            </div>

            {/* Three-Layer Architecture Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
                <nav className="-mb-px flex space-x-8">
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
                </nav>
            </div>

            <form id="create-stream-form" onSubmit={handleSubmit} className="space-y-6">
                {/* Layer 1: Semantic Space Tab */}
                {activeTab === 'semantic' && (
                    <div className="space-y-6">
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-4 mb-6">
                            <h3 className="text-sm font-semibold text-purple-900 dark:text-purple-200 mb-2">
                                Layer 1: Semantic Space
                            </h3>
                            <p className="text-sm text-purple-800 dark:text-purple-300">
                                Define the canonical, source-agnostic representation of what information matters. This is the ground truth that both retrieval strategies and presentation categories will derive from.
                            </p>
                        </div>

                        <SemanticSpaceForm
                            semanticSpace={form.semantic_space}
                            onChange={(updated) => setForm({ ...form, semantic_space: updated })}
                        />
                    </div>
                )}

                {/* Layer 2: Retrieval Config Tab */}
                {activeTab === 'retrieval' && (
                    <RetrievalConfigForm
                        retrievalConfig={form.retrieval_config}
                        onChange={(updated) => setForm({ ...form, retrieval_config: updated })}
                    />
                )}

                {/* Layer 3: Presentation Config Tab */}
                {activeTab === 'presentation' && (
                    <PresentationForm
                        categories={form.presentation_config.categories}
                        onChange={(updated) => setForm({
                            ...form,
                            presentation_config: { ...form.presentation_config, categories: updated }
                        })}
                    />
                )}

            </form>
                </div>
            </div>

            {/* Pinned Footer Actions */}
            <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-6 py-4">
                <div className="max-w-7xl mx-auto flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onCancel || (() => navigate('/dashboard'))}
                        className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        form="create-stream-form"
                        disabled={isLoading}
                        className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                    >
                        {isLoading ? 'Creating...' : 'Create Stream'}
                    </button>
                </div>
            </div>
            </div>
        </div>
    );
}
