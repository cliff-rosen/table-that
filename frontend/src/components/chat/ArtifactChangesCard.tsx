import { useState, useMemo, useCallback } from 'react';
import { CheckIcon, XMarkIcon, PlusIcon, PencilIcon, TrashIcon, TagIcon, ExclamationTriangleIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/solid';

interface CategoryOperation {
    action: 'create' | 'rename' | 'delete';
    id?: number;
    name?: string;
    old_name?: string;
    new_name?: string;
}

interface ArtifactChange {
    action: 'create' | 'update' | 'delete';
    id?: number;
    title?: string;
    title_hint?: string;
    artifact_type?: string;
    status?: string;
    priority?: string;
    area?: string;
    category?: string;
    description?: string;
}

interface ArtifactChangesProposal {
    category_operations?: CategoryOperation[];
    changes: ArtifactChange[];
    reasoning?: string;
}

interface ExistingArtifact {
    id: number;
    title: string;
    artifact_type: string;
    status: string;
    priority: string | null;
    area: string | null;
    category: string | null;
    description: string | null;
}

/** A single step in the execution progress list */
export interface ProgressStep {
    label: string;
    status: 'pending' | 'running' | 'done' | 'error';
    error?: string;
}

/**
 * The executor callback. The card calls this with the selected changes.
 * It should process items one at a time and call `onProgress` after each step.
 * The steps array is pre-built by the card; the executor updates statuses.
 */
export type AcceptExecutor = (
    data: { category_operations?: CategoryOperation[]; changes: ArtifactChange[] },
    steps: ProgressStep[],
    onProgress: (steps: ProgressStep[]) => void,
) => Promise<void>;

interface ArtifactChangesCardProps {
    proposal: ArtifactChangesProposal;
    existingArtifacts?: ExistingArtifact[];
    categories?: { id: number; name: string }[];
    onAccept?: AcceptExecutor;
    onReject?: () => void;
}

// ── Option arrays for selects ──

const TYPE_OPTIONS = [
    { value: 'bug', label: 'Bug' },
    { value: 'feature', label: 'Feature' },
    { value: 'task', label: 'Task' },
];

const STATUS_OPTIONS = [
    { value: 'new', label: 'New' },
    { value: 'open', label: 'Open' },
    { value: 'in_progress', label: 'In Progress' },
    { value: 'icebox', label: 'Icebox' },
    { value: 'closed', label: 'Closed' },
];

const PRIORITY_OPTIONS = [
    { value: '', label: 'None' },
    { value: 'urgent', label: 'Urgent' },
    { value: 'high', label: 'High' },
    { value: 'medium', label: 'Medium' },
    { value: 'low', label: 'Low' },
];

const AREA_OPTIONS = [
    { value: '', label: 'None' },
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

// ── Label maps ──

const TYPE_LABELS: Record<string, string> = Object.fromEntries(TYPE_OPTIONS.map(o => [o.value, o.label]));
const STATUS_LABELS: Record<string, string> = Object.fromEntries(STATUS_OPTIONS.map(o => [o.value, o.label]));
const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(PRIORITY_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]));
const AREA_LABELS: Record<string, string> = Object.fromEntries(AREA_OPTIONS.filter(o => o.value).map(o => [o.value, o.label]));

const ACTION_STYLES = {
    create: {
        border: 'border-l-green-500',
        bg: 'bg-green-50 dark:bg-green-900/10',
        icon: PlusIcon,
        iconColor: 'text-green-600 dark:text-green-400',
        label: 'Create',
        labelColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    },
    update: {
        border: 'border-l-yellow-500',
        bg: 'bg-yellow-50 dark:bg-yellow-900/10',
        icon: PencilIcon,
        iconColor: 'text-yellow-600 dark:text-yellow-400',
        label: 'Update',
        labelColor: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    },
    delete: {
        border: 'border-l-red-500',
        bg: 'bg-red-50 dark:bg-red-900/10',
        icon: TrashIcon,
        iconColor: 'text-red-600 dark:text-red-400',
        label: 'Delete',
        labelColor: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    },
};

const CAT_ACTION_STYLES = {
    create: { icon: PlusIcon, iconColor: 'text-green-600 dark:text-green-400', label: 'New' },
    rename: { icon: PencilIcon, iconColor: 'text-yellow-600 dark:text-yellow-400', label: 'Rename' },
    delete: { icon: TrashIcon, iconColor: 'text-red-600 dark:text-red-400', label: 'Remove' },
};

