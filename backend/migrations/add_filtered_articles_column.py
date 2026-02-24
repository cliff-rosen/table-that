#!/usr/bin/env python3
"""
Migration to add filtered_articles column to smart_search_sessions table

This migration adds a JSON column to store the actual filtered articles results
so they can be retrieved when resuming a session.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, MetaData, Table, Column, JSON, text
from sqlalchemy.exc import ProgrammingError
from config import settings
import logging

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_migration():
    """Add filtered_articles column to smart_search_sessions table"""
    
    # Create engine
    engine = create_engine(settings.DATABASE_URL)
    
    try:
        with engine.connect() as connection:
            # Check if the table exists
            result = connection.execute(text("""
                SELECT COUNT(*) 
                FROM information_schema.tables 
                WHERE table_name = 'smart_search_sessions'
            """))
            
            table_exists = result.scalar() > 0
            
            if not table_exists:
                logger.info("smart_search_sessions table does not exist yet. Skipping migration.")
                return
            
            # Check if the column already exists
            result = connection.execute(text("""
                SELECT COUNT(*) 
                FROM information_schema.columns 
                WHERE table_name = 'smart_search_sessions' 
                AND column_name = 'filtered_articles'
            """))
            
            column_exists = result.scalar() > 0
            
            if column_exists:
                logger.info("filtered_articles column already exists. Migration not needed.")
                return
            
            # Add the filtered_articles column
            logger.info("Adding filtered_articles column to smart_search_sessions table...")
            
            connection.execute(text("""
                ALTER TABLE smart_search_sessions 
                ADD COLUMN filtered_articles JSON;
            """))
            
            connection.commit()
            logger.info("Successfully added filtered_articles column.")
            
            # Verify the column was added
            result = connection.execute(text("""
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = 'smart_search_sessions' 
                AND column_name = 'filtered_articles';
            """))
            
            column_info = result.fetchone()
            if column_info:
                logger.info(f"Verified: {column_info[0]} column added with type {column_info[1]}")
            else:
                logger.error("Failed to verify column addition")
                
    except ProgrammingError as e:
        logger.error(f"Database error during migration: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error during migration: {e}")
        raise

if __name__ == "__main__":
    logger.info("Starting filtered_articles column migration...")
    run_migration()
    logger.info("Migration completed successfully!")