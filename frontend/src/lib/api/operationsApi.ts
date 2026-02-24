/**
 * Operations API - Pipeline execution queue, scheduler, and run management
 *
 * Worker operations only. For curation (human review), see curationApi.ts
 */

import { api } from './index';
import { subscribeToSSE, makeStreamRequest } from './streamUtils';

// Import domain types from types/
import type {
    ExecutionStatus,
    StreamOption,
    ExecutionQueueItem,
    ExecutionDetail,
    ScheduledStream,
} from '../../types/research-stream';
import type { ApprovalStatus } from '../../types/report';


// ==================== Execution Queue API ====================

export interface ExecutionQueueResponse {
    executions: ExecutionQueueItem[];
    total: number;
    streams: StreamOption[];
}

export async function getExecutionQueue(params?: {
    execution_status?: ExecutionStatus;
    approval_status?: ApprovalStatus;
    stream_id?: number;
    limit?: number;
    offset?: number;
}): Promise<ExecutionQueueResponse> {
    const searchParams = new URLSearchParams();
    if (params?.execution_status) {
        searchParams.append('execution_status', params.execution_status);
    }
    if (params?.approval_status) {
        searchParams.append('approval_status', params.approval_status);
    }
    if (params?.stream_id) {
        searchParams.append('stream_id', params.stream_id.toString());
    }
    if (params?.limit) {
        searchParams.append('limit', params.limit.toString());
    }
    if (params?.offset) {
        searchParams.append('offset', params.offset.toString());
    }

    const url = `/api/operations/executions${searchParams.toString() ? '?' + searchParams.toString() : ''}`;
    const response = await api.get<ExecutionQueueResponse>(url);
    return response.data;
}

export async function getExecutionDetail(executionId: string): Promise<ExecutionDetail> {
    const response = await api.get<ExecutionDetail>(`/api/operations/executions/${executionId}`);
    return response.data;
}


// ==================== Scheduler API ====================

export interface UpdateScheduleRequest {
    enabled?: boolean;
    frequency?: string;
    anchor_day?: string;
    preferred_time?: string;
    timezone?: string;
    send_day?: string;
    send_time?: string;
}

export async function getScheduledStreams(): Promise<ScheduledStream[]> {
    const response = await api.get<ScheduledStream[]>('/api/operations/streams/scheduled');
    return response.data;
}

export async function updateStreamSchedule(
    streamId: number,
    updates: UpdateScheduleRequest
): Promise<ScheduledStream> {
    const response = await api.patch<ScheduledStream>(
        `/api/operations/streams/${streamId}/schedule`,
        updates
    );
    return response.data;
}


// ==================== Run Management API ====================

export interface TriggerRunRequest {
    stream_id: number;
    run_type?: 'manual' | 'test';
    report_name?: string;
    start_date?: string;
    end_date?: string;
}

export interface DirectRunRequest {
    stream_id: number;
    run_type?: 'manual' | 'test' | 'scheduled';
    start_date?: string;  // YYYY/MM/DD format
    end_date?: string;    // YYYY/MM/DD format
    report_name?: string;
}

export interface PipelineStatus {
    stage: string;
    message: string;
    data?: Record<string, any>;
    timestamp: string;
}

export interface TriggerRunResponse {
    execution_id: string;
    stream_id: number;
    status: string;
    message: string;
}

export interface RunStatusResponse {
    execution_id: string;
    stream_id: number;
    status: string;
    run_type: string;
    started_at?: string;
    completed_at?: string;
    error?: string;
}

export interface RunStatusEvent {
    execution_id: string;
    stage: string;
    message: string;
    timestamp: string;
    error?: string;
}

export async function triggerRun(request: TriggerRunRequest): Promise<TriggerRunResponse> {
    const response = await api.post<TriggerRunResponse>('/api/operations/runs', request);
    return response.data;
}

export async function getRunStatus(executionId: string): Promise<RunStatusResponse> {
    const response = await api.get<RunStatusResponse>(`/api/operations/runs/${executionId}`);
    return response.data;
}

export async function cancelRun(executionId: string): Promise<{ message: string; execution_id: string }> {
    const response = await api.delete<{ message: string; execution_id: string }>(
        `/api/operations/runs/${executionId}`
    );
    return response.data;
}

/**
 * Subscribe to run status updates via SSE.
 */
