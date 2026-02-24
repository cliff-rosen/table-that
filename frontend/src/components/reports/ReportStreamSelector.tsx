import { DocumentTextIcon } from '@heroicons/react/24/outline';
import { ResearchStream } from '../../types';

export interface ReportStreamSelectorProps {
    researchStreams: ResearchStream[];
    selectedStream: string;
    onStreamChange: (streamId: string) => void;
    onRunPipeline?: () => void;
    showRunPipeline?: boolean;
}

export default function ReportStreamSelector({
    researchStreams,
    selectedStream,
    onStreamChange,
    onRunPipeline,
    showRunPipeline = false
}: ReportStreamSelectorProps) {
    return (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
            <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Research Stream:
                    </label>
                    <select
                        value={selectedStream}
                        onChange={(e) => onStreamChange(e.target.value)}
                        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white min-w-64"
                    >
                        <option value="">Select a research stream...</option>
                        {researchStreams.map(stream => (
                            <option key={stream.stream_id} value={stream.stream_id}>
                                {stream.stream_name}
                            </option>
                        ))}
                    </select>
                </div>
                {showRunPipeline && onRunPipeline && (
                    <button
                        onClick={onRunPipeline}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                    >
                        <DocumentTextIcon className="h-5 w-5" />
                        Run Pipeline
                    </button>
                )}
            </div>
        </div>
    );
}
