#!/usr/bin/env python3
"""
Migration script to add Knowledge Horizon tables.

This script creates all the tables needed for the Knowledge Horizon POC:
- company_profiles
- curation_mandates
- information_sources
- reports
- articles
- report_article_associations
- report_schedules
- user_feedback
- onboarding_sessions
"""

import sys
import os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database import SessionLocal
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def check_table_exists(db, table_name):
    """Check if a table exists"""
    result = db.execute(text("""
        SELECT COUNT(*) as table_exists
        FROM information_schema.tables
        WHERE table_name = :table_name
        AND table_schema = DATABASE()
    """), {"table_name": table_name})
    return result.fetchone()[0] > 0

def migrate_add_knowledge_horizon_tables():
    """Add all Knowledge Horizon tables."""

    with SessionLocal() as db:
        try:
            # Company Profiles table
            if not check_table_exists(db, 'company_profiles'):
                logger.info("Creating company_profiles table...")
                db.execute(text("""
                    CREATE TABLE company_profiles (
                        profile_id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        company_name VARCHAR(255) NOT NULL,
                        job_title VARCHAR(255) NOT NULL,
                        therapeutic_areas JSON,
                        pipeline_products JSON,
                        competitors JSON,
                        company_metadata JSON,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        UNIQUE KEY unique_user_company_profile (user_id)
                    )
                """))
                logger.info("company_profiles table created")
            else:
                logger.info("company_profiles table already exists")

            # Curation Mandates table
            if not check_table_exists(db, 'curation_mandates'):
                logger.info("Creating curation_mandates table...")
                db.execute(text("""
                    CREATE TABLE curation_mandates (
                        mandate_id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        profile_id INT,
                        primary_focus JSON,
                        secondary_interests JSON,
                        competitors_to_track JSON,
                        regulatory_focus JSON,
                        scientific_domains JSON,
                        exclusions JSON,
                        is_active BOOLEAN DEFAULT TRUE,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (profile_id) REFERENCES company_profiles(profile_id) ON DELETE SET NULL
                    )
                """))
                logger.info("curation_mandates table created")
            else:
                logger.info("curation_mandates table already exists")

            # Information Sources table
            if not check_table_exists(db, 'information_sources'):
                logger.info("Creating information_sources table...")
                db.execute(text("""
                    CREATE TABLE information_sources (
                        source_id INT AUTO_INCREMENT PRIMARY KEY,
                        mandate_id INT NOT NULL,
                        source_type ENUM('journal', 'news', 'regulatory', 'clinical', 'patent', 'company', 'preprint', 'conference') NOT NULL,
                        source_name VARCHAR(255) NOT NULL,
                        source_url VARCHAR(500),
                        retrieval_config JSON,
                        search_queries JSON,
                        update_frequency VARCHAR(50) DEFAULT 'daily',
                        is_active BOOLEAN DEFAULT TRUE,
                        last_fetched DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (mandate_id) REFERENCES curation_mandates(mandate_id) ON DELETE CASCADE
                    )
                """))
                logger.info("information_sources table created")
            else:
                logger.info("information_sources table already exists")

            # Articles table
            if not check_table_exists(db, 'articles'):
                logger.info("Creating articles table...")
                db.execute(text("""
                    CREATE TABLE articles (
                        article_id INT AUTO_INCREMENT PRIMARY KEY,
                        source_id INT,
                        title VARCHAR(500) NOT NULL,
                        url VARCHAR(1000),
                        authors JSON,
                        publication_date DATE,
                        summary TEXT,
                        ai_summary TEXT,
                        full_text LONGTEXT,
                        source_type ENUM('journal', 'news', 'regulatory', 'clinical', 'patent', 'company', 'preprint', 'conference'),
                        article_metadata JSON,
                        theme_tags JSON,
                        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        fetch_count INT DEFAULT 1,
                        FOREIGN KEY (source_id) REFERENCES information_sources(source_id) ON DELETE SET NULL,
                        INDEX idx_article_url (url(255)),
                        INDEX idx_article_publication_date (publication_date),
                        INDEX idx_article_source_type (source_type)
                    )
                """))
                logger.info("articles table created")
            else:
                logger.info("articles table already exists")

            # Reports table
            if not check_table_exists(db, 'reports'):
                logger.info("Creating reports table...")
                db.execute(text("""
                    CREATE TABLE reports (
                        report_id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        mandate_id INT,
                        report_date DATE NOT NULL,
                        executive_summary TEXT,
                        key_highlights JSON,
                        thematic_analysis TEXT,
                        coverage_stats JSON,
                        is_read BOOLEAN DEFAULT FALSE,
                        read_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (mandate_id) REFERENCES curation_mandates(mandate_id) ON DELETE SET NULL,
                        INDEX idx_report_date (report_date),
                        INDEX idx_report_user_date (user_id, report_date)
                    )
                """))
                logger.info("reports table created")
            else:
                logger.info("reports table already exists")

            # Report Article Associations table
            if not check_table_exists(db, 'report_article_associations'):
                logger.info("Creating report_article_associations table...")
                db.execute(text("""
                    CREATE TABLE report_article_associations (
                        report_id INT NOT NULL,
                        article_id INT NOT NULL,
                        relevance_score FLOAT,
                        relevance_rationale TEXT,
                        ranking INT,
                        user_feedback ENUM('thumbs_up', 'thumbs_down', 'irrelevant', 'important'),
                        is_starred BOOLEAN DEFAULT FALSE,
                        is_read BOOLEAN DEFAULT FALSE,
                        notes TEXT,
                        added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        read_at DATETIME,
                        PRIMARY KEY (report_id, article_id),
                        FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
                        FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE,
                        INDEX idx_report_ranking (report_id, ranking),
                        INDEX idx_article_reports (article_id)
                    )
                """))
                logger.info("report_article_associations table created")
            else:
                logger.info("report_article_associations table already exists")

            # Report Schedules table
            if not check_table_exists(db, 'report_schedules'):
                logger.info("Creating report_schedules table...")
                db.execute(text("""
                    CREATE TABLE report_schedules (
                        schedule_id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        frequency ENUM('daily', 'weekly', 'biweekly', 'monthly') NOT NULL,
                        day_of_week INT CHECK (day_of_week >= 0 AND day_of_week <= 6),
                        day_of_month INT CHECK (day_of_month >= 1 AND day_of_month <= 31),
                        time_of_day VARCHAR(5) DEFAULT '08:00',
                        timezone VARCHAR(50) DEFAULT 'UTC',
                        is_active BOOLEAN DEFAULT TRUE,
                        is_paused BOOLEAN DEFAULT FALSE,
                        next_run_at DATETIME,
                        last_run_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        UNIQUE KEY unique_user_schedule (user_id)
                    )
                """))
                logger.info("report_schedules table created")
            else:
                logger.info("report_schedules table already exists")

            # User Feedback table
            if not check_table_exists(db, 'user_feedback'):
                logger.info("Creating user_feedback table...")
                db.execute(text("""
                    CREATE TABLE user_feedback (
                        feedback_id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        report_id INT,
                        article_id INT,
                        feedback_type ENUM('thumbs_up', 'thumbs_down', 'irrelevant', 'important') NOT NULL,
                        feedback_value VARCHAR(50),
                        notes TEXT,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
                        FOREIGN KEY (article_id) REFERENCES articles(article_id) ON DELETE CASCADE,
                        INDEX idx_feedback_user (user_id),
                        INDEX idx_feedback_type (feedback_type),
                        CHECK ((report_id IS NOT NULL AND article_id IS NULL) OR (report_id IS NULL AND article_id IS NOT NULL))
                    )
                """))
                logger.info("user_feedback table created")
            else:
                logger.info("user_feedback table already exists")

            # Onboarding Sessions table
            if not check_table_exists(db, 'onboarding_sessions'):
                logger.info("Creating onboarding_sessions table...")
                db.execute(text("""
                    CREATE TABLE onboarding_sessions (
                        session_id INT AUTO_INCREMENT PRIMARY KEY,
                        user_id INT NOT NULL,
                        conversation_history JSON,
                        extracted_data JSON,
                        research_data JSON,
                        completed_steps JSON,
                        is_complete BOOLEAN DEFAULT FALSE,
                        completed_at DATETIME,
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
                        INDEX idx_onboarding_user (user_id)
                    )
                """))
                logger.info("onboarding_sessions table created")
            else:
                logger.info("onboarding_sessions table already exists")

            db.commit()
            logger.info("All Knowledge Horizon tables created successfully")

        except Exception as e:
            logger.error(f"Error during migration: {e}")
            db.rollback()
            raise

        logger.info("Knowledge Horizon migration completed successfully")

if __name__ == "__main__":
    migrate_add_knowledge_horizon_tables()