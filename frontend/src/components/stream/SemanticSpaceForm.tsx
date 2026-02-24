import { useState } from 'react';
import { PlusIcon, TrashIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
    SemanticSpace,
    Topic,
    Entity,
    Relationship,
    ImportanceLevel,
    EntityType,
    RelationshipType,
    RelationshipStrength
} from '../../types';

interface SemanticSpaceFormProps {
    semanticSpace: SemanticSpace | undefined;
    onChange: (semanticSpace: SemanticSpace) => void;
}

export default function SemanticSpaceForm({ semanticSpace, onChange }: SemanticSpaceFormProps) {
    // Collapse state for major sections
    const [topicsExpanded, setTopicsExpanded] = useState(true);
    const [entitiesExpanded, setEntitiesExpanded] = useState(false);
    const [relationshipsExpanded, setRelationshipsExpanded] = useState(false);

    // Collapse state for individual items within sections
    const [expandedTopics, setExpandedTopics] = useState<Set<number>>(new Set());
    const [expandedEntities, setExpandedEntities] = useState<Set<number>>(new Set());
    const [expandedRelationships, setExpandedRelationships] = useState<Set<number>>(new Set());

    const toggleTopicExpanded = (index: number) => {
        setExpandedTopics(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const toggleEntityExpanded = (index: number) => {
        setExpandedEntities(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    const toggleRelationshipExpanded = (index: number) => {
        setExpandedRelationships(prev => {
            const next = new Set(prev);
            if (next.has(index)) {
                next.delete(index);
            } else {
                next.add(index);
            }
            return next;
        });
    };

    if (!semanticSpace) return null;

    const updateField = (path: string[], value: any) => {
        const updated = { ...semanticSpace };
        let current: any = updated;

        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = value;

        onChange(updated);
    };

    const addTopic = () => {
        const newTopic: Topic = {
            topic_id: `topic_${Date.now()}`,
            name: '',
            description: '',
            importance: ImportanceLevel.IMPORTANT,
            rationale: ''
        };
        updateField(['topics'], [...semanticSpace.topics, newTopic]);
    };

    const removeTopic = (index: number) => {
        updateField(['topics'], semanticSpace.topics.filter((_, i) => i !== index));
    };

    const updateTopic = (index: number, field: keyof Topic, value: any) => {
        const updated = [...semanticSpace.topics];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['topics'], updated);
    };

    const addEntity = () => {
        const newEntity: Entity = {
            entity_id: `entity_${Date.now()}`,
            entity_type: EntityType.DISEASE,
            name: '',
            canonical_forms: [],
            context: ''
        };
        updateField(['entities'], [...semanticSpace.entities, newEntity]);
    };

    const removeEntity = (index: number) => {
        updateField(['entities'], semanticSpace.entities.filter((_, i) => i !== index));
    };

    const updateEntity = (index: number, field: keyof Entity, value: any) => {
        const updated = [...semanticSpace.entities];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['entities'], updated);
    };

    // Relationship handlers
    const addRelationship = () => {
        const newRelationship: Relationship = {
            relationship_id: `rel_${Date.now()}`,
            type: RelationshipType.CORRELATIONAL,
            subject: '',
            object: '',
            description: '',
            strength: 'moderate'
        };
        updateField(['relationships'], [...semanticSpace.relationships, newRelationship]);
    };

    const removeRelationship = (index: number) => {
        updateField(['relationships'], semanticSpace.relationships.filter((_, i) => i !== index));
    };

    const updateRelationship = (index: number, field: keyof Relationship, value: any) => {
        const updated = [...semanticSpace.relationships];
        updated[index] = { ...updated[index], [field]: value };
        updateField(['relationships'], updated);
    };

    return (
        <div className="space-y-8">
            {/* Domain Section */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Domain Definition
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                    Define the high-level information domain this stream covers.
                </p>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Domain Name
                    </label>
                    <input
                        type="text"
                        placeholder="e.g., Asbestos Litigation Science"
                        value={semanticSpace.domain.name}
                        onChange={(e) => updateField(['domain', 'name'], e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Domain Description
                    </label>
                    <textarea
                        placeholder="High-level description of the domain"
                        rows={3}
                        value={semanticSpace.domain.description}
                        onChange={(e) => updateField(['domain', 'description'], e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    />
                </div>
            </div>

            {/* Topics Section - Collapsible */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setTopicsExpanded(!topicsExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {topicsExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Topics {semanticSpace.topics.length > 0 && `(${semanticSpace.topics.length})`}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Core topics that define what information matters
                            </p>
                        </div>
                    </button>
                    {topicsExpanded && (
                        <button
                            type="button"
                            onClick={addTopic}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Topic
                        </button>
                    )}
                </div>

                {topicsExpanded && (
                    <div className="space-y-2">
                        {semanticSpace.topics.length === 0 && (
                            <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                                No topics defined yet. Click "Add Topic" to get started.
                            </div>
                        )}

                        {semanticSpace.topics.map((topic, index) => {
                            const isExpanded = expandedTopics.has(index);
                            const hasDescription = topic.description?.trim();

                            return (
                                <div key={topic.topic_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                                    {/* Topic header row */}
                                    <div className="flex items-center gap-3">
                                        {/* Expand/collapse button */}
                                        <button
                                            type="button"
                                            onClick={() => toggleTopicExpanded(index)}
                                            className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                            {isExpanded ? (
                                                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                                            ) : (
                                                <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                                            )}
                                        </button>

                                        {/* Topic name input */}
                                        <input
                                            type="text"
                                            placeholder="Topic name"
                                            value={topic.name}
                                            onChange={(e) => updateTopic(index, 'name', e.target.value)}
                                            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />

                                        {/* Importance badge */}
                                        <select
                                            value={topic.importance}
                                            onChange={(e) => updateTopic(index, 'importance', e.target.value as ImportanceLevel)}
                                            className={`flex-shrink-0 px-2 py-1 text-xs rounded border-0 ${
                                                topic.importance === ImportanceLevel.CRITICAL
                                                    ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                                                    : topic.importance === ImportanceLevel.IMPORTANT
                                                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                            }`}
                                        >
                                            <option value={ImportanceLevel.CRITICAL}>Critical</option>
                                            <option value={ImportanceLevel.IMPORTANT}>Important</option>
                                            <option value={ImportanceLevel.RELEVANT}>Relevant</option>
                                        </select>

                                        {/* Description indicator when collapsed */}
                                        {hasDescription && !isExpanded && (
                                            <span className="text-xs text-gray-400 dark:text-gray-500 truncate max-w-[150px]">
                                                {topic.description}
                                            </span>
                                        )}

                                        {/* Delete button */}
                                        <button
                                            type="button"
                                            onClick={() => removeTopic(index)}
                                            className="flex-shrink-0 text-red-600 dark:text-red-400 hover:text-red-700 p-1"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Expanded content */}
                                    {isExpanded && (
                                        <div className="mt-3 ml-9 space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Description
                                                </label>
                                                <textarea
                                                    placeholder="What this topic encompasses"
                                                    rows={2}
                                                    value={topic.description}
                                                    onChange={(e) => updateTopic(index, 'description', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Rationale
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="Why this topic matters"
                                                    value={topic.rationale}
                                                    onChange={(e) => updateTopic(index, 'rationale', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Entities Section - Collapsible */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setEntitiesExpanded(!entitiesExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {entitiesExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Entities {semanticSpace.entities.length > 0 && `(${semanticSpace.entities.length})`}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Named entities (diseases, drugs, organizations, etc.)
                            </p>
                        </div>
                    </button>
                    {entitiesExpanded && (
                        <button
                            type="button"
                            onClick={addEntity}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Entity
                        </button>
                    )}
                </div>

                {entitiesExpanded && (
                    <div className="space-y-2">
                        {semanticSpace.entities.length === 0 && (
                            <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                                No entities defined yet. Click "Add Entity" to get started.
                            </div>
                        )}

                        {semanticSpace.entities.map((entity, index) => {
                            const isExpanded = expandedEntities.has(index);

                            return (
                                <div key={entity.entity_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                                    {/* Entity header row */}
                                    <div className="flex items-center gap-3">
                                        {/* Expand/collapse button */}
                                        <button
                                            type="button"
                                            onClick={() => toggleEntityExpanded(index)}
                                            className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                            {isExpanded ? (
                                                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                                            ) : (
                                                <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                                            )}
                                        </button>

                                        {/* Entity name input */}
                                        <input
                                            type="text"
                                            placeholder="Entity name"
                                            value={entity.name}
                                            onChange={(e) => updateEntity(index, 'name', e.target.value)}
                                            className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />

                                        {/* Entity type badge */}
                                        <select
                                            value={entity.entity_type}
                                            onChange={(e) => updateEntity(index, 'entity_type', e.target.value as EntityType)}
                                            className="flex-shrink-0 px-2 py-1 text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded border-0"
                                        >
                                            <option value={EntityType.DISEASE}>Disease</option>
                                            <option value={EntityType.DRUG}>Drug</option>
                                            <option value={EntityType.SUBSTANCE}>Substance</option>
                                            <option value={EntityType.CHEMICAL}>Chemical</option>
                                            <option value={EntityType.ORGANIZATION}>Organization</option>
                                            <option value={EntityType.REGULATION}>Regulation</option>
                                            <option value={EntityType.BIOMARKER}>Biomarker</option>
                                            <option value={EntityType.GENE}>Gene</option>
                                            <option value={EntityType.PROTEIN}>Protein</option>
                                            <option value={EntityType.PATHWAY}>Pathway</option>
                                        </select>

                                        {/* Delete button */}
                                        <button
                                            type="button"
                                            onClick={() => removeEntity(index)}
                                            className="flex-shrink-0 text-red-600 dark:text-red-400 hover:text-red-700 p-1"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Expanded content */}
                                    {isExpanded && (
                                        <div className="mt-3 ml-9 space-y-3">
                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Context
                                                </label>
                                                <textarea
                                                    placeholder="Why this entity matters"
                                                    rows={2}
                                                    value={entity.context}
                                                    onChange={(e) => updateEntity(index, 'context', e.target.value)}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>

                                            <div>
                                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                    Canonical Forms (comma-separated)
                                                </label>
                                                <input
                                                    type="text"
                                                    placeholder="e.g., mesothelioma, malignant mesothelioma"
                                                    value={entity.canonical_forms.join(', ')}
                                                    onChange={(e) => updateEntity(index, 'canonical_forms', e.target.value.split(',').map(s => s.trim()).filter(s => s))}
                                                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Relationships Section - Collapsible */}
            <div className="space-y-4 border-t border-gray-200 dark:border-gray-700 pt-6">
                <div className="flex items-center justify-between">
                    <button
                        type="button"
                        onClick={() => setRelationshipsExpanded(!relationshipsExpanded)}
                        className="flex items-center gap-2 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                        {relationshipsExpanded ? (
                            <ChevronDownIcon className="h-5 w-5" />
                        ) : (
                            <ChevronRightIcon className="h-5 w-5" />
                        )}
                        <div className="text-left">
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                Relationships {semanticSpace.relationships.length > 0 && `(${semanticSpace.relationships.length})`}
                            </h3>
                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                Semantic relationships between topics and entities
                            </p>
                        </div>
                    </button>
                    {relationshipsExpanded && (
                        <button
                            type="button"
                            onClick={addRelationship}
                            className="flex items-center gap-1 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                        >
                            <PlusIcon className="h-4 w-4" />
                            Add Relationship
                        </button>
                    )}
                </div>

                {relationshipsExpanded && (
                    <div className="space-y-2">
                        {semanticSpace.relationships.length === 0 && (
                            <div className="text-center py-6 text-gray-500 dark:text-gray-400 text-sm">
                                No relationships defined yet. Click "Add Relationship" to get started.
                            </div>
                        )}

                        {semanticSpace.relationships.map((relationship, index) => {
                            const isExpanded = expandedRelationships.has(index);
                            const summary = `${relationship.subject} → ${relationship.object}`;

                            return (
                                <div key={relationship.relationship_id} className="border border-gray-300 dark:border-gray-600 rounded-lg p-3">
                                    {/* Relationship header row */}
                                    <div className="flex items-center gap-3">
                                        {/* Expand/collapse button */}
                                        <button
                                            type="button"
                                            onClick={() => toggleRelationshipExpanded(index)}
                                            className="flex-shrink-0 p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                                        >
                                            {isExpanded ? (
                                                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                                            ) : (
                                                <ChevronRightIcon className="h-4 w-4 text-gray-500" />
                                            )}
                                        </button>

                                        {/* Subject input */}
                                        <input
                                            type="text"
                                            placeholder="Subject"
                                            value={relationship.subject}
                                            onChange={(e) => updateRelationship(index, 'subject', e.target.value)}
                                            className="w-32 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />

                                        {/* Type badge */}
                                        <select
                                            value={relationship.type}
                                            onChange={(e) => updateRelationship(index, 'type', e.target.value as RelationshipType)}
                                            className="flex-shrink-0 px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded border-0"
                                        >
                                            <option value={RelationshipType.CAUSAL}>Causal</option>
                                            <option value={RelationshipType.CORRELATIONAL}>Correlational</option>
                                            <option value={RelationshipType.REGULATORY}>Regulatory</option>
                                            <option value={RelationshipType.METHODOLOGICAL}>Methodological</option>
                                            <option value={RelationshipType.TEMPORAL}>Temporal</option>
                                            <option value={RelationshipType.HIERARCHICAL}>Hierarchical</option>
                                            <option value={RelationshipType.THERAPEUTIC}>Therapeutic</option>
                                            <option value={RelationshipType.INHIBITORY}>Inhibitory</option>
                                            <option value={RelationshipType.INTERACTIVE}>Interactive</option>
                                        </select>

                                        {/* Object input */}
                                        <input
                                            type="text"
                                            placeholder="Object"
                                            value={relationship.object}
                                            onChange={(e) => updateRelationship(index, 'object', e.target.value)}
                                            className="w-32 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                        />

                                        {/* Strength badge */}
                                        <select
                                            value={relationship.strength}
                                            onChange={(e) => updateRelationship(index, 'strength', e.target.value as RelationshipStrength)}
                                            className={`flex-shrink-0 px-2 py-1 text-xs rounded border-0 ${
                                                relationship.strength === 'strong'
                                                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                                                    : relationship.strength === 'moderate'
                                                    ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300'
                                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                                            }`}
                                        >
                                            <option value="strong">Strong</option>
                                            <option value="moderate">Moderate</option>
                                            <option value="weak">Weak</option>
                                        </select>

                                        {/* Delete button */}
                                        <button
                                            type="button"
                                            onClick={() => removeRelationship(index)}
                                            className="flex-shrink-0 text-red-600 dark:text-red-400 hover:text-red-700 p-1"
                                        >
                                            <TrashIcon className="h-4 w-4" />
                                        </button>
                                    </div>

                                    {/* Expanded content */}
                                    {isExpanded && (
                                        <div className="mt-3 ml-9">
                                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                                Description
                                            </label>
                                            <textarea
                                                placeholder="Describe the relationship"
                                                rows={2}
                                                value={relationship.description}
                                                onChange={(e) => updateRelationship(index, 'description', e.target.value)}
                                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                                            />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

        </div>
    );
}