// ── Editable fields type ──

type EditableFields = {
    title: string;
    description: string;
    artifact_type: string;
    status: string;
    priority: string;
    area: string;
    category: string;
};

const EDITABLE_FIELD_KEYS: (keyof EditableFields)[] = ['title', 'description', 'artifact_type', 'status', 'priority', 'area', 'category'];

// ── Main component ──

export default function ArtifactChangesCard({
    proposal,
    existingArtifacts,
    categories: categoriesProp,
    onAccept,
    onReject,
}: ArtifactChangesCardProps) {
    const catOps = proposal.category_operations || [];
    const changes = proposal.changes || [];
    const artifactMap = useMemo(() => {
        const map = new Map<number, ExistingArtifact>();
        existingArtifacts?.forEach(a => map.set(a.id, a));
        return map;
    }, [existingArtifacts]);

    const categoryOptions = useMemo(() => {
        const opts = [{ value: '', label: 'None' }];
        const seen = new Set<string>();
        if (categoriesProp) {
            categoriesProp.forEach(c => { opts.push({ value: c.name, label: c.name }); seen.add(c.name); });
        }
        // Include categories being created by category_operations
        for (const op of catOps) {
            if (op.action === 'create' && op.name && !seen.has(op.name)) {
                opts.push({ value: op.name, label: `${op.name} (new)` });
                seen.add(op.name);
            }
        }
        // Include any category referenced by changes that isn't already listed
        for (const change of changes) {
            if (change.category && !seen.has(change.category)) {
                opts.push({ value: change.category, label: change.category });
                seen.add(change.category);
            }
        }
        return opts;
    }, [categoriesProp, catOps, changes]);

    const [checked, setChecked] = useState<Set<number>>(
        () => new Set(changes.map((_, i) => i))
    );
    const [catChecked, setCatChecked] = useState<Set<number>>(
        () => new Set(catOps.map((_, i) => i))
    );
    const [isRejected, setIsRejected] = useState(false);
    const [expanded, setExpanded] = useState<Set<number>>(new Set());
    const [editOverrides, setEditOverrides] = useState<Map<number, Partial<EditableFields>>>(new Map());

    // Progress state — null means not started, array means executing/done
    const [progressSteps, setProgressSteps] = useState<ProgressStep[] | null>(null);
    const isExecuting = progressSteps !== null;
    const isComplete = progressSteps !== null && progressSteps.every(s => s.status === 'done' || s.status === 'error');

    // Build dependency map: for each artifact change index, which catOp indices it depends on.
    const dependencyMap = useMemo(() => {
        const map = new Map<number, number[]>();
        if (catOps.length === 0) return map;

        changes.forEach((change, changeIdx) => {
            if (!change.category) return;
            const deps: number[] = [];
            catOps.forEach((op, opIdx) => {
                if (op.action === 'create' && op.name === change.category) {
                    deps.push(opIdx);
                } else if (op.action === 'rename' && op.new_name === change.category) {
                    deps.push(opIdx);
                }
            });
            if (deps.length > 0) {
                map.set(changeIdx, deps);
            }
        });
        return map;
    }, [changes, catOps]);

    const isBlocked = useCallback((changeIdx: number): boolean => {
        const deps = dependencyMap.get(changeIdx);
        if (!deps) return false;
        return deps.some(opIdx => !catChecked.has(opIdx));
    }, [dependencyMap, catChecked]);

    const getBlockingCategory = useCallback((changeIdx: number): string | null => {
        const deps = dependencyMap.get(changeIdx);
        if (!deps) return null;
        for (const opIdx of deps) {
            if (!catChecked.has(opIdx)) {
                const op = catOps[opIdx];
                if (op.action === 'create') return op.name || 'new category';
                if (op.action === 'rename') return op.new_name || 'renamed category';
            }
        }
        return null;
    }, [dependencyMap, catChecked, catOps]);

    const toggleCheck = (idx: number) => {
        if (isBlocked(idx)) return;
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const toggleCatCheck = (idx: number) => {
        setCatChecked(prev => {
            const next = new Set(prev);
            const wasChecked = next.has(idx);
            if (wasChecked) {
                next.delete(idx);
            } else {
                next.add(idx);
            }

            setChecked(prevChecked => {
                const nextChecked = new Set(prevChecked);
                dependencyMap.forEach((deps, changeIdx) => {
                    if (!deps.includes(idx)) return;
                    if (wasChecked) {
                        const allDepsMet = deps.every(d => d === idx ? false : next.has(d));
                        if (!allDepsMet) {
                            nextChecked.delete(changeIdx);
                        }
                    } else {
                        const allDepsMet = deps.every(d => d === idx ? true : next.has(d));
                        if (allDepsMet) {
                            nextChecked.add(changeIdx);
                        }
                    }
                });
                return nextChecked;
            });

            return next;
        });
    };

    const toggleExpanded = (idx: number) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(idx)) next.delete(idx); else next.add(idx);
            return next;
        });
    };

    const setFieldOverride = (idx: number, field: keyof EditableFields, value: string) => {
        setEditOverrides(prev => {
            const next = new Map(prev);
            const existing = next.get(idx) || {};
            next.set(idx, { ...existing, [field]: value });
            return next;
        });
    };

    /** Get the effective value for a field, considering overrides */
    const getEffectiveValue = (idx: number, field: keyof EditableFields, change: ArtifactChange, existing?: ExistingArtifact): string => {
        const override = editOverrides.get(idx)?.[field];
        if (override !== undefined) return override;
        // For creates: use proposed value or default
        if (change.action === 'create') {
            return (change as Record<string, any>)[field] || '';
        }
        // For updates: use proposed value if AI set it, otherwise use existing
        const proposed = (change as Record<string, any>)[field];
        if (proposed !== undefined) return proposed || '';
        if (existing) return (existing as Record<string, any>)[field] || '';
        return '';
    };

    /** Build human-readable step labels for each selected operation */
    const buildStepLabels = useCallback((
        selectedCatOps: CategoryOperation[],
        selectedChanges: ArtifactChange[],
    ): ProgressStep[] => {
        const steps: ProgressStep[] = [];

        // Category ops
        for (const op of selectedCatOps) {
            if (op.action === 'create') {
                steps.push({ label: `Create category "${op.name}"`, status: 'pending' });
            } else if (op.action === 'rename') {
                steps.push({ label: `Rename category "${op.old_name || '#' + op.id}" to "${op.new_name}"`, status: 'pending' });
            } else if (op.action === 'delete') {
                steps.push({ label: `Delete category "${op.name || '#' + op.id}"`, status: 'pending' });
            }
        }

        // Artifact changes
        for (const change of selectedChanges) {
            const existing = change.id ? artifactMap.get(change.id) : undefined;
            if (change.action === 'create') {
                steps.push({ label: `Create "${change.title}"`, status: 'pending' });
            } else if (change.action === 'update') {
                const name = existing?.title || change.title || `#${change.id}`;
                steps.push({ label: `Update "${name}"`, status: 'pending' });
            } else if (change.action === 'delete') {
                const name = existing?.title || change.title_hint || `#${change.id}`;
                steps.push({ label: `Delete "${name}"`, status: 'pending' });
            }
        }

        // Final refresh step
        steps.push({ label: 'Refreshing list', status: 'pending' });

        return steps;
    }, [artifactMap]);

    /** Merge edit overrides into the change before sending to executor */
    const mergeOverrides = (change: ArtifactChange, globalIdx: number): ArtifactChange => {
        const overrides = editOverrides.get(globalIdx);
        if (!overrides) return change;

        const merged = { ...change };
        const existing = change.id ? artifactMap.get(change.id) : undefined;

        for (const field of EDITABLE_FIELD_KEYS) {
            const overrideVal = overrides[field];
            if (overrideVal === undefined) continue;

            if (change.action === 'update') {
                // For updates: include the field if user changed it from existing value
                const existingVal = existing ? ((existing as Record<string, any>)[field] || '') : '';
                if (overrideVal !== existingVal || (change as Record<string, any>)[field] !== undefined) {
                    (merged as Record<string, any>)[field] = overrideVal || undefined;
                }
            } else {
                // For creates: just set the value
                (merged as Record<string, any>)[field] = overrideVal || undefined;
            }
        }

        return merged;
    };

    const handleAccept = async () => {
        const selectedChanges = changes
            .map((change, i) => ({ change, i }))
            .filter(({ i }) => checked.has(i) && !isBlocked(i))
            .map(({ change, i }) => mergeOverrides(change, i));
        const selectedCatOps = catOps.filter((_, i) => catChecked.has(i));
        if (selectedChanges.length === 0 && selectedCatOps.length === 0) return;

        const steps = buildStepLabels(selectedCatOps, selectedChanges);
        setProgressSteps(steps);

        await onAccept?.(
            {
                category_operations: selectedCatOps.length > 0 ? selectedCatOps : undefined,
                changes: selectedChanges,
            },
            steps,
            (updated) => setProgressSteps([...updated]),
        );
    };

    const handleReject = () => {
        setIsRejected(true);
        onReject?.();
    };

    // ── Progress view ──
    if (progressSteps !== null) {
        const doneCount = progressSteps.filter(s => s.status === 'done').length;
        const errorCount = progressSteps.filter(s => s.status === 'error').length;
        const total = progressSteps.length;

        return (
            <div className="space-y-3">
                {/* Progress header */}
                <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {isComplete
                            ? errorCount > 0
                                ? `Completed with ${errorCount} error${errorCount !== 1 ? 's' : ''}`
                                : 'All changes applied'
                            : 'Applying changes...'
                        }
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                        {doneCount}/{total}
                    </span>
                </div>

                {/* Progress bar */}
                <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-300 ease-out rounded-full ${errorCount > 0 ? 'bg-amber-500' : 'bg-green-500'}`}
                        style={{ width: `${((doneCount + errorCount) / total) * 100}%` }}
                    />
                </div>

                {/* Step list */}
                <div className="space-y-1 max-h-64 overflow-y-auto">
                    {progressSteps.map((step, i) => (
                        <div
                            key={i}
                            className={`flex items-center gap-2.5 px-3 py-1.5 rounded text-sm transition-opacity ${
                                step.status === 'pending' ? 'opacity-40' : ''
                            }`}
                        >
                            <StepIcon status={step.status} />
                            <span className={`flex-1 min-w-0 truncate ${
                                step.status === 'done' ? 'text-gray-500 dark:text-gray-400' :
                                step.status === 'running' ? 'text-gray-900 dark:text-gray-100 font-medium' :
                                step.status === 'error' ? 'text-red-600 dark:text-red-400' :
                                'text-gray-400 dark:text-gray-500'
                            }`}>
                                {step.label}
                            </span>
                            {step.error && (
                                <span className="text-xs text-red-500 dark:text-red-400 truncate max-w-[200px]" title={step.error}>
                                    {step.error}
                                </span>
                            )}
                        </div>
                    ))}
                </div>

                {/* Done summary */}
                {isComplete && (
                    <div className={`mt-2 p-3 rounded-lg ${
                        errorCount > 0
                            ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800'
                            : 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                    }`}>
                        <div className={`flex items-center gap-2 text-sm font-medium ${
                            errorCount > 0
                                ? 'text-amber-800 dark:text-amber-200'
                                : 'text-green-800 dark:text-green-200'
                        }`}>
                            <CheckIcon className="h-4 w-4" />
                            <span>
                                {doneCount} change{doneCount !== 1 ? 's' : ''} applied
                                {errorCount > 0 && `, ${errorCount} failed`}
                            </span>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    if (isRejected) {
        return (
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-center gap-2 text-gray-600 dark:text-gray-400">
                    <XMarkIcon className="h-5 w-5" />
                    <span className="font-medium">Changes dismissed</span>
                </div>
            </div>
        );
    }

    // ── Group changes by action ──
    const deletes: { change: ArtifactChange; globalIdx: number }[] = [];
    const creates: { change: ArtifactChange; globalIdx: number }[] = [];
    const updates: { change: ArtifactChange; globalIdx: number }[] = [];
    changes.forEach((change, i) => {
        const item = { change, globalIdx: i };
        if (change.action === 'delete') deletes.push(item);
        else if (change.action === 'create') creates.push(item);
        else if (change.action === 'update') updates.push(item);
    });

    // Count only non-blocked checked items
    const effectiveChecked = changes.filter((_, i) => checked.has(i) && !isBlocked(i)).length;
    const totalSelected = effectiveChecked + catChecked.size;
    const totalItems = changes.length + catOps.length;

    return (
        <div>
            {/* Reasoning */}
            {proposal.reasoning && (
                <div className="mb-4 pb-3 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                        Reasoning
                    </p>
                    <p className="text-sm text-gray-900 dark:text-gray-100 italic">
                        {proposal.reasoning}
                    </p>
                </div>
            )}

            {/* Summary */}
            <div className="mb-4 flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                <span>{totalItems} proposed change{totalItems !== 1 ? 's' : ''}</span>
                <span className="text-gray-300 dark:text-gray-600">|</span>
                <span>{totalSelected} selected</span>
            </div>

            {/* Category operations */}
            {catOps.length > 0 && (
                <div className="mb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <TagIcon className="h-4 w-4 text-purple-500" />
                        <span className="inline-flex px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Categories ({catOps.length})
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500 italic">applied first</span>
                    </div>
                    <div className="space-y-1.5">
                        {catOps.map((op, idx) => {
                            const isChecked = catChecked.has(idx);
                            const style = CAT_ACTION_STYLES[op.action];
                            const Icon = style.icon;

                            return (
                                <label
                                    key={idx}
                                    className={`flex items-center gap-3 p-2.5 rounded-lg border-l-4 border-l-purple-400 bg-purple-50 dark:bg-purple-900/10 cursor-pointer transition-opacity ${!isChecked ? 'opacity-50' : ''}`}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleCatCheck(idx)}
                                        className="rounded text-purple-600 focus:ring-purple-500"
                                    />
                                    <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${style.iconColor}`} />
                                    <span className="text-sm text-gray-900 dark:text-gray-100">
                                        <CategoryOpDetail op={op} />
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Three-section layout: Delete → Create → Update */}
            <div className="space-y-4 mb-6">
                {/* ── Deletes ── */}
                {deletes.length > 0 && (
                    <Section action="delete" count={deletes.length}>
                        <div className="space-y-1.5">
                            {deletes.map(({ change, globalIdx }) => {
                                const blocked = isBlocked(globalIdx);
                                const isChecked = checked.has(globalIdx) && !blocked;
                                const blockingCat = blocked ? getBlockingCategory(globalIdx) : null;
                                const existing = change.id ? artifactMap.get(change.id) : undefined;

                                return (
                                    <DeleteItem
                                        key={globalIdx}
                                        change={change}
                                        existing={existing}
                                        isChecked={isChecked}
                                        blocked={blocked}
                                        blockingCat={blockingCat}
                                        onToggle={() => toggleCheck(globalIdx)}
                                    />
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* ── Creates ── */}
                {creates.length > 0 && (
                    <Section action="create" count={creates.length}>
                        <div className="space-y-1.5">
                            {creates.map(({ change, globalIdx }) => {
                                const blocked = isBlocked(globalIdx);
                                const isChecked = checked.has(globalIdx) && !blocked;
                                const blockingCat = blocked ? getBlockingCategory(globalIdx) : null;
                                const isExpanded = expanded.has(globalIdx);

                                return (
                                    <EditableArtifactCard
                                        key={globalIdx}
                                        mode="create"
                                        change={change}
                                        isChecked={isChecked}
                                        blocked={blocked}
                                        blockingCat={blockingCat}
                                        isExpanded={isExpanded}
                                        categoryOptions={categoryOptions}
                                        onToggleCheck={() => toggleCheck(globalIdx)}
                                        onToggleExpand={() => toggleExpanded(globalIdx)}
                                        getFieldValue={(field) => getEffectiveValue(globalIdx, field, change)}
                                        onFieldChange={(field, value) => setFieldOverride(globalIdx, field, value)}
                                    />
                                );
                            })}
                        </div>
                    </Section>
                )}

                {/* ── Updates ── */}
                {updates.length > 0 && (
                    <Section action="update" count={updates.length}>
                        <div className="space-y-1.5">
                            {updates.map(({ change, globalIdx }) => {
                                const blocked = isBlocked(globalIdx);
                                const isChecked = checked.has(globalIdx) && !blocked;
                                const blockingCat = blocked ? getBlockingCategory(globalIdx) : null;
                                const isExpanded = expanded.has(globalIdx);
                                const existing = change.id ? artifactMap.get(change.id) : undefined;

                                return (
                                    <EditableArtifactCard
                                        key={globalIdx}
                                        mode="update"
                                        change={change}
                                        existing={existing}
                                        isChecked={isChecked}
                                        blocked={blocked}
                                        blockingCat={blockingCat}
                                        isExpanded={isExpanded}
                                        categoryOptions={categoryOptions}
                                        onToggleCheck={() => toggleCheck(globalIdx)}
                                        onToggleExpand={() => toggleExpanded(globalIdx)}
                                        getFieldValue={(field) => getEffectiveValue(globalIdx, field, change, existing)}
                                        onFieldChange={(field, value) => setFieldOverride(globalIdx, field, value)}
                                    />
                                );
                            })}
                        </div>
                    </Section>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    onClick={handleAccept}
                    disabled={totalSelected === 0 || isExecuting}
                    className="flex-1 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                    <CheckIcon className="h-5 w-5" />
                    Apply Selected ({totalSelected})
                </button>
                <button
                    onClick={handleReject}
                    disabled={isExecuting}
                    className="px-6 py-3 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <XMarkIcon className="h-5 w-5" />
                    Reject
                </button>
            </div>
        </div>
    );
}

// ── Step status icon for progress view ──

function StepIcon({ status }: { status: ProgressStep['status'] }) {
    if (status === 'done') {
        return <CheckIcon className="h-4 w-4 flex-shrink-0 text-green-500" />;
    }
    if (status === 'error') {
        return <XMarkIcon className="h-4 w-4 flex-shrink-0 text-red-500" />;
    }
    if (status === 'running') {
        return (
            <div className="h-4 w-4 flex-shrink-0 flex items-center justify-center">
                <div className="h-3 w-3 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }
    // pending
    return <div className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-gray-300 dark:border-gray-600" />;
}

// ── Section header ──

function Section({ action, count, children }: { action: 'create' | 'update' | 'delete'; count: number; children: React.ReactNode }) {
    const style = ACTION_STYLES[action];
    return (
        <div>
            <div className="flex items-center gap-2 mb-2">
                <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${style.labelColor}`}>
                    {style.label} ({count})
                </span>
            </div>
            {children}
        </div>
    );
}

// ── Category operation detail ──

function CategoryOpDetail({ op }: { op: CategoryOperation }) {
    if (op.action === 'create') {
        return <><span className="font-medium">{op.name}</span></>;
    }
    if (op.action === 'rename') {
        return <>
            <span className="text-gray-500 dark:text-gray-400">{op.old_name || `#${op.id}`}</span>
            {' \u2192 '}
            <span className="font-medium">{op.new_name}</span>
        </>;
    }
    // delete
    return <><span className="line-through text-gray-500 dark:text-gray-400">{op.name || `#${op.id}`}</span></>;
}

// ── Delete item (simple checklist) ──

function DeleteItem({ change, existing, isChecked, blocked, blockingCat, onToggle }: {
    change: ArtifactChange;
    existing?: ExistingArtifact;
    isChecked: boolean;
    blocked: boolean;
    blockingCat: string | null;
    onToggle: () => void;
}) {
    const style = ACTION_STYLES.delete;
    const deleteTitle = existing?.title || change.title_hint || `#${change.id}`;

    return (
        <label
            className={`flex items-center gap-3 p-3 rounded-lg border-l-4 ${style.border} ${style.bg} transition-opacity ${blocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} ${!isChecked && !blocked ? 'opacity-50' : ''}`}
        >
            <input
                type="checkbox"
                checked={isChecked}
                onChange={onToggle}
                disabled={blocked}
                className="rounded text-purple-600 focus:ring-purple-500 disabled:opacity-50"
            />
            <TrashIcon className={`h-4 w-4 flex-shrink-0 ${style.iconColor}`} />
            <div className="flex-1 min-w-0">
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{deleteTitle}</span>
                {existing && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                        <MetadataPill label={TYPE_LABELS[existing.artifact_type] || existing.artifact_type} />
                        <MetadataPill label={STATUS_LABELS[existing.status] || existing.status} />
                        {existing.category && <MetadataPill label={existing.category} />}
                    </div>
                )}
                {blocked && blockingCat && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-amber-600 dark:text-amber-400">
                        <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" />
                        <span>Requires category: {blockingCat}</span>
                    </div>
                )}
            </div>
        </label>
    );
}

// ── Metadata pill ──

function MetadataPill({ label }: { label: string }) {
    return (
        <span className="inline-flex px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400">
            {label}
        </span>
    );
}

// ── Editable artifact card (shared by creates & updates) ──

function EditableArtifactCard({ mode, change, existing, isChecked, blocked, blockingCat, isExpanded, categoryOptions, onToggleCheck, onToggleExpand, getFieldValue, onFieldChange }: {
    mode: 'create' | 'update';
    change: ArtifactChange;
    existing?: ExistingArtifact;
    isChecked: boolean;
    blocked: boolean;
    blockingCat: string | null;
    isExpanded: boolean;
    categoryOptions: { value: string; label: string }[];
    onToggleCheck: () => void;
    onToggleExpand: () => void;
    getFieldValue: (field: keyof EditableFields) => string;
    onFieldChange: (field: keyof EditableFields, value: string) => void;
}) {
    const style = ACTION_STYLES[mode];
    const title = mode === 'update'
        ? (existing?.title || change.title || `#${change.id}`)
        : (change.title || 'Untitled');

    // For collapsed updates, show diff summary
    const diffSummary = mode === 'update' ? buildDiffSummary(change, existing) : null;

    return (
        <div
            className={`rounded-lg border-l-4 ${style.border} ${style.bg} transition-opacity ${blocked ? 'opacity-40' : ''} ${!isChecked && !blocked ? 'opacity-50' : ''}`}
        >
            {/* Collapsed header */}
            <div className={`flex items-center gap-3 p-3 ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={onToggleCheck}
                    disabled={blocked}
                    onClick={e => e.stopPropagation()}
                    className="rounded text-purple-600 focus:ring-purple-500 disabled:opacity-50"
                />
                <button
                    onClick={onToggleExpand}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    disabled={blocked}
                >
                    {isExpanded
                        ? <ChevronDownIcon className={`h-4 w-4 flex-shrink-0 ${style.iconColor}`} />
                        : <ChevronRightIcon className={`h-4 w-4 flex-shrink-0 ${style.iconColor}`} />
                    }
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{title}</div>
                        {!isExpanded && (
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {mode === 'create' && (
                                    <>
                                        {change.artifact_type && <MetadataPill label={TYPE_LABELS[change.artifact_type] || change.artifact_type} />}
                                        {change.status && <MetadataPill label={STATUS_LABELS[change.status] || change.status} />}
                                        {change.priority && <MetadataPill label={PRIORITY_LABELS[change.priority] || change.priority} />}
                                        {change.area && <MetadataPill label={AREA_LABELS[change.area] || change.area} />}
                                        {change.category && <MetadataPill label={change.category} />}
                                    </>
                                )}
                                {mode === 'update' && diffSummary && diffSummary.length > 0 && (
                                    <span className="text-xs text-gray-500 dark:text-gray-400">
                                        {diffSummary.join(' · ')}
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </button>
            </div>

            {blocked && blockingCat && (
                <div className="flex items-center gap-1 px-3 pb-2 text-xs text-amber-600 dark:text-amber-400">
                    <ExclamationTriangleIcon className="h-3 w-3 flex-shrink-0" />
                    <span>Requires category: {blockingCat}</span>
                </div>
            )}

            {/* Expanded edit form */}
            {isExpanded && !blocked && (
                <div className="px-3 pb-3 pt-1 border-t border-gray-200/50 dark:border-gray-700/50">
                    <CompactEditForm
                        mode={mode}
                        change={change}
                        existing={existing}
                        categoryOptions={categoryOptions}
                        getFieldValue={getFieldValue}
                        onFieldChange={onFieldChange}
                    />
                </div>
            )}
        </div>
    );
}

// ── Compact edit form ──

function CompactEditForm({ mode, change, existing, categoryOptions, getFieldValue, onFieldChange }: {
    mode: 'create' | 'update';
    change: ArtifactChange;
    existing?: ExistingArtifact;
    categoryOptions: { value: string; label: string }[];
    getFieldValue: (field: keyof EditableFields) => string;
    onFieldChange: (field: keyof EditableFields, value: string) => void;
}) {
    const isUpdate = mode === 'update';

    return (
        <div className="space-y-2">
            {/* Title */}
            <FieldRow label="Title" field="title" isUpdate={isUpdate} change={change} existing={existing}>
                <input
                    type="text"
                    value={getFieldValue('title')}
                    onChange={e => onFieldChange('title', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
            </FieldRow>

            {/* Description */}
            <FieldRow label="Desc" field="description" isUpdate={isUpdate} change={change} existing={existing}>
                <input
                    type="text"
                    value={getFieldValue('description')}
                    onChange={e => onFieldChange('description', e.target.value)}
                    placeholder="Description..."
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
                />
            </FieldRow>

            {/* Row of selects: Type, Status, Priority */}
            <div className="grid grid-cols-3 gap-2">
                <FieldRow label="Type" field="artifact_type" isUpdate={isUpdate} change={change} existing={existing} compact>
                    <select
                        value={getFieldValue('artifact_type')}
                        onChange={e => onFieldChange('artifact_type', e.target.value)}
                        className="w-full px-1.5 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </FieldRow>
                <FieldRow label="Status" field="status" isUpdate={isUpdate} change={change} existing={existing} compact>
                    <select
                        value={getFieldValue('status')}
                        onChange={e => onFieldChange('status', e.target.value)}
                        className="w-full px-1.5 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </FieldRow>
                <FieldRow label="Priority" field="priority" isUpdate={isUpdate} change={change} existing={existing} compact>
                    <select
                        value={getFieldValue('priority')}
                        onChange={e => onFieldChange('priority', e.target.value)}
                        className="w-full px-1.5 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {PRIORITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </FieldRow>
            </div>

            {/* Row of selects: Area, Category */}
            <div className="grid grid-cols-2 gap-2">
                <FieldRow label="Area" field="area" isUpdate={isUpdate} change={change} existing={existing} compact>
                    <select
                        value={getFieldValue('area')}
                        onChange={e => onFieldChange('area', e.target.value)}
                        className="w-full px-1.5 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {AREA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </FieldRow>
                <FieldRow label="Category" field="category" isUpdate={isUpdate} change={change} existing={existing} compact>
                    <select
                        value={getFieldValue('category')}
                        onChange={e => onFieldChange('category', e.target.value)}
                        className="w-full px-1.5 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        {categoryOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </FieldRow>
            </div>
        </div>
    );
}

// ── Field row with "was: X" indicator ──

function FieldRow({ label, field, isUpdate, change, existing, compact, children }: {
    label: string;
    field: keyof EditableFields;
    isUpdate: boolean;
    change: ArtifactChange;
    existing?: ExistingArtifact;
    compact?: boolean;
    children: React.ReactNode;
}) {
    // Determine if this field was changed by AI (only for updates)
    const wasChanged = isUpdate && (change as Record<string, any>)[field] !== undefined;
    const existingVal = existing ? (existing as Record<string, any>)[field] : null;

    // Get display label for the old value
    const getDisplayLabel = (val: string | null): string => {
        if (!val) return 'none';
        const labelMaps: Record<string, Record<string, string>> = {
            artifact_type: TYPE_LABELS,
            status: STATUS_LABELS,
            priority: PRIORITY_LABELS,
            area: AREA_LABELS,
        };
        const map = labelMaps[field];
        if (map && map[val]) return map[val];
        if (field === 'description' && val.length > 30) return val.slice(0, 30) + '...';
        return val;
    };

    const wasIndicator = isUpdate && wasChanged && existingVal !== null && (
        <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
            was: {getDisplayLabel(existingVal)}
        </div>
    );

    if (compact) {
        return (
            <div>
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-0.5 block">{label}</label>
                {children}
                {wasIndicator}
            </div>
        );
    }

    return (
        <div className="flex items-start gap-2">
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 w-10 flex-shrink-0 pt-1.5">{label}</label>
            <div className="flex-1">
                {children}
                {wasIndicator}
            </div>
        </div>
    );
}

// ── Helpers ──

function buildDiffSummary(change: ArtifactChange, existing?: ExistingArtifact): string[] {
    const diffs: string[] = [];
    const fields: { key: keyof ArtifactChange; label: string; labels?: Record<string, string> }[] = [
        { key: 'title', label: 'Title' },
        { key: 'status', label: 'Status', labels: STATUS_LABELS },
        { key: 'priority', label: 'Priority', labels: PRIORITY_LABELS },
        { key: 'area', label: 'Area', labels: AREA_LABELS },
        { key: 'artifact_type', label: 'Type', labels: TYPE_LABELS },
        { key: 'category', label: 'Category' },
        { key: 'description', label: 'Desc.' },
    ];

    for (const { key, label, labels } of fields) {
        const newVal = change[key];
        if (newVal === undefined) continue;
        const oldVal = existing ? (existing as Record<string, any>)[key] : null;
        if (newVal === oldVal) continue;

        const oldDisplay = oldVal ? (labels?.[oldVal as string] || oldVal) : 'none';
        const newDisplay = newVal ? (labels?.[newVal as string] || newVal) : 'none';

        if (key === 'description') {
            diffs.push('Desc. changed');
        } else if (key === 'title') {
            diffs.push('Title changed');
        } else {
            diffs.push(`${label}: ${oldDisplay} \u2192 ${newDisplay}`);
        }
    }

    return diffs;
}
