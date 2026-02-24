"""
Update stream_id 10 to match the spec in stream_config.md
"""
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import json
import os
from dotenv import load_dotenv

load_dotenv()

# Get database connection info from environment
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT")
DB_USER = os.getenv("DB_USER")
DB_PASSWORD = os.getenv("DB_PASSWORD")
DB_NAME = os.getenv("DB_NAME")

if not all([DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME]):
    raise ValueError("Missing database environment variables")

DATABASE_URL = f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

# Define the new structure from spec
spec_data = {
    "stream_name": "Asbestos (Non-Talc) Literature",
    "purpose": "Enable comprehensive scientific awareness in <15 minutes per weekly review",

    "audience": [
        "Inside and outside counsel for asbestos defendants (non-talc products)",
        "Litigation support staff for asbestos-only cases",
        "Case strategy teams for asbestos-only cases"
    ],

    "intended_guidance": [
        "Case strategy development",
        "Cross-examination preparation",
        "Daubert challenges",
        "Expert witness preparation",
        "Knowledge/awareness obligations",
        "Settlement analysis"
    ],

    "global_inclusion": [
        "Asbestos or talc exposure assessment or measurement",
        "Health effects causally or allegedly linked to asbestos or talc",
        "Fiber identification or characterization methods",
        "Epidemiological studies of exposed populations",
        "Regulatory or standards developments",
        "Historical knowledge or state-of-the-art",
        "Exposure reconstruction methodologies",
        "Causation or attribution frameworks",
        "Risk assessment or quantification",
        "Differential diagnosis relevant to asbestos/talc exposure",
        "Analytical or diagnostic methods",
        "Biomarkers for exposure or disease",
        "Experimental studies (animal, in vitro, mechanistic)",
        "Meta-analyses, systematic reviews, or expert commentary",
        "Corrections or retractions to prior research",
        "Medicolegal aspects (expert testimony, causation frameworks, evidentiary standards)"
    ],

    "global_exclusion": [
        "Legal case decisions, trial transcripts, courtroom proceedings",
        "General occupational health topics unrelated to asbestos or talc",
        "Non-asbestos, non-talc occupational exposures (unless for comparison/context)",
        "Investment and financial analysis",
        "Public relations and media coverage",
        "Conference announcements without published abstracts/papers",
        "Purely theoretical modeling without empirical validation",
        "Duplicate publications or restatements of previously covered research"
    ],

    "categories": [
        {
            "id": "medical_health",
            "name": "Medical & Health Sciences",
            "topics": [
                "Asbestos-related disease pathology and mechanisms",
                "Mesothelioma and lung cancer research",
                "Diagnostic criteria and methodologies",
                "Dose-response relationships",
                "Latency period studies",
                "Differential diagnosis research",
                "Disease progression and prognosis",
                "Biomarkers for exposure or disease"
            ],
            "specific_inclusions": ["Any peer-reviewed research on asbestos-related disease mechanisms or outcomes"]
        },
        {
            "id": "exposure_science",
            "name": "Exposure Science",
            "topics": [
                "Occupational exposure assessment methodologies",
                "Environmental exposure pathways",
                "Product-specific exposure studies (non-talc products)",
                "Bystander and secondary exposure research",
                "Exposure reconstruction techniques",
                "Fiber type and potency research",
                "Background exposure levels"
            ],
            "specific_inclusions": ["Any quantitative or qualitative exposure data", "Modeling approaches"]
        },
        {
            "id": "epidemiology",
            "name": "Epidemiology",
            "topics": [
                "Cohort and case-control studies",
                "Risk assessment and quantification",
                "Population-based exposure studies",
                "Occupational epidemiology",
                "Meta-analyses and systematic reviews"
            ],
            "specific_inclusions": ["Any population-based study examining asbestos exposure and health outcomes"]
        },
        {
            "id": "regulatory_standards",
            "name": "Regulatory & Standards",
            "topics": [
                "OSHA, EPA, and international regulatory developments",
                "Permissible exposure limits (PELs)",
                "Industrial hygiene standards",
                "Testing and analytical methods",
                "Product standards and specifications"
            ],
            "specific_inclusions": ["Government publications, agency guidance, proposed rules (need not be peer-reviewed research)"]
        },
        {
            "id": "historical_documentation",
            "name": "Historical Documentation",
            "topics": [
                "Historical industry practices",
                "Knowledge and awareness research",
                "State-of-the-art analyses for specific time periods",
                "Historical exposure documentation"
            ],
            "specific_inclusions": ["Industry documents, historical reports (need not be peer-reviewed)"]
        },
        {
            "id": "causation_attribution",
            "name": "Causation & Attribution",
            "topics": [
                "Bradford Hill criteria applications",
                "Causation methodology",
                "Attribution studies",
                "Alternative causation research"
            ],
            "specific_inclusions": ["Any research addressing causal inference methodology"]
        },
        {
            "id": "diagnostic_biomarkers",
            "name": "Diagnostic & Biomarkers",
            "topics": [
                "Disease diagnosis methods and criteria",
                "Biomarkers for exposure or disease",
                "Pathological classification systems",
                "Fiber burden analysis techniques"
            ],
            "specific_inclusions": ["Any diagnostic or biomarker development/validation studies"]
        },
        {
            "id": "analytical_methods",
            "name": "Analytical Methods",
            "topics": [
                "Fiber identification and characterization",
                "Analytical microscopy (SEM, TEM, PLM)",
                "Mineralogical analysis",
                "Quality control and proficiency testing"
            ],
            "specific_inclusions": ["Methods development, validation, or comparison studies"]
        },
        {
            "id": "experimental_studies",
            "name": "Experimental Studies",
            "topics": [
                "Animal models of asbestos disease",
                "In vitro studies of disease mechanisms",
                "Toxicological studies"
            ],
            "specific_inclusions": ["Any laboratory-based mechanistic research"]
        },
        {
            "id": "reviews_commentary",
            "name": "Reviews & Commentary",
            "topics": [
                "Meta-analyses and systematic reviews",
                "State-of-the-science reviews",
                "Expert commentary on significant studies",
                "Editorial perspectives on controversial topics"
            ],
            "specific_inclusions": ["Any synthesis or expert opinion piece"]
        },
        {
            "id": "corrections_retractions",
            "name": "Corrections & Retractions",
            "topics": [
                "Retractions or corrections to prior publications",
                "Updates to previously published research"
            ],
            "specific_inclusions": ["ALL corrections and retractions regardless of study quality (high impeachment value)"]
        },
        {
            "id": "medicolegal",
            "name": "Medicolegal Literature",
            "topics": [
                "Expert testimony standards and approaches",
                "Causation frameworks in legal context",
                "Daubert and admissibility criteria",
                "Pathology texts addressing legal aspects",
                "Evidentiary standards and approaches"
            ],
            "specific_inclusions": ["Legal textbooks, practice guides (need not be peer-reviewed scientific literature)"]
        }
    ]
}

