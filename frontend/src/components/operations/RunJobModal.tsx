/**
 * RunJobModal - Modal for configuring and monitoring pipeline runs
 *
 * Two states:
 * 1. Config - Configure job parameters (dates, report name)
 * 2. Progress - Show real-time status updates from the running job
 */

import { useState, useEffect, useRef } from 'react';
import {
    XMarkIcon,
    PlayIcon,
    StopIcon,
    CheckCircleIcon,
    XCircleIcon,
    ArrowPathIcon,
    ArrowsPointingOutIcon,
    ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import {
    triggerRun,
    cancelRun,
    subscribeToRunStatus,
    type TriggerRunRequest,
    type RunStatusEvent,
} from '../../lib/api/operationsApi';

interface RunJobModalProps {
    isOpen: boolean;
    onClose: () => void;
    stream: {
        stream_id: number;
        stream_name: string;
    };
    /** If provided, shows progress for an existing execution instead of config */
    existingExecutionId?: string;
    /** Called when job starts, passes executionId so parent can track it */
    onJobStart?: (executionId: string) => void;
    /** Called when job completes or fails */
    onJobComplete?: () => void;
}

type ModalState = 'config' | 'running' | 'completed' | 'failed';

interface StatusLogEntry {
    stage: string;
    message: string;
    timestamp: string;
}

export default function RunJobModal({
    isOpen,
    onClose,
    stream,
    existingExecutionId,
    onJobStart,
    onJobComplete,
}: RunJobModalProps) {
    // Config state
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [reportName, setReportName] = useState('');

    // Execution state
    const [modalState, setModalState] = useState<ModalState>('config');
    const [executionId, setExecutionId] = useState<string | null>(existingExecutionId || null);
    const [statusLog, setStatusLog] = useState<StatusLogEntry[]>([]);
    const [currentStage, setCurrentStage] = useState<string>('');
    const [error, setError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isMaximized, setIsMaximized] = useState(false);

    // Cleanup ref for SSE subscription
    const cleanupRef = useRef<(() => void) | null>(null);
    const logEndRef = useRef<HTMLDivElement>(null);

    // If we have an existing execution, start in progress mode
    useEffect(() => {
        if (existingExecutionId && isOpen) {
            setExecutionId(existingExecutionId);
            setModalState('running');
        }
    }, [existingExecutionId, isOpen]);

    // Subscribe to status updates when we have an execution ID and modal is open
    useEffect(() => {
        if (!executionId || !isOpen) return;

        // Guard against stale updates after cleanup
        let isActive = true;

        console.log('[RunJobModal] Subscribing to SSE for execution:', executionId);

        const cleanup = subscribeToRunStatus(
            executionId,
            (event: RunStatusEvent) => {
                if (!isActive) return; // Ignore events after cleanup
                console.log('[RunJobModal] SSE event received:', event.stage, event.message);
                setCurrentStage(event.stage);
                setStatusLog(prev => [...prev, {
                    stage: event.stage,
                    message: event.message,
                    timestamp: event.timestamp,
                }]);

                if (event.stage === 'completed') {
                    console.log('[RunJobModal] Setting modalState to completed');
                    setModalState('completed');
                } else if (event.stage === 'failed') {
                    console.log('[RunJobModal] Setting modalState to failed');
                    setModalState('failed');
                    setError(event.message);
                }
            },
            (err) => {
                if (!isActive) return;
                console.error('[RunJobModal] SSE error:', err);
                // Don't set failed state on connection errors - could be temporary
                setError('Connection lost - updates may be delayed');
            },
            () => {
                console.log('[RunJobModal] SSE stream ended normally');
            }
        );

        cleanupRef.current = cleanup;

        return () => {
            console.log('[RunJobModal] Cleaning up SSE subscription');
            isActive = false;
            cleanup();
        };
    }, [executionId, isOpen]);

    // Auto-scroll log to bottom
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [statusLog]);

    // Reset state when modal closes - simple cleanup, no complex conditions
    useEffect(() => {
        if (!isOpen) {
            // Cleanup SSE subscription immediately
            cleanupRef.current?.();
            cleanupRef.current = null;

            // Reset all state after a short delay to allow close animation
            const timer = setTimeout(() => {
                console.log('[RunJobModal] Resetting modal state after close');
                setModalState('config');
                setExecutionId(null);
                setStatusLog([]);
                setCurrentStage('');
                setError(null);
                setStartDate('');
                setEndDate('');
                setReportName('');
            }, 300);

            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleStartRun = async () => {
        setIsSubmitting(true);
        setError(null);

        try {
            const request: TriggerRunRequest = {
                stream_id: stream.stream_id,
                run_type: 'manual',
            };
            if (reportName) request.report_name = reportName;
            if (startDate) request.start_date = startDate;
            if (endDate) request.end_date = endDate;

            const response = await triggerRun(request);
            setExecutionId(response.execution_id);
            setModalState('running');
            setStatusLog([{
                stage: 'queued',
                message: response.message,
                timestamp: new Date().toISOString(),
            }]);
            onJobStart?.(response.execution_id);
        } catch (err) {
            console.error('Failed to trigger run:', err);
            setError('Failed to start job. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCancel = async () => {
        if (!executionId) return;

        setIsCancelling(true);
        try {
            await cancelRun(executionId);
            setStatusLog(prev => [...prev, {
                stage: 'cancelled',
                message: 'Job cancellation requested',
                timestamp: new Date().toISOString(),
            }]);
        } catch (err) {
            console.error('Failed to cancel run:', err);
        } finally {
            setIsCancelling(false);
        }
    };

    const handleClose = () => {
        // If job completed or failed, notify parent before closing
        if (modalState === 'completed' || modalState === 'failed') {
            onJobComplete?.();
        }
        // If running, just close modal (job continues in background)
        // Subscription cleanup happens in useEffect
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 transition-opacity"
                onClick={handleClose}
            />

            {/* Modal */}
            <div className={`flex min-h-full ${isMaximized ? 'p-0' : 'p-4 items-center justify-center'}`}>
                <div className={`relative bg-white dark:bg-gray-800 shadow-xl transition-all duration-200 flex flex-col ${isMaximized
                        ? 'w-full h-screen rounded-none'
                        : 'w-full max-w-2xl max-h-[85vh] rounded-lg'
                    }`}>
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                            {modalState === 'config' ? 'Run Pipeline' : 'Pipeline Progress'}
                        </h2>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setIsMaximized(!isMaximized)}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                title={isMaximized ? 'Restore' : 'Maximize'}
                            >
                                {isMaximized ? (
                                    <ArrowsPointingInIcon className="h-5 w-5" />
                                ) : (
                                    <ArrowsPointingOutIcon className="h-5 w-5" />
                                )}
                            </button>
                            <button
                                onClick={handleClose}
                                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            >
                                <XMarkIcon className="h-5 w-5" />
                            </button>
                        </div>
                    </div>

                    {/* Content */}
                    <div className={`px-6 py-4 ${isMaximized ? 'flex-1 overflow-y-auto flex flex-col min-h-0' : ''}`}>
                        {/* Stream info */}
                        <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
                            <p className="text-sm text-gray-500 dark:text-gray-400">Stream</p>
                            <p className="font-medium text-gray-900 dark:text-white">{stream.stream_name}</p>
                        </div>

                        {/* Config State */}
                        {modalState === 'config' && (
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        Report Name (optional)
                                    </label>
                                    <input
                                        type="text"
                                        value={reportName}
                                        onChange={(e) => setReportName(e.target.value)}
                                        placeholder="Auto-generated if empty"
                                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            Start Date (optional)
                                        </label>
                                        <input
                                            type="date"
                                            value={startDate}
                                            onChange={(e) => setStartDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                            End Date (optional)
                                        </label>
                                        <input
                                            type="date"
                                            value={endDate}
                                            onChange={(e) => setEndDate(e.target.value)}
                                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                                        />
                                    </div>
                                </div>

                                {error && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm">
                                        {error}
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Progress State */}
                        {(modalState === 'running' || modalState === 'completed' || modalState === 'failed') && (
                            <div className={`space-y-4 ${isMaximized ? 'flex-1 flex flex-col min-h-0' : ''}`}>
                                {/* Status indicator */}
                                <div className="flex items-center gap-3">
                                    {modalState === 'running' && (
                                        <>
                                            <span className="relative flex h-3 w-3">
                                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                                <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                                            </span>
                                            <span className="text-purple-600 dark:text-purple-400 font-medium">
                                                {currentStage || 'Starting...'}
                                            </span>
                                        </>
                                    )}
                                    {modalState === 'completed' && (
                                        <>
                                            <CheckCircleIcon className="h-5 w-5 text-green-500" />
                                            <span className="text-green-600 dark:text-green-400 font-medium">
                                                Completed
                                            </span>
                                        </>
                                    )}
                                    {modalState === 'failed' && (
                                        <>
                                            <XCircleIcon className="h-5 w-5 text-red-500" />
                                            <span className="text-red-600 dark:text-red-400 font-medium">
                                                Failed
                                            </span>
                                        </>
                                    )}
                                </div>

                                {/* Status log */}
                                <div className={`bg-gray-50 dark:bg-gray-900 rounded-lg p-3 overflow-y-auto font-mono text-xs ${isMaximized ? 'flex-1 min-h-0' : 'max-h-80'}`}>
                                    {statusLog.length === 0 ? (
                                        <div className="text-gray-500 dark:text-gray-400 flex items-center gap-2">
                                            <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                            Waiting for updates...
                                        </div>
                                    ) : (
                                        <div className="space-y-1">
                                            {statusLog.map((entry, i) => (
                                                <div key={i} className="flex gap-2">
                                                    <span className="text-gray-500 dark:text-gray-500 whitespace-nowrap">
                                                        {new Date(entry.timestamp).toLocaleTimeString()}
                                                    </span>
                                                    <span className={`font-medium ${entry.stage === 'completed' ? 'text-green-600 dark:text-green-400' :
                                                            entry.stage === 'failed' ? 'text-red-600 dark:text-red-400' :
                                                                'text-purple-600 dark:text-purple-400'
                                                        }`}>
                                                        [{entry.stage}]
                                                    </span>
                                                    <span className="text-gray-700 dark:text-gray-300">
                                                        {entry.message}
                                                    </span>
                                                </div>
                                            ))}
                                            <div ref={logEndRef} />
                                        </div>
                                    )}
                                </div>

                                {/* Error message */}
                                {error && modalState === 'failed' && (
                                    <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 rounded-md text-sm">
                                        {error}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                        {modalState === 'config' && (
                            <>
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleStartRun}
                                    disabled={isSubmitting}
                                    className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
                                >
                                    {isSubmitting ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <PlayIcon className="h-4 w-4" />
                                    )}
                                    Start Run
                                </button>
                            </>
                        )}

                        {modalState === 'running' && (
                            <>
                                <button
                                    onClick={handleClose}
                                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md"
                                >
                                    Close (continues in background)
                                </button>
                                <button
                                    onClick={handleCancel}
                                    disabled={isCancelling}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                                >
                                    {isCancelling ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <StopIcon className="h-4 w-4" />
                                    )}
                                    Cancel Job
                                </button>
                            </>
                        )}

                        {(modalState === 'completed' || modalState === 'failed') && (
                            <button
                                onClick={handleClose}
                                className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                            >
                                Close
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
