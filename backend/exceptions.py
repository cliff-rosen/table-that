class AppError(Exception):
    """Base exception for application errors."""
    def __init__(self, message: str, status_code: int = 500):
        super().__init__(message)
        self.status_code = status_code
        self.message = message

class NotFoundError(AppError):
    """Raised when a resource is not found."""
    def __init__(self, message: str):
        super().__init__(message, status_code=404)

class ValidationError(AppError):
    """Raised when input validation fails."""
    def __init__(self, message: str):
        super().__init__(message, status_code=400)

class AuthenticationError(AppError):
    """Raised when authentication fails."""
    def __init__(self, message: str = "Authentication failed"):
        super().__init__(message, status_code=401)

class AuthorizationError(AppError):
    """Raised when user is not authorized to perform an action."""
    def __init__(self, message: str = "Not authorized"):
        super().__init__(message, status_code=403)

##### WORKFLOW EXCEPTIONS #####

class WorkflowError(AppError):
    """Base exception for workflow-related errors."""
    pass

class WorkflowNotFoundError(NotFoundError):
    """Raised when a workflow is not found."""
    def __init__(self, workflow_id: str):
        super().__init__(f"Workflow {workflow_id} not found")

class InvalidWorkflowError(ValidationError):
    """Raised when workflow configuration is invalid."""
    pass

class WorkflowExecutionError(WorkflowError):
    """Raised when workflow execution fails."""
    def __init__(self, message: str, workflow_id: str):
        super().__init__(f"Workflow {workflow_id} execution failed: {message}")

##### TOOL EXCEPTIONS #####

class ToolError(AppError):
    """Base exception for tool-related errors."""
    pass

class ToolNotFoundError(NotFoundError):
    """Raised when a tool is not found."""
    def __init__(self, tool_id: str):
        super().__init__(f"Tool {tool_id} not found")

class InvalidToolConfigurationError(ValidationError):
    """Raised when tool configuration is invalid."""
    pass

class ToolExecutionError(ToolError):
    """Raised when tool execution fails."""
    def __init__(self, message: str, tool_id: str):
        super().__init__(f"Tool {tool_id} execution failed: {message}")

##### STEP EXCEPTIONS #####

class StepError(AppError):
    """Base exception for step-related errors."""
    pass

class StepNotFoundError(NotFoundError):
    """Raised when a workflow step is not found."""
    def __init__(self, step_id: str):
        super().__init__(f"Step {step_id} not found")

class InvalidStepConfigurationError(ValidationError):
    """Raised when step configuration is invalid."""
    pass

class StepExecutionError(StepError):
    """Raised when step execution fails."""
    def __init__(self, message: str, step_id: str):
        super().__init__(f"Step {step_id} execution failed: {message}")

##### VARIABLE EXCEPTIONS #####

class VariableError(AppError):
    """Base exception for variable-related errors."""
    pass

class VariableNotFoundError(NotFoundError):
    """Raised when a workflow variable is not found."""
    def __init__(self, variable_id: str):
        super().__init__(f"Variable {variable_id} not found")

class InvalidVariableError(ValidationError):
    """Raised when variable configuration is invalid."""
    pass

class VariableValidationError(ValidationError):
    """Raised when variable value validation fails."""
    def __init__(self, variable_name: str, message: str):
        super().__init__(f"Variable '{variable_name}' validation failed: {message}")

##### ENTITY NOT FOUND EXCEPTIONS #####

class HopNotFoundError(NotFoundError):
    """Raised when a hop is not found."""
    def __init__(self, hop_id: str):
        super().__init__(f"Hop {hop_id} not found")

class MissionNotFoundError(NotFoundError):
    """Raised when a mission is not found."""
    def __init__(self, mission_id: str):
        super().__init__(f"Mission {mission_id} not found")

class ToolStepNotFoundError(NotFoundError):
    """Raised when a tool step is not found."""
    def __init__(self, tool_step_id: str):
        super().__init__(f"Tool step {tool_step_id} not found")

class AssetNotFoundError(NotFoundError):
    """Raised when an asset is not found."""
    def __init__(self, asset_id: str):
        super().__init__(f"Asset {asset_id} not found") 