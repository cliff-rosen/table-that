import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PlusIcon, TrashIcon, CheckIcon, XMarkIcon, Cog6ToothIcon, ChatBubbleLeftRightIcon, ChevronUpIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import { adminApi } from '../../lib/api/adminApi';
import { handleApiError } from '../../lib/api';
import ChatTray from '../chat/ChatTray';
import ArtifactChangesCard, { type AcceptExecutor } from '../chat/ArtifactChangesCard';
import type { PayloadHandler } from '../../types/chat';
import type { Artifact, ArtifactCategory } from '../../types/artifact';

const TYPE_BADGES: Record<string, string> = {
    bug: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    feature: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    task: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
};

const STATUS_BADGES: Record<string, string> = {
    new: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    open: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icebox: 'bg-gray-100 text-gray-800 dark:bg-gray-700/50 dark:text-gray-300',
    closed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
};

const STATUS_OPTIONS = [
    { value: 'new', label: 'New' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'icebox', label: 'Icebox' },
    { value: 'closed', label: 'Closed' },
];

const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]));

// Status filter options depend on the current view
const ACTIVE_STATUS_OPTIONS = STATUS_OPTIONS.filter(o => o.value === 'open' || o.value === 'in_progress' || o.value === 'closed');
const ALL_STATUS_OPTIONS = STATUS_OPTIONS;

const PRIORITY_BADGES: Record<string, string> = {
    urgent: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    medium: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    low: 'bg-gray-100 text-gray-600 dark:bg-gray-700/50 dark:text-gray-400',
};

