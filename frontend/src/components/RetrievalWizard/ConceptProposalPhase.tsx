import { useState } from 'react';
import { SparklesIcon, ArrowPathIcon, CheckCircleIcon, InformationCircleIcon, ArrowRightIcon } from '@heroicons/react/24/outline';
import { researchStreamApi } from '../../lib/api/researchStreamApi';
import { Concept, SemanticSpace, RelationshipEdge, ConceptEntity } from '../../types';

// Helper component to visualize entity connections from relationship edges
function EntityConnectionVisualization({
    concept,
    semanticSpace,
    phase1Entities
}: {
    concept: Concept;
    semanticSpace: SemanticSpace;
    phase1Entities: ConceptEntity[];
}) {
    const getEntityName = (entityId: string) => {
        // First try to find in phase1 entities (concept-generated entities)
        const phase1Entity = phase1Entities?.find(e => e.entity_id === entityId);
        if (phase1Entity) return phase1Entity.name;

        // Fallback to semantic space entities
        const semanticEntity = semanticSpace.entities.find(e => e.entity_id === entityId);
        return semanticEntity ? semanticEntity.name : entityId;
    };

    // If we have relationship_edges, use them for precise visualization
    if (concept.relationship_edges && concept.relationship_edges.length > 0) {
        // Build a simple linear visualization from the edges
        // For complex graphs, we just show the edges as individual connections
        return (
            <div className="mt-2 space-y-1">
                {concept.relationship_edges.map((edge: RelationshipEdge, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 rounded font-medium">
                            {getEntityName(edge.from_entity_id)}
                        </span>
                        <div className="flex items-center gap-1">
                            <ArrowRightIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                            <span className="text-gray-600 dark:text-gray-400 italic text-xs">
                                {edge.relation_type}
                            </span>
                            <ArrowRightIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                        </div>
                        <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 rounded font-medium">
                            {getEntityName(edge.to_entity_id)}
                        </span>
                    </div>
                ))}
            </div>
        );
    }

    // Fallback to simple linear visualization for backward compatibility
    if (concept.entity_pattern.length === 2) {
        return (
            <div className="flex items-center gap-2 mt-2 text-xs">
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 rounded font-medium">
                    {getEntityName(concept.entity_pattern[0])}
                </span>
                <ArrowRightIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 rounded font-medium">
                    {getEntityName(concept.entity_pattern[1])}
                </span>
            </div>
        );
    }

    if (concept.entity_pattern.length === 3) {
        return (
            <div className="flex items-center gap-2 mt-2 text-xs flex-wrap">
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 rounded font-medium">
                    {getEntityName(concept.entity_pattern[0])}
                </span>
                <ArrowRightIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 rounded font-medium">
                    {getEntityName(concept.entity_pattern[1])}
                </span>
                <ArrowRightIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                <span className="px-2 py-1 bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100 rounded font-medium">
                    {getEntityName(concept.entity_pattern[2])}
                </span>
            </div>
        );
    }

    return null;
}

interface ConceptProposalPhaseProps {
    streamId: number;
    semanticSpace: SemanticSpace;
    concepts: Concept[];
    onConceptsChange: (concepts: Concept[]) => void;
    onComplete: (completed: boolean) => void;
}

