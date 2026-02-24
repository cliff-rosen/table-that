"""
Lab Router

API endpoints for Lab functionality including iterative answer generation.
"""

import logging
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from schemas.lab import (
    QuestionRefinementRequest, QuestionRefinementResponse,
    StreamingGenerateAnswerRequest
)
from services.auth_service import validate_token
from services.iterative_answer_service import IterativeAnswerService

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/lab",
    tags=["lab"],
    dependencies=[Depends(validate_token)]
)


@router.post("/refine-question", response_model=QuestionRefinementResponse)
async def refine_question(
    request: QuestionRefinementRequest,
    current_user = Depends(validate_token)
) -> QuestionRefinementResponse:
    """
    Refine a question and suggest evaluation criteria
    """
    try:
        logger.info(f"User {current_user.user_id} refining question: {request.question[:100]}...")
        
        service = IterativeAnswerService()
        response = await service.refine_question(request.question)
        
        logger.info(f"Question refinement completed for user {current_user.user_id}")
        return response
        
    except Exception as e:
        logger.error(f"Question refinement failed for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Question refinement failed: {str(e)}")


@router.post("/generate-answer-stream")
async def generate_answer_stream(
    request: StreamingGenerateAnswerRequest,
    current_user = Depends(validate_token)
):
    """
    Generate an answer iteratively with streaming status updates
    """
    try:
        logger.info(f"User {current_user.user_id} starting streaming answer generation")
        
        service = IterativeAnswerService()
        
        async def generate():
            try:
                async for message in service.generate_answer_streaming(
                    instruct=request.instruct,
                    resp_format=request.resp_format,
                    eval_crit=request.eval_crit,
                    iter_max=request.iter_max,
                    model=request.model,
                    score_threshold=request.score_threshold
                ):
                    yield message
            except Exception as e:
                logger.error(f"Streaming error for user {current_user.user_id}: {e}", exc_info=True)
                # Send error message in SSE format
                error_message = {
                    "type": "error",
                    "message": f"Generation failed: {str(e)}",
                    "data": {"error": str(e)}
                }
                yield f"data: {error_message}\n\n"
        
        return StreamingResponse(
            generate(),
            media_type="text/plain",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"  # Disable nginx buffering
            }
        )
        
    except Exception as e:
        logger.error(f"Failed to start streaming for user {current_user.user_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to start answer generation: {str(e)}")