import json
import os
from datetime import datetime
from typing import List, Dict, Any
from pathlib import Path

def log_prompt_messages(
    messages: List[Dict[str, str]], 
    prompt_type: str,
    additional_context: Dict[str, Any] = None,
    log_dir: str = "logs/prompts"
) -> str:
    """
    Log prompt messages to a file in a well-formatted, readable way.
    
    Args:
        messages: List of formatted messages being sent to the LLM
        prompt_type: Type of prompt (e.g., "hop_implementer", "hop_designer")
        additional_context: Any additional context to include in the log
        log_dir: Directory to save log files in
        
    Returns:
        Path to the created log file
    """
    
    # Create logs directory if it doesn't exist
    log_path = Path(log_dir)
    log_path.mkdir(parents=True, exist_ok=True)
    
    # Generate filename with timestamp
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")[:-3]  # Include milliseconds
    filename = f"{prompt_type}_prompt_{timestamp}.md"
    filepath = log_path / filename
    
    # Format the log content
    log_content = []
    
    # Header
    log_content.append(f"# {prompt_type.upper()} PROMPT LOG")
    log_content.append(f"**Timestamp:** {datetime.now().isoformat()}")
    log_content.append(f"**Prompt Type:** {prompt_type}")
    log_content.append("")
    
    # Additional context if provided
    if additional_context:
        log_content.append("## Additional Context")
        for key, value in additional_context.items():
            if isinstance(value, (dict, list)):
                log_content.append(f"**{key}:**")
                log_content.append("```json")
                log_content.append(json.dumps(value, indent=2, default=str))
                log_content.append("```")
            else:
                log_content.append(f"**{key}:** {value}")
        log_content.append("")
    
    # Messages section
    log_content.append("## Formatted Messages")
    log_content.append(f"Total messages: {len(messages)}")
    log_content.append("")
    
    for i, message in enumerate(messages, 1):
        role = message.get("role", "unknown")
        content = message.get("content", "")
        
        log_content.append(f"### Message {i}: {role.upper()}")
        log_content.append("")
        
        # For system messages, add a clear separator since they're usually very long
        if role == "system":
            log_content.append("```")
            log_content.append(content)
            log_content.append("```")
        else:
            log_content.append(content)
        
        log_content.append("")
        log_content.append("---")
        log_content.append("")
    
    # Summary
    log_content.append("## Summary")
    log_content.append(f"- Total characters: {sum(len(msg.get('content', '')) for msg in messages)}")
    log_content.append(f"- Messages by role:")
    
    role_counts = {}
    for msg in messages:
        role = msg.get("role", "unknown")
        role_counts[role] = role_counts.get(role, 0) + 1
    
    for role, count in role_counts.items():
        log_content.append(f"  - {role}: {count}")
    
    # Write to file
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(log_content))
    
    return str(filepath)


def log_hop_implementer_prompt(
    messages: List[Dict[str, str]],
    mission_name: str = None,
    hop_name: str = None,
    available_assets_count: int = None
) -> str:
    """
    Specific logging function for HopImplementerPrompt messages.
    
    Args:
        messages: Formatted messages for the hop implementer
        mission_name: Name of the mission being worked on
        hop_name: Name of the hop being implemented
        available_assets_count: Number of available assets
        
    Returns:
        Path to the created log file
    """
    
    additional_context = {}
    if mission_name:
        additional_context["mission_name"] = mission_name
    if hop_name:
        additional_context["hop_name"] = hop_name
    if available_assets_count is not None:
        additional_context["available_assets_count"] = available_assets_count
    
    return log_prompt_messages(
        messages=messages,
        prompt_type="hop_implementer",
        additional_context=additional_context
    ) 

