#!/usr/bin/env python3
"""
Migration script to add user roles to existing users.

This script ensures all existing users have a role assigned.
It should be run once after deploying the user roles feature.
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import engine, SessionLocal
from models import User, UserRole
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def migrate_user_roles():
    """Add role column and set default values for existing users."""
    
    with SessionLocal() as db:
        try:
            # Check if role column exists
            result = db.execute(text("""
                SELECT COUNT(*) as column_exists 
                FROM information_schema.columns 
                WHERE table_name = 'user' 
                AND column_name = 'role'
                AND table_schema = DATABASE()
            """))
            
            column_exists = result.fetchone()[0] > 0
            
            if not column_exists:
                logger.info("Adding role column to user table...")
                
                # Add the role column with default value
                db.execute(text("""
                    ALTER TABLE user 
                    ADD COLUMN role ENUM('admin', 'user', 'tester') 
                    NOT NULL DEFAULT 'user'
                """))
                db.commit()
                logger.info("Role column added successfully")
            else:
                logger.info("Role column already exists")
            
            # Count users without role or with NULL role
            users_without_role = db.execute(text("""
                SELECT COUNT(*) as count 
                FROM user 
                WHERE role IS NULL 
                OR role = ''
            """)).fetchone()[0]
            
            if users_without_role > 0:
                logger.info(f"Found {users_without_role} users without role. Setting default role to 'user'...")
                
                # Update users without role to have 'user' role
                db.execute(text("""
                    UPDATE user 
                    SET role = 'user' 
                    WHERE role IS NULL 
                    OR role = ''
                """))
                db.commit()
                logger.info("Updated users with default roles")
            else:
                logger.info("All users already have roles assigned")
            
            # Show final user counts by role
            result = db.execute(text("""
                SELECT role, COUNT(*) as count 
                FROM user 
                GROUP BY role
            """))
            
            logger.info("User counts by role:")
            for row in result:
                logger.info(f"  {row[0]}: {row[1]} users")
                
        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise
        
        logger.info("Migration completed successfully")

if __name__ == "__main__":
    migrate_user_roles()