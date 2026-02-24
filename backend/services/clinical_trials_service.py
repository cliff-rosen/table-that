"""
ClinicalTrials.gov API Service

Wrapper for the ClinicalTrials.gov API v2.
API Documentation: https://clinicaltrials.gov/data-api/api

Rate limit: ~50 requests per minute per IP
"""

import requests
import logging
import time
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime

from schemas.canonical_types import (
    CanonicalClinicalTrial,
    CanonicalTrialIntervention,
    CanonicalTrialOutcome,
    CanonicalTrialSponsor,
    CanonicalTrialLocation
)

logger = logging.getLogger(__name__)

# API Base URL
CLINICAL_TRIALS_API_URL = "https://clinicaltrials.gov/api/v2/studies"

# Rate limiting
REQUESTS_PER_MINUTE = 45  # Stay under the 50/min limit
MIN_REQUEST_INTERVAL = 60.0 / REQUESTS_PER_MINUTE

# API filter value mappings (aggFilters parameter uses abbreviations)
STATUS_MAP = {
    "RECRUITING": "rec",
    "COMPLETED": "com",
    "ACTIVE_NOT_RECRUITING": "act",
    "TERMINATED": "ter",
    "SUSPENDED": "sus",
    "WITHDRAWN": "wit",
    "NOT_YET_RECRUITING": "not",
    "ENROLLING_BY_INVITATION": "enr",
}

PHASE_MAP = {
    "PHASE1": "1",
    "PHASE2": "2",
    "PHASE3": "3",
    "PHASE4": "4",
    "EARLY_PHASE1": "early_phase1",
    "NA": "na",
}


