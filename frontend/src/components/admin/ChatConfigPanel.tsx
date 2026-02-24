import { useState, useEffect, useMemo } from 'react';
import {
    CubeIcon,
    WrenchScrewdriverIcon,
    DocumentTextIcon,
    GlobeAltIcon,
    TagIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    CheckCircleIcon,
    XCircleIcon,
    BeakerIcon,
    Squares2X2Icon,
    PencilSquareIcon,
    XMarkIcon,
    BookOpenIcon,
    ArrowPathIcon,
    UserIcon,
    UserGroupIcon,
    ShieldCheckIcon,
    EyeIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
    Cog6ToothIcon,
} from '@heroicons/react/24/outline';
import { adminApi, type ChatConfigResponse, type PageConfigInfo, type SubTabConfigInfo, type HelpCategorySummary, type HelpCategoryDetail, type HelpTOCConfig, type StreamChatConfig, type PageChatConfig, type ToolInfo, type TopicSummariesResponse, type SystemConfig } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';

type ConfigTab = 'streams' | 'pages' | 'payloads' | 'tools' | 'help' | 'system';

const configTabs: { id: ConfigTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'streams', label: 'Streams', icon: BeakerIcon },
    { id: 'pages', label: 'Pages', icon: DocumentTextIcon },
    { id: 'payloads', label: 'Payloads', icon: CubeIcon },
    { id: 'tools', label: 'Tools', icon: WrenchScrewdriverIcon },
    { id: 'help', label: 'Help', icon: BookOpenIcon },
    { id: 'system', label: 'System', icon: Cog6ToothIcon },
];

// Help content types for editing state
interface EditingTopicContent {
    category: string;
    topic: string;
    content: string;
    originalContent: string;
    has_override: boolean;
}

