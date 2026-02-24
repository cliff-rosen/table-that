import { useState, useMemo, useRef, useCallback } from 'react';
import { ChatBubbleLeftRightIcon } from '@heroicons/react/24/solid';
import PubMedLayout from '../../components/pubmed/PubMedLayout';
import PubMedWorkbench, { PubMedWorkbenchRef, PubMedWorkbenchState } from '../../components/pubmed/PubMedWorkbench';
import ChatTray from '../../components/chat/ChatTray';
import QuerySuggestionCard from '../../components/chat/QuerySuggestionCard';
import AIColumnCard from '../../components/chat/AIColumnCard';
import { PayloadHandler } from '../../types/chat';

export default function PubMedAppPage() {
    const [isChatOpen, setIsChatOpen] = useState(false);

    // Ref to PubMedWorkbench for imperative commands
    const pubMedWorkbenchRef = useRef<PubMedWorkbenchRef>(null);

    // State from PubMedWorkbench for chat context
    const [pubMedWorkbenchState, setPubMedWorkbenchState] = useState<PubMedWorkbenchState>({
        query: '',
        startDate: '',
        endDate: '',
        dateType: 'publication',
        totalMatched: 0,
        loadedCount: 0,
        snapshots: [],
        compareMode: false,
        aiColumns: [],
        articles: []
    });

    // Handle state changes from PubMedWorkbench
    const handleStateChange = useCallback((state: PubMedWorkbenchState) => {
        setPubMedWorkbenchState(state);
    }, []);

    // Chat context for the PubMed Tablizer page
    const chatContext = useMemo(() => ({
        current_page: 'tablizer',  // Keep as 'tablizer' for backend compatibility
        query: pubMedWorkbenchState.query,
        start_date: pubMedWorkbenchState.startDate,
        end_date: pubMedWorkbenchState.endDate,
        date_type: pubMedWorkbenchState.dateType,
        total_matched: pubMedWorkbenchState.totalMatched,
        loaded_count: pubMedWorkbenchState.loadedCount,
        snapshots: pubMedWorkbenchState.snapshots,
        compare_mode: pubMedWorkbenchState.compareMode,
        ai_columns: pubMedWorkbenchState.aiColumns,
        articles: pubMedWorkbenchState.articles
    }), [pubMedWorkbenchState]);

    // Handle query suggestion acceptance
    const handleQueryAccept = useCallback((data: {
        query_expression: string;
        start_date?: string | null;
        end_date?: string | null;
        date_type?: 'publication' | 'entry';
    }) => {
        if (pubMedWorkbenchRef.current) {
            pubMedWorkbenchRef.current.setQuery(data.query_expression);
            // Set dates if provided
            if (data.start_date || data.end_date) {
                pubMedWorkbenchRef.current.setDates(
                    data.start_date || '',
                    data.end_date || '',
                    data.date_type || 'publication'
                );
            }
            pubMedWorkbenchRef.current.executeSearch();
        }
    }, []);

    // Handle AI column suggestion acceptance
    const handleAIColumnAccept = useCallback((data: { name: string; criteria: string; type: 'boolean' | 'text' }) => {
        if (pubMedWorkbenchRef.current) {
            pubMedWorkbenchRef.current.addAIColumn(data.name, data.criteria, data.type);
        }
    }, []);

    // Payload handlers for ChatTray
    const payloadHandlers = useMemo<Record<string, PayloadHandler>>(() => ({
        query_suggestion: {
            render: (payload, callbacks) => (
                <QuerySuggestionCard
                    proposal={payload}
                    onAccept={(data) => {
                        handleQueryAccept(data);
                    }}
                    onReject={callbacks.onReject}
                />
            ),
            renderOptions: {
                panelWidth: '550px',
                headerTitle: 'PubMed Query Suggestion',
                headerIcon: '🔍'
            }
        },
        ai_column_suggestion: {
            render: (payload, callbacks) => (
                <AIColumnCard
                    suggestion={payload}
                    onAccept={(data) => {
                        handleAIColumnAccept(data);
                        callbacks.onAccept?.(payload);
                    }}
                    onReject={callbacks.onReject}
                />
            ),
            renderOptions: {
                panelWidth: '500px',
                headerTitle: 'AI Column Suggestion',
                headerIcon: '✨'
            }
        }
    }), [handleQueryAccept, handleAIColumnAccept]);

    return (
        <PubMedLayout hideFooter>
            <div className="flex h-full">
                {/* Chat Tray */}
                <ChatTray
                    initialContext={chatContext}
                    payloadHandlers={payloadHandlers}
                    isOpen={isChatOpen}
                    onOpenChange={setIsChatOpen}
                />

                {/* Main Content - scrollable, full width for table with many columns */}
                <div className="flex-1 min-w-0 overflow-y-auto">
                    <div className="px-4 sm:px-6 lg:px-8 py-6">
                        <PubMedWorkbench
                            ref={pubMedWorkbenchRef}
                            onStateChange={handleStateChange}
                        />
                    </div>
                </div>

                {/* Floating Chat Button - visible when chat is closed */}
                {!isChatOpen && (
                    <button
                        onClick={() => setIsChatOpen(true)}
                        className="fixed bottom-6 left-6 p-4 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg transition-all hover:scale-105 z-50"
                        aria-label="Open chat assistant"
                    >
                        <ChatBubbleLeftRightIcon className="h-6 w-6" />
                    </button>
                )}
            </div>
        </PubMedLayout>
    );
}
