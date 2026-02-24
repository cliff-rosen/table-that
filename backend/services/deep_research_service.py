"""
Deep Research Service

Orchestrates complex research questions through iterative search and analysis.
Uses PubMed and web search in parallel, with LLM-driven query generation,
result processing, and answer synthesis.

Architecture follows the pipeline pattern:
- ResearchContext: Holds immutable config and mutable state
- execute(): Main orchestrator calling stages sequentially
- _stage_xxx(): Individual stage async generators yielding progress
- _xxx(): Helper methods doing actual work
"""

import asyncio
import logging
from typing import List, Dict, Any, Optional, AsyncGenerator, Union
from dataclasses import dataclass, field
from datetime import datetime, timezone

from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from agents.prompts.llm import call_llm
from schemas.llm import DEFAULT_MODEL_CONFIG
from services.pubmed_service import search_articles as search_pubmed
from services.search_service import SearchService
from services.tool_trace_service import ToolTraceService
from tools.registry import ToolProgress, ToolResult

logger = logging.getLogger(__name__)


# =============================================================================
# Pydantic Models for LLM Responses
# =============================================================================

class RefinedQuestion(BaseModel):
    """LLM output for question refinement."""
    refined_question: str = Field(description="Clear, unambiguous version of the question")
    scope_boundaries: List[str] = Field(description="What is in/out of scope")
    key_terms: List[str] = Field(description="Key terms and concepts to search for")


class ChecklistItem(BaseModel):
    """A single checklist item."""
    id: str = Field(description="Unique identifier (e.g., '1', '2')")
    description: str = Field(description="What information is needed")


class Checklist(BaseModel):
    """LLM output for checklist generation."""
    items: List[ChecklistItem] = Field(description="List of 3-7 checklist items")


class SearchQueries(BaseModel):
    """LLM output for query generation."""
    pubmed_queries: List[str] = Field(description="1-2 PubMed search queries")
    web_queries: List[str] = Field(description="1-2 web search queries")
    reasoning: str = Field(description="Why these queries were chosen")


class ExtractedFact(BaseModel):
    """A fact extracted from search results."""
    fact: str = Field(description="The key finding or information")
    source_id: str = Field(description="ID of the source (e.g., 'pubmed_12345' or 'web_1')")
    addresses_items: List[str] = Field(description="Checklist item IDs this addresses")


class ProcessedResults(BaseModel):
    """LLM output for result processing."""
    facts: List[ExtractedFact] = Field(description="Extracted facts with citations")
    new_gaps: List[str] = Field(description="Any new gaps or follow-up questions identified")


class ChecklistStatus(BaseModel):
    """Status of a single checklist item."""
    id: str
    status: str = Field(description="'satisfied', 'partial', or 'unsatisfied'")
    evidence_summary: str = Field(description="Brief summary of evidence found")


class EvaluationResult(BaseModel):
    """First evaluator: pass/fail with confidence."""
    passed: bool = Field(description="True if research is sufficient to answer the question")
    confidence: float = Field(description="Confidence in this assessment (0.0 to 1.0)")
    gaps: List[str] = Field(description="If failed, specific information still needed")
    checklist_status: List[ChecklistStatus] = Field(description="Status of each checklist item")
    reasoning: str = Field(description="Explanation of the assessment")


class SecondOpinionResult(BaseModel):
    """Second opinion evaluator for low-confidence passes."""
    confirmed: bool = Field(description="True if agreeing the research is sufficient")
    additional_gaps: List[str] = Field(description="If not confirmed, additional information needed")
    final_confidence: float = Field(description="Final confidence after review (0.0 to 1.0)")
    assessment: str = Field(description="Overall assessment and reasoning")


class SynthesizedAnswer(BaseModel):
    """LLM output for answer synthesis."""
    answer: str = Field(description="Comprehensive answer with inline citations [1], [2], etc.")
    limitations: List[str] = Field(description="Known limitations or gaps")


# =============================================================================
# Source Tracking
# =============================================================================

@dataclass
class Source:
    """Tracks a source used in research."""
    id: str
    source_type: str  # "pubmed" or "web"
    title: str
    url: str
    snippet: str
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.source_type,
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "metadata": self.metadata
        }


# =============================================================================
# Research Configuration
# =============================================================================

