"""
Iterative Answer Service

Service for generating answers iteratively based on evaluation criteria.
Uses the generate → evaluate → feedback → repeat pattern.
Supports streaming status updates.
"""

from typing import Dict, Any, List, Optional, AsyncGenerator
import logging
import json
import uuid
from datetime import datetime

from schemas.llm import ChatMessage, MessageRole
from schemas.lab import (
    GenerateAnswerRequest, IterationData, EvaluationResponse, 
    StreamMessage, QuestionRefinementRequest, QuestionRefinementResponse
)
from agents.prompts.answer_generator_prompt_caller import AnswerGeneratorPromptCaller
from agents.prompts.answer_evaluator_prompt_caller import AnswerEvaluatorPromptCaller
from agents.prompts.question_refiner_prompt_caller import QuestionRefinerPromptCaller

logger = logging.getLogger(__name__)


class IterativeAnswerService:
    """Service for iterative answer generation and evaluation"""
    
    def __init__(self, score_threshold: float = 0.8):
        self.generator = AnswerGeneratorPromptCaller()
        self.evaluator = AnswerEvaluatorPromptCaller()
        self.refiner = QuestionRefinerPromptCaller()
        self.score_threshold = score_threshold
        
    async def generate_answer(
        self,
        instruct: str,
        resp_format: str,
        eval_crit: str,
        iter_max: int = 3,
        model: str = "gpt-4o",
        score_threshold: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Generate an answer iteratively until it meets criteria or max iterations reached
        
        Process:
        1. Generate answer based on instruction and format
        2. Evaluate answer against criteria
        3. If score >= threshold, accept; otherwise iterate with feedback
        
        Args:
            instruct: The question or instruction
            resp_format: Desired response format
            eval_crit: Evaluation criteria
            iter_max: Maximum number of iterations
            model: LLM model to use
            score_threshold: Minimum score to accept answer
            
        Returns:
            Dictionary containing:
            - final_answer: The best answer generated
            - iterations: List of all iterations with evaluations
            - success: Whether score threshold was met
            - total_iterations: Number of iterations used
            - final_score: Score of the final answer
            - metadata: Additional information
        """
        threshold = score_threshold or self.score_threshold
        iterations = []
        feedback = None
        start_time = datetime.utcnow()
        
        logger.info(f"Starting iterative answer generation: {iter_max} max iterations, threshold {threshold}")
        
        for i in range(iter_max):
            iteration_start = datetime.utcnow()
            
            try:
                # Step 1: Generate answer
                logger.info(f"Iteration {i+1}: Generating answer")
                generation_messages = self._build_generation_messages(
                    instruct, 
                    resp_format,
                    feedback=feedback
                )
                
                answer_response = await self.generator.invoke(
                    messages=generation_messages,
                    instruction=instruct,
                    response_format=resp_format
                )
                
                # Step 2: Evaluate answer
                logger.info(f"Iteration {i+1}: Evaluating answer")
                evaluation_messages = self._build_evaluation_messages(
                    answer_response.answer,
                    eval_crit
                )
                
                eval_response = await self.evaluator.invoke(
                    messages=evaluation_messages,
                    answer=answer_response.answer,
                    evaluation_criteria=eval_crit
                )
                
                # Store iteration data
                iteration_time = (datetime.utcnow() - iteration_start).total_seconds()
                iteration = IterationData(
                    answer=answer_response.answer,
                    evaluation=eval_response,
                    iteration_number=i + 1
                )
                iterations.append(iteration)
                
                logger.info(f"Iteration {i+1}: Score {eval_response.score:.2f}, Time {iteration_time:.1f}s")
                
                # Step 3: Check if we should accept or continue
                if eval_response.score >= threshold:
                    total_time = (datetime.utcnow() - start_time).total_seconds()
                    logger.info(f"Success! Answer meets criteria after {i+1} iterations in {total_time:.1f}s")
                    
                    return {
                        "final_answer": answer_response.answer,
                        "iterations": iterations,
                        "success": True,
                        "total_iterations": i + 1,
                        "final_score": eval_response.score,
                        "metadata": {
                            "total_time_seconds": total_time,
                            "threshold_used": threshold,
                            "model": model,
                            "completed_at": datetime.utcnow().isoformat()
                        }
                    }
                
                # Prepare feedback for next iteration
                if i < iter_max - 1:  # Don't prepare feedback for the last iteration
                    feedback = self._prepare_feedback(eval_response)
                    logger.info(f"Iteration {i+1}: Score below threshold, preparing feedback for next iteration")
                
            except Exception as e:
                logger.error(f"Error in iteration {i+1}: {e}", exc_info=True)
                # Continue to next iteration if possible
                continue
        
        # Max iterations reached - return best answer
        if iterations:
            best_iteration = max(iterations, key=lambda x: x.evaluation.score)
            total_time = (datetime.utcnow() - start_time).total_seconds()
            
            logger.info(f"Max iterations reached. Best score: {best_iteration.evaluation.score:.2f} in {total_time:.1f}s")
            
            return {
                "final_answer": best_iteration.answer,
                "iterations": iterations,
                "success": False,
                "total_iterations": iter_max,
                "final_score": best_iteration.evaluation.score,
                "metadata": {
                    "total_time_seconds": total_time,
                    "threshold_used": threshold,
                    "model": model,
                    "best_iteration": best_iteration.iteration_number,
                    "completed_at": datetime.utcnow().isoformat(),
                    "reason": "max_iterations_reached"
                }
            }
        else:
            # No successful iterations
            logger.error("No successful iterations completed")
            return {
                "final_answer": "Failed to generate answer",
                "iterations": [],
                "success": False,
                "total_iterations": 0,
                "final_score": 0.0,
                "metadata": {
                    "error": "No successful iterations",
                    "completed_at": datetime.utcnow().isoformat()
                }
            }
    
    def _build_generation_messages(
        self, 
        instruct: str, 
        resp_format: str,
        feedback: Optional[str] = None
    ) -> List[ChatMessage]:
        """Build messages for answer generation"""
        messages = []
        
        # Main instruction
        user_content = f"""Instruction: {instruct}

Response Format: {resp_format}"""
        
        # Add feedback if this is a retry
        if feedback:
            user_content += f"""

Previous Attempt Feedback:
{feedback}

Please improve your answer based on this feedback."""
        
        now = datetime.utcnow()
        messages.append(ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="lab-temp",  # Temporary chat ID for lab operations
            role=MessageRole.USER,
            content=user_content,
            message_metadata={},
            created_at=now,
            updated_at=now
        ))
        return messages
    
    def _build_evaluation_messages(
        self,
        answer: str,
        eval_crit: str
    ) -> List[ChatMessage]:
        """Build messages for answer evaluation"""
        user_content = f"""Please evaluate the following answer against the specified criteria.

Answer to Evaluate:
{answer}

Evaluation Criteria:
{eval_crit}

Provide a score from 0.0 to 1.0 and detailed feedback."""
        
        now = datetime.utcnow()
        return [ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="lab-temp",  # Temporary chat ID for lab operations
            role=MessageRole.USER,
            content=user_content,
            message_metadata={},
            created_at=now,
            updated_at=now
        )]
    
    def _prepare_feedback(self, eval_response: EvaluationResponse) -> str:
        """Prepare feedback for the next generation attempt"""
        feedback_parts = [
            f"Previous Score: {eval_response.score:.2f}",
            f"Evaluation: {eval_response.evaluation_reasoning}"
        ]
        
        if eval_response.improvement_suggestions:
            feedback_parts.append("Improvement Suggestions:")
            for i, suggestion in enumerate(eval_response.improvement_suggestions, 1):
                feedback_parts.append(f"{i}. {suggestion}")
        
        return "\n".join(feedback_parts)
    
    async def refine_question(self, question: str) -> QuestionRefinementResponse:
        """
        Refine a question and suggest evaluation criteria
        
        Args:
            question: The initial question to refine
            
        Returns:
            QuestionRefinementResponse with refined question and criteria
        """
        logger.info(f"Refining question: {question[:100]}...")
        
        now = datetime.utcnow()
        messages = [ChatMessage(
            id=str(uuid.uuid4()),
            chat_id="lab-temp",  # Temporary chat ID for lab operations
            role=MessageRole.USER, 
            content=f"Please refine this question and suggest response format and evaluation criteria:\n\n{question}",
            message_metadata={},
            created_at=now,
            updated_at=now
        )]
        
        response = await self.refiner.invoke(
            messages=messages,
            original_question=question
        )
        
        logger.info("Question refinement completed")
        return response
    
    async def generate_answer_streaming(
        self,
        instruct: str,
        resp_format: str,
        eval_crit: str,
        iter_max: int = 3,
        model: str = "gpt-4o",
        score_threshold: Optional[float] = None
    ) -> AsyncGenerator[str, None]:
        """
        Generate an answer iteratively with streaming status updates
        
        Yields SSE-formatted messages with status updates and final result
        """
        threshold = score_threshold or self.score_threshold
        iterations = []
        feedback = None
        start_time = datetime.utcnow()
        
        # Initial status
        yield self._format_stream_message(StreamMessage(
            type="status",
            message=f"Starting iterative answer generation (max {iter_max} iterations, threshold {threshold})",
            data={"iteration": 0, "max_iterations": iter_max}
        ))
        
        for i in range(iter_max):
            iteration_start = datetime.utcnow()
            
            try:
                # Generation phase
                yield self._format_stream_message(StreamMessage(
                    type="status",
                    message=f"Iteration {i+1}: Generating answer...",
                    data={"iteration": i+1, "phase": "generation"}
                ))
                
                generation_messages = self._build_generation_messages(
                    instruct, resp_format, feedback=feedback
                )
                
                answer_response = await self.generator.invoke(
                    messages=generation_messages,
                    instruction=instruct,
                    response_format=resp_format
                )
                
                # Evaluation phase
                yield self._format_stream_message(StreamMessage(
                    type="status",
                    message=f"Iteration {i+1}: Evaluating answer...",
                    data={"iteration": i+1, "phase": "evaluation"}
                ))
                
                evaluation_messages = self._build_evaluation_messages(
                    answer_response.answer, eval_crit
                )
                
                eval_response = await self.evaluator.invoke(
                    messages=evaluation_messages,
                    answer=answer_response.answer,
                    evaluation_criteria=eval_crit
                )
                
                # Store iteration data
                iteration_time = (datetime.utcnow() - iteration_start).total_seconds()
                iteration = IterationData(
                    answer=answer_response.answer,
                    evaluation=eval_response,
                    iteration_number=i + 1
                )
                iterations.append(iteration)
                
                # Send iteration result
                yield self._format_stream_message(StreamMessage(
                    type="iteration",
                    message=f"Iteration {i+1} complete: Score {eval_response.score:.2f}",
                    data={
                        "iteration": i+1,
                        "score": eval_response.score,
                        "meets_criteria": eval_response.meets_criteria,
                        "time_seconds": iteration_time,
                        "evaluation_reasoning": eval_response.evaluation_reasoning
                    }
                ))
                
                # Check if we should accept or continue
                if eval_response.score >= threshold:
                    total_time = (datetime.utcnow() - start_time).total_seconds()
                    
                    result = {
                        "final_answer": answer_response.answer,
                        "iterations": [iter.dict() for iter in iterations],
                        "success": True,
                        "total_iterations": i + 1,
                        "final_score": eval_response.score,
                        "metadata": {
                            "total_time_seconds": total_time,
                            "threshold_used": threshold,
                            "model": model,
                            "completed_at": datetime.utcnow().isoformat()
                        }
                    }
                    
                    yield self._format_stream_message(StreamMessage(
                        type="result",
                        message=f"Success! Answer meets criteria after {i+1} iterations",
                        data=result
                    ))
                    
                    return
                
                # Prepare feedback for next iteration
                if i < iter_max - 1:
                    feedback = self._prepare_feedback(eval_response)
                    yield self._format_stream_message(StreamMessage(
                        type="status",
                        message=f"Score below threshold, preparing iteration {i+2}...",
                        data={"iteration": i+1, "preparing_next": True}
                    ))
                
            except Exception as e:
                logger.error(f"Error in iteration {i+1}: {e}", exc_info=True)
                yield self._format_stream_message(StreamMessage(
                    type="error",
                    message=f"Error in iteration {i+1}: {str(e)}",
                    data={"iteration": i+1, "error": str(e)}
                ))
                continue
        
        # Max iterations reached
        if iterations:
            best_iteration = max(iterations, key=lambda x: x.evaluation.score)
            total_time = (datetime.utcnow() - start_time).total_seconds()
            
            result = {
                "final_answer": best_iteration.answer,
                "iterations": [iter.dict() for iter in iterations],
                "success": False,
                "total_iterations": iter_max,
                "final_score": best_iteration.evaluation.score,
                "metadata": {
                    "total_time_seconds": total_time,
                    "threshold_used": threshold,
                    "model": model,
                    "best_iteration": best_iteration.iteration_number,
                    "completed_at": datetime.utcnow().isoformat(),
                    "reason": "max_iterations_reached"
                }
            }
            
            yield self._format_stream_message(StreamMessage(
                type="result",
                message=f"Max iterations reached. Best score: {best_iteration.evaluation.score:.2f}",
                data=result
            ))
        else:
            yield self._format_stream_message(StreamMessage(
                type="error",
                message="No successful iterations completed",
                data={"error": "No successful iterations"}
            ))
    
    def _format_stream_message(self, message: StreamMessage) -> str:
        """Format a stream message as SSE data"""
        return f"data: {message.json()}\n\n"