/**
 * ConversationList Component
 *
 * Displays chat conversations for platform admins with full message inspection.
 */

import { useState, useEffect, useCallback } from 'react';
import { ChatBubbleLeftRightIcon, XMarkIcon, ArrowPathIcon, UserIcon, CpuChipIcon, BugAntIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { api } from '@/lib/api';
import { showErrorToast } from '@/lib/errorToast';
import { AgentTrace as ChatAgentTrace, ToolCall } from '@/types/chat';
import { DiagnosticsPanel } from '@/components/chat/DiagnosticsPanel';
import { ToolCallCard } from '@/components/chat/diagnostics/ToolCallCard';
import { MarkdownRenderer } from '@/components/ui/MarkdownRenderer';

interface SuggestedValue {
    label: string;
    value: string;
}

interface SuggestedAction {
    label: string;
    action: string;
    handler?: string;
    data?: Record<string, unknown>;
}

interface ToolRecord {
    tool_name: string;
    input: Record<string, unknown>;
    output: string;
}

// Legacy diagnostics format (for old messages)
interface LegacyDiagnostics {
    model: string;
    max_tokens: number;
    max_iterations?: number;
    temperature?: number;
    system_prompt: string;
    tools: string[];
    messages: Array<{ role: string; content: string }>;
    context: Record<string, unknown>;
    raw_llm_response?: string;
}

// New trace format (for new messages)
interface AgentTrace {
    trace_id: string;
    model: string;
    max_tokens: number;
    max_iterations: number;
    temperature: number;
    system_prompt: string;
    tools: Array<{ name: string; description: string; input_schema: Record<string, unknown> }>;
    context: Record<string, unknown>;
    initial_messages: Array<Record<string, unknown>>;
    iterations: Array<{
        iteration: number;
        messages_to_model: Array<Record<string, unknown>>;
        response_content: Array<Record<string, unknown>>;
        stop_reason: string;
        usage: { input_tokens: number; output_tokens: number };
        api_call_ms: number;
        tool_calls: Array<{
            tool_use_id: string;
            tool_name: string;
            // New format uses tool_input, legacy uses input_from_model/input_to_executor
            tool_input?: Record<string, unknown>;
            input_from_model?: Record<string, unknown>;
            input_to_executor?: Record<string, unknown>;
            output_from_executor: unknown;
            output_type: string;
            output_to_model: string;
            payload?: Record<string, unknown>;
            execution_ms: number;
        }>;
    }>;
    final_text: string;
    total_iterations: number;
    outcome: string;
    error_message?: string;
    total_input_tokens: number;
    total_output_tokens: number;
    total_duration_ms: number;
    peak_input_tokens?: number;
}

interface MessageExtras {
    tool_history?: ToolRecord[];
    custom_payload?: Record<string, unknown>;
    diagnostics?: LegacyDiagnostics;  // Legacy format
    trace?: AgentTrace;  // New format
    suggested_values?: SuggestedValue[];
    suggested_actions?: SuggestedAction[];
}

interface Message {
    id: number;
    role: string;
    content: string;
    context?: Record<string, unknown>;
    extras?: MessageExtras;
    created_at: string;
}

interface AdminConversation {
    id: number;
    user_id: number;
    user_email: string;
    user_name?: string;
    title?: string;
    message_count: number;
    created_at: string;
    updated_at: string;
}

interface ChatsResponse {
    chats: AdminConversation[];
    total: number;
    limit: number;
    offset: number;
}

interface ConversationDetail {
    id: number;
    user_id: number;
    user_email: string;
    user_name?: string;
    title?: string;
    created_at: string;
    updated_at: string;
    messages: Message[];
}

interface UserOption {
    user_id: number;
    email: string;
    full_name?: string;
}

export function ConversationList() {
    const [conversations, setConversations] = useState<AdminConversation[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Filters
    const [userId, setUserId] = useState<number | ''>('');
    const [users, setUsers] = useState<UserOption[]>([]);

    // Pagination
    const [offset, setOffset] = useState(0);
    const limit = 50;

    // Detail view
    const [selectedConversation, setSelectedConversation] = useState<ConversationDetail | null>(null);
    const [selectedMessage, setSelectedMessage] = useState<Message | null>(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [traceToShow, setTraceToShow] = useState<AgentTrace | null>(null);

    const fetchConversations = async () => {
        setLoading(true);
        setError(null);
        try {
            const params: Record<string, string | number> = { limit, offset };
            if (userId) params.user_id = userId;

            const response = await api.get<ChatsResponse>('/api/chats/admin/all', { params });
            setConversations(response.data.chats);
            setTotal(response.data.total);
        } catch (err) {
            setError('Failed to load conversations');
            showErrorToast(err, 'Failed to load conversations');
        } finally {
            setLoading(false);
        }
    };

    const fetchUsers = async () => {
        try {
            const response = await api.get<{ users: UserOption[] }>('/api/admin/users');
            setUsers(response.data.users);
        } catch (err) {
            console.error('Error loading users:', err);
        }
    };

    const fetchConversationDetail = async (chatId: number) => {
        setLoadingDetail(true);
        try {
            const response = await api.get<ConversationDetail>(`/api/chats/admin/${chatId}`);
            setSelectedConversation(response.data);
        } catch (err) {
            showErrorToast(err, 'Failed to load conversation');
        } finally {
            setLoadingDetail(false);
        }
    };

    useEffect(() => {
        fetchConversations();
    }, [userId, offset]);

    useEffect(() => {
        fetchUsers();
    }, []);

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ChatBubbleLeftRightIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                    <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                        Chat Conversations
                    </h2>
                    <span className="ml-2 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                        {total} total
                    </span>
                </div>
                <button
                    onClick={() => fetchConversations()}
                    disabled={loading}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors disabled:opacity-50"
                >
                    <ArrowPathIcon className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300">User:</label>
                    <select
                        value={userId}
                        onChange={(e) => {
                            setUserId(e.target.value ? parseInt(e.target.value) : '');
                            setOffset(0);
                        }}
                        className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                        <option value="">All Users</option>
                        {users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>
                                {user.full_name || user.email}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Error */}
            {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300">
                    {error}
                </div>
            )}

            {/* Conversations List */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead className="bg-gray-50 dark:bg-gray-900">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                User
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Title / Preview
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Messages
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Last Updated
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                        {loading ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                    Loading conversations...
                                </td>
                            </tr>
                        ) : conversations.length === 0 ? (
                            <tr>
                                <td colSpan={5} className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                    No conversations found
                                </td>
                            </tr>
                        ) : (
                            conversations.map((conv) => (
                                <tr key={conv.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900 dark:text-white">
                                            {conv.user_name || 'Unknown'}
                                        </div>
                                        <div className="text-xs text-gray-500 dark:text-gray-400">
                                            {conv.user_email}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="text-sm text-gray-900 dark:text-white truncate max-w-xs">
                                            {conv.title || 'Untitled conversation'}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className="px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full">
                                            {conv.message_count}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                                        {formatDate(conv.updated_at)}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <button
                                            onClick={() => fetchConversationDetail(conv.id)}
                                            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 bg-white dark:bg-gray-800 rounded-lg">
                    <div className="text-sm text-gray-700 dark:text-gray-300">
                        Page {currentPage} of {totalPages}
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => setOffset(Math.max(0, offset - limit))}
                            disabled={offset === 0}
                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Previous
                        </button>
                        <button
                            onClick={() => setOffset(offset + limit)}
                            disabled={offset + limit >= total}
                            className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}

            {/* Conversation Detail - Full Screen Panel */}
            {selectedConversation && (
                <div className="fixed inset-0 z-50 bg-gray-100 dark:bg-gray-900 overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shrink-0">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                                {selectedConversation.title || 'Untitled Conversation'}
                            </h2>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                {selectedConversation.user_name || selectedConversation.user_email} •
                                Started {formatDate(selectedConversation.created_at)} •
                                {selectedConversation.messages.length} messages
                            </p>
                        </div>
                        <button
                            onClick={() => {
                                setSelectedConversation(null);
                                setSelectedMessage(null);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                        >
                            <XMarkIcon className="h-6 w-6 text-gray-500" />
                        </button>
                    </div>

                    {/* Content - Two column layout */}
                    <div className="flex-1 flex overflow-hidden">
                        {/* Messages List - Left Panel */}
                        <div className="w-1/2 border-r border-gray-200 dark:border-gray-700 overflow-y-auto bg-white dark:bg-gray-800">
                            {loadingDetail ? (
                                <div className="text-center text-gray-500 py-8">Loading messages...</div>
                            ) : selectedConversation.messages.length === 0 ? (
                                <div className="text-center text-gray-500 py-8">No messages</div>
                            ) : (
                                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                                    {selectedConversation.messages.map((msg, idx) => (
                                        <MessageListItem
                                            key={msg.id}
                                            message={msg}
                                            index={idx}
                                            isSelected={selectedMessage?.id === msg.id}
                                            onSelect={() => setSelectedMessage(msg)}
                                            onOpenTrace={(trace) => setTraceToShow(trace)}
                                            formatDate={formatDate}
                                        />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Message Detail - Right Panel */}
                        <div className="w-1/2 overflow-y-auto bg-gray-50 dark:bg-gray-900 p-6">
                            {selectedMessage ? (
                                <MessageDetailPanel message={selectedMessage} />
                            ) : (
                                <div className="h-full flex items-center justify-center text-gray-500 dark:text-gray-400">
                                    <p>Select a message to view details</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Trace Panel launched from left sidebar */}
            {traceToShow && (
                <DiagnosticsPanel
                    diagnostics={traceToShow as unknown as ChatAgentTrace}
                    onClose={() => setTraceToShow(null)}
                />
            )}
        </div>
    );
}

/** Message item in the left sidebar list - expandable with clickable trace badge */
function MessageListItem({
    message,
    index,
    isSelected,
    onSelect,
    onOpenTrace,
    formatDate
}: {
    message: Message;
    index: number;
    isSelected: boolean;
    onSelect: () => void;
    onOpenTrace: (trace: AgentTrace) => void;
    formatDate: (d: string) => string;
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasLongContent = message.content.length > 200;

    const handleExpandClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setIsExpanded(!isExpanded);
    }, [isExpanded]);

    const handleTraceClick = useCallback((e: React.MouseEvent, trace: AgentTrace) => {
        e.stopPropagation();
        onOpenTrace(trace);
    }, [onOpenTrace]);

    return (
        <div
            onClick={onSelect}
            className={`p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 ${
                isSelected ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''
            }`}
        >
            <div className="flex items-start gap-3">
                <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user'
                        ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                        : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400'
                }`}>
                    {message.role === 'user' ? (
                        <UserIcon className="h-4 w-4" />
                    ) : (
                        <CpuChipIcon className="h-4 w-4" />
                    )}
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold uppercase text-gray-500 dark:text-gray-400">
                            {message.role}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                            #{index + 1}
                        </span>
                        <span className="text-xs text-gray-400 dark:text-gray-500">
                            {formatDate(message.created_at)}
                        </span>
                        {/* Expand/collapse button for long content */}
                        {hasLongContent && (
                            <button
                                onClick={handleExpandClick}
                                className="ml-auto p-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"
                                title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                                {isExpanded ? (
                                    <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                                ) : (
                                    <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                                )}
                            </button>
                        )}
                    </div>
                    <div className={`text-sm ${!isExpanded ? 'line-clamp-3' : ''}`}>
                        <MarkdownRenderer content={message.content} compact />
                    </div>
                    {/* Badges for extras */}
                    {message.extras && Object.keys(message.extras).length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                            {(message.extras.trace || message.extras.diagnostics) && (
                                <button
                                    onClick={(e) => message.extras?.trace && handleTraceClick(e, message.extras.trace)}
                                    className={`px-1.5 py-0.5 text-xs rounded flex items-center gap-1 ${
                                        message.extras.trace
                                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-800 cursor-pointer'
                                            : 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                                    }`}
                                    disabled={!message.extras.trace}
                                >
                                    <BugAntIcon className="h-3 w-3" />
                                    {message.extras.trace ? 'trace' : 'diagnostics'}
                                </button>
                            )}
                            {message.extras.tool_history && message.extras.tool_history.length > 0 && (
                                <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 rounded">
                                    {message.extras.tool_history.length} tool{message.extras.tool_history.length !== 1 ? 's' : ''}
                                </span>
                            )}
                            {message.extras.custom_payload && (
                                <span className="px-1.5 py-0.5 text-xs bg-orange-100 dark:bg-orange-900 text-orange-700 dark:text-orange-300 rounded">
                                    payload
                                </span>
                            )}
                            {message.extras.suggested_values && message.extras.suggested_values.length > 0 && (
                                <span className="px-1.5 py-0.5 text-xs bg-cyan-100 dark:bg-cyan-900 text-cyan-700 dark:text-cyan-300 rounded">
                                    {message.extras.suggested_values.length} values
                                </span>
                            )}
                            {message.extras.suggested_actions && message.extras.suggested_actions.length > 0 && (
                                <span className="px-1.5 py-0.5 text-xs bg-pink-100 dark:bg-pink-900 text-pink-700 dark:text-pink-300 rounded">
                                    {message.extras.suggested_actions.length} actions
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// Simplified detail panel for a selected message
function MessageDetailPanel({ message }: { message: Message }) {
    const extras = message.extras || {};
    const trace = extras.trace;
    const legacyDiagnostics = extras.diagnostics;
    const hasDiagnostics = !!trace || !!legacyDiagnostics;

    // State for diagnostics panel (rich trace viewer)
    const [showDiagnosticsPanel, setShowDiagnosticsPanel] = useState(false);

    // Extract all tool calls from trace iterations, paired with assistant text
    const toolCallsWithContext = (trace?.iterations?.flatMap(iter => {
        // Extract text blocks from the model's response_content for this iteration
        const textBlocks = (iter.response_content || [])
            .filter((block: Record<string, unknown>) => block.type === 'text')
            .map((block: Record<string, unknown>) => block.text as string)
            .join('\n');
        return (iter.tool_calls || []).map(tc => ({
            toolCall: tc as ToolCall,
            assistantText: textBlocks || undefined,
        }));
    }) || []);

    // Track which tool calls are expanded
    const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());

    // Message content collapsed by default in right pane
    const [contentExpanded, setContentExpanded] = useState(false);

    return (
        <div className="space-y-4">
            {/* Message Header with View Trace button */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            message.role === 'user'
                                ? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
                                : 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400'
                        }`}>
                            {message.role === 'user' ? (
                                <UserIcon className="h-5 w-5" />
                            ) : (
                                <CpuChipIcon className="h-5 w-5" />
                            )}
                        </div>
                        <div>
                            <div className="font-semibold text-gray-900 dark:text-white capitalize">{message.role}</div>
                            <div className="text-xs text-gray-500">{new Date(message.created_at).toLocaleString()}</div>
                        </div>
                    </div>
                    {/* View Trace button */}
                    {hasDiagnostics && (
                        <button
                            onClick={() => setShowDiagnosticsPanel(true)}
                            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition-colors shadow-sm"
                        >
                            <BugAntIcon className="h-4 w-4" />
                            View Full Trace
                        </button>
                    )}
                </div>
            </div>

            {/* Diagnostics Panel Modal (rich trace viewer) */}
            {showDiagnosticsPanel && trace && (
                <DiagnosticsPanel
                    diagnostics={trace as unknown as ChatAgentTrace}
                    onClose={() => setShowDiagnosticsPanel(false)}
                />
            )}

            {/* Quick Metrics Bar (for traces) */}
            {trace && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                    <div className={`rounded-lg p-3 ${
                        trace.outcome === 'success' ? 'bg-green-50 dark:bg-green-900/20' :
                        trace.outcome === 'error' ? 'bg-red-50 dark:bg-red-900/20' :
                        'bg-yellow-50 dark:bg-yellow-900/20'
                    }`}>
                        <div className="text-xs text-gray-500 dark:text-gray-400">Outcome</div>
                        <div className={`font-semibold text-sm ${
                            trace.outcome === 'success' ? 'text-green-700 dark:text-green-300' :
                            trace.outcome === 'error' ? 'text-red-700 dark:text-red-300' :
                            'text-yellow-700 dark:text-yellow-300'
                        }`}>{trace.outcome}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Iterations</div>
                        <div className="font-semibold text-sm text-gray-900 dark:text-gray-100">{trace.total_iterations}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Tokens In (cum.)</div>
                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace.total_input_tokens.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Tokens Out (cum.)</div>
                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{trace.total_output_tokens.toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Peak Context</div>
                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{(trace.peak_input_tokens || trace.total_input_tokens).toLocaleString()}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                        <div className="text-xs text-gray-500 dark:text-gray-400">Duration</div>
                        <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{(trace.total_duration_ms / 1000).toFixed(2)}s</div>
                    </div>
                </div>
            )}

            {/* Message Content (collapsible, raw) */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                <button
                    onClick={() => setContentExpanded(!contentExpanded)}
                    className="w-full flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-600/50 transition-colors"
                >
                    {contentExpanded ? (
                        <ChevronDownIcon className="h-4 w-4 text-gray-400" />
                    ) : (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                    )}
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Message Content</h4>
                    {!contentExpanded && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate ml-2">
                            {message.content.slice(0, 80)}{message.content.length > 80 ? '...' : ''}
                        </span>
                    )}
                </button>
                {contentExpanded && (
                    <div className="p-4">
                        <pre className="whitespace-pre-wrap text-sm text-gray-900 dark:text-gray-100 font-sans">
                            {message.content}
                        </pre>
                    </div>
                )}
            </div>

            {/* Tool Calls from trace */}
            {toolCallsWithContext.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-blue-50 dark:bg-blue-900/20">
                        <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            Tool Calls ({toolCallsWithContext.length})
                        </h4>
                    </div>
                    <div className="p-4 space-y-3">
                        {toolCallsWithContext.map(({ toolCall: tc, assistantText }, idx) => (
                            <ToolCallCard
                                key={tc.tool_use_id || idx}
                                toolCall={tc}
                                assistantText={assistantText}
                                isExpanded={expandedTools.has(idx)}
                                onToggle={() => setExpandedTools(prev => {
                                    const next = new Set(prev);
                                    if (next.has(idx)) next.delete(idx);
                                    else next.add(idx);
                                    return next;
                                })}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Suggested Values */}
            {extras.suggested_values && extras.suggested_values.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-cyan-50 dark:bg-cyan-900/20">
                        <h4 className="text-sm font-medium text-cyan-700 dark:text-cyan-300">
                            Suggested Values ({extras.suggested_values.length})
                        </h4>
                    </div>
                    <div className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {extras.suggested_values.map((val, idx) => (
                                <div key={idx} className="px-3 py-2 bg-cyan-50 dark:bg-cyan-900/30 border border-cyan-200 dark:border-cyan-800 rounded-lg">
                                    <div className="text-xs font-medium text-cyan-800 dark:text-cyan-200">{val.label}</div>
                                    <div className="text-sm font-mono text-cyan-600 dark:text-cyan-400">{val.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Suggested Actions */}
            {extras.suggested_actions && extras.suggested_actions.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-pink-50 dark:bg-pink-900/20">
                        <h4 className="text-sm font-medium text-pink-700 dark:text-pink-300">
                            Suggested Actions ({extras.suggested_actions.length})
                        </h4>
                    </div>
                    <div className="p-4">
                        <div className="flex flex-wrap gap-2">
                            {extras.suggested_actions.map((action, idx) => (
                                <div key={idx} className="px-3 py-2 bg-pink-50 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-800 rounded-lg">
                                    <div className="text-xs font-medium text-pink-800 dark:text-pink-200">{action.label}</div>
                                    <div className="text-sm font-mono text-pink-600 dark:text-pink-400">
                                        {action.action}
                                        {action.handler && <span className="text-pink-400 dark:text-pink-500 ml-1">({action.handler})</span>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Payload */}
            {extras.custom_payload && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-orange-50 dark:bg-orange-900/20">
                        <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300">Custom Payload</h4>
                    </div>
                    <div className="p-4">
                        <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto">
                            {JSON.stringify(extras.custom_payload, null, 2)}
                        </pre>
                    </div>
                </div>
            )}

            {/* Tool History Summary (if no trace but has tool_history) */}
            {!trace && extras.tool_history && extras.tool_history.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm overflow-hidden">
                    <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-purple-50 dark:bg-purple-900/20">
                        <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300">
                            Tool Calls ({extras.tool_history.length})
                        </h4>
                    </div>
                    <div className="p-4 space-y-3">
                        {extras.tool_history.map((tool, idx) => (
                            <div key={idx} className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                <div className="font-mono text-sm text-purple-600 dark:text-purple-400 mb-2">
                                    {idx + 1}. {tool.tool_name}
                                </div>
                                <div className="grid grid-cols-2 gap-3 text-xs">
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400 mb-1">Input</div>
                                        <pre className="bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto text-gray-900 dark:text-gray-100">
                                            {JSON.stringify(tool.input, null, 2)}
                                        </pre>
                                    </div>
                                    <div>
                                        <div className="text-gray-500 dark:text-gray-400 mb-1">Output</div>
                                        <pre className="bg-white dark:bg-gray-800 p-2 rounded overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap text-gray-900 dark:text-gray-100">
                                            {tool.output.substring(0, 300)}{tool.output.length > 300 ? '...' : ''}
                                        </pre>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Legacy Diagnostics Info (minimal, just link to trace viewer) */}
            {legacyDiagnostics && !trace && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="text-sm font-medium text-yellow-800 dark:text-yellow-200">Legacy Diagnostics</div>
                            <div className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">
                                Model: {legacyDiagnostics.model} | Max Tokens: {legacyDiagnostics.max_tokens}
                            </div>
                        </div>
                        <button
                            onClick={() => setShowDiagnosticsPanel(true)}
                            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-yellow-700 dark:text-yellow-300 hover:bg-yellow-100 dark:hover:bg-yellow-900/30 rounded-lg transition-colors"
                        >
                            <BugAntIcon className="h-4 w-4" />
                            View Details
                        </button>
                    </div>
                </div>
            )}

            {/* Legacy Diagnostics Panel - wrap in compatible format */}
            {showDiagnosticsPanel && legacyDiagnostics && !trace && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Legacy Diagnostics</h3>
                            <button
                                onClick={() => setShowDiagnosticsPanel(false)}
                                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
                            >
                                <XMarkIcon className="h-5 w-5 text-gray-500" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Model</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{legacyDiagnostics.model}</div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Max Tokens</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{legacyDiagnostics.max_tokens}</div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Temperature</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{legacyDiagnostics.temperature ?? 'N/A'}</div>
                                </div>
                                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Tools</div>
                                    <div className="font-mono text-sm text-gray-900 dark:text-gray-100">{legacyDiagnostics.tools?.length || 0}</div>
                                </div>
                            </div>
                            {legacyDiagnostics.system_prompt && (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">System Prompt</div>
                                    <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                                        {legacyDiagnostics.system_prompt}
                                    </pre>
                                </div>
                            )}
                            {legacyDiagnostics.raw_llm_response && (
                                <div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">Raw LLM Response</div>
                                    <pre className="text-xs text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                                        {legacyDiagnostics.raw_llm_response}
                                    </pre>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