@dataclass
class ResearchConfig:
    """Configuration for research behavior and thresholds."""
    # Iteration limits
    max_iterations: int = 10
    timeout_seconds: int = 600  # 10 minutes

    # Evaluation thresholds
    confidence_threshold: float = 0.8  # Below this, get second opinion
    min_sources: int = 3  # Minimum sources before considering complete

    # Search limits per query
    max_pubmed_results: int = 10
    max_web_results: int = 10


# =============================================================================
# Research Context
# =============================================================================

@dataclass
class ResearchContext:
    """
    Context object passed between research stages.

    Immutable fields are set during initialization.
    Mutable fields are updated as stages execute.
    """
    # === Immutable (set during init) ===
    trace_id: str
    user_id: int
    org_id: Optional[int]
    question: str
    context: Optional[str]
    config: ResearchConfig
    start_time: datetime

    # === Mutable (accumulated during execution) ===
    refined_question: str = ""
    scope_boundaries: List[str] = field(default_factory=list)
    key_terms: List[str] = field(default_factory=list)
    checklist: List[ChecklistItem] = field(default_factory=list)
    checklist_status: Dict[str, ChecklistStatus] = field(default_factory=dict)
    knowledge_base: List[ExtractedFact] = field(default_factory=list)
    sources: Dict[str, Source] = field(default_factory=dict)
    iterations: List[Dict[str, Any]] = field(default_factory=list)
    final_answer: Optional[SynthesizedAnswer] = None

    # === Evaluation state ===
    last_evaluation: Optional[EvaluationResult] = None
    second_opinion: Optional[SecondOpinionResult] = None

    # === Metrics ===
    metrics: Dict[str, int] = field(default_factory=lambda: {
        "total_iterations": 0,
        "pubmed_queries": 0,
        "web_queries": 0,
        "sources_processed": 0,
        "llm_calls": 0
    })

    def is_timed_out(self) -> bool:
        """Check if research has exceeded timeout."""
        elapsed = (datetime.now(timezone.utc) - self.start_time).total_seconds()
        return elapsed > self.config.timeout_seconds

    def get_unsatisfied_items(self) -> List[ChecklistItem]:
        """Get checklist items that are not yet satisfied."""
        return [
            item for item in self.checklist
            if self.checklist_status.get(item.id, ChecklistStatus(id=item.id, status="unsatisfied", evidence_summary="")).status != "satisfied"
        ]

    def get_satisfied_count(self) -> int:
        """Count satisfied checklist items."""
        return sum(1 for s in self.checklist_status.values() if s.status == "satisfied")

    def summarize_knowledge_base(self) -> str:
        """Create a text summary of the knowledge base."""
        if not self.knowledge_base:
            return "No information found yet."
        lines = [f"- {fact.fact} [{fact.source_id}]" for fact in self.knowledge_base]
        return "\n".join(lines)

    def has_minimum_sources(self) -> bool:
        """Check if we have minimum required sources."""
        return len(self.sources) >= self.config.min_sources

    def final_result(self) -> Dict[str, Any]:
        """Build final result dict."""
        return {
            "trace_id": self.trace_id,
            "question": self.question,
            "refined_question": self.refined_question,
            "answer": self.final_answer.answer if self.final_answer else "",
            "sources": [s.to_dict() for s in self.sources.values()],
            "checklist_coverage": {
                "satisfied": [s.id for s in self.checklist_status.values() if s.status == "satisfied"],
                "partial": [s.id for s in self.checklist_status.values() if s.status == "partial"],
                "gaps": [s.id for s in self.checklist_status.values() if s.status == "unsatisfied"]
            },
            "iterations_used": self.metrics["total_iterations"],
            "status": "completed",
            "limitations": self.final_answer.limitations if self.final_answer else [],
            "evaluation": {
                "final_confidence": self.last_evaluation.confidence if self.last_evaluation else 0,
                "used_second_opinion": self.second_opinion is not None
            }
        }


# =============================================================================
# Deep Research Service
# =============================================================================