export default function ConceptProposalPhase({
    streamId,
    semanticSpace,
    concepts,
    onConceptsChange,
    onComplete
}: ConceptProposalPhaseProps) {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [analysis, setAnalysis] = useState<any>(null);
    const [phase1Entities, setPhase1Entities] = useState<ConceptEntity[]>([]);
    const [reasoning, setReasoning] = useState<string>('');
    const [coverageCheck, setCoverageCheck] = useState<any>(null);

    const handleProposeConcepts = async () => {
        try {
            setLoading(true);
            setError(null);

            const response = await researchStreamApi.proposeRetrievalConcepts(streamId);

            onConceptsChange(response.proposed_concepts);
            setAnalysis(response.analysis);
            setPhase1Entities(response.analysis?.entities || []);
            setReasoning(response.reasoning);
            setCoverageCheck(response.coverage_check);
            onComplete(response.proposed_concepts.length > 0);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to propose concepts');
            onComplete(false);
        } finally {
            setLoading(false);
        }
    };

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
                            Propose Retrieval Concepts
                        </h2>
                        <p className="text-gray-600 dark:text-gray-400">
                            Generate entity-relationship patterns (concepts) that cover your topics.
                            Each concept represents a searchable pattern with many-to-many topic coverage.
                        </p>
                    </div>
                </div>

                {/* Semantic Space Summary */}
                <div className="mt-6 grid grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Topics</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {semanticSpace.topics.length}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Entities</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {semanticSpace.entities.length}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-500 dark:text-gray-400">Relationships</div>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">
                            {semanticSpace.relationships?.length || 0}
                        </div>
                    </div>
                </div>

                {/* Generate Button */}
                <div className="mt-6">
                    <button
                        onClick={handleProposeConcepts}
                        disabled={loading}
                        className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                    >
                        {loading ? (
                            <>
                                <ArrowPathIcon className="h-5 w-5 animate-spin" />
                                Analyzing semantic space...
                            </>
                        ) : (
                            <>
                                <SparklesIcon className="h-5 w-5" />
                                Generate Concept Proposals
                            </>
                        )}
                    </button>
                </div>

                {error && (
                    <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <p className="text-red-800 dark:text-red-200">{error}</p>
                    </div>
                )}
            </div>

            {/* Phase 1: Entity Definitions */}
            {phase1Entities.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Phase 1: Defined Entities ({phase1Entities.length})
                    </h3>
                    <div className="space-y-3">
                        {phase1Entities.map((entity, idx) => (
                            <div
                                key={idx}
                                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                            >
                                <div className="flex items-start gap-3">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h4 className="font-semibold text-gray-900 dark:text-white">
                                                {entity.name}
                                            </h4>
                                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                                                {entity.entity_type}
                                            </span>
                                            {entity.semantic_space_ref && (
                                                <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded text-xs">
                                                    ↔ {entity.semantic_space_ref}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                                            {entity.rationale}
                                        </p>
                                        <div className="flex flex-wrap gap-1">
                                            {entity.canonical_forms.map((form, i) => (
                                                <span
                                                    key={i}
                                                    className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded text-xs font-mono"
                                                >
                                                    {form}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {analysis?.coverage_strategy && (
                        <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded">
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Coverage Strategy
                            </h4>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {analysis.coverage_strategy}
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Overall Reasoning */}
            {reasoning && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6">
                    <div className="flex items-start gap-3">
                        <InformationCircleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                Strategy
                            </h3>
                            <p className="text-gray-700 dark:text-gray-300 whitespace-pre-line">
                                {reasoning}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Coverage Check */}
            {coverageCheck && (
                <div className={`border rounded-lg p-6 ${
                    coverageCheck.is_complete
                        ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                }`}>
                    <div className="flex items-start gap-3">
                        <CheckCircleIcon className={`h-6 w-6 flex-shrink-0 mt-0.5 ${
                            coverageCheck.is_complete ? 'text-green-600' : 'text-yellow-600'
                        }`} />
                        <div className="flex-1">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                                Coverage: {coverageCheck.coverage_percentage.toFixed(1)}%
                            </h3>
                            <div className="grid grid-cols-3 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Covered Topics:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {coverageCheck.covered_topics.length}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Uncovered:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {coverageCheck.uncovered_topics.length}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-600 dark:text-gray-400">Concepts per Topic:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-white">
                                        {coverageCheck.concepts_per_topic?.avg.toFixed(1) || 'N/A'}
                                    </span>
                                </div>
                            </div>
                            {coverageCheck.uncovered_topics.length > 0 && (
                                <div className="mt-3">
                                    <span className="text-gray-600 dark:text-gray-400 text-sm">
                                        Uncovered topics: {coverageCheck.uncovered_topics.join(', ')}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Proposed Concepts */}
            {concepts.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                        Proposed Concepts ({concepts.length})
                    </h3>
                    <div className="space-y-4">
                        {concepts.map((concept) => (
                            <div
                                key={concept.concept_id}
                                className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-300 dark:hover:border-blue-600 transition-colors"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div>
                                        <h4 className="font-semibold text-gray-900 dark:text-white">
                                            {concept.name}
                                        </h4>
                                        <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                            {concept.rationale}
                                        </p>
                                    </div>
                                    <span className="px-3 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full text-sm">
                                        {concept.volume_status}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-4 text-sm">
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">
                                            Entities ({concept.entity_pattern.length}):
                                        </span>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {concept.entity_pattern.map((entityId, i) => {
                                                // First try phase1 entities, fallback to semantic space
                                                const phase1Entity = phase1Entities.find(e => e.entity_id === entityId);
                                                const semanticEntity = semanticSpace.entities.find(e => e.entity_id === entityId);
                                                const entityName = phase1Entity?.name || semanticEntity?.name || entityId;

                                                return (
                                                    <span
                                                        key={i}
                                                        className="px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200 rounded text-xs"
                                                        title={entityName}
                                                    >
                                                        {entityName}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                    <div>
                                        <span className="text-gray-600 dark:text-gray-400">
                                            Covers Topics ({concept.covered_topics.length}):
                                        </span>
                                        <div className="mt-1 flex flex-wrap gap-1">
                                            {concept.covered_topics.map((topicId, i) => {
                                                const topic = semanticSpace.topics.find(t => t.topic_id === topicId);
                                                return (
                                                    <span
                                                        key={i}
                                                        className="px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 rounded text-xs"
                                                        title={topic?.name || topicId}
                                                    >
                                                        {topic?.name || topicId}
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {(concept.relationship_description || concept.relationship_pattern) && (
                                    <div className="mt-3">
                                        <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                                            Relationship Graph:
                                        </div>
                                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded">
                                            <div className="text-sm text-blue-900 dark:text-blue-100 mb-2">
                                                {concept.relationship_description || concept.relationship_pattern}
                                            </div>
                                            <EntityConnectionVisualization
                                                concept={concept}
                                                semanticSpace={semanticSpace}
                                                phase1Entities={phase1Entities}
                                            />
                                            {concept.relationship_edges && concept.relationship_edges.length > 1 && (
                                                <div className="text-xs text-blue-700 dark:text-blue-300 mt-2 italic">
                                                    {concept.relationship_edges.length} edges defining complete graph structure
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
