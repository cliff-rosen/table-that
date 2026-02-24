"""
Lab Schemas

Schemas for Lab component functionality including iterative answer generation.
"""

from typing import List, Optional, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class GenerateAnswerRequest(BaseModel):
    """Request for iterative answer generation"""
    instruct: str = Field(..., description="The question or instruction")
    resp_format: str = Field(..., description="Desired response format")
    eval_crit: str = Field(..., description="Evaluation criteria")
    iter_max: int = Field(default=3, ge=1, le=10, description="Max iterations")
    score_threshold: float = Field(default=0.8, ge=0.0, le=1.0, description="Minimum score to accept answer")
    model: Optional[str] = Field(default="gpt-4o", description="LLM model to use")


class AnswerResponse(BaseModel):
    """Response from answer generation"""
    answer: str = Field(description="The generated answer")


class EvaluationResponse(BaseModel):
    """Response from answer evaluation"""
    score: float = Field(description="Score from 0.0 to 1.0 indicating how well the answer meets criteria")
    meets_criteria: bool = Field(description="Whether the answer meets the evaluation criteria")
    evaluation_reasoning: str = Field(description="Detailed explanation of the evaluation")
    improvement_suggestions: List[str] = Field(
        default_factory=list,
        description="Specific suggestions for improvement if criteria not fully met"
    )


class IterationData(BaseModel):
    """Data for each iteration"""
    answer: str
    evaluation: EvaluationResponse
    iteration_number: int


class GenerateAnswerResponse(BaseModel):
    """Response for iterative answer generation"""
    final_answer: str
    iterations: List[IterationData]
    success: bool
    total_iterations: int
    final_score: float
    metadata: Optional[Dict[str, Any]] = None


class QuestionRefinementRequest(BaseModel):
    """Request for question and criteria refinement"""
    question: str = Field(..., description="The initial question")


class QuestionRefinementResponse(BaseModel):
    """Response with refined question and suggested criteria"""
    refined_question: str = Field(description="Refined version of the question")
    suggested_format: str = Field(description="Suggested response format")
    suggested_criteria: str = Field(description="Suggested evaluation criteria")
    refinement_reasoning: str = Field(description="Explanation of refinements made")


class StreamMessage(BaseModel):
    """Streaming status message"""
    type: str = Field(description="Message type: 'status', 'iteration', 'result', 'error'")
    message: str = Field(description="Human-readable message")
    data: Optional[Dict[str, Any]] = Field(default=None, description="Additional data")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class StreamingGenerateAnswerRequest(BaseModel):
    """Request for streaming iterative answer generation"""
    instruct: str = Field(..., description="The question or instruction")
    resp_format: str = Field(..., description="Desired response format")
    eval_crit: str = Field(..., description="Evaluation criteria")
    iter_max: int = Field(default=3, ge=1, le=10, description="Max iterations")
    score_threshold: float = Field(default=0.8, ge=0.0, le=1.0, description="Minimum score to accept answer")
    model: Optional[str] = Field(default="gpt-4o", description="LLM model to use")