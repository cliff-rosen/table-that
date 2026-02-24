import { useState, useEffect, useCallback } from 'react';
import {
    XMarkIcon,
    ArrowTopRightOnSquareIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    BeakerIcon,
    UserGroupIcon,
    MapPinIcon,
    ClipboardDocumentListIcon,
    CalendarIcon,
    BuildingOfficeIcon,
    DocumentTextIcon
} from '@heroicons/react/24/outline';
import { CanonicalClinicalTrial } from '../../types/canonical_types';
import { trackEvent } from '../../lib/api/trackingApi';

interface TrialViewerModalProps {
    trials: CanonicalClinicalTrial[];
    initialIndex?: number;
    onClose: () => void;
}

export default function TrialViewerModal({
    trials,
    initialIndex = 0,
    onClose
}: TrialViewerModalProps) {
    const [currentIndex, setCurrentIndex] = useState(initialIndex);
    const trial = trials[currentIndex];

    const hasPrevious = currentIndex > 0;
    const hasNext = currentIndex < trials.length - 1;

    const handlePrevious = useCallback(() => {
        if (currentIndex > 0) {
            trackEvent('trial_navigate', { direction: 'prev', nct_id: trials[currentIndex - 1].nct_id });
            setCurrentIndex(currentIndex - 1);
        }
    }, [currentIndex, trials]);

    const handleNext = useCallback(() => {
        if (currentIndex < trials.length - 1) {
            trackEvent('trial_navigate', { direction: 'next', nct_id: trials[currentIndex + 1].nct_id });
            setCurrentIndex(currentIndex + 1);
        }
    }, [currentIndex, trials]);

    // Handle escape key
    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };
        window.addEventListener('keydown', handleEscape);
        return () => window.removeEventListener('keydown', handleEscape);
    }, [onClose]);

    // Handle arrow keys for navigation
    useEffect(() => {
        const handleArrowKeys = (e: KeyboardEvent) => {
            if (e.key === 'ArrowLeft' && hasPrevious) {
                handlePrevious();
            } else if (e.key === 'ArrowRight' && hasNext) {
                handleNext();
            }
        };
        window.addEventListener('keydown', handleArrowKeys);
        return () => window.removeEventListener('keydown', handleArrowKeys);
    }, [hasPrevious, hasNext, handlePrevious, handleNext]);

    if (!trial) return null;

    const formatStatus = (status: string) => {
        return status.split('_').map(word =>
            word.charAt(0) + word.slice(1).toLowerCase()
        ).join(' ');
    };

    const formatPhase = (phase?: string) => {
        if (!phase) return 'N/A';
        return phase.replace('PHASE', 'Phase ').replace('EARLY_', 'Early ').replace('NA', 'N/A');
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'RECRUITING':
                return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
            case 'COMPLETED':
                return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
            case 'ACTIVE_NOT_RECRUITING':
                return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
            case 'TERMINATED':
            case 'WITHDRAWN':
            case 'SUSPENDED':
                return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
            default:
                return 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300';
        }
    };

    const truncateTitle = (title: string, maxLength: number = 60) => {
        if (title.length <= maxLength) return title;
        return title.substring(0, maxLength).trim() + '...';
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />

            {/* Modal */}
            <div
                className="relative w-[95vw] h-[90vh] bg-white dark:bg-gray-800 rounded-lg shadow-2xl flex flex-col overflow-hidden"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
                    <div className="flex items-center gap-4">
                        {/* Navigation arrows */}
                        {trials.length > 1 && (
                            <div className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={handlePrevious}
                                    disabled={!hasPrevious}
                                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Previous trial (Left arrow)"
                                >
                                    <ChevronLeftIcon className="h-5 w-5" />
                                </button>
                                <span className="text-sm text-gray-500 min-w-[60px] text-center">
                                    {currentIndex + 1} / {trials.length}
                                </span>
                                <button
                                    type="button"
                                    onClick={handleNext}
                                    disabled={!hasNext}
                                    className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Next trial (Right arrow)"
                                >
                                    <ChevronRightIcon className="h-5 w-5" />
                                </button>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <BeakerIcon className="h-5 w-5 text-purple-500" />
                            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Trial Details
                            </h2>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-2 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700"
                        title="Close (Escape)"
                    >
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {/* Main content */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Left sidebar - Trial list (only if multiple trials) */}
                    {trials.length > 1 && (
                        <div className="w-72 flex-shrink-0 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-y-auto">
                                <div className="p-2">
                                    <h3 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide px-2 py-1">
                                        Trials ({trials.length})
                                    </h3>
                                    <div className="space-y-1">
                                        {trials.map((t, idx) => (
                                            <button
                                                type="button"
                                                key={t.nct_id}
                                                onClick={() => setCurrentIndex(idx)}
                                                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                                                    idx === currentIndex
                                                        ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-900 dark:text-purple-100'
                                                        : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                                }`}
                                            >
                                                <div className="font-mono text-xs text-purple-600 dark:text-purple-400">
                                                    {t.nct_id}
                                                </div>
                                                <div className="font-medium leading-tight line-clamp-2 mt-0.5">
                                                    {truncateTitle(t.brief_title || t.title)}
                                                </div>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${getStatusColor(t.status)}`}>
                                                        {formatStatus(t.status)}
                                                    </span>
                                                    <span className="text-xs text-gray-500">
                                                        {formatPhase(t.phase)}
                                                    </span>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Main panel */}
                    <div className="flex-1 overflow-y-auto bg-white dark:bg-gray-800">
                        <div className="max-w-4xl mx-auto p-6 space-y-6">
                            {/* Title Section */}
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <a
                                        href={trial.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-purple-600 dark:text-purple-400 hover:underline font-mono text-sm flex items-center gap-1"
                                    >
                                        {trial.nct_id}
                                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                                    </a>
                                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(trial.status)}`}>
                                        {formatStatus(trial.status)}
                                    </span>
                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                        {formatPhase(trial.phase)}
                                    </span>
                                </div>
                                <h1 className="text-2xl font-bold text-gray-900 dark:text-white leading-tight">
                                    {trial.title || trial.brief_title}
                                </h1>
                                {trial.brief_title && trial.title !== trial.brief_title && (
                                    <p className="mt-1 text-gray-600 dark:text-gray-400">
                                        {trial.brief_title}
                                    </p>
                                )}
                            </div>

                            {/* Key Info Grid */}
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Study Type</div>
                                    <div className="font-medium text-gray-900 dark:text-white capitalize">
                                        {trial.study_type?.toLowerCase() || 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Enrollment</div>
                                    <div className="font-medium text-gray-900 dark:text-white">
                                        {trial.enrollment_count?.toLocaleString() || 'N/A'}
                                        {trial.enrollment_type && (
                                            <span className="text-gray-500 text-sm ml-1">({trial.enrollment_type.toLowerCase()})</span>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Start Date</div>
                                    <div className="font-medium text-gray-900 dark:text-white">
                                        {trial.start_date || 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 uppercase font-medium">Completion Date</div>
                                    <div className="font-medium text-gray-900 dark:text-white">
                                        {trial.completion_date || 'N/A'}
                                    </div>
                                </div>
                            </div>

                            {/* Sponsor Section */}
                            {trial.lead_sponsor && (
                                <Section icon={BuildingOfficeIcon} title="Sponsor">
                                    <div className="space-y-2">
                                        <div>
                                            <span className="font-medium text-gray-900 dark:text-white">{trial.lead_sponsor.name}</span>
                                            {trial.lead_sponsor.type && (
                                                <span className="ml-2 text-sm text-gray-500">({trial.lead_sponsor.type})</span>
                                            )}
                                        </div>
                                        {trial.collaborators && trial.collaborators.length > 0 && (
                                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                                <span className="font-medium">Collaborators:</span>{' '}
                                                {trial.collaborators.map(c => c.name).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                </Section>
                            )}

                            {/* Conditions */}
                            {trial.conditions.length > 0 && (
                                <Section icon={ClipboardDocumentListIcon} title="Conditions">
                                    <div className="flex flex-wrap gap-2">
                                        {trial.conditions.map((condition, i) => (
                                            <span
                                                key={i}
                                                className="px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded text-sm"
                                            >
                                                {condition}
                                            </span>
                                        ))}
                                    </div>
                                </Section>
                            )}

                            {/* Interventions */}
                            {trial.interventions.length > 0 && (
                                <Section icon={BeakerIcon} title="Interventions">
                                    <div className="space-y-3">
                                        {trial.interventions.map((interv, i) => (
                                            <div key={i} className="border-l-2 border-purple-300 dark:border-purple-700 pl-3">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-medium text-gray-900 dark:text-white">{interv.name}</span>
                                                    <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded text-xs">
                                                        {interv.type}
                                                    </span>
                                                </div>
                                                {interv.description && (
                                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{interv.description}</p>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </Section>
                            )}

                            {/* Study Design */}
                            {(trial.allocation || trial.intervention_model || trial.masking || trial.primary_purpose) && (
                                <Section icon={DocumentTextIcon} title="Study Design">
                                    <div className="grid grid-cols-2 gap-4">
                                        {trial.allocation && (
                                            <div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Allocation</div>
                                                <div className="text-gray-900 dark:text-white capitalize">{trial.allocation.toLowerCase().replace('_', ' ')}</div>
                                            </div>
                                        )}
                                        {trial.intervention_model && (
                                            <div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Intervention Model</div>
                                                <div className="text-gray-900 dark:text-white capitalize">{trial.intervention_model.toLowerCase().replace('_', ' ')}</div>
                                            </div>
                                        )}
                                        {trial.masking && (
                                            <div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Masking</div>
                                                <div className="text-gray-900 dark:text-white capitalize">{trial.masking.toLowerCase()}</div>
                                            </div>
                                        )}
                                        {trial.primary_purpose && (
                                            <div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Primary Purpose</div>
                                                <div className="text-gray-900 dark:text-white capitalize">{trial.primary_purpose.toLowerCase()}</div>
                                            </div>
                                        )}
                                    </div>
                                </Section>
                            )}

                            {/* Primary Outcomes */}
                            {trial.primary_outcomes.length > 0 && (
                                <Section icon={ClipboardDocumentListIcon} title="Primary Outcomes">
                                    <ul className="space-y-2">
                                        {trial.primary_outcomes.map((outcome, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 text-xs font-medium">
                                                    {i + 1}
                                                </span>
                                                <div>
                                                    <div className="text-gray-900 dark:text-white">{outcome.measure}</div>
                                                    {outcome.time_frame && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            Time frame: {outcome.time_frame}
                                                        </div>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </Section>
                            )}

                            {/* Secondary Outcomes */}
                            {trial.secondary_outcomes && trial.secondary_outcomes.length > 0 && (
                                <Section icon={ClipboardDocumentListIcon} title="Secondary Outcomes">
                                    <ul className="space-y-2">
                                        {trial.secondary_outcomes.map((outcome, i) => (
                                            <li key={i} className="flex items-start gap-2">
                                                <span className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium">
                                                    {i + 1}
                                                </span>
                                                <div>
                                                    <div className="text-gray-900 dark:text-white">{outcome.measure}</div>
                                                    {outcome.time_frame && (
                                                        <div className="text-sm text-gray-500 dark:text-gray-400">
                                                            Time frame: {outcome.time_frame}
                                                        </div>
                                                    )}
                                                </div>
                                            </li>
                                        ))}
                                    </ul>
                                </Section>
                            )}

                            {/* Eligibility */}
                            <Section icon={UserGroupIcon} title="Eligibility">
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-4">
                                        {trial.sex && (
                                            <div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Sex: </span>
                                                <span className="text-gray-900 dark:text-white">{trial.sex}</span>
                                            </div>
                                        )}
                                        {trial.min_age && (
                                            <div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Min Age: </span>
                                                <span className="text-gray-900 dark:text-white">{trial.min_age}</span>
                                            </div>
                                        )}
                                        {trial.max_age && (
                                            <div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Max Age: </span>
                                                <span className="text-gray-900 dark:text-white">{trial.max_age}</span>
                                            </div>
                                        )}
                                        {trial.healthy_volunteers !== undefined && (
                                            <div>
                                                <span className="text-xs text-gray-500 dark:text-gray-400 uppercase">Healthy Volunteers: </span>
                                                <span className="text-gray-900 dark:text-white">{trial.healthy_volunteers ? 'Yes' : 'No'}</span>
                                            </div>
                                        )}
                                    </div>
                                    {trial.eligibility_criteria && (
                                        <div className="mt-3">
                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase mb-1">Criteria</div>
                                            <pre className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans bg-gray-50 dark:bg-gray-900 p-3 rounded-lg max-h-60 overflow-y-auto">
                                                {trial.eligibility_criteria}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            </Section>

                            {/* Brief Summary */}
                            {trial.brief_summary && (
                                <Section icon={DocumentTextIcon} title="Summary">
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                                        {trial.brief_summary}
                                    </p>
                                </Section>
                            )}

                            {/* Detailed Description */}
                            {trial.detailed_description && (
                                <Section icon={DocumentTextIcon} title="Detailed Description">
                                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap text-sm">
                                        {trial.detailed_description}
                                    </p>
                                </Section>
                            )}

                            {/* Locations */}
                            {(trial.locations.length > 0 || trial.location_countries.length > 0) && (
                                <Section icon={MapPinIcon} title="Locations">
                                    {trial.location_countries.length > 0 && (
                                        <div className="mb-3">
                                            <span className="text-sm text-gray-500 dark:text-gray-400">Countries: </span>
                                            <span className="text-gray-900 dark:text-white">{trial.location_countries.join(', ')}</span>
                                        </div>
                                    )}
                                    {trial.locations.length > 0 && (
                                        <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {trial.locations.slice(0, 20).map((loc, i) => (
                                                <div key={i} className="text-sm border-l-2 border-gray-200 dark:border-gray-700 pl-2">
                                                    {loc.facility && <div className="font-medium text-gray-900 dark:text-white">{loc.facility}</div>}
                                                    <div className="text-gray-600 dark:text-gray-400">
                                                        {[loc.city, loc.state, loc.country].filter(Boolean).join(', ')}
                                                    </div>
                                                </div>
                                            ))}
                                            {trial.locations.length > 20 && (
                                                <div className="text-sm text-gray-500 dark:text-gray-400 italic">
                                                    ...and {trial.locations.length - 20} more locations
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </Section>
                            )}

                            {/* Keywords */}
                            {trial.keywords.length > 0 && (
                                <Section icon={DocumentTextIcon} title="Keywords">
                                    <div className="flex flex-wrap gap-1">
                                        {trial.keywords.map((kw, i) => (
                                            <span
                                                key={i}
                                                className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-sm"
                                            >
                                                {kw}
                                            </span>
                                        ))}
                                    </div>
                                </Section>
                            )}

                            {/* Dates & IDs */}
                            <Section icon={CalendarIcon} title="Record Information">
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                    {trial.org_study_id && (
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Org Study ID</div>
                                            <div className="text-gray-900 dark:text-white font-mono">{trial.org_study_id}</div>
                                        </div>
                                    )}
                                    {trial.status_verified_date && (
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Status Verified</div>
                                            <div className="text-gray-900 dark:text-white">{trial.status_verified_date}</div>
                                        </div>
                                    )}
                                    {trial.last_update_date && (
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Last Updated</div>
                                            <div className="text-gray-900 dark:text-white">{trial.last_update_date}</div>
                                        </div>
                                    )}
                                    {trial.retrieved_at && (
                                        <div>
                                            <div className="text-xs text-gray-500 dark:text-gray-400 uppercase">Retrieved</div>
                                            <div className="text-gray-900 dark:text-white">{new Date(trial.retrieved_at).toLocaleDateString()}</div>
                                        </div>
                                    )}
                                </div>
                            </Section>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Section component for consistent styling
function Section({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>, title: string, children: React.ReactNode }) {
    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
                <Icon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
            </div>
            <div className="p-4">
                {children}
            </div>
        </div>
    );
}
