#!/usr/bin/env python3
"""
Migration script to add login token fields to the User table.

This script adds the login_token and login_token_expires fields
to support passwordless authentication.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_add_login_tokens():
    """Add login token fields to user table."""
    
    with SessionLocal() as db:
        try:
            # Check if login_token column exists
            result = db.execute(text("""
                SELECT COUNT(*) as column_exists 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'login_token'
                AND table_schema = DATABASE()
            """))
            
            login_token_exists = result.fetchone()[0] > 0
            
            # Check if login_token_expires column exists
            result = db.execute(text("""
                SELECT COUNT(*) as column_exists 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'login_token_expires'
                AND table_schema = DATABASE()
            """))
            
            login_token_expires_exists = result.fetchone()[0] > 0
            
            if not login_token_exists:
                logger.info("Adding login_token column to users table...")
                
                db.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN login_token VARCHAR(255) NULL,
                    ADD INDEX idx_login_token (login_token)
                """))
                db.commit()
                logger.info("login_token column added successfully")
            else:
                logger.info("login_token column already exists")
            
            if not login_token_expires_exists:
                logger.info("Adding login_token_expires column to users table...")
                
                db.execute(text("""
                    ALTER TABLE users 
                    ADD COLUMN login_token_expires DATETIME NULL
                """))
                db.commit()
                logger.info("login_token_expires column added successfully")
            else:
                logger.info("login_token_expires column already exists")
            
            # Show final table structure for login token columns
            result = db.execute(text("""
                SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_DEFAULT
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND (column_name = 'login_token' OR column_name = 'login_token_expires')
                AND table_schema = DATABASE()
                ORDER BY COLUMN_NAME
            """))
            
            logger.info("Login token columns in users table:")
            for row in result:
                logger.info(f"  {row[0]}: {row[1]} (Nullable: {row[2]}, Default: {row[3]})")
                
        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise
        
        logger.info("Migration completed successfully")

if __name__ == "__main__":
    migrate_add_login_tokens()