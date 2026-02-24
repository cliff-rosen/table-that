"""
Prompt Testing API endpoints

Endpoints for testing LLM prompts in isolation:
- Get default prompts and available slugs
- Test summary prompts (executive, category, article)
- Test categorization prompts
- Test categorization on articles
"""

import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field

from database import get_async_db
from models import User
from schemas.research_stream import PromptTemplate, CategorizationPrompt
from schemas.canonical_types import CanonicalResearchArticle
from schemas.llm import ModelConfig
from services.prompt_testing_service import PromptTestingService, get_prompt_testing_service
from services.report_summary_service import DEFAULT_PROMPTS, AVAILABLE_SLUGS
from services.article_categorization_service import ArticleCategorizationService
from services.retrieval_testing_service import (
    RetrievalTestingService,
    get_retrieval_testing_service
)
from routers.auth import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prompt-testing", tags=["prompt-testing"])


# =============================================================================
# Request/Response Models
# =============================================================================

class DefaultPromptsResponse(BaseModel):
    """Response containing default prompts and available slugs"""
    prompts: Dict[str, PromptTemplate]
    available_slugs: Dict[str, List[Dict[str, str]]]


class CategorizationDefaultsResponse(BaseModel):
    """Response containing default categorization prompt and available slugs"""
    prompt: CategorizationPrompt
    available_slugs: List[Dict[str, str]]


class TestSummaryPromptRequest(BaseModel):
    """Request to test a summary prompt (executive, category, or article)"""
    prompt_type: str = Field(..., description="'executive_summary', 'category_summary', or 'article_summary'")
    prompt: PromptTemplate = Field(..., description="The prompt to test")
    sample_data: Optional[Dict[str, Any]] = Field(None, description="Sample data with articles and context")
    report_id: Optional[int] = Field(None, description="Reference to an existing report to use as test data")
    category_id: Optional[str] = Field(None, description="Category ID for category_summary test")
    article_index: Optional[int] = Field(0, description="Article index for article_summary test (0-based)")
    llm_config: Optional[ModelConfig] = Field(None, description="LLM model configuration (uses defaults if not provided)")


class TestSummaryPromptResponse(BaseModel):
    """Response from testing a summary prompt"""
    rendered_system_prompt: str
    rendered_user_prompt: str
    llm_response: Optional[str] = None
    error: Optional[str] = None


class TestCategorizationPromptRequest(BaseModel):
    """Request to test a categorization prompt"""
    prompt: CategorizationPrompt = Field(..., description="The categorization prompt to test")
    sample_data: Optional[Dict[str, Any]] = Field(
        None,
        description="Sample article data with title, abstract, journal, publication_date, categories_json"
    )
    report_id: Optional[int] = Field(None, description="Reference to an existing report to get an article from")
    article_index: Optional[int] = Field(0, description="Which article to use from the report (default: first)")
    llm_config: Optional[ModelConfig] = Field(None, description="LLM model configuration (uses defaults if not provided)")


class TestCategorizationPromptResponse(BaseModel):
    """Response from testing a categorization prompt"""
    rendered_system_prompt: str
    rendered_user_prompt: str
    llm_response: Optional[str] = None
    parsed_category_id: Optional[str] = None
    error: Optional[str] = None


class TestCategorizationRequest(BaseModel):
    """Request to test categorization on articles using stream's categories"""
    stream_id: int = Field(..., description="Research stream ID (to get categories)")
    articles: List[CanonicalResearchArticle] = Field(..., description="Articles to categorize")
    llm_config: Optional[ModelConfig] = Field(None, description="LLM model configuration (uses defaults if not provided)")


class CategoryAssignment(BaseModel):
    """Result of categorizing a single article"""
    article: CanonicalResearchArticle = Field(..., description="The article")
    assigned_categories: List[str] = Field(..., description="Assigned category IDs")


class TestCategorizationResponse(BaseModel):
    """Response from testing categorization on articles"""
    results: List[CategoryAssignment] = Field(..., description="Categorization results")
    count: int = Field(..., description="Total articles processed")
    category_distribution: Dict[str, int] = Field(..., description="Count per category")


class TestStanceAnalysisPromptRequest(BaseModel):
    """Request to test a stance analysis prompt"""
    prompt: PromptTemplate = Field(..., description="The stance analysis prompt to test")
    sample_data: Optional[Dict[str, Any]] = Field(None, description="Sample article data")
    report_id: Optional[int] = Field(None, description="Reference to an existing report to get an article from")
    article_index: Optional[int] = Field(0, description="Which article to use from the report (default: first)")
    llm_config: Optional[ModelConfig] = Field(None, description="LLM model configuration (uses defaults if not provided)")


class TestStanceAnalysisPromptResponse(BaseModel):
    """Response from testing a stance analysis prompt"""
    rendered_system_prompt: str
    rendered_user_prompt: str
    llm_response: Optional[str] = None
    parsed_stance: Optional[str] = None
    error: Optional[str] = None


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/defaults", response_model=DefaultPromptsResponse)
async def get_default_prompts():
    """Get the default prompts and available slugs for each prompt type"""
    prompts = {
        key: PromptTemplate(
            system_prompt=value["system_prompt"],
            user_prompt_template=value["user_prompt_template"]
        )
        for key, value in DEFAULT_PROMPTS.items()
    }
    return DefaultPromptsResponse(
        prompts=prompts,
        available_slugs=AVAILABLE_SLUGS
    )


