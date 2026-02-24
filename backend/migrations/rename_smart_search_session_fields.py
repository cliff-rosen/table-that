"""
Migration to rename SmartSearchSession fields for clarity

Old naming -> New naming:
- refined_question -> generated_evidence_spec
- submitted_refined_question -> submitted_evidence_spec  
- generated_search_query -> generated_search_keywords
- submitted_search_query -> submitted_search_keywords
"""

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import os
import sys
import logging
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migration():
    """Rename SmartSearchSession columns to use clearer naming"""
    
    # Build database URL from components
    db_user = os.getenv("DB_USER")
    db_password = os.getenv("DB_PASSWORD")
    db_host = os.getenv("DB_HOST")
    db_port = os.getenv("DB_PORT", "3306")
    db_name = os.getenv("DB_NAME")
    
    if not all([db_user, db_password, db_host, db_name]):
        logger.error("Database connection parameters not set in environment")
        return False
    
    database_url = f"mysql+pymysql://{db_user}:{db_password}@{db_host}:{db_port}/{db_name}"
    
    engine = create_engine(database_url)
    
    try:
        with engine.connect() as conn:
            # Start transaction
            trans = conn.begin()
            
            try:
                # Rename columns in smart_search_sessions table
                logger.info("Renaming columns in smart_search_sessions table...")
                
                # Step 1: Rename evidence specification fields
                conn.execute(text("""
                    ALTER TABLE smart_search_sessions 
                    RENAME COLUMN refined_question TO generated_evidence_spec
                """))
                logger.info("Renamed refined_question -> generated_evidence_spec")
                
                conn.execute(text("""
                    ALTER TABLE smart_search_sessions 
                    RENAME COLUMN submitted_refined_question TO submitted_evidence_spec
                """))
                logger.info("Renamed submitted_refined_question -> submitted_evidence_spec")
                
                # Step 2: Rename search keywords fields
                conn.execute(text("""
                    ALTER TABLE smart_search_sessions 
                    RENAME COLUMN generated_search_query TO generated_search_keywords
                """))
                logger.info("Renamed generated_search_query -> generated_search_keywords")
                
                conn.execute(text("""
                    ALTER TABLE smart_search_sessions 
                    RENAME COLUMN submitted_search_query TO submitted_search_keywords
                """))
                logger.info("Renamed submitted_search_query -> submitted_search_keywords")
                
                trans.commit()
                logger.info("Migration completed successfully!")
                return True
                
            except Exception as e:
                trans.rollback()
                logger.error(f"Migration failed, rolling back: {e}")
                raise
                
    except Exception as e:
        logger.error(f"Failed to connect to database: {e}")
        return False

if __name__ == "__main__":
    success = run_migration()
    if success:
        print("Migration completed successfully")
    else:
        print("Migration failed")
        sys.exit(1)