const PRIORITY_OPTIONS = [
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(PRIORITY_OPTIONS.map(o => [o.value, o.label]));

const AREA_OPTIONS = [
    { value: 'login_auth', label: 'Login & Auth' },
    { value: 'user_prefs', label: 'User Prefs' },
    { value: 'streams', label: 'Streams' },
    { value: 'reports', label: 'Reports' },
    { value: 'articles', label: 'Articles' },
    { value: 'notes', label: 'Notes' },
    { value: 'users', label: 'Users' },
    { value: 'organizations', label: 'Organizations' },
    { value: 'data_sources', label: 'Data Sources' },
    { value: 'chat_system', label: 'Chat System' },
    { value: 'help_content', label: 'Help Content' },
    { value: 'system_ops', label: 'System Ops' },
];

const AREA_LABELS: Record<string, string> = Object.fromEntries(AREA_OPTIONS.map(o => [o.value, o.label]));

const AREA_BADGES: Record<string, string> = {
    login_auth: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    user_prefs: 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400',
    streams: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    reports: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    articles: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
    notes: 'bg-lime-100 text-lime-800 dark:bg-lime-900/30 dark:text-lime-400',
    users: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
    organizations: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
    data_sources: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    chat_system: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    help_content: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    system_ops: 'bg-stone-100 text-stone-800 dark:bg-stone-900/30 dark:text-stone-400',
};

const CATEGORY_COLORS: string[] = [
    'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
    'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400',
    'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
    'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
];

function getCategoryColor(category: string, categories: ArtifactCategory[]): string {
    const idx = categories.findIndex((c) => c.name === category);
    return CATEGORY_COLORS[(idx >= 0 ? idx : 0) % CATEGORY_COLORS.length];
}

interface EditState {
    id: number;
    title: string;
    artifact_type: 'bug' | 'feature' | 'task';
    status: string;
    priority: string;
    area: string;
    description: string;
    category: string;
}

type SortField = 'artifact_type' | 'title' | 'priority' | 'area' | 'status' | 'category' | 'created_at';
type SortDir = 'asc' | 'desc';

function RadioGroup({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: { value: string; label: string; color?: string }[];
    onChange: (v: string) => void;
}) {
    return (
        <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">{label}</div>
            <div className="flex flex-col gap-1">
                {options.map((opt) => (
                    <label
                        key={opt.value}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-sm ${
                            value === opt.value
                                ? 'bg-purple-50 dark:bg-purple-900/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                    >
                        <input
                            type="radio"
                            name={label}
                            value={opt.value}
                            checked={value === opt.value}
                            onChange={() => onChange(opt.value)}
                            className="text-purple-600 focus:ring-purple-500"
                        />
                        {opt.color ? (
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${opt.color}`}>
                                {opt.label}
                            </span>
                        ) : (
                            <span className="text-gray-700 dark:text-gray-300">{opt.label}</span>
                        )}
                    </label>
                ))}
            </div>
        </div>
    );
}

// Workflow statuses (normal progression) vs icebox (shelved)
const WORKFLOW_STATUSES = STATUS_OPTIONS.filter(o => o.value !== 'icebox');
const ICEBOX_STATUS = STATUS_OPTIONS.find(o => o.value === 'icebox')!;

function StatusRadioGroup({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">Status</div>
            <div className="flex flex-col gap-1">
                {WORKFLOW_STATUSES.map((opt) => (
                    <label
                        key={opt.value}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-sm ${
                            value === opt.value
                                ? 'bg-purple-50 dark:bg-purple-900/20'
                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                    >
                        <input
                            type="radio"
                            name="status"
                            value={opt.value}
                            checked={value === opt.value}
                            onChange={() => onChange(opt.value)}
                            className="text-purple-600 focus:ring-purple-500"
                        />
                        <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGES[opt.value]}`}>
                            {opt.label}
                        </span>
                    </label>
                ))}
                <div className="border-t border-gray-200 dark:border-gray-600 my-1" />
                <label
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-sm ${
                        value === 'icebox'
                            ? 'bg-purple-50 dark:bg-purple-900/20'
                            : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                >
                    <input
                        type="radio"
                        name="status"
                        value="icebox"
                        checked={value === 'icebox'}
                        onChange={() => onChange('icebox')}
                        className="text-purple-600 focus:ring-purple-500"
                    />
                    <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${STATUS_BADGES.icebox}`}>
                        {ICEBOX_STATUS.label}
                    </span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 italic">shelved</span>
                </label>
            </div>
        </div>
    );
}

function NullableRadioGroup({ label, name, value, options, onChange, columns }: {
    label: string;
    name: string;
    value: string;
    options: { value: string; label: string; color?: string }[];
    onChange: (v: string) => void;
    columns?: number;
}) {
    return (
        <div>
            <div className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1.5">{label}</div>
            <div className={columns ? `grid gap-x-4 gap-y-1` : 'flex flex-col gap-1'} style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}>
                <label
                    className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-sm ${
                        !value ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                    }`}
                >
                    <input type="radio" name={name} checked={!value} onChange={() => onChange('')} className="text-purple-600 focus:ring-purple-500" />
                    <span className="text-gray-400 dark:text-gray-500 italic">None</span>
                </label>
                {options.map((opt) => (
                    <label
                        key={opt.value}
                        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer transition-colors text-sm whitespace-nowrap ${
                            value === opt.value ? 'bg-purple-50 dark:bg-purple-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                        }`}
                    >
                        <input type="radio" name={name} checked={value === opt.value} onChange={() => onChange(opt.value)} className="text-purple-600 focus:ring-purple-500" />
                        {opt.color ? (
                            <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${opt.color}`}>{opt.label}</span>
                        ) : (
                            <span className="text-gray-700 dark:text-gray-300">{opt.label}</span>
                        )}
                    </label>
                ))}
            </div>
        </div>
    );
}

function FilterPills({ label, value, options, onChange }: {
    label: string;
    value: string;
    options: { value: string; label: string; color?: string }[];
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">{label}:</span>
            <button
                onClick={() => onChange('')}
                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                    !value
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                }`}
            >
                All
            </button>
            {options.map((opt) => (
                <button
                    key={opt.value}
                    onClick={() => onChange(value === opt.value ? '' : opt.value)}
                    className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                        value === opt.value
                            ? (opt.color || 'bg-purple-600 text-white')
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function SortHeader({ label, field, sortField, sortDir, onSort }: {
    label: string;
    field: SortField;
    sortField: SortField;
    sortDir: SortDir;
    onSort: (f: SortField) => void;
}) {
    const active = sortField === field;
    return (
        <button
            onClick={() => onSort(field)}
            className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
        >
            {label}
            {active ? (
                sortDir === 'asc' ? <ChevronUpIcon className="h-3 w-3" /> : <ChevronDownIcon className="h-3 w-3" />
            ) : (
                <span className="h-3 w-3" />
            )}
        </button>
    );
}

export function ArtifactList() {
    const [artifacts, setArtifacts] = useState<Artifact[]>([]);
    const [categories, setCategories] = useState<ArtifactCategory[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [filterType, setFilterType] = useState<string>('');
    const [filterStatus, setFilterStatus] = useState<string>('');
    const [filterCategory, setFilterCategory] = useState<string>('');
    const [filterArea, setFilterArea] = useState<string>('');
    const [iceboxView, setIceboxView] = useState<'active' | 'new' | 'icebox' | 'all'>('active');

    // Sorting
    const [sortField, setSortField] = useState<SortField>('created_at');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // Multi-select
    const [selected, setSelected] = useState<Set<number>>(new Set());

    // Inline editing state
    const [editing, setEditing] = useState<EditState | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const savingRef = useRef(false);
    const titleInputRef = useRef<HTMLInputElement>(null);

    // Create dialog state
    const [showCreateDialog, setShowCreateDialog] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [newType, setNewType] = useState<'bug' | 'feature' | 'task'>('bug');
    const [newDescription, setNewDescription] = useState('');
    const [newCategory, setNewCategory] = useState('');
    const [newPriority, setNewPriority] = useState('');
    const [newArea, setNewArea] = useState('');
    const [newStatus, setNewStatus] = useState('new');
    const [isCreating, setIsCreating] = useState(false);

    // Category management
    const [showCategoryManager, setShowCategoryManager] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState('');

    // Chat
    const [isChatOpen, setIsChatOpen] = useState(false);

    useEffect(() => {
        loadCategories();
    }, []);

    useEffect(() => {
        loadArtifacts();
    }, [filterType, filterCategory]);

    const loadCategories = async () => {
        try {
            const data = await adminApi.getArtifactCategories();
            setCategories(data);
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const loadArtifacts = async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params: { type?: string; category?: string } = {};
            if (filterType) params.type = filterType;
            if (filterCategory) params.category = filterCategory;
            const data = await adminApi.getArtifacts(params);
            setArtifacts(data);
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsLoading(false);
        }
    };

    // ==================== Sorting ====================

    const handleSort = useCallback((field: SortField) => {
        setSortDir(prev => sortField === field ? (prev === 'asc' ? 'desc' : 'asc') : 'asc');
        setSortField(field);
    }, [sortField]);

    const sortedArtifacts = useMemo(() => {
        // Step 1: Apply view filter + status filter
        let filtered = artifacts;
        if (iceboxView === 'active') {
            filtered = filtered.filter(a => a.status !== 'icebox' && a.status !== 'new');
        } else if (iceboxView === 'new') {
            filtered = filtered.filter(a => a.status === 'new');
        } else if (iceboxView === 'icebox') {
            filtered = filtered.filter(a => a.status === 'icebox');
        }
        if (filterStatus) {
            filtered = filtered.filter(a => a.status === filterStatus);
        }
        if (filterArea) {
            filtered = filtered.filter(a => a.area === filterArea);
        }

        // Step 2: Sort
        const sorted = [...filtered];
        const dir = sortDir === 'asc' ? 1 : -1;
        sorted.sort((a, b) => {
            let aVal: string, bVal: string;
            const priorityOrder = ['urgent', 'high', 'medium', 'low', ''];
            switch (sortField) {
                case 'artifact_type':
                    aVal = a.artifact_type;
                    bVal = b.artifact_type;
                    break;
                case 'title':
                    aVal = a.title.toLowerCase();
                    bVal = b.title.toLowerCase();
                    break;
                case 'priority': {
                    const aIdx = priorityOrder.indexOf(a.priority || '');
                    const bIdx = priorityOrder.indexOf(b.priority || '');
                    if (aIdx < bIdx) return -1 * dir;
                    if (aIdx > bIdx) return 1 * dir;
                    return 0;
                }
                case 'status':
                    aVal = a.status;
                    bVal = b.status;
                    break;
                case 'area':
                    aVal = (a.area || '').toLowerCase();
                    bVal = (b.area || '').toLowerCase();
                    break;
                case 'category':
                    aVal = (a.category || '').toLowerCase();
                    bVal = (b.category || '').toLowerCase();
                    break;
                case 'created_at':
                    aVal = a.created_at;
                    bVal = b.created_at;
                    break;
                default:
                    return 0;
            }
            if (aVal < bVal) return -1 * dir;
            if (aVal > bVal) return 1 * dir;
            return 0;
        });
        return sorted;
    }, [artifacts, sortField, sortDir, iceboxView, filterStatus, filterArea]);

    // ==================== Category Management ====================

    const handleAddCategory = async () => {
        const name = newCategoryName.trim();
        if (!name) return;
        try {
            await adminApi.createArtifactCategory(name);
            setNewCategoryName('');
            await loadCategories();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const handleDeleteCategory = async (id: number) => {
        if (!confirm('Delete this category? Artifacts using it will become uncategorized.')) return;
        try {
            const result = await adminApi.deleteArtifactCategory(id);
            if (result.affected_count > 0) {
                setError(null);
                alert(`Deleted '${result.name}'. ${result.affected_count} artifact(s) are now uncategorized.`);
            }
            await loadCategories();
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    // ==================== CRUD ====================

    const handleCreate = async () => {
        if (!newTitle.trim()) return;

        setIsCreating(true);
        try {
            await adminApi.createArtifact({
                title: newTitle.trim(),
                artifact_type: newType,
                description: newDescription.trim() || undefined,
                category: newCategory || undefined,
                priority: newPriority || undefined,
                area: newArea || undefined,
                status: newStatus || undefined,
            });
            setNewTitle('');
            setNewType('bug');
            setNewDescription('');
            setNewCategory('');
            setNewPriority('');
            setNewArea('');
            setNewStatus('new');
            setShowCreateDialog(false);
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            setIsCreating(false);
        }
    };

    const startEdit = useCallback((artifact: Artifact) => {
        setEditing({
            id: artifact.id,
            title: artifact.title,
            artifact_type: artifact.artifact_type as 'bug' | 'feature' | 'task',
            status: artifact.status,
            priority: artifact.priority || '',
            area: artifact.area || '',
            description: artifact.description || '',
            category: artifact.category || '',
        });
    }, []);

    const saveEdit = useCallback(async (editState?: EditState) => {
        const toSave = editState || editing;
        if (!toSave || !toSave.title.trim() || savingRef.current) return;

        const original = artifacts.find((a) => a.id === toSave.id);
        if (!original) return;

        const hasChanges =
            original.title !== toSave.title.trim() ||
            original.artifact_type !== toSave.artifact_type ||
            original.status !== toSave.status ||
            (original.priority || '') !== toSave.priority ||
            (original.area || '') !== toSave.area ||
            (original.description || '') !== toSave.description.trim() ||
            (original.category || '') !== toSave.category;

        if (!hasChanges) {
            setEditing(null);
            return;
        }

        savingRef.current = true;
        setIsSaving(true);
        try {
            await adminApi.updateArtifact(toSave.id, {
                title: toSave.title.trim(),
                artifact_type: toSave.artifact_type,
                status: toSave.status,
                priority: toSave.priority || '',
                area: toSave.area || '',
                description: toSave.description.trim() || '',
                category: toSave.category || '',
            });
            setEditing(null);
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        } finally {
            savingRef.current = false;
            setIsSaving(false);
        }
    }, [editing, artifacts]);

    const cancelEdit = useCallback(() => {
        setEditing(null);
    }, []);

    const handleRowClick = useCallback(async (artifact: Artifact) => {
        if (editing && editing.id === artifact.id) return;
        if (editing) {
            await saveEdit();
        }
        startEdit(artifact);
    }, [editing, saveEdit, startEdit]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') cancelEdit();
    }, [cancelEdit]);

    const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            cancelEdit();
        } else if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            saveEdit();
        }
    }, [cancelEdit, saveEdit]);

    const handleDelete = async (e: React.MouseEvent, id: number) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this artifact?')) return;
        try {
            await adminApi.deleteArtifact(id);
            if (editing?.id === id) setEditing(null);
            setSelected((prev) => { const s = new Set(prev); s.delete(id); return s; });
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    // ==================== Multi-select & Bulk Actions ====================

    const toggleSelect = (id: number, e: React.MouseEvent | React.ChangeEvent) => {
        e.stopPropagation();
        setSelected((prev) => {
            const s = new Set(prev);
            if (s.has(id)) s.delete(id); else s.add(id);
            return s;
        });
    };

    const toggleSelectAll = () => {
        if (selected.size === sortedArtifacts.length) {
            setSelected(new Set());
        } else {
            setSelected(new Set(sortedArtifacts.map((a) => a.id)));
        }
    };

    const handleBulkStatus = async (newStatus: string) => {
        if (selected.size === 0) return;
        try {
            await adminApi.bulkUpdateArtifacts(Array.from(selected), { status: newStatus });
            setSelected(new Set());
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const handleBulkPriority = async (priority: string) => {
        if (selected.size === 0) return;
        try {
            await adminApi.bulkUpdateArtifacts(Array.from(selected), { priority });
            setSelected(new Set());
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const handleBulkArea = async (areaValue: string) => {
        if (selected.size === 0) return;
        try {
            await adminApi.bulkUpdateArtifacts(Array.from(selected), { area: areaValue });
            setSelected(new Set());
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const handleBulkCategory = async (categoryName: string) => {
        if (selected.size === 0) return;
        try {
            await adminApi.bulkUpdateArtifacts(Array.from(selected), { category: categoryName });
            setSelected(new Set());
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    const handleBulkDelete = async () => {
        if (selected.size === 0) return;
        if (!confirm(`Delete ${selected.size} artifact(s)?`)) return;
        try {
            await adminApi.bulkDeleteArtifacts(Array.from(selected));
            setSelected(new Set());
            if (editing && selected.has(editing.id)) setEditing(null);
            await loadArtifacts();
        } catch (err) {
            setError(handleApiError(err));
        }
    };

    // Focus title input when editing starts
    useEffect(() => {
        if (editing && titleInputRef.current) {
            titleInputRef.current.focus();
        }
    }, [editing?.id]);

    const chatContext = useMemo(() => ({
        current_page: 'artifacts',
        artifacts: sortedArtifacts.map(a => ({
            id: a.id, title: a.title, artifact_type: a.artifact_type,
            status: a.status, priority: a.priority, area: a.area, category: a.category, description: a.description,
            created_by_name: a.created_by_name, updated_by_name: a.updated_by_name,
        })),
        total_artifact_count: artifacts.length,
        categories: categories.map(c => ({ id: c.id, name: c.name })),
        filters: { view: iceboxView, type: filterType, status: filterStatus, category: filterCategory, area: filterArea },
        selected_count: selected.size,
    }), [sortedArtifacts, artifacts.length, categories, iceboxView, filterType, filterStatus, filterCategory, filterArea, selected.size]);

    /** Step-by-step executor: processes each operation individually and reports progress */
    const handleApplyArtifactChanges: AcceptExecutor = useCallback(async (data, steps, onProgress) => {
        let stepIdx = 0;

        const markRunning = () => {
            steps[stepIdx].status = 'running';
            onProgress(steps);
        };
        const markDone = () => {
            steps[stepIdx].status = 'done';
            onProgress(steps);
            stepIdx++;
        };
        const markError = (err: unknown) => {
            steps[stepIdx].status = 'error';
            steps[stepIdx].error = err instanceof Error ? err.message : String(err);
            onProgress(steps);
            stepIdx++;
        };

        // Phase 1: Category operations (each gets its own step)
        if (data.category_operations) {
            for (const op of data.category_operations) {
                markRunning();
                try {
                    if (op.action === 'create' && op.name) {
                        await adminApi.bulkCreateArtifactCategories([op.name]);
                    } else if (op.action === 'rename' && op.id && op.new_name) {
                        await adminApi.renameArtifactCategory(op.id, op.new_name);
                    } else if (op.action === 'delete' && op.id) {
                        await adminApi.deleteArtifactCategory(op.id);
                    }
                    markDone();
                } catch (err) {
                    markError(err);
                }
            }
            // Refresh categories so artifact changes can use them
            await loadCategories();
        }

        // Phase 2: Artifact changes (each gets its own step)
        for (const change of data.changes) {
            markRunning();
            try {
                if (change.action === 'create') {
                    await adminApi.createArtifact({
                        title: change.title || 'Untitled',
                        artifact_type: change.artifact_type || 'feature',
                        category: change.category,
                        description: change.description,
                        priority: change.priority,
                        area: change.area,
                        status: change.status || 'new',
                    });
                } else if (change.action === 'update' && change.id) {
                    const updates: Record<string, unknown> = {};
                    if (change.title !== undefined) updates.title = change.title;
                    if (change.status !== undefined) updates.status = change.status;
                    if (change.priority !== undefined) updates.priority = change.priority;
                    if (change.area !== undefined) updates.area = change.area;
                    if (change.category !== undefined) updates.category = change.category;
                    if (change.artifact_type !== undefined) updates.artifact_type = change.artifact_type;
                    if (change.description !== undefined) updates.description = change.description;
                    await adminApi.updateArtifact(change.id, updates);
                } else if (change.action === 'delete' && change.id) {
                    await adminApi.deleteArtifact(change.id);
                }
                markDone();
            } catch (err) {
                markError(err);
            }
        }

        // Final step: refresh
        markRunning();
        try {
            await loadArtifacts();
            await loadCategories();
            markDone();
        } catch (err) {
            markError(err);
        }
    }, []);

    const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
        artifact_changes: {
            render: (payload, callbacks) => (
                <ArtifactChangesCard
                    proposal={payload}
                    existingArtifacts={artifacts}
                    categories={categories.map(c => ({ id: c.id, name: c.name }))}
                    onAccept={async (data, steps, onProgress) => {
                        await handleApplyArtifactChanges(data, steps, onProgress);
                        callbacks.onAccept?.(data);
                    }}
                    onReject={callbacks.onReject}
                />
            ),
            renderOptions: {
                panelWidth: '700px',
                headerTitle: 'Proposed Changes',
                headerIcon: '\uD83D\uDCCB',
            }
        }
    }), [handleApplyArtifactChanges, artifacts, categories]);

    if (isLoading && artifacts.length === 0) {
        return (
            <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
            </div>
        );
    }

    const COL_COUNT = 8;
    const hasSelection = selected.size > 0;

    return (
        <div className="h-full flex">
            {/* Chat Tray */}
            <ChatTray
                initialContext={chatContext}
                payloadHandlers={payloadHandlers}
                isOpen={isChatOpen}
                onOpenChange={setIsChatOpen}
            />

            {/* Main Content */}
            <div className="flex-1 min-w-0 overflow-y-auto px-4 py-2 relative">
                {/* Floating chat toggle button */}
                {!isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-6 left-6 z-40 p-4 bg-blue-600 text-white rounded-full shadow-lg hover:bg-blue-700 transition-all hover:scale-110"
                        title="Open chat"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}

                <div className="space-y-4">
                {/* Header row: title + action buttons */}
                <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Artifacts ({sortedArtifacts.length}{sortedArtifacts.length !== artifacts.length ? ` / ${artifacts.length}` : ''})
                    </h2>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setShowCategoryManager(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            title="Manage Categories"
                        >
                            <Cog6ToothIcon className="h-4 w-4" />
                            Categories
                        </button>
                        <button
                            onClick={() => setShowCreateDialog(true)}
                            className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                        >
                            <PlusIcon className="h-5 w-5" />
                            Create Artifact
                        </button>
                    </div>
                </div>

                {/* Filter Row 1: View + Status + Type (flush right) */}
                <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-1.5">
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mr-1">View:</span>
                        {([
                            { value: 'active' as const, label: 'Active' },
                            { value: 'new' as const, label: 'New' },
                            { value: 'icebox' as const, label: 'Icebox' },
                            { value: 'all' as const, label: 'All' },
                        ]).map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => {
                                    setIceboxView(opt.value);
                                    setFilterStatus('');
                                }}
                                className={`px-2 py-0.5 text-xs rounded-full transition-colors ${
                                    iceboxView === opt.value
                                        ? opt.value === 'icebox'
                                            ? 'bg-gray-500 text-white'
                                            : opt.value === 'new'
                                                ? 'bg-purple-600 text-white'
                                                : 'bg-purple-600 text-white'
                                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-gray-600'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                    {/* Status pills - only shown for Active and All views */}
                    {(iceboxView === 'active' || iceboxView === 'all') && (
                        <>
                            <div className="h-5 w-px bg-gray-300 dark:bg-gray-600" />
                            <FilterPills
                                label="Status"
                                value={filterStatus}
                                options={(iceboxView === 'active' ? ACTIVE_STATUS_OPTIONS : ALL_STATUS_OPTIONS).map(o => ({
                                    value: o.value,
                                    label: o.label,
                                    color: o.value === 'new' ? 'bg-purple-600 text-white'
                                        : o.value === 'open' ? 'bg-yellow-500 text-white'
                                        : o.value === 'in_progress' ? 'bg-blue-600 text-white'
                                        : o.value === 'icebox' ? 'bg-gray-500 text-white'
                                        : 'bg-green-600 text-white',
                                }))}
                                onChange={setFilterStatus}
                            />
                        </>
                    )}
                    <div className="ml-auto">
                        <FilterPills
                            label="Type"
                            value={filterType}
                            options={[
                                { value: 'bug', label: 'Bug', color: 'bg-red-600 text-white' },
                                { value: 'feature', label: 'Feature', color: 'bg-blue-600 text-white' },
                                { value: 'task', label: 'Task', color: 'bg-violet-600 text-white' },
                            ]}
                            onChange={setFilterType}
                        />
                    </div>
                </div>

                {/* Filter Row 2: Area + Category */}
                <div className="flex flex-wrap items-center gap-4 px-4 py-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                    <FilterPills
                        label="Area"
                        value={filterArea}
                        options={AREA_OPTIONS.map(o => ({
                            value: o.value,
                            label: o.label,
                            color: 'bg-amber-600 text-white',
                        }))}
                        onChange={setFilterArea}
                    />
                    {categories.length > 0 && (
                        <>
                            <div className="h-5 w-px bg-gray-300 dark:bg-gray-600" />
                            <FilterPills
                                label="Category"
                                value={filterCategory}
                                options={categories.map(cat => ({
                                    value: cat.name,
                                    label: cat.name,
                                    color: 'bg-purple-600 text-white',
                                }))}
                                onChange={setFilterCategory}
                            />
                        </>
                    )}
                </div>

                {error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg">
                        {error}
                    </div>
                )}

                {/* Bulk Actions Bar */}
                {hasSelection && (
                    <div className="flex items-center gap-3 px-4 py-3 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                        <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
                            {selected.size} selected
                        </span>
                        <div className="h-4 w-px bg-purple-300 dark:bg-purple-700" />

                        {/* Bulk Status */}
                        <select
                            defaultValue=""
                            onChange={(e) => { if (e.target.value) handleBulkStatus(e.target.value); e.target.value = ''; }}
                            className="px-2 py-1 text-sm border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="" disabled>Set Status...</option>
                            {STATUS_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>

                        {/* Bulk Priority */}
                        <select
                            defaultValue=""
                            onChange={(e) => { if (e.target.value) handleBulkPriority(e.target.value); e.target.value = ''; }}
                            className="px-2 py-1 text-sm border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="" disabled>Set Priority...</option>
                            <option value=" ">Clear Priority</option>
                            {PRIORITY_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>

                        {/* Bulk Area */}
                        <select
                            defaultValue=""
                            onChange={(e) => { if (e.target.value !== '') handleBulkArea(e.target.value); e.target.value = ''; }}
                            className="px-2 py-1 text-sm border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="" disabled>Set Area...</option>
                            <option value=" ">Clear Area</option>
                            {AREA_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>

                        {/* Bulk Category */}
                        <select
                            defaultValue=""
                            onChange={(e) => { if (e.target.value !== '') handleBulkCategory(e.target.value); e.target.value = ''; }}
                            className="px-2 py-1 text-sm border border-purple-300 dark:border-purple-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        >
                            <option value="" disabled>Set Category...</option>
                            <option value=" ">Clear Category</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.name}>{cat.name}</option>
                            ))}
                        </select>

                        <div className="h-4 w-px bg-purple-300 dark:bg-purple-700" />

                        {/* Bulk Delete */}
                        <button
                            onClick={handleBulkDelete}
                            className="inline-flex items-center gap-1 px-2 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                        >
                            <TrashIcon className="h-4 w-4" />
                            Delete
                        </button>

                        <button
                            onClick={() => setSelected(new Set())}
                            className="ml-auto text-sm text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-200"
                        >
                            Clear selection
                        </button>
                    </div>
                )}

                {/* Artifacts Table */}
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-900">
                            <tr>
                                <th className="px-3 py-3 w-10">
                                    <input
                                        type="checkbox"
                                        checked={sortedArtifacts.length > 0 && selected.size === sortedArtifacts.length}
                                        onChange={toggleSelectAll}
                                        className="rounded text-purple-600 focus:ring-purple-500"
                                    />
                                </th>
                                <th className="px-4 py-3 text-left w-24">
                                    <SortHeader label="Type" field="artifact_type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                </th>
                                <th className="px-4 py-3 text-left w-24">
                                    <SortHeader label="Priority" field="priority" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                </th>
                                <th className="px-4 py-3 text-left">
                                    <SortHeader label="Title" field="title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                </th>
                                <th className="px-4 py-3 text-left w-32">
                                    <SortHeader label="Status" field="status" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                </th>
                                <th className="px-4 py-3 text-left w-32">
                                    <SortHeader label="Area" field="area" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                </th>
                                <th className="px-4 py-3 text-left w-36">
                                    <SortHeader label="Category" field="category" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
                                </th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-20">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {sortedArtifacts.map((artifact) => {
                                const isEditing = editing?.id === artifact.id;
                                const isSelected = selected.has(artifact.id);

                                if (isEditing) {
                                    return (
                                        <tr key={artifact.id}>
                                            <td colSpan={COL_COUNT} className="px-0 py-0">
                                                <div
                                                    className="bg-purple-50 dark:bg-purple-900/20 border-l-4 border-purple-500 px-6 py-4"
                                                    onKeyDown={handleKeyDown}
                                                >
                                                    {/* Title */}
                                                    <div className="mb-3">
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Title</label>
                                                        <input
                                                            ref={titleInputRef}
                                                            type="text"
                                                            value={editing.title}
                                                            onChange={(e) => setEditing({ ...editing, title: e.target.value })}
                                                            onKeyDown={handleTextKeyDown}
                                                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                                        />
                                                    </div>

                                                    {/* Description */}
                                                    <div className="mb-4">
                                                        <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Description</label>
                                                        <textarea
                                                            value={editing.description}
                                                            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                                                            onKeyDown={handleKeyDown}
                                                            placeholder="Description..."
                                                            rows={3}
                                                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                                                        />
                                                    </div>

                                                    {/* Type, Status, Priority, Area, Category */}
                                                    <div className="flex flex-wrap gap-6 mb-4">
                                                        <RadioGroup
                                                            label="Type"
                                                            value={editing.artifact_type}
                                                            options={[
                                                                { value: 'bug', label: 'Bug', color: TYPE_BADGES.bug },
                                                                { value: 'feature', label: 'Feature', color: TYPE_BADGES.feature },
                                                                { value: 'task', label: 'Task', color: TYPE_BADGES.task },
                                                            ]}
                                                            onChange={(v) => setEditing({ ...editing, artifact_type: v as 'bug' | 'feature' | 'task' })}
                                                        />
                                                        <StatusRadioGroup
                                                            value={editing.status}
                                                            onChange={(v) => setEditing({ ...editing, status: v })}
                                                        />
                                                        <NullableRadioGroup
                                                            label="Priority" name="edit-priority"
                                                            value={editing.priority}
                                                            options={PRIORITY_OPTIONS.map(o => ({ ...o, color: PRIORITY_BADGES[o.value] }))}
                                                            onChange={(v) => setEditing({ ...editing, priority: v })}
                                                        />
                                                        <NullableRadioGroup
                                                            label="Area" name="edit-area"
                                                            value={editing.area}
                                                            options={AREA_OPTIONS.map(o => ({ ...o, color: AREA_BADGES[o.value] }))}
                                                            onChange={(v) => setEditing({ ...editing, area: v })}
                                                            columns={2}
                                                        />
                                                        <NullableRadioGroup
                                                            label="Category" name="edit-category"
                                                            value={editing.category}
                                                            options={categories.map(cat => ({ value: cat.name, label: cat.name, color: getCategoryColor(cat.name, categories) }))}
                                                            onChange={(v) => setEditing({ ...editing, category: v })}
                                                        />
                                                    </div>

                                                    {/* Created / Updated metadata */}
                                                    <div className="flex items-center gap-6 mb-4 text-xs text-gray-500 dark:text-gray-400">
                                                        <div>
                                                            <span className="font-medium uppercase tracking-wider">Created</span>{' '}
                                                            {artifact.created_by_name && <span>by {artifact.created_by_name}</span>}
                                                            {' '}<span>{new Date(artifact.created_at).toLocaleString()}</span>
                                                        </div>
                                                        {artifact.updated_at && artifact.updated_at !== artifact.created_at && (
                                                            <div>
                                                                <span className="font-medium uppercase tracking-wider">Updated</span>{' '}
                                                                {artifact.updated_by_name && <span>by {artifact.updated_by_name}</span>}
                                                                {' '}<span>{new Date(artifact.updated_at).toLocaleString()}</span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Actions */}
                                                    <div className="flex items-center justify-between pt-2 border-t border-purple-200 dark:border-purple-800">
                                                        <span className="text-xs text-gray-400 dark:text-gray-500">
                                                            Enter to save &middot; Esc to cancel
                                                        </span>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={cancelEdit}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
                                                            >
                                                                <XMarkIcon className="h-4 w-4" />
                                                                Cancel
                                                            </button>
                                                            <button
                                                                onClick={() => saveEdit()}
                                                                disabled={isSaving || !editing.title.trim()}
                                                                className="inline-flex items-center gap-1 px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                                                            >
                                                                <CheckIcon className="h-4 w-4" />
                                                                {isSaving ? 'Saving...' : 'Save'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }

                                return (
                                    <tr
                                        key={artifact.id}
                                        onClick={() => handleRowClick(artifact)}
                                        className={`cursor-pointer transition-colors ${
                                            isSelected
                                                ? 'bg-purple-50/50 dark:bg-purple-900/10'
                                                : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'
                                        }`}
                                    >
                                        <td className="px-3 py-3 w-10" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="checkbox"
                                                checked={isSelected}
                                                onChange={(e) => toggleSelect(artifact.id, e)}
                                                className="rounded text-purple-600 focus:ring-purple-500"
                                            />
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${TYPE_BADGES[artifact.artifact_type] || ''}`}>
                                                {artifact.artifact_type}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {artifact.priority ? (
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${PRIORITY_BADGES[artifact.priority] || ''}`}>
                                                    {PRIORITY_LABELS[artifact.priority] || artifact.priority}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-gray-900 dark:text-white">
                                                {artifact.title}
                                            </div>
                                            {artifact.description && (
                                                <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-md">
                                                    {artifact.description}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_BADGES[artifact.status] || ''}`}>
                                                {STATUS_LABELS[artifact.status] || artifact.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {artifact.area ? (
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${AREA_BADGES[artifact.area] || ''}`}>
                                                    {AREA_LABELS[artifact.area] || artifact.area}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            {artifact.category ? (
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getCategoryColor(artifact.category, categories)}`}>
                                                    {artifact.category}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400 dark:text-gray-500 text-xs">-</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-right text-sm" onClick={(e) => e.stopPropagation()}>
                                            <button
                                                onClick={(e) => handleDelete(e, artifact.id)}
                                                className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                                title="Delete"
                                            >
                                                <TrashIcon className="h-5 w-5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                            {sortedArtifacts.length === 0 && (
                                <tr>
                                    <td colSpan={COL_COUNT} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                                        No artifacts found
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            </div>

            {/* Create Dialog */}
            {showCreateDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-4xl">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Create Artifact
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Title</label>
                                <input
                                    type="text"
                                    value={newTitle}
                                    onChange={(e) => setNewTitle(e.target.value)}
                                    placeholder="Title"
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                                    autoFocus
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">Description</label>
                                <textarea
                                    value={newDescription}
                                    onChange={(e) => setNewDescription(e.target.value)}
                                    placeholder="Description (optional)"
                                    rows={3}
                                    className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-y"
                                />
                            </div>
                            <div className="flex flex-wrap gap-6">
                                <RadioGroup
                                    label="Type"
                                    value={newType}
                                    options={[
                                        { value: 'bug', label: 'Bug', color: TYPE_BADGES.bug },
                                        { value: 'feature', label: 'Feature', color: TYPE_BADGES.feature },
                                        { value: 'task', label: 'Task', color: TYPE_BADGES.task },
                                    ]}
                                    onChange={(v) => setNewType(v as 'bug' | 'feature' | 'task')}
                                />
                                <StatusRadioGroup
                                    value={newStatus}
                                    onChange={(v) => setNewStatus(v)}
                                />
                                <NullableRadioGroup
                                    label="Priority" name="new-priority"
                                    value={newPriority}
                                    options={PRIORITY_OPTIONS.map(o => ({ ...o, color: PRIORITY_BADGES[o.value] }))}
                                    onChange={setNewPriority}
                                />
                                <NullableRadioGroup
                                    label="Area" name="new-area"
                                    value={newArea}
                                    options={AREA_OPTIONS.map(o => ({ ...o, color: AREA_BADGES[o.value] }))}
                                    onChange={setNewArea}
                                    columns={2}
                                />
                                <NullableRadioGroup
                                    label="Category" name="new-category"
                                    value={newCategory}
                                    options={categories.map(cat => ({ value: cat.name, label: cat.name, color: getCategoryColor(cat.name, categories) }))}
                                    onChange={setNewCategory}
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6">
                            <button
                                onClick={() => setShowCreateDialog(false)}
                                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleCreate}
                                disabled={isCreating || !newTitle.trim()}
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                {isCreating ? 'Creating...' : 'Create'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Manager Dialog */}
            {showCategoryManager && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-sm">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                            Manage Categories
                        </h3>

                        <div className="flex gap-2 mb-4">
                            <input
                                type="text"
                                value={newCategoryName}
                                onChange={(e) => setNewCategoryName(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddCategory(); }}
                                placeholder="New category name..."
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                autoFocus
                            />
                            <button
                                onClick={handleAddCategory}
                                disabled={!newCategoryName.trim()}
                                className="px-3 py-2 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                            >
                                Add
                            </button>
                        </div>

                        <div className="space-y-1 max-h-64 overflow-y-auto">
                            {categories.length === 0 && (
                                <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
                                    No categories yet
                                </p>
                            )}
                            {categories.map((cat, idx) => (
                                <div
                                    key={cat.id}
                                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50"
                                >
                                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}>
                                        {cat.name}
                                    </span>
                                    <button
                                        onClick={() => handleDeleteCategory(cat.id)}
                                        className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                                        title="Delete category"
                                    >
                                        <TrashIcon className="h-4 w-4" />
                                    </button>
                                </div>
                            ))}
                        </div>

                        <div className="flex justify-end mt-4 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <button
                                onClick={() => setShowCategoryManager(false)}
                                className="px-4 py-2 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                            >
                                Done
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