@router.get("/defaults/categorization", response_model=CategorizationDefaultsResponse)
async def get_categorization_defaults():
    """Get the default categorization prompt and available slugs"""
    defaults = ArticleCategorizationService.get_default_prompts()
    slugs = ArticleCategorizationService.get_available_slugs()

    return CategorizationDefaultsResponse(
        prompt=CategorizationPrompt(
            system_prompt=defaults["system_prompt"],
            user_prompt_template=defaults["user_prompt_template"]
        ),
        available_slugs=slugs
    )


@router.post("/test-summary", response_model=TestSummaryPromptResponse)
async def test_summary_prompt(
    request: TestSummaryPromptRequest,
    db: AsyncSession = Depends(get_async_db),
    current_user: User = Depends(get_current_user)
):
    """Test a summary prompt (executive, category, or article) with sample data or report data"""
    if not request.sample_data and not request.report_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either sample_data or report_id must be provided"
        )

    service = PromptTestingService(db)

    try:
        result = await service.test_summary_prompt(
            prompt_type=request.prompt_type,
            prompt=request.prompt,
            user_id=current_user.user_id,
            sample_data=request.sample_data,
            report_id=request.report_id,
            category_id=request.category_id,
            article_index=request.article_index,
            llm_config=request.llm_config
        )
        return TestSummaryPromptResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        logger.error(f"Error testing prompt: {e}", exc_info=True)
        return TestSummaryPromptResponse(
            rendered_system_prompt=request.prompt.system_prompt,
            rendered_user_prompt=request.prompt.user_prompt_template,
            error=str(e)
        )


@router.post("/test-categorization-prompt", response_model=TestCategorizationPromptResponse)
async def test_categorization_prompt(
    request: TestCategorizationPromptRequest,
    service: PromptTestingService = Depends(get_prompt_testing_service),
    current_user: User = Depends(get_current_user)
):
    """Test a categorization prompt by rendering it with sample data and running it through the LLM"""
    if not request.sample_data and not request.report_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either sample_data or report_id must be provided"
        )

    try:
        result = await service.test_categorization_prompt(
            prompt=request.prompt,
            user_id=current_user.user_id,
            sample_data=request.sample_data,
            report_id=request.report_id,
            article_index=request.article_index or 0,
            llm_config=request.llm_config
        )
        return TestCategorizationPromptResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        logger.error(f"Error testing categorization prompt: {e}", exc_info=True)
        return TestCategorizationPromptResponse(
            rendered_system_prompt=request.prompt.system_prompt,
            rendered_user_prompt=request.prompt.user_prompt_template,
            error=str(e)
        )


@router.post("/test-categorization", response_model=TestCategorizationResponse)
async def test_categorization(
    request: TestCategorizationRequest,
    service: RetrievalTestingService = Depends(get_retrieval_testing_service),
    current_user: User = Depends(get_current_user)
):
    """
    Test categorization on articles using stream's Layer 3 categories.

    This tests how articles would be categorized using the stream's configured
    categorization prompt and categories.
    """
    try:
        results_list = await service.categorize_articles(
            stream_id=request.stream_id,
            articles=request.articles,
            llm_config=request.llm_config
        )

        # Convert dicts to CategoryAssignment models
        category_results = [
            CategoryAssignment(**result_dict)
            for result_dict in results_list
        ]

        # Calculate category distribution
        category_distribution = {}
        for result in category_results:
            for cat_id in result.assigned_categories:
                category_distribution[cat_id] = category_distribution.get(cat_id, 0) + 1

        return TestCategorizationResponse(
            results=category_results,
            count=len(category_results),
            category_distribution=category_distribution
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error testing categorization: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/test-stance-analysis-prompt", response_model=TestStanceAnalysisPromptResponse)
async def test_stance_analysis_prompt(
    request: TestStanceAnalysisPromptRequest,
    service: PromptTestingService = Depends(get_prompt_testing_service),
    current_user: User = Depends(get_current_user)
):
    """Test a stance analysis prompt by rendering it with sample data and running through LLM"""
    if not request.sample_data and not request.report_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either sample_data or report_id must be provided"
        )

    try:
        result = await service.test_stance_analysis_prompt(
            prompt=request.prompt,
            user_id=current_user.user_id,
            sample_data=request.sample_data,
            report_id=request.report_id,
            article_index=request.article_index or 0,
            llm_config=request.llm_config
        )
        return TestStanceAnalysisPromptResponse(**result)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        logger.error(f"Error testing stance analysis prompt: {e}", exc_info=True)
        return TestStanceAnalysisPromptResponse(
            rendered_system_prompt=request.prompt.system_prompt,
            rendered_user_prompt=request.prompt.user_prompt_template,
            error=str(e)
        )