class DeepResearchService:
    """
    Service for conducting deep research on complex questions.

    Orchestrates:
    1. Question refinement
    2. Checklist generation
    3. Iterative search loop (PubMed + Web in parallel)
    4. Answer synthesis
    """

    def __init__(self, db: AsyncSession, user_id: int, org_id: Optional[int] = None):
        self.db = db
        self.user_id = user_id
        self.org_id = org_id
        self.trace_service = ToolTraceService(db)
        self.web_search_service = SearchService()

    # =========================================================================
    # MAIN ORCHESTRATOR
    # =========================================================================

    async def execute(
        self,
        question: str,
        context: Optional[str] = None,
        max_iterations: int = 10
    ) -> AsyncGenerator[Union[ToolProgress, ToolResult], None]:
        """
        Execute deep research on a question.

        Yields ToolProgress updates during execution, then yields final ToolResult.
        """
        try:
            # Initialize context
            yield ToolProgress(stage="init", message="Starting deep research...", progress=0.0)

            ctx = await self._init_context(question, context, max_iterations)

            yield ToolProgress(
                stage="init",
                message=f"Research initialized (trace: {ctx.trace_id[:8]}...)",
                progress=0.02
            )

            # Execute stages
            async for progress in self._stage_refine_question(ctx):
                yield progress

            async for progress in self._stage_generate_checklist(ctx):
                yield progress

            async for progress in self._stage_research_loop(ctx):
                yield progress

            async for progress in self._stage_synthesize_answer(ctx):
                yield progress

            # Complete
            await self._complete_trace(ctx)

            yield ToolProgress(stage="complete", message="Research complete!", progress=1.0)

            # Format and yield final result
            answer_text = self._format_text_for_llm(ctx)
            yield ToolResult(
                text=answer_text,
                payload={"type": "deep_research_result", "data": ctx.final_result()}
            )

        except Exception as e:
            logger.error(f"Deep research failed: {e}", exc_info=True)
            if 'ctx' in locals():
                await self._fail_trace(ctx, str(e))
            yield ToolResult(
                text=f"Research failed: {str(e)}",
                payload={"type": "deep_research_error", "error": str(e)}
            )

    # =========================================================================
    # CONTEXT INITIALIZATION
    # =========================================================================

    async def _init_context(
        self,
        question: str,
        context: Optional[str],
        max_iterations: int
    ) -> ResearchContext:
        """Initialize research context and create trace."""
        config = ResearchConfig(max_iterations=max_iterations)

        trace_id = await self.trace_service.create_trace(
            tool_name="deep_research",
            user_id=self.user_id,
            org_id=self.org_id,
            input_params={
                "question": question,
                "context": context,
                "max_iterations": max_iterations,
                "confidence_threshold": config.confidence_threshold
            }
        )
        await self.trace_service.start_trace(trace_id)

        return ResearchContext(
            trace_id=trace_id,
            user_id=self.user_id,
            org_id=self.org_id,
            question=question,
            context=context,
            config=config,
            start_time=datetime.now(timezone.utc)
        )

    # =========================================================================
    # PIPELINE STAGES
    # =========================================================================

    async def _stage_refine_question(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """Stage: Refine the question to be clear and unambiguous."""
        yield ToolProgress(
            stage="refining",
            message="Refining question and generating research plan...",
            progress=0.05
        )

        refined = await self._llm_refine_question(ctx.question, ctx.context)
        ctx.metrics["llm_calls"] += 1

        if not refined:
            raise Exception("Failed to refine question")

        ctx.refined_question = refined.refined_question
        ctx.scope_boundaries = refined.scope_boundaries
        ctx.key_terms = refined.key_terms

        await self._update_trace_state(ctx, {
            "refined_question": ctx.refined_question,
            "scope_boundaries": ctx.scope_boundaries,
            "key_terms": ctx.key_terms
        })

        yield ToolProgress(
            stage="refining",
            message="Question refined",
            progress=0.1,
            data={"key_terms": ctx.key_terms[:5]}
        )

    async def _stage_generate_checklist(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """Stage: Generate checklist of what a complete answer needs."""
        yield ToolProgress(
            stage="checklist",
            message="Generating research checklist...",
            progress=0.12
        )

        checklist = await self._llm_generate_checklist(ctx.refined_question)
        ctx.metrics["llm_calls"] += 1

        if not checklist:
            raise Exception("Failed to generate checklist")

        ctx.checklist = checklist.items
        for item in ctx.checklist:
            ctx.checklist_status[item.id] = ChecklistStatus(
                id=item.id,
                status="unsatisfied",
                evidence_summary=""
            )

        await self._update_trace_state(ctx, {
            "checklist": [{"id": i.id, "description": i.description} for i in ctx.checklist]
        })

        yield ToolProgress(
            stage="checklist",
            message=f"Generated checklist with {len(ctx.checklist)} items",
            progress=0.15,
            data={"checklist_items": len(ctx.checklist)}
        )

    async def _stage_research_loop(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """
        Stage: Iterative research loop with two-stage evaluation.

        Evaluation flow:
        1. First evaluator: pass/fail with confidence
           - FAIL: returns gaps to pursue → continue loop
           - PASS + confidence < threshold → second opinion
           - PASS + confidence >= threshold → exit loop
        2. Second opinion (only on low-confidence pass):
           - Can confirm or identify additional gaps
        """
        max_iter = ctx.config.max_iterations

        for iteration in range(1, max_iter + 1):
            ctx.metrics["total_iterations"] = iteration

            # Check timeout
            if ctx.is_timed_out():
                logger.warning(f"Research timeout after {iteration-1} iterations")
                yield ToolProgress(
                    stage="timeout",
                    message="Research timeout reached",
                    progress=0.85
                )
                break

            # Calculate progress (0.15 to 0.85 for research loop)
            progress_base = 0.15 + (0.7 * (iteration - 1) / max_iter)

            yield ToolProgress(
                stage=f"iteration_{iteration}",
                message=f"Research iteration {iteration}/{max_iter}",
                progress=progress_base,
                data={"iteration": iteration}
            )

            # Get gaps to pursue (from previous evaluation or initial checklist)
            if ctx.last_evaluation and not ctx.last_evaluation.passed:
                # Use gaps from evaluation
                gaps_to_pursue = ctx.last_evaluation.gaps
            else:
                # Use unsatisfied checklist items
                gaps_to_pursue = [item.description for item in ctx.get_unsatisfied_items()]

            if not gaps_to_pursue:
                logger.info("No gaps to pursue")
                break

            # Run single iteration
            async for progress in self._run_iteration(ctx, iteration, gaps_to_pursue, progress_base):
                yield progress

            # First evaluator: pass/fail with confidence
            yield ToolProgress(
                stage=f"iteration_{iteration}",
                message="Evaluating research completeness...",
                progress=progress_base + 0.05
            )

            evaluation = await self._llm_evaluate(ctx)
            ctx.metrics["llm_calls"] += 1

            if not evaluation:
                logger.warning("Evaluation failed, continuing")
                continue

            ctx.last_evaluation = evaluation

            # Update checklist status from evaluation
            for status in evaluation.checklist_status:
                ctx.checklist_status[status.id] = status

            satisfied = ctx.get_satisfied_count()
            total = len(ctx.checklist)

            if not evaluation.passed:
                # FAIL: Continue loop with identified gaps
                yield ToolProgress(
                    stage=f"iteration_{iteration}",
                    message=f"Need more info: {len(evaluation.gaps)} gaps identified ({satisfied}/{total} satisfied)",
                    progress=progress_base + 0.06,
                    data={"passed": False, "gaps": len(evaluation.gaps), "satisfied": satisfied}
                )
            elif evaluation.confidence < ctx.config.confidence_threshold:
                # PASS but low confidence: Get second opinion
                yield ToolProgress(
                    stage=f"iteration_{iteration}",
                    message=f"Low confidence ({evaluation.confidence:.0%}), getting second opinion...",
                    progress=progress_base + 0.06,
                    data={"passed": True, "confidence": evaluation.confidence}
                )

                second_opinion = await self._llm_second_opinion(ctx, evaluation)
                ctx.metrics["llm_calls"] += 1

                if second_opinion:
                    ctx.second_opinion = second_opinion

                    if second_opinion.confirmed:
                        logger.info(f"Second opinion confirmed (confidence: {second_opinion.final_confidence:.0%})")
                        yield ToolProgress(
                            stage=f"iteration_{iteration}",
                            message=f"Second opinion confirmed ({second_opinion.final_confidence:.0%} confidence)",
                            progress=progress_base + 0.07
                        )
                        break
                    else:
                        # Second opinion found more gaps
                        ctx.last_evaluation = EvaluationResult(
                            passed=False,
                            confidence=second_opinion.final_confidence,
                            gaps=second_opinion.additional_gaps,
                            checklist_status=evaluation.checklist_status,
                            reasoning=second_opinion.assessment
                        )
                        yield ToolProgress(
                            stage=f"iteration_{iteration}",
                            message=f"Second opinion: {len(second_opinion.additional_gaps)} more gaps",
                            progress=progress_base + 0.07,
                            data={"additional_gaps": len(second_opinion.additional_gaps)}
                        )
            else:
                # PASS with high confidence: Done
                logger.info(f"Research complete (confidence: {evaluation.confidence:.0%})")
                yield ToolProgress(
                    stage=f"iteration_{iteration}",
                    message=f"Research sufficient ({evaluation.confidence:.0%} confidence, {satisfied}/{total} satisfied)",
                    progress=progress_base + 0.06,
                    data={"passed": True, "confidence": evaluation.confidence, "satisfied": satisfied}
                )
                break

            # Save iteration state
            state_update = {
                "iterations": ctx.iterations,
                "knowledge_base": {
                    "facts": [{"fact": f.fact, "source_id": f.source_id} for f in ctx.knowledge_base],
                    "sources": [s.to_dict() for s in ctx.sources.values()]
                }
            }
            if ctx.last_evaluation:
                state_update["last_evaluation"] = {
                    "passed": ctx.last_evaluation.passed,
                    "confidence": ctx.last_evaluation.confidence,
                    "gaps": ctx.last_evaluation.gaps
                }
            await self._update_trace_state(ctx, state_update)

    async def _run_iteration(
        self,
        ctx: ResearchContext,
        iteration: int,
        gaps_to_pursue: List[str],
        progress_base: float
    ) -> AsyncGenerator[ToolProgress, None]:
        """Run a single research iteration: generate queries, search, process."""
        # Generate queries based on gaps
        queries = await self._llm_generate_queries(ctx, gaps_to_pursue)
        ctx.metrics["llm_calls"] += 1

        if not queries:
            logger.warning(f"Failed to generate queries for iteration {iteration}")
            return

        iteration_data = {
            "iteration": iteration,
            "gaps_pursued": gaps_to_pursue,
            "pubmed_queries": queries.pubmed_queries,
            "web_queries": queries.web_queries
        }

        # Yield search status
        for q in queries.pubmed_queries:
            yield ToolProgress(
                stage=f"iteration_{iteration}",
                message=f"Searching PubMed: \"{q[:50]}...\"" if len(q) > 50 else f"Searching PubMed: \"{q}\"",
                progress=progress_base + 0.02
            )

        for q in queries.web_queries:
            yield ToolProgress(
                stage=f"iteration_{iteration}",
                message=f"Searching Web: \"{q[:50]}...\"" if len(q) > 50 else f"Searching Web: \"{q}\"",
                progress=progress_base + 0.03
            )

        # Execute searches
        search_results = await self._execute_searches(ctx, queries)
        iteration_data["results_count"] = len(search_results)

        yield ToolProgress(
            stage=f"iteration_{iteration}",
            message=f"Processing {len(search_results)} results...",
            progress=progress_base + 0.04
        )

        # Process results
        if search_results:
            processed = await self._llm_process_results(ctx, gaps_to_pursue, search_results)
            ctx.metrics["llm_calls"] += 1

            if processed:
                ctx.knowledge_base.extend(processed.facts)

        iteration_data["checklist_progress"] = f"{ctx.get_satisfied_count()}/{len(ctx.checklist)}"
        ctx.iterations.append(iteration_data)

    async def _stage_synthesize_answer(
        self,
        ctx: ResearchContext
    ) -> AsyncGenerator[ToolProgress, None]:
        """Stage: Synthesize final answer from accumulated knowledge."""
        yield ToolProgress(
            stage="synthesizing",
            message="Synthesizing final answer...",
            progress=0.9
        )

        answer = await self._llm_synthesize_answer(ctx)
        ctx.metrics["llm_calls"] += 1

        if not answer:
            raise Exception("Failed to synthesize answer")

        ctx.final_answer = answer

        yield ToolProgress(
            stage="synthesizing",
            message="Answer synthesized",
            progress=0.95,
            data={"sources_used": len(ctx.sources)}
        )

    # =========================================================================
    # LLM HELPERS
    # =========================================================================

    async def _llm_refine_question(
        self,
        question: str,
        context: Optional[str]
    ) -> Optional[RefinedQuestion]:
        """Refine the question to be clear and unambiguous."""
        result = await call_llm(
            system_message="""You are a research assistant helping to refine research questions.
Given a question and optional context, produce:
1. A refined, unambiguous version of the question
2. Explicit scope boundaries (what's in/out of scope)
3. Key terms and concepts to search for""",
            user_message="""Question: {question}

Context: {context}

Refine this question for research.""",
            values={
                "question": question,
                "context": context or "No additional context provided"
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=RefinedQuestion
        )

        if result.ok:
            return RefinedQuestion(**result.data)
        logger.error(f"Failed to refine question: {result.error}")
        return None

    async def _llm_generate_checklist(
        self,
        refined_question: str
    ) -> Optional[Checklist]:
        """Generate a checklist of what a complete answer needs."""
        result = await call_llm(
            system_message="""You are a research assistant. Given a research question,
generate a checklist of 3-7 specific items that a comprehensive answer must address.
Each item should be specific and verifiable.""",
            user_message="""Question: {question}

Generate a checklist of what information is needed for a complete answer.""",
            values={"question": refined_question},
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=Checklist
        )

        if result.ok:
            return Checklist(**result.data)
        logger.error(f"Failed to generate checklist: {result.error}")
        return None

    async def _llm_generate_queries(
        self,
        ctx: ResearchContext,
        gaps: List[str]
    ) -> Optional[SearchQueries]:
        """Generate search queries based on gaps."""
        gaps_text = "\n".join(f"- {gap}" for gap in gaps)

        result = await call_llm(
            system_message="""You are a research assistant generating search queries.
Based on the research question and what information is still needed,
generate targeted search queries for PubMed (medical/scientific) and web search.

For PubMed queries, use proper PubMed search syntax with MeSH terms where appropriate.
For web queries, use natural language optimized for search engines.""",
            user_message="""Research question: {question}

Already known:
{knowledge_summary}

Still need to find:
{gaps}

Generate 1-2 PubMed queries and 1-2 web search queries to fill the gaps.""",
            values={
                "question": ctx.refined_question,
                "knowledge_summary": ctx.summarize_knowledge_base(),
                "gaps": gaps_text
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=SearchQueries
        )

        if result.ok:
            return SearchQueries(**result.data)
        logger.error(f"Failed to generate queries: {result.error}")
        return None

    async def _llm_process_results(
        self,
        ctx: ResearchContext,
        gaps: List[str],
        search_results: List[Dict[str, Any]]
    ) -> Optional[ProcessedResults]:
        """Extract relevant facts from search results."""
        gaps_text = "\n".join(f"- {gap}" for gap in gaps)
        results_text = ""
        for r in search_results[:20]:  # Limit to avoid token overflow
            results_text += f"\n[{r['source_id']}] {r['title']}\n{r['snippet']}\n"

        result = await call_llm(
            system_message="""You are a research assistant extracting information from search results.
For each relevant finding, extract the key fact, note which checklist items it addresses,
and include the source ID for citation.""",
            user_message="""Research question: {question}

Information gaps to address:
{gaps}

Search results:
{results}

Extract relevant facts and note which gaps they address.""",
            values={
                "question": ctx.refined_question,
                "gaps": gaps_text,
                "results": results_text
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=ProcessedResults
        )

        if result.ok:
            return ProcessedResults(**result.data)
        logger.error(f"Failed to process results: {result.error}")
        return None

    async def _llm_evaluate(
        self,
        ctx: ResearchContext
    ) -> Optional[EvaluationResult]:
        """
        First evaluator: Determine if research is sufficient.

        Returns pass/fail with confidence and specific gaps if failing.
        """
        checklist_text = "\n".join(f"- [{item.id}] {item.description}" for item in ctx.checklist)

        result = await call_llm(
            system_message="""You are a research evaluator assessing whether sufficient information has been gathered.

Your job:
1. Evaluate each checklist item: satisfied, partial, or unsatisfied
2. Decide if the research is SUFFICIENT to answer the question (passed=true/false)
3. Provide a confidence score (0.0-1.0) in your assessment
4. If NOT sufficient, list specific information gaps that need to be addressed

Be rigorous but practical. Research doesn't need to be perfect, but should adequately address the question.""",
            user_message="""Research question: {question}

Checklist items:
{checklist}

Knowledge accumulated:
{knowledge}

Number of sources found: {source_count}

Evaluate: Is this research sufficient to answer the question?""",
            values={
                "question": ctx.refined_question,
                "checklist": checklist_text,
                "knowledge": ctx.summarize_knowledge_base(),
                "source_count": len(ctx.sources)
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=EvaluationResult
        )

        if result.ok:
            return EvaluationResult(**result.data)
        logger.error(f"Failed to evaluate: {result.error}")
        return None

    async def _llm_second_opinion(
        self,
        ctx: ResearchContext,
        first_evaluation: EvaluationResult
    ) -> Optional[SecondOpinionResult]:
        """
        Second opinion evaluator for low-confidence passes.

        Reviews the first evaluation and either confirms or identifies additional gaps.
        """
        checklist_text = "\n".join(f"- [{item.id}] {item.description}" for item in ctx.checklist)

        result = await call_llm(
            system_message="""You are a senior research reviewer providing a second opinion.

The first evaluator passed this research but with low confidence. Your job:
1. Review the accumulated knowledge against the research question
2. Review the first evaluator's assessment
3. Either CONFIRM the pass or identify ADDITIONAL GAPS

Be thorough but fair. If the research adequately addresses the question, confirm it.
If there are significant gaps, identify them specifically.""",
            user_message="""Research question: {question}

Checklist items:
{checklist}

Knowledge accumulated:
{knowledge}

First evaluator's assessment:
- Passed: {first_passed}
- Confidence: {first_confidence}
- Reasoning: {first_reasoning}

Provide your second opinion: Is this research sufficient?""",
            values={
                "question": ctx.refined_question,
                "checklist": checklist_text,
                "knowledge": ctx.summarize_knowledge_base(),
                "first_passed": first_evaluation.passed,
                "first_confidence": f"{first_evaluation.confidence:.0%}",
                "first_reasoning": first_evaluation.reasoning
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=SecondOpinionResult
        )

        if result.ok:
            return SecondOpinionResult(**result.data)
        logger.error(f"Failed to get second opinion: {result.error}")
        return None

    async def _llm_synthesize_answer(
        self,
        ctx: ResearchContext
    ) -> Optional[SynthesizedAnswer]:
        """Synthesize a comprehensive answer from accumulated knowledge."""
        checklist_text = "\n".join(f"- {item.description}" for item in ctx.checklist)

        result = await call_llm(
            system_message="""You are a research assistant synthesizing a comprehensive answer.
Based on the research question, checklist, and accumulated knowledge:
1. Address each checklist item
2. Use inline citations [1], [2], etc.
3. Note any limitations or gaps
4. Be comprehensive but concise""",
            user_message="""Research question: {question}

Checklist to address:
{checklist}

Knowledge accumulated:
{knowledge}

Synthesize a comprehensive answer with citations.""",
            values={
                "question": ctx.refined_question,
                "checklist": checklist_text,
                "knowledge": ctx.summarize_knowledge_base()
            },
            model_config=DEFAULT_MODEL_CONFIG,
            response_schema=SynthesizedAnswer
        )

        if result.ok:
            return SynthesizedAnswer(**result.data)
        logger.error(f"Failed to synthesize answer: {result.error}")
        return None

    # =========================================================================
    # SEARCH HELPERS
    # =========================================================================

    async def _execute_searches(
        self,
        ctx: ResearchContext,
        queries: SearchQueries
    ) -> List[Dict[str, Any]]:
        """Execute PubMed and web searches in parallel."""
        tasks = []

        for query in queries.pubmed_queries:
            tasks.append(self._search_pubmed(ctx, query))
            ctx.metrics["pubmed_queries"] += 1

        for query in queries.web_queries:
            tasks.append(self._search_web(ctx, query))
            ctx.metrics["web_queries"] += 1

        results_lists = await asyncio.gather(*tasks, return_exceptions=True)

        results = []
        for result in results_lists:
            if isinstance(result, Exception):
                logger.error(f"Search failed: {result}")
                continue
            if isinstance(result, list):
                results.extend(result)

        ctx.metrics["sources_processed"] += len(results)
        return results

    async def _search_pubmed(
        self,
        ctx: ResearchContext,
        query: str
    ) -> List[Dict[str, Any]]:
        """Search PubMed and return formatted results."""
        results = []
        try:
            articles, _ = await search_pubmed(query=query, max_results=ctx.config.max_pubmed_results)

            for article in articles:
                source_id = f"pubmed_{article.source_id}"
                ctx.sources[source_id] = Source(
                    id=source_id,
                    source_type="pubmed",
                    title=article.title,
                    url=article.url,
                    snippet=article.abstract[:500] if article.abstract else "",
                    metadata={
                        "pmid": article.source_id,
                        "authors": article.authors,
                        "pub_year": article.pub_year,
                        "pub_month": article.pub_month,
                        "pub_day": article.pub_day,
                        "journal": article.journal
                    }
                )
                results.append({
                    "source_id": source_id,
                    "title": article.title,
                    "snippet": article.abstract[:500] if article.abstract else "",
                    "url": article.url
                })
        except Exception as e:
            logger.error(f"PubMed search failed for '{query}': {e}")
        return results

    async def _search_web(
        self,
        ctx: ResearchContext,
        query: str
    ) -> List[Dict[str, Any]]:
        """Search web and return formatted results."""
        results = []
        try:
            if not self.web_search_service.initialized:
                self.web_search_service.initialize()

            search_result = await self.web_search_service.search(
                search_term=query,
                num_results=ctx.config.max_web_results
            )

            for i, item in enumerate(search_result["search_results"]):
                source_id = f"web_{len(ctx.sources) + i + 1}"
                ctx.sources[source_id] = Source(
                    id=source_id,
                    source_type="web",
                    title=item.title,
                    url=item.url,
                    snippet=item.snippet,
                    metadata={
                        "published_date": item.published_date,
                        "source": item.source
                    }
                )
                results.append({
                    "source_id": source_id,
                    "title": item.title,
                    "snippet": item.snippet,
                    "url": item.url
                })
        except Exception as e:
            logger.error(f"Web search failed for '{query}': {e}")
        return results

    # =========================================================================
    # TRACE HELPERS
    # =========================================================================

    async def _update_trace_state(self, ctx: ResearchContext, state: Dict[str, Any]) -> None:
        """Update the trace state."""
        await self.trace_service.update_progress(
            trace_id=ctx.trace_id,
            state=state,
            merge_state=True
        )

    async def _complete_trace(self, ctx: ResearchContext) -> None:
        """Mark trace as completed."""
        await self.trace_service.complete_trace(
            trace_id=ctx.trace_id,
            result=ctx.final_result(),
            metrics=ctx.metrics
        )

    async def _fail_trace(self, ctx: ResearchContext, error: str) -> None:
        """Mark trace as failed."""
        await self.trace_service.fail_trace(
            trace_id=ctx.trace_id,
            error_message=error,
            metrics=ctx.metrics
        )

    # =========================================================================
    # OUTPUT FORMATTING
    # =========================================================================

    def _format_text_for_llm(self, ctx: ResearchContext) -> str:
        """
        Format a brief summary for the LLM.

        The full answer with citations is displayed in the Deep Research payload card,
        so we only need to give the LLM context about what was found and guidance
        on how to respond.
        """
        if not ctx.final_answer:
            return "Deep research completed but no answer was generated."

        # Count source types
        pubmed_count = sum(1 for s in ctx.sources.values() if s.source_type == "pubmed")
        web_count = sum(1 for s in ctx.sources.values() if s.source_type == "web")

        # Build source summary
        source_parts = []
        if pubmed_count:
            source_parts.append(f"{pubmed_count} PubMed articles")
        if web_count:
            source_parts.append(f"{web_count} web sources")
        sources_text = " and ".join(source_parts) if source_parts else "no sources"

        # Confidence info
        confidence_text = ""
        if ctx.last_evaluation:
            confidence_pct = int(ctx.last_evaluation.confidence * 100)
            confidence_text = f"Confidence: {confidence_pct}%"
            if ctx.second_opinion:
                confidence_text += " (verified by second opinion)"

        # Coverage info
        satisfied = ctx.get_satisfied_count()
        total = len(ctx.checklist)
        coverage_text = f"Coverage: {satisfied}/{total} checklist items satisfied"

        # Limitations summary
        limitations_text = ""
        if ctx.final_answer.limitations:
            limitations_text = f"Note: {len(ctx.final_answer.limitations)} limitation(s) identified"

        return f"""Deep research completed successfully.

**Research Summary**:
- Iterations: {ctx.metrics['total_iterations']}
- Sources: {sources_text}
- {confidence_text}
- {coverage_text}
{f"- {limitations_text}" if limitations_text else ""}

The full synthesized answer with inline citations is displayed in the **Deep Research panel** on the right. The user can expand sources and view limitations there.

Provide brief commentary on the findings or ask if they'd like clarification on any specific points."""
