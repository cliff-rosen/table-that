from typing import List, Dict, Any, Union
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage

from schemas.llm import ChatMessage, MessageRole

def format_messages_for_openai(messages: List[Any]) -> List[Dict[str, str]]:
    """
    Convert a list of ChatMessage objects to OpenAI API format.
    
    Args:
        messages: List of ChatMessage objects with role and content
        
    Returns:
        List of dictionaries in OpenAI message format
    """
    openai_messages = []
    for msg in messages:
        if isinstance(msg, (HumanMessage, AIMessage, SystemMessage)):
            # Handle LangChain message types
            if isinstance(msg, HumanMessage):
                openai_messages.append({"role": "user", "content": msg.content})
            elif isinstance(msg, AIMessage):
                openai_messages.append({"role": "assistant", "content": msg.content})
            elif isinstance(msg, SystemMessage):
                openai_messages.append({"role": "system", "content": msg.content})
        else:
            # Handle our own ChatMessage type
            if msg.role == MessageRole.USER:
                openai_messages.append({"role": "user", "content": msg.content})
            elif msg.role == MessageRole.ASSISTANT:
                openai_messages.append({"role": "assistant", "content": msg.content})
            elif msg.role == MessageRole.SYSTEM:
                openai_messages.append({"role": "system", "content": msg.content})
    
    return openai_messages

def format_langchain_messages(messages: List[ChatMessage]) -> List[Any]:
    """
    Convert a list of ChatMessage objects to LangChain message format.
    
    Args:
        messages: List of ChatMessage objects with role and content
        
    Returns:
        List of LangChain message objects (HumanMessage, AIMessage, SystemMessage)
    """
    langchain_messages = []
    for msg in messages:
        if msg.role == MessageRole.USER:
            langchain_messages.append(HumanMessage(content=msg.content))
        elif msg.role == MessageRole.ASSISTANT:
            langchain_messages.append(AIMessage(content=msg.content))
        elif msg.role == MessageRole.SYSTEM:
            langchain_messages.append(SystemMessage(content=msg.content))
    
    return langchain_messages


# Tool description formatting functions moved from tool_registry.py

def format_tool_descriptions_for_mission_design() -> str:
    """Return a human readable list of tools (mission design view)."""
    from tools.tool_registry import TOOL_REGISTRY
    
    if not TOOL_REGISTRY:
        return "No tools available - tool registry not loaded. Call refresh_tool_registry() first."

    descriptions: List[str] = []
    for tool_id, tool_def in TOOL_REGISTRY.items():
        desc = f"### {tool_def.name} (ID: {tool_def.id})\n"
        desc += f"**Purpose**: {tool_def.description}\n"
        desc += f"**Category**: {tool_def.category}\n"

        key_inputs = [param.name for param in tool_def.parameters if param.required]
        if key_inputs:
            desc += f"**Key Capabilities**: {', '.join(key_inputs)}\n"

        outputs = [output.name for output in tool_def.outputs]
        if outputs:
            desc += f"**Produces**: {', '.join(outputs)}\n"

        desc += "\n"
        descriptions.append(desc)

    return "\n".join(descriptions)


def format_tool_descriptions_for_hop_design() -> str:
    """Return a human readable list of tools with full input schemas (hop design view)."""
    from tools.tool_registry import TOOL_REGISTRY
    
    if not TOOL_REGISTRY:
        return "No tools available - tool registry not loaded. Call refresh_tool_registry() first."

    descriptions: List[str] = []
    for tool_id, tool_def in TOOL_REGISTRY.items():
        desc = f"### {tool_def.name} (ID: {tool_def.id})\n"
        desc += f"**Purpose**: {tool_def.description}\n"
        desc += f"**Category**: {tool_def.category}\n"
        
        # Add input parameters with full schema details
        desc += "**Input Parameters**:\n"
        if tool_def.parameters:
            for param in tool_def.parameters:
                param_type = param.schema_definition.type if param.schema_definition else "object"
                is_array = param.schema_definition.is_array if param.schema_definition else False
                type_str = f"Array<{param_type}>" if is_array else param_type
                
                line = f"  - {param.name} ({type_str}): {param.description}"
                if not param.required:
                    line += " [Optional]"
                desc += line + "\n"
                
                # Add nested field details for object types
                if param.schema_definition and param.schema_definition.fields:
                    for field_name, field_schema in param.schema_definition.fields.items():
                        field_type = field_schema.type
                        field_is_array = field_schema.is_array
                        field_type_str = f"Array<{field_type}>" if field_is_array else field_type
                        desc += f"    - {field_name} ({field_type_str}): {field_schema.description or 'No description'}\n"
        else:
            desc += "  No input parameters\n"

        # Add outputs with types
        desc += "**Outputs**:\n"
        if tool_def.outputs:
            for output in tool_def.outputs:
                output_type = output.schema_definition.type if output.schema_definition else "object"
                is_array = output.schema_definition.is_array if output.schema_definition else False
                type_str = f"Array<{output_type}>" if is_array else output_type
                desc += f"  - {output.name} ({type_str}): {output.description}\n"
        else:
            desc += "  No outputs defined\n"

        desc += "\n"
        descriptions.append(desc)

    return "\n".join(descriptions)


def format_tool_descriptions_for_implementation() -> str:
    """Return a human readable list of tools with full input schemas (implementation view)."""
    from tools.tool_registry import TOOL_REGISTRY
    
    if not TOOL_REGISTRY:
        return "No tools available - tool registry not loaded. Call refresh_tool_registry() first."

    descriptions: List[str] = []
    for tool_id, tool_def in TOOL_REGISTRY.items():
        desc = f"### Tool Name: {tool_def.name} (ID: {tool_def.id})\n"
        desc += f"Description: {tool_def.description}\n"
        desc += "Input Parameters:\n"
        if tool_def.parameters:
            for param in tool_def.parameters:
                param_type = param.schema_definition.type if param.schema_definition else "object"
                is_array = param.schema_definition.is_array if param.schema_definition else False
                type_str = f"Array<{param_type}>" if is_array else param_type
                
                line = f"  - {param.name} ({type_str}): {param.description}"
                if not param.required:
                    line += " [Optional]"
                desc += line + "\n"
                
                # Add nested field details for object types
                if param.schema_definition and param.schema_definition.fields:
                    for field_name, field_schema in param.schema_definition.fields.items():
                        field_type = field_schema.type
                        field_is_array = field_schema.is_array
                        field_type_str = f"Array<{field_type}>" if field_is_array else field_type
                        desc += f"    - {field_name} ({field_type_str}): {field_schema.description or 'No description'}\n"
        else:
            desc += "  No input parameters\n"

        desc += "Outputs:\n"
        if tool_def.outputs:
            for output in tool_def.outputs:
                output_type = output.schema_definition.type if output.schema_definition else "object"
                is_array = output.schema_definition.is_array if output.schema_definition else False
                type_str = f"Array<{output_type}>" if is_array else output_type
                desc += f"  - {output.name} ({type_str}): {output.description}\n"
        else:
            desc += "  No outputs defined\n"

        desc += "\n"
        descriptions.append(desc)

    return "\n".join(descriptions)

