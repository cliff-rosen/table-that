"""
Broad Search Service - Generate simple, wide-net search strategies

Alternative to concept-based retrieval: Find the most general searches that capture
everything in the semantic space. Optimized for weekly literature monitoring.

Philosophy:
- Cast a wide net with simple searches
- Accept some false positives (better than missing papers)
- Leverage that weekly volumes are naturally limited
- Simpler to manage than many specific concepts
"""

import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession

from schemas.semantic_space import SemanticSpace, Topic
from schemas.research_stream import BroadQuery, BroadSearchStrategy

logger = logging.getLogger(__name__)

# Default source for generated queries (PubMed)
PUBMED_SOURCE_ID = 1


@dataclass
class CoverageAnalysis:
    """Analysis of how queries cover topics."""
    total_topics: int
    covered_topics: List[str]
    uncovered_topics: List[str]
    expected_false_positive_rate: str


@dataclass
class BroadSearchProposalResult:
    """Result of broad search proposal generation."""
    queries: List[BroadQuery]
    strategy_rationale: str
    coverage_analysis: CoverageAnalysis


class BroadSearchService:
    """Service for generating broad search strategies from semantic space"""

    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id

    async def propose_broad_search(
        self,
        semantic_space: SemanticSpace,
        user_context: Optional[str] = None
    ) -> BroadSearchProposalResult:
        """
        Analyze semantic space and propose broad search strategy.

        Args:
            semantic_space: The semantic space to analyze
            user_context: Optional additional context from user

        Returns:
            BroadSearchProposalResult containing queries, strategy rationale, and coverage analysis.
        """
        from schemas.llm import ChatMessage, MessageRole
        from agents.prompts.base_prompt_caller import BasePromptCaller
        from config.llm_models import get_task_config, supports_reasoning_effort

        logger.info(f"Proposing broad search for semantic space with {len(semantic_space.topics)} topics")

        # Build LLM prompts
        system_prompt, user_prompt = self._build_broad_search_prompts(semantic_space, user_context)

        # Response schema
        response_schema = {
            "type": "object",
            "properties": {
                "queries": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "query_id": {"type": "string"},
                            "search_terms": {"type": "array", "items": {"type": "string"}},
                            "query_expression": {"type": "string"},
                            "rationale": {"type": "string"},
                            "covered_topics": {"type": "array", "items": {"type": "string"}},
                            "estimated_weekly_volume": {"type": ["integer", "null"]}
                        },
                        "required": ["query_id", "search_terms", "query_expression", "rationale", "covered_topics"]
                    }
                },
                "strategy_rationale": {"type": "string"},
                "coverage_analysis": {
                    "type": "object",
                    "properties": {
                        "total_topics": {"type": "integer"},
                        "covered_topics": {"type": "array", "items": {"type": "string"}},
                        "uncovered_topics": {"type": "array", "items": {"type": "string"}},
                        "expected_false_positive_rate": {"type": "string"}
                    }
                }
            },
            "required": ["queries", "strategy_rationale", "coverage_analysis"]
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

            # Parse queries
            queries = self._parse_broad_queries(response_data, semantic_space)

            # Parse coverage analysis
            coverage_data = response_data.get("coverage_analysis", {})
            coverage_analysis = CoverageAnalysis(
                total_topics=coverage_data.get("total_topics", 0),
                covered_topics=coverage_data.get("covered_topics", []),
                uncovered_topics=coverage_data.get("uncovered_topics", []),
                expected_false_positive_rate=coverage_data.get("expected_false_positive_rate", "")
            )

            return BroadSearchProposalResult(
                queries=queries,
                strategy_rationale=response_data.get("strategy_rationale", ""),
                coverage_analysis=coverage_analysis
            )

        except Exception as e:
            logger.error(f"Broad search proposal failed: {e}", exc_info=True)
            raise ValueError(f"Failed to generate broad search proposal: {e}")

    def _build_broad_search_prompts(
        self,
        semantic_space: SemanticSpace,
        user_context: Optional[str]
    ) -> tuple[str, str]:
        """Build the LLM prompts for broad search generation"""

        # Format topics for prompt
        topics_text = "\n".join([
            f"- {t.topic_id}: {t.name}\n  {t.description}\n  Importance: {t.importance.value}"
            for t in semantic_space.topics
        ])

        # Format entities for context
        entities_text = "\n".join([
            f"- {e.name} ({e.entity_type.value}): {', '.join(e.canonical_forms[:3])}"
            for e in semantic_space.entities
        ])

        # Format user context if provided
        user_context_section = ""
        if user_context:
            user_context_section = f"\n## Additional Context:\n{user_context}\n"

        system_prompt = """You are an expert at designing broad, simple search strategies for literature monitoring.

        Your task: Find the MOST GENERAL search terms that capture ALL topics in the semantic space.

        # PHILOSOPHY

        **Problem**: Narrow searches create complexity and risk missing papers
        **Solution**: Find broad terms that cast a wide net

        **Context**:
        - We're monitoring WEEKLY literature (limited volume)
        - Better to review some false positives than miss relevant papers
        - Simpler is better: 1-3 queries ideal

        # YOUR GOAL

        Find the minimal set of broad search terms that guarantee coverage of all topics.

        **Think**:
        - What are the core entities/concepts that appear across ALL or most topics?
        - What's the highest-level term that captures this domain?
        - If you search for just these core terms, will you capture everything relevant?

        **Example**:
        Semantic space topics: "Asbestos-induced mesothelioma", "Mesothelioma biomarkers", "Mesothelioma treatment"
        **Narrow approach** (what NOT to do): 5 specific concepts with entity patterns
        **Broad approach** (what TO do): Query = (asbestos OR mesothelioma)
        This simple query captures ALL papers about asbestos and mesothelioma, covering all topics.

        # GUIDELINES

        1. **Start broad**: Think about the core domain terms
        2. **Test coverage**: Does this capture all topics?
        3. **Keep it simple**: Prefer 1 query over 3, prefer 3 over 10
        4. **Volume check**: For weekly monitoring, even broad terms won't overwhelm
        5. **False positives OK**: Better to filter out than miss papers

        # OUTPUT FORMAT

        Generate 1-3 broad queries (usually just 1!), each with:
        - query_id: Unique ID
        - search_terms: List of core terms (e.g., ["asbestos", "mesothelioma"])
        - query_expression: Boolean expression (e.g., "(asbestos OR mesothelioma)")
        - rationale: Why these terms capture everything
        - covered_topics: All topic_ids this covers
        - estimated_weekly_volume: Rough estimate of papers/week

        Also provide:
        - strategy_rationale: Overall explanation of the broad approach
        - coverage_analysis: How queries cover all topics, expected false positive rate

        Respond in JSON format."""

        user_prompt = f"""Find the broadest search strategy for this domain:

        # DOMAIN

        Name: {semantic_space.domain.name}
        Description: {semantic_space.domain.description}{user_context_section}

        # TOPICS TO COVER

        {topics_text}

        # ENTITIES FOR REFERENCE

        {entities_text}

        # YOUR TASK

        What are the MOST GENERAL search terms that would capture papers about ALL these topics?

        Think: If I'm monitoring PubMed weekly, what simple search would guarantee I don't miss anything relevant?

        Generate your broad search strategy now."""

        return system_prompt, user_prompt

    def _parse_broad_queries(
        self,
        llm_result: Dict[str, Any],
        semantic_space: SemanticSpace
    ) -> List[BroadQuery]:
        """Parse LLM response into BroadQuery objects"""

        queries = []
        query_data_list = llm_result.get("queries", [])

        for idx, query_data in enumerate(query_data_list):
            # Validate topic_ids exist in semantic space
            topic_ids = query_data.get("covered_topics", [])
            valid_topic_ids = [t.topic_id for t in semantic_space.topics]
            invalid_topics = [tid for tid in topic_ids if tid not in valid_topic_ids]

            if invalid_topics:
                logger.warning(f"Query {query_data.get('query_id')} references invalid topics: {invalid_topics}")
                # Filter to valid topics only
                topic_ids = [tid for tid in topic_ids if tid in valid_topic_ids]

            query = BroadQuery(
                query_id=query_data.get("query_id", f"bq_{idx+1}"),
                source_id=PUBMED_SOURCE_ID,
                search_terms=query_data.get("search_terms", []),
                query_expression=query_data.get("query_expression", ""),
                rationale=query_data.get("rationale", ""),
                covered_topics=topic_ids,
                estimated_weekly_volume=query_data.get("estimated_weekly_volume")
            )

            queries.append(query)

        return queries
