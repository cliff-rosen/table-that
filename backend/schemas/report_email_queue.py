"""
Report Email Queue schemas for Knowledge Horizon

Pydantic models for the email queue system that manages scheduled report delivery.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class ReportEmailQueueStatus(str, Enum):
    """Status of a report email in the queue"""
    SCHEDULED = "scheduled"    # Queued for a future date
    READY = "ready"            # Scheduled date has arrived, waiting to be picked up
    PROCESSING = "processing"  # Sender is actively working on it
    SENT = "sent"              # Successfully delivered
    FAILED = "failed"          # Error occurred (no retry)


class ReportEmailQueueCreate(BaseModel):
    """Schema for creating a new email queue entry"""
    report_id: int
    user_id: int
    email: str
    scheduled_for: datetime


class ReportEmailQueueUpdate(BaseModel):
    """Schema for updating an email queue entry"""
    status: Optional[ReportEmailQueueStatus] = None
    error_message: Optional[str] = None


class ReportEmailQueue(BaseModel):
    """Full email queue entry schema"""
    id: int
    report_id: int
    user_id: int
    email: str
    status: ReportEmailQueueStatus
    scheduled_for: datetime
    created_at: datetime
    updated_at: datetime
    sent_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class ReportEmailQueueWithDetails(ReportEmailQueue):
    """Email queue entry with related report and user details"""
    report_name: Optional[str] = None
    user_full_name: Optional[str] = None
    stream_name: Optional[str] = None


class BulkScheduleRequest(BaseModel):
    """Request to schedule emails for multiple users"""
    report_id: int
    user_ids: List[int]
    scheduled_for: datetime


class BulkScheduleResponse(BaseModel):
    """Response from bulk scheduling"""
    scheduled_count: int
    skipped_count: int = Field(default=0, description="Users skipped (no email, already scheduled, etc.)")
    queue_entries: List[ReportEmailQueue]


class ProcessQueueResponse(BaseModel):
    """Response from processing the email queue"""
    total_processed: int
    sent_count: int
    failed_count: int
    skipped_count: int
    errors: List[str] = []
