"""
Authoritative list of information sources
"""

from pydantic import BaseModel, Field
from typing import List
from enum import Enum


class SourceType(str, Enum):
    """Type of information source"""
    ACADEMIC_DATABASE = "academic_database"
    SEARCH_ENGINE = "search_engine"
    PREPRINT_SERVER = "preprint_server"
    CLINICAL_TRIALS = "clinical_trials"
    PATENT_DATABASE = "patent_database"
    REGULATORY_DATABASE = "regulatory_database"


class InformationSource(BaseModel):
    """Definition of an information source"""
    source_id: str = Field(description="Unique identifier for the source")
    name: str = Field(description="Display name")
    source_type: SourceType = Field(description="Type of source")
    description: str = Field(description="What this source provides")
    query_syntax: str = Field(description="Query syntax used (e.g., 'Boolean', 'Natural Language')")
    url: str = Field(description="Base URL for the source")


# Authoritative list of information sources
INFORMATION_SOURCES: List[InformationSource] = [
    InformationSource(
        source_id="pubmed",
        name="PubMed",
        source_type=SourceType.ACADEMIC_DATABASE,
        description="National Library of Medicine's database of biomedical literature",
        query_syntax="Boolean (AND, OR, NOT)",
        url="https://pubmed.ncbi.nlm.nih.gov"
    ),
    InformationSource(
        source_id="google_scholar",
        name="Google Scholar",
        source_type=SourceType.SEARCH_ENGINE,
        description="Academic search engine across disciplines",
        query_syntax="Boolean (OR via |, AND via space, phrases via quotes)",
        url="https://scholar.google.com"
    ),
    InformationSource(
        source_id="arxiv",
        name="arXiv",
        source_type=SourceType.PREPRINT_SERVER,
        description="Preprint server for physics, mathematics, computer science, and related fields",
        query_syntax="Boolean (AND, OR, ANDNOT)",
        url="https://arxiv.org"
    ),
    InformationSource(
        source_id="biorxiv",
        name="bioRxiv",
        source_type=SourceType.PREPRINT_SERVER,
        description="Preprint server for biology",
        query_syntax="Boolean (AND, OR, NOT)",
        url="https://www.biorxiv.org"
    ),
    InformationSource(
        source_id="medrxiv",
        name="medRxiv",
        source_type=SourceType.PREPRINT_SERVER,
        description="Preprint server for health sciences",
        query_syntax="Boolean (AND, OR, NOT)",
        url="https://www.medrxiv.org"
    ),
    InformationSource(
        source_id="clinicaltrials_gov",
        name="ClinicalTrials.gov",
        source_type=SourceType.CLINICAL_TRIALS,
        description="Database of clinical studies worldwide",
        query_syntax="Boolean (AND, OR, NOT)",
        url="https://clinicaltrials.gov"
    ),
    InformationSource(
        source_id="patents_google",
        name="Google Patents",
        source_type=SourceType.PATENT_DATABASE,
        description="Search engine for patents worldwide",
        query_syntax="Boolean (OR, AND implied by space)",
        url="https://patents.google.com"
    ),
    InformationSource(
        source_id="sec_edgar",
        name="SEC EDGAR",
        source_type=SourceType.REGULATORY_DATABASE,
        description="U.S. Securities and Exchange Commission filings database",
        query_syntax="Natural Language",
        url="https://www.sec.gov/edgar"
    ),
]


# Helper function to get source by ID
def get_source_by_id(source_id: str) -> InformationSource | None:
    """Get source definition by ID"""
    for source in INFORMATION_SOURCES:
        if source.source_id == source_id:
            return source
    return None


# Helper function to get all source IDs
def get_all_source_ids() -> List[str]:
    """Get list of all valid source IDs"""
    return [source.source_id for source in INFORMATION_SOURCES]
