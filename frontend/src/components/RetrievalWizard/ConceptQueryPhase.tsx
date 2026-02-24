import { useState } from 'react';
import { SparklesIcon, ArrowPathIcon } from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { Concept, InformationSource, SourceQuery } from '../../types';

interface ConceptQueryPhaseProps {
    streamId: number;
    concepts: Concept[];
    sources: InformationSource[];
    onConceptsChange: (concepts: Concept[]) => void;
    onComplete: (completed: boolean) => void;
}

export default function ConceptQueryPhase({
    streamId,
    concepts,
    sources,
    onConceptsChange,
    onComplete
}: ConceptQueryPhaseProps) {
    const [expandedConcepts, setExpandedConcepts] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    // Filter to only show PubMed and Google Scholar
    const filteredSources = sources.filter(
        source => source.source_id === 'pubmed' || source.source_id === 'google_scholar'
    );

    const toggleConcept = (conceptId: string) => {
        const newExpanded = new Set(expandedConcepts);
        if (newExpanded.has(conceptId)) {
            newExpanded.delete(conceptId);
        } else {
            newExpanded.add(conceptId);
        }
        setExpandedConcepts(newExpanded);
    };

    const handleGenerateQuery = async (conceptId: string, sourceId: string) => {
        const loadingKey = `${conceptId}-${sourceId}`;
        try {
            setLoading(prev => ({ ...prev, [loadingKey]: true }));
            setError(null);

            // Find the concept
            const concept = concepts.find(c => c.concept_id === conceptId);
            if (!concept) {
                throw new Error('Concept not found');
            }

            const result = await researchStreamApi.generateConceptQuery(streamId, concept, sourceId);

            // Update concept with new query
            const updatedConcepts = concepts.map(c => {
                if (c.concept_id === conceptId) {
                    const newSourceQuery: SourceQuery = {
                        query_expression: result.query_expression,
                        enabled: true
                    };

                    return {
                        ...c,
                        source_queries: {
                            ...c.source_queries,
                            [sourceId]: newSourceQuery
                        }
                    };
                }
                return c;
            });

            onConceptsChange(updatedConcepts);

            // Check if all concepts have at least one query
            const allHaveQueries = updatedConcepts.every(c =>
                c.source_queries && Object.keys(c.source_queries).length > 0
            );
            onComplete(allHaveQueries);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate query');
        } finally {
            setLoading(prev => ({ ...prev, [loadingKey]: false }));
        }
    };

    const conceptsWithoutQueries = concepts.filter(c =>
        !c.source_queries || Object.keys(c.source_queries).length === 0
    ).length;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0">
                        <SparklesIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                            Configure Queries for Concepts
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Generate source-specific queries for each concept. Each query will use the concept's
                            entity pattern and vocabulary expansion to retrieve relevant articles.
                        </p>
                        <div className="mt-4 flex items-center gap-4">
                            <div className="text-sm">
                                <span className="text-gray-600 dark:text-gray-400">Progress: </span>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    {concepts.length - conceptsWithoutQueries}/{concepts.length} concepts configured
                                </span>
                            </div>
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
                const hasQueries = concept.source_queries && Object.keys(concept.source_queries).length > 0;

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
                                        {hasQueries && (
                                            <span className="px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded text-xs">
                                                {Object.keys(concept.source_queries).length} {Object.keys(concept.source_queries).length === 1 ? 'query' : 'queries'}
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

                        {/* Concept Query Config */}
                        {isExpanded && (
                            <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900">
                                <div className="space-y-4">
                                    {/* Entity Pattern Display */}
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                            Entity Pattern
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {concept.entity_pattern.map((entityId, i) => (
                                                <span
                                                    key={i}
                                                    className="px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded text-sm"
                                                >
                                                    {entityId}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Generate Queries for Each Source */}
                                    <div>
                                        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                                            Generate Queries
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {filteredSources.map(source => {
                                                const loadingKey = `${concept.concept_id}-${source.source_id}`;
                                                const isLoading = loading[loadingKey];
                                                const existingQuery = concept.source_queries?.[source.source_id];

                                                return (
                                                    <div
                                                        key={source.source_id}
                                                        className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                                                    >
                                                        <div className="flex items-center justify-between mb-3">
                                                            <h5 className="font-medium text-gray-900 dark:text-white">
                                                                {source.name}
                                                            </h5>
                                                            <button
                                                                onClick={() => handleGenerateQuery(concept.concept_id, source.source_id)}
                                                                disabled={isLoading}
                                                                className="inline-flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                                            >
                                                                {isLoading ? (
                                                                    <>
                                                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                                                        Generating...
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <SparklesIcon className="h-4 w-4" />
                                                                        {existingQuery ? 'Regenerate' : 'Generate'}
                                                                    </>
                                                                )}
                                                            </button>
                                                        </div>

                                                        {existingQuery && (
                                                            <div className="space-y-2">
                                                                <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded font-mono text-xs text-gray-900 dark:text-gray-100">
                                                                    {existingQuery.query_expression}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })}

            {conceptsWithoutQueries > 0 && (
                <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                    <p className="text-yellow-800 dark:text-yellow-200">
                        {conceptsWithoutQueries} {conceptsWithoutQueries === 1 ? 'concept needs' : 'concepts need'} queries configured.
                        Generate at least one query for each concept to continue.
                    </p>
                </div>
            )}
        </div>
    );
}