def update_stream_10():
    """Update stream_id 10 to match the spec"""
    db = SessionLocal()

    try:
        # First check if stream 10 exists
        result = db.execute(text("SELECT stream_id, stream_name FROM research_streams WHERE stream_id = 10"))
        stream = result.fetchone()

        if not stream:
            print("Stream 10 not found!")
            return

        print(f"Found stream 10: {stream[1]}")
        print("Updating to match spec...")

        # Update the stream
        update_query = text("""
            UPDATE research_streams
            SET stream_name = :stream_name,
                purpose = :purpose,
                audience = :audience,
                intended_guidance = :intended_guidance,
                global_inclusion = :global_inclusion,
                global_exclusion = :global_exclusion,
                categories = :categories
            WHERE stream_id = 10
        """)

        db.execute(update_query, {
            'stream_name': spec_data['stream_name'],
            'purpose': spec_data['purpose'],
            'audience': json.dumps(spec_data['audience']),
            'intended_guidance': json.dumps(spec_data['intended_guidance']),
            'global_inclusion': json.dumps(spec_data['global_inclusion']),
            'global_exclusion': json.dumps(spec_data['global_exclusion']),
            'categories': json.dumps(spec_data['categories'])
        })

        db.commit()
        print("\n[SUCCESS] Stream 10 updated successfully!")
        print(f"   Stream name: {spec_data['stream_name']}")
        print(f"   Categories: {len(spec_data['categories'])}")
        print(f"   Audience items: {len(spec_data['audience'])}")
        print(f"   Intended guidance items: {len(spec_data['intended_guidance'])}")
        print(f"   Global inclusion criteria: {len(spec_data['global_inclusion'])}")
        print(f"   Global exclusion criteria: {len(spec_data['global_exclusion'])}")

    except Exception as e:
        db.rollback()
        print(f"Error updating stream: {e}")
        raise
    finally:
        db.close()

if __name__ == "__main__":
    print("Updating stream_id 10 to match spec...")
    update_stream_10()
    print("Done!")
