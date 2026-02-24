"""
Concept Proposal Service - Generate concept-based retrieval configuration from semantic space

Based on framework:
- Phase 1: Extract entities and relationships from semantic space
- Phase 2-3: Generate concepts (entity-relationship patterns)
- Each concept has single inclusion pattern
- Many-to-many mapping to topics
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.semantic_space import SemanticSpace, Topic, Entity
from schemas.research_stream import Concept, VolumeStatus, SourceQuery, SemanticFilter, RelationshipEdge, ConceptEntity

logger = logging.getLogger(__name__)


@dataclass
class CoverageCheck:
    """Validation result for topic coverage."""
    is_complete: bool
    covered_topics: List[str]
    uncovered_topics: List[str]
    coverage_percentage: float
    topic_coverage_count: Dict[str, int]
    concepts_per_topic_min: int
    concepts_per_topic_max: int
    concepts_per_topic_avg: float


@dataclass
class ConceptProposalResult:
    """Result of concept proposal generation."""
    proposed_concepts: List[Concept]
    analysis: Dict[str, Any]  # Phase 1 analysis from LLM
    reasoning: str
    coverage_check: CoverageCheck


class ConceptProposalService:
    """Service for generating concept proposals from semantic space analysis"""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    def _validate_concept_relationships(
        self,
        concept_data: Dict[str, Any],
        phase1_entities_map: Dict[str, Dict[str, Any]]
    ) -> List[str]:
        """
        Validate concept relationship graph against phase1 entities.

        Returns list of validation errors (empty if valid).
        """
        errors = []
        entity_pattern = concept_data.get("entity_pattern", [])
        relationship_edges = concept_data.get("relationship_edges", [])

        # Check minimum edges
        min_edges = len(entity_pattern) - 1
        if len(relationship_edges) < min_edges:
            errors.append(
                f"Concept {concept_data.get('concept_id')} has {len(entity_pattern)} entities but only "
                f"{len(relationship_edges)} edges. Need at least {min_edges} edges."
            )

        # Check all entity_ids are valid (exist in phase1 entities)
        valid_entity_ids = set(phase1_entities_map.keys())
        for entity_id in entity_pattern:
            if entity_id not in valid_entity_ids:
                errors.append(f"Invalid entity_id in pattern: {entity_id} (not in phase1_analysis.entities)")

        # Check edge references
        pattern_set = set(entity_pattern)
        for edge_data in relationship_edges:
            from_id = edge_data.get("from_entity_id")
            to_id = edge_data.get("to_entity_id")

            if from_id not in pattern_set:
                errors.append(f"Edge references unknown entity: {from_id}")
            if to_id not in pattern_set:
                errors.append(f"Edge references unknown entity: {to_id}")
            if from_id == to_id:
                errors.append(f"Self-loop not allowed: {from_id} -> {to_id}")

        # Check graph connectivity (all entities reachable)
        if len(entity_pattern) > 1 and len(relationship_edges) > 0:
            connected = self._check_graph_connected(entity_pattern, relationship_edges)
            if not connected:
                errors.append(
                    f"Concept {concept_data.get('concept_id')}: Graph is not connected - "
                    "some entities are unreachable"
                )

        return errors

    def _check_graph_connected(
        self,
        entities: List[str],
        edges: List[Dict[str, Any]]
    ) -> bool:
        """Check if undirected graph formed by edges is connected"""
        if len(entities) <= 1:
            return True

        # Build adjacency list (treat as undirected)
        adj = {e: set() for e in entities}
        for edge in edges:
            from_id = edge.get("from_entity_id")
            to_id = edge.get("to_entity_id")
            if from_id and to_id:
                adj[from_id].add(to_id)
                adj[to_id].add(from_id)

        # BFS from first entity
        visited = set()
        queue = [entities[0]]
        visited.add(entities[0])

        while queue:
            node = queue.pop(0)
            for neighbor in adj.get(node, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    queue.append(neighbor)

        return len(visited) == len(entities)

    async def propose_concepts(
        self,
        semantic_space: SemanticSpace,
        user_context: Optional[str] = None
    ) -> ConceptProposalResult:
        """
        Analyze semantic space and propose concepts for retrieval.

        Args:
            semantic_space: The semantic space to analyze
            user_context: Optional additional context from user

        Returns:
            ConceptProposalResult containing proposed concepts, analysis, reasoning, and coverage check.
        """
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

        logger.info(f"Proposing concepts for semantic space with {len(semantic_space.topics)} topics")

        # Build LLM prompts
        system_prompt, user_prompt = self._build_concept_generation_prompts(semantic_space, user_context)

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "phase1_analysis": {
                    "type": "object",
                    "properties": {
                        "entities": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "entity_id": {"type": "string"},
                                    "name": {"type": "string"},
                                    "entity_type": {"type": "string"},
                                    "canonical_forms": {"type": "array", "items": {"type": "string"}},
                                    "rationale": {"type": "string"},
                                    "semantic_space_ref": {"type": ["string", "null"]}
                                },
                                "required": ["entity_id", "name", "entity_type", "canonical_forms", "rationale"]
                            }
                        },
                        "relationship_patterns": {"type": "array", "items": {"type": "string"}},
                        "coverage_strategy": {"type": "string"}
                    },
                    "required": ["entities", "relationship_patterns", "coverage_strategy"]
                },
                "concepts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "concept_id": {"type": "string"},
                            "name": {"type": "string"},
                            "entity_pattern": {
                                "type": "array",
                                "items": {"type": "string"},
                                "minItems": 1,
                                "maxItems": 3
                            },
                            "relationship_edges": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "from_entity_id": {"type": "string"},
                                        "to_entity_id": {"type": "string"},
                                        "relation_type": {"type": "string"}
                                    },
                                    "required": ["from_entity_id", "to_entity_id", "relation_type"]
                                }
                            },
                            "relationship_description": {"type": "string"},
                            "covered_topics": {"type": "array", "items": {"type": "string"}},
                            "rationale": {"type": "string"}
                        },
                        "required": [
                            "concept_id",
                            "name",
                            "entity_pattern",
                            "relationship_edges",
                            "relationship_description",
                            "covered_topics",
                            "rationale"
                        ]
                    }
                },
                "overall_reasoning": {"type": "string"}
            },
            "required": ["phase1_analysis", "concepts", "overall_reasoning"]
        }

        # Get model config
        task_config = get_task_config("smart_search", "keyword_generation")

        # Create prompt caller
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.3),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        try:
            # Get LLM response
            user_message = ChatMessage(
                id="temp_id",
                chat_id="temp_chat",
                role=MessageRole.USER,
                content=user_prompt,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )

            result = await prompt_caller.invoke(
                messages=[user_message],
                return_usage=True
            )

            # Extract result
            llm_response = result.result
            if hasattr(llm_response, 'model_dump'):
                response_data = llm_response.model_dump()
            elif hasattr(llm_response, 'dict'):
                response_data = llm_response.dict()
            else:
                response_data = llm_response

            # Parse concepts
            concepts = self._parse_concept_proposals(response_data, semantic_space)

            return ConceptProposalResult(
                proposed_concepts=concepts,
                analysis=response_data.get("phase1_analysis", {}),
                reasoning=response_data.get("overall_reasoning", ""),
                coverage_check=self._validate_coverage(concepts, semantic_space)
            )

        except Exception as e:
            logger.error(f"Concept proposal failed: {e}", exc_info=True)
            raise ValueError(f"Failed to generate concept proposals: {e}")

    def _build_concept_generation_prompts(
        self,
        semantic_space: SemanticSpace,
        user_context: Optional[str]
    ) -> tuple[str, str]:
        """Build the LLM prompts for concept generation (system and user prompts)"""

        # Format topics for prompt
        topics_text = "\n".join([
            f"- {t.topic_id}: {t.name}\n  Description: {t.description}\n  Importance: {t.importance.value}"
            for t in semantic_space.topics
        ])

        # Format entities for prompt
        entities_text = "\n".join([
            f"- {e.entity_id}: {e.name} ({e.entity_type.value})\n  Forms: {', '.join(e.canonical_forms)}"
            for e in semantic_space.entities
        ])

        # Format relationships if any
        relationships_text = "None explicitly defined"
        if semantic_space.relationships:
            relationships_text = "\n".join([
                f"- {r.subject} -> {r.type.value} -> {r.object} (strength: {r.strength})"
                for r in semantic_space.relationships
            ])

        # Format user context if provided
        user_context_section = ""
        if user_context:
            user_context_section = f"\n## Additional User Context:\n{user_context}\n"

        system_prompt = """You are an expert at designing retrieval configurations for research monitoring systems.

        Your task: Analyze topics and define entity-relationship patterns that would retrieve relevant research papers.

        # TWO-PHASE PROCESS

        ## PHASE 1: Independent Analysis (Define What's Needed)

        For the given topics, think through:

        **1. What entities do research papers about these topics actually discuss?**
        - What are the key "things" papers talk about? (diseases, methods, biomarkers, treatments, outcomes, etc.)
        - What search terms do papers use for these entities?
        - Don't limit yourself to the semantic space reference - define what's actually needed to cover these topics

        **2. What relationships exist between these entities?**
        - How do papers connect these entities?
        - What relationship patterns appear in the literature?

        **3. What patterns would cast the right net?**
        - What entity combinations would retrieve the right papers?
        - What patterns substantially cover each topic's domain?

        For each entity you define, provide:
        - entity_id: Unique ID (use "c_e1", "c_e2", "c_e3", etc.)
        - name: Clear entity name
        - entity_type: methodology, biomarker, disease, treatment, outcome, population, etc.
        - canonical_forms: ALL search terms (synonyms, abbreviations, variants) - this is critical for retrieval
        - rationale: Why this entity is needed for covering the topics
        - semantic_space_ref: If this maps to a semantic space entity, provide its ID (optional)

        ## PHASE 2: Concept Creation (Build Searchable Patterns)

        Using the entities from Phase 1, create concepts:

        Each concept should have:
        - entity_pattern: List of entity_ids from Phase 1 (1-3 entities)
        - relationship_edges: How entities connect (directed graph)
        - relationship_description: Human-readable explanation
        - covered_topics: Which topic_ids this retrieves
        - rationale: Why this pattern covers these topics

        ### Relationship Graph Rules:

        **2 entities = 1 edge:**
        - entity_pattern: ["c_e1", "c_e2"]
        - relationship_edges: [{{from_entity_id: "c_e1", to_entity_id: "c_e2", relation_type: "causes"}}]

        **3 entities = at least 2 edges:**

        Linear chain (method → biomarker → disease):
        - entity_pattern: ["c_e1", "c_e2", "c_e3"]
        - relationship_edges: [
            {{from_entity_id: "c_e1", to_entity_id: "c_e2", relation_type: "measures"}},
            {{from_entity_id: "c_e2", to_entity_id: "c_e3", relation_type: "detects"}}
          ]

        Convergent (two causes → one effect):
        - entity_pattern: ["c_e1", "c_e2", "c_e3"]
        - relationship_edges: [
            {{from_entity_id: "c_e1", to_entity_id: "c_e3", relation_type: "causes"}},
            {{from_entity_id: "c_e2", to_entity_id: "c_e3", relation_type: "causes"}}
          ]

        Use clear relation_types: causes, measures, detects, treats, induces, prevents, monitors, indicates, etc.

        # FRAMEWORK PRINCIPLES

        1. **Let the data guide you**: Define entities based on what papers actually discuss
        2. **Semantic space is reference**: Use it for inspiration, not constraint
        3. **Optimize for search**: Choose entities and terms that cast the right net
        4. **Cover the domain**: For each topic, a finite set of patterns should substantially cover it
        5. **Single pattern per concept**: Each concept = one focused pattern (not multiple OR'd patterns)
        6. **Many-to-many coverage**: A concept can cover multiple topics; a topic can have multiple concepts

        # VALIDATION

        - Every topic must be covered by at least one concept
        - Create 3-7 concepts total (balance coverage vs. manageability)
        - Concepts with 3 entities need at least 2 edges
        - All edges must reference entity_ids from Phase 1 entities
        - Graph must be connected (all entities reachable)

        # OUTPUT FORMAT

        Respond in JSON with:
        - phase1_analysis: {{entities: [...], relationship_patterns: [...], coverage_strategy: "..."}}
        - concepts: [...]
        - overall_reasoning: "..."

        The semantic space reference is provided for context - use it as inspiration but define what's actually needed."""

        user_prompt = f"""Analyze these topics and define entity-relationship patterns for retrieval:

        # TOPICS TO COVER

        {topics_text}

        # DOMAIN CONTEXT

        Name: {semantic_space.domain.name}
        Description: {semantic_space.domain.description}{user_context_section}

        # SEMANTIC SPACE REFERENCE (for inspiration, not constraint)

        Entities that might be relevant:
        {entities_text}

        Relationships that might exist:
        {relationships_text}

        # YOUR TASK

        Phase 1: Define the entities and relationships needed to cover these topics
        - Think: What entity-relationship patterns would retrieve papers about these topics?
        - Define entities with search-optimized canonical_forms
        - Use semantic space as reference but define what's actually needed

        Phase 2: Create concepts using those entities
        - Build searchable patterns that substantially cover each topic's domain

        Generate your analysis now."""

        return system_prompt, user_prompt

    def _parse_concept_proposals(
        self,
        llm_result: Dict[str, Any],
        semantic_space: SemanticSpace
    ) -> List[Concept]:
        """Parse LLM response into Concept objects"""

        concepts = []
        concept_data_list = llm_result.get("concepts", [])

        # Extract phase1 entities
        phase1_entities_data = llm_result.get("phase1_analysis", {}).get("entities", [])
        phase1_entities_map = {e.get("entity_id"): e for e in phase1_entities_data}

        for idx, concept_data in enumerate(concept_data_list):
            # Validate entity_ids exist in phase1 entities
            entity_ids = concept_data.get("entity_pattern", [])
            valid_entity_ids = list(phase1_entities_map.keys())
            invalid_entities = [eid for eid in entity_ids if eid not in valid_entity_ids]

            if invalid_entities:
                logger.warning(
                    f"Concept {concept_data.get('concept_id')} references entities not in phase1: {invalid_entities}"
                )
                # Filter to valid entities only
                entity_ids = [eid for eid in entity_ids if eid in valid_entity_ids]

            # Validate topic_ids exist in semantic space
            topic_ids = concept_data.get("covered_topics", [])
            valid_topic_ids = [t.topic_id for t in semantic_space.topics]
            invalid_topics = [tid for tid in topic_ids if tid not in valid_topic_ids]

            if invalid_topics:
                logger.warning(f"Concept {concept_data.get('concept_id')} references invalid topics: {invalid_topics}")
                # Filter to valid topics only
                topic_ids = [tid for tid in topic_ids if tid in valid_topic_ids]

            # Validate relationship edges
            validation_errors = self._validate_concept_relationships(concept_data, phase1_entities_map)
            if validation_errors:
                for error in validation_errors:
                    logger.warning(error)
                # Continue anyway, but log the issues

            # Parse relationship edges
            relationship_edges_data = concept_data.get("relationship_edges", [])
            relationship_edges = []
            for edge_data in relationship_edges_data:
                try:
                    edge = RelationshipEdge(**edge_data)
                    relationship_edges.append(edge)
                except Exception as e:
                    logger.warning(f"Failed to parse relationship edge: {e}")

            # Get relationship description
            relationship_description = concept_data.get("relationship_description", "")

            # Build vocabulary_terms from phase1 entities
            vocabulary_terms = {}
            for entity_id in entity_ids:
                phase1_entity = phase1_entities_map.get(entity_id)
                if phase1_entity:
                    canonical_forms = phase1_entity.get("canonical_forms", [])
                    if canonical_forms:
                        vocabulary_terms[entity_id] = canonical_forms
                    else:
                        logger.warning(f"Entity {entity_id} in phase1 has no canonical_forms")

            # Backward compatibility: use old relationship_pattern if new fields not present
            relationship_pattern = concept_data.get("relationship_pattern")
            if not relationship_description and relationship_pattern:
                relationship_description = relationship_pattern

            concept = Concept(
                concept_id=concept_data.get("concept_id", f"concept_{idx+1}"),
                name=concept_data.get("name", f"Concept {idx+1}"),
                entity_pattern=entity_ids,
                relationship_edges=relationship_edges,
                relationship_description=relationship_description,
                relationship_pattern=relationship_pattern,  # Keep for backward compatibility
                covered_topics=topic_ids,
                vocabulary_terms=vocabulary_terms,
                expected_volume=None,  # Will be filled during volume estimation
                volume_status=VolumeStatus.UNKNOWN,
                last_volume_check=None,
                source_queries={},  # Will be filled during query generation
                semantic_filter=SemanticFilter(),  # Default no filtering
                exclusions=[],
                exclusion_rationale=None,
                rationale=concept_data.get("rationale", ""),
                human_edited=False
            )

            concepts.append(concept)

        return concepts

    def _validate_coverage(
        self,
        concepts: List[Concept],
        semantic_space: SemanticSpace
    ) -> CoverageCheck:
        """Check if proposed concepts cover all topics"""

        covered_topics = set()
        for concept in concepts:
            covered_topics.update(concept.covered_topics)

        all_topics = {t.topic_id for t in semantic_space.topics}
        uncovered_topics = all_topics - covered_topics

        # Also track many-to-many mapping
        topic_coverage_count = {t.topic_id: 0 for t in semantic_space.topics}
        for concept in concepts:
            for topic_id in concept.covered_topics:
                if topic_id in topic_coverage_count:
                    topic_coverage_count[topic_id] += 1

        return CoverageCheck(
            is_complete=len(uncovered_topics) == 0,
            covered_topics=list(covered_topics),
            uncovered_topics=list(uncovered_topics),
            coverage_percentage=len(covered_topics) / len(all_topics) * 100 if all_topics else 100,
            topic_coverage_count=topic_coverage_count,
            concepts_per_topic_min=min(topic_coverage_count.values()) if topic_coverage_count else 0,
            concepts_per_topic_max=max(topic_coverage_count.values()) if topic_coverage_count else 0,
            concepts_per_topic_avg=sum(topic_coverage_count.values()) / len(topic_coverage_count) if topic_coverage_count else 0
        )
