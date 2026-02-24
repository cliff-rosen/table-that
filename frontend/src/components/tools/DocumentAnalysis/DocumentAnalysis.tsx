import { useState, useRef, useCallback, useEffect } from 'react';
import { DocumentTextIcon, ShareIcon, Squares2X2Icon, XMarkIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { DocumentInput } from './DocumentInput';
import { TreeView } from './TreeView';
import { GraphView } from './GraphView';
import { SplitView } from './SplitView';
import { documentAnalysisApi } from '../../../lib/api/documentAnalysisApi';
import {
    DocumentAnalysisResult,
    ViewMode,
    AnalysisStreamMessage
} from '../../../types/document_analysis';

interface ProgressStep {
    id: string;
    label: string;
    status: 'pending' | 'active' | 'complete' | 'error';
    result?: string;
}

export default function DocumentAnalysis() {
    const [documentText, setDocumentText] = useState('');
    const [documentTitle, setDocumentTitle] = useState('');
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [results, setResults] = useState<DocumentAnalysisResult | null>(null);
    const [viewMode, setViewMode] = useState<ViewMode>('tree');
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

    // Streaming progress state
    const [progressSteps, setProgressSteps] = useState<ProgressStep[]>([]);
    const [currentMessage, setCurrentMessage] = useState<string>('');
    const abortControllerRef = useRef<AbortController | null>(null);

    // Input section collapse state
    const [isInputCollapsed, setIsInputCollapsed] = useState(false);

    // Auto-collapse input when results appear
    useEffect(() => {
        if (results) {
            setIsInputCollapsed(true);
        }
    }, [results]);

    const handleStreamMessage = useCallback((message: AnalysisStreamMessage) => {
        setCurrentMessage(message.message);

        switch (message.type) {
            case 'status':
                // Initial status - set up progress steps
                if (message.data?.options) {
                    const steps: ProgressStep[] = [];
                    if (message.data.options.hierarchical_summary) {
                        steps.push({ id: 'summary', label: 'Hierarchical Summary', status: 'pending' });
                    }
                    if (message.data.options.entity_extraction) {
                        steps.push({ id: 'entities', label: 'Entity Extraction', status: 'pending' });
                    }
                    if (message.data.options.claim_extraction) {
                        steps.push({ id: 'claims', label: 'Claim Extraction', status: 'pending' });
                    }
                    setProgressSteps(steps);
                }
                break;

            case 'progress':
                // Phase started
                if (message.data?.phase) {
                    const phaseId = message.data.phase === 'hierarchical_summary' ? 'summary' :
                                   message.data.phase === 'entity_extraction' ? 'entities' : 'claims';
                    setProgressSteps(prev => prev.map(step =>
                        step.id === phaseId ? { ...step, status: 'active' } : step
                    ));
                }
                break;

            case 'summary':
                // Summary complete
                setProgressSteps(prev => prev.map(step =>
                    step.id === 'summary' ? {
                        ...step,
                        status: 'complete',
                        result: `${message.data?.result?.sections?.length || 0} sections, ${message.data?.result?.total_key_points || 0} key points`
                    } : step
                ));
                break;

            case 'entities':
                // Entities complete
                setProgressSteps(prev => prev.map(step =>
                    step.id === 'entities' ? {
                        ...step,
                        status: 'complete',
                        result: `${message.data?.result?.length || 0} entities`
                    } : step
                ));
                break;

            case 'claims':
                // Claims complete
                setProgressSteps(prev => prev.map(step =>
                    step.id === 'claims' ? {
                        ...step,
                        status: 'complete',
                        result: `${message.data?.result?.length || 0} claims`
                    } : step
                ));
                break;

            case 'error':
                setProgressSteps(prev => prev.map(step =>
                    step.status === 'active' ? { ...step, status: 'error' } : step
                ));
                break;
        }
    }, []);

    const handleAnalyze = async () => {
        if (!documentText.trim() || documentText.length < 50) {
            setError('Please enter at least 50 characters of document text');
            return;
        }

        // Cancel any existing request
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }

        setIsAnalyzing(true);
        setError(null);
        setResults(null);
        setSelectedNodeId(null);
        setProgressSteps([]);
        setCurrentMessage('Starting analysis...');

        // Create new abort controller
        abortControllerRef.current = new AbortController();

        try {
            const result = await documentAnalysisApi.analyzeDocumentStream(
                {
                    document_text: documentText,
                    document_title: documentTitle || undefined,
                    analysis_options: {
                        hierarchical_summary: true,
                        entity_extraction: true,
                        claim_extraction: true
                    }
                },
                handleStreamMessage,
                abortControllerRef.current.signal
            );

            if (result) {
                setResults(result);
                setSelectedNodeId('executive');
            }
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') {
                setError('Analysis cancelled');
            } else {
                setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
            }
        } finally {
            setIsAnalyzing(false);
            abortControllerRef.current = null;
        }
    };

    const handleCancel = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const handleNodeSelect = (nodeId: string) => {
        setSelectedNodeId(nodeId);
    };

    const viewModes = [
        { id: 'tree' as ViewMode, label: 'Tree', icon: DocumentTextIcon },
        { id: 'graph' as ViewMode, label: 'Graph', icon: ShareIcon },
        { id: 'split' as ViewMode, label: 'Split', icon: Squares2X2Icon }
    ];

    return (
        <div className="space-y-6">
            {/* Collapsible Input Section */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                <button
                    onClick={() => setIsInputCollapsed(!isInputCollapsed)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 dark:hover:bg-gray-750 rounded-t-lg transition-colors"
                >
                    <div className="flex items-center gap-2">
                        {isInputCollapsed ? (
                            <ChevronRightIcon className="h-5 w-5 text-gray-500" />
                        ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                        )}
                        <span className="font-medium text-gray-900 dark:text-white">
                            Document Input
                        </span>
                        {isInputCollapsed && documentTitle && (
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                                — {documentTitle}
                            </span>
                        )}
                        {isInputCollapsed && !documentTitle && documentText && (
                            <span className="text-sm text-gray-500 dark:text-gray-400 ml-2">
                                — {documentText.length.toLocaleString()} characters
                            </span>
                        )}
                    </div>
                    {isInputCollapsed && results && (
                        <span className="text-xs text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
                            Analysis Complete
                        </span>
                    )}
                </button>

                {!isInputCollapsed && (
                    <div className="p-4 pt-0">
                        <DocumentInput
                            documentText={documentText}
                            documentTitle={documentTitle}
                            onTextChange={setDocumentText}
                            onTitleChange={setDocumentTitle}
                            onAnalyze={handleAnalyze}
                            isAnalyzing={isAnalyzing}
                            error={error}
                        />
                    </div>
                )}
            </div>

            {/* Progress Section */}
            {isAnalyzing && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                            Analyzing Document...
                        </h3>
                        <button
                            onClick={handleCancel}
                            className="flex items-center gap-1 px-3 py-1 text-sm text-red-600 hover:text-red-700 dark:text-red-400"
                        >
                            <XMarkIcon className="h-4 w-4" />
                            Cancel
                        </button>
                    </div>

                    {/* Current status message */}
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                        {currentMessage}
                    </p>

                    {/* Progress steps */}
                    <div className="space-y-3">
                        {progressSteps.map((step) => (
                            <div key={step.id} className="flex items-center gap-3">
                                {/* Status indicator */}
                                <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center ${
                                    step.status === 'pending' ? 'bg-gray-200 dark:bg-gray-700' :
                                    step.status === 'active' ? 'bg-blue-500 animate-pulse' :
                                    step.status === 'complete' ? 'bg-green-500' :
                                    'bg-red-500'
                                }`}>
                                    {step.status === 'active' && (
                                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    )}
                                    {step.status === 'complete' && (
                                        <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                    {step.status === 'error' && (
                                        <XMarkIcon className="h-4 w-4 text-white" />
                                    )}
                                </div>

                                {/* Step label and result */}
                                <div className="flex-1">
                                    <span className={`text-sm font-medium ${
                                        step.status === 'pending' ? 'text-gray-400 dark:text-gray-500' :
                                        step.status === 'active' ? 'text-blue-600 dark:text-blue-400' :
                                        step.status === 'complete' ? 'text-green-600 dark:text-green-400' :
                                        'text-red-600 dark:text-red-400'
                                    }`}>
                                        {step.label}
                                    </span>
                                    {step.result && (
                                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                            ({step.result})
                                        </span>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Results Section */}
            {results && (
                <div className="space-y-4">
                    {/* Summary Stats */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
                        <div className="grid grid-cols-4 gap-4">
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {results.hierarchical_summary.sections.length}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Sections</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                    {results.hierarchical_summary.total_key_points}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Key Points</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                                    {results.entities.length}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Entities</div>
                            </div>
                            <div className="text-center">
                                <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                                    {results.claims.length}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">Claims</div>
                            </div>
                        </div>
                    </div>

                    {/* View Mode Toggle */}
                    <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-4">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            View:
                        </span>
                        <div className="flex gap-1">
                            {viewModes.map(({ id, label, icon: Icon }) => (
                                <button
                                    key={id}
                                    onClick={() => setViewMode(id)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                                        viewMode === id
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                                    }`}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Visualization Area */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow" style={{ minHeight: '500px' }}>
                        {viewMode === 'tree' && (
                            <TreeView
                                results={results}
                                onNodeSelect={handleNodeSelect}
                                selectedNodeId={selectedNodeId}
                            />
                        )}
                        {viewMode === 'graph' && (
                            <GraphView
                                results={results}
                                onNodeSelect={handleNodeSelect}
                                selectedNodeId={selectedNodeId}
                            />
                        )}
                        {viewMode === 'split' && (
                            <SplitView
                                results={results}
                                originalText={documentText}
                                onNodeSelect={handleNodeSelect}
                                selectedNodeId={selectedNodeId}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
