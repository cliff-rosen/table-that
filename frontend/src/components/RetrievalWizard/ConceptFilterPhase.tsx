import { useState } from 'react';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { Concept, SemanticFilter } from '../../types';

interface ConceptFilterPhaseProps {
    streamId: number;
    concepts: Concept[];
    onConceptsChange: (concepts: Concept[]) => void;
    onComplete: (completed: boolean) => void;
}

export default function ConceptFilterPhase({
    streamId,
    concepts,
    onConceptsChange,
    onComplete
}: ConceptFilterPhaseProps) {
    const [expandedConcepts, setExpandedConcepts] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    const toggleConcept = (conceptId: string) => {
        const newExpanded = new Set(expandedConcepts);
        if (newExpanded.has(conceptId)) {
            newExpanded.delete(conceptId);
        } else {
            newExpanded.add(conceptId);
        }
        setExpandedConcepts(newExpanded);
    };

    const handleGenerateFilter = async (conceptId: string) => {
        try {
            setLoading(prev => ({ ...prev, [conceptId]: true }));
            setError(null);

            // Find the concept
            const concept = concepts.find(c => c.concept_id === conceptId);
            if (!concept) {
                throw new Error('Concept not found');
            }

            const result = await researchStreamApi.generateConceptFilter(streamId, concept);

            // Update concept with new filter
            const updatedConcepts = concepts.map(c => {
                if (c.concept_id === conceptId) {
                    const newFilter: SemanticFilter = {
                        enabled: false, // User can enable manually
                        criteria: result.criteria,
                        threshold: result.threshold
                    };

                    return {
                        ...c,
                        semantic_filter: newFilter
                    };
                }
                return c;
            });

            onConceptsChange(updatedConcepts);
            onComplete(true); // Filter phase is optional, always mark complete

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate filter');
        } finally {
            setLoading(prev => ({ ...prev, [conceptId]: false }));
        }
    };

    const handleToggleFilter = (conceptId: string) => {
        const updatedConcepts = concepts.map(c => {
            if (c.concept_id === conceptId) {
                return {
                    ...c,
                    semantic_filter: {
                        ...c.semantic_filter,
                        enabled: !c.semantic_filter.enabled
                    }
                };
            }
            return c;
        });

        onConceptsChange(updatedConcepts);
    };

    const handleUpdateThreshold = (conceptId: string, threshold: number) => {
        const updatedConcepts = concepts.map(c => {
            if (c.concept_id === conceptId) {
                return {
                    ...c,
                    semantic_filter: {
                        ...c.semantic_filter,
                        threshold
                    }
                };
            }
            return c;
        });

        onConceptsChange(updatedConcepts);
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                        <SparklesIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Configure Semantic Filters (Optional)
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Semantic filters use AI to filter retrieved articles based on relevance criteria.
                            This is optional but can help improve precision for broad concepts.
                        </p>
                        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded">
                            <p className="text-sm text-blue-800 dark:text-blue-200">
                                <strong>Note:</strong> Semantic filtering is optional. You can skip this step
                                and rely on query precision alone, or enable filters for specific concepts that need additional refinement.
                            </p>
                        </div>
                    </div>
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}
            </div>

            {/* Concepts List */}
            {concepts.map(concept => {
                const isExpanded = expandedConcepts.has(concept.concept_id);
                const hasFilter = concept.semantic_filter?.criteria;
                const isLoading = loading[concept.concept_id];

                return (
                    <div
                        key={concept.concept_id}
                        className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden"
                    >
                        {/* Concept Header */}
                        <button
                            onClick={() => toggleConcept(concept.concept_id)}
                            className="w-full p-6 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                        >
                            <div className="flex items-center justify-between">
                                <div className="flex-1">
                                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                                        {concept.name}
                                        {concept.semantic_filter?.enabled && (
                                            <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded text-xs">
                                                Filter enabled
                                            </span>
                                        )}
                                        {hasFilter && !concept.semantic_filter?.enabled && (
                                            <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                                                Filter configured
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                        {concept.rationale}
                                    </p>
                                </div>
                                <svg
                                    className={`h-5 w-5 text-gray-400 transition-transform ${isExpanded ? 'transform rotate-180' : ''}`}
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    stroke="currentColor"
                                >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                            </div>
                        </button>

                        {/* Filter Config */}
                        {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900">
                                <div className="space-y-4">
                                    {/* Generate Filter Button */}
                                    <div className="flex items-center justify-between">
                                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                            Semantic Filter Configuration
                                        </h4>
                                        <button
                                            onClick={() => handleGenerateFilter(concept.concept_id)}
                                            disabled={isLoading}
                                            className="inline-flex items-center gap-2 px-4 py-2 text-sm bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                        >
                                            {isLoading ? (
                                                <>
                                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                    Generating...
                                                </>
                                            ) : (
                                                <>
                                                    <SparklesIcon className="h-4 w-4" />
                                                    {hasFilter ? 'Regenerate Filter' : 'Generate Filter'}
                                                </>
                                            )}
                                        </button>
                                    </div>

                                    {/* Filter Criteria */}
                                    {hasFilter && (
                                        <div className="space-y-4">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Filter Criteria
                                                </label>
                                                <div className="p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
                                                    <p className="text-sm text-gray-700 dark:text-gray-300">
                                                        {concept.semantic_filter.criteria}
                                                    </p>
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                                    Threshold: {concept.semantic_filter.threshold.toFixed(2)}
                                                </label>
                                                <input
                                                    type="range"
                                                    min="0.5"
                                                    max="0.9"
                                                    step="0.05"
                                                    value={concept.semantic_filter.threshold}
                                                    onChange={(e) => handleUpdateThreshold(concept.concept_id, parseFloat(e.target.value))}
                                                    className="w-full"
                                                />
                                                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
                                                    <span>Permissive (0.5)</span>
                                                    <span>Strict (0.9)</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center">
                                                <input
                                                    type="checkbox"
                                                    id={`filter-enabled-${concept.concept_id}`}
                                                    checked={concept.semantic_filter.enabled}
                                                    onChange={() => handleToggleFilter(concept.concept_id)}
                                                    className="h-4 w-4 text-purple-600 focus:ring-purple-500 border-gray-300 dark:border-gray-600 rounded"
                                                />
                                                <label
                                                    htmlFor={`filter-enabled-${concept.concept_id}`}
                                                    className="ml-2 text-sm text-gray-700 dark:text-gray-300"
                                                >
                                                    Enable semantic filtering for this concept
                                                </label>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {/* Info Box */}
            <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    You can skip this phase and continue to validation if you don't need semantic filtering.
                    Filters can be added or modified later.
                </p>
            </div>
        </div>
    );
}
