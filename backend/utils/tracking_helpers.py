"""
Helper functions for event tracking

Utilities to extract user and journey information from requests.
"""

from typing import Optional
from uuid import uuid4
from fastapi import Request


def get_user_id_from_current_user(current_user) -> str:
    """
    Extract user ID from authenticated user object

    Args:
        current_user: Authenticated user object from validate_token

    Returns:
        User identifier string
    """
    if hasattr(current_user, 'user_id'):
        return current_user.user_id
    elif hasattr(current_user, 'id'):
        return current_user.id
    else:
        return str(current_user)


def get_journey_id_from_request(request: Request) -> str:
    """
    Extract or generate journey ID from request

    Tries in order:
    1. X-Journey-Id header (from frontend)
    2. journey_id from query parameters
    3. Generates new UUID if not found

    Args:
        request: FastAPI Request object

    Returns:
        Journey identifier string
    """
    # Try headers (primary method)
    if 'X-Journey-Id' in request.headers:
        journey_id = request.headers['X-Journey-Id']
        if journey_id and journey_id.strip():  # Make sure it's not empty or whitespace
            return journey_id

    # Try query parameters (backup method)
    if 'journey_id' in request.query_params:
        journey_id = request.query_params['journey_id']
        if journey_id and journey_id.strip():  # Make sure it's not empty or whitespace
            return journey_id

    # TRACKING ERROR: Frontend should ALWAYS provide journey ID
    # Log this as an error and return None to skip tracking
    print(f"[TRACKING ERROR] No valid journey ID provided by frontend! Request path: {request.url.path if request else 'unknown'}")
    print(f"[TRACKING ERROR] Headers: {dict(request.headers) if request else 'no request'}")
    return None  # Return None to indicate tracking should be skipped


def add_journey_to_response_header(response, journey_id: str):
    """
    Add journey ID to response headers

    This helps the frontend track the journey across requests

    Args:
        response: FastAPI Response object
        journey_id: Journey identifier
    """
    response.headers['X-Journey-Id'] = journey_id
    return response


def create_journey_context(request: Request) -> dict:
    """
    Create a tracking context dictionary from request

    Args:
        request: FastAPI Request object

    Returns:
        Dictionary with user_id and journey_id
    """
    return {
        'user_id': get_user_id_from_request(request),
        'journey_id': get_journey_id_from_request(request)
    }


# Pre-built data extractors for common endpoints

def extract_search_data(result, *args, **kwargs) -> dict:
    """Extract data from search endpoint result"""
    # Get request from kwargs (FastAPI passes it as keyword argument)
    request = kwargs.get('request')  # DirectSearchRequest

    data = {
        'source': 'unknown',
        'query': 'unknown',
        'results_count': 0,
        'page': 1,
        'page_size': 20
    }

    # Extract from request (DirectSearchRequest)
    if request:
        if hasattr(request, 'query'):
            data['query'] = request.query
        if hasattr(request, 'source'):
            data['source'] = request.source
        if hasattr(request, 'page'):
            data['page'] = request.page
        if hasattr(request, 'page_size'):
            data['page_size'] = request.page_size

    # Extract from result (DirectSearchResponse)
    if result:
        if hasattr(result, 'articles'):
            data['results_count'] = len(result.articles)
        if hasattr(result, 'pagination'):
            pagination = result.pagination
            if hasattr(pagination, 'returned'):
                data['results_count'] = pagination.returned
            if hasattr(pagination, 'total'):
                data['total_available'] = pagination.total
            if hasattr(pagination, 'page'):
                data['result_page'] = pagination.page
            if hasattr(pagination, 'page_size'):
                data['result_page_size'] = pagination.page_size
        if hasattr(result, 'source'):
            data['result_source'] = result.source
        if hasattr(result, 'query'):
            data['result_query'] = result.query

    return data


