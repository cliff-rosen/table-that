import { useState, useRef, useEffect } from 'react';
import { PlayIcon, CheckCircleIcon, ExclamationCircleIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { executeRunDirect, PipelineStatus } from '../../lib/api/operationsApi';

interface ExecutePipelineTabProps {
    streamId: number;
    canModify?: boolean;
}

export default function ExecutePipelineTab({ streamId, canModify = true }: ExecutePipelineTabProps) {
    const [isExecuting, setIsExecuting] = useState(false);
    const [statusLog, setStatusLog] = useState<PipelineStatus[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [reportId, setReportId] = useState<number | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    // Calculate default dates (last 7 days)
    const getDefaultDates = () => {
        const today = new Date();
        const weekAgo = new Date(today);
        weekAgo.setDate(weekAgo.getDate() - 7);

        return {
            startDate: weekAgo.toISOString().split('T')[0], // YYYY-MM-DD
            endDate: today.toISOString().split('T')[0]
        };
    };

    const defaults = getDefaultDates();
    const [startDate, setStartDate] = useState(defaults.startDate);
    const [endDate, setEndDate] = useState(defaults.endDate);

    // Generate default report name from today's date
    const getDefaultReportName = () => {
        const today = new Date();
        return today.toISOString().split('T')[0].replace(/-/g, '.'); // YYYY.MM.DD
    };

    const [reportName, setReportName] = useState(getDefaultReportName());

    // Auto-scroll to bottom when new log entries are added
    useEffect(() => {
        if (logEndRef.current) {
            logEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [statusLog]);

    const executePipeline = async () => {
        setIsExecuting(true);
        setStatusLog([]);
        setError(null);
        setReportId(null);

        try {
            // Convert YYYY-MM-DD to YYYY/MM/DD for backend
            const formattedStartDate = startDate.replace(/-/g, '/');
            const formattedEndDate = endDate.replace(/-/g, '/');

            // Use the operations API to execute pipeline directly
            const stream = executeRunDirect({
                stream_id: streamId,
                run_type: 'manual',
                start_date: formattedStartDate,
                end_date: formattedEndDate,
                report_name: reportName
            });

            for await (const status of stream) {
                // Add status to log first (so completion message is shown)
                setStatusLog(prev => [...prev, status]);

                // Check for completion or error
                if (status.stage === 'complete') {
                    // Extract report_id if present
                    if (status.data?.report_id) {
                        setReportId(status.data.report_id);
                    }
                    setIsExecuting(false);
                    break;
                }

                if (status.stage === 'error') {
                    setError(status.message);
                    setIsExecuting(false);
                    break;
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to execute pipeline');
            setIsExecuting(false);
        }
    };

    const getStageColor = (stage: string) => {
        switch (stage) {
            case 'init':
                return 'text-blue-600 dark:text-blue-400';
            case 'cleanup':
                return 'text-gray-600 dark:text-gray-400';
            case 'retrieval':
                return 'text-indigo-600 dark:text-indigo-400';
            case 'dedup_group':
                return 'text-yellow-600 dark:text-yellow-400';
            case 'filter':
                return 'text-purple-600 dark:text-purple-400';
            case 'dedup_global':
                return 'text-orange-600 dark:text-orange-400';
            case 'categorize':
                return 'text-green-600 dark:text-green-400';
            case 'report':
                return 'text-teal-600 dark:text-teal-400';
            case 'complete':
                return 'text-green-600 dark:text-green-400 font-semibold';
            case 'error':
                return 'text-red-600 dark:text-red-400 font-semibold';
            default:
                return 'text-gray-600 dark:text-gray-400';
        }
    };

    const getStageBadge = (stage: string) => {
        const baseClass = "inline-block px-2 py-0.5 text-xs font-medium rounded uppercase";
        switch (stage) {
            case 'init':
                return `${baseClass} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300`;
            case 'cleanup':
                return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300`;
            case 'retrieval':
                return `${baseClass} bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300`;
            case 'dedup_group':
                return `${baseClass} bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300`;
            case 'filter':
                return `${baseClass} bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300`;
            case 'dedup_global':
                return `${baseClass} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300`;
            case 'categorize':
                return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
            case 'report':
                return `${baseClass} bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300`;
            case 'complete':
                return `${baseClass} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300`;
            case 'error':
                return `${baseClass} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300`;
            default:
                return `${baseClass} bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300`;
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Compact Controls Row */}
            <div className="flex-shrink-0 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-4 mb-4">
                <div className="flex flex-wrap items-end gap-4">
                    {/* Report Name */}
                    <div className="flex-1 min-w-[150px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Report Name
                        </label>
                        <input
                            type="text"
                            value={reportName}
                            onChange={(e) => setReportName(e.target.value)}
                            disabled={isExecuting}
                            placeholder="YYYY.MM.DD"
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 text-sm"
                        />
                    </div>

                    {/* Start Date */}
                    <div className="min-w-[140px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Start Date
                        </label>
                        <input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            disabled={isExecuting}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 text-sm"
                        />
                    </div>

                    {/* End Date */}
                    <div className="min-w-[140px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            End Date
                        </label>
                        <input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            disabled={isExecuting}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white disabled:opacity-50 text-sm"
                        />
                    </div>

                    {/* Execute Button */}
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={executePipeline}
                            disabled={isExecuting || !canModify}
                            title={!canModify ? 'You do not have permission to run this stream' : undefined}
                            className={`flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-colors whitespace-nowrap ${
                                isExecuting || !canModify
                                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                                    : 'bg-orange-600 hover:bg-orange-700 text-white'
                            }`}
                        >
                            {isExecuting ? (
                                <>
                                    <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                    Executing...
                                </>
                            ) : (
                                <>
                                    <PlayIcon className="h-5 w-5" />
                                    Execute Pipeline
                                </>
                            )}
                        </button>

                        {reportId && (
                            <a
                                href={`/reports?stream=${streamId}&report=${reportId}`}
                                className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium transition-colors whitespace-nowrap"
                            >
                                <CheckCircleIcon className="h-5 w-5" />
                                View Report
                            </a>
                        )}
                    </div>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="flex-shrink-0 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
                    <div className="flex items-start gap-3">
                        <ExclamationCircleIcon className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="font-medium text-red-900 dark:text-red-200">Pipeline Execution Failed</h4>
                            <p className="text-sm text-red-800 dark:text-red-300 mt-1">{error}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Status Log - Takes remaining space */}
            {statusLog.length > 0 ? (
                <div className="flex-1 min-h-0 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden flex flex-col">
                    <div className="flex-shrink-0 bg-gray-100 dark:bg-gray-800 px-4 py-2 border-b border-gray-300 dark:border-gray-600">
                        <h4 className="font-medium text-gray-900 dark:text-white text-sm">Execution Log</h4>
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto bg-white dark:bg-gray-900 p-4 space-y-2 font-mono text-sm">
                        {statusLog.map((status, idx) => (
                            <div key={idx} className="flex items-start gap-3">
                                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 font-mono">
                                    {new Date(status.timestamp).toLocaleTimeString()}
                                </span>
                                <span className={getStageBadge(status.stage)}>
                                    {status.stage}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className={`${getStageColor(status.stage)} break-words`}>
                                        {status.message}
                                    </p>
                                    {status.data && Object.keys(status.data).length > 0 && (
                                        <details className="mt-1">
                                            <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                                                Show details
                                            </summary>
                                            <pre className="text-xs text-gray-600 dark:text-gray-400 mt-1 p-2 bg-gray-50 dark:bg-gray-800 rounded overflow-x-auto">
                                                {JSON.stringify(status.data, null, 2)}
                                            </pre>
                                        </details>
                                    )}
                                </div>
                            </div>
                        ))}
                        <div ref={logEndRef} />
                    </div>
                </div>
            ) : (
                /* Empty State */
                !isExecuting && !error && (
                    <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                        <div className="text-center">
                            <PlayIcon className="h-12 w-12 mx-auto mb-3 opacity-50" />
                            <p>Click "Execute Pipeline" to test your research stream configuration</p>
                        </div>
                    </div>
                )
            )}
        </div>
    );
}
