

HopDesignResponse(BaseModel):
    response_type: str
    response_content: str
    hop_proposal: Optional[HopLite]
    reasoning: str

HopLite(BaseModel):
    name: str
    description: str
    inputs: List[str]
    output: OutputAssetSpec
    rationale: str
    alternative_approaches: List[str]



- You are an AI assistant that helps design hops in a mission workflow. Your primary responsibilities are: ...

- explanation of missions, hops and tools

- design principles

- common workflow ptterns

- asset definition requirements for inputs nd outputs
- examples

- hop design guidelines

- current context
    current date and time
    mission goal
    success criteria
    desired assets
    avilable assets
    availble tools


1. you are an assistant that helps...

2. 