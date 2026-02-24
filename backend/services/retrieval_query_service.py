"""
Retrieval Query Service

Generates source-specific queries from semantic space topics for Layer 2 retrieval configuration.
This replaces the old channel-based query generation with topic-based generation.
"""

import logging
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.semantic_space import Topic, Entity, Relationship, SemanticSpace, SemanticContext
from schemas.sources import INFORMATION_SOURCES
from schemas.canonical_types import CanonicalResearchArticle
from services.research_stream_service import ResearchStreamService

logger = logging.getLogger(__name__)


class RetrievalQueryService:
    """Service for generating retrieval queries from semantic space topics"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self.stream_service = ResearchStreamService(db)


    async def generate_query_for_concept(
        self,
        concept,  # Concept from research_stream schema
        source_id: str,
        semantic_space: SemanticSpace
    ) -> Tuple[str, str]:
        """
        Generate a source-specific query for a concept.

        Based on framework:
        - Single inclusion pattern (entity-relationship)
        - Vocabulary expansion within entities (OR clauses)
        - No exclusions unless absolutely necessary

        Args:
            concept: Concept object with entity_pattern, relationship_pattern, vocabulary_terms
            source_id: Target source (e.g., 'pubmed', 'google_scholar')
            semantic_space: Complete semantic space for context

        Returns:
            Tuple of (query_expression, reasoning)
        """
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        # Validate source
        source_info = next(
            (src for src in INFORMATION_SOURCES if src.source_id == source_id),
            None
        )
        if not source_info:
            raise ValueError(f"Unknown source: {source_id}")

        # Get entities from entity pattern
        entities = [
            e for e in semantic_space.entities
            if e.entity_id in concept.entity_pattern
        ]

        # Build entity terms with vocabulary expansion
        entity_sections = []
        for entity_id in concept.entity_pattern:
            entity = next((e for e in entities if e.entity_id == entity_id), None)
            if entity:
                # Get vocabulary terms for this entity (synonyms/variants)
                terms = concept.vocabulary_terms.get(entity_id, entity.canonical_forms)
                entity_sections.append({
                    "entity_id": entity_id,
                    "entity_name": entity.name,
                    "terms": terms[:5]  # Limit to top 5 terms per entity
                })

        # Get covered topics for context
        covered_topics = [
            t for t in semantic_space.topics
            if t.topic_id in concept.covered_topics
        ]

        # Create source-specific system prompt
        if source_id == 'pubmed':
            system_prompt = """You are a PubMed search query expert. Generate an optimized boolean search query for a CONCEPT (entity-relationship pattern).

            REQUIREMENTS:
            1. Use PubMed boolean syntax (AND, OR, NOT with parentheses)
            2. Create ONE inclusion pattern (not multiple OR'd patterns)
            3. Use OR operators within each entity for vocabulary expansion (synonyms/variants)
            4. Use AND operators between entities to capture the relationship
            5. Keep the query focused - aim for 10-1000 results per week
            6. Use medical/scientific terminology appropriate for PubMed
            7. Avoid exclusions unless absolutely necessary

            STRUCTURE:
            (entity1_term1 OR entity1_term2 OR entity1_term3) AND (entity2_term1 OR entity2_term2)

            EXAMPLE:
            (mesothelioma OR "pleural cancer" OR "malignant mesothelioma") AND (asbestos OR "asbestos exposure" OR "occupational exposure")

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        elif source_id == 'google_scholar':
            system_prompt = """You are a Google Scholar search query expert. Generate an optimized natural language search query for a CONCEPT (entity-relationship pattern).

            REQUIREMENTS:
            1. Use simple natural language - NO complex boolean operators
            2. Combine the most important terms from the entity pattern
            3. Use quoted phrases for specific multi-word concepts: "machine learning"
            4. Keep it concise - maximum 5-8 key terms or quoted phrases
            5. Focus on the most distinctive keywords that capture the relationship
            6. Aim for focused results (low thousands, not millions)

            STRUCTURE:
            "key entity 1" "key entity 2" relationship_term

            EXAMPLE:
            "asbestos exposure" "mesothelioma" "occupational health"

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        else:
            # Generic fallback for other sources
            system_prompt = f"""You are a search query expert for {source_info.name}. Generate an optimized search query for a CONCEPT (entity-relationship pattern).

            Query syntax to use: {source_info.query_syntax}

            Create a focused query that will retrieve articles about this specific entity-relationship pattern.
            Use appropriate operators to combine entity terms (aim for 10-1000 results per week).

            Respond in JSON format with "query_expression" and "reasoning" fields."""

        # Build user prompt
        entity_descriptions = "\n".join([
            f"- {es['entity_name']} ({es['entity_id']}): {', '.join(es['terms'])}"
            for es in entity_sections
        ])

        topics_list = ", ".join([t.name for t in covered_topics])

        # Use relationship_description if available, fallback to relationship_pattern
        relationship = concept.relationship_description or concept.relationship_pattern or "related to"

        user_prompt = f"""Generate a search query for this concept:

        CONCEPT: {concept.name}
        RATIONALE: {concept.rationale}

        ENTITY PATTERN (with vocabulary expansion):
        {entity_descriptions}

        RELATIONSHIP: {relationship}

        COVERED TOPICS: {topics_list}

        DOMAIN: {semantic_space.domain.name}
        CONTEXT: {semantic_space.domain.description}

        Create a {source_info.name} query that captures this entity-relationship pattern.
        Use OR operators within each entity for vocabulary expansion, and AND between entities for the relationship."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "query_expression": {
                    "type": "string",
                    "description": "The generated search query expression"
                },
                "reasoning": {
                    "type": "string",
                    "description": "Explanation of how the query captures the concept"
                }
            },
            "required": ["query_expression", "reasoning"]
        }

        # Get model config
        task_config = get_task_config("smart_search", "keyword_generation")

        # Create prompt caller
        prompt_caller = BasePromptCaller(
            response_model=response_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.0),
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

            query_expression = response_data.get('query_expression', '')
            reasoning = response_data.get('reasoning', '')

            if not query_expression:
                # Fallback: combine entity terms with AND
                query_expression = self._generate_fallback_concept_query(
                    entity_sections, source_id
                )
                reasoning = f"Fallback query for concept {concept.name}"

            logger.info(f"Generated query for concept '{concept.name}' on {source_id}: {query_expression[:100]}")

            return query_expression, reasoning

        except Exception as e:
            logger.error(f"Query generation for concept failed: {e}")
            # Fallback to simple combined query
            query_expression = self._generate_fallback_concept_query(
                entity_sections, source_id
            )
            reasoning = f"Generated fallback query for concept due to error: {str(e)}"
            return query_expression, reasoning

    async def generate_filter_for_concept(
        self,
        concept,  # Concept from research_stream schema
        semantic_space: SemanticSpace
    ) -> Tuple[str, float, str]:
        """
        Generate semantic filter criteria for a concept.

        Uses LLM to create filter criteria based on the concept's covered topics,
        entity pattern, and rationale.

        Args:
            concept: Concept object with entity_pattern, relationship_edges, relationship_description, covered_topics
            semantic_space: Complete semantic space for context

        Returns:
            Tuple of (criteria, threshold, reasoning)
        """
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        # Get covered topics
        covered_topics = [
            t for t in semantic_space.topics
            if t.topic_id in concept.covered_topics
        ]

        topics_summary = "\n".join([
            f"- {t.name}: {t.description}"
            for t in covered_topics
        ])

        # Get entities
        entities = [
            e for e in semantic_space.entities
            if e.entity_id in concept.entity_pattern
        ]
        entities_summary = "\n".join([
            f"- {e.name} ({e.entity_type.value})"
            for e in entities
        ])

        # Use relationship_description if available, fallback to relationship_pattern
        relationship = concept.relationship_description or concept.relationship_pattern or "related to"

        system_prompt = """You are an expert at creating semantic filter criteria for research article screening.

        Your task is to define clear, specific criteria that distinguish relevant articles from irrelevant ones for a concept.

        A concept is an entity-relationship pattern that covers specific topics. The filter should ensure that retrieved
        articles truly match this pattern and are relevant to the covered topics.

        Good filter criteria:
        - Are specific and actionable
        - Focus on the entity-relationship pattern
        - Consider what makes an article truly relevant vs tangentially related
        - Are written in clear, natural language

        Respond in JSON format with "criteria", "threshold", and "reasoning" fields.

        Threshold should be between 0.5 (permissive) and 0.9 (strict). Default to 0.7."""

        user_prompt = f"""Create semantic filter criteria for this concept:

        CONCEPT: {concept.name}
        RATIONALE: {concept.rationale}

        ENTITY PATTERN:
        {entities_summary}

        RELATIONSHIP PATTERN: {relationship}

        TOPICS COVERED:
        {topics_summary}

        DOMAIN: {semantic_space.domain.name}

        Define filter criteria that will help identify articles truly relevant to this entity-relationship pattern and its covered topics."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "criteria": {"type": "string"},
                "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string"}
            },
            "required": ["criteria", "threshold", "reasoning"]
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

            criteria = response_data.get('criteria', '')
            threshold = response_data.get('threshold', 0.7)
            reasoning = response_data.get('reasoning', '')

            logger.info(f"Generated filter for concept '{concept.name}': threshold={threshold}")

            return criteria, threshold, reasoning

        except Exception as e:
            logger.error(f"Filter generation for concept failed: {e}")
            # Fallback to simple filter
            criteria = f"Articles must directly address the relationship between {' and '.join([e.name for e in entities])}."
            threshold = 0.7
            reasoning = f"Generated fallback filter for concept due to error: {str(e)}"
            return criteria, threshold, reasoning

    def _generate_fallback_concept_query(
        self,
        entity_sections: List[Dict[str, Any]],
        source_id: str
    ) -> str:
        """Generate a simple fallback query from entity sections"""
        if source_id == 'pubmed':
            # PubMed: (term1 OR term2) AND (term3 OR term4)
            entity_groups = []
            for es in entity_sections:
                terms = es['terms'][:3]  # Top 3 terms
                if len(terms) > 1:
                    entity_groups.append(f"({' OR '.join(terms)})")
                elif terms:
                    entity_groups.append(terms[0])
            return ' AND '.join(entity_groups)
        else:
            # Google Scholar / others: simple term list
            all_terms = []
            for es in entity_sections:
                all_terms.extend(es['terms'][:2])  # Top 2 per entity
            return ' '.join(f'"{term}"' if ' ' in term else term for term in all_terms[:6])

    def _find_related_entities(
        self,
        topic: Topic,
        semantic_space: SemanticSpace
    ) -> List[Entity]:
        """
        Find entities related to a topic via relationships.

        Args:
            topic: The topic to find entities for
            semantic_space: Complete semantic space

        Returns:
            List of related entities
        """
        related_entity_ids = set()

        # Find relationships where topic is subject or object
        for relationship in semantic_space.relationships:
            if relationship.subject == topic.topic_id:
                # Check if object is an entity
                related_entity_ids.add(relationship.object)
            elif relationship.object == topic.topic_id:
                # Check if subject is an entity
                related_entity_ids.add(relationship.subject)

        # Filter to actual entities
        related_entities = [
            entity for entity in semantic_space.entities
            if entity.entity_id in related_entity_ids
        ]

        # If no explicit relationships, return all entities (limited by caller)
        if not related_entities:
            related_entities = semantic_space.entities

        return related_entities

    def _generate_fallback_query(
        self,
        topic_name: str,
        entity_terms: List[str],
        source_id: str
    ) -> str:
        """
        Generate a simple fallback query.

        Args:
            topic_name: Name of the topic
            entity_terms: List of entity terms
            source_id: Source identifier

        Returns:
            Simple query expression
        """
        all_terms = [topic_name] + entity_terms

        if source_id == 'pubmed':
            # Boolean OR of all terms
            return '(' + ' OR '.join(all_terms[:5]) + ')'
        else:
            # Natural language with quotes
            return ' '.join(f'"{term}"' for term in all_terms[:3])

    def _generate_fallback_query_for_group(
        self,
        topic_names: List[str],
        entity_terms: List[str],
        source_id: str
    ) -> str:
        """
        Generate a simple fallback query for multiple topics.

        Args:
            topic_names: Names of all topics in the group
            entity_terms: List of entity terms across all topics
            source_id: Source identifier

        Returns:
            Simple combined query expression
        """
        if source_id == 'pubmed':
            # Combine topics with OR, include some entity terms
            topic_parts = [f'({name})' for name in topic_names[:5]]
            entity_parts = entity_terms[:5]
            all_parts = topic_parts + entity_parts
            return '(' + ' OR '.join(all_parts) + ')'
        else:
            # Natural language combining topic names
            all_terms = topic_names[:3] + entity_terms[:3]
            return ' '.join(f'"{term}"' for term in all_terms)

    async def generate_filter_for_broad_query(
        self,
        broad_query,  # BroadQuery from research_stream schema
        semantic_space: SemanticSpace
    ) -> Tuple[str, float, str]:
        """
        Generate semantic filter criteria for a broad query.

        Args:
            broad_query: BroadQuery object
            semantic_space: Complete semantic space for context

        Returns:
            Tuple of (criteria, threshold, reasoning)
        """
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort
        from datetime import datetime

        # Get covered topics
        covered_topics = [
            t for t in semantic_space.topics
            if t.topic_id in broad_query.covered_topics
        ]

        topics_summary = "\n".join([
            f"- {t.name}: {t.description}"
            for t in covered_topics
        ])

        terms_summary = ", ".join(broad_query.search_terms)

        system_prompt = """You are an expert at creating semantic filter criteria for research article screening.

        Your task is to define clear criteria that distinguish truly relevant articles from false positives for a BROAD SEARCH.

        A broad search casts a wide net and may capture many irrelevant articles. The filter should identify articles
        that are genuinely relevant to the covered topics while filtering out unrelated results.

        Good filter criteria:
        - Focus on the topics and domain context
        - Consider what makes an article truly relevant vs tangentially related
        - Are written in clear, natural language
        - Account for the broad nature of the search

        Respond in JSON format with "criteria", "threshold", and "reasoning" fields.

        Threshold should be between 0.5 (permissive) and 0.9 (strict). For broad searches, default to 0.6-0.7."""

        user_prompt = f"""Create semantic filter criteria for this broad search:

        SEARCH TERMS: {terms_summary}
        QUERY: {broad_query.query_expression}
        RATIONALE: {broad_query.rationale}

        TOPICS COVERED:
        {topics_summary}

        DOMAIN: {semantic_space.domain.name}

        Define filter criteria that will help identify articles truly relevant to these topics while filtering out false positives from this broad search."""

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "criteria": {"type": "string"},
                "threshold": {"type": "number", "minimum": 0, "maximum": 1},
                "reasoning": {"type": "string"}
            },
            "required": ["criteria", "threshold", "reasoning"]
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

            criteria = response_data.get('criteria', '')
            threshold = response_data.get('threshold', 0.7)
            reasoning = response_data.get('reasoning', '')

            logger.info(f"Generated filter for broad query '{broad_query.query_id}': threshold={threshold}")
            return criteria, threshold, reasoning

        except Exception as e:
            logger.error(f"Filter generation for broad query failed: {e}")
            # Fallback to simple filter
            topic_names = [t.name for t in covered_topics]
            criteria = f"Articles must be directly relevant to one or more of these topics: {', '.join(topic_names)}."
            threshold = 0.6
            reasoning = f"Generated fallback filter for broad query due to error: {str(e)}"
            return criteria, threshold, reasoning
