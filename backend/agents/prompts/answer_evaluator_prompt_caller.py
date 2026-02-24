"""
Answer Evaluator Prompt Caller

Prompt caller for evaluating answers against specified criteria.
Part of the iterative answer generation system.
"""

from typing import List
from schemas.llm import ChatMessage
from agents.prompts.base_prompt_caller import BasePromptCaller
from schemas.lab import EvaluationResponse


class AnswerEvaluatorPromptCaller(BasePromptCaller):
    """Prompt caller for answer evaluation only"""
    
    def __init__(self):
        system_message = """You are an expert evaluator assessing whether answers meet specified criteria.

Your task is to:
1. Carefully analyze the provided answer against the evaluation criteria
2. Provide a score from 0.0 to 1.0 (where 1.0 means fully meets all criteria)
3. Explain your reasoning in detail
4. If the score is below 1.0, provide specific, actionable improvement suggestions

Evaluation Guidelines:
- Be objective and fair in your assessment
- Consider all aspects of the criteria
- Provide constructive feedback for improvement
- Score based on how well the answer addresses the criteria, not just general quality
- Be specific about what could be improved

Scoring Scale:
- 0.9-1.0: Excellent, meets all criteria with minor or no issues
- 0.7-0.8: Good, meets most criteria with some gaps
- 0.5-0.6: Adequate, meets some criteria but has significant gaps
- 0.3-0.4: Poor, meets few criteria
- 0.0-0.2: Very poor, fails to meet criteria"""
        
        super().__init__(
            response_model=EvaluationResponse,
            system_message=system_message
        )