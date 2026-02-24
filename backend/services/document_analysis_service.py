"""
Document Analysis Service

LLM-powered document analysis with hierarchical summarization,
entity extraction, and claim/argument extraction.
Supports streaming progress updates.
"""

import logging
import uuid
from typing import Dict, List, Optional, AsyncGenerator
from datetime import datetime

from agents.prompts.base_prompt_caller import BasePromptCaller
from config.llm_models import get_task_config, supports_reasoning_effort
from schemas.llm import ChatMessage, MessageRole
from schemas.document_analysis import (
    DocumentAnalysisResult,
    HierarchicalSummary,
    ExecutiveSummary,
    SectionSummary,
    KeyPoint,
    ExtractedEntity,
    ExtractedClaim,
    Evidence,
    GraphNode,
    GraphEdge,
    EntityCategory,
    ClaimType,
    AnalysisOptions,
    AnalysisStreamMessage
)

logger = logging.getLogger(__name__)


class DocumentAnalysisService:
    """Service for comprehensive document analysis with streaming support"""

    def _format_stream_message(self, message: AnalysisStreamMessage) -> str:
        """Format a stream message as SSE data"""
        return f"data: {message.model_dump_json()}\n\n"

    async def analyze_document_streaming(
        self,
        document_text: str,
        document_title: Optional[str] = None,
        analysis_options: Optional[AnalysisOptions] = None
    ) -> AsyncGenerator[str, None]:
        """
        Perform comprehensive document analysis with streaming progress updates.

        Yields SSE-formatted messages with status updates and partial results.

        Args:
            document_text: The document text to analyze
            document_title: Optional title for the document
            analysis_options: Which analyses to perform

        Yields:
            SSE-formatted string messages with progress updates and results
        """
        document_id = str(uuid.uuid4())
        options = analysis_options or AnalysisOptions()
        title = document_title or self._detect_title(document_text)

        logger.info(f"Starting streaming document analysis {document_id}, length={len(document_text)}")

        # Initial status
        yield self._format_stream_message(AnalysisStreamMessage(
            type="status",
            message="Starting document analysis...",
            data={"document_id": document_id, "options": options.model_dump()}
        ))

        # Run analyses based on options
        hierarchical_summary = None
        entities: List[ExtractedEntity] = []
        claims: List[ExtractedClaim] = []

        try:
            # Phase 1: Hierarchical Summary
            if options.hierarchical_summary:
                yield self._format_stream_message(AnalysisStreamMessage(
                    type="progress",
                    message="Extracting hierarchical summary...",
                    data={"phase": "hierarchical_summary", "progress": 0}
                ))

                hierarchical_summary = await self._extract_hierarchical_summary(document_text)

                yield self._format_stream_message(AnalysisStreamMessage(
                    type="summary",
                    message=f"Summary complete: {len(hierarchical_summary.sections)} sections, {hierarchical_summary.total_key_points} key points",
                    data={
                        "phase": "hierarchical_summary",
                        "progress": 100,
                        "result": hierarchical_summary.model_dump()
                    }
                ))

            # Phase 2: Entity Extraction
            if options.entity_extraction:
                yield self._format_stream_message(AnalysisStreamMessage(
                    type="progress",
                    message="Extracting entities...",
                    data={"phase": "entity_extraction", "progress": 0}
                ))

                entities = await self._extract_entities(document_text)

                yield self._format_stream_message(AnalysisStreamMessage(
                    type="entities",
                    message=f"Extracted {len(entities)} entities",
                    data={
                        "phase": "entity_extraction",
                        "progress": 100,
                        "result": [e.model_dump() for e in entities]
                    }
                ))

            # Phase 3: Claim Extraction
            if options.claim_extraction:
                yield self._format_stream_message(AnalysisStreamMessage(
                    type="progress",
                    message="Extracting claims and arguments...",
                    data={"phase": "claim_extraction", "progress": 0}
                ))

                claims = await self._extract_claims(document_text, entities)

                yield self._format_stream_message(AnalysisStreamMessage(
                    type="claims",
                    message=f"Extracted {len(claims)} claims",
                    data={
                        "phase": "claim_extraction",
                        "progress": 100,
                        "result": [c.model_dump() for c in claims]
                    }
                ))

            # Build default summary if not requested
            if hierarchical_summary is None:
                hierarchical_summary = HierarchicalSummary(
                    executive=ExecutiveSummary(
                        summary="Analysis not requested",
                        main_themes=[],
                        key_conclusions=[]
                    ),
                    sections=[],
                    total_key_points=0
                )

            # Generate graph data for React Flow
            graph_nodes, graph_edges = self._generate_graph_data(
                hierarchical_summary, entities, claims
            )

            # Build final result
            result = DocumentAnalysisResult(
                document_id=document_id,
                title=title,
                hierarchical_summary=hierarchical_summary,
                entities=entities,
                claims=claims,
                graph_nodes=graph_nodes,
                graph_edges=graph_edges,
                analysis_metadata={
                    "options": options.model_dump(),
                    "document_length": len(document_text),
                    "entity_count": len(entities),
                    "claim_count": len(claims),
                    "completed_at": datetime.utcnow().isoformat()
                }
            )

            logger.info(f"Document analysis complete: {len(entities)} entities, {len(claims)} claims, {len(graph_nodes)} nodes")

            yield self._format_stream_message(AnalysisStreamMessage(
                type="result",
                message="Analysis complete",
                data={"result": result.model_dump()}
            ))

        except Exception as e:
            logger.error(f"Document analysis failed: {e}", exc_info=True)
            yield self._format_stream_message(AnalysisStreamMessage(
                type="error",
                message=f"Analysis failed: {str(e)}",
                data={"error": str(e)}
            ))

    async def analyze_document(
        self,
        document_text: str,
        document_title: Optional[str] = None,
        analysis_options: Optional[AnalysisOptions] = None
    ) -> DocumentAnalysisResult:
        """
        Perform comprehensive document analysis (non-streaming).

        Args:
            document_text: The document text to analyze
            document_title: Optional title for the document
            analysis_options: Which analyses to perform

        Returns:
            DocumentAnalysisResult with all requested analyses
        """
        # Consume the streaming generator and return final result
        result = None
        async for message in self.analyze_document_streaming(
            document_text, document_title, analysis_options
        ):
            # Parse the SSE message to extract data
            import json
            if message.startswith("data: "):
                data = json.loads(message[6:].strip())
                if data.get("type") == "result":
                    result = DocumentAnalysisResult(**data["data"]["result"])
                elif data.get("type") == "error":
                    raise Exception(data.get("message", "Analysis failed"))

        if result is None:
            raise Exception("No result returned from analysis")

        return result

    async def _extract_hierarchical_summary(self, text: str) -> HierarchicalSummary:
        """Extract hierarchical summary using LLM"""
        system_prompt = """You are an expert document analyst who creates hierarchical summaries.

        Your task is to analyze documents and create comprehensive hierarchical summaries with:
        1. An executive summary (2-3 paragraphs capturing the essence)
        2. Main themes identified in the document
        3. Key conclusions or takeaways
        4. Section-by-section breakdown with key points

        Guidelines:
        - Be thorough but concise
        - Identify the natural structure/sections of the document
        - Extract specific, actionable key points
        - Include relevant quotes or spans from the source when helpful
        - Assign importance scores (0-1) based on centrality to the document's purpose"""

        user_prompt = f"""Analyze the following document and create a hierarchical summary:

        DOCUMENT:
        {text}

        Provide your analysis in the specified JSON format."""

        result_schema = {
            "type": "object",
            "properties": {
                "executive_summary": {
                    "type": "string",
                    "description": "2-3 paragraph executive summary"
                },
                "main_themes": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "3-5 main themes"
                },
                "key_conclusions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "3-5 key conclusions"
                },
                "sections": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "title": {"type": "string"},
                            "summary": {"type": "string"},
                            "key_points": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "text": {"type": "string"},
                                        "source_span": {"type": "string"},
                                        "importance": {"type": "number"}
                                    },
                                    "required": ["text"]
                                }
                            },
                            "source_spans": {
                                "type": "array",
                                "items": {"type": "string"}
                            }
                        },
                        "required": ["title", "summary", "key_points"]
                    }
                }
            },
            "required": ["executive_summary", "main_themes", "key_conclusions", "sections"]
        }

        task_config = get_task_config("document_analysis", "hierarchical_summary")
        prompt_caller = BasePromptCaller(
            response_model=result_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.3),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        user_message = ChatMessage(
            id="temp_id",
            chat_id="temp_chat",
            role=MessageRole.USER,
            content=user_prompt,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        result = await prompt_caller.invoke(
            messages=[user_message],
            return_usage=True
        )

        # Extract response
        llm_response = result.result
        if hasattr(llm_response, 'model_dump'):
            response_dict = llm_response.model_dump()
        elif hasattr(llm_response, 'dict'):
            response_dict = llm_response.dict()
        else:
            response_dict = llm_response

        # Convert response to our models
        sections = []
        total_key_points = 0

        for idx, section_data in enumerate(response_dict.get("sections", [])):
            key_points = []
            for kp_idx, kp_data in enumerate(section_data.get("key_points", [])):
                key_points.append(KeyPoint(
                    id=f"kp-{idx}-{kp_idx}",
                    text=kp_data.get("text", ""),
                    source_span=kp_data.get("source_span"),
                    importance=kp_data.get("importance", 0.5)
                ))
            total_key_points += len(key_points)

            sections.append(SectionSummary(
                id=f"section-{idx}",
                title=section_data.get("title", f"Section {idx + 1}"),
                summary=section_data.get("summary", ""),
                key_points=key_points,
                source_spans=section_data.get("source_spans", [])
            ))

        return HierarchicalSummary(
            executive=ExecutiveSummary(
                summary=response_dict.get("executive_summary", ""),
                main_themes=response_dict.get("main_themes", []),
                key_conclusions=response_dict.get("key_conclusions", [])
            ),
            sections=sections,
            total_key_points=total_key_points
        )

    async def _extract_entities(self, text: str) -> List[ExtractedEntity]:
        """Extract entities using LLM"""
        system_prompt = """You are an expert entity extraction system.

        Your task is to extract all significant entities from documents, including:
        - People (names, roles)
        - Organizations (companies, institutions)
        - Concepts (ideas, theories, methodologies)
        - Locations (places, regions)
        - Dates and time periods
        - Technical terms and domain-specific terminology

        Guidelines:
        - Include context mentions showing how entities appear in the document
        - Estimate importance (0-1) based on frequency and centrality
        - Identify relationships between entities where apparent
        - Be comprehensive but avoid extracting trivial mentions"""

        user_prompt = f"""Extract all significant entities from the following document:

        DOCUMENT:
        {text}

        Provide your extraction in the specified JSON format."""

        result_schema = {
            "type": "object",
            "properties": {
                "entities": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {"type": "string"},
                            "category": {
                                "type": "string",
                                "enum": ["person", "organization", "concept", "location", "date", "technical_term", "other"]
                            },
                            "description": {"type": "string"},
                            "mentions": {
                                "type": "array",
                                "items": {"type": "string"}
                            },
                            "mention_count": {"type": "integer"},
                            "importance": {"type": "number"},
                            "related_entity_names": {
                                "type": "array",
                                "items": {"type": "string"}
                            }
                        },
                        "required": ["name", "category", "mention_count", "importance"]
                    }
                }
            },
            "required": ["entities"]
        }

        task_config = get_task_config("document_analysis", "entity_extraction")
        prompt_caller = BasePromptCaller(
            response_model=result_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.1),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        user_message = ChatMessage(
            id="temp_id",
            chat_id="temp_chat",
            role=MessageRole.USER,
            content=user_prompt,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        result = await prompt_caller.invoke(
            messages=[user_message],
            return_usage=True
        )

        # Extract response
        llm_response = result.result
        if hasattr(llm_response, 'model_dump'):
            response_dict = llm_response.model_dump()
        elif hasattr(llm_response, 'dict'):
            response_dict = llm_response.dict()
        else:
            response_dict = llm_response

        entities = []
        entity_name_to_id: Dict[str, str] = {}

        # First pass: create entities and build name->id map
        for idx, entity_data in enumerate(response_dict.get("entities", [])):
            entity_id = f"entity-{idx}"
            name = entity_data.get("name", "")
            entity_name_to_id[name.lower()] = entity_id

            entities.append(ExtractedEntity(
                id=entity_id,
                name=name,
                category=EntityCategory(entity_data.get("category", "other")),
                description=entity_data.get("description"),
                mentions=entity_data.get("mentions", []),
                mention_count=entity_data.get("mention_count", 1),
                importance=entity_data.get("importance", 0.5),
                related_entities=[]  # Will populate in second pass
            ))

        # Second pass: resolve related entity names to IDs
        for idx, entity_data in enumerate(response_dict.get("entities", [])):
            related_names = entity_data.get("related_entity_names", [])
            related_ids = []
            for name in related_names:
                if name.lower() in entity_name_to_id:
                    related_ids.append(entity_name_to_id[name.lower()])
            entities[idx].related_entities = related_ids

        return entities

    async def _extract_claims(
        self,
        text: str,
        entities: List[ExtractedEntity]
    ) -> List[ExtractedClaim]:
        """Extract claims using LLM"""
        # Build entity context for the LLM
        entity_names = [e.name for e in entities]
        entity_context = ', '.join(entity_names) if entity_names else "None identified"

        system_prompt = """You are an expert at identifying claims and arguments in documents.

        Your task is to extract all significant claims, arguments, and assertions, including:
        - Factual claims (statements of fact)
        - Causal claims (X causes/leads to Y)
        - Evaluative claims (judgments, assessments)
        - Recommendations (suggestions, proposals)
        - Predictions (forecasts, expectations)

        Guidelines:
        - Include supporting evidence from the document
        - Rate evidence strength (strong, moderate, weak)
        - Assign confidence scores (0-1) based on how well-supported claims are
        - Identify potential counter-arguments where relevant
        - Link claims to relevant entities mentioned in the document"""

        user_prompt = f"""Extract all significant claims and arguments from the following document.

        Known entities for reference: {entity_context}

        DOCUMENT:
        {text}

        Provide your extraction in the specified JSON format."""

        result_schema = {
            "type": "object",
            "properties": {
                "claims": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "claim": {"type": "string"},
                            "claim_type": {
                                "type": "string",
                                "enum": ["factual", "causal", "evaluative", "recommendation", "prediction"]
                            },
                            "confidence": {"type": "number"},
                            "evidence": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "text": {"type": "string"},
                                        "source_span": {"type": "string"},
                                        "strength": {
                                            "type": "string",
                                            "enum": ["strong", "moderate", "weak"]
                                        }
                                    },
                                    "required": ["text", "strength"]
                                }
                            },
                            "supporting_entity_names": {
                                "type": "array",
                                "items": {"type": "string"}
                            },
                            "counter_arguments": {
                                "type": "array",
                                "items": {"type": "string"}
                            }
                        },
                        "required": ["claim", "claim_type", "confidence", "evidence"]
                    }
                }
            },
            "required": ["claims"]
        }

        task_config = get_task_config("document_analysis", "claim_extraction")
        prompt_caller = BasePromptCaller(
            response_model=result_schema,
            system_message=system_prompt,
            model=task_config["model"],
            temperature=task_config.get("temperature", 0.2),
            reasoning_effort=task_config.get("reasoning_effort") if supports_reasoning_effort(task_config["model"]) else None
        )

        user_message = ChatMessage(
            id="temp_id",
            chat_id="temp_chat",
            role=MessageRole.USER,
            content=user_prompt,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        result = await prompt_caller.invoke(
            messages=[user_message],
            return_usage=True
        )

        # Extract response
        llm_response = result.result
        if hasattr(llm_response, 'model_dump'):
            response_dict = llm_response.model_dump()
        elif hasattr(llm_response, 'dict'):
            response_dict = llm_response.dict()
        else:
            response_dict = llm_response

        # Build entity name to ID map
        entity_name_to_id = {e.name.lower(): e.id for e in entities}

        claims = []
        for idx, claim_data in enumerate(response_dict.get("claims", [])):
            evidence = []
            for ev_data in claim_data.get("evidence", []):
                evidence.append(Evidence(
                    text=ev_data.get("text", ""),
                    source_span=ev_data.get("source_span"),
                    strength=ev_data.get("strength", "moderate")
                ))

            # Resolve supporting entity names to IDs
            supporting_names = claim_data.get("supporting_entity_names", [])
            supporting_ids = []
            for name in supporting_names:
                if name.lower() in entity_name_to_id:
                    supporting_ids.append(entity_name_to_id[name.lower()])

            claims.append(ExtractedClaim(
                id=f"claim-{idx}",
                claim=claim_data.get("claim", ""),
                claim_type=ClaimType(claim_data.get("claim_type", "factual")),
                confidence=claim_data.get("confidence", 0.5),
                evidence=evidence,
                supporting_entities=supporting_ids,
                counter_arguments=claim_data.get("counter_arguments", [])
            ))

        return claims

    def _detect_title(self, text: str) -> Optional[str]:
        """Attempt to detect document title from first line"""
        lines = text.strip().split('\n')
        if lines:
            first_line = lines[0].strip()
            # Heuristic: if first line is short and looks like a title
            if len(first_line) < 200 and not first_line.endswith('.'):
                return first_line
        return None

    def _generate_graph_data(
        self,
        summary: HierarchicalSummary,
        entities: List[ExtractedEntity],
        claims: List[ExtractedClaim]
    ) -> tuple[List[GraphNode], List[GraphEdge]]:
        """Generate React Flow compatible graph nodes and edges"""
        nodes: List[GraphNode] = []
        edges: List[GraphEdge] = []

        # Layout constants
        VERTICAL_SPACING = 120
        HORIZONTAL_SPACING = 200
        START_Y = 50

        # Create document/executive summary node at top
        nodes.append(GraphNode(
            id="executive",
            type="executive",
            data={
                "label": "Executive Summary",
                "details": {
                    "summary": summary.executive.summary,
                    "themes": summary.executive.main_themes,
                    "conclusions": summary.executive.key_conclusions
                },
                "nodeType": "executive"
            },
            position={"x": 400, "y": START_Y}
        ))

        # Create section nodes
        section_y = START_Y + VERTICAL_SPACING
        section_start_x = 100
        for idx, section in enumerate(summary.sections):
            section_x = section_start_x + (idx * HORIZONTAL_SPACING)
            nodes.append(GraphNode(
                id=section.id,
                type="section",
                data={
                    "label": section.title,
                    "details": {
                        "summary": section.summary,
                        "keyPointCount": len(section.key_points)
                    },
                    "nodeType": "section"
                },
                position={"x": section_x, "y": section_y}
            ))
            # Edge from executive to section
            edges.append(GraphEdge(
                id=f"edge-executive-{section.id}",
                source="executive",
                target=section.id,
                type="smoothstep"
            ))

            # Create key point nodes under each section
            for kp_idx, kp in enumerate(section.key_points):
                kp_y = section_y + VERTICAL_SPACING + (kp_idx * 60)
                nodes.append(GraphNode(
                    id=kp.id,
                    type="keypoint",
                    data={
                        "label": kp.text[:50] + "..." if len(kp.text) > 50 else kp.text,
                        "details": {
                            "fullText": kp.text,
                            "importance": kp.importance,
                            "sourceSpan": kp.source_span
                        },
                        "nodeType": "keypoint"
                    },
                    position={"x": section_x, "y": kp_y}
                ))
                edges.append(GraphEdge(
                    id=f"edge-{section.id}-{kp.id}",
                    source=section.id,
                    target=kp.id,
                    type="smoothstep"
                ))

        # Create entity nodes on the right side
        entity_x = 800
        entity_y = START_Y
        for idx, entity in enumerate(entities[:10]):  # Limit to top 10
            nodes.append(GraphNode(
                id=entity.id,
                type="entity",
                data={
                    "label": entity.name,
                    "details": {
                        "category": entity.category.value,
                        "description": entity.description,
                        "mentionCount": entity.mention_count,
                        "importance": entity.importance
                    },
                    "nodeType": "entity"
                },
                position={"x": entity_x, "y": entity_y + (idx * 70)}
            ))

        # Create edges between related entities
        for entity in entities[:10]:
            for related_id in entity.related_entities:
                if any(n.id == related_id for n in nodes):
                    edges.append(GraphEdge(
                        id=f"edge-{entity.id}-{related_id}",
                        source=entity.id,
                        target=related_id,
                        label="related",
                        type="default"
                    ))

        # Create claim nodes on the left side
        claim_x = 50
        claim_y = section_y + VERTICAL_SPACING * 2
        for idx, claim in enumerate(claims[:8]):  # Limit to top 8
            nodes.append(GraphNode(
                id=claim.id,
                type="claim",
                data={
                    "label": claim.claim[:40] + "..." if len(claim.claim) > 40 else claim.claim,
                    "details": {
                        "fullClaim": claim.claim,
                        "claimType": claim.claim_type.value,
                        "confidence": claim.confidence,
                        "evidenceCount": len(claim.evidence)
                    },
                    "nodeType": "claim"
                },
                position={"x": claim_x, "y": claim_y + (idx * 80)}
            ))

            # Connect claims to supporting entities
            for entity_id in claim.supporting_entities:
                if any(n.id == entity_id for n in nodes):
                    edges.append(GraphEdge(
                        id=f"edge-{claim.id}-{entity_id}",
                        source=claim.id,
                        target=entity_id,
                        label="supports",
                        type="default"
                    ))

        return nodes, edges


# ============================================================================
# Singleton
# ============================================================================

_document_analysis_service: Optional[DocumentAnalysisService] = None


def get_document_analysis_service() -> DocumentAnalysisService:
    """Get the singleton document analysis service instance"""
    global _document_analysis_service
    if _document_analysis_service is None:
        _document_analysis_service = DocumentAnalysisService()
    return _document_analysis_service
