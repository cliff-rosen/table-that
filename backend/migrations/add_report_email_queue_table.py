"""
Migration: Add report_email_queue table

This migration creates the report_email_queue table for managing scheduled
report email delivery.

Table tracks:
- Which report to send
- Who to send it to (user + email address)
- When to send it (scheduled_for date)
- Status: scheduled → ready → processing → sent/failed
"""

import sys
import os

# Add parent directory to path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, backend_dir)

from sqlalchemy import create_engine, text
from config.settings import settings


def table_exists(conn, table_name: str) -> bool:
    """Check if a table exists."""
    result = conn.execute(text("""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
        AND table_name = :table_name
    """), {"table_name": table_name})
    return result.fetchone() is not None


def run_migration():
    """Create report_email_queue table."""
    engine = create_engine(settings.DATABASE_URL)

    with engine.connect() as conn:
        print("Starting report_email_queue migration...")

        # ============================================================
        # Create report_email_queue table
        # ============================================================

        if not table_exists(conn, 'report_email_queue'):
            print("Creating 'report_email_queue' table...")
            conn.execute(text("""
                CREATE TABLE report_email_queue (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    report_id INT NOT NULL,
                    user_id INT NOT NULL,
                    email VARCHAR(255) NOT NULL,
                    status ENUM('scheduled', 'ready', 'processing', 'sent', 'failed') NOT NULL DEFAULT 'scheduled',
                    scheduled_for DATE NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    sent_at DATETIME DEFAULT NULL,
                    error_message TEXT DEFAULT NULL,

                    INDEX idx_email_queue_report_id (report_id),
                    INDEX idx_email_queue_user_id (user_id),
                    INDEX idx_email_queue_status (status),
                    INDEX idx_email_queue_scheduled_for (scheduled_for),
                    INDEX idx_email_queue_status_scheduled (status, scheduled_for),

                    CONSTRAINT fk_email_queue_report
                        FOREIGN KEY (report_id) REFERENCES reports(report_id) ON DELETE CASCADE,
                    CONSTRAINT fk_email_queue_user
                        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
                )
            """))
            print("Created 'report_email_queue' table")
        else:
            print("Table 'report_email_queue' already exists")

        conn.commit()
        print("\nMigration completed successfully!")
        print("\nSummary:")
        print("  - Created report_email_queue table with:")
        print("    - Foreign keys to reports and users")
        print("    - Status enum: scheduled, ready, processing, sent, failed")
        print("    - Indexes for efficient querying")


if __name__ == "__main__":
    run_migration()
