"""
Tablizer API Router

All operations for the Tablizer table workbench, including:
- PubMed article search
- Clinical trials search
- AI column operations (filter for boolean/number, extract for text)

Used by both PubMed Tablizer (/pubmed) and TrialScout (/trialscout) frontends.
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from typing import List, Optional, Dict, Any, Literal
from pydantic import BaseModel, Field

from models import User
from routers.auth import get_current_user
from schemas.canonical_types import CanonicalResearchArticle, CanonicalClinicalTrial
from agents.prompts.llm import LLMOptions

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/tablizer", tags=["tablizer"])


# ============================================================================
# PubMed Search
# ============================================================================

class PubMedSearchRequest(BaseModel):
    """Request for PubMed search"""
    query_expression: str = Field(..., description="PubMed query expression")
    max_pmids: int = Field(500, ge=1, le=1000, description="Maximum PMIDs to retrieve for comparison")
    articles_to_fetch: int = Field(20, ge=1, le=500, description="Number of articles to fetch with full data")
    start_date: Optional[str] = Field(None, description="Start date for filtering (YYYY/MM/DD)")
    end_date: Optional[str] = Field(None, description="End date for filtering (YYYY/MM/DD)")
    date_type: Optional[Literal["publication", "entry"]] = Field('publication', description="Date type for filtering")
    sort_by: Optional[Literal["relevance", "date"]] = Field('relevance', description="Sort order")


class PubMedSearchResponse(BaseModel):
    """Response with PMIDs for comparison + articles for display"""
    all_pmids: List[str] = Field(..., description="All PMIDs matching query (up to max_pmids)")
    articles: List[CanonicalResearchArticle] = Field(..., description="Full article data for first N")
    total_results: int = Field(..., description="Total number of results matching the query")
    pmids_retrieved: int = Field(..., description="Number of PMIDs retrieved")
    articles_retrieved: int = Field(..., description="Number of articles with full data")


@router.post("/search/pubmed", response_model=PubMedSearchResponse)
async def search_pubmed(
    request: PubMedSearchRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Search PubMed and return PMIDs for comparison + articles for display.

    Optimized for Tablizer: returns up to max_pmids PMIDs (fast) plus
    full article data for the first articles_to_fetch articles.
    """
    logger.info(f"search_pubmed - user_id={current_user.user_id}, query='{request.query_expression[:50]}...'")

    from services.pubmed_service import PubMedService
    from schemas.research_article_converters import pubmed_article_to_research

    try:
        pubmed_service = PubMedService()

        # Get all PMIDs (fast - no article data)
        all_pmids, total_count = await pubmed_service.get_article_ids(
            query=request.query_expression,
            max_results=request.max_pmids,
            sort_by=request.sort_by,
            start_date=request.start_date,
            end_date=request.end_date,
            date_type=request.date_type
        )

        logger.info(f"Retrieved {len(all_pmids)} PMIDs from {total_count} total results")

        # Fetch full article data for first N PMIDs
        articles = []
        if all_pmids:
            pmids_to_fetch = all_pmids[:request.articles_to_fetch]
            raw_articles = await pubmed_service.get_articles_from_ids(pmids_to_fetch)

            for article in raw_articles:
                try:
                    research_article = pubmed_article_to_research(article)
                    articles.append(research_article)
                except Exception as e:
                    logger.error(f"Error converting article {article.PMID}: {e}")

        logger.info(f"search_pubmed complete - user_id={current_user.user_id}, pmids={len(all_pmids)}, articles={len(articles)}")
        return PubMedSearchResponse(
            all_pmids=all_pmids,
            articles=articles,
            total_results=total_count,
            pmids_retrieved=len(all_pmids),
            articles_retrieved=len(articles)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"search_pubmed failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"PubMed search failed: {str(e)}"
        )


# ============================================================================
# Clinical Trials Search
# ============================================================================

class TrialSearchRequest(BaseModel):
    """Request for clinical trial search"""
    condition: Optional[str] = Field(None, description="Disease or condition to search for")
    intervention: Optional[str] = Field(None, description="Drug, treatment, or intervention name")
    sponsor: Optional[str] = Field(None, description="Sponsor organization name")
    status: Optional[List[str]] = Field(None, description="Recruitment statuses (RECRUITING, COMPLETED, etc.)")
    phase: Optional[List[str]] = Field(None, description="Study phases (PHASE1, PHASE2, PHASE3, etc.)")
    study_type: Optional[str] = Field(None, description="Study type (INTERVENTIONAL, OBSERVATIONAL)")
    location: Optional[str] = Field(None, description="Country or location")
    start_date: Optional[str] = Field(None, description="Start date filter (YYYY-MM-DD)")
    end_date: Optional[str] = Field(None, description="End date filter (YYYY-MM-DD)")
    max_results: int = Field(100, ge=1, le=500, description="Maximum trials to return")


