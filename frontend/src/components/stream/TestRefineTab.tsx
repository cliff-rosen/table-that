import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import QueryRefinementWorkbench, { WorkbenchState } from './QueryRefinementWorkbench';
import ExecutePipelineTab from './ExecutePipelineTab';
import PhaseConfigForm from './PhaseConfigForm';
import CurationNotesTab from './CurationNotesTab';
import { ResearchStream } from '../../types';

export type ExecuteSubTab = 'workbench' | 'pipeline' | 'phases' | 'curation-notes';

interface TestRefineTabProps {
    streamId: number;
    stream: ResearchStream;
    onStreamUpdate: () => void;
    canModify?: boolean;
    onWorkbenchStateChange?: (state: WorkbenchState | null) => void;
    onSubTabChange?: (subTab: ExecuteSubTab) => void;
    pendingQueryUpdate?: string | null;
    onQueryUpdateApplied?: () => void;
    pendingFilterUpdate?: { criteria: string; threshold?: number } | null;
    onFilterUpdateApplied?: () => void;
}

export default function TestRefineTab({ streamId, stream, onStreamUpdate, canModify = true, onWorkbenchStateChange, onSubTabChange, pendingQueryUpdate, onQueryUpdateApplied, pendingFilterUpdate, onFilterUpdateApplied }: TestRefineTabProps) {
    const [searchParams] = useSearchParams();

    // Check URL params for initial subtab
    const urlSubTab = searchParams.get('subtab') as ExecuteSubTab;
    const initialSubTab = urlSubTab || 'workbench';
    const [activeSubTab, setActiveSubTab] = useState<ExecuteSubTab>(initialSubTab);

    // Report initial sub-tab on mount
    useEffect(() => {
        if (onSubTabChange) {
            onSubTabChange(initialSubTab);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Clear workbench state when switching away from workbench subtab
    const handleSubTabChange = (subtab: ExecuteSubTab) => {
        setActiveSubTab(subtab);
        if (onSubTabChange) {
            onSubTabChange(subtab);
        }
        if (subtab !== 'workbench' && onWorkbenchStateChange) {
            onWorkbenchStateChange(null);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Sub-Tab Navigation */}
            <div className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700">
                <nav className="-mb-px flex space-x-8">
                    <button
                        type="button"
                        onClick={() => handleSubTabChange('workbench')}
                        className={`
                            py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                            ${activeSubTab === 'workbench'
                                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
                        `}
                    >
                        Refinement Workbench
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubTabChange('pipeline')}
                        className={`
                            py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                            ${activeSubTab === 'pipeline'
                                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
                        `}
                    >
                        Full Pipeline Execution
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubTabChange('phases')}
                        className={`
                            py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                            ${activeSubTab === 'phases'
                                ? 'border-purple-500 text-purple-600 dark:text-purple-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
                        `}
                    >
                        Phase Configuration
                    </button>
                    <button
                        type="button"
                        onClick={() => handleSubTabChange('curation-notes')}
                        className={`
                            py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap
                            ${activeSubTab === 'curation-notes'
                                ? 'border-teal-500 text-teal-600 dark:text-teal-400'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                            }
                        `}
                    >
                        Curation Notes
                    </button>
                </nav>
            </div>

            {/* Sub-Tab Content */}
            <div className="flex-1 min-h-0 pt-6">
                {activeSubTab === 'workbench' && (
                    <QueryRefinementWorkbench
                        streamId={streamId}
                        stream={stream}
                        onStreamUpdate={onStreamUpdate}
                        canModify={canModify}
                        onStateChange={onWorkbenchStateChange}
                        pendingQueryUpdate={pendingQueryUpdate}
                        onQueryUpdateApplied={onQueryUpdateApplied}
                        pendingFilterUpdate={pendingFilterUpdate}
                        onFilterUpdateApplied={onFilterUpdateApplied}
                    />
                )}
                {activeSubTab === 'pipeline' && <ExecutePipelineTab streamId={streamId} canModify={canModify} />}
                {activeSubTab === 'phases' && (
                    <PhaseConfigForm
                        stream={stream}
                        onConfigUpdate={onStreamUpdate}
                        canModify={canModify}
                    />
                )}
                {activeSubTab === 'curation-notes' && (
                    <CurationNotesTab streamId={streamId} />
                )}
            </div>
        </div>
    );
}