export function subscribeToRunStatus(
    executionId: string,
    onMessage: (event: RunStatusEvent) => void,
    onError?: (error: Event) => void,
    onComplete?: () => void
): () => void {
    let cleanup: (() => void) | null = null;

    cleanup = subscribeToSSE<RunStatusEvent>(
        `/api/operations/runs/${executionId}/stream`,
        (event) => {
            onMessage(event);
            if (event.stage === 'completed' || event.stage === 'failed') {
                onComplete?.();
                cleanup?.();
            }
        },
        (error) => onError?.(error as unknown as Event),
        onComplete
    );

    return () => cleanup?.();
}

/**
 * Execute pipeline directly via SSE (not queued to worker).
 *
 * This runs the pipeline in the API process and streams real-time status updates.
 * Use this for immediate testing/execution rather than queued runs.
 *
 * Pipeline stages:
 * 1. Load configuration
 * 2. Execute retrieval queries
 * 3. Deduplicate within groups
 * 4. Apply semantic filters
 * 5. Deduplicate globally
 * 6. Categorize articles
 * 7. Generate report
 */
export async function* executeRunDirect(
    request: DirectRunRequest
): AsyncGenerator<PipelineStatus> {
    const stream = makeStreamRequest(
        '/api/operations/runs/direct',
        request,
        'POST'
    );

    for await (const update of stream) {
        // Parse SSE data (format: "data: {json}\n\n")
        const lines = update.data.split('\n');
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const jsonData = line.slice(6); // Remove "data: " prefix
                if (jsonData.trim()) {
                    try {
                        const status = JSON.parse(jsonData) as PipelineStatus;
                        yield status;
                    } catch (e) {
                        console.error('Failed to parse pipeline status:', e);
                    }
                }
            }
        }
    }
}


// ==================== Email Queue API ====================

export type ReportEmailQueueStatus = 'scheduled' | 'ready' | 'processing' | 'sent' | 'failed';

export interface EmailQueueEntry {
    id: number;
    report_id: number;
    user_id: number;
    email: string;
    status: ReportEmailQueueStatus;
    scheduled_for: string;
    created_at: string;
    updated_at: string;
    sent_at?: string;
    error_message?: string;
    report_name?: string;
    user_full_name?: string;
    stream_name?: string;
}

export interface EmailQueueListResponse {
    entries: EmailQueueEntry[];
    total: number;
}

export interface ApprovedReportInfo {
    report_id: number;
    report_name: string;
    stream_name?: string;
    created_at: string;
}

export interface SubscriberInfo {
    user_id: number;
    email: string;
    full_name?: string;
    org_name?: string;
}

export interface BulkScheduleRequest {
    report_id: number;
    user_ids: number[];
    scheduled_for: string;
}

export interface BulkScheduleResponse {
    scheduled_count: number;
    skipped_count: number;
    queue_entries: EmailQueueEntry[];
}

export interface ProcessQueueResponse {
    total_processed: number;
    sent_count: number;
    failed_count: number;
    skipped_count: number;
    errors: string[];
}

export async function getEmailQueue(params?: {
    status_filter?: ReportEmailQueueStatus;
    scheduled_from?: string;
    scheduled_to?: string;
    report_id?: number;
    limit?: number;
    offset?: number;
}): Promise<EmailQueueListResponse> {
    const response = await api.get('/api/operations/email-queue', { params });
    return response.data;
}

export async function getApprovedReportsForEmail(): Promise<ApprovedReportInfo[]> {
    const response = await api.get('/api/operations/email-queue/approved-reports');
    return response.data;
}

export async function getReportSubscribers(reportId: number): Promise<SubscriberInfo[]> {
    const response = await api.get(`/api/operations/email-queue/subscribers/${reportId}`);
    return response.data;
}

export async function scheduleEmails(data: BulkScheduleRequest): Promise<BulkScheduleResponse> {
    const response = await api.post('/api/operations/email-queue/schedule', data);
    return response.data;
}

export async function cancelEmail(entryId: number): Promise<void> {
    await api.delete(`/api/operations/email-queue/${entryId}`);
}

export async function processEmailQueue(forceAll: boolean = true): Promise<ProcessQueueResponse> {
    const response = await api.post('/api/operations/email-queue/process', null, {
        params: { force_all: forceAll }
    });
    return response.data;
}
