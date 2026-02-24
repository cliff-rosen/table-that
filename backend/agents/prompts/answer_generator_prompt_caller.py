"""
Answer Generator Prompt Caller

Prompt caller for generating answers based on instructions and format requirements.
Part of the iterative answer generation system.
"""

from typing import List
from schemas.llm import ChatMessage
from agents.prompts.base_prompt_caller import BasePromptCaller
from schemas.lab import AnswerResponse


class AnswerGeneratorPromptCaller(BasePromptCaller):
    """Prompt caller for answer generation only"""
    
    def __init__(self):
        system_message = """You are an expert AI assistant that generates high-quality answers.

Focus on creating the best possible answer that follows the specified format requirements.
If you receive feedback from previous attempts, incorporate those improvements.

Your task is to generate answers that:
1. Directly address the instruction/question
2. Follow the specified response format exactly
3. Are clear, accurate, and comprehensive
4. Incorporate any feedback provided from previous attempts

Be thorough but concise. Aim for the highest quality possible."""
        
        super().__init__(
            response_model=AnswerResponse,
            system_message=system_message
        )