def extract_filter_data(result, *args, **kwargs) -> dict:
    """Extract data from filter endpoint result"""
    # Get request from kwargs (FastAPI passes it as keyword argument)
    request = kwargs.get('request')  # ArticleFilterRequest
    data = {
        'filter_condition': 'unknown',
        'strictness': 'medium',
        'input_count': 0,
        'accepted': 0,
        'rejected': 0,
        'input_articles_count': 0
    }

    # Extract from request (ArticleFilterRequest)
    if request:
        if hasattr(request, 'filter_condition'):
            data['filter_condition'] = request.filter_condition
        if hasattr(request, 'strictness'):
            data['strictness'] = request.strictness
        if hasattr(request, 'articles'):
            data['input_articles_count'] = len(request.articles)

    # Extract from result (ArticleFilterResponse)
    if result:
        if hasattr(result, 'total_processed'):
            data['input_count'] = result.total_processed
        if hasattr(result, 'total_accepted'):
            data['accepted'] = result.total_accepted
        if hasattr(result, 'total_rejected'):
            data['rejected'] = result.total_rejected
        if hasattr(result, 'average_confidence'):
            data['average_confidence'] = result.average_confidence
        if hasattr(result, 'duration_seconds'):
            data['duration_seconds'] = result.duration_seconds
        if hasattr(result, 'token_usage'):
            data['token_usage'] = result.token_usage
        if hasattr(result, 'filtered_articles'):
            data['filtered_articles_count'] = len(result.filtered_articles)

    return data


def extract_columns_data(result, *args, **kwargs) -> dict:
    """Extract data from column extraction endpoint result"""
    # Get request from kwargs (FastAPI passes it as keyword argument)
    request = kwargs.get('request')  # FeatureExtractionRequest
    data = {
        'features_count': 0,
        'articles_processed': 0,
        'success_rate': 0.0,
        'input_articles_count': 0
    }

    # Extract from request (FeatureExtractionRequest)
    if request:
        if hasattr(request, 'features'):
            data['features_count'] = len(request.features)
            data['features'] = [
                {'name': f.name, 'description': f.description}
                for f in request.features
                if hasattr(f, 'name') and hasattr(f, 'description')
            ]
        if hasattr(request, 'articles'):
            data['input_articles_count'] = len(request.articles)

    # Extract from result (FeatureExtractionResponse)
    if result:
        if hasattr(result, 'results'):
            data['articles_processed'] = len(result.results)
            # Calculate success rate
            successful = sum(1 for r in result.results.values() if r and not r.get('error'))
            data['success_rate'] = successful / len(result.results) if result.results else 0
        if hasattr(result, 'extraction_metadata'):
            data['extraction_metadata'] = result.extraction_metadata

    return data


def extract_scholar_data(result, *args, **kwargs) -> dict:
    """Extract data from Google Scholar enrichment result"""
    data = {
        'keywords': 'unknown',
        'articles_added': 0
    }

    # Extract from result
    if isinstance(result, list):
        data['articles_added'] = len(result)
    elif hasattr(result, 'articles'):
        data['articles_added'] = len(result.articles)

    # Try to get keywords from request
    request = args[0] if args else None
    if request and hasattr(request, 'keywords'):
        data['keywords'] = request.keywords

    return data


def extract_evidence_spec_data(result, *args, **kwargs) -> dict:
    """Extract data from evidence specification result"""
    # kwargs['request'] = EvidenceSpecRequest (Pydantic model with user data)
    # result = EvidenceSpecResponse (Pydantic response model)

    evidence_request = kwargs.get('request')  # EvidenceSpecRequest
    data = {
        'user_description': 'unknown',
        'is_complete': False,
        'completeness_score': 0.0,
        'evidence_spec_length': 0,
        'has_conversation_history': False,
        'missing_elements_count': 0,
        'clarification_questions_count': 0
    }

    # Extract from request (EvidenceSpecRequest)
    if evidence_request:
        if hasattr(evidence_request, 'user_description'):
            desc = evidence_request.user_description
            data['user_description'] = desc[:100] + "..." if len(desc) > 100 else desc
        if hasattr(evidence_request, 'conversation_history'):
            data['has_conversation_history'] = bool(evidence_request.conversation_history)

    # Extract from result (EvidenceSpecResponse)
    if result:
        if hasattr(result, 'is_complete'):
            data['is_complete'] = result.is_complete
        if hasattr(result, 'completeness_score'):
            data['completeness_score'] = result.completeness_score
        if hasattr(result, 'evidence_specification') and result.evidence_specification:
            data['evidence_spec_length'] = len(result.evidence_specification)
        if hasattr(result, 'missing_elements'):
            data['missing_elements_count'] = len(result.missing_elements)
            data['missing_elements'] = result.missing_elements
        if hasattr(result, 'clarification_questions'):
            data['clarification_questions_count'] = len(result.clarification_questions) if result.clarification_questions else 0

    return data