class TrialSearchResponse(BaseModel):
    """Response from clinical trial search"""
    trials: List[CanonicalClinicalTrial] = Field(..., description="Trials returned")
    total_results: int = Field(..., description="Total number of results matching the query")
    returned_count: int = Field(..., description="Number of trials returned in this response")


@router.post("/search/trials", response_model=TrialSearchResponse)
async def search_trials(
    request: TrialSearchRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Search ClinicalTrials.gov for clinical trials.
    """
    logger.info(f"search_trials - user_id={current_user.user_id}, condition={request.condition}, intervention={request.intervention}")

    from services.clinical_trials_service import get_clinical_trials_service

    try:
        service = get_clinical_trials_service()

        all_trials = []
        total_count = 0
        page_token = None
        remaining = request.max_results

        while remaining > 0:
            trials, total_count, next_token = service.search_trials(
                condition=request.condition,
                intervention=request.intervention,
                sponsor=request.sponsor,
                status=request.status,
                phase=request.phase,
                study_type=request.study_type,
                location=request.location,
                start_date=request.start_date,
                end_date=request.end_date,
                max_results=min(remaining, 100),
                page_token=page_token
            )

            all_trials.extend(trials)
            remaining -= len(trials)

            if not next_token or len(trials) == 0:
                break
            page_token = next_token

        logger.info(f"search_trials complete - user_id={current_user.user_id}, trials={len(all_trials)}, total={total_count}")

        return TrialSearchResponse(
            trials=all_trials,
            total_results=total_count,
            returned_count=len(all_trials)
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"search_trials failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Clinical trials search failed: {str(e)}"
        )


class TrialDetailRequest(BaseModel):
    """Request for trial details by NCT ID"""
    nct_id: str = Field(..., description="NCT identifier (e.g., NCT00000000)")


@router.post("/trials/detail", response_model=CanonicalClinicalTrial)
async def get_trial_detail(
    request: TrialDetailRequest,
    current_user: User = Depends(get_current_user)
):
    """Get detailed information about a specific clinical trial."""
    logger.info(f"get_trial_detail - user_id={current_user.user_id}, nct_id={request.nct_id}")

    from services.clinical_trials_service import get_clinical_trials_service

    try:
        service = get_clinical_trials_service()
        trial = service.get_trial_by_nct_id(request.nct_id)

        if not trial:
            logger.warning(f"get_trial_detail - not found - user_id={current_user.user_id}, nct_id={request.nct_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Trial {request.nct_id} not found"
            )

        logger.info(f"get_trial_detail complete - user_id={current_user.user_id}, nct_id={request.nct_id}")
        return trial

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_trial_detail failed - user_id={current_user.user_id}, nct_id={request.nct_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get trial details: {str(e)}"
        )


# ============================================================================
# AI Column: Filter (Boolean/Number output)
# ============================================================================

class FilterRequest(BaseModel):
    """Request to filter items using AI (for boolean/score AI columns)"""
    items: List[Dict[str, Any]] = Field(..., description="Items to filter (articles or trials)")
    item_type: Literal["article", "trial"] = Field("article", description="Type of items")
    criteria: str = Field(..., description="Natural language filter criteria")
    threshold: float = Field(0.5, ge=0.0, le=1.0, description="Minimum score to pass")
    output_type: Literal["boolean", "number"] = Field("boolean", description="Output type (number = score)")
    # Score-specific options (only used when output_type="number")
    min_value: float = Field(0.0, description="Minimum score value (for score output)")
    max_value: float = Field(10.0, description="Maximum score value (for score output)")
    interval: Optional[float] = Field(None, description="Score interval/step size (e.g., 0.5, 1)")


class FilterResultItem(BaseModel):
    """Result for a single filtered item"""
    id: str = Field(..., description="Item identifier (pmid or nct_id)")
    passed: bool = Field(..., description="Whether item passed the filter")
    value: float = Field(..., description="The evaluated value (for number output type)")
    confidence: float = Field(..., description="Confidence score (0.0-1.0)")
    reasoning: str = Field(..., description="Explanation of the result")


class FilterResponse(BaseModel):
    """Response from filter operation"""
    results: List[FilterResultItem] = Field(..., description="Filter results for each item")
    count: int = Field(..., description="Total items processed")
    passed: int = Field(..., description="Number of items that passed")
    failed: int = Field(..., description="Number of items that failed")


@router.post("/filter", response_model=FilterResponse)
async def filter_items(
    request: FilterRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Apply AI filtering to items for boolean/number AI columns.

    For boolean output: Returns passed=true/false based on criteria match
    For number output: Returns score representing the evaluation
    """
    logger.info(f"filter_items - user_id={current_user.user_id}, item_type={request.item_type}, items={len(request.items)}, output_type={request.output_type}")

    from services.ai_evaluation_service import get_ai_evaluation_service

    try:
        service = get_ai_evaluation_service()

        # Prepare items - normalizes to use "id" field
        prepared_items = [_prepare_item_for_evaluation(item, request.item_type) for item in request.items]

        options = LLMOptions(max_concurrent=50)

        # Run evaluation based on output type
        # request.criteria IS the complete prompt template with item field placeholders
        if request.output_type == "boolean":
            eval_results = await service.filter(
                items=prepared_items,
                prompt_template=request.criteria,
                include_reasoning=True,
                options=options
            )
        else:  # "number" (score)
            # Append score range info to ensure LLM knows the expected range
            prompt_template = request.criteria + "\n\nProvide a score from {min_value} to {max_value}."
            eval_results = await service.score(
                items=prepared_items,
                prompt_template=prompt_template,
                min_value=request.min_value,
                max_value=request.max_value,
                interval=request.interval,
                include_reasoning=True,
                options=options
            )

        # Ensure results is a list
        if not isinstance(eval_results, list):
            eval_results = [eval_results]

        # Convert results - match by position (results are in same order as input)
        results = []
        for i, result in enumerate(eval_results):
            item_id = prepared_items[i]["id"] if i < len(prepared_items) else ""

            if result.error:
                results.append(FilterResultItem(
                    id=item_id,
                    passed=False,
                    value=0.0,
                    confidence=0.0,
                    reasoning=result.error
                ))
                continue

            data = result.data or {}
            if request.output_type == "boolean":
                passed = data.get("value") is True
                value = 1.0 if passed else 0.0
                confidence = float(data.get("confidence", 0.0) or 0.0)
            else:  # "number"
                raw_value = data.get("value")
                value = float(raw_value) if raw_value is not None else 0.0
                passed = value >= request.threshold
                confidence = float(data.get("confidence", 0.0) or 0.0)

            results.append(FilterResultItem(
                id=item_id,
                passed=passed,
                value=value,
                confidence=confidence,
                reasoning=str(data.get("reasoning", "") or "")
            ))

        passed_count = sum(1 for r in results if r.passed)

        logger.info(f"filter_items complete - user_id={current_user.user_id}, processed={len(results)}, passed={passed_count}")
        return FilterResponse(
            results=results,
            count=len(results),
            passed=passed_count,
            failed=len(results) - passed_count
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"filter_items failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Filter operation failed: {str(e)}"
        )


# ============================================================================
# AI Column: Extract (Text output)
# ============================================================================

class ExtractRequest(BaseModel):
    """Request to extract text from items (for text AI columns)"""
    items: List[Dict[str, Any]] = Field(..., description="Items to extract from (articles or trials)")
    item_type: Literal["article", "trial"] = Field("article", description="Type of items")
    prompt: str = Field(..., description="What to extract (e.g., 'What is the study design?')")


class ExtractResultItem(BaseModel):
    """Result for a single extraction"""
    id: str = Field(..., description="Item identifier (pmid or nct_id)")
    text_value: str = Field(..., description="Extracted text answer")
    confidence: float = Field(..., description="Confidence score (0.0-1.0)")
    reasoning: str = Field("", description="Brief explanation")


class ExtractResponse(BaseModel):
    """Response from extract operation"""
    results: List[ExtractResultItem] = Field(..., description="Extraction results for each item")
    count: int = Field(..., description="Total items processed")
    succeeded: int = Field(..., description="Number of successful extractions")
    failed: int = Field(..., description="Number of failed extractions")


@router.post("/extract", response_model=ExtractResponse)
async def extract_from_items(
    request: ExtractRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Extract text information from items for text AI columns.

    Uses the AI evaluation service to pull specific information based on the prompt.
    """
    logger.info(f"extract_from_items - user_id={current_user.user_id}, item_type={request.item_type}, items={len(request.items)}")

    from services.ai_evaluation_service import get_ai_evaluation_service

    try:
        service = get_ai_evaluation_service()

        # Prepare items as dicts
        prepared_items = [_prepare_item_for_evaluation(item, request.item_type) for item in request.items]

        options = LLMOptions(max_concurrent=50)

        # Run extraction
        # request.prompt IS the complete prompt template with item field placeholders
        eval_results = await service.extract(
            items=prepared_items,
            prompt_template=request.prompt,
            output_type="text",
            include_reasoning=True,
            options=options
        )

        # Ensure results is a list
        if not isinstance(eval_results, list):
            eval_results = [eval_results]

        # Convert results - match by position (results are in same order as input)
        results = []
        succeeded = 0
        failed = 0

        for i, result in enumerate(eval_results):
            item_id = prepared_items[i]["id"] if i < len(prepared_items) else ""

            if result.error:
                failed += 1
                results.append(ExtractResultItem(
                    id=item_id,
                    text_value="[Extraction failed]",
                    confidence=0.0,
                    reasoning=result.error
                ))
            else:
                succeeded += 1
                data = result.data or {}
                results.append(ExtractResultItem(
                    id=item_id,
                    text_value=str(data.get("value", "")) if data.get("value") else "",
                    confidence=data.get("confidence", 0.0),
                    reasoning=data.get("reasoning", "")
                ))

        logger.info(f"extract_from_items complete - user_id={current_user.user_id}, succeeded={succeeded}, failed={failed}")
        return ExtractResponse(
            results=results,
            count=len(results),
            succeeded=succeeded,
            failed=failed
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"extract_from_items failed - user_id={current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Extract operation failed: {str(e)}"
        )


# ============================================================================
# Helper Functions
# ============================================================================

def _prepare_item_for_evaluation(item: Dict[str, Any], item_type: str) -> Dict[str, Any]:
    """
    Prepare an item dict for AI evaluation.
    Normalizes article/trial data into a consistent format.
    """
    if item_type == "trial":
        return _prepare_trial(item)
    else:
        return _prepare_article(item)


def _prepare_article(article: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare article dict for evaluation."""
    authors = article.get("authors", [])
    if isinstance(authors, list):
        authors = ", ".join(authors)

    # Build publication date string from pub_year/month/day
    from utils.date_utils import format_pub_date
    pub_date_str = format_pub_date(
        article.get("pub_year"),
        article.get("pub_month"),
        article.get("pub_day"),
    )

    return {
        "id": article.get("pmid") or article.get("id", ""),
        "title": article.get("title", ""),
        "abstract": article.get("abstract", ""),
        "authors": authors,
        "journal": article.get("journal", ""),
        "publication_year": pub_date_str,
    }


def _prepare_trial(trial: Dict[str, Any]) -> Dict[str, Any]:
    """Prepare trial dict for evaluation."""
    # Build abstract from trial fields
    abstract_parts = []
    if trial.get("brief_summary"):
        abstract_parts.append(trial["brief_summary"])
    if trial.get("conditions"):
        conditions = trial["conditions"]
        if isinstance(conditions, list):
            abstract_parts.append(f"Conditions: {', '.join(conditions)}")
    if trial.get("interventions"):
        interventions = trial["interventions"]
        if isinstance(interventions, list):
            interv_names = [i.get("name", "") if isinstance(i, dict) else str(i) for i in interventions]
            abstract_parts.append(f"Interventions: {', '.join(interv_names)}")
    if trial.get("phase"):
        abstract_parts.append(f"Phase: {trial['phase']}")
    if trial.get("status"):
        abstract_parts.append(f"Status: {trial['status']}")

    sponsor = trial.get("lead_sponsor")
    sponsor_name = sponsor.get("name") if isinstance(sponsor, dict) else ""

    return {
        "id": trial.get("nct_id", ""),
        "nct_id": trial.get("nct_id", ""),
        "title": trial.get("title") or trial.get("brief_title", ""),
        "abstract": "\n".join(abstract_parts),
        "sponsor": sponsor_name,
        "phase": trial.get("phase", ""),
        "status": trial.get("status", ""),
        "conditions": ", ".join(trial.get("conditions", [])) if isinstance(trial.get("conditions"), list) else "",
        "study_type": trial.get("study_type", ""),
    }