export function ChatConfigPanel() {
    const [config, setConfig] = useState<ChatConfigResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<ConfigTab>('streams');

    // Stream config editing state
    const [streamConfigs, setStreamConfigs] = useState<StreamChatConfig[]>([]);
    const [selectedStream, setSelectedStream] = useState<StreamChatConfig | null>(null);
    const [streamInstructions, setStreamInstructions] = useState<string>('');
    const [isLoadingStreams, setIsLoadingStreams] = useState(false);
    const [isSavingStream, setIsSavingStream] = useState(false);
    const [streamError, setStreamError] = useState<string | null>(null);

    // Page config editing state
    const [pageConfigs, setPageConfigs] = useState<PageChatConfig[]>([]);
    const [selectedPageConfig, setSelectedPageConfig] = useState<PageChatConfig | null>(null);
    const [editingContent, setEditingContent] = useState<string>('');
    const [isLoadingPages, setIsLoadingPages] = useState(false);
    const [isSavingPage, setIsSavingPage] = useState(false);
    const [pageError, setPageError] = useState<string | null>(null);

    // System config state
    const [systemConfig, setSystemConfig] = useState<SystemConfig | null>(null);
    const [isLoadingSystem, setIsLoadingSystem] = useState(false);
    const [isSavingSystem, setIsSavingSystem] = useState(false);
    const [systemError, setSystemError] = useState<string | null>(null);
    const [editingMaxIterations, setEditingMaxIterations] = useState<number>(5);
    const [editingPreamble, setEditingPreamble] = useState<string>('');
    const [isPreambleMaximized, setIsPreambleMaximized] = useState(false);

    // Pages tab state - for master-detail view
    const [selectedPageName, setSelectedPageName] = useState<string | null>(null);

    // Tools state
    const [selectedToolName, setSelectedToolName] = useState<string | null>(null);
    const selectedTool = useMemo<ToolInfo | null>(() => {
        if (!config || !selectedToolName) return null;
        return config.tools.find(t => t.name === selectedToolName) || null;
    }, [config, selectedToolName]);

    // Payloads state
    const [selectedPayload, setSelectedPayload] = useState<string | null>(null);

    // Group tools by category
    const toolsByCategory = useMemo(() => {
        if (!config) return [];
        const groups: Record<string, ToolInfo[]> = {};
        for (const tool of config.tools) {
            const category = tool.category || 'other';
            if (!groups[category]) {
                groups[category] = [];
            }
            groups[category].push(tool);
        }
        // Sort categories alphabetically, but put 'research' first as it's most common
        const categoryOrder: Record<string, number> = {
            'research': 0,
            'reports': 1,
            'analysis': 2,
        };
        return Object.entries(groups)
            .sort(([a], [b]) => {
                const orderA = categoryOrder[a] ?? 99;
                const orderB = categoryOrder[b] ?? 99;
                if (orderA !== orderB) return orderA - orderB;
                return a.localeCompare(b);
            })
            .map(([category, tools]) => ({
                category,
                tools: tools.sort((a, b) => a.name.localeCompare(b.name))
            }));
    }, [config]);

    // Help content state - category-based
    const [helpCategories, setHelpCategories] = useState<HelpCategorySummary[]>([]);
    const [helpTotalTopics, setHelpTotalTopics] = useState(0);
    const [helpTotalOverrides, setHelpTotalOverrides] = useState(0);
    const [selectedHelpCategory, setSelectedHelpCategory] = useState<HelpCategoryDetail | null>(null);
    const [editingTopics, setEditingTopics] = useState<EditingTopicContent[]>([]);
    const [isLoadingHelp, setIsLoadingHelp] = useState(false);
    const [isLoadingHelpCategory, setIsLoadingHelpCategory] = useState(false);
    const [isSavingHelp, setIsSavingHelp] = useState(false);
    const [isReloadingHelp, setIsReloadingHelp] = useState(false);
    const [helpError, setHelpError] = useState<string | null>(null);
    const [helpViewMode, setHelpViewMode] = useState<'content' | 'llm-view'>('content');
    const [isHelpMaximized, setIsHelpMaximized] = useState(false);
    const [selectedTopicIndex, setSelectedTopicIndex] = useState(0);

    // LLM View state
    const [tocConfig, setTocConfig] = useState<HelpTOCConfig | null>(null);
    const [topicSummaries, setTopicSummaries] = useState<TopicSummariesResponse | null>(null);
    const [selectedPreviewRole, setSelectedPreviewRole] = useState<'member' | 'org_admin' | 'platform_admin'>('member');

    // Inline editing state
    const [editingField, setEditingField] = useState<string | null>(null);  // 'narrative', 'preamble', 'label:category', 'summary:category/topic'
    const [editingValue, setEditingValue] = useState('');
    const [isSavingField, setIsSavingField] = useState(false);

    // Check if any topics have been modified
    const hasHelpChanges = useMemo(() => {
        return editingTopics.some(t => t.content !== t.originalContent);
    }, [editingTopics]);

    // Get modified topics for save
    const modifiedTopics = useMemo(() => {
        return editingTopics.filter(t => t.content !== t.originalContent);
    }, [editingTopics]);

    useEffect(() => {
        loadConfig();
    }, []);

    const loadConfig = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const data = await adminApi.getChatConfig();
            setConfig(data);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    // Stream config functions
    const loadStreamConfigs = async () => {
        setIsLoadingStreams(true);
        setStreamError(null);
        try {
            const configs = await adminApi.getStreamConfigs();
            setStreamConfigs(configs);
        } catch (err) {
            setStreamError(handleApiError(err));
        } finally {
            setIsLoadingStreams(false);
        }
    };

    const openStreamConfig = (stream: StreamChatConfig) => {
        setSelectedStream(stream);
        setStreamInstructions(stream.content || '');
        setStreamError(null);
    };

    const closeStreamConfig = () => {
        setSelectedStream(null);
        setStreamInstructions('');
        setStreamError(null);
    };

    const saveStreamConfig = async () => {
        if (!selectedStream) return;

        setIsSavingStream(true);
        setStreamError(null);

        try {
            const trimmed = streamInstructions.trim();
            await adminApi.updateStreamConfig(
                selectedStream.stream_id,
                trimmed.length > 0 ? trimmed : null
            );

            await loadStreamConfigs();
            closeStreamConfig();
        } catch (err) {
            setStreamError(handleApiError(err));
        } finally {
            setIsSavingStream(false);
        }
    };

    // Page config functions
    const loadPageConfigs = async () => {
        setIsLoadingPages(true);
        setPageError(null);
        try {
            const configs = await adminApi.getPageConfigs();
            setPageConfigs(configs);
        } catch (err) {
            setPageError(handleApiError(err));
        } finally {
            setIsLoadingPages(false);
        }
    };

    const loadSystemConfig = async () => {
        setIsLoadingSystem(true);
        setSystemError(null);
        try {
            const config = await adminApi.getSystemConfig();
            setSystemConfig(config);
            setEditingMaxIterations(config.max_tool_iterations);
            // Only show the override in the editor, not the effective value
            setEditingPreamble(config.global_preamble || '');
        } catch (err) {
            setSystemError(handleApiError(err));
        } finally {
            setIsLoadingSystem(false);
        }
    };

    const saveSystemConfig = async () => {
        setIsSavingSystem(true);
        setSystemError(null);
        try {
            const updated = await adminApi.updateSystemConfig({
                max_tool_iterations: editingMaxIterations
            });
            setSystemConfig(updated);
            setEditingMaxIterations(updated.max_tool_iterations);
        } catch (err) {
            setSystemError(handleApiError(err));
        } finally {
            setIsSavingSystem(false);
        }
    };

    const savePreamble = async () => {
        setIsSavingSystem(true);
        setSystemError(null);
        try {
            const trimmed = editingPreamble.trim();
            const updated = await adminApi.updateSystemConfig({
                global_preamble: trimmed.length > 0 ? trimmed : null,
                clear_global_preamble: trimmed.length === 0
            });
            setSystemConfig(updated);
            setEditingPreamble(updated.global_preamble || '');
        } catch (err) {
            setSystemError(handleApiError(err));
        } finally {
            setIsSavingSystem(false);
        }
    };

    const resetPreamble = async () => {
        setIsSavingSystem(true);
        setSystemError(null);
        try {
            const updated = await adminApi.updateSystemConfig({
                clear_global_preamble: true
            });
            setSystemConfig(updated);
            setEditingPreamble('');
        } catch (err) {
            setSystemError(handleApiError(err));
        } finally {
            setIsSavingSystem(false);
        }
    };

    const openPageConfig = (page: PageChatConfig) => {
        setSelectedPageConfig(page);
        // Only show the override value, not the effective value (default is shown separately)
        setEditingContent(page.has_override ? (page.content || '') : '');
        setPageError(null);
    };

    const closePageConfig = () => {
        setSelectedPageConfig(null);
        setEditingContent('');
        setPageError(null);
    };

    const savePageConfig = async () => {
        if (!selectedPageConfig) return;

        setIsSavingPage(true);
        setPageError(null);

        try {
            const trimmedContent = editingContent.trim();
            const updated = await adminApi.updatePageConfig(
                selectedPageConfig.page,
                {
                    content: trimmedContent.length > 0 ? trimmedContent : null,
                }
            );

            // Update state to reflect saved values (keep modal open)
            setSelectedPageConfig(updated);
            setEditingContent(updated.has_override ? (updated.content || '') : '');
            await loadPageConfigs();
        } catch (err) {
            setPageError(handleApiError(err));
        } finally {
            setIsSavingPage(false);
        }
    };

    const resetPageConfig = async () => {
        if (!selectedPageConfig || !selectedPageConfig.has_override) return;

        setIsSavingPage(true);
        setPageError(null);

        try {
            await adminApi.deletePageConfig(selectedPageConfig.page);
            await loadPageConfigs();
            closePageConfig();
        } catch (err) {
            setPageError(handleApiError(err));
        } finally {
            setIsSavingPage(false);
        }
    };

    // Help content functions
    const loadHelpCategories = async () => {
        setIsLoadingHelp(true);
        setHelpError(null);
        try {
            const [categoriesRes, tocConfigRes, summariesRes] = await Promise.all([
                adminApi.getHelpCategories(),
                adminApi.getHelpTocConfig(),
                adminApi.getHelpSummaries(),
            ]);
            setHelpCategories(categoriesRes.categories);
            setHelpTotalTopics(categoriesRes.total_topics);
            setHelpTotalOverrides(categoriesRes.total_overrides);
            setTocConfig(tocConfigRes);
            setTopicSummaries(summariesRes);
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsLoadingHelp(false);
        }
    };

    // Inline editing functions for LLM View
    const startEditing = (field: string, currentValue: string) => {
        setEditingField(field);
        setEditingValue(currentValue);
    };

    const cancelEditing = () => {
        setEditingField(null);
        setEditingValue('');
    };

    const saveEditing = async () => {
        if (!editingField || !tocConfig) return;

        setIsSavingField(true);
        try {
            if (editingField === 'narrative') {
                const updated = await adminApi.updateHelpTocConfig({ narrative: editingValue });
                setTocConfig(updated);
            } else if (editingField === 'preamble') {
                const updated = await adminApi.updateHelpTocConfig({ preamble: editingValue });
                setTocConfig(updated);
            } else if (editingField.startsWith('summary:')) {
                const [category, topic] = editingField.replace('summary:', '').split('/');
                await adminApi.updateHelpSummary(category, topic, editingValue);
                // Reload summaries
                const summariesRes = await adminApi.getHelpSummaries();
                setTopicSummaries(summariesRes);
            }
            cancelEditing();
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsSavingField(false);
        }
    };

    const resetAllLlmConfig = async () => {
        if (!confirm('Reset all LLM configuration to defaults? This will reset the narrative, preamble, and all topic summaries.')) return;
        setIsSavingField(true);
        try {
            await adminApi.resetHelpTocConfig();
            // Reload everything
            const [tocConfigRes, summariesRes] = await Promise.all([
                adminApi.getHelpTocConfig(),
                adminApi.getHelpSummaries(),
            ]);
            setTocConfig(tocConfigRes);
            setTopicSummaries(summariesRes);
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsSavingField(false);
        }
    };

    const handleReloadHelp = async () => {
        setIsReloadingHelp(true);
        try {
            await adminApi.reloadHelpContent();
            await loadHelpCategories();
            // Clear selection if category no longer exists
            if (selectedHelpCategory) {
                setSelectedHelpCategory(null);
                setEditingTopics([]);
            }
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsReloadingHelp(false);
        }
    };

    const selectHelpCategory = async (category: string) => {
        setIsLoadingHelpCategory(true);
        setHelpError(null);
        setSelectedTopicIndex(0); // Reset to first topic when changing categories
        try {
            const categoryDetail = await adminApi.getHelpCategory(category);
            setSelectedHelpCategory(categoryDetail);
            // Initialize editing state with current content
            setEditingTopics(categoryDetail.topics.map(t => ({
                category: t.category,
                topic: t.topic,
                content: t.content,
                originalContent: t.content,
                has_override: t.has_override,
            })));
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsLoadingHelpCategory(false);
        }
    };

    const updateTopicContent = (category: string, topic: string, content: string) => {
        setEditingTopics(prev => prev.map(t =>
            t.category === category && t.topic === topic ? { ...t, content } : t
        ));
    };

    const closeHelpCategory = () => {
        setSelectedHelpCategory(null);
        setEditingTopics([]);
        setHelpError(null);
        setIsHelpMaximized(false);
    };

    const saveHelpCategory = async () => {
        if (!selectedHelpCategory || modifiedTopics.length === 0) return;

        setIsSavingHelp(true);
        setHelpError(null);

        try {
            const updates = modifiedTopics.map(t => ({
                category: t.category,
                topic: t.topic,
                content: t.content,
            }));
            const updated = await adminApi.updateHelpCategory(selectedHelpCategory.category, updates);
            setSelectedHelpCategory(updated);
            // Reset editing state with new content
            setEditingTopics(updated.topics.map(t => ({
                category: t.category,
                topic: t.topic,
                content: t.content,
                originalContent: t.content,
                has_override: t.has_override,
            })));
            // Refresh the categories list to update override counts
            await loadHelpCategories();
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsSavingHelp(false);
        }
    };

    const resetHelpCategory = async () => {
        if (!selectedHelpCategory) return;
        const categoryHasOverrides = selectedHelpCategory.topics.some(t => t.has_override);
        if (!categoryHasOverrides) return;

        setIsSavingHelp(true);
        setHelpError(null);

        try {
            await adminApi.resetHelpCategory(selectedHelpCategory.category);
            // Reload the category to get default content
            await selectHelpCategory(selectedHelpCategory.category);
            // Refresh the categories list to update override counts
            await loadHelpCategories();
        } catch (err) {
            setHelpError(handleApiError(err));
        } finally {
            setIsSavingHelp(false);
        }
    };

    const getRoleIcon = (role: string) => {
        switch (role) {
            case 'platform_admin':
                return <ShieldCheckIcon className="h-4 w-4" />;
            case 'org_admin':
                return <UserGroupIcon className="h-4 w-4" />;
            default:
                return <UserIcon className="h-4 w-4" />;
        }
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'platform_admin':
                return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300';
            case 'org_admin':
                return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300';
            default:
                return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    // Load help categories when switching to help tab
    useEffect(() => {
        if (activeTab === 'help' && helpCategories.length === 0 && !isLoadingHelp) {
            loadHelpCategories();
        }
    }, [activeTab]);

    // Load stream configs when switching to streams tab
    useEffect(() => {
        if (activeTab === 'streams' && streamConfigs.length === 0 && !isLoadingStreams) {
            loadStreamConfigs();
        }
    }, [activeTab]);

    // Load page configs when switching to pages tab
    useEffect(() => {
        if (activeTab === 'pages' && pageConfigs.length === 0 && !isLoadingPages) {
            loadPageConfigs();
        }
    }, [activeTab]);

    // Load system config when switching to system tab
    useEffect(() => {
        if (activeTab === 'system' && !systemConfig && !isLoadingSystem) {
            loadSystemConfig();
        }
    }, [activeTab]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                {error}
            </div>
        );
    }

    if (!config) return null;

    return (
        <div className="space-y-6">
            {/* Subtab Navigation */}
            <div className="border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    {configTabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`
                                    group inline-flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm
                                    ${isActive
                                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                                    }
                                `}
                            >
                                <Icon className={`h-5 w-5 ${isActive ? 'text-purple-500 dark:text-purple-400' : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            <div>
                {activeTab === 'pages' && (
                    <div className="flex gap-6 h-[calc(100vh-16rem)]">
                        {/* Left column - Page list */}
                        <div className="w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            <div className="flex-shrink-0 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                    Pages ({config.pages.length})
                                </h3>
                            </div>
                            {isLoadingPages ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                                </div>
                            ) : pageError ? (
                                <div className="p-4 text-red-600 dark:text-red-400">
                                    {pageError}
                                </div>
                            ) : (
                                <div className="flex-1 overflow-y-auto">
                                    {config.pages.map((page) => {
                                        const tabCount = Object.keys(page.tabs).length;
                                        const identityInfo = pageConfigs.find(i => i.page === page.page);
                                        return (
                                            <div
                                                key={page.page}
                                                onClick={() => setSelectedPageName(page.page)}
                                                className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${selectedPageName === page.page
                                                    ? 'bg-blue-50 dark:bg-blue-900/20'
                                                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                                    }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                        {page.page}
                                                    </span>
                                                    {page.has_context_builder && (
                                                        <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                            ctx
                                                        </span>
                                                    )}
                                                    {identityInfo?.has_override && (
                                                        <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                                                            custom
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    {tabCount > 0 ? `${tabCount} tabs` : 'No tabs'} | {page.payloads.length} payloads | {page.tools.length} tools
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Right column - Page details */}
                        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            {selectedPageName ? (
                                (() => {
                                    const page = config.pages.find(p => p.page === selectedPageName);
                                    const identityInfo = pageConfigs.find(i => i.page === selectedPageName);
                                    if (!page) return null;
                                    return (
                                        <>
                                            <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                                        {page.page}
                                                    </h3>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        {page.has_context_builder && (
                                                            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                                Context Builder
                                                            </span>
                                                        )}
                                                        {identityInfo?.has_override && (
                                                            <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                                                Custom Persona
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                {identityInfo && (
                                                    <button
                                                        onClick={() => openPageConfig(identityInfo)}
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                                    >
                                                        <PencilSquareIcon className="h-4 w-4" />
                                                        Edit Persona
                                                    </button>
                                                )}
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                                {/* Persona preview */}
                                                {identityInfo && (
                                                    <div>
                                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                                                            Page Persona
                                                        </h4>
                                                        <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                                            <pre className="text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                                                                {identityInfo.has_override
                                                                    ? identityInfo.content
                                                                    : identityInfo.default_content || '(using default)'}
                                                            </pre>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Page-wide payloads and tools */}
                                                {(page.payloads.length > 0 || page.tools.length > 0) && (
                                                    <div>
                                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                                                            Page-wide (available on all tabs)
                                                        </h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {page.payloads.map(p => (
                                                                <span key={p} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                                                    <CubeIcon className="h-3 w-3" />
                                                                    {p}
                                                                </span>
                                                            ))}
                                                            {page.tools.map(t => (
                                                                <span key={t} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                                    <WrenchScrewdriverIcon className="h-3 w-3" />
                                                                    {t}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Client Actions */}
                                                {page.client_actions.length > 0 && (
                                                    <div>
                                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                                                            Client Actions
                                                        </h4>
                                                        <div className="flex flex-wrap gap-2">
                                                            {page.client_actions.map(action => (
                                                                <span key={action} className="inline-flex px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                                                    {action}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Tabs */}
                                                {Object.keys(page.tabs).length > 0 && (
                                                    <div>
                                                        <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                                                            Tabs ({Object.keys(page.tabs).length})
                                                        </h4>
                                                        <div className="space-y-3">
                                                            {Object.entries(page.tabs).map(([tabName, tabConfig]) => (
                                                                <div key={tabName} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
                                                                    <div className="flex items-center gap-2 mb-2">
                                                                        <TagIcon className="h-4 w-4 text-gray-400" />
                                                                        <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                                            {tabName}
                                                                        </span>
                                                                    </div>
                                                                    {(tabConfig.payloads.length > 0 || tabConfig.tools.length > 0) && (
                                                                        <div className="flex flex-wrap gap-2 mb-2">
                                                                            {tabConfig.payloads.map(p => (
                                                                                <span key={p} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                                                                                    <CubeIcon className="h-3 w-3" />
                                                                                    {p}
                                                                                </span>
                                                                            ))}
                                                                            {tabConfig.tools.map(t => (
                                                                                <span key={t} className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                                                                                    <WrenchScrewdriverIcon className="h-3 w-3" />
                                                                                    {t}
                                                                                </span>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                    {tabConfig.payloads.length === 0 && tabConfig.tools.length === 0 && Object.keys(tabConfig.subtabs || {}).length === 0 && (
                                                                        <span className="text-xs text-gray-400">No tab-specific payloads or tools</span>
                                                                    )}

                                                                    {/* Subtabs */}
                                                                    {Object.keys(tabConfig.subtabs || {}).length > 0 && (
                                                                        <div className="mt-3 ml-4 pl-4 border-l-2 border-gray-200 dark:border-gray-600 space-y-2">
                                                                            {Object.entries(tabConfig.subtabs || {}).map(([subtabName, subtabConfig]) => (
                                                                                <div key={subtabName}>
                                                                                    <div className="flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                                                                        <Squares2X2Icon className="h-3 w-3" />
                                                                                        {subtabName}
                                                                                    </div>
                                                                                    {(subtabConfig.payloads.length > 0 || subtabConfig.tools.length > 0) ? (
                                                                                        <div className="flex flex-wrap gap-1">
                                                                                            {subtabConfig.payloads.map(p => (
                                                                                                <span key={p} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                                                                                    {p}
                                                                                                </span>
                                                                                            ))}
                                                                                            {subtabConfig.tools.map(t => (
                                                                                                <span key={t} className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                                                                                    {t}
                                                                                                </span>
                                                                                            ))}
                                                                                        </div>
                                                                                    ) : (
                                                                                        <span className="text-xs text-gray-400">No subtab-specific config</span>
                                                                                    )}
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </>
                                    );
                                })()
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                                    <div className="text-center">
                                        <DocumentTextIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Select a page to view details</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'payloads' && (
                    <div className="flex gap-6 h-[calc(100vh-16rem)]">
                        {/* Left column - Payload list */}
                        <div className="w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            <div className="flex-shrink-0 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                                    Payload Types ({config.payload_types.length})
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {config.payload_types.map((pt) => (
                                    <div
                                        key={pt.name}
                                        onClick={() => setSelectedPayload(pt.name)}
                                        className={`px-4 py-3 cursor-pointer border-b border-gray-100 dark:border-gray-700 ${selectedPayload === pt.name
                                            ? 'bg-blue-50 dark:bg-blue-900/20'
                                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                            }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                {pt.name}
                                            </span>
                                            {pt.is_global && (
                                                <GlobeAltIcon className="h-3 w-3 text-purple-500" />
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 mt-1">
                                            <span className={`inline-flex px-1.5 py-0.5 text-xs font-medium rounded ${pt.source === 'llm'
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                }`}>
                                                {pt.source}
                                            </span>
                                            <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                                {pt.description}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right column - Payload details */}
                        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            {selectedPayload ? (
                                (() => {
                                    const payload = config.payload_types.find(p => p.name === selectedPayload);
                                    if (!payload) return null;
                                    return (
                                        <>
                                            <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                                    {payload.name}
                                                </h3>
                                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                                    {payload.description}
                                                </p>
                                            </div>
                                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                                {/* Properties */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Source</div>
                                                        <div className={`mt-1 inline-flex px-2 py-1 text-sm font-medium rounded ${payload.source === 'llm'
                                                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                                                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                                                            }`}>
                                                            {payload.source}
                                                        </div>
                                                    </div>
                                                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Scope</div>
                                                        <div className="mt-1 text-sm text-gray-900 dark:text-white">
                                                            {payload.is_global ? (
                                                                <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                                                                    <GlobeAltIcon className="h-4 w-4" />
                                                                    Global
                                                                </span>
                                                            ) : (
                                                                'Page-specific'
                                                            )}
                                                        </div>
                                                    </div>
                                                    {payload.parse_marker && (
                                                        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Parse Marker</div>
                                                            <code className="mt-1 inline-block bg-gray-200 dark:bg-gray-600 px-2 py-1 rounded text-sm">
                                                                {payload.parse_marker}
                                                            </code>
                                                        </div>
                                                    )}
                                                    <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                                                        <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Features</div>
                                                        <div className="mt-1 flex gap-3 text-sm">
                                                            <span className={payload.has_parser ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                                                                {payload.has_parser ? '✓' : '✗'} Parser
                                                            </span>
                                                            <span className={payload.has_instructions ? 'text-green-600 dark:text-green-400' : 'text-gray-400'}>
                                                                {payload.has_instructions ? '✓' : '✗'} Instructions
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Schema */}
                                                <div>
                                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                                                        Data Schema
                                                    </h4>
                                                    {payload.schema ? (
                                                        <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-xs font-mono max-h-96 overflow-y-auto">
                                                            {JSON.stringify(payload.schema, null, 2)}
                                                        </pre>
                                                    ) : (
                                                        <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                                                            No schema defined
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </>
                                    );
                                })()
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
                                    <div className="text-center">
                                        <CubeIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Select a payload type to view details</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'tools' && (
                    <div className="flex gap-6 h-[calc(100vh-16rem)]">
                        {/* Left column - Tools list */}
                        <div className="w-1/3 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            <div className="flex-shrink-0 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    Tools ({config.tools.length})
                                </h3>
                            </div>
                            <div className="flex-1 overflow-y-auto">
                                {toolsByCategory.map(({ category, tools }) => (
                                    <div key={category}>
                                        {/* Category header */}
                                        <div className="sticky top-0 px-4 py-2 bg-gray-100 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                                            <span className="text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                                                {category}
                                            </span>
                                            <span className="ml-2 text-xs text-gray-400">
                                                ({tools.length})
                                            </span>
                                        </div>
                                        {/* Tools in category */}
                                        {tools.map((tool) => (
                                            <button
                                                key={tool.name}
                                                onClick={() => setSelectedToolName(tool.name)}
                                                className={`w-full text-left px-4 py-2.5 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedToolName === tool.name ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-l-purple-500' : ''
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="font-medium text-gray-900 dark:text-white text-sm">
                                                        {tool.name}
                                                    </span>
                                                    <div className="flex items-center gap-1.5">
                                                        {tool.is_global && (
                                                            <GlobeAltIcon className="h-3.5 w-3.5 text-purple-500" title="Global" />
                                                        )}
                                                        {tool.streaming && (
                                                            <span className="text-xs text-blue-500" title="Streaming">S</span>
                                                        )}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right column - Tool details */}
                        <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                            {selectedTool ? (
                                <>
                                    {/* Header - Tool name */}
                                    <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white font-mono">
                                            {selectedTool.name}
                                        </h3>
                                    </div>

                                    <div className="flex-1 overflow-y-auto">
                                        {/* Metadata Grid - Always 4 columns, fixed positions */}
                                        <div className="grid grid-cols-4 border-b border-gray-200 dark:border-gray-700">
                                            {/* Category */}
                                            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Category
                                                </div>
                                                <div className="text-sm text-gray-900 dark:text-white">
                                                    {selectedTool.category}
                                                </div>
                                            </div>
                                            {/* Scope */}
                                            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Scope
                                                </div>
                                                <div className="text-sm">
                                                    {selectedTool.is_global ? (
                                                        <span className="text-purple-600 dark:text-purple-400">Global</span>
                                                    ) : (
                                                        <span className="text-gray-600 dark:text-gray-300">Page-specific</span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Streaming */}
                                            <div className="px-4 py-3 border-r border-gray-200 dark:border-gray-700">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Streaming
                                                </div>
                                                <div className="text-sm">
                                                    {selectedTool.streaming ? (
                                                        <span className="text-blue-600 dark:text-blue-400">Yes</span>
                                                    ) : (
                                                        <span className="text-gray-400">No</span>
                                                    )}
                                                </div>
                                            </div>
                                            {/* Payload Type */}
                                            <div className="px-4 py-3">
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">
                                                    Payload Type
                                                </div>
                                                <div className="text-sm">
                                                    {selectedTool.payload_type ? (
                                                        <code className="text-gray-900 dark:text-white">{selectedTool.payload_type}</code>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Description - Fixed minimum height to keep Parameters stable */}
                                        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 min-h-[120px]">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">
                                                Description
                                            </div>
                                            <p className="text-sm text-gray-900 dark:text-white leading-relaxed">
                                                {selectedTool.description}
                                            </p>
                                        </div>

                                        {/* Parameters - Always visible */}
                                        <div className="px-6 py-4">
                                            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3">
                                                Parameters
                                            </div>
                                            {selectedTool.input_schema?.properties && Object.keys(selectedTool.input_schema.properties).length > 0 ? (
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                            <th className="pb-2 pr-4">Name</th>
                                                            <th className="pb-2 pr-4">Type</th>
                                                            <th className="pb-2 pr-4">Required</th>
                                                            <th className="pb-2 pr-4">Default</th>
                                                            <th className="pb-2">Description</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                                                        {Object.entries(selectedTool.input_schema.properties).map(([paramName, paramDef]) => {
                                                            const isRequired = selectedTool.input_schema?.required?.includes(paramName) ?? false;
                                                            return (
                                                                <tr key={paramName} className="align-top">
                                                                    <td className="py-2 pr-4">
                                                                        <code className="font-semibold text-purple-600 dark:text-purple-400">
                                                                            {paramName}
                                                                        </code>
                                                                    </td>
                                                                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">
                                                                        {paramDef.type}
                                                                        {paramDef.enum && (
                                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                                {paramDef.enum.map((val) => (
                                                                                    <code key={val} className="text-xs bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded">
                                                                                        {val}
                                                                                    </code>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                        {(paramDef.minimum !== undefined || paramDef.maximum !== undefined) && (
                                                                            <div className="text-xs text-gray-400 mt-0.5">
                                                                                {paramDef.minimum !== undefined && `min: ${paramDef.minimum}`}
                                                                                {paramDef.minimum !== undefined && paramDef.maximum !== undefined && ', '}
                                                                                {paramDef.maximum !== undefined && `max: ${paramDef.maximum}`}
                                                                            </div>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2 pr-4">
                                                                        {isRequired ? (
                                                                            <span className="text-red-500">Yes</span>
                                                                        ) : (
                                                                            <span className="text-gray-400">No</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2 pr-4 text-gray-600 dark:text-gray-300">
                                                                        {paramDef.default !== undefined ? (
                                                                            <code>{String(paramDef.default)}</code>
                                                                        ) : (
                                                                            <span className="text-gray-400">—</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="py-2 text-gray-600 dark:text-gray-300">
                                                                        {paramDef.description || <span className="text-gray-400">—</span>}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                </table>
                                            ) : (
                                                <p className="text-sm text-gray-400 italic">
                                                    No parameters
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                                    <div className="text-center">
                                        <WrenchScrewdriverIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                        <p>Select a tool to view details</p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {activeTab === 'streams' && (
                    <div>
                        {isLoadingStreams ? (
                            <div className="flex items-center justify-center py-12">
                                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
                            </div>
                        ) : streamError ? (
                            <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                {streamError}
                            </div>
                        ) : (
                            <>
                                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                                        <thead className="bg-gray-50 dark:bg-gray-900">
                                            <tr>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Stream
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Has Instructions
                                                </th>
                                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Preview
                                                </th>
                                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                                    Actions
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                            {streamConfigs.map((stream) => (
                                                <tr key={stream.stream_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <div className="font-medium text-gray-900 dark:text-white">
                                                            {stream.stream_name}
                                                        </div>
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            ID: {stream.stream_id}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap">
                                                        <StatusIcon active={stream.has_override} />
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {stream.content ? (
                                                            <div className="text-sm text-gray-600 dark:text-gray-400 max-w-md">
                                                                <pre className="whitespace-pre-wrap font-mono text-xs bg-gray-50 dark:bg-gray-900 p-2 rounded">
                                                                    {stream.content.length > 200
                                                                        ? stream.content.substring(0, 200) + '...'
                                                                        : stream.content}
                                                                </pre>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 text-sm">No instructions configured</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 whitespace-nowrap text-right">
                                                        <button
                                                            onClick={() => openStreamConfig(stream)}
                                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                                                        >
                                                            <PencilSquareIcon className="h-4 w-4" />
                                                            Edit
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                            {streamConfigs.length === 0 && (
                                                <tr>
                                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                                        No research streams found.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                                    Stream instructions are included in the system prompt when chatting about reports from that stream.
                                    They guide the assistant on domain-specific terminology, classification rules, and analysis criteria.
                                </div>
                            </>
                        )}
                    </div>
                )}

                {activeTab === 'help' && (
                    <div className="space-y-4">
                        {/* Help header with reload button */}
                        <div className="flex items-center justify-between">
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                Help documentation shown to users via chat.
                                <span className="ml-2 text-gray-500">
                                    {helpTotalTopics} topics, {helpTotalOverrides} custom overrides
                                </span>
                            </div>
                            <button
                                onClick={handleReloadHelp}
                                disabled={isReloadingHelp}
                                className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                            >
                                <ArrowPathIcon className={`h-4 w-4 ${isReloadingHelp ? 'animate-spin' : ''}`} />
                                Reload from Files
                            </button>
                        </div>

                        {helpError && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
                                {helpError}
                            </div>
                        )}

                        {/* Help view mode tabs */}
                        <div className="border-b border-gray-200 dark:border-gray-700">
                            <nav className="flex gap-4">
                                <button
                                    onClick={() => setHelpViewMode('content')}
                                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${helpViewMode === 'content'
                                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <BookOpenIcon className="h-4 w-4" />
                                        Content
                                    </div>
                                </button>
                                <button
                                    onClick={() => setHelpViewMode('llm-view')}
                                    className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${helpViewMode === 'llm-view'
                                        ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                        : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <EyeIcon className="h-4 w-4" />
                                        LLM View
                                    </div>
                                </button>
                            </nav>
                        </div>

                        {isLoadingHelp ? (
                            <div className="flex items-center justify-center py-12">
                                <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                            </div>
                        ) : helpViewMode === 'content' ? (
                            <div className="flex gap-6 h-[calc(100vh-20rem)]">
                                {/* Left column - Categories list */}
                                <div className="w-1/4 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                                    <div className="flex-shrink-0 px-4 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                                        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Help Categories
                                        </h3>
                                    </div>
                                    <div className="flex-1 overflow-y-auto">
                                        {helpCategories.map((cat) => (
                                            <button
                                                key={cat.category}
                                                onClick={() => selectHelpCategory(cat.category)}
                                                className={`w-full text-left px-4 py-3 border-b border-gray-100 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${selectedHelpCategory?.category === cat.category ? 'bg-purple-50 dark:bg-purple-900/20 border-l-4 border-l-purple-500' : ''
                                                    }`}
                                            >
                                                <div className="font-medium text-gray-900 dark:text-white">
                                                    {cat.label}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 dark:text-gray-400">
                                                    <span>{cat.topic_count} topics</span>
                                                    {cat.override_count > 0 && (
                                                        <span className="inline-flex px-1.5 py-0.5 text-xs font-medium rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                                            {cat.override_count} custom
                                                        </span>
                                                    )}
                                                </div>
                                            </button>
                                        ))}
                                        {helpCategories.length === 0 && (
                                            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400 text-sm">
                                                No help categories found.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Right column - Category detail and editing */}
                                <div className="flex-1 bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col">
                                    {isLoadingHelpCategory ? (
                                        <div className="flex-1 flex items-center justify-center">
                                            <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
                                        </div>
                                    ) : selectedHelpCategory ? (
                                        <>
                                            {/* Header */}
                                            <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                                        {selectedHelpCategory.label}
                                                    </h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {selectedHelpCategory.topics.length} topics
                                                        {selectedHelpCategory.topics.some(t => t.has_override) && (
                                                            <span className="ml-2">
                                                                ({selectedHelpCategory.topics.filter(t => t.has_override).length} with custom content)
                                                            </span>
                                                        )}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    {selectedHelpCategory.topics.some(t => t.has_override) && (
                                                        <button
                                                            onClick={resetHelpCategory}
                                                            disabled={isSavingHelp}
                                                            className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                                        >
                                                            Reset All to Defaults
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={saveHelpCategory}
                                                        disabled={isSavingHelp || !hasHelpChanges}
                                                        className="px-4 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                                                    >
                                                        {isSavingHelp ? 'Saving...' : `Save${modifiedTopics.length > 0 ? ` (${modifiedTopics.length})` : ''}`}
                                                    </button>
                                                    <button
                                                        onClick={() => setIsHelpMaximized(true)}
                                                        className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                                        title="Maximize editor"
                                                    >
                                                        <ArrowsPointingOutIcon className="h-5 w-5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Topic tabs */}
                                            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                                                <nav className="flex overflow-x-auto px-4 gap-1" aria-label="Topics">
                                                    {selectedHelpCategory.topics.map((topic, index) => {
                                                        const editingTopic = editingTopics.find(t => t.category === topic.category && t.topic === topic.topic);
                                                        const isModified = editingTopic && editingTopic.content !== editingTopic.originalContent;
                                                        const isSelected = selectedTopicIndex === index;
                                                        return (
                                                            <button
                                                                key={`${topic.category}/${topic.topic}`}
                                                                onClick={() => setSelectedTopicIndex(index)}
                                                                className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${isSelected
                                                                    ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                                                                    }`}
                                                            >
                                                                <span className="flex items-center gap-2">
                                                                    {topic.title}
                                                                    {(topic.has_override || isModified) && (
                                                                        <span className={`inline-flex w-2 h-2 rounded-full ${isModified ? 'bg-amber-500' : 'bg-purple-500'
                                                                            }`} />
                                                                    )}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </nav>
                                            </div>

                                            {/* Selected topic content */}
                                            {selectedHelpCategory.topics[selectedTopicIndex] && (() => {
                                                const topic = selectedHelpCategory.topics[selectedTopicIndex];
                                                const editingTopic = editingTopics.find(t => t.category === topic.category && t.topic === topic.topic);
                                                const isModified = editingTopic && editingTopic.content !== editingTopic.originalContent;
                                                return (
                                                    <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                                        {/* Topic metadata bar */}
                                                        <div className="flex-shrink-0 px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                                            <div className="flex items-center gap-3">
                                                                <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                                                    {topic.category}/{topic.topic}
                                                                </code>
                                                                {topic.has_override && (
                                                                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                                                        Custom
                                                                    </span>
                                                                )}
                                                                {isModified && (
                                                                    <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                                        Modified
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                {topic.roles.map((role) => (
                                                                    <span
                                                                        key={role}
                                                                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(role)}`}
                                                                    >
                                                                        {getRoleIcon(role)}
                                                                        {role}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                        {/* Topic summary */}
                                                        <div className="flex-shrink-0 px-6 py-2 bg-gray-50 dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                                            {topic.summary}
                                                        </div>
                                                        {/* Content editor - fills remaining space */}
                                                        <div className="flex-1 min-h-0 p-4">
                                                            <textarea
                                                                value={editingTopic?.content || ''}
                                                                onChange={(e) => updateTopicContent(topic.category, topic.topic, e.target.value)}
                                                                placeholder="Enter help content in markdown..."
                                                                className="w-full h-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })()}
                                        </>
                                    ) : (
                                        <div className="flex-1 flex items-center justify-center text-gray-400 dark:text-gray-500">
                                            <div className="text-center">
                                                <BookOpenIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                                                <p>Select a category to view and edit help topics</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            /* LLM View - Preview with inline editing */
                            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden flex flex-col h-[calc(100vh-18rem)]">
                                {/* Header with role selector and reset button */}
                                <div className="flex-shrink-0 px-6 py-4 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Preview as:</span>
                                        <div className="flex gap-2">
                                            {(['member', 'org_admin', 'platform_admin'] as const).map((role) => (
                                                <button
                                                    key={role}
                                                    onClick={() => setSelectedPreviewRole(role)}
                                                    className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${selectedPreviewRole === role
                                                        ? 'bg-purple-600 text-white'
                                                        : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
                                                        }`}
                                                >
                                                    {role === 'member' ? 'Member' : role === 'org_admin' ? 'Org Admin' : 'Platform Admin'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button
                                        onClick={resetAllLlmConfig}
                                        disabled={isSavingField}
                                        className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                                    >
                                        Reset All to Defaults
                                    </button>
                                </div>

                                {/* Preview content - scrollable */}
                                <div className="flex-1 overflow-y-auto p-6">
                                    <div className="font-mono text-sm space-y-6">
                                        {/* Section header */}
                                        <div className="text-purple-600 dark:text-purple-400 font-bold">== HELP ==</div>

                                        {/* Narrative - editable */}
                                        {tocConfig && (
                                            <div className="group relative">
                                                {editingField === 'narrative' ? (
                                                    <div className="space-y-2">
                                                        <textarea
                                                            value={editingValue}
                                                            onChange={(e) => setEditingValue(e.target.value)}
                                                            rows={8}
                                                            className="w-full px-3 py-2 border-2 border-purple-500 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                                                            autoFocus
                                                        />
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={saveEditing}
                                                                disabled={isSavingField}
                                                                className="px-3 py-1 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
                                                            >
                                                                {isSavingField ? 'Saving...' : 'Save'}
                                                            </button>
                                                            <button
                                                                onClick={cancelEditing}
                                                                disabled={isSavingField}
                                                                className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        onClick={() => startEditing('narrative', tocConfig.narrative)}
                                                        className="cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded p-2 -m-2 border border-transparent hover:border-purple-300 dark:hover:border-purple-700"
                                                    >
                                                        <div className="whitespace-pre-wrap text-gray-700 dark:text-gray-300">{tocConfig.narrative}</div>
                                                        <PencilSquareIcon className="h-4 w-4 text-purple-500 opacity-0 group-hover:opacity-100 absolute top-2 right-2" />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Available Help Topics header */}
                                        <div className="font-bold text-gray-800 dark:text-gray-200">**Available Help Topics:**</div>

                                        {/* Preamble - editable */}
                                        {tocConfig && (
                                            <div className="group relative">
                                                {editingField === 'preamble' ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            type="text"
                                                            value={editingValue}
                                                            onChange={(e) => setEditingValue(e.target.value)}
                                                            className="w-full px-3 py-2 border-2 border-purple-500 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                                                            autoFocus
                                                        />
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={saveEditing}
                                                                disabled={isSavingField}
                                                                className="px-3 py-1 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
                                                            >
                                                                {isSavingField ? 'Saving...' : 'Save'}
                                                            </button>
                                                            <button
                                                                onClick={cancelEditing}
                                                                disabled={isSavingField}
                                                                className="px-3 py-1 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                            >
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div
                                                        onClick={() => startEditing('preamble', tocConfig.preamble)}
                                                        className="cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded p-2 -m-2 border border-transparent hover:border-purple-300 dark:hover:border-purple-700 text-gray-600 dark:text-gray-400"
                                                    >
                                                        {tocConfig.preamble}
                                                        <PencilSquareIcon className="h-4 w-4 text-purple-500 opacity-0 group-hover:opacity-100 absolute top-2 right-2" />
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Categories and topics */}
                                        {topicSummaries && Object.entries(topicSummaries.categories).map(([category, topics]) => {
                                            // Filter topics by selected role
                                            const visibleTopics = topics.filter(t =>
                                                selectedPreviewRole === 'platform_admin' || t.roles.includes(selectedPreviewRole)
                                            );

                                            if (visibleTopics.length === 0) return null;

                                            return (
                                                <div key={category} className="space-y-1">
                                                    {/* Category ID - read only */}
                                                    <div className="text-gray-700 dark:text-gray-300">
                                                        {category}:
                                                    </div>

                                                    {/* Topics with summaries */}
                                                    {visibleTopics.map((topic) => (
                                                        <div key={`${category}/${topic.topic}`} className="pl-4 group relative">
                                                            {editingField === `summary:${category}/${topic.topic}` ? (
                                                                <div className="space-y-2">
                                                                    <div className="flex items-start gap-2">
                                                                        <span className="text-gray-600 dark:text-gray-400">- {topic.topic}:</span>
                                                                        <input
                                                                            type="text"
                                                                            value={editingValue}
                                                                            onChange={(e) => setEditingValue(e.target.value)}
                                                                            className="flex-1 px-2 py-1 border-2 border-purple-500 rounded bg-white dark:bg-gray-900 text-gray-900 dark:text-white text-sm font-mono"
                                                                            autoFocus
                                                                        />
                                                                    </div>
                                                                    <div className="flex gap-2 ml-4">
                                                                        <button
                                                                            onClick={saveEditing}
                                                                            disabled={isSavingField}
                                                                            className="px-2 py-0.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded disabled:opacity-50"
                                                                        >
                                                                            Save
                                                                        </button>
                                                                        <button
                                                                            onClick={cancelEditing}
                                                                            disabled={isSavingField}
                                                                            className="px-2 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                                                                        >
                                                                            Cancel
                                                                        </button>
                                                                        {topic.has_override && (
                                                                            <span className="text-xs text-purple-600 dark:text-purple-400">(customized)</span>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    onClick={() => startEditing(`summary:${category}/${topic.topic}`, topic.current_summary)}
                                                                    className="cursor-pointer hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded px-2 py-0.5 -mx-2 border border-transparent hover:border-purple-300 dark:hover:border-purple-700"
                                                                >
                                                                    <span className="text-gray-600 dark:text-gray-400">
                                                                        - {topic.topic}: {topic.current_summary}
                                                                    </span>
                                                                    {topic.has_override && (
                                                                        <span className="ml-2 text-xs text-purple-600 dark:text-purple-400">(customized)</span>
                                                                    )}
                                                                    <PencilSquareIcon className="h-3 w-3 text-purple-500 opacity-0 group-hover:opacity-100 inline ml-2" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Help text footer */}
                                <div className="flex-shrink-0 px-6 py-3 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400">
                                    Click any highlighted text to edit it. Changes are saved immediately.
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* System Tab Content */}
            {activeTab === 'system' && (
                <div className="space-y-6">
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                        System-wide chat configuration settings.
                    </div>

                    {systemError && (
                        <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                            {systemError}
                        </div>
                    )}

                    {isLoadingSystem ? (
                        <div className="flex items-center justify-center py-8">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
                        </div>
                    ) : systemConfig ? (
                        <div className="space-y-6">
                            {/* Global Preamble */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                                <div className="flex items-center justify-between mb-4">
                                    <div>
                                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                            Global Preamble
                                        </h3>
                                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                            The global preamble appears at the start of every chat system prompt. It explains what Knowledge Horizon is, the assistant's role, and how to handle different types of questions.
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {systemConfig.global_preamble && (
                                            <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                                Custom Override
                                            </span>
                                        )}
                                        <button
                                            onClick={() => setIsPreambleMaximized(true)}
                                            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400 dark:hover:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded transition-colors"
                                        >
                                            <PencilSquareIcon className="h-4 w-4" />
                                            Edit
                                        </button>
                                    </div>
                                </div>

                                {/* Preview of current preamble */}
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 max-h-64 overflow-y-auto">
                                    <pre className="text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                                        {systemConfig.global_preamble || systemConfig.default_global_preamble}
                                    </pre>
                                </div>
                            </div>

                            {/* Agent Settings */}
                            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
                                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                                    Agent Settings
                                </h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Max Tool Iterations
                                        </label>
                                        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                                            Maximum number of tool call iterations per chat request. Higher values allow more complex multi-step operations but increase response time and cost.
                                        </p>
                                        <div className="flex items-center gap-4">
                                            <input
                                                type="number"
                                                min={1}
                                                max={20}
                                                value={editingMaxIterations}
                                                onChange={(e) => setEditingMaxIterations(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                                                className="w-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                            />
                                            <span className="text-sm text-gray-500 dark:text-gray-400">
                                                (1-20, default: 5)
                                            </span>
                                            {editingMaxIterations !== systemConfig.max_tool_iterations && (
                                                <button
                                                    onClick={saveSystemConfig}
                                                    disabled={isSavingSystem}
                                                    className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                                                >
                                                    {isSavingSystem ? 'Saving...' : 'Save'}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {/* Architecture Info */}
            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-4">
                <h3 className="font-medium text-purple-900 dark:text-purple-300 mb-2">
                    Chat System Architecture
                </h3>
                <div className="text-sm text-purple-700 dark:text-purple-400 space-y-2">
                    <p>
                        <strong>PayloadType</strong> and <strong>ToolConfig</strong> are definitions (single source of truth).
                        They don't know about pages - they just define what exists.
                    </p>
                    <p>
                        <strong>PageConfig</strong> references payloads and tools by name, with optional <strong>TabConfig</strong> and <strong>SubTabConfig</strong> for finer control.
                        The <code className="bg-purple-100 dark:bg-purple-800 px-1 rounded">is_global</code> flag determines default availability.
                    </p>
                    <p>
                        <strong>Stream Instructions</strong> are per-stream customizations stored in the database.
                        They're added to the system prompt when chatting about that stream's reports.
                    </p>
                    <p>
                        <strong>Resolution:</strong> Available = global + page + tab + subtab | System prompt = context + payload instructions + stream instructions
                    </p>
                </div>
            </div>

            {/* Stream Instructions Edit Modal - Full size for text editing */}
            {selectedStream && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Edit Chat Instructions
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedStream.stream_name}
                                    {selectedStream.has_override && (
                                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                            Custom Override
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={closeStreamConfig}
                                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-h-0 flex flex-col p-6">
                            {streamError && (
                                <div className="flex-shrink-0 mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                    {streamError}
                                </div>
                            )}
                            <p className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 mb-4">
                                These instructions are added to the system prompt when chatting about reports from this stream.
                                Use them to guide the assistant on domain-specific terminology, classification rules, and analysis criteria.
                            </p>
                            <textarea
                                value={streamInstructions}
                                onChange={(e) => setStreamInstructions(e.target.value)}
                                placeholder="Enter custom instructions for this stream..."
                                className="flex-1 min-h-0 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                            />
                        </div>

                        {/* Footer */}
                        <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-end gap-3">
                            <button
                                onClick={closeStreamConfig}
                                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={saveStreamConfig}
                                disabled={isSavingStream}
                                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                            >
                                {isSavingStream ? 'Saving...' : 'Save Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Preamble Edit Modal */}
            {isPreambleMaximized && systemConfig && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Edit Global Preamble
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    This text appears at the start of every chat system prompt
                                    {systemConfig.global_preamble && (
                                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                            Custom Override
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={() => setIsPreambleMaximized(false)}
                                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Content - Side by side layout */}
                        <div className="flex-1 min-h-0 flex flex-col p-6">
                            {systemError && (
                                <div className="flex-shrink-0 mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                    {systemError}
                                </div>
                            )}

                            <p className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 mb-4">
                                The global preamble explains what Knowledge Horizon is, the assistant's role, and how to handle different types of questions (navigation vs data).
                            </p>

                            {/* Side-by-side panels */}
                            <div className="flex-1 min-h-0 flex gap-4">
                                {/* Left panel - Default */}
                                <div
                                    className="flex flex-col min-w-[300px] max-w-[60%] bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden"
                                    style={{ width: '40%', resize: 'horizontal', overflow: 'auto' }}
                                >
                                    <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Default Preamble (from code)
                                        </p>
                                    </div>
                                    <pre className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                                        {systemConfig.default_global_preamble}
                                    </pre>
                                </div>

                                {/* Right panel - Override editor */}
                                <div className="flex-1 min-w-[300px] flex flex-col">
                                    <label className="flex-shrink-0 block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                        Override {systemConfig.global_preamble && <span className="text-purple-600 dark:text-purple-400">(active)</span>}
                                    </label>
                                    <textarea
                                        value={editingPreamble}
                                        onChange={(e) => setEditingPreamble(e.target.value)}
                                        placeholder="Leave empty to use the default, or enter a custom preamble..."
                                        className="flex-1 min-h-0 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        {(() => {
                            const savedContent = systemConfig.global_preamble || '';
                            const hasChanges = editingPreamble !== savedContent;

                            return (
                                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <div>
                                        {systemConfig.global_preamble && (
                                            <button
                                                onClick={resetPreamble}
                                                disabled={isSavingSystem}
                                                className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                Reset to Default
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={savePreamble}
                                            disabled={isSavingSystem || !hasChanges}
                                            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                                        >
                                            {isSavingSystem ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                            onClick={() => setIsPreambleMaximized(false)}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            {hasChanges ? 'Cancel' : 'Close'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Page Config Edit Modal - Full size for text editing */}
            {selectedPageConfig && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Edit Page Persona
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedPageConfig.page}
                                    {selectedPageConfig.has_override && (
                                        <span className="ml-2 inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                            Custom Persona
                                        </span>
                                    )}
                                </p>
                            </div>
                            <button
                                onClick={closePageConfig}
                                className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-6 w-6" />
                            </button>
                        </div>

                        {/* Content - Side by side layout */}
                        <div className="flex-1 min-h-0 flex flex-col p-6">
                            {pageError && (
                                <div className="flex-shrink-0 mb-4 p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                                    {pageError}
                                </div>
                            )}

                            <p className="flex-shrink-0 text-sm text-gray-600 dark:text-gray-400 mb-4">
                                The persona defines who the assistant is and how it behaves on this page.
                                It appears at the start of the system prompt and sets the tone for all interactions.
                            </p>

                            {/* Side-by-side panels */}
                            <div className="flex-1 min-h-0 flex gap-4">
                                {/* Left panel - Default (resizable) */}
                                <div
                                    className="flex flex-col min-w-[300px] max-w-[60%] bg-gray-50 dark:bg-gray-900 rounded-lg overflow-hidden"
                                    style={{ width: '40%', resize: 'horizontal', overflow: 'auto' }}
                                >
                                    <div className="flex-shrink-0 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800">
                                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                                            Default Persona ({selectedPageConfig.default_is_global ? 'global' : 'page-specific'})
                                        </p>
                                    </div>
                                    <pre className="flex-1 min-h-0 overflow-auto p-3 text-xs font-mono whitespace-pre-wrap text-gray-600 dark:text-gray-400">
                                        {selectedPageConfig.default_content || '(no default)'}
                                    </pre>
                                </div>

                                {/* Right panel - Override editor */}
                                <div className="flex-1 min-w-[300px] flex flex-col">
                                    <label className="flex-shrink-0 block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                                        Override {selectedPageConfig.has_override && <span className="text-purple-600 dark:text-purple-400">(active)</span>}
                                    </label>
                                    <textarea
                                        value={editingContent}
                                        onChange={(e) => setEditingContent(e.target.value)}
                                        placeholder="Leave empty to use the default, or enter a custom persona..."
                                        className="flex-1 min-h-0 w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                                    />
                                    {/* Cheat sheet - compact */}
                                    <div className="flex-shrink-0 mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                        <p className="text-xs text-blue-600 dark:text-blue-400">
                                            <strong>Suggested sections:</strong> ## Role, ## Style, ## Handling Ambiguity, ## Constraints
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        {(() => {
                            // Compute if there are unsaved changes
                            const savedContent = selectedPageConfig.has_override ? (selectedPageConfig.content || '') : '';
                            const hasChanges = editingContent !== savedContent;

                            return (
                                <div className="flex-shrink-0 px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                    <div>
                                        {selectedPageConfig.has_override && (
                                            <button
                                                onClick={resetPageConfig}
                                                disabled={isSavingPage}
                                                className="px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                                            >
                                                Reset to Default
                                            </button>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <button
                                            onClick={savePageConfig}
                                            disabled={isSavingPage || !hasChanges}
                                            className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
                                        >
                                            {isSavingPage ? 'Saving...' : 'Save'}
                                        </button>
                                        <button
                                            onClick={closePageConfig}
                                            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                                        >
                                            {hasChanges ? 'Cancel' : 'Close'}
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}

            {/* Help Content Maximized Editor Modal */}
            {isHelpMaximized && selectedHelpCategory && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[calc(100vw-4rem)] max-w-[1400px] h-[calc(100vh-4rem)] flex flex-col">
                        {/* Header */}
                        <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Edit Help Content: {selectedHelpCategory.label}
                                </h2>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                    {selectedHelpCategory.topics.length} topics
                                    {selectedHelpCategory.topics.some(t => t.has_override) && (
                                        <span className="ml-2">
                                            ({selectedHelpCategory.topics.filter(t => t.has_override).length} with custom content)
                                        </span>
                                    )}
                                    {modifiedTopics.length > 0 && (
                                        <span className="ml-2 text-amber-600 dark:text-amber-400">
                                            • {modifiedTopics.length} unsaved changes
                                        </span>
                                    )}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                {selectedHelpCategory.topics.some(t => t.has_override) && (
                                    <button
                                        onClick={resetHelpCategory}
                                        disabled={isSavingHelp}
                                        className="px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors disabled:opacity-50"
                                    >
                                        Reset All to Defaults
                                    </button>
                                )}
                                <button
                                    onClick={saveHelpCategory}
                                    disabled={isSavingHelp || !hasHelpChanges}
                                    className="px-4 py-1.5 text-sm font-medium text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors"
                                >
                                    {isSavingHelp ? 'Saving...' : `Save${modifiedTopics.length > 0 ? ` (${modifiedTopics.length})` : ''}`}
                                </button>
                                <button
                                    onClick={() => setIsHelpMaximized(false)}
                                    className="p-1.5 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                    title="Minimize editor"
                                >
                                    <ArrowsPointingInIcon className="h-5 w-5" />
                                </button>
                                <button
                                    onClick={closeHelpCategory}
                                    className="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
                                >
                                    <XMarkIcon className="h-6 w-6" />
                                </button>
                            </div>
                        </div>

                        {/* Topic tabs */}
                        <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                            <nav className="flex overflow-x-auto px-6 gap-1" aria-label="Topics">
                                {selectedHelpCategory.topics.map((topic, index) => {
                                    const editingTopic = editingTopics.find(t => t.category === topic.category && t.topic === topic.topic);
                                    const isModified = editingTopic && editingTopic.content !== editingTopic.originalContent;
                                    const isSelected = selectedTopicIndex === index;
                                    return (
                                        <button
                                            key={`${topic.category}/${topic.topic}`}
                                            onClick={() => setSelectedTopicIndex(index)}
                                            className={`flex-shrink-0 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${isSelected
                                                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                                                }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                {topic.title}
                                                {(topic.has_override || isModified) && (
                                                    <span className={`inline-flex w-2 h-2 rounded-full ${isModified ? 'bg-amber-500' : 'bg-purple-500'
                                                        }`} />
                                                )}
                                            </span>
                                        </button>
                                    );
                                })}
                            </nav>
                        </div>

                        {/* Selected topic content */}
                        {selectedHelpCategory.topics[selectedTopicIndex] && (() => {
                            const topic = selectedHelpCategory.topics[selectedTopicIndex];
                            const editingTopic = editingTopics.find(t => t.category === topic.category && t.topic === topic.topic);
                            const isModified = editingTopic && editingTopic.content !== editingTopic.originalContent;
                            return (
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                    {/* Topic metadata bar */}
                                    <div className="flex-shrink-0 px-6 py-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <code className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
                                                {topic.category}/{topic.topic}
                                            </code>
                                            {topic.has_override && (
                                                <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                                                    Custom
                                                </span>
                                            )}
                                            {isModified && (
                                                <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                                                    Modified
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            {topic.roles.map((role) => (
                                                <span
                                                    key={role}
                                                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${getRoleBadgeColor(role)}`}
                                                >
                                                    {getRoleIcon(role)}
                                                    {role}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Topic summary */}
                                    <div className="flex-shrink-0 px-6 py-2 bg-gray-50 dark:bg-gray-900 text-sm text-gray-600 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                        {topic.summary}
                                    </div>
                                    {/* Content editor - fills remaining space */}
                                    <div className="flex-1 min-h-0 p-6">
                                        <textarea
                                            value={editingTopic?.content || ''}
                                            onChange={(e) => updateTopicContent(topic.category, topic.topic, e.target.value)}
                                            placeholder="Enter help content in markdown..."
                                            className="w-full h-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                                        />
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper Components

function StatusIcon({ active }: { active: boolean }) {
    return active ? (
        <CheckCircleIcon className="h-5 w-5 text-green-500" />
    ) : (
        <XCircleIcon className="h-5 w-5 text-gray-300 dark:text-gray-600" />
    );
}

