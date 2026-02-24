import {
    BugAntIcon,
    LightBulbIcon,
    ClockIcon,
    CheckCircleIcon,
    ExclamationCircleIcon,
    SparklesIcon,
    ArchiveBoxIcon,
} from '@heroicons/react/24/outline';

// ============================================================================
// Types
// ============================================================================

export interface ArtifactData {
    id: number;
    title: string;
    description: string | null;
    type: 'bug' | 'feature';
    status: 'new' | 'open' | 'in_progress' | 'icebox' | 'closed';
    created_by: number;
    created_at: string | null;
    updated_at: string | null;
}

export interface ArtifactListData {
    total: number;
    artifacts: ArtifactData[];
}

// ============================================================================
// Helpers
// ============================================================================

function StatusBadge({ status }: { status: ArtifactData['status'] }) {
    const config = {
        new: {
            icon: SparklesIcon,
            label: 'New',
            className: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
        },
        open: {
            icon: ExclamationCircleIcon,
            label: 'Open',
            className: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
        },
        in_progress: {
            icon: ClockIcon,
            label: 'In Progress',
            className: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
        },
        icebox: {
            icon: ArchiveBoxIcon,
            label: 'Icebox',
            className: 'bg-gray-100 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300',
        },
        closed: {
            icon: CheckCircleIcon,
            label: 'Closed',
            className: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
        },
    }[status];

    const Icon = config.icon;

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${config.className}`}>
            <Icon className="h-3 w-3" />
            {config.label}
        </span>
    );
}

function TypeIcon({ type }: { type: ArtifactData['type'] }) {
    if (type === 'bug') {
        return <BugAntIcon className="h-4 w-4 text-red-500 flex-shrink-0" />;
    }
    return <LightBulbIcon className="h-4 w-4 text-amber-500 flex-shrink-0" />;
}

function formatDate(iso: string | null): string {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
        });
    } catch {
        return iso;
    }
}

// ============================================================================
// Components
// ============================================================================

interface ArtifactListCardProps {
    data: ArtifactListData;
}

export default function ArtifactListCard({ data }: ArtifactListCardProps) {
    const { artifacts, total } = data;

    const newCount = artifacts.filter(a => a.status === 'new').length;
    const openCount = artifacts.filter(a => a.status === 'open').length;
    const inProgressCount = artifacts.filter(a => a.status === 'in_progress').length;
    const iceboxCount = artifacts.filter(a => a.status === 'icebox').length;
    const closedCount = artifacts.filter(a => a.status === 'closed').length;

    return (
        <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between">
                <span className="font-medium text-gray-900 dark:text-white">
                    {total} {total === 1 ? 'Artifact' : 'Artifacts'}
                </span>
                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    {newCount > 0 && <span className="text-purple-600 dark:text-purple-400">{newCount} new</span>}
                    {openCount > 0 && <span className="text-red-600 dark:text-red-400">{openCount} open</span>}
                    {inProgressCount > 0 && <span className="text-yellow-600 dark:text-yellow-400">{inProgressCount} in progress</span>}
                    {iceboxCount > 0 && <span className="text-gray-500 dark:text-gray-400">{iceboxCount} icebox</span>}
                    {closedCount > 0 && <span className="text-green-600 dark:text-green-400">{closedCount} closed</span>}
                </div>
            </div>

            {/* Artifact list */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-lg divide-y divide-gray-200 dark:divide-gray-700">
                {artifacts.map((artifact) => (
                    <div
                        key={artifact.id}
                        className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    >
                        <div className="flex items-start gap-3">
                            <TypeIcon type={artifact.type} />
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                                        #{artifact.id}
                                    </span>
                                    <span className="text-sm font-medium text-gray-900 dark:text-white">
                                        {artifact.title}
                                    </span>
                                    <StatusBadge status={artifact.status} />
                                </div>
                                {artifact.description && (
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-2">
                                        {artifact.description}
                                    </p>
                                )}
                                {artifact.created_at && (
                                    <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                                        Created {formatDate(artifact.created_at)}
                                        {artifact.updated_at && artifact.updated_at !== artifact.created_at && (
                                            <> &middot; Updated {formatDate(artifact.updated_at)}</>
                                        )}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}


// ============================================================================
// Single artifact detail card
// ============================================================================

interface ArtifactDetailCardProps {
    data: ArtifactData;
}

export function ArtifactDetailCard({ data }: ArtifactDetailCardProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-start gap-3">
                <TypeIcon type={data.type} />
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono">
                            #{data.id}
                        </span>
                        <span className="text-base font-medium text-gray-900 dark:text-white">
                            {data.title}
                        </span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                        <StatusBadge status={data.status} />
                        <span className="text-xs text-gray-400 dark:text-gray-500 capitalize">
                            {data.type}
                        </span>
                    </div>
                </div>
            </div>

            {data.description && (
                <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {data.description}
                    </p>
                </div>
            )}

            <div className="text-xs text-gray-400 dark:text-gray-500 space-y-1">
                {data.created_at && <p>Created: {formatDate(data.created_at)}</p>}
                {data.updated_at && data.updated_at !== data.created_at && (
                    <p>Updated: {formatDate(data.updated_at)}</p>
                )}
            </div>
        </div>
    );
}
