#!/usr/bin/env python3
"""
Migration script to fix user role enum values in the database.

This script ensures the database enum values match the Python enum definition:
- Database should have: 'admin', 'user', 'tester' (lowercase)
- Python enum maps: ADMIN='admin', USER='user', TESTER='tester'
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_user_role_enum():
    """Fix user role enum values to match Python enum definition."""
    
    with SessionLocal() as db:
        try:
            # First, let's see what the current enum values are
            logger.info("Checking current enum values...")
            result = db.execute(text("""
                SELECT COLUMN_TYPE 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'role'
                AND table_schema = DATABASE()
            """))
            
            current_type = result.fetchone()
            if current_type:
                logger.info(f"Current role column type: {current_type[0]}")
            
            # Check current role values in the table
            result = db.execute(text("""
                SELECT role, COUNT(*) as count 
                FROM users 
                GROUP BY role
            """))
            
            logger.info("Current role distribution:")
            role_counts = {}
            for row in result:
                role_counts[row[0]] = row[1]
                logger.info(f"  {row[0]}: {row[1]} users")
            
            # Check if we need to fix the enum
            needs_fix = False
            if any(role in ['ADMIN', 'USER', 'TESTER'] for role in role_counts.keys()):
                needs_fix = True
                logger.info("Found uppercase role values - need to convert to lowercase")
            
            if needs_fix:
                # Update existing role values to lowercase
                logger.info("Converting role values to lowercase...")
                
                # Update ADMIN -> admin
                if 'ADMIN' in role_counts:
                    db.execute(text("UPDATE users SET role = 'admin' WHERE role = 'ADMIN'"))
                    logger.info(f"Updated {role_counts['ADMIN']} ADMIN users to admin")
                
                # Update USER -> user  
                if 'USER' in role_counts:
                    db.execute(text("UPDATE users SET role = 'user' WHERE role = 'USER'"))
                    logger.info(f"Updated {role_counts['USER']} USER users to user")
                
                # Update TESTER -> tester
                if 'TESTER' in role_counts:
                    db.execute(text("UPDATE users SET role = 'tester' WHERE role = 'TESTER'"))
                    logger.info(f"Updated {role_counts['TESTER']} TESTER users to tester")
                
                db.commit()
                logger.info("Role values updated successfully")
            
            # Now ensure the enum definition is correct
            logger.info("Ensuring enum definition matches expected values...")
            
            # Drop and recreate the enum constraint to ensure it has the right values
            db.execute(text("""
                ALTER TABLE users 
                MODIFY COLUMN role ENUM('admin', 'user', 'tester') NOT NULL DEFAULT 'user'
            """))
            db.commit()
            logger.info("Enum constraint updated successfully")
            
            # Verify final state
            result = db.execute(text("""
                SELECT role, COUNT(*) as count 
                FROM users 
                GROUP BY role
            """))
            
            logger.info("Final role distribution:")
            for row in result:
                logger.info(f"  {row[0]}: {row[1]} users")
            
            # Show the final column definition
            result = db.execute(text("""
                SELECT COLUMN_TYPE 
                FROM information_schema.columns 
                WHERE table_name = 'users' 
                AND column_name = 'role'
                AND table_schema = DATABASE()
            """))
            
            final_type = result.fetchone()
            if final_type:
                logger.info(f"Final role column type: {final_type[0]}")
                
        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise
        
        logger.info("Migration completed successfully")

if __name__ == "__main__":
    fix_user_role_enum()