class ClinicalTrialsService:
    """Service for interacting with ClinicalTrials.gov API."""

    def __init__(self):
        self._last_request_time = 0.0

    def _rate_limit(self):
        """Enforce rate limiting between requests."""
        elapsed = time.time() - self._last_request_time
        if elapsed < MIN_REQUEST_INTERVAL:
            time.sleep(MIN_REQUEST_INTERVAL - elapsed)
        self._last_request_time = time.time()

    def search_trials(
        self,
        condition: Optional[str] = None,
        intervention: Optional[str] = None,
        sponsor: Optional[str] = None,
        status: Optional[List[str]] = None,
        phase: Optional[List[str]] = None,
        study_type: Optional[str] = None,
        location: Optional[str] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        max_results: int = 100,
        page_token: Optional[str] = None
    ) -> Tuple[List[CanonicalClinicalTrial], int, Optional[str]]:
        """
        Search for clinical trials.

        Args:
            condition: Disease or condition to search for
            intervention: Drug, treatment, or intervention name
            sponsor: Sponsor organization name
            status: List of recruitment statuses (e.g., ['RECRUITING', 'COMPLETED'])
            phase: List of phases (e.g., ['PHASE3', 'PHASE4'])
            study_type: Study type (INTERVENTIONAL, OBSERVATIONAL)
            location: Geographic location
            start_date: Start date filter (YYYY-MM-DD)
            end_date: End date filter (YYYY-MM-DD)
            max_results: Maximum number of results to return
            page_token: Token for pagination

        Returns:
            Tuple of (list of trials, total count, next page token)
        """
        self._rate_limit()

        # Build query parameters
        params = {
            "format": "json",
            "pageSize": min(max_results, 100),  # API max is 100 per page
            "countTotal": "true"
        }

        # Use simple query parameters (API v2 preferred approach)
        if condition:
            params["query.cond"] = condition

        if intervention:
            params["query.intr"] = intervention

        if sponsor:
            params["query.spons"] = sponsor

        if location:
            params["query.locn"] = location

        # Build aggFilters parameter (API v2 uses abbreviated filter values)
        agg_filters = []

        # Status filter
        if status:
            for s in status:
                if s in STATUS_MAP:
                    agg_filters.append(f"status:{STATUS_MAP[s]}")

        # Phase filter
        if phase:
            for p in phase:
                if p in PHASE_MAP:
                    agg_filters.append(f"phase:{PHASE_MAP[p]}")

        # Study type filter
        if study_type:
            study_type_map = {"INTERVENTIONAL": "int", "OBSERVATIONAL": "obs"}
            if study_type in study_type_map:
                agg_filters.append(f"studyType:{study_type_map[study_type]}")

        if agg_filters:
            params["aggFilters"] = ",".join(agg_filters)

        # Pagination
        if page_token:
            params["pageToken"] = page_token

        logger.info(f"Searching ClinicalTrials.gov with params: {params}")

        try:
            response = requests.get(CLINICAL_TRIALS_API_URL, params=params, timeout=30)
            if response.status_code != 200:
                logger.error(f"ClinicalTrials.gov API error response: {response.text}")
            response.raise_for_status()
            data = response.json()

            # Parse results
            trials = []
            studies = data.get("studies", [])

            for study in studies:
                try:
                    trial = self._parse_study(study)
                    trials.append(trial)
                except Exception as e:
                    logger.warning(f"Failed to parse study: {e}")
                    continue

            # Get total count and next page token
            total_count = data.get("totalCount", len(trials))
            next_page_token = data.get("nextPageToken")

            logger.info(f"Found {len(trials)} trials out of {total_count} total")

            return trials, total_count, next_page_token

        except requests.exceptions.RequestException as e:
            logger.error(f"ClinicalTrials.gov API request failed: {e}")
            raise

    def get_trial_by_nct_id(self, nct_id: str) -> Optional[CanonicalClinicalTrial]:
        """
        Get a single trial by NCT ID.

        Args:
            nct_id: NCT identifier (e.g., NCT00000000)

        Returns:
            CanonicalClinicalTrial or None if not found
        """
        self._rate_limit()

        url = f"{CLINICAL_TRIALS_API_URL}/{nct_id}"
        params = {"format": "json"}

        try:
            response = requests.get(url, params=params, timeout=30)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            data = response.json()

            return self._parse_study(data)

        except requests.exceptions.RequestException as e:
            logger.error(f"Failed to fetch trial {nct_id}: {e}")
            raise

    def get_trials_by_nct_ids(self, nct_ids: List[str]) -> List[CanonicalClinicalTrial]:
        """
        Get multiple trials by NCT IDs.

        Args:
            nct_ids: List of NCT identifiers

        Returns:
            List of CanonicalClinicalTrial objects
        """
        trials = []
        for nct_id in nct_ids:
            trial = self.get_trial_by_nct_id(nct_id)
            if trial:
                trials.append(trial)
        return trials

    def _parse_study(self, study: Dict[str, Any]) -> CanonicalClinicalTrial:
        """Parse API response into CanonicalClinicalTrial."""

        protocol = study.get("protocolSection", {})

        # Identification module
        id_module = protocol.get("identificationModule", {})
        nct_id = id_module.get("nctId", "")
        org_study_id = id_module.get("orgStudyIdInfo", {}).get("id")
        title = id_module.get("officialTitle", id_module.get("briefTitle", ""))
        brief_title = id_module.get("briefTitle")

        # Description module
        desc_module = protocol.get("descriptionModule", {})
        brief_summary = desc_module.get("briefSummary")
        detailed_description = desc_module.get("detailedDescription")

        # Status module
        status_module = protocol.get("statusModule", {})
        status = status_module.get("overallStatus", "UNKNOWN")
        status_verified_date = status_module.get("statusVerifiedDate")
        start_date_struct = status_module.get("startDateStruct", {})
        start_date = start_date_struct.get("date")
        completion_date_struct = status_module.get("primaryCompletionDateStruct", {})
        completion_date = completion_date_struct.get("date")
        last_update = status_module.get("lastUpdatePostDateStruct", {}).get("date")

        # Design module
        design_module = protocol.get("designModule", {})
        study_type = design_module.get("studyType", "UNKNOWN")
        phases = design_module.get("phases", [])
        phase = phases[0] if phases else None
        design_info = design_module.get("designInfo", {})
        allocation = design_info.get("allocation")
        intervention_model = design_info.get("interventionModel")
        masking_info = design_info.get("maskingInfo", {})
        masking = masking_info.get("masking")
        primary_purpose = design_info.get("primaryPurpose")

        # Enrollment
        enrollment_info = design_module.get("enrollmentInfo", {})
        enrollment_count = enrollment_info.get("count")
        enrollment_type = enrollment_info.get("type")

        # Conditions
        conditions_module = protocol.get("conditionsModule", {})
        conditions = conditions_module.get("conditions", [])
        keywords = conditions_module.get("keywords", [])

        # Interventions (arms/interventions module)
        arms_module = protocol.get("armsInterventionsModule", {})
        intervention_list = arms_module.get("interventions", [])
        interventions = []
        for interv in intervention_list:
            interventions.append(CanonicalTrialIntervention(
                type=interv.get("type", "OTHER"),
                name=interv.get("name", ""),
                description=interv.get("description")
            ))

        # Eligibility
        eligibility_module = protocol.get("eligibilityModule", {})
        eligibility_criteria = eligibility_module.get("eligibilityCriteria")
        sex = eligibility_module.get("sex")
        min_age = eligibility_module.get("minimumAge")
        max_age = eligibility_module.get("maximumAge")
        healthy_volunteers_str = eligibility_module.get("healthyVolunteers")
        healthy_volunteers = healthy_volunteers_str == "Yes" if healthy_volunteers_str else None

        # Outcomes
        outcomes_module = protocol.get("outcomesModule", {})
        primary_outcomes = []
        for outcome in outcomes_module.get("primaryOutcomes", []):
            primary_outcomes.append(CanonicalTrialOutcome(
                measure=outcome.get("measure", ""),
                time_frame=outcome.get("timeFrame")
            ))
        secondary_outcomes = []
        for outcome in outcomes_module.get("secondaryOutcomes", []):
            secondary_outcomes.append(CanonicalTrialOutcome(
                measure=outcome.get("measure", ""),
                time_frame=outcome.get("timeFrame")
            ))

        # Sponsors
        sponsor_module = protocol.get("sponsorCollaboratorsModule", {})
        lead_sponsor_info = sponsor_module.get("leadSponsor", {})
        lead_sponsor = None
        if lead_sponsor_info:
            lead_sponsor = CanonicalTrialSponsor(
                name=lead_sponsor_info.get("name", "Unknown"),
                type=lead_sponsor_info.get("class")
            )
        collaborators = []
        for collab in sponsor_module.get("collaborators", []):
            collaborators.append(CanonicalTrialSponsor(
                name=collab.get("name", ""),
                type=collab.get("class")
            ))

        # Locations
        contacts_module = protocol.get("contactsLocationsModule", {})
        location_list = contacts_module.get("locations", [])
        locations = []
        location_countries = set()
        for loc in location_list:
            country = loc.get("country", "Unknown")
            locations.append(CanonicalTrialLocation(
                facility=loc.get("facility"),
                city=loc.get("city"),
                state=loc.get("state"),
                country=country
            ))
            location_countries.add(country)

        return CanonicalClinicalTrial(
            nct_id=nct_id,
            org_study_id=org_study_id,
            title=title,
            brief_title=brief_title,
            brief_summary=brief_summary,
            detailed_description=detailed_description,
            status=status,
            status_verified_date=status_verified_date,
            start_date=start_date,
            completion_date=completion_date,
            last_update_date=last_update,
            study_type=study_type,
            phase=phase,
            allocation=allocation,
            intervention_model=intervention_model,
            masking=masking,
            primary_purpose=primary_purpose,
            interventions=interventions,
            conditions=conditions,
            eligibility_criteria=eligibility_criteria,
            sex=sex,
            min_age=min_age,
            max_age=max_age,
            healthy_volunteers=healthy_volunteers,
            enrollment_count=enrollment_count,
            enrollment_type=enrollment_type,
            primary_outcomes=primary_outcomes,
            secondary_outcomes=secondary_outcomes,
            lead_sponsor=lead_sponsor,
            collaborators=collaborators,
            locations=locations,
            location_countries=list(location_countries),
            url=f"https://clinicaltrials.gov/study/{nct_id}",
            keywords=keywords,
            retrieved_at=datetime.utcnow().isoformat()
        )


# Singleton instance
_service_instance = None


def get_clinical_trials_service() -> ClinicalTrialsService:
    """Get or create singleton service instance."""
    global _service_instance
    if _service_instance is None:
        _service_instance = ClinicalTrialsService()
    return _service_instance