def extract_concepts_data(result, *args, **kwargs) -> dict:
    """Extract data from concept extraction result"""
    # kwargs['request'] = ConceptExtractionRequest (Pydantic model)
    # result = ConceptExtractionResponse (Pydantic response model)

    concept_request = kwargs.get('request')  # ConceptExtractionRequest
    data = {
        'evidence_spec': 'unknown',
        'concepts_count': 0,
        'concepts': []
    }

    # Extract from request (ConceptExtractionRequest)
    if concept_request and hasattr(concept_request, 'evidence_specification'):
        spec = concept_request.evidence_specification
        data['evidence_spec'] = spec[:100] + "..." if len(spec) > 100 else spec

    # Extract from result (ConceptExtractionResponse)
    if result:
        if hasattr(result, 'concepts'):
            data['concepts_count'] = len(result.concepts)
            data['concepts'] = result.concepts  # Store the actual concepts list
        if hasattr(result, 'evidence_specification'):
            # Also capture the evidence_specification from result if available
            spec = result.evidence_specification
            data['result_evidence_spec'] = spec[:100] + "..." if len(spec) > 100 else spec

    return data


def extract_concept_expansion_data(result, *args, **kwargs) -> dict:
    """Extract data from concept expansion result"""
    # kwargs['request'] = ConceptExpansionRequest (Pydantic model)
    expansion_request = kwargs.get('request')
    data = {
        'concepts_count': 0,
        'source': 'unknown',
        'expansions_count': 0,
        'input_concepts': [],
        'expansions': []
    }

    # Extract from request (ConceptExpansionRequest)
    if expansion_request:
        if hasattr(expansion_request, 'concepts'):
            data['concepts_count'] = len(expansion_request.concepts)
            data['input_concepts'] = expansion_request.concepts  # Store actual concepts
        if hasattr(expansion_request, 'source'):
            data['source'] = expansion_request.source

    # Extract from result (ConceptExpansionResponse)
    if result:
        if hasattr(result, 'expansions'):
            data['expansions_count'] = len(result.expansions)
            data['expansions'] = result.expansions  # Store actual expansions
        if hasattr(result, 'source'):
            data['result_source'] = result.source  # Capture source from result too

    return data


def extract_keyword_test_data(result, *args, **kwargs) -> dict:
    """Extract data from keyword combination test result"""
    # kwargs['request'] = KeywordCombinationRequest (Pydantic model)
    keyword_request = kwargs.get('request')
    data = {
        'expressions_count': 0,
        'source': 'unknown',
        'combined_query': 'unknown',
        'estimated_results': 0,
        'input_expressions': []
    }

    # Extract from request (KeywordCombinationRequest)
    if keyword_request:
        if hasattr(keyword_request, 'expressions'):
            data['expressions_count'] = len(keyword_request.expressions)
            data['input_expressions'] = keyword_request.expressions  # Store actual expressions
        if hasattr(keyword_request, 'source'):
            data['source'] = keyword_request.source

    # Extract from result (KeywordCombinationResponse)
    if result:
        if hasattr(result, 'combined_query'):
            query = result.combined_query
            data['combined_query'] = query[:100] + "..." if len(query) > 100 else query
            data['full_combined_query'] = query  # Store full query too
        if hasattr(result, 'estimated_results'):
            data['estimated_results'] = result.estimated_results
        if hasattr(result, 'source'):
            data['result_source'] = result.source  # Capture source from result

